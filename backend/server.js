require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { db, initializeDatabase } = require('./db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const client = require('prom-client');
const { monitorEventLoopDelay } = require('perf_hooks');

const app = express();
const PORT = process.env.PORT || 3000;
let httpServer;

// You'll need to set this in your environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;

if (!BOT_TOKEN) {
    console.warn('WARNING: BOT_TOKEN not set. Telegram init data validation will fail.');
}

if (!JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET not set. JWT issuing/verification will be disabled.');
}

// Log DB host to confirm which DB we're connected to
try {
    const dbUrl = process.env.TURSO_DATABASE_URL || '';
    const host = dbUrl.replace(/^libsql:\/\//, '').split(/[/?#]/)[0];
    if (host) {
        console.log(JSON.stringify({ level: 'info', message: 'db_connected', host }));
    }
} catch (_) {}

function issueJwtForUser(userRow) {
    if (!JWT_SECRET) return null;
    const subject = userRow.user_id ? userRow.user_id : `tg:${userRow.telegram_id}`;
    const payload = {
        telegramId: userRow.telegram_id,
        hasUserId: Boolean(userRow.user_id),
    };
    return jwt.sign(payload, JWT_SECRET, { subject, expiresIn: '7d' });
}

function getJwtUserFromRequest(req) {
    try {
        const auth = req.headers?.authorization || '';
        if (!auth.startsWith('Bearer ')) return null;
        const token = auth.slice('Bearer '.length).trim();
        if (!JWT_SECRET) {
            return null;
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded; // contains telegramId, hasUserId, iat, exp, sub
    } catch (err) {
        // Invalid or expired token: treat as absent so the app still works in web mode
        return null;
    }
}

// Reverted: no explicit db.sync() usage

// CORS allowlist (merge defaults with comma-separated env CORS_ALLOWED_ORIGINS)
const defaultCorsOrigins = [
    'https://eqiu12.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    /^https:\/\/.*\.vercel\.app$/,
    'https://ratethis.town',
    'https://www.ratethis.town',
    // Render deployments
    'https://telegram-city-rater-ra6r.onrender.com'
];
const extraCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const corsOptions = {
    origin: [...defaultCorsOrigins, ...extraCorsOrigins],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    optionsSuccessStatus: 200
};

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

const voteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: (req) => {
        const ipKey = ipKeyGenerator(req);
        const uid = req.body?.userId || req.query?.userId || '';
        return `${ipKey}:${uid}`;
    },
});

// Stricter limiter for Telegram auth endpoints
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,              // at most 5 attempts per minute per IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req),
});

app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(generalLimiter);
app.use(bodyParser.json({ limit: '25kb' }));

// Structured logger
function log(level, message, meta = {}) {
    try {
        const entry = { level, message, time: new Date().toISOString(), ...meta };
        const serialized = JSON.stringify(entry);
        if (level === 'error') {
            console.error(serialized);
        } else {
            console.log(serialized);
        }
    } catch (e) {
        console.log(`[log-fallback] ${level} ${message}`);
    }
}

// Prometheus metrics setup
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();
const httpRequestDurationMs = new client.Histogram({
    name: 'http_request_duration_ms',
    help: 'HTTP request duration in ms',
    labelNames: ['method', 'route', 'status'],
    buckets: [50, 100, 200, 300, 500, 1000, 2000]
});

// Explicit counters
const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
});
const httpErrorsTotal = new client.Counter({
    name: 'http_errors_total',
    help: 'Total number of HTTP error responses (status >= 400)',
    labelNames: ['method', 'route', 'status']
});

// Event loop lag gauge using perf_hooks monitor
const eventLoopLagGauge = new client.Gauge({
    name: 'process_event_loop_lag_ms',
    help: 'Mean event loop lag over the last sampling interval in milliseconds'
});
const loopMonitor = monitorEventLoopDelay({ resolution: 20 });
loopMonitor.enable();
setInterval(() => {
    try {
        const meanMs = loopMonitor.mean / 1e6; // ns -> ms
        eventLoopLagGauge.set(meanMs);
        loopMonitor.reset();
    } catch (_) {}
}, 1000).unref();

