const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const cityData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cities.json'), 'utf8'));
const votes = new Map();
const USER_VOTES_FILE = path.join(__dirname, 'user_votes.json');
let userVotes = {};

// Initialize votes for all cities
cityData.forEach(city => {
    votes.set(city.cityId, {
        likes: 0,
        dislikes: 0,
        dont_know: 0
    });
});

// Загрузка голосов пользователей из файла
function loadUserVotes() {
    if (fs.existsSync(USER_VOTES_FILE)) {
        try {
            userVotes = JSON.parse(fs.readFileSync(USER_VOTES_FILE, 'utf8'));
        } catch (e) {
            userVotes = {};
        }
    } else {
        userVotes = {};
    }
}

// Сохранение голосов пользователей в файл
function saveUserVotes() {
    fs.writeFileSync(USER_VOTES_FILE, JSON.stringify(userVotes, null, 2), 'utf8');
}

loadUserVotes();

// Vote endpoint - now uses cityId and userId
app.post('/api/vote', (req, res) => {
    const { cityId, voteType, userId } = req.body;
    if (!cityId || !voteType || !userId) {
        return res.status(400).json({ error: 'Missing cityId, voteType or userId' });
    }
    const city = cityData.find(c => c.cityId === cityId);
    if (!city) {
        return res.status(404).json({ error: 'City not found' });
    }
    // Проверка: голосовал ли уже пользователь за этот город
    if (!userVotes[userId]) userVotes[userId] = [];
    if (userVotes[userId].includes(cityId)) {
        return res.status(403).json({ error: 'User already voted for this city' });
    }
    const voteData = votes.get(cityId);
    if (!voteData) {
        votes.set(cityId, { likes: 0, dislikes: 0, dont_know: 0 });
    }
    if (voteType === 'liked') {
        votes.get(cityId).likes++;
    } else if (voteType === 'disliked') {
        votes.get(cityId).dislikes++;
    } else if (voteType === 'dont_know') {
        votes.get(cityId).dont_know++;
    } else {
        return res.status(400).json({ error: 'Invalid vote type' });
    }
    // Записываем, что пользователь проголосовал за этот город
    userVotes[userId].push(cityId);
    saveUserVotes();
    console.log(`Vote recorded for ${city.name} by user ${userId}: ${voteType}. New score: L ${votes.get(cityId).likes} / D ${votes.get(cityId).dislikes} / DK ${votes.get(cityId).dont_know}`);
    res.json({ success: true });
});

app.get('/api/rankings', (req, res) => {
    const rankings = cityData.map(city => {
        const voteData = votes.get(city.cityId);
        const likes = voteData ? voteData.likes : 0;
        const dislikes = voteData ? voteData.dislikes : 0;
        const dont_know = voteData ? voteData.dont_know : 0;
        
        // Total votes excluding "dont_know" for rating calculation
        const totalVotes = likes + dislikes;
        
        // Rating = likes / (likes + dislikes) - percentage of positive votes among people who visited
        const rating = totalVotes > 0 ? likes / totalVotes : 0;
        
        // Popularity = (likes + dislikes) / (likes + dislikes + dont_know) - percentage of people who visited
        const totalResponses = likes + dislikes + dont_know;
        const popularity = totalResponses > 0 ? (likes + dislikes) / totalResponses : 0;
        
        return {
            id: city.cityId,
            name: city.name,
            country: city.country,
            flag: city.flag,
            likes: likes,
            dislikes: dislikes,
            dont_know: dont_know,
            rating: rating,
            popularity: popularity,
            totalVotes: totalVotes,
            totalResponses: totalResponses
        };
    });
    
    // Sort by rating descending, then by popularity, then by total votes
    rankings.sort((a, b) => {
        if (a.rating !== b.rating) {
            return b.rating - a.rating;
        }
        if (a.popularity !== b.popularity) {
            return b.popularity - a.popularity;
        }
        return b.totalVotes - a.totalVotes;
    });
    
    res.json(rankings);
});

// Hidden Jam Ratings endpoint - finds cities with high like percentage but low popularity
app.get('/api/hidden-jam-ratings', (req, res) => {
    const ratings = cityData.map(city => {
        const voteData = votes.get(city.cityId);
        const likes = voteData ? voteData.likes : 0;
        const dislikes = voteData ? voteData.dislikes : 0;
        const dont_know = voteData ? voteData.dont_know : 0;
        
        // Total votes excluding "dont_know" for rating calculation
        const totalVotes = likes + dislikes;
        
        // Rating = likes / (likes + dislikes) - percentage of positive votes among people who visited
        const rating = totalVotes > 0 ? likes / totalVotes : 0;
        
        // Popularity = (likes + dislikes) / (likes + dislikes + dont_know) - percentage of people who visited
        const totalResponses = likes + dislikes + dont_know;
        const popularity = totalResponses > 0 ? (likes + dislikes) / totalResponses : 0;
        
        // Hidden jam score: high rating but low popularity
        const hiddenJamScore = rating * (1 - popularity);
        
        return {
            id: city.cityId,
            name: city.name,
            country: city.country,
            flag: city.flag,
            likes: likes,
            dislikes: dislikes,
            dont_know: dont_know,
            rating: rating,
            popularity: popularity,
            hiddenJamScore: hiddenJamScore,
            totalVotes: totalVotes,
            totalResponses: totalResponses
        };
    });
    
    // Filter cities with at least 1 vote and sort by hidden jam score
    const filteredRatings = ratings.filter(city => city.totalVotes > 0);
    filteredRatings.sort((a, b) => b.hiddenJamScore - a.hiddenJamScore);
    
    res.json(filteredRatings);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 