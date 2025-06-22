const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Инициализация базы данных
const db = new sqlite3.Database('./votes.db');

// Создание таблиц при первом запуске
db.serialize(() => {
    // Таблица для голосов городов
    db.run(`CREATE TABLE IF NOT EXISTS city_votes (
        city_id TEXT PRIMARY KEY,
        likes INTEGER DEFAULT 0,
        dislikes INTEGER DEFAULT 0,
        dont_know INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица для голосов пользователей
    db.run(`CREATE TABLE IF NOT EXISTS user_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        city_id TEXT NOT NULL,
        vote_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, city_id)
    )`);

    // Индексы для быстрого поиска
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_votes_user_id ON user_votes(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_votes_city_id ON user_votes(city_id)`);
});

// Загрузка данных городов
const cityData = JSON.parse(fs.readFileSync(path.join(__dirname, '../cities.json'), 'utf8'));

// Функция для получения голосов города
function getCityVotes(cityId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT likes, dislikes, dont_know FROM city_votes WHERE city_id = ?',
            [cityId],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || { likes: 0, dislikes: 0, dont_know: 0 });
                }
            }
        );
    });
}

// Функция для обновления голосов города
function updateCityVotes(cityId, voteType) {
    return new Promise((resolve, reject) => {
        const column = voteType === 'like' ? 'likes' : voteType === 'dislike' ? 'dislikes' : 'dont_know';
        
        db.run(
            `INSERT INTO city_votes (city_id, ${column}) VALUES (?, 1)
             ON CONFLICT(city_id) DO UPDATE SET 
             ${column} = ${column} + 1,
             updated_at = CURRENT_TIMESTAMP`,
            [cityId],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

// Функция для записи голоса пользователя
function recordUserVote(userId, cityId, voteType) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO user_votes (user_id, city_id, vote_type) VALUES (?, ?, ?)',
            [userId, cityId, voteType],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

// Функция для проверки, голосовал ли пользователь за город
function hasUserVoted(userId, cityId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT vote_type FROM user_votes WHERE user_id = ? AND city_id = ?',
            [userId, cityId],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.vote_type : null);
                }
            }
        );
    });
}

// Функция для получения всех городов, за которые проголосовал пользователь
function getUserVotedCities(userId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT city_id FROM user_votes WHERE user_id = ?',
            [userId],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => row.city_id));
                }
            }
        );
    });
}

