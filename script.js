document.addEventListener('DOMContentLoaded', function() {
    // Инициализация Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        console.log('Telegram WebApp initialized');
    }

    // Автоматически определяем API URL в зависимости от окружения
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://telegram-city-rater-backend.onrender.com';
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
    const statsTextEl = document.getElementById('stats-text');

    // Получаем userId из Telegram WebApp API
    // Если приложение запущено в Telegram, получаем реальный ID пользователя
    // Если запущено локально или вне Telegram, используем fallback
    let userId;
    
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
        // Получаем реальный ID пользователя из Telegram
        userId = window.Telegram.WebApp.initDataUnsafe.user.id.toString();
        console.log('Telegram user ID:', userId);
    } else {
        // Fallback для локального тестирования или если приложение запущено вне Telegram
        userId = 'local_user_' + Math.random().toString(36).substr(2, 9);
        console.log('Using local user ID for testing:', userId);
    }

    function setControlsEnabled(enabled) {
        likeBtn.disabled = !enabled;
        dislikeBtn.disabled = !enabled;
        dontKnowBtn.disabled = !enabled;
    }

    // Функция для обновления статистики пользователя
    async function updateUserStats() {
        try {
            const response = await fetch(`${API_URL}/api/user-votes/${userId}`);
            if (response.ok) {
                const data = await response.json();
                const votedCount = data.votedCities ? data.votedCities.length : 0;
                
                // Получаем общее количество городов из cities.json
                const citiesResponse = await fetch('cities.json');
                if (citiesResponse.ok) {
                    const allCities = await citiesResponse.json();
                    const totalCities = allCities.length;
                    const remainingCities = totalCities - votedCount;
                    
                    statsTextEl.textContent = `Оценено городов: ${votedCount} из ${totalCities} (осталось: ${remainingCities})`;
                } else {
                    statsTextEl.textContent = `Оценено городов: ${votedCount}`;
                }
            } else {
                statsTextEl.textContent = 'Статистика недоступна';
            }
        } catch (error) {
            console.warn('Failed to update user stats:', error);
            statsTextEl.textContent = 'Статистика недоступна';
        }
    }

    async function loadCities() {
        try {
            const response = await fetch('cities.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const cityData = await response.json();
            if (!cityData || cityData.length === 0) throw new Error("City data is empty or invalid.");

            // Получаем список уже оцененных пользователем городов
            let userVotedCities = [];
            try {
                const userVotesResponse = await fetch(`${API_URL}/api/user-votes/${userId}`);
                if (userVotesResponse.ok) {
                    const userVotesData = await userVotesResponse.json();
                    userVotedCities = userVotesData.votedCities || [];
                    console.log('User has already voted for cities:', userVotedCities.length);
                }
            } catch (error) {
                console.warn('Failed to load user votes, continuing with all cities:', error);
            }

            // Фильтруем города, за которые пользователь уже проголосовал
            const availableCities = cityData.filter(city => !userVotedCities.includes(city.cityId));
            
            if (availableCities.length === 0) {
                // Если все города уже оценены
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

            cities = availableCities.map(city => ({ 
                name: city.name, 
                flag: city.flag || '🏳️', // Use flag if available, otherwise default flag
                country: city.country || 'Неизвестно',
                cityId: city.cityId
            }));
            cities.sort(() => Math.random() - 0.5); // Shuffle cities
            
            console.log(`Loaded ${cities.length} cities for voting (${userVotedCities.length} already voted)`);
            
            // Обновляем статистику пользователя
            await updateUserStats();
            
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
                
                // Обновляем статистику после успешного голоса
                await updateUserStats();
                
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