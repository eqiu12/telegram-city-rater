require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { db, initializeDatabase } = require('./db');
const { validate, parse } = require('@telegram-apps/init-data-node');

const app = express();
const PORT = process.env.PORT || 3000;

// You'll need to set this in your environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.warn('WARNING: BOT_TOKEN not set. Telegram init data validation will fail.');
}

const corsOptions = {
    origin: [
        'https://eqiu12.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        /^https:\/\/.*\.vercel\.app$/,
        'https://ratethis.town',
        'https://www.ratethis.town'
    ],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Serve static files from the parent directory
app.use(express.static(path.join(__dirname, '..')));

const cityDataPath = path.join(__dirname, '..', 'cities.json');
const cityData = JSON.parse(fs.readFileSync(cityDataPath, 'utf8'));

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

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
        console.error('Error fetching unvoted cities:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/vote', async (req, res) => {
    const { userId, cityId, voteType } = req.body;

    if (!userId || !cityId || !voteType) {
        return res.status(400).json({ error: "Missing required fields" });
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
            console.error("Error validating user:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    } else {
        console.log(`✅ VOTE ACCEPTED: Existing UUID user ${userId}`);
    }
    
    const city = cityData.find(c => c.cityId === cityId);
    if (!city) {
        return res.status(404).json({ error: 'City not found' });
    }

    try {
        // Check if user has already voted
        const existingVote = await db.execute({
            sql: "SELECT id FROM user_votes WHERE user_id = ? AND city_id = ?",
            args: [userId, cityId]
        });

        if (existingVote.rows.length > 0) {
            return res.status(409).json({ error: 'User has already voted for this city' });
        }

        // Record the new vote in the user_votes table
        await db.execute({
            sql: "INSERT INTO user_votes (user_id, city_id, vote_type) VALUES (?, ?, ?)",
            args: [userId, cityId, voteType]
        });

        // Update the aggregated votes in the city_votes table
        const columnToIncrement = voteType === 'liked' ? 'likes' : voteType === 'disliked' ? 'dislikes' : 'dont_know';
        
        await db.execute({
            sql: `INSERT INTO city_votes (city_id, ${columnToIncrement}) VALUES (?, 1)
                  ON CONFLICT(city_id) DO UPDATE SET ${columnToIncrement} = ${columnToIncrement} + 1`,
            args: [cityId]
        });
        
        console.log(`Vote recorded for ${city.name} by user ${userId}: ${voteType}`);
        res.json({ success: true });

    } catch (error) {
        console.error('Error recording vote:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/change-vote', async (req, res) => {
    const { userId, cityId, voteType } = req.body;
    if (!userId || !cityId || !voteType) {
        return res.status(400).json({ error: "Missing required fields" });
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
            console.error("Error validating user:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    } else {
        console.log(`✅ VOTE ACCEPTED: Existing UUID user ${userId}`);
    }
    try {
        // Найти старый голос
        const oldVoteRes = await db.execute({
            sql: 'SELECT vote_type FROM user_votes WHERE user_id = ? AND city_id = ?',
            args: [userId, cityId]
        });
        if (oldVoteRes.rows.length === 0) {
            // No previous vote: insert new vote (like /api/vote)
            await db.execute({
                sql: "INSERT INTO user_votes (user_id, city_id, vote_type) VALUES (?, ?, ?)",
                args: [userId, cityId, voteType]
            });
            // Update city_votes
            const columnToIncrement = voteType === 'liked' ? 'likes' : voteType === 'disliked' ? 'dislikes' : 'dont_know';
            await db.execute({
                sql: `INSERT INTO city_votes (city_id, ${columnToIncrement}) VALUES (?, 1)
                      ON CONFLICT(city_id) DO UPDATE SET ${columnToIncrement} = ${columnToIncrement} + 1`,
                args: [cityId]
            });
            return res.json({ success: true, message: 'Vote created' });
        }
        const oldVote = oldVoteRes.rows[0].vote_type;
        if (oldVote === voteType) {
            return res.json({ success: true, message: 'Vote is already set to this value' });
        }
        // Обновить user_votes
        await db.execute({
            sql: 'UPDATE user_votes SET vote_type = ? WHERE user_id = ? AND city_id = ?',
            args: [voteType, userId, cityId]
        });
        // Корректировать city_votes: уменьшить старый, увеличить новый
        const voteMap = { liked: 'likes', disliked: 'dislikes', dont_know: 'dont_know' };
        const oldCol = voteMap[oldVote];
        const newCol = voteMap[voteType];
        if (oldCol && newCol) {
            await db.execute({
                sql: `UPDATE city_votes SET ${oldCol} = CASE WHEN ${oldCol} > 0 THEN ${oldCol} - 1 ELSE 0 END WHERE city_id = ?`,
                args: [cityId]
            });
            await db.execute({
                sql: `UPDATE city_votes SET ${newCol} = ${newCol} + 1 WHERE city_id = ?`,
                args: [cityId]
            });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error changing vote:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        
        res.json(rankings);
    } catch (error) {
        console.error('Error fetching rankings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/hidden-jam-ratings', async (req, res) => {
    try {
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
        
        res.json(filteredRatings);
    } catch (error) {
        console.error('Error fetching hidden jam ratings:', error);
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
        console.error('Error fetching user votes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/register-telegram', async (req, res) => {
    const { initData, userId } = req.body;
    
    if (!initData) {
        return res.status(400).json({ error: 'Missing initData' });
    }

    try {
        // Validate the initData signature
        if (!BOT_TOKEN) {
            console.error('BOT_TOKEN not configured');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Validate initData using Telegram's signature verification
        validate(initData, BOT_TOKEN, {
            expirationTime: 86400 // 24 hours in seconds
        });

        // Parse the validated initData to extract user information
        const parsedData = parse(initData);
        const telegramUser = parsedData.user;
        
        if (!telegramUser || !telegramUser.id) {
            return res.status(400).json({ error: 'Invalid user data in initData' });
        }

        const telegramId = telegramUser.id.toString();
        
        console.log(`✅ Telegram ID validated: ${telegramId} for user: ${telegramUser.firstName || 'Unknown'}`);

        // 1. Check if a user with this telegramId already exists
        let userRes = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        if (userRes.rows.length > 0) {
            // User exists, return their existing userId
            const existingUser = userRes.rows[0];
            console.log(`📋 Existing user found: telegramId=${telegramId} -> userId=${existingUser.user_id}`);
            return res.json({ 
                success: true, 
                user: existingUser,
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
                
                console.log(`🔗 Linked telegramId=${telegramId} to existing userId=${userId}`);
                return res.json({ 
                    success: true, 
                    user: userRes.rows[0],
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
        
        console.log(`🆕 Created new user: telegramId=${telegramId}, userId=${userId || 'null'}`);
        return res.json({ 
            success: true, 
            user: userRes.rows[0],
            isNewUser: true
        });

    } catch (error) {
        if (error.message && error.message.includes('Validation')) {
            console.error('❌ Invalid initData signature:', error.message);
            return res.status(403).json({ 
                error: 'Invalid Telegram authentication data. Please restart the app.' 
            });
        }
        
        console.error('Error processing Telegram registration:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});


// Get user by Telegram initData for restoration purposes
app.post('/api/get-user-by-telegram', async (req, res) => {
    const { initData } = req.body;
    
    if (!initData) {
        return res.status(400).json({ error: 'Missing initData' });
    }

    try {
        // Validate the initData signature
        if (!BOT_TOKEN) {
            console.error('BOT_TOKEN not configured');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Validate initData using Telegram's signature verification
        validate(initData, BOT_TOKEN, {
            expirationTime: 86400 // 24 hours in seconds
        });

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
            console.log(`🔄 User restoration: telegramId=${telegramId} -> userId=${user.user_id}`);
            return res.json({ 
                success: true, 
                user: user,
                found: true
            });
        } else {
            console.log(`👤 New Telegram user: telegramId=${telegramId}`);
            return res.json({ 
                success: true, 
                found: false,
                telegramId: telegramId
            });
        }

    } catch (error) {
        if (error.message && error.message.includes('Validation')) {
            console.error('❌ Invalid initData signature:', error.message);
            return res.status(403).json({ 
                error: 'Invalid Telegram authentication data. Please restart the app.' 
            });
        }
        
        console.error('Error looking up Telegram user:', error);
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
            console.log(`✅ LOGIN: Valid UUID user ${userId}`);
            return res.json({ valid: true, type: "existing" });
        }
        
        // Non-UUID format - check if registered via Telegram
        const userCheck = await db.execute({
            sql: "SELECT id FROM users WHERE user_id = ?",
            args: [userId]
        });
        
        if (userCheck.rows.length === 0) {
            console.log(`❌ LOGIN REJECTED: Invalid userId ${userId}`);
            return res.json({ 
                valid: false, 
                error: "Invalid User ID. Please get a valid User ID from the Telegram mini app first."
            });
        }
        
        console.log(`✅ LOGIN: Valid registered user ${userId}`);
        return res.json({ valid: true, type: "registered" });
        
    } catch (error) {
        console.error("Error validating user for login:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Add this endpoint after cityData is loaded
app.get('/api/all-cities', (req, res) => {
    res.json({ cities: cityData });
});

initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}); 