// Request ID middleware
app.use((req, res, next) => {
    const reqId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = reqId;
    res.setHeader('x-request-id', reqId);
    next();
});

// Request logging middleware (structured)
app.use((req, res, next) => {
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        const userId = req.body?.userId || req.query?.userId || undefined;
        const routeLabel = req.route?.path || req.originalUrl;
        const statusLabel = String(res.statusCode);
        log('http', 'request_completed', {
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            ip: req.ip,
            userId,
            requestId: req.requestId
        });
        try {
            httpRequestDurationMs.labels(req.method, routeLabel, statusLabel).observe(durationMs);
            httpRequestsTotal.labels(req.method, routeLabel, statusLabel).inc();
            if (res.statusCode >= 400) {
                httpErrorsTotal.labels(req.method, routeLabel, statusLabel).inc();
            }
        } catch (_) {}
    });
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Static file serving disabled for security; serve frontend separately

function resolveDataFile(filename) {
    const candidates = [
        path.join(__dirname, '..', filename),
        path.join(__dirname, filename),
        path.join(process.cwd(), filename)
    ];
    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch (_) {}
    }
    throw new Error(`data_file_not_found:${filename}`);
}

const cityDataPath = resolveDataFile('cities.json');
const cityData = JSON.parse(fs.readFileSync(cityDataPath, 'utf8'));
let airportsData = [];
try {
    const apPath = resolveDataFile('airports.json');
    airportsData = JSON.parse(fs.readFileSync(apPath, 'utf8'));
    log('info', 'airports_data_loaded', { count: Array.isArray(airportsData) ? airportsData.length : 0 });
} catch (e) {
    log('error', 'airports_data_load_failed', { error: e?.message || String(e) });
    airportsData = [];
}

// Simple in-memory cache for rankings endpoints
const CACHE_TTL_MS = Number(process.env.RANKINGS_CACHE_TTL_MS || 20000); // default 20s
let rankingsCache = { data: null, ts: 0 };
let hiddenJamCache = { data: null, ts: 0 };

function clearRankingCaches() {
    rankingsCache = { data: null, ts: 0 };
    hiddenJamCache = { data: null, ts: 0 };
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Allowed vote types
const VALID_VOTE_TYPES = new Set(['liked', 'disliked', 'dont_know']);

// Airports API
app.get('/api/airports', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    try {
        const apList = Array.isArray(airportsData) ? airportsData : [];
        // Filter out already voted airports for this user
        const votedRes = await db.execute({ sql: 'SELECT airport_id FROM user_airport_votes WHERE user_id = ?', args: [userId] });
        const votedIds = new Set(votedRes.rows.map(r => r.airport_id));
        const unvoted = apList.filter(a => !votedIds.has(a.airportId));
        const shuffled = shuffleArray(unvoted);
        // Totals
        const totalCount = apList.length;
        const votedCount = votedIds.size;
        res.json({ airports: shuffled, votedCount, totalCount });
    } catch (e) {
        log('error', 'fetch_airports_failed', { error: e?.message || String(e) });
        // Return graceful empty payload to avoid frontend error UI
        res.json({ airports: [], votedCount: 0, totalCount: 0 });
    }
});

