import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence, browserLocalPersistence, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getDatabase, ref, onValue, get, set } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCY9sq12w7H9X3hm9FLa_KkazKONpm1nJE",
    authDomain: "fasthub-9a206.firebaseapp.com",
    databaseURL: "https://fasthub-9a206-default-rtdb.firebaseio.com",
    projectId: "fasthub-9a206",
    storageBucket: "fasthub-9a206.appspot.com",
    messagingSenderId: "685686875831",
    appId: "1:685686875831:web:a31c42df4b9f6bd7b88f32"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const TMDB_API_KEY = 'f87eef10a1d7a66a49e0325f48efad94';
const MAX_CACHE_SIZE = 50 * 1024 * 1024;
const CACHE_VALIDITY_MS = 24 * 3600000;
let allChannels = null;
const ITEMS_PER_PAGE = 20;
let currentTab = 'filmes';
let currentSubcat = 'all';
let lastNavigationTime = 0;
const NAVIGATION_DEBOUNCE_MS = 1000;
const POSTER_CACHE = new Map();
let hls = null;

function normalizeTitle(title) {
    return title ? title.trim().replace(/\b\w/g, c => c.toUpperCase()) : "Sem Título";
}

function debounceNavigation() {
    const now = Date.now();
    if (now - lastNavigationTime < NAVIGATION_DEBOUNCE_MS) return false;
    lastNavigationTime = now;
    return true;
}

async function fetchSeriesPoster(seriesName) {
    if (POSTER_CACHE.has(seriesName)) return POSTER_CACHE.get(seriesName);
    const cleanName = seriesName.trim();
    let posterUrl = 'https://via.placeholder.com/200x300?text=Série';
    try {
        const response = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanName)}`, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (response.ok) {
            const data = await response.json();
            if (data.data?.[0]?.attributes?.posterImage?.large) {
                posterUrl = data.data[0].attributes.posterImage.large;
                POSTER_CACHE.set(seriesName, posterUrl);
                return posterUrl;
            }
        }
    } catch (error) {}
    try {
        const tmdbResponse = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanName)}`);
        if (tmdbResponse.ok) {
            const tmdbData = await tmdbResponse.json();
            if (tmdbData.results?.[0]?.poster_path) {
                posterUrl = `https://image.tmdb.org/t/p/w500${tmdbData.results[0].poster_path}`;
                POSTER_CACHE.set(seriesName, posterUrl);
                return posterUrl;
            }
        }
    } catch (error) {}
    POSTER_CACHE.set(seriesName, posterUrl);
    return posterUrl;
}

function showLoadingIndicator(show) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.classList.toggle('active', show);
}

function parseGroup(group) {
    const clean = group.replace(/[◆]/g, "").trim();
    const parts = clean.split("|").map(part => part.trim());
    return { main: parts[0].toLowerCase(), sub: parts.length > 1 ? parts[1] : "Outros" };
}