// Endpoint для голосования
app.post('/api/vote', async (req, res) => {
    const { cityId, voteType, userId } = req.body;

    if (!cityId || !voteType || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['like', 'dislike', 'dont_know'].includes(voteType)) {
        return res.status(400).json({ error: 'Invalid vote type' });
    }

    try {
        // Проверяем, голосовал ли пользователь уже за этот город
        const existingVote = await hasUserVoted(userId, cityId);
        if (existingVote) {
            return res.status(403).json({ 
                error: 'User has already voted for this city',
                existingVote: existingVote
            });
        }

        // Записываем голос пользователя
        await recordUserVote(userId, cityId, voteType);

        // Обновляем статистику города
        await updateCityVotes(cityId, voteType);

        // Получаем обновленную статистику
        const updatedVotes = await getCityVotes(cityId);

        // Находим название города
        const city = cityData.find(c => c.cityId === cityId);
        const cityName = city ? city.name : cityId;

        console.log(`Vote recorded for ${cityName} by user ${userId}: ${voteType}. New score: L ${updatedVotes.likes} / D ${updatedVotes.dislikes} / DK ${updatedVotes.dont_know}`);

        res.json({ 
            success: true, 
            message: 'Vote recorded successfully',
            cityVotes: updatedVotes
        });

    } catch (error) {
        console.error('Error recording vote:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint для получения рейтинга городов
app.get('/api/ratings', async (req, res) => {
    try {
        const query = `
            SELECT 
                city_id,
                likes,
                dislikes,
                dont_know,
                CASE 
                    WHEN (likes + dislikes) > 0 
                    THEN ROUND((likes * 100.0) / (likes + dislikes), 1)
                    ELSE 0 
                END as rating
            FROM city_votes 
            WHERE (likes + dislikes + dont_know) >= 1
            ORDER BY rating DESC, (likes + dislikes + dont_know) DESC
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error fetching ratings:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            const ratings = rows.map(row => {
                const city = cityData.find(c => c.cityId === row.city_id);
                return {
                    cityId: row.city_id,
                    name: city ? city.name : row.city_id,
                    country: city ? city.country : 'Unknown',
                    flag: city ? city.flag : '',
                    likes: row.likes,
                    dislikes: row.dislikes,
                    dont_know: row.dont_know,
                    rating: row.rating,
                    totalVotes: row.likes + row.dislikes + row.dont_know
                };
            });

            res.json(ratings);
        });

    } catch (error) {
        console.error('Error fetching ratings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint для получения скрытых жемчужин
app.get('/api/hidden-jam-ratings', async (req, res) => {
    try {
        const query = `
            SELECT 
                city_id,
                likes,
                dislikes,
                dont_know,
                CASE 
                    WHEN (likes + dislikes) > 0 
                    THEN ROUND((likes * 100.0) / (likes + dislikes), 1)
                    ELSE 0 
                END as rating,
                CASE 
                    WHEN (likes + dislikes + dont_know) > 0 
                    THEN ROUND(((likes + dislikes) * 100.0) / (likes + dislikes + dont_know), 1)
                    ELSE 0 
                END as popularity
            FROM city_votes 
            WHERE (likes + dislikes) >= 2
            ORDER BY rating DESC, popularity ASC
            LIMIT 20
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error fetching hidden jam ratings:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            const ratings = rows.map(row => {
                const city = cityData.find(c => c.cityId === row.city_id);
                return {
                    cityId: row.city_id,
                    name: city ? city.name : row.city_id,
                    country: city ? city.country : 'Unknown',
                    flag: city ? city.flag : '',
                    likes: row.likes,
                    dislikes: row.dislikes,
                    dont_know: row.dont_know,
                    rating: row.rating,
                    popularity: row.popularity,
                    totalVotes: row.likes + row.dislikes + row.dont_know
                };
            });

            res.json(ratings);
        });

    } catch (error) {
        console.error('Error fetching hidden jam ratings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint для получения городов, за которые проголосовал пользователь
app.get('/api/user-votes/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const votedCities = await getUserVotedCities(userId);
        res.json({ votedCities });
    } catch (error) {
        console.error('Error fetching user votes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint для получения статистики
app.get('/api/stats', async (req, res) => {
    try {
        db.get('SELECT COUNT(*) as totalCities FROM city_votes', (err, cityRow) => {
            if (err) {
                console.error('Error fetching city stats:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            db.get('SELECT COUNT(DISTINCT user_id) as totalUsers FROM user_votes', (err, userRow) => {
                if (err) {
                    console.error('Error fetching user stats:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                db.get(`
                    SELECT 
                        SUM(likes) as totalLikes,
                        SUM(dislikes) as totalDislikes,
                        SUM(dont_know) as totalDontKnow
                    FROM city_votes
                `, (err, voteRow) => {
                    if (err) {
                        console.error('Error fetching vote stats:', err);
                        return res.status(500).json({ error: 'Internal server error' });
                    }

                    res.json({
                        totalCities: cityRow.totalCities,
                        totalUsers: userRow.totalUsers,
                        totalVotes: (voteRow.totalLikes || 0) + (voteRow.totalDislikes || 0) + (voteRow.totalDontKnow || 0),
                        totalLikes: voteRow.totalLikes || 0,
                        totalDislikes: voteRow.totalDislikes || 0,
                        totalDontKnow: voteRow.totalDontKnow || 0
                    });
                });
            });
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Database: votes.db`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nClosing database connection...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
}); 