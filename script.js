document.addEventListener('DOMContentLoaded', () => {
    const cityNameEl = document.getElementById('cityName');
    const countryNameEl = document.getElementById('countryName');
    const likeBtn = document.getElementById('like-btn');
    const dislikeBtn = document.getElementById('dislike-btn');
    const dontKnowBtn = document.getElementById('dont-know-btn');
    const showRatingsBtn = document.getElementById('show-ratings-btn');
    const showHiddenGemsBtn = document.getElementById('show-hidden-gems-btn');
    const ratingsModal = document.getElementById('ratings-modal');
    const closeModalBtn = document.querySelector('.close-btn');
    const ratingsContentEl = document.getElementById('ratings-content');
    const modalTitleEl = document.getElementById('modal-title');
    const closeRatingsBtn = document.getElementById('close-ratings-btn');
    const votedCountEl = document.getElementById('voted-count');
    const totalCountEl = document.getElementById('total-count');
    const rankingsBody = document.getElementById('rankings-body');
    const hiddenJamBody = document.getElementById('hidden-jam-body');

    let cities = [];
let currentCityIndex = 0;
let votedCount = 0;
let totalCount = 0;

const API_BASE_URL = 'https://telegram-city-rater-backend.onrender.com';

function getUserId() {
    let id = localStorage.getItem('cityRaterUserId');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('cityRaterUserId', id);
    }
    return id;
}

let userId = getUserId();

    function updateScore() {
        votedCountEl.textContent = votedCount;
        totalCountEl.textContent = totalCount;
    }

    async function fetchCities() {
        if (!userId) {
            console.error('User ID is not set.');
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/cities?userId=${userId}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            cities = data.cities;
            votedCount = data.votedCount;
            totalCount = data.totalCount;

            updateScore();
            loadCity();
        } catch (error) {
            console.error('Error fetching cities:', error);
            cityNameEl.textContent = 'Ошибка';
            countryNameEl.textContent = 'Не удалось загрузить города.';
        }
    }

    function loadCity() {
        if (currentCityIndex < cities.length) {
            const city = cities[currentCityIndex];
            cityNameEl.textContent = city.name;
            countryNameEl.textContent = `${city.country} ${city.flag}`;
        } else {
            cityNameEl.textContent = 'Города закончились';
            countryNameEl.textContent = 'Спасибо за участие!';
            disableVoting();
        }
    }

    async function vote(voteType) {
        if (currentCityIndex >= cities.length) return;

        const city = cities[currentCityIndex];
        try {
            const response = await fetch(`${API_BASE_URL}/api/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, cityId: city.cityId, voteType }),
            });

            if (response.ok) {
                votedCount++;
                updateScore();
            } else {
                console.error("Failed to record vote:", await response.text());
            }

            currentCityIndex++;
            loadCity();
        } catch (error) {
            console.error('Error sending vote:', error);
        }
    }

    function disableVoting() {
        likeBtn.disabled = true;
        dislikeBtn.disabled = true;
        dontKnowBtn.disabled = true;
    }

    async function showRatings(type) {
        const endpoint = type === 'gems' ? 'hidden-jam-ratings' : 'rankings';
        const isGems = type === 'gems';
        modalTitleEl.textContent = isGems ? 'Хидден-джемовость' : 'Рейтинг Городов';

        try {
            const response = await fetch(`${API_BASE_URL}/api/${endpoint}`);
            const data = await response.json();
            
            ratingsContentEl.innerHTML = '';
            const table = document.createElement('table');
            const tableHeader = isGems ? 'Хидден-джемовость' : 'Рейтинг';
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Место</th>
                        <th>Город</th>
                        <th>${tableHeader}</th>
                        <th>❤️</th>
                        <th>👎</th>
                        <th>🤷‍♂️</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector('tbody');
            data.forEach((city, index) => {
                const score = isGems 
                    ? (city.hiddenJamScore * 100).toFixed(0) + '%' 
                    : (city.rating * 100).toFixed(0) + '%';
                
                tbody.innerHTML += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${city.flag} ${city.name}, ${city.country}</td>
                        <td>${score}</td>
                        <td>${city.likes}</td>
                        <td>${city.dislikes}</td>
                        <td>${city.dont_know}</td>
                    </tr>
                `;
            });
            ratingsContentEl.appendChild(table);
            ratingsModal.style.display = 'flex';
        } catch (error) {
            console.error(`Error fetching ${endpoint}:`, error);
        }
    }

    likeBtn.addEventListener('click', () => vote('liked'));
    dislikeBtn.addEventListener('click', () => vote('disliked'));
    dontKnowBtn.addEventListener('click', () => vote('dont_know'));

    showRatingsBtn.addEventListener('click', () => showRatings('ratings'));
    showHiddenGemsBtn.addEventListener('click', () => showRatings('gems'));
    
    const closeModal = () => {
        ratingsModal.style.display = 'none';
    };
    
    closeModalBtn.addEventListener('click', closeModal);
    closeRatingsBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (event) => {
        if (event.target === ratingsModal) {
            closeModal();
        }
    });

    userId = getUserId();

    // --- Secure Telegram Mini App User Registration with Restoration ---
    function initializeUser() {
        // Check if we're in Telegram environment and get secure initData
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
            const initData = window.Telegram.WebApp.initData;
            
            if (initData && initData.trim() !== '') {
                console.log('🔐 Secure initData found, checking for existing user...');
                
                // First, check if this Telegram user already exists (for restoration)
                fetch(`${API_BASE_URL}/api/get-user-by-telegram`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        if (data.found && data.user && data.user.user_id) {
                            // User exists - restore their UUID
                            const restoredUserId = data.user.user_id;
                            const currentUserId = localStorage.getItem('cityRaterUserId');
                            
                            if (currentUserId !== restoredUserId) {
                                console.log(`🔄 Restoring user account: ${currentUserId || 'new device'} -> ${restoredUserId}`);
                                userId = restoredUserId;
                                localStorage.setItem('cityRaterUserId', userId);
                                console.log('👋 Welcome back! Your account has been restored.');
                            } else {
                                console.log('✅ User already has correct UUID, no restoration needed.');
                            }
                            fetchCities();
                        } else {
                            // New Telegram user - register them
                            console.log('👤 New Telegram user detected, registering...');
                            registerNewTelegramUser(initData);
                        }
                    } else {
                        console.error('❌ Failed to check existing user:', data.error);
                        fallbackToLocalMode();
                    }
                })
                .catch(err => {
                    console.error('❌ Error checking existing user:', err);
                    fallbackToLocalMode();
                });
            } else {
                console.warn('⚠️ Empty initData. Running in web browser or test environment.');
                fallbackToLocalMode();
            }
        } else {
            console.warn('⚠️ Not running inside Telegram. Using local UUID only.');
            fallbackToLocalMode();
        }
    }

    function registerNewTelegramUser(initData) {
        fetch(`${API_BASE_URL}/api/register-telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData, userId })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.user) {
                if (data.user.user_id) {
                    // Use the user_id from the database (could be existing UUID or new one)
                    userId = data.user.user_id;
                    localStorage.setItem('cityRaterUserId', userId);
                    
                    if (data.isExistingUser) {
                        console.log('👋 Welcome back! Existing user found:', data.user);
                    } else if (data.isLinked) {
                        console.log('🔗 Your UUID has been linked to your Telegram account!');
                    } else if (data.isNewUser) {
                        console.log('🆕 New Telegram user registered:', data.user);
                    }
                } else {
                    console.warn('⚠️ User registered but no user_id received. Using current UUID.');
                }
            } else {
                console.error('❌ Failed to register Telegram user:', data.error);
            }
            fetchCities();
        })
        .catch(err => {
            console.error('❌ Error registering Telegram user:', err);
            fallbackToLocalMode();
        });
    }

    function fallbackToLocalMode() {
        console.log('📱 Using local UUID mode.');
        fetchCities();
    }

    // Start the initialization process
    initializeUser();

    // --- Profile & Tabs ---
    const votingPage = document.getElementById('voting-page');
    const profilePage = document.getElementById('profile-page');
    const tabVoting = document.getElementById('tab-voting');
    const tabProfile = document.getElementById('tab-profile');
    const userUidEl = document.getElementById('user-uid');
    const copyUidBtn = document.getElementById('copy-uid-btn');
    const userVotesList = document.getElementById('user-votes-list');

    // Переключение вкладок
    function showVotingPage() {
        votingPage.style.display = '';
        profilePage.style.display = 'none';
        tabVoting.classList.add('active');
        tabProfile.classList.remove('active');
    }
    function showProfilePage() {
        votingPage.style.display = 'none';
        profilePage.style.display = '';
        tabVoting.classList.remove('active');
        tabProfile.classList.add('active');
        renderProfile();
    }
    tabVoting.addEventListener('click', showVotingPage);
    tabProfile.addEventListener('click', showProfilePage);

    // Загрузка реальных голосов пользователя
async function fetchUserVotes() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/user-votes/${userId}`);
        if (!res.ok) throw new Error('Ошибка загрузки голосов');
        const data = await res.json();
        return data.userVotes || [];
    } catch (e) {
        console.error(e);
        return [];
    }
}

    // Группировка по странам
    function groupVotesByCountry(votes) {
        const grouped = {};
        for (const v of votes) {
            if (!grouped[v.country]) grouped[v.country] = { flag: v.flag, cities: [] };
            grouped[v.country].cities.push(v);
        }
        // Возвращаем массив стран, отсортированных по алфавиту
        return Object.entries(grouped)
            .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
            .map(([country, data]) => ({ country, ...data }));
    }

    async function renderProfile() {
        // Always show the latest userId in the profile tab
        userUidEl.textContent = userId;
        copyUidBtn.onclick = () => {
            navigator.clipboard.writeText(userId);
            copyUidBtn.textContent = '✅';
            setTimeout(() => { copyUidBtn.textContent = '📋'; }, 1200);
        };
        const votes = await fetchUserVotes();
        const grouped = groupVotesByCountry(votes);
        let html = '';
        for (const group of grouped) {
            const { country, flag, cities } = group;
            html += `<div><b>${flag} ${country}</b></div><ul style="margin-top:0;">`;
            for (const city of cities) {
                const emoji = city.voteType === 'liked' ? '❤️' : city.voteType === 'disliked' ? '👎' : '🤷‍♂️';
                html += `<li>${city.name} <span class="city-vote">${emoji}</span> <button class="change-vote-btn" data-cityid="${city.cityId}" data-country="${country}" title="Изменить голос">✏️</button></li>`;
            }
            html += '</ul>';
        }
        userVotesList.innerHTML = html || '<div>Вы ещё не проголосовали ни за один город.</div>';

        // Добавляем обработчики на кнопки "Изменить"
        document.querySelectorAll('.change-vote-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const cityId = this.getAttribute('data-cityid');
                const country = this.getAttribute('data-country');
                showVoteSelector(this, country, cityId);
            });
        });
    }

    // Показывает мини-меню для выбора голоса
    function showVoteSelector(button, country, cityId) {
        document.querySelectorAll('.vote-selector').forEach(el => el.remove());
        const selector = document.createElement('span');
        selector.className = 'vote-selector';
        selector.innerHTML = `
            <button class="vote-option" data-vote="liked">❤️</button>
            <button class="vote-option" data-vote="disliked">👎</button>
            <button class="vote-option" data-vote="dont_know">🤷‍♂️</button>
        `;
        button.parentNode.insertBefore(selector, button.nextSibling);
        selector.querySelectorAll('.vote-option').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newVote = opt.getAttribute('data-vote');
                await changeVote(cityId, newVote);
                selector.remove();
                renderProfile();
            });
        });
        setTimeout(() => {
            document.addEventListener('click', closeSelector, { once: true });
        }, 0);
        function closeSelector(e) {
            if (!selector.contains(e.target)) selector.remove();
        }
    }

    // Меняет голос через сервер
async function changeVote(cityId, newVote) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/change-vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, cityId, voteType: newVote })
        });
        if (!res.ok) throw new Error('Ошибка смены голоса');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Ошибка смены голоса');
    } catch (e) {
        alert('Не удалось изменить голос: ' + (e.message || e));
    }
}
});