function categorizeChannel(channel, channels) {
    try {
        const title = channel.title.toLowerCase();
        const groupInfo = parseGroup(channel.group);
        const main = groupInfo.main;
        const sub = groupInfo.sub;
        const hasSeriesPattern = /(s\d{1,2}e\d{1,2})|(temporada\s*\d+)|(epis[óo]dio\s*\d+)|(ep\s*\d+)|(cap[íi]tulo\s*\d+)|(season\s*\d+)|(episode\s*\d+)/i.test(title);
        const looksLikeLinearChannel = /(24h|canal|mix|ao vivo|live|4k|fhd|hd|sd|channel|tv|plus|stream|broadcast)/i.test(title);

        if (main.includes("canais") || main.includes("canal") || looksLikeLinearChannel) {
            if (!channels.tv[sub]) channels.tv[sub] = [];
            channels.tv[sub].push({ title: normalizeTitle(channel.title), url: channel.url, logo: channel.logo, isLive: true });
            return;
        }
        if (main.includes("series") || main.includes("série") || (hasSeriesPattern && !looksLikeLinearChannel)) {
            let seriesName, season, episodeTitle;
            const match = title.match(/^(.*?)\s*(?:[Ss](\d{1,2})\s*[Ee](\d{1,2})|(temporada|season)\s*(\d+)|(episodio|ep|episode|capitulo)\s*(\d+))/i);
            if (match) {
                seriesName = normalizeTitle(match[1] || title.replace(/(temporada|episodio|season|episode|capitulo).*/i, "").trim());
                season = match[2] || match[5] || match[7] || "1";
                episodeTitle = match[3] ? `Episódio ${match[3]}` : (match[7] ? `Episódio ${match[7]}` : normalizeTitle(title));
            } else {
                seriesName = normalizeTitle(title.replace(/(temporada|episodio|season|episode|capitulo).*/i, "").trim());
                season = "1";
                episodeTitle = normalizeTitle(title);
            }
            const seriesKey = seriesName.toLowerCase();
            if (!channels.series[sub]) channels.series[sub] = {};
            if (!channels.series[sub][seriesKey]) channels.series[sub][seriesKey] = { displayName: seriesName, seasons: {}, logo: channel.logo };
            if (!channels.series[sub][seriesKey].seasons[season]) channels.series[sub][seriesKey].seasons[season] = [];
            channels.series[sub][seriesKey].seasons[season].push({ title: episodeTitle, url: channel.url, logo: channel.logo });
            channels.series[sub][seriesKey].seasons[season].sort((a, b) => {
                const epA = parseInt(a.title.match(/\d+/)?.[0] || 0, 10);
                const epB = parseInt(b.title.match(/\d+/)?.[0] || 0, 10);
                return epA - epB;
            });
            return;
        }
        if (main.includes("filmes") || main.includes("filme") && !looksLikeLinearChannel && title.length > 5) {
            if (!channels.filmes[sub]) channels.filmes[sub] = [];
            channels.filmes[sub].push({ title: normalizeTitle(channel.title), url: channel.url, logo: channel.logo });
            return;
        }
        if (!channels.tv["Outros"]) channels.tv["Outros"] = [];
        channels.tv["Outros"].push({ title: normalizeTitle(channel.title), url: channel.url, logo: channel.logo, isLive: looksLikeLinearChannel });
    } catch (error) {
        console.error("Erro ao categorizar canal:", channel.title, error.message);
        if (!channels.tv["Outros"]) channels.tv["Outros"] = [];
        channels.tv["Outros"].push({ title: normalizeTitle(channel.title), url: channel.url, logo: channel.logo, isLive: false });
    }
}

async function parseM3U(content) {
    const lines = content.split('\n');
    const channels = { filmes: {}, series: {}, tv: {} };
    let currentChannel = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        try {
            if (line.startsWith('#EXTINF:')) {
                const titleMatch = line.match(/,(.+)/) || line.match(/tvg-name="([^"]+)"/i);
                const groupMatch = line.match(/group-title="([^"]+)"/i);
                const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
                const title = titleMatch ? titleMatch[1].trim() : 'Canal Desconhecido';
                currentChannel = { title, url: '', group: groupMatch ? groupMatch[1] : '', logo: logoMatch ? logoMatch[1] : '' };
            } else if (line && !line.startsWith('#') && currentChannel) {
                currentChannel.url = line;
                categorizeChannel(currentChannel, channels);
                currentChannel = null;
            }
        } catch (error) {
            console.error('Erro ao processar linha', i, ':', line, error.message);
            currentChannel = null;
        }
    }
    return channels;
}

function saveToCache(data) {
    try {
        const cacheData = JSON.stringify({ timestamp: Date.now(), data });
        if (cacheData.length < MAX_CACHE_SIZE) localStorage.setItem('m3u_data', cacheData);
    } catch (e) {
        console.error('Erro ao salvar no localStorage:', e);
    }
}

