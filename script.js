document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.ready();

    const API_URL = 'http://localhost:3000'; // Change this to your deployed backend URL (e.g., 'https://your-app-name.onrender.com')
    let cities = [];
    let currentCityIndex = 0;
    let ratedCount = 0;

    const app = document.getElementById('app');
    const cityNameEl = document.getElementById('city-name');
    const cityImagesEl = document.getElementById('city-images');
    const likeBtn = document.getElementById('like');
    const dislikeBtn = document.getElementById('dislike');
    const dontKnowBtn = document.getElementById('dont-know');
    const showRatingsBtn = document.getElementById('show-ratings-btn');
    const ratingsModal = document.getElementById('ratings-modal');
    const ratingsList = document.getElementById('ratings-list');
    const closeRatingsBtn = document.getElementById('close-ratings-btn');

    function setControlsEnabled(enabled) {
        likeBtn.disabled = !enabled;
        dislikeBtn.disabled = !enabled;
        dontKnowBtn.disabled = !enabled;
    }

    async function loadCities() {
        try {
            const response = await fetch('cities.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const cityData = await response.json();
            if (!cityData || cityData.length === 0) throw new Error("City data is empty or invalid.");

            cities = cityData.map(city => ({ name: city.name, images: city.images }));
            cities.sort(() => Math.random() - 0.5); // Shuffle cities
            
            setControlsEnabled(true);
            showCity();

        } catch (error) {
            console.error("Failed to load cities:", error);
            cityNameEl.textContent = "Could not load cities. Please try again later.";
            setControlsEnabled(false);
        }
    }

    function showCity() {
        if (currentCityIndex >= cities.length) {
            // When all cities are rated, offer to start over
            cityNameEl.textContent = "You've rated all cities!";
            cityImagesEl.innerHTML = '';
            likeBtn.style.display = 'none';
            dislikeBtn.style.display = 'none';
            dontKnowBtn.style.display = 'none';
            // Show a restart button
            if (!document.getElementById('restart-btn')) {
                const restartBtn = document.createElement('button');
                restartBtn.id = 'restart-btn';
                restartBtn.textContent = 'Start Over';
                restartBtn.onclick = () => { window.location.reload(); };
                app.appendChild(restartBtn);
            }
            return;
        }

        const city = cities[currentCityIndex];
        cityNameEl.textContent = city.name;
        cityImagesEl.innerHTML = '';
        city.images.forEach(imageUrl => {
            const img = document.createElement('img');
            img.src = imageUrl;
            cityImagesEl.appendChild(img);
        });
    }

    async function showRatings() {
        try {
            const response = await fetch(`${API_URL}/ratings`);
            const topCities = await response.json();
            
            ratingsList.innerHTML = '';
            if (topCities.length === 0) {
                ratingsList.innerHTML = '<li>No cities rated yet!</li>';
            } else {
                topCities.forEach((city, index) => {
                    const totalVotes = city.likes + city.dislikes;
                    const likePercentage = totalVotes > 0 ? Math.round((city.likes / totalVotes) * 100) : 0;
                    const li = document.createElement('li');
                    li.innerHTML = `<strong>${index + 1}.</strong> ${city.name}: ${likePercentage}% ❤️ (${totalVotes} votes)`;
                    ratingsList.appendChild(li);
                });
            }
        } catch (error) {
            console.error("Failed to fetch ratings:", error);
            ratingsList.innerHTML = '<li>Could not load ratings.</li>';
        }
        
        ratingsModal.classList.remove('hidden');
    }

    function hideRatings() {
        ratingsModal.classList.add('hidden');
    }

    async function handleVote(voteType) {
        setControlsEnabled(false);
        const city = cities[currentCityIndex];

        if (voteType === 'liked' || voteType === 'disliked') {
            try {
                await fetch(`${API_URL}/vote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cityName: city.name, voteType }),
                });
            } catch (error) {
                console.error("Failed to submit vote:", error);
                // Optionally, inform the user the vote failed
            }
        }
        
        ratedCount++;
        currentCityIndex++;
        // Just show the next city, no modal
        showCity();
        setControlsEnabled(true);
    }

    likeBtn.addEventListener('click', () => handleVote('liked'));
    dislikeBtn.addEventListener('click', () => handleVote('disliked'));
    dontKnowBtn.addEventListener('click', () => handleVote('dunno'));
    showRatingsBtn.addEventListener('click', showRatings);
    
    // Add debugging to close button
    if (closeRatingsBtn) {
        closeRatingsBtn.addEventListener('click', () => {
            hideRatings();
        });
    } else {
        console.error('Close ratings button not found');
    }

    // Close modal when clicking outside of it
    ratingsModal.addEventListener('click', (e) => {
        if (e.target === ratingsModal) {
            hideRatings();
        }
    });

    loadCities();
}); 