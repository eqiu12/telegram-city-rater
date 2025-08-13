document.addEventListener('DOMContentLoaded', () => {
    // Main app elements
    const mainApp = document.getElementById('main-app');

    // Main app elements
    const cityNameEl = document.getElementById('cityName');
    const airportCodeEl = document.getElementById('airportCode');
    const airportNameEl = document.getElementById('airportName');
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
    return localStorage.getItem('cityRaterUserId') || null;
}

function setUserId(id) {
    localStorage.setItem('cityRaterUserId', id);
}

function generateNewUserId() {
    return crypto.randomUUID();
}

function clearUserData() {
    localStorage.removeItem('cityRaterUserId');
    localStorage.removeItem(TOKEN_KEY);
}

let userId = getUserId();

function showMainApp() {
    mainApp.style.display = 'block';
    initializeApp();
}

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
            // Hide airport elements, show city name
            cityNameEl.style.display = 'block';
            airportCodeEl.style.display = 'none';
            airportNameEl.style.display = 'none';
            
            if (currentIndex < cities.length) {
                const city = cities[currentIndex];
                cityNameEl.textContent = city.name;
                countryNameEl.textContent = `${city.country} ${city.flag}`;
                enableVoting();
            } else {
                cityNameEl.textContent = 'Города закончились';
                countryNameEl.textContent = 'Спасибо за участие!';
                disableVoting();
            }
        } else {
            // Hide city name, show airport elements
            cityNameEl.style.display = 'none';
            airportCodeEl.style.display = 'block';
            airportNameEl.style.display = 'block';
            
            if (currentIndex < airports.length) {
                const ap = airports[currentIndex];
                airportCodeEl.textContent = ap.airport_code;
                airportNameEl.textContent = ap.airport_name;
                countryNameEl.textContent = `${ap.airport_city}, ${ap.country} ${ap.flag}`;
                enableVoting();
            } else {
                cityNameEl.style.display = 'block';
                airportCodeEl.style.display = 'none';
                airportNameEl.style.display = 'none';
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

    function enableVoting() {
        likeBtn.disabled = false;
        dislikeBtn.disabled = false;
        dontKnowBtn.disabled = false;
    }

    async function showRatings(type) {
        let endpoint, title, tableHeader, locationColumn;
        
        if (type === 'gems') {
            endpoint = 'hidden-jam-ratings';
            title = 'Хидден-джемовость';
            tableHeader = 'Хидден-джемовость';
            locationColumn = 'Город';
        } else if (type === 'airport-rankings') {
            endpoint = 'airport-rankings';
            title = 'Рейтинг Аэропортов';
            tableHeader = 'Рейтинг';
            locationColumn = 'Аэропорт';
        } else {
            endpoint = 'rankings';
            title = 'Рейтинг Городов';
            tableHeader = 'Рейтинг';
            locationColumn = 'Город';
        }
        
        modalTitleEl.textContent = title;

        try {
            const response = await fetch(`${API_BASE_URL}/api/${endpoint}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                throw new Error('Invalid data format received');
            }
            
            ratingsContentEl.innerHTML = '';
            const table = document.createElement('table');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Место</th>
                        <th>${locationColumn}</th>
                        <th>${tableHeader}</th>
                        <th>❤️</th>
                        <th>👎</th>
                        <th>🤷‍♂️</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector('tbody');
            data.forEach((item, index) => {
                const score = type === 'gems' 
                    ? (item.hiddenJamScore * 100).toFixed(0) + '%' 
                    : (item.rating * 100).toFixed(0) + '%';
                
                let locationDisplay;
                if (type === 'airport-rankings') {
                    locationDisplay = `${item.flag} ${item.airport_code}, ${item.airport_city}`;
                } else {
                    locationDisplay = `${item.flag} ${item.name}, ${item.country}`;
                }
                
                tbody.innerHTML += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${locationDisplay}</td>
                        <td>${score}</td>
                        <td>${item.likes}</td>
                        <td>${item.dislikes}</td>
                        <td>${item.dont_know}</td>
                    </tr>
                `;
            });
            ratingsContentEl.appendChild(table);
            ratingsModal.style.display = 'flex';
        } catch (error) {
            console.error(`Error fetching ${endpoint}:`, error);
            ratingsContentEl.innerHTML = `<div style="padding: 20px; text-align: center;">
                <p>Ошибка загрузки данных: ${error.message}</p>
                <p style="font-size: 14px; color: #666;">
                    ${type === 'airport-rankings' ? 'Рейтинг аэропортов временно недоступен. Попробуйте позже.' : ''}
                </p>
            </div>`;
            ratingsModal.style.display = 'flex';
        }
    }

    likeBtn.addEventListener('click', () => vote('liked'));
    dislikeBtn.addEventListener('click', () => vote('disliked'));
    dontKnowBtn.addEventListener('click', () => vote('dont_know'));

    showRatingsBtn.addEventListener('click', () => showRatings('ratings'));
    showHiddenGemsBtn.addEventListener('click', () => showRatings('gems'));
    
    const showAirportRatingsBtn = document.getElementById('show-airport-ratings-btn');
    if (showAirportRatingsBtn) {
        showAirportRatingsBtn.addEventListener('click', () => showRatings('airport-rankings'));
    }

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
        // Also fetch profile data so Profile tab works in web mode
        fetchCities();
    }


    // Initialize app function
    function initializeApp() {
        initializeUser();
    }

    // Always show main app (no login required)
    showMainApp();

    // --- Profile & Navigation ---
    const votingPage = document.getElementById('voting-page');
    const profilePage = document.getElementById('profile-page');
    const profileIconBtn = document.getElementById('profile-icon-btn');
    const backBtn = document.getElementById('back-btn');
    const userUidEl = document.getElementById('user-uid');
    const copyUidBtn = document.getElementById('copy-uid-btn');
    const userVotesList = document.getElementById('user-votes-list');
    const scrollToTopBtn = document.getElementById('scroll-to-top-btn');

    // --- Profile Tab State ---
    let profileCities = [];
    let profileAirports = [];
    let profileLoading = false;
    let profileError = null;
    let showVisitedOnly = false;
    let showRemoveVisited = false;

    // --- Profile Tab Fetch & Merge Logic ---
    async function fetchProfileData() {
        profileLoading = true;
        profileError = null;
        try {
            // If inside Telegram, use optimized endpoint to avoid multi-fetch issues
            let useOptimized = false;
            try { useOptimized = Boolean(window.Telegram?.WebApp?.initData); } catch (_) {}
            if (useOptimized) {
                const timestamp = Date.now();
                const res = await fetch(`${API_BASE_URL}/api/profile/${userId}?t=${timestamp}`, { headers: authHeaders(), cache: 'no-store' });
                if (!res.ok) throw new Error('profile endpoint failed');
                const data = await res.json();
                profileCities = data.profileCities || [];
                profileAirports = data.profileAirports || [];
            } else {
                const timestamp = Date.now();
                const [citiesRes, votesRes, ratingsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/all-cities?t=${timestamp}`, { headers: authHeaders(), cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('all-cities failed'); return r.json(); }),
                    fetch(`${API_BASE_URL}/api/user-votes/${userId}?t=${timestamp}`, { headers: authHeaders(), cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('user-votes failed'); return r.json(); }),
                    fetch(`${API_BASE_URL}/api/rankings?t=${timestamp}`, { headers: authHeaders(), cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('rankings failed'); return r.json(); }),
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
                // Airports for web path  
                const [allApRes, userApVotesRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/all-airports?t=${timestamp}`, { headers: authHeaders(), cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('all-airports failed'); return r.json(); }),
                    fetch(`${API_BASE_URL}/api/user-airport-votes/${userId}?t=${timestamp}`, { headers: authHeaders(), cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('user-airport-votes failed'); return r.json(); }),
                ]);
                const allAirports = allApRes.airports || [];
                const apVotesMap = {};
                (userApVotesRes.userVotes || []).forEach(v => { apVotesMap[v.airportId] = v.voteType; });
                profileAirports = allAirports.map(ap => ({ ...ap, voteType: apVotesMap[ap.airportId] }));
            }
            profileLoading = false;
        } catch (e) {
            profileError = 'Не удалось загрузить данные';
            console.error('profile fetch failed:', e);
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
        // Group cities by country
        const grouped = {};
        profileCities.forEach(c => { if (!grouped[c.country]) grouped[c.country] = []; grouped[c.country].push(c); });
        // Group airports by country
        const groupedAir = {};
        profileAirports.forEach(a => { if (!groupedAir[a.country]) groupedAir[a.country] = []; groupedAir[a.country].push(a); });
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
        const visitedAirports = profileAirports.filter(a => a.voteType === 'liked' || a.voteType === 'disliked').length;
        const totalAirports = profileAirports.length;
        // Render stats, filter
        let html = '';
        html += `<div class="info-box" id="uid-info-box">
        Ваш UID — это ваш логин для веб-версии бота, доступной по адресу <a href="https://www.ratethis.town/" target="_blank">https://www.ratethis.town/</a>. Дополнительная авторизация не требуется. Веб-сайт удобнее и функциональнее, поэтому мы рекомендуем пользоваться им. Обязательно сохраните свой UID (например, переслав его в чат с ботом или сохранив в «Избранном» в мессенджере). В случае смены устройства, очистки кэша или технического сбоя у вас не будет возможности восстановить UID и историю голосований.
        </div>`;
        html += `<div class=\"profile-stats\">\n`
            + `<div><span class=\"stat-num\">${visitedCities}</span> / <span class=\"stat-num\">${totalCities}</span> городов посещено</div>`
            + `<div><span class=\"stat-num\">${visitedCountries.length}</span> / <span class=\"stat-num\">${totalCountries}</span> стран посещено</div>`
            + `<div><span class=\"stat-num\">${visitedAirports}</span> / <span class=\"stat-num\">${totalAirports}</span> аэропортов посещено</div>`
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
            const allLiked = countryCities.every(city => city.voteType === 'liked');
            let bulkBylClass = 'bulk-vote-btn';
            let bulkNeBylClass = 'bulk-vote-btn';
            let bulkBylDisabled = false;
            let bulkNeBylDisabled = false;
            if (hasAnyVote) {
                if (allLiked) {
                    // All cities are already liked - disable "Был" button
                    bulkBylClass += ' active';
                    bulkBylDisabled = true;
                } else {
                    // Some cities have votes but not all are liked - allow "Был"
                    bulkBylClass += ' active';
                }
                bulkNeBylClass += ' grey';
                bulkNeBylDisabled = false; // allow overriding to 'Не был'
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
            // If user just clicked 'Не был', make it red and disable it
            if (allDontKnow && countryCities.some(city => city.voteType === 'dont_know')) {
                bulkNeBylClass = 'bulk-vote-btn red';
                bulkNeBylDisabled = true;
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
            // Airports for this country
            const countryAirports = groupedAir[country] || [];
            if (countryAirports.length > 0) {
                // Determine airport bulk voting button states (same logic as cities)
                const hasAnyAirportVote = countryAirports.some(ap => ap.voteType === 'liked' || ap.voteType === 'disliked');
                const allAirportsDontKnow = countryAirports.every(ap => ap.voteType === 'dont_know' || !ap.voteType);
                const allAirportsLiked = countryAirports.every(ap => ap.voteType === 'liked');
                let airportBulkBylClass = 'bulk-vote-btn';
                let airportBulkNeBylClass = 'bulk-vote-btn';
                let airportBulkBylDisabled = false;
                let airportBulkNeBylDisabled = false;
                
                if (hasAnyAirportVote) {
                    if (allAirportsLiked) {
                        // All airports are already liked - disable "Был" button
                        airportBulkBylClass += ' active';
                        airportBulkBylDisabled = true;
                    } else {
                        // Some airports have votes but not all are liked - allow "Был"
                        airportBulkBylClass += ' active';
                    }
                    airportBulkNeBylClass += ' grey';
                    airportBulkNeBylDisabled = false; // allow overriding to 'Не был'
                } else if (allAirportsDontKnow) {
                    airportBulkBylClass += ' inactive';
                    airportBulkBylDisabled = true;
                    airportBulkNeBylClass += ' grey';
                } else {
                    // No votes at all
                    airportBulkBylClass += ' inactive';
                    airportBulkBylDisabled = true;
                    airportBulkNeBylClass += ' grey';
                    // airportBulkNeBylDisabled remains false - "Не был" should be clickable when no votes
                }
                // If user just clicked 'Не был', make it red and disable it
                if (allAirportsDontKnow && countryAirports.some(ap => ap.voteType === 'dont_know')) {
                    airportBulkNeBylClass = 'bulk-vote-btn red';
                    airportBulkNeBylDisabled = true;
                }
                
                html += `<div class=\"profile-country-sub\"><b>Аэропорты</b></div>`;
                html += `<div class=\"bulk-vote-group\">`
                    + `<button class=\"${airportBulkBylClass}\" data-country-air=\"${country}\" data-vote=\"liked\" ${airportBulkBylDisabled ? 'disabled' : ''}>Был</button>`
                    + `<button class=\"${airportBulkNeBylClass}\" data-country-air=\"${country}\" data-vote=\"dont_know\" ${airportBulkNeBylDisabled ? 'disabled' : ''}>Не был</button>`
                + `</div>`;
                html += '<ul style=\"margin-top:0;\">';
                countryAirports.forEach(ap => {
                    let likeClass = 'airport-emoji-btn';
                    let dislikeClass = 'airport-emoji-btn';
                    let dontKnowClass = 'airport-emoji-btn';
                    if (!ap.voteType) {
                        likeClass += ' grey';
                        dislikeClass += ' grey';
                        dontKnowClass += ' grey';
                    } else {
                        if (ap.voteType === 'liked') likeClass += ' active-like'; else likeClass += ' grey';
                        if (ap.voteType === 'disliked') dislikeClass += ' active-dislike'; else dislikeClass += ' grey';
                        if (ap.voteType === 'dont_know') dontKnowClass += ' active-dontknow'; else dontKnowClass += ' grey';
                    }
                    const apLabel = `${ap.airport_code}, ${ap.airport_city}`;
                    html += `<li><span class='city-name'>${apLabel}</span>`
                        + `<button class='${likeClass}' data-airportid='${ap.airportId}' data-vote='liked' title='Лайк'>❤️</button>`
                        + `<button class='${dislikeClass}' data-airportid='${ap.airportId}' data-vote='disliked' title='Дизлайк'>👎</button>`
                        + `<button class='${dontKnowClass}' data-airportid='${ap.airportId}' data-vote='dont_know' title='Не знаю'>🤷‍♂️</button>`
                        + `</li>`;
                });
                html += '</ul>';
            }
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
        // Handlers moved to a single delegated listener below for robustness
    }

    // Меняет голос через сервер
async function changeVote(cityId, newVote) {
    try {
        // Use the fixed change-vote API directly - it handles both new votes and changes
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
        throw e;
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

    // Navigation logic
    function showVotingPage() {
        votingPage.style.display = '';
        profilePage.style.display = 'none';
    }
    function showProfilePage() {
        votingPage.style.display = 'none';
        profilePage.style.display = '';
        renderProfile();
        setTimeout(() => {
            handleProfileScroll();
        }, 100);
    }
    
    // Event listeners for navigation
    if (profileIconBtn) {
        profileIconBtn.addEventListener('click', showProfilePage);
    }
    if (backBtn) {
        backBtn.addEventListener('click', showVotingPage);
    }

    // Delegated click handlers for Profile actions (stable across re-renders)
    if (userVotesList) {
        userVotesList.addEventListener('click', async (ev) => {
            let targetEl = ev.target;
            if (targetEl && targetEl.nodeType !== 1) {
                targetEl = targetEl.parentElement;
            }
            const emojiBtn = targetEl && targetEl.closest ? targetEl.closest('.city-emoji-btn') : null;
            if (emojiBtn) {
                console.log('profile: emoji click', {
                    cityId: emojiBtn.getAttribute('data-cityid'),
                    voteType: emojiBtn.getAttribute('data-vote')
                });
                const cityId = emojiBtn.getAttribute('data-cityid');
                const voteType = emojiBtn.getAttribute('data-vote');
                if (!cityId || !voteType) return;
                try {
                    await changeVote(cityId, voteType);
                    await renderProfile();
                } catch (e) {
                    alert('Не удалось изменить голос: ' + (e.message || e));
                }
                return;
            }
            const bulkBtn = targetEl && targetEl.closest ? targetEl.closest('.bulk-vote-btn[data-country]') : null;
            if (bulkBtn) {
                const country = bulkBtn.getAttribute('data-country');
                const voteType = bulkBtn.getAttribute('data-vote');
                if (!country || !voteType) return;
                // Work off the latest profileCities
                const countryCities = profileCities.filter(c => c.country === country);
                const targetIds = [];
                if (voteType === 'liked') {
                    if (!countryCities.some(c => c.voteType === 'liked' || c.voteType === 'disliked')) return;
                    countryCities.forEach(c => { if (c.voteType !== 'liked') targetIds.push(c.cityId); });
                } else if (voteType === 'dont_know') {
                    countryCities.forEach(c => { if (c.voteType !== 'dont_know') targetIds.push(c.cityId); });
                } else if (voteType === 'disliked') {
                    countryCities.forEach(c => { if (c.voteType !== 'disliked') targetIds.push(c.cityId); });
                }
                console.log('profile: bulk click', { country, voteType, count: targetIds.length });
                if (targetIds.length === 0) return;
                try {
                    const res = await fetch(`${API_BASE_URL}/api/bulk-change-vote`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ userId, voteType, cityIds: targetIds })
                    });
                    if (!res.ok) {
                        const txt = await res.text();
                        throw new Error(txt || 'bulk endpoint failed');
                    }
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || 'bulk endpoint error');
                    
                    // If no changes were made, check if we should have made changes
                    if (data.changed === 0 && targetIds.length > 0) {
                        console.warn('Bulk API returned changed:0 but we expected changes. Falling back to individual votes.');
                        // Fall back to individual API calls
                        for (const id of targetIds) {
                            try { await changeVote(id, voteType); } catch (_) {}
                        }
                    }
                    
                    await renderProfile();
                } catch (e) {
                    // Fallback: sequentially change each vote
                    console.warn('bulk endpoint failed, falling back to sequential', e?.message || e);
                    for (const id of targetIds) {
                        try { await changeVote(id, voteType); } catch (_) {}
                    }
                    await renderProfile();
                }
                return;
            }
            // Airports: single emoji
            const apBtn = targetEl && targetEl.closest ? targetEl.closest('.airport-emoji-btn') : null;
            if (apBtn) {
                const airportId = apBtn.getAttribute('data-airportid');
                const voteType = apBtn.getAttribute('data-vote');
                if (!airportId || !voteType) return;
                try {
                    // Use the fixed change-airport-vote API directly - it handles both new votes and changes
                    const res = await fetch(`${API_BASE_URL}/api/change-airport-vote`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ userId, airportId, voteType })
                    });
                    
                    if (!res.ok) throw new Error('airport vote failed');
                    await renderProfile();
                } catch (e) {
                    alert('Не удалось изменить голос (аэропорт): ' + (e.message || e));
                }
                return;
            }
            // Airports: bulk
            const apBulk = targetEl && targetEl.closest ? targetEl.closest('.bulk-vote-btn[data-country-air]') : null;
            if (apBulk) {
                const countryAir = apBulk.getAttribute('data-country-air');
                const voteType = apBulk.getAttribute('data-vote');
                if (!countryAir || !voteType) return;
                const aps = (typeof profileAirports !== 'undefined' ? profileAirports : []).filter(a => a.country === countryAir);
                const targetIds = [];
                if (voteType === 'liked') {
                    if (!aps.some(a => a.voteType === 'liked' || a.voteType === 'disliked')) return;
                    aps.forEach(a => { if (a.voteType !== 'liked') targetIds.push(a.airportId); });
                } else if (voteType === 'dont_know') {
                    aps.forEach(a => { if (a.voteType !== 'dont_know') targetIds.push(a.airportId); });
                } else if (voteType === 'disliked') {
                    aps.forEach(a => { if (a.voteType !== 'disliked') targetIds.push(a.airportId); });
                }
                if (targetIds.length === 0) return;
                try {
                    const res = await fetch(`${API_BASE_URL}/api/bulk-change-airport-vote`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ userId, voteType, airportIds: targetIds })
                    });
                    if (!res.ok) throw new Error('bulk airport vote failed');
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || 'bulk airport vote error');
                    
                    // If no changes were made, check if we should have made changes
                    if (data.changed === 0 && targetIds.length > 0) {
                        console.warn('Bulk airport API returned changed:0 but we expected changes. Falling back to individual votes.');
                        // Fall back to individual API calls
                        for (const id of targetIds) {
                            try { 
                                await fetch(`${API_BASE_URL}/api/change-airport-vote`, {
                                    method: 'POST',
                                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                                    body: JSON.stringify({ userId, airportId: id, voteType })
                                });
                            } catch (_) {}
                        }
                    }
                    
                    await renderProfile();
                } catch (e) {
                    // Fallback sequential - use fixed change API directly
                    console.warn('bulk airport endpoint failed, falling back to sequential', e?.message || e);
                    for (const id of targetIds) {
                        try {
                            await fetch(`${API_BASE_URL}/api/change-airport-vote`, {
                                method: 'POST',
                                headers: authHeaders({ 'Content-Type': 'application/json' }),
                                body: JSON.stringify({ userId, airportId: id, voteType })
                            });
                        } catch (_) {}
                    }
                    await renderProfile();
                }
            }
        });
    }
});