async function loadM3UData() {
    if (allChannels) return allChannels;
    const cacheKey = 'm3u_data';
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_VALIDITY_MS && data) {
                allChannels = data;
                return allChannels;
            }
        } catch (e) {
            console.error('Erro ao ler cache M3U:', e);
        }
    }
    const m3uUrl = 'https://pub-b518a77f46ca4165b58d8329e13fb2a9.r2.dev/206609967_playlist.m3u';
    try {
        const response = await fetch(m3uUrl, { headers: { 'Accept': 'text/plain,*/*' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Falha ao carregar M3U');
        const content = await response.text();
        allChannels = await parseM3U(content);
        saveToCache(allChannels);
        return allChannels;
    } catch (error) {
        console.error('Erro ao carregar M3U:', error.message);
        throw new Error('Falha ao carregar lista M3U.');
    }
}

function updateProfileSection(user) {
    const profileIconDisplay = document.getElementById('profile-icon-display');
    const userNameDisplay = document.getElementById('user-name');
    if (!profileIconDisplay || !userNameDisplay) return;
    const userRef = ref(db, 'users/' + user.uid);
    onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            profileIconDisplay.src = userData.profileIcon || 'Default.png';
            profileIconDisplay.alt = 'Ícone do perfil';
            userNameDisplay.textContent = userData.name || user.email.split('@')[0];
        } else {
            const userName = user.email.split('@')[0];
            const expiration = new Date();
            expiration.setDate(expiration.getDate() + 30);
            set(userRef, {
                profileIcon: 'Default.png',
                name: userName,
                status: 'ativo',
                expirationDate: expiration.toISOString()
            });
        }
    });
}

function handleLoginPage() {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const loginButton = document.getElementById('login-button');
    if (!loginForm || !errorMessage || !rememberMeCheckbox || !loginButton) return;
    onAuthStateChanged(auth, (user) => {
        if (user) window.location.href = 'index.html';
    });
    loginButton.addEventListener('click', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const email = `${usernameInput.value}@fasthub.com`;
        const password = passwordInput.value;
        const persistence = rememberMeCheckbox.checked ? browserLocalPersistence : browserSessionPersistence;
        try {
            await setPersistence(auth, persistence);
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = 'index.html';
        } catch (error) {
            errorMessage.className = 'text-red-400';
            switch (error.code) {
                case 'auth/invalid-credential':
                    errorMessage.textContent = 'Usuário ou senha inválidos.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage.textContent = 'Muitas tentativas de login. Tente novamente mais tarde.';
                    break;
                default:
                    errorMessage.textContent = `Erro ao fazer login: ${error.message}`;
            }
        }
    });
}

function handleProtectedPage() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userRef = ref(db, 'users/' + user.uid);
            try {
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    if (userData.expirationDate && new Date(userData.expirationDate) < new Date()) {
                        await signOut(auth);
                        window.location.href = 'login.html?expired=true';
                        return;
                    }
                    await updateProfileSection(user);
                } else {
                    window.location.href = 'index.html';
                }
            } catch (error) {
                console.error('Erro ao verificar usuário:', error);
                window.location.href = 'login.html';
            }
        } else {
            window.location.href = 'login.html';
        }
    });
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                localStorage.clear();
                window.location.href = 'login.html';
            } catch (error) {
                alert('Erro ao sair. Tente novamente.');
            }
        });
    }
}

