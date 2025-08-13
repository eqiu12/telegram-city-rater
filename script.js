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

    let mode = 'cities'; // 'cities' | 'airports'
    let cities = [];
    let airports = [];
    let currentIndex = 0;
let votedCount = 0;
let totalCount = 0;

const API_BASE_URL = 'https://telegram-city-rater-backend.onrender.com';

// Optional JWT support
const TOKEN_KEY = 'cityRaterToken';
function getToken() {
    return localStorage.getItem(TOKEN_KEY) || null;
}
function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
}
function authHeaders(base = {}) {
    const t = getToken();
    if (t) {
        return { ...base, 'Authorization': `Bearer ${t}` };
    }
    return base;
}

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
            const response = await fetch(`${API_BASE_URL}/api/cities?userId=${userId}`, {
                headers: authHeaders()
            });
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            cities = data.cities;
            votedCount = data.votedCount;
            totalCount = data.totalCount;

            updateScore();
            loadItem();
        } catch (error) {
            console.error('Error fetching cities:', error);
            cityNameEl.textContent = 'Ошибка';
            countryNameEl.textContent = 'Не удалось загрузить города.';
        }
    }

    function loadItem() {
        if (mode === 'cities') {
            if (currentIndex < cities.length) {
                const city = cities[currentIndex];
                cityNameEl.textContent = city.name;
                countryNameEl.textContent = `${city.country} ${city.flag}`;
            } else {
                cityNameEl.textContent = 'Города закончились';
                countryNameEl.textContent = 'Спасибо за участие!';
                disableVoting();
            }
        } else {
            if (currentIndex < airports.length) {
                const ap = airports[currentIndex];
                cityNameEl.textContent = `${ap.airport_name} (${ap.airport_code})`;
                countryNameEl.textContent = `${ap.airport_city}, ${ap.country} ${ap.flag}`;
            } else {
                cityNameEl.textContent = 'Аэропорты закончились';
                countryNameEl.textContent = 'Спасибо за участие!';
                disableVoting();
            }
        }
    }

    async function vote(voteType) {
        try {
            if (mode === 'cities') {
                if (currentIndex >= cities.length) return;
                const city = cities[currentIndex];
                const response = await fetch(`${API_BASE_URL}/api/vote`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ userId, cityId: city.cityId, voteType }),
                });
                if (response.ok) { votedCount++; updateScore(); }
            } else {
                if (currentIndex >= airports.length) return;
                const ap = airports[currentIndex];
                const response = await fetch(`${API_BASE_URL}/api/airport-vote`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ userId, airportId: ap.airportId, voteType }),
                });
                if (response.ok) { votedCount++; updateScore(); }
            }
            currentIndex++;
            loadItem();
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

    const modeCitiesBtn = document.getElementById('mode-cities');
    const modeAirportsBtn = document.getElementById('mode-airports');
    if (modeCitiesBtn && modeAirportsBtn) {
        modeCitiesBtn.onclick = async () => {
            mode = 'cities'; currentIndex = 0; await fetchCities();
            modeCitiesBtn.classList.add('active'); modeAirportsBtn.classList.remove('active');
        };
        modeAirportsBtn.onclick = async () => {
            mode = 'airports'; currentIndex = 0; await fetchAirports();
            modeAirportsBtn.classList.add('active'); modeCitiesBtn.classList.remove('active');
        };
    }

    async function fetchAirports() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/airports?userId=${userId}`, { headers: authHeaders() });
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            airports = data.airports || [];
            votedCount = data.votedCount;
            totalCount = data.totalCount;
            updateScore();
            loadItem();
        } catch (e) {
            console.error('Error fetching airports:', e);
            cityNameEl.textContent = 'Ошибка';
            countryNameEl.textContent = 'Не удалось загрузить аэропорты.';
        }
    }
    
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
                        if (data.token) setToken(data.token);
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
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ initData, userId })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.user) {
                if (data.token) setToken(data.token);
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
    const scrollToTopBtn = document.getElementById('scroll-to-top-btn');

    // --- Profile Tab State ---
    let profileCities = [];
    let profileLoading = false;
    let profileError = null;
    let showVisitedOnly = false;
    let showRemoveVisited = false;

    // --- Profile Tab Fetch & Merge Logic ---
    async function fetchProfileData() {
        profileLoading = true;
        profileError = null;
        try {
            const [citiesRes, votesRes, ratingsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/all-cities`).then(r => r.json()),
                fetch(`${API_BASE_URL}/api/user-votes/${userId}`).then(r => r.json()),
                fetch(`${API_BASE_URL}/api/rankings`).then(r => r.json()),
            ]);
            const allCities = citiesRes.cities || [];
            const userVotes = (votesRes.userVotes || []);
            const ratingsMap = {};
            (ratingsRes || []).forEach(r => { ratingsMap[r.cityId] = r; });
            const votesMap = {};
            userVotes.forEach(v => { votesMap[v.cityId] = v; });
            profileCities = allCities.map(city => {
                const vote = votesMap[city.cityId];
                const rating = ratingsMap[city.cityId];
                return {
                    ...city,
                    voteType: vote ? vote.voteType : undefined,
                    rating: rating ? rating.rating : null,
                    likes: rating ? rating.likes : 0,
                    dislikes: rating ? rating.dislikes : 0,
                    dont_know: rating ? rating.dont_know : 0,
                };
            });
            profileLoading = false;
        } catch (e) {
            profileError = 'Не удалось загрузить данные';
            profileLoading = false;
        }
    }

    // --- Profile Tab Render ---
    async function renderProfile() {
        userUidEl.textContent = userId;
        copyUidBtn.onclick = () => {
            navigator.clipboard.writeText(userId);
            copyUidBtn.textContent = '\u2705';
            setTimeout(() => { copyUidBtn.textContent = '\ud83d\udccb'; }, 1200);
        };
        await fetchProfileData();
        if (profileLoading) {
            userVotesList.innerHTML = '<div class="placeholder">Загрузка данных...</div>';
            return;
        }
        if (profileError) {
            userVotesList.innerHTML = `<div class="placeholder">${profileError}</div>`;
            return;
        }
        // Group by country
        const grouped = {};
        profileCities.forEach(c => {
            if (!grouped[c.country]) grouped[c.country] = [];
            grouped[c.country].push(c);
        });
        Object.keys(grouped).forEach(country => {
            grouped[country].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        });
        // Visited filter
        const visitedCountries = Object.keys(grouped).filter(country =>
            grouped[country].some(city => city.voteType === 'liked' || city.voteType === 'disliked')
        );
        // Remove visited filter
        const removeVisitedCountries = Object.keys(grouped).filter(country =>
            grouped[country].every(city => city.voteType !== 'liked' && city.voteType !== 'disliked')
        );
        let filteredCountries = Object.keys(grouped);
        if (showVisitedOnly) {
            filteredCountries = visitedCountries;
        } else if (showRemoveVisited) {
            filteredCountries = removeVisitedCountries;
        }
        // Stats
        const visitedCities = profileCities.filter(c => c.voteType === 'liked' || c.voteType === 'disliked').length;
        const totalCities = profileCities.length;
        const totalCountries = Object.keys(grouped).length;
        // Render stats, filter
        let html = '';
        html += `<div class="info-box" id="uid-info-box">
        Ваш UID — это ваш логин для веб-версии бота, доступной по адресу <a href="https://www.ratethis.town/" target="_blank">https://www.ratethis.town/</a>. Дополнительная авторизация не требуется. Веб-сайт удобнее и функциональнее, поэтому мы рекомендуем пользоваться им. Обязательно сохраните свой UID (например, переслав его в чат с ботом или сохранив в «Избранном» в мессенджере). В случае смены устройства, очистки кэша или технического сбоя у вас не будет возможности восстановить UID и историю голосований.
        </div>`;
        html += `<div class=\"profile-stats\">\n`
            + `<div><span class=\"stat-num\">${visitedCities}</span> / <span class=\"stat-num\">${totalCities}</span> городов посещено</div>`
            + `<div><span class=\"stat-num\">${visitedCountries.length}</span> / <span class=\"stat-num\">${totalCountries}</span> стран посещено</div>`
            + `<label class=\"visited-toggle\"><input type=\"checkbox\" id=\"visited-only-toggle\" ${showVisitedOnly ? 'checked' : ''}/> Только посещённые страны</label>`
            + `<label class=\"visited-toggle\"><input type=\"checkbox\" id=\"remove-visited-toggle\" ${showRemoveVisited ? 'checked' : ''}/> Убрать посещенные страны</label>`
            + `</div>`;
        // Emoji legend in a styled box
        html += `<div class=\"legend-box\">\n`
            + `<b>Что означают эмодзи:</b><br>`
            + `❤️ Лайк — город понравился (засчитывается как посещение)<br>`
            + `👎 Дизлайк — город не понравился (засчитывается как посещение)<br>`
            + `🤷‍♂️ Не был(а) — не посещали этот город\n`
            + `</div>`;
        // Render grouped cities with bulk voting buttons
        filteredCountries.sort().forEach(country => {
            const countryCities = grouped[country];
            const flag = countryCities[0]?.flag || '';
            // Determine bulk voting button states
            const hasAnyVote = countryCities.some(city => city.voteType === 'liked' || city.voteType === 'disliked');
            const allDontKnow = countryCities.every(city => city.voteType === 'dont_know' || !city.voteType);
            let bulkBylClass = 'bulk-vote-btn';
            let bulkNeBylClass = 'bulk-vote-btn';
            let bulkBylDisabled = false;
            let bulkNeBylDisabled = false;
            if (hasAnyVote) {
                bulkBylClass += ' active';
                bulkNeBylClass += ' inactive';
                bulkNeBylDisabled = true;
            } else if (allDontKnow) {
                bulkBylClass += ' inactive';
                bulkBylDisabled = true;
                bulkNeBylClass += ' grey';
            } else {
                // No votes at all
                bulkBylClass += ' inactive';
                bulkBylDisabled = true;
                bulkNeBylClass += ' grey';
            }
            // If user just clicked 'Не был', make it red
            if (allDontKnow && countryCities.some(city => city.voteType === 'dont_know')) {
                bulkNeBylClass = 'bulk-vote-btn red';
            }
            html += `<div class=\"profile-country\"><b>${flag} ${country}</b></div>`;
            html += `<div class=\"bulk-vote-group\">`
                + `<button class=\"${bulkBylClass}\" data-country=\"${country}\" data-vote=\"liked\" ${bulkBylDisabled ? 'disabled' : ''}>Был</button>`
                + `<button class=\"${bulkNeBylClass}\" data-country=\"${country}\" data-vote=\"dont_know\" ${bulkNeBylDisabled ? 'disabled' : ''}>Не был</button>`
            + `</div>`;
            html += '<ul style=\"margin-top:0;\">';
            countryCities.forEach(city => {
                // Emoji voting buttons
                let likeClass = 'city-emoji-btn';
                let dislikeClass = 'city-emoji-btn';
                let dontKnowClass = 'city-emoji-btn';
                if (!city.voteType) {
                    likeClass += ' grey';
                    dislikeClass += ' grey';
                    dontKnowClass += ' grey';
                } else {
                    if (city.voteType === 'liked') likeClass += ' active-like'; else likeClass += ' grey';
                    if (city.voteType === 'disliked') dislikeClass += ' active-dislike'; else dislikeClass += ' grey';
                    if (city.voteType === 'dont_know') dontKnowClass += ' active-dontknow'; else dontKnowClass += ' grey';
                }
                html += `<li><span class='city-name'>${city.name}</span>`
                    + `<button class='${likeClass}' data-cityid='${city.cityId}' data-vote='liked' title='Лайк'>❤️</button>`
                    + `<button class='${dislikeClass}' data-cityid='${city.cityId}' data-vote='disliked' title='Дизлайк'>👎</button>`
                    + `<button class='${dontKnowClass}' data-cityid='${city.cityId}' data-vote='dont_know' title='Не знаю'>🤷‍♂️</button>`
                    + `</li>`;
            });
            html += '</ul>';
        });
        userVotesList.innerHTML = html;
        // Toggle handler
        const visitedToggle = document.getElementById('visited-only-toggle');
        if (visitedToggle) {
            visitedToggle.onchange = () => {
                showVisitedOnly = visitedToggle.checked;
                showRemoveVisited = false;
                renderProfile();
            };
        }
        const removeVisitedToggle = document.getElementById('remove-visited-toggle');
        if (removeVisitedToggle) {
            removeVisitedToggle.onchange = () => {
                showRemoveVisited = removeVisitedToggle.checked;
                showVisitedOnly = false;
                renderProfile();
            };
        }
        // Edit handlers
        document.querySelectorAll('.city-emoji-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const cityId = this.getAttribute('data-cityid');
                const voteType = this.getAttribute('data-vote');
                try {
                    await changeVote(Number(cityId), voteType);
                    await renderProfile();
                } catch (e) {
                    alert('Не удалось изменить голос: ' + (e.message || e));
                }
            });
        });
        // Bulk voting handlers (switch to batch endpoint)
        document.querySelectorAll('.bulk-vote-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const country = this.getAttribute('data-country');
                const voteType = this.getAttribute('data-vote');
                const countryCities = grouped[country];
                const targetIds = [];
                if (voteType === 'liked') {
                    // Only allow if at least one city is liked/disliked
                    if (!countryCities.some(city => city.voteType === 'liked' || city.voteType === 'disliked')) return;
                    countryCities.forEach(c => { if (c.voteType !== 'liked') targetIds.push(c.cityId); });
                } else if (voteType === 'dont_know') {
                    countryCities.forEach(c => { if (c.voteType !== 'dont_know') targetIds.push(c.cityId); });
                } else if (voteType === 'disliked') {
                    countryCities.forEach(c => { if (c.voteType !== 'disliked') targetIds.push(c.cityId); });
                }
                if (targetIds.length === 0) { return; }
                try {
                    const res = await fetch(`${API_BASE_URL}/api/bulk-change-vote`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ userId, voteType, cityIds: targetIds.map(Number) })
                    });
                    if (!res.ok) throw new Error('Ошибка пакетного голосования');
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || 'Ошибка пакетного голосования');
                    await renderProfile();
                } catch (e) {
                    alert('Не удалось применить пакетное голосование: ' + (e.message || e));
                }
            });
        });
    }

    // Меняет голос через сервер