app.post('/api/airport-vote', voteLimiter, async (req, res) => {
    const { userId, airportId, voteType } = req.body;
    if (!userId || !airportId || !voteType) return res.status(400).json({ error: 'Missing required fields' });
    if (!VALID_VOTE_TYPES.has(voteType)) return res.status(400).json({ error: 'Invalid vote type' });
    try {
        const existing = await db.execute({ sql: 'SELECT id FROM user_airport_votes WHERE user_id = ? AND airport_id = ?', args: [userId, airportId] });
        if (existing.rows.length > 0) return res.status(409).json({ error: 'User has already voted for this airport' });
        await db.execute({ sql: 'INSERT INTO user_airport_votes (user_id, airport_id, vote_type) VALUES (?, ?, ?)', args: [userId, airportId, voteType] });
        const col = voteType === 'liked' ? 'likes' : voteType === 'disliked' ? 'dislikes' : 'dont_know';
        await db.execute({ sql: `INSERT INTO airport_votes (airport_id, ${col}) VALUES (?, 1)
                                 ON CONFLICT(airport_id) DO UPDATE SET ${col} = ${col} + 1`, args: [airportId] });
        clearRankingCaches();
        log('info', 'airport_vote_recorded', { userId, airportId, voteType });
        res.json({ success: true });
    } catch (e) {
        log('error', 'airport_vote_failed', { error: e?.message || String(e), userId, airportId, voteType });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/cities', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const votedCitiesResult = await db.execute({
            sql: "SELECT city_id FROM user_votes WHERE user_id = ?",
            args: [userId]
        });

        const votedCityIds = new Set(votedCitiesResult.rows.map(row => row.city_id));
        
        const unvotedCities = cityData.filter(city => !votedCityIds.has(city.cityId));
        
        const shuffledCities = shuffleArray(unvotedCities);
        
        res.json({
            cities: shuffledCities,
            votedCount: votedCityIds.size,
            totalCount: cityData.length
        });
    } catch (error) {
        log('error', 'fetch_unvoted_cities_failed', { error: error?.message || String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/vote', voteLimiter, async (req, res) => {
    const { userId, cityId, voteType } = req.body;

    if (!userId || !cityId || !voteType) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (!VALID_VOTE_TYPES.has(voteType)) {
        return res.status(400).json({ error: 'Invalid vote type' });
    }

    // If a JWT is provided, enforce userId consistency
    const jwtUser = getJwtUserFromRequest(req);
    if (jwtUser && jwtUser.hasUserId && jwtUser.sub && jwtUser.sub !== userId) {
        return res.status(403).json({ error: 'Token subject does not match userId' });
    }

    // Migration-safe validation: Allow UUIDs (existing users) or registered users
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(userId)) {
        // Non-UUID format - check if registered
        try {
            const userCheck = await db.execute({
                sql: "SELECT id FROM users WHERE user_id = ?",
                args: [userId]
            });
            
            if (userCheck.rows.length === 0) {
                console.log(`❌ VOTE REJECTED: Invalid userId ${userId}`);
                return res.status(403).json({ 
                    error: "Invalid User ID. Please get a valid User ID from the Telegram mini app first." 
                });
            }
            console.log(`✅ VOTE ACCEPTED: Registered user ${userId}`);
        } catch (error) {
            log('error', 'user_validation_failed', { error: error?.message || String(error) });
            return res.status(500).json({ error: "Internal server error" });
        }
    } else {
        log('info', 'vote_accepted_uuid_user', { userId });
    }
    
    const city = cityData.find(c => c.cityId === cityId);
    if (!city) {
        return res.status(404).json({ error: 'City not found' });
    }

    try {
        // Revert to pre-transaction flow: pre-check duplicate, then insert + upsert without explicit transaction
        const existingVote = await db.execute({
            sql: 'SELECT id FROM user_votes WHERE user_id = ? AND city_id = ?',
            args: [userId, cityId]
        });
        if (existingVote.rows.length > 0) {
            return res.status(409).json({ error: 'User has already voted for this city' });
        }

        await db.execute({
            sql: 'INSERT INTO user_votes (user_id, city_id, vote_type) VALUES (?, ?, ?)',
            args: [userId, cityId, voteType]
        });

        const columnToIncrement = voteType === 'liked' ? 'likes' : voteType === 'disliked' ? 'dislikes' : 'dont_know';
        await db.execute({
            sql: `INSERT INTO city_votes (city_id, ${columnToIncrement}) VALUES (?, 1)
                  ON CONFLICT(city_id) DO UPDATE SET ${columnToIncrement} = ${columnToIncrement} + 1`,
            args: [cityId]
        });
        clearRankingCaches();
        log('info', 'vote_recorded', { userId, cityId, voteType });
        res.json({ success: true });

    } catch (error) {
        log('error', 'vote_record_failed', { error: error?.message || String(error), userId, cityId, voteType });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/change-vote', voteLimiter, async (req, res) => {
    const { userId, cityId, voteType } = req.body;
    if (!userId || !cityId || !voteType) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (!VALID_VOTE_TYPES.has(voteType)) {
        return res.status(400).json({ error: 'Invalid vote type' });
    }

    // If a JWT is provided, enforce userId consistency
    const jwtUser = getJwtUserFromRequest(req);
    if (jwtUser && jwtUser.hasUserId && jwtUser.sub && jwtUser.sub !== userId) {
        return res.status(403).json({ error: 'Token subject does not match userId' });
    }

    // Migration-safe validation: Allow UUIDs (existing users) or registered users
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(userId)) {
        // Non-UUID format - check if registered
        try {
            const userCheck = await db.execute({
                sql: "SELECT id FROM users WHERE user_id = ?",
                args: [userId]
            });
            
            if (userCheck.rows.length === 0) {
                console.log(`❌ VOTE REJECTED: Invalid userId ${userId}`);
                return res.status(403).json({ 
                    error: "Invalid User ID. Please get a valid User ID from the Telegram mini app first." 
                });
            }
            console.log(`✅ VOTE ACCEPTED: Registered user ${userId}`);
        } catch (error) {
            log('error', 'user_validation_failed', { error: error?.message || String(error) });
            return res.status(500).json({ error: "Internal server error" });
        }
    } else {
        log('info', 'change_vote_uuid_user', { userId });
    }
    // Validate city exists
    const city = cityData.find(c => c.cityId === cityId);
    if (!city) {
        return res.status(404).json({ error: 'City not found' });
    }

    try {
        let created = false;
        let same = false;
        await db.transaction(async (tx) => {
            // Найти старый голос
            const oldVoteRes = await tx.execute({
                sql: 'SELECT vote_type FROM user_votes WHERE user_id = ? AND city_id = ?',
                args: [userId, cityId]
            });
            if (oldVoteRes.rows.length === 0) {
                await tx.execute({
                    sql: "INSERT INTO user_votes (user_id, city_id, vote_type) VALUES (?, ?, ?)",
                    args: [userId, cityId, voteType]
                });
                const columnToIncrement = voteType === 'liked' ? 'likes' : voteType === 'disliked' ? 'dislikes' : 'dont_know';
                await tx.execute({
                    sql: `INSERT INTO city_votes (city_id, ${columnToIncrement}) VALUES (?, 1)
                          ON CONFLICT(city_id) DO UPDATE SET ${columnToIncrement} = ${columnToIncrement} + 1`,
                    args: [cityId]
                });
                created = true;
                return;
            }
            const oldVote = oldVoteRes.rows[0].vote_type;
            if (oldVote === voteType) {
                same = true;
                return;
            }
            await tx.execute({
                sql: 'UPDATE user_votes SET vote_type = ? WHERE user_id = ? AND city_id = ?',
                args: [voteType, userId, cityId]
            });
            const voteMap = { liked: 'likes', disliked: 'dislikes', dont_know: 'dont_know' };
            const oldCol = voteMap[oldVote];
            const newCol = voteMap[voteType];
            if (oldCol && newCol) {
                await tx.execute({
                    sql: `UPDATE city_votes SET ${oldCol} = CASE WHEN ${oldCol} > 0 THEN ${oldCol} - 1 ELSE 0 END WHERE city_id = ?`,
                    args: [cityId]
                });
                await tx.execute({
                    sql: `UPDATE city_votes SET ${newCol} = ${newCol} + 1 WHERE city_id = ?`,
                    args: [cityId]
                });
            }
        });
        // No explicit sync
        clearRankingCaches();
        if (created) {
            return res.json({ success: true, message: 'Vote created' });
        }
        if (same) {
            return res.json({ success: true, message: 'Vote is already set to this value' });
        }
        log('info', 'vote_changed', { userId, cityId, voteType });
        res.json({ success: true });
    } catch (error) {
        log('error', 'change_vote_failed', { error: error?.message || String(error), userId, cityId, voteType });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Bulk change votes for many cityIds in one request
app.post('/api/bulk-change-vote', voteLimiter, async (req, res) => {
    const { userId, voteType, cityIds } = req.body || {};
    if (!userId || !voteType || !Array.isArray(cityIds) || cityIds.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!VALID_VOTE_TYPES.has(voteType)) {
        return res.status(400).json({ error: 'Invalid vote type' });
    }
    if (cityIds.length > 500) {
        return res.status(400).json({ error: 'Too many cities in one request' });
    }
    try {
        // If a JWT is provided, enforce userId consistency but don't require JWT
        const jwtUser = getJwtUserFromRequest(req);
        if (jwtUser && jwtUser.hasUserId && jwtUser.sub && jwtUser.sub !== userId) {
            return res.status(403).json({ error: 'Token subject does not match userId' });
        }

        let changed = 0;
        await db.transaction(async (tx) => {
            for (const cityId of cityIds) {
                // Skip unknown cities to be safe
                const cityExists = cityData.some(c => c.cityId === cityId);
                if (!cityExists) continue;
                const currentRes = await tx.execute({
                    sql: 'SELECT vote_type FROM user_votes WHERE user_id = ? AND city_id = ?',
                    args: [userId, cityId]
                });
                if (currentRes.rows.length === 0) {
                    // Create new vote
                    await tx.execute({
                        sql: 'INSERT INTO user_votes (user_id, city_id, vote_type) VALUES (?, ?, ?)',
                        args: [userId, cityId, voteType]
                    });
                    const col = voteType === 'liked' ? 'likes' : voteType === 'disliked' ? 'dislikes' : 'dont_know';
                    await tx.execute({
                        sql: `INSERT INTO city_votes (city_id, ${col}) VALUES (?, 1)
                              ON CONFLICT(city_id) DO UPDATE SET ${col} = ${col} + 1`,
                        args: [cityId]
                    });
                    changed++;
                    continue;
                }
                const oldVote = currentRes.rows[0].vote_type;
                if (oldVote === voteType) {
                    continue;
                }
                // Update
                await tx.execute({
                    sql: 'UPDATE user_votes SET vote_type = ? WHERE user_id = ? AND city_id = ?',
                    args: [voteType, userId, cityId]
                });
                const voteMap = { liked: 'likes', disliked: 'dislikes', dont_know: 'dont_know' };
                const oldCol = voteMap[oldVote];
                const newCol = voteMap[voteType];
                if (oldCol && newCol) {
                    await tx.execute({
                        sql: `UPDATE city_votes SET ${oldCol} = CASE WHEN ${oldCol} > 0 THEN ${oldCol} - 1 ELSE 0 END WHERE city_id = ?`,
                        args: [cityId]
                    });
                    await tx.execute({
                        sql: `UPDATE city_votes SET ${newCol} = ${newCol} + 1 WHERE city_id = ?`,
                        args: [cityId]
                    });
                }
                changed++;
            }
        });
        clearRankingCaches();
        return res.json({ success: true, changed });
    } catch (error) {
        log('error', 'bulk_change_vote_failed', { error: error?.message || String(error), userId, count: Array.isArray(cityIds) ? cityIds.length : 0 });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await db.execute('SELECT 1');
        res.json({ status: 'ok', uptime: process.uptime(), db: 'ok' });
    } catch (e) {
        log('error', 'health_check_failed', { error: e?.message || String(e) });
        res.status(500).json({ status: 'error', uptime: process.uptime(), db: 'error' });
    }
});

// Expose Prometheus metrics
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', client.register.contentType);
        const metrics = await client.register.metrics();
        res.send(metrics);
    } catch (e) {
        res.status(500).send('metrics_error');
    }
});