async function handleProfilePage() {
    const iconGrid = document.getElementById('icon-selection-grid');
    const userNameInput = document.getElementById('user-name-input');
    const saveProfileButton = document.getElementById('save-profile-button');
    const profileMessage = document.getElementById('profile-message');
    const passwordForm = document.getElementById('change-password-form');
    const passwordMessage = document.getElementById('password-message');
    const changePasswordButton = document.getElementById('change-password-button');
    let currentUser = null;
    let selectedIconName = null;

    async function getIconFiles() {
        try {
            const response = await fetch('icons.json');
            if (!response.ok) throw new Error('Falha ao carregar ícones');
            return await response.json();
        } catch (error) {
            console.error('Erro ao carregar ícones:', error);
            return ["Default.png"];
        }
    }

    async function populateIconGrid() {
        if (!iconGrid) return;
        iconGrid.innerHTML = '';
        const iconFiles = await getIconFiles();
        iconFiles.sort().forEach(fileName => {
            const div = document.createElement('div');
            div.className = 'icon-item';
            div.dataset.fileName = fileName;
            div.setAttribute('role', 'button');
            div.setAttribute('aria-label', `Selecionar ícone ${fileName}`);
            const img = new Image();
            img.alt = `Ícone ${fileName}`;
            img.src = fileName;
            img.onload = () => {
                div.appendChild(img);
                iconGrid.appendChild(div);
            };
            div.addEventListener('click', () => {
                document.querySelectorAll('.icon-item.selected').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                selectedIconName = fileName;
            });
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const userRef = ref(db, 'users/' + user.uid);
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                const accountStatusSpan = document.getElementById('account-status');
                const accountExpirationSpan = document.getElementById('account-expiration');
                accountStatusSpan.textContent = userData.status === 'active' ? 'Ativa' : 'Bloqueada';
                accountExpirationSpan.textContent = userData.expirationDate ? new Date(userData.expirationDate).toLocaleDateString() : 'N/A';
                selectedIconName = userData.profileIcon || 'Default.png';
                userNameInput.value = userData.name || user.email.split('@')[0];
                setTimeout(() => {
                    const currentIconElement = document.querySelector(`.icon-item[data-file-name="${selectedIconName}"]`);
                    if (currentIconElement) currentIconElement.classList.add('selected');
                }, 500);
            }
            await populateIconGrid();
        } else {
            window.location.href = 'login.html';
        }
    });

    saveProfileButton?.addEventListener('click', async () => {
        if (!currentUser) {
            profileMessage.textContent = 'Usuário não encontrado.';
            profileMessage.className = 'text-red-400';
            return;
        }
        const newName = userNameInput.value.trim();
        if (!newName) {
            profileMessage.textContent = 'O nome de usuário não pode estar vazio.';
            profileMessage.className = 'text-red-400';
            return;
        }
        const userRef = ref(db, 'users/' + currentUser.uid);
        try {
            const updates = { name: newName };
            if (selectedIconName) updates.profileIcon = selectedIconName;
            await set(userRef, updates, { merge: true });
            profileMessage.textContent = 'Perfil salvo com sucesso!';
            profileMessage.className = 'text-green-400';
        } catch (error) {
            profileMessage.textContent = 'Erro ao salvar o perfil.';
            profileMessage.className = 'text-red-400';
        }
    });

    changePasswordButton?.addEventListener('click', async (e) => {
        e.preventDefault();
        passwordMessage.textContent = '';
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        if (newPassword.length < 6) {
            passwordMessage.textContent = 'A nova senha deve ter pelo menos 6 caracteres.';
            passwordMessage.className = 'text-red-400';
            return;
        }
        if (newPassword !== confirmPassword) {
            passwordMessage.textContent = 'As senhas não coincidem.';
            passwordMessage.className = 'text-red-400';
            return;
        }
        try {
            const credential = EmailAuthProvider.credential(currentUser.email, document.getElementById('current-password')?.value || prompt('Digite sua senha atual'));
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPassword);
            passwordMessage.textContent = 'Senha alterada com sucesso!';
            passwordMessage.className = 'text-green-400';
            document.getElementById('change-password-form').reset();
        } catch (error) {
            passwordMessage.textContent = 'Erro ao alterar a senha. Verifique a senha atual.';
            passwordMessage.className = 'text-red-400';
        }
    });
}

