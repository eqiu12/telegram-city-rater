document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.ready();

    const API_URL = 'http://localhost:3000';
    let cities = [];
    let currentCityIndex = 0;
    let ratedCount = 0;

    const app = document.getElementById('app');
    const cityNameEl = document.getElementById('city-name');
    const cityImagesEl = document.getElementById('city-images');
    const likeBtn = document.getElementById('likeBtn');
    const dislikeBtn = document.getElementById('dislikeBtn');
    const dontKnowBtn = document.getElementById('dontKnowBtn');
    const showRatingsBtn = document.getElementById('showRatingsBtn');
    const showHiddenJamBtn = document.getElementById('showHiddenJamBtn');
    const ratingsModal = document.getElementById('ratings-modal');
    const ratingsList = document.getElementById('ratings-list');
    const closeRatingsBtn = document.getElementById('close-ratings-btn');

    // Генерируем временный userId для тестирования
    // В Telegram Mini App это будет получено из Telegram WebApp API
    const userId = 'test_user_' + Math.random().toString(36).substr(2, 9);

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

            cities = cityData.map(city => ({ 
                name: city.name, 
                flag: city.flag || '🏳️', // Use flag if available, otherwise default flag
                country: city.country || 'Неизвестно',
                cityId: city.cityId
            }));
            cities.sort(() => Math.random() - 0.5); // Shuffle cities
            
            setControlsEnabled(true);
            showCity();

        } catch (error) {
            console.error("Failed to load cities:", error);
            cityNameEl.textContent = "Не удалось загрузить города. Попробуйте позже.";
            setControlsEnabled(false);
        }
    }

    function showCity() {
        if (currentCityIndex >= cities.length) {
            // When all cities are rated, offer to start over
            cityNameEl.textContent = "Вы оценили все города!";
            cityImagesEl.innerHTML = '';
            likeBtn.style.display = 'none';
            dislikeBtn.style.display = 'none';
            dontKnowBtn.style.display = 'none';
            // Show a restart button
            if (!document.getElementById('restart-btn')) {
                const restartBtn = document.createElement('button');
                restartBtn.id = 'restart-btn';
                restartBtn.textContent = 'Начать заново';
                restartBtn.onclick = () => { window.location.reload(); };
                app.appendChild(restartBtn);
            }
            return;
        }

        const city = cities[currentCityIndex];
        cityNameEl.textContent = `${city.name} ${city.flag}`;
        cityImagesEl.innerHTML = `<div class="country-info">${city.country}</div>`;
    }

    async function showRatings() {
        console.log('showRatings called');
        try {
            console.log('Fetching ratings from:', `${API_URL}/api/rankings`);
            const response = await fetch(`${API_URL}/api/rankings`);
            console.log('Response status:', response.status);
            const topCities = await response.json();
            console.log('Received cities:', topCities.length);
            
            // Update modal title for regular ratings
            const modalTitle = document.querySelector('#ratings-modal h2');
            const modalDescription = document.querySelector('#ratings-modal p');
            if (modalTitle) modalTitle.textContent = 'Рейтинг Городов';
            if (modalDescription) modalDescription.textContent = 'Лучшие города по оценкам пользователей:';
            
            ratingsList.innerHTML = '';
            if (topCities.length === 0) {
                ratingsList.innerHTML = '<li>Пока нет оценок городов!</li>';
            } else {
                topCities.forEach((city, index) => {
                    const ratingPercentage = Math.round(city.rating * 100);
                    const li = document.createElement('li');
                    const flag = city.flag || '🏳️';
                    const country = city.country || 'Неизвестно';
                    li.innerHTML = `<strong>${index + 1}.</strong> ${city.name} ${flag} (${country}): ${ratingPercentage}% (❤️ ${city.likes})`;
                    ratingsList.appendChild(li);
                });
            }
            
            console.log('Showing modal');
            ratingsModal.classList.remove('hidden');
        } catch (error) {
            console.error('Error in showRatings:', error);
            ratingsList.innerHTML = '<li>Ошибка загрузки рейтинга</li>';
            ratingsModal.classList.remove('hidden');
        }
    }

    function hideRatings() {
        ratingsModal.classList.add('hidden');
    }

    async function vote(voteType) {
        if (currentCityIndex >= cities.length) return;
        setControlsEnabled(false);
        const city = cities[currentCityIndex];
            try {
            const response = await fetch(`${API_URL}/api/vote`, {
                    method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cityId: city.cityId,
                    voteType: voteType,
                    userId: userId
                })
                });
            if (response.ok) {
                ratedCount++;
                currentCityIndex++;
                showCity();
                setControlsEnabled(true);
            } else {
                const errorData = await response.json();
                console.error('Failed to record vote:', errorData.error);
                setControlsEnabled(true);
            }
        } catch (error) {
            console.error('Error recording vote:', error);
            setControlsEnabled(true);
            }
        }
        
    async function showHiddenJamRatings() {
        console.log('showHiddenJamRatings called');
        try {
            console.log('Fetching hidden jam ratings from:', `${API_URL}/api/hidden-jam-ratings`);
            const response = await fetch(`${API_URL}/api/hidden-jam-ratings`);
            console.log('Response status:', response.status);
            const hiddenJamCities = await response.json();
            console.log('Received hidden jam cities:', hiddenJamCities.length);
            
            // Update modal title for hidden jam ratings
            const modalTitle = document.querySelector('#ratings-modal h2');
            const modalDescription = document.querySelector('#ratings-modal p');
            if (modalTitle) modalTitle.textContent = 'Хидден-Джемовость';
            if (modalDescription) modalDescription.textContent = 'Города с высоким рейтингом, но низкой популярностью:';
            
            ratingsList.innerHTML = '';
            if (hiddenJamCities.length === 0) {
                ratingsList.innerHTML = '<li>Пока нет данных для расчета хидден-джемовости!</li>';
            } else {
                hiddenJamCities.forEach((city, index) => {
                    const li = document.createElement('li');
                    
                    // Use data directly from API response
                    const flag = city.flag || '🏳️';
                    const country = city.country || 'Неизвестно';
                    const hiddenJamScorePercentage = Math.round(city.hiddenJamScore * 100);
                    
                    li.innerHTML = `<strong>${index + 1}.</strong> ${city.name} ${flag} (${country}): ${hiddenJamScorePercentage}% (❤️ ${city.likes})`;
                    ratingsList.appendChild(li);
                });
            }
            
            console.log('Showing modal');
            ratingsModal.classList.remove('hidden');
        } catch (error) {
            console.error('Error in showHiddenJamRatings:', error);
            ratingsList.innerHTML = '<li>Ошибка загрузки рейтинга хидден-джемов</li>';
            ratingsModal.classList.remove('hidden');
        }
    }

    likeBtn.addEventListener('click', () => vote('liked'));
    dislikeBtn.addEventListener('click', () => vote('disliked'));
    dontKnowBtn.addEventListener('click', () => vote('dont_know'));
    showRatingsBtn.addEventListener('click', showRatings);
    showHiddenJamBtn.addEventListener('click', showHiddenJamRatings);
    
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