async function changeVote(cityId, newVote) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/change-vote`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ userId, cityId, voteType: newVote })
        });
        if (!res.ok) throw new Error('Ошибка смены голоса');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Ошибка смены голоса');
    } catch (e) {
        alert('Не удалось изменить голос: ' + (e.message || e));
    }
}

    // Scroll-to-top button logic for Profile tab
    function handleProfileScroll() {
        // Attach scroll event to the main container
        const container = document.querySelector('.container');
        if (!container) return;
        // Remove previous scroll event if any
        if (container._profileScrollHandler) {
            container.removeEventListener('scroll', container._profileScrollHandler);
        }
        function checkScroll() {
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight - container.clientHeight;
            if (scrollHeight > 0 && scrollTop / scrollHeight > 0.05) {
                scrollToTopBtn.style.display = 'block';
            } else {
                scrollToTopBtn.style.display = 'none';
            }
        }
        container._profileScrollHandler = checkScroll;
        container.addEventListener('scroll', checkScroll);
        checkScroll();
        scrollToTopBtn.onclick = () => {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }

    // Tab switching logic (ensure these functions and listeners are present)
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
        setTimeout(() => {
            handleProfileScroll();
        }, 100);
    }
    tabVoting.addEventListener('click', showVotingPage);
    tabProfile.addEventListener('click', showProfilePage);
});
