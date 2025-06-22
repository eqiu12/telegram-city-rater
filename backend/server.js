const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const citiesFilePath = path.join(__dirname, '..', 'cities.json');
let citiesData = [];

// Load city data from cities.json and initialize votes
try {
    const rawData = fs.readFileSync(citiesFilePath);
    const loadedCities = JSON.parse(rawData);
    citiesData = loadedCities.map(city => ({
        name: city.name,
        likes: 0,
        dislikes: 0,
    }));
    console.log("City data loaded and initialized.");
} catch (error) {
    console.error("Failed to load or parse cities.json:", error);
    process.exit(1); // Exit if we can't load the essential city data
}

// Endpoint to get the top-rated cities
app.get('/ratings', (req, res) => {
    const sortedCities = [...citiesData]
        .sort((a, b) => {
            const ratingA = a.likes / (a.likes + a.dislikes || 1);
            const ratingB = b.likes / (b.likes + b.dislikes || 1);
            // Also consider total votes to rank more-voted cities higher in case of tie
            if (ratingB === ratingA) {
                return (b.likes + b.dislikes) - (a.likes + a.dislikes);
            }
            return ratingB - ratingA;
        })
        .slice(0, 10); // Return top 10
    
    res.json(sortedCities);
});

// Endpoint to submit a vote
app.post('/vote', (req, res) => {
    const { cityName, voteType } = req.body;

    if (!cityName || !['liked', 'disliked'].includes(voteType)) {
        return res.status(400).json({ error: 'Invalid vote data. Required: cityName, voteType ("liked" or "disliked")' });
    }

    const city = citiesData.find(c => c.name === cityName);

    if (city) {
        if (voteType === 'liked') {
            city.likes++;
        } else if (voteType === 'disliked') {
            city.dislikes++;
        }
        console.log(`Vote recorded for ${cityName}: ${voteType}. New score: L ${city.likes} / D ${city.dislikes}`);
        res.status(200).json({ message: 'Vote recorded successfully' });
    } else {
        res.status(404).json({ error: 'City not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 