function openModal(type, data) {
    const modal = document.getElementById('player-modal');
    const modalContent = document.getElementById('modal-content-inner');
    const videoPlayer = document.getElementById('videoPlayer');
    if (!modal || !modalContent || !videoPlayer) return;

    modalContent.innerHTML = '';
    videoPlayer.src = '';
    if (hls) {
        hls.destroy();
        hls = null;
    }

    if (type === 'filmes' || type === 'tv') {
        const url = data.url;
        modalContent.innerHTML = `
            <h2>${data.title}</h2>
            ${type === 'tv' ? `
                <input id="channel-search" type="text" placeholder="Buscar canais..." aria-label="Buscar canais">
                <ul id="channel-list"></ul>
            ` : ''}
        `;
        if (type === 'tv') {
            renderChannelList(Object.values(allChannels.tv).flat().sort((a, b) => a.title.localeCompare(b.title)), 'channel-list', 'videoPlayer');
            const searchInput = document.getElementById('channel-search');
            searchInput?.addEventListener('input', () => {
                renderChannelList(Object.values(allChannels.tv).flat().sort((a, b) => a.title.localeCompare(b.title)), 'channel-list', 'videoPlayer', searchInput.value);
            });
        } else {
            playVideo(url, videoPlayer);
        }
    } else if (type === 'series') {
        const seriesData = data;
        modalContent.innerHTML = `
            <h2>${seriesData.displayName}</h2>
            <div id="season-selector"></div>
            <div class="episode-nav">
                <button id="prev-episode" aria-label="Episódio anterior">Anterior</button>
                <button id="next-episode" aria-label="Próximo episódio">Próximo</button>
            </div>
            <ul id="episode-list"></ul>
        `;
        const sortedSeasons = Object.keys(seriesData.seasons).sort((a, b) => Number(a) - Number(b));
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Selecionar temporada');
        sortedSeasons.forEach(seasonNumber => {
            const option = document.createElement('option');
            option.value = seasonNumber;
            option.textContent = `Temporada ${seasonNumber}`;
            select.appendChild(option);
        });
        select.addEventListener('change', () => renderSeriesEpisodes(select.value, seriesData, 'episode-list', 'videoPlayer'));
        document.getElementById('season-selector').appendChild(select);
        const startSeason = sortedSeasons[0];
        const startEpisode = 0;
        select.value = startSeason;
        renderSeriesEpisodes(startSeason, seriesData, 'episode-list', 'videoPlayer');
        updateSeriesEpisode(startSeason, startEpisode, seriesData, 'videoPlayer');

        document.getElementById('prev-episode')?.addEventListener('click', () => {
            let currentSeasonNumber = select.value;
            let currentEpisodeIndex = parseInt(document.querySelector('#episode-list li.active')?.dataset.episodeIndex || 0);
            if (currentEpisodeIndex > 0) {
                updateSeriesEpisode(currentSeasonNumber, currentEpisodeIndex - 1, seriesData, 'videoPlayer');
            } else {
                const seasonKeys = Object.keys(seriesData.seasons);
                const currentSeasonIndex = seasonKeys.indexOf(currentSeasonNumber);
                if (currentSeasonIndex > 0) {
                    const prevSeason = seasonKeys[currentSeasonIndex - 1];
                    renderSeriesEpisodes(prevSeason, seriesData, 'episode-list', 'videoPlayer');
                    updateSeriesEpisode(prevSeason, seriesData.seasons[prevSeason].length - 1, seriesData, 'videoPlayer');
                    select.value = prevSeason;
                }
            }
        });

        document.getElementById('next-episode')?.addEventListener('click', () => {
            let currentSeasonNumber = select.value;
            let currentEpisodeIndex = parseInt(document.querySelector('#episode-list li.active')?.dataset.episodeIndex || 0);
            if (currentEpisodeIndex < seriesData.seasons[currentSeasonNumber].length - 1) {
                updateSeriesEpisode(currentSeasonNumber, currentEpisodeIndex + 1, seriesData, 'videoPlayer');
            } else {
                const seasonKeys = Object.keys(seriesData.seasons);
                const currentSeasonIndex = seasonKeys.indexOf(currentSeasonNumber);
                if (currentSeasonIndex < seasonKeys.length - 1) {
                    const nextSeason = seasonKeys[currentSeasonIndex + 1];
                    renderSeriesEpisodes(nextSeason, seriesData, 'episode-list', 'videoPlayer');
                    updateSeriesEpisode(nextSeason, 0, seriesData, 'videoPlayer');
                    select.value = nextSeason;
                }
            }
        });
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    const modal = document.getElementById('player-modal');
    const videoPlayer = document.getElementById('videoPlayer');
    if (modal && videoPlayer) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        videoPlayer.src = '';
        if (hls) {
            hls.destroy();
            hls = null;
        }
    }
}

