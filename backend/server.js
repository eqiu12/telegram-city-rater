const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { db, initializeDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

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
        return res.status(400).json({ error: 'Missing required fields' });
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

initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}); 