async function getAggregatedVotes() {
    const votesResult = await db.execute("SELECT * FROM city_votes");
    const votes = {};
    for (const row of votesResult.rows) {
        votes[row.city_id] = {
            likes: row.likes,
            dislikes: row.dislikes,
            dont_know: row.dont_know,
        };
    }
    return votes;
}

app.get('/api/rankings', async (req, res) => {
    try {
        const now = Date.now();
        if (rankingsCache.data && now - rankingsCache.ts < CACHE_TTL_MS) {
            return res.json(rankingsCache.data);
        }
        const votes = await getAggregatedVotes();
        const rankings = cityData.map(city => {
            const cityVotes = votes[city.cityId] || { likes: 0, dislikes: 0, dont_know: 0 };
            const { likes, dislikes, dont_know } = cityVotes;
            
            const totalVotes = likes + dislikes;
            const rating = totalVotes > 0 ? (likes / totalVotes) : 0;
            
            const totalResponses = likes + dislikes + dont_know;
            const popularity = totalResponses > 0 ? ((likes + dislikes) / totalResponses) : 0;
            
            return {
                ...city,
                ...cityVotes,
                rating,
                popularity,
                totalVotes,
                totalResponses
            };
        });
        
        rankings.sort((a, b) => {
            if (a.rating !== b.rating) return b.rating - a.rating;
            if (a.popularity !== b.popularity) return b.popularity - a.popularity;
            return b.totalVotes - a.totalVotes;
        });
        
        rankingsCache = { data: rankings, ts: Date.now() };
        res.json(rankings);
    } catch (error) {
        log('error', 'fetch_rankings_failed', { error: error?.message || String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/hidden-jam-ratings', async (req, res) => {
    try {
        const now = Date.now();
        if (hiddenJamCache.data && now - hiddenJamCache.ts < CACHE_TTL_MS) {
            return res.json(hiddenJamCache.data);
        }
        const votes = await getAggregatedVotes();
        const ratings = cityData.map(city => {
            const cityVotes = votes[city.cityId] || { likes: 0, dislikes: 0, dont_know: 0 };
            const { likes, dislikes, dont_know } = cityVotes;
            
            const totalVotes = likes + dislikes;
            const rating = totalVotes > 0 ? (likes / totalVotes) : 0;
            
            const totalResponses = likes + dislikes + dont_know;
            const popularity = totalResponses > 0 ? ((likes + dislikes) / totalResponses) : 0;
            
            const hiddenJamScore = rating * (1 - popularity);
            
            return {
                ...city,
                ...cityVotes,
                rating,
                popularity,
                hiddenJamScore,
                totalVotes,
                totalResponses
            };
        });
        
        const filteredRatings = ratings.filter(city => city.totalVotes > 0);
        filteredRatings.sort((a, b) => b.hiddenJamScore - a.hiddenJamScore);
        
        hiddenJamCache = { data: filteredRatings, ts: Date.now() };
        res.json(filteredRatings);
    } catch (error) {
        log('error', 'fetch_hidden_jam_failed', { error: error?.message || String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/user-votes/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    try {
        const votesResult = await db.execute({
            sql: 'SELECT city_id, vote_type FROM user_votes WHERE user_id = ?',
            args: [userId]
        });
        // enrich with city info
        const userVotes = votesResult.rows.map(row => {
            const city = cityData.find(c => c.cityId === row.city_id);
            return city ? {
                cityId: row.city_id,
                voteType: row.vote_type,
                name: city.name,
                country: city.country,
                flag: city.flag
            } : null;
        }).filter(Boolean);
        res.json({ userVotes });
    } catch (error) {
        log('error', 'fetch_user_votes_failed', { error: error?.message || String(error), userId });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Temporary debug endpoint to verify raw persisted rows (no enrichment)
app.get('/api/debug/user-votes-raw/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    try {
        const countRes = await db.execute({
            sql: 'SELECT COUNT(*) AS c FROM user_votes WHERE user_id = ?',
            args: [userId]
        });
        const sampleRes = await db.execute({
            sql: 'SELECT id, city_id, vote_type FROM user_votes WHERE user_id = ? ORDER BY id DESC LIMIT 10',
            args: [userId]
        });
        res.json({ count: countRes.rows?.[0]?.c ?? 0, sample: sampleRes.rows });
    } catch (error) {
        log('error', 'debug_user_votes_raw_failed', { error: error?.message || String(error), userId });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/register-telegram', authLimiter, async (req, res) => {
    const { initData, userId } = req.body;
    
    if (!initData) {
        return res.status(400).json({ error: 'Missing initData' });
    }

    try {
        // Validate the initData signature
        if (!BOT_TOKEN) {
            log('error', 'bot_token_missing');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Validate initData using Telegram's signature verification
        try {
            validate(initData, BOT_TOKEN, {
                expirationTime: 86400 // 24 hours in seconds
            });
        } catch (e) {
            log('error', 'telegram_initdata_invalid', { error: e?.message || String(e) });
            return res.status(403).json({ 
                error: 'Invalid Telegram authentication data. Please restart the app.' 
            });
        }

        // Parse the validated initData to extract user information
        const parsedData = parse(initData);
        const telegramUser = parsedData.user;
        
        if (!telegramUser || !telegramUser.id) {
            return res.status(400).json({ error: 'Invalid user data in initData' });
        }

        const telegramId = telegramUser.id.toString();
        
        log('info', 'telegram_id_validated', { telegramId });

        // 1. Check if a user with this telegramId already exists
        let userRes = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        if (userRes.rows.length > 0) {
            // User exists, return their existing userId
            const existingUser = userRes.rows[0];
            log('info', 'telegram_existing_user', { telegramId, userId: existingUser.user_id });
            return res.json({ 
                success: true, 
                user: existingUser,
                token: issueJwtForUser(existingUser),
                isExistingUser: true
            });
        }

        // 2. Check if the provided userId (current UUID) exists and needs to be linked
        if (userId) {
            userRes = await db.execute({
                sql: 'SELECT * FROM users WHERE user_id = ?',
                args: [userId]
            });
            
            if (userRes.rows.length > 0) {
                // Link telegramId to this existing user (preserving their UUID and votes)
                await db.execute({
                    sql: 'UPDATE users SET telegram_id = ? WHERE user_id = ?',
                    args: [telegramId, userId]
                });
                
                // Return the updated user
                userRes = await db.execute({
                    sql: 'SELECT * FROM users WHERE user_id = ?',
                    args: [userId]
                });
                
                log('info', 'telegram_user_linked', { telegramId, userId });
                return res.json({ 
                    success: true, 
                    user: userRes.rows[0],
                    token: issueJwtForUser(userRes.rows[0]),
                    isLinked: true
                });
            }
        }

        // 3. Create a new user with both telegramId and the provided userId (or null if none)
        await db.execute({
            sql: 'INSERT INTO users (telegram_id, user_id) VALUES (?, ?)',
            args: [telegramId, userId || null]
        });
        
        userRes = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        log('info', 'telegram_user_created', { telegramId, userId: userId || null });
        return res.json({ 
            success: true, 
            user: userRes.rows[0],
            token: issueJwtForUser(userRes.rows[0]),
            isNewUser: true
        });

    } catch (error) {
        log('error', 'telegram_registration_failed', { error: error?.message || String(error) });
        return res.status(500).json({ error: 'Internal server error' });
    }
});


// Get user by Telegram initData for restoration purposes
app.post('/api/get-user-by-telegram', authLimiter, async (req, res) => {
    const { initData } = req.body;
    
    if (!initData) {
        return res.status(400).json({ error: 'Missing initData' });
    }

    try {
        // Validate the initData signature
        if (!BOT_TOKEN) {
            log('error', 'bot_token_missing');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Validate initData using Telegram's signature verification
        try {
            validate(initData, BOT_TOKEN, {
                expirationTime: 86400 // 24 hours in seconds
            });
        } catch (e) {
            log('error', 'telegram_initdata_invalid', { error: e?.message || String(e) });
            return res.status(403).json({ 
                error: 'Invalid Telegram authentication data. Please restart the app.' 
            });
        }

        // Parse the validated initData to extract user information
        const parsedData = parse(initData);
        const telegramUser = parsedData.user;
        
        if (!telegramUser || !telegramUser.id) {
            return res.status(400).json({ error: 'Invalid user data in initData' });
        }

        const telegramId = telegramUser.id.toString();
        
        // Look up user by telegram_id
        const userRes = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        if (userRes.rows.length > 0) {
            const user = userRes.rows[0];
            log('info', 'telegram_user_restored', { telegramId, userId: user.user_id });
            return res.json({ 
                success: true, 
                user: user,
                token: issueJwtForUser(user),
                found: true
            });
        } else {
            log('info', 'telegram_user_not_found', { telegramId });
            return res.json({ 
                success: true, 
                found: false,
                telegramId: telegramId
            });
        }

    } catch (error) {
        log('error', 'telegram_lookup_failed', { error: error?.message || String(error) });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Validate user endpoint for frontend login
app.post("/api/validate-user", async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
    }
    
    try {
        // Use the same migration-safe validation logic
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        
        if (uuidRegex.test(userId)) {
            // UUID format - existing user, always valid
            log('info', 'login_valid_uuid', { userId });
            return res.json({ valid: true, type: "existing" });
        }
        
        // Non-UUID format - check if registered via Telegram
        const userCheck = await db.execute({
            sql: "SELECT id FROM users WHERE user_id = ?",
            args: [userId]
        });
        
        if (userCheck.rows.length === 0) {
            log('info', 'login_rejected_invalid_user', { userId });
            return res.json({ 
                valid: false, 
                error: "Invalid User ID. Please get a valid User ID from the Telegram mini app first."
            });
        }
        
        log('info', 'login_valid_registered', { userId });
        return res.json({ valid: true, type: "registered" });
        
    } catch (error) {
        log('error', 'login_validation_failed', { error: error?.message || String(error), userId });
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Add this endpoint after cityData is loaded
app.get('/api/all-cities', (req, res) => {
    res.json({ cities: cityData });
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    log('error', 'unhandled_error', {
        error: err?.message || String(err),
        requestId: req.requestId
    });
    res.status(err.status || 500).json({ error: 'Internal server error', requestId: req.requestId });
});

// Not found handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', requestId: req.requestId });
});

initializeDatabase().then(() => {
    httpServer = app.listen(PORT, () => {
        log('info', 'server_started', { port: PORT });
    });
});

// Graceful shutdown
function shutdown(signal) {
    log('info', 'shutdown_initiated', { signal });
    const forceTimer = setTimeout(() => {
        log('error', 'shutdown_forced');
        process.exit(1);
    }, 10000).unref();

    try {
        httpServer?.close(() => {
            log('info', 'http_server_closed');
            Promise.resolve(db?.close?.()).catch(() => {}).finally(() => {
                clearTimeout(forceTimer);
                process.exit(0);
            });
        });
    } catch (e) {
        log('error', 'shutdown_error', { error: e?.message || String(e) });
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
    log('error', 'unhandled_rejection', { error: (err && err.message) || String(err) });
    shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
    log('error', 'uncaught_exception', { error: err?.message || String(err) });
    shutdown('uncaughtException');
});