function playVideo(url, videoPlayer) {
    if (hls) hls.destroy();
    if (Hls.isSupported() && url.includes('.m3u8')) {
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(videoPlayer);
    } else {
        videoPlayer.src = url;
    }
    videoPlayer.play().catch(e => console.error('Erro ao reproduzir vídeo:', e));
}

function renderChannelList(channels, containerId, videoPlayerId, filter = '') {
    const channelListUl = document.getElementById(containerId);
    const videoPlayer = document.getElementById(videoPlayerId);
    if (!channelListUl || !videoPlayer) return;
    channelListUl.innerHTML = '';
    const filteredChannels = channels.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));
    if (filteredChannels.length === 0) {
        channelListUl.innerHTML = '<li>Nenhum canal encontrado.</li>';
        return;
    }
    filteredChannels.forEach((channel, index) => {
        const li = document.createElement('li');
        li.textContent = channel.title;
        li.dataset.url = channel.url;
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', `Reproduzir ${channel.title}`);
        li.addEventListener('click', () => {
            playVideo(channel.url, videoPlayer);
            document.querySelectorAll(`#${containerId} li`).forEach(item => item.classList.remove('active'));
            li.classList.add('active');
        });
        channelListUl.appendChild(li);
        if (index === 0 && !filter) li.click();
    });
}

function renderSeriesEpisodes(season, seriesData, containerId, videoPlayerId) {
    const episodeListUl = document.getElementById(containerId);
    const videoPlayer = document.getElementById(videoPlayerId);
    if (!episodeListUl || !videoPlayer) return;
    episodeListUl.innerHTML = '';
    seriesData.seasons[season]?.forEach((episode, index) => {
        const li = document.createElement('li');
        li.textContent = episode.title;
        li.dataset.season = season;
        li.dataset.episodeIndex = index;
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', `Reproduzir ${episode.title}`);
        li.addEventListener('click', () => {
            updateSeriesEpisode(season, index, seriesData, videoPlayerId);
        });
        episodeListUl.appendChild(li);
    });
}

function updateSeriesEpisode(season, episodeIndex, seriesData, videoPlayerId) {
    const videoPlayer = document.getElementById(videoPlayerId);
    if (!videoPlayer || !seriesData.seasons[season]) return;
    const episode = seriesData.seasons[season][episodeIndex];
    playVideo(episode.url, videoPlayer);
    document.querySelectorAll(`#episode-list li`).forEach(item => item.classList.remove('active'));
    const activeLi = document.querySelector(`[data-season="${season}"][data-episode-index="${episodeIndex}"]`);
    if (activeLi) {
        activeLi.classList.add('active');
        activeLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const prevEpisodeBtn = document.getElementById('prev-episode');
    const nextEpisodeBtn = document.getElementById('next-episode');
    if (prevEpisodeBtn && nextEpisodeBtn) {
        prevEpisodeBtn.disabled = episodeIndex === 0 && season === Object.keys(seriesData.seasons)[0];
        const lastSeason = Object.keys(seriesData.seasons).pop();
        const lastEpisode = seriesData.seasons[lastSeason].length - 1;
        nextEpisodeBtn.disabled = episodeIndex === lastEpisode && season === lastSeason;
    }
}

async function initializeMain() {
    try {
        showLoadingIndicator(true);
        allChannels = await loadM3UData();
        displayChannels();
    } catch (error) {
        alert('Falha ao carregar dados da lista de reprodução.');
    } finally {
        showLoadingIndicator(false);
    }
}

async function displayChannels(searchQuery = '') {
    const listContainer = document.getElementById(`${currentTab}-list`);
    const paginationContainer = document.getElementById(`${currentTab}-pagination`);
    if (!listContainer || !paginationContainer) return;
    let items = [];
    if (currentTab === 'filmes') {
        items = Object.values(allChannels.filmes).flat().filter(item => !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()));
    } else if (currentTab === 'tv') {
        items = Object.values(allChannels.tv).flat().filter(item => !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()));
    } else if (currentTab === 'series') {
        items = Object.values(allChannels.series).flatMap(series => 
            Object.keys(series).map(key => ({ ...series[key], key }))
        ).filter(item => !searchQuery || item.displayName.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    let currentPage = parseInt(localStorage.getItem(`${currentTab}_page`) || '1');
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = 1;

    async function renderPage(page) {
        currentPage = page;
        localStorage.setItem(`${currentTab}_page`, currentPage);
        listContainer.innerHTML = '';
        const start = (page - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        for (const item of items.slice(start, end)) {
            const div = document.createElement('div');
            div.className = 'channel-item';
            div.setAttribute('role', 'button');
            div.setAttribute('aria-label', `Selecionar ${item.title || item.displayName}`);
            const img = document.createElement('img');
            img.src = currentTab === 'series' ? await fetchSeriesPoster(item.displayName) : (item.logo || 'https://via.placeholder.com/200x300');
            img.alt = item.title || item.displayName;
            div.appendChild(img);
            const title = document.createElement('span');
            title.textContent = item.title || item.displayName;
            div.appendChild(title);
            div.addEventListener('click', () => {
                if (debounceNavigation()) {
                    openModal(currentTab, item);
                }
            });
            listContainer.appendChild(div);
        }
        renderPagination();
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';
        if (totalPages <= 1) return;
        const prevButton = document.createElement('button');
        prevButton.textContent = 'Anterior';
        prevButton.disabled = currentPage === 1;
        prevButton.setAttribute('aria-label', 'Página anterior');
        prevButton.addEventListener('click', () => renderPage(currentPage - 1));
        paginationContainer.appendChild(prevButton);
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Próxima';
        nextButton.disabled = currentPage === totalPages;
        nextButton.setAttribute('aria-label', 'Próxima página');
        nextButton.addEventListener('click', () => renderPage(currentPage + 1));
        paginationContainer.appendChild(nextButton);
    }

    renderPage(currentPage);
}

function setupEventListeners() {
    const profileButton = document.getElementById('profile-button');
    if (profileButton) {
        profileButton.addEventListener('click', () => {
            const dropdown = document.querySelector('.profile-dropdown');
            if (dropdown) {
                dropdown.classList.toggle('active');
                dropdown.setAttribute('aria-expanded', dropdown.classList.contains('active'));
            }
        });
    }

    const filmesTab = document.getElementById('filmes-tab');
    const seriesTab = document.getElementById('series-tab');
    const tvTab = document.getElementById('tv-tab');
    if (filmesTab) filmesTab.addEventListener('click', () => switchTab('filmes'));
    if (seriesTab) seriesTab.addEventListener('click', () => switchTab('series'));
    if (tvTab) tvTab.addEventListener('click', () => switchTab('tv'));

    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', () => displayChannels(searchInput.value));
    }

    const closeModalButton = document.getElementById('close-modal');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeModal);
    }

    document.addEventListener('click', (event) => {
        const dropdown = document.querySelector('.profile-dropdown');
        if (dropdown && !dropdown.contains(event.target) && !document.getElementById('profile-button')?.contains(event.target)) {
            dropdown.classList.remove('active');
            dropdown.setAttribute('aria-expanded', 'false');
        }
    });
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.category').forEach(cat => cat.classList.add('hidden'));
    document.getElementById(`${tab}-category`).classList.remove('hidden');
    displayChannels();
}

document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage === 'login.html') {
        handleLoginPage();
    } else if (currentPage === 'profile.html') {
        handleProfilePage();
    } else {
        handleProtectedPage();
        initializeMain();
    }
    setupEventListeners();
});