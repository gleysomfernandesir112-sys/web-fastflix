document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    let allChannels = { filmes: {}, series: {}, tv: {} };
    let currentTab = 'filmes';
    let currentSubcat = 'all';
    const ITEMS_PER_PAGE = 20;

    // --- M3U Loading and Parsing ---
    async function loadM3U() { /* ... existing loadM3U logic ... */ }
    function parseM3UInWorker(content) { /* ... existing parseM3UInWorker logic ... */ }
    // ... other helper functions like saveToCache, showLoadingIndicator etc. ...

    // --- Main Content Display ---
    function displayChannels(filter = '') { /* ... existing displayChannels logic ... */ }
    function createMovieCard(item) { /* ... existing createMovieCard logic ... */ }
    function createSeriesCard(item) { /* ... existing createSeriesCard logic ... */ }
    function createTVCard(item) { /* ... existing createTVCard logic ... */ }
    function displayPaginatedList(categoryId, items, createItemElement) { /* ... existing displayPaginatedList logic ... */ }

    // --- Navigation ---
    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
        document.querySelectorAll('.category').forEach(c => c.style.display = 'none');

        const tabElement = document.getElementById(`${tab}-tab`);
        if (tabElement) tabElement.classList.add('active');

        const categoryElement = document.getElementById(`${tab}-category`);
        if (categoryElement) categoryElement.style.display = 'block';

        displayChannels();
    }

    // --- TV Player Modal ---
    let tvModalInitialized = false;
    let tvHls = new Hls();
    const tvPlayerModal = document.getElementById('tv-player-modal');
    const tvVideoPlayer = document.getElementById('tvPlayer');
    const tvChannelList = document.getElementById('tv-channel-list');
    const tvChannelSearch = document.getElementById('tv-channel-search');

    function openTvPlayerModal() {
        if (!tvModalInitialized) {
            initTvModal();
        }
        renderTvChannels();
        tvPlayerModal.style.display = 'flex';
    }

    function closeTvPlayerModal() {
        tvPlayerModal.style.display = 'none';
        if (tvHls) {
            tvHls.destroy();
        }
        tvVideoPlayer.pause();
        tvVideoPlayer.src = '';
    }

    function renderTvChannels(filter = '') {
        let allTvItems = [];
        for (let sub in allChannels.tv) {
            if (Array.isArray(allChannels.tv[sub])) {
                allTvItems = allTvItems.concat(allChannels.tv[sub]);
            }
        }

        const lowerFilter = filter.toLowerCase();
        tvChannelList.innerHTML = '';
        const filteredChannels = allTvItems.filter(channel => channel.title.toLowerCase().includes(lowerFilter));

        if (filteredChannels.length === 0) {
            tvChannelList.innerHTML = '<li class="text-gray-400 p-4 text-center">Nenhum canal encontrado.</li>';
            return;
        }

        filteredChannels.forEach(channel => {
            const li = document.createElement('li');
            li.innerHTML = `
                <img src="${channel.logo || 'https://via.placeholder.com/50x50?text=TV'}" alt="${channel.title}">
                <span>${normalizeTitle(channel.title)}</span>
            `;
            li.addEventListener('click', () => {
                playTvChannel(channel.url);
                document.querySelectorAll('#tv-channel-list li.active').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
            });
            tvChannelList.appendChild(li);
        });
    }

    function playTvChannel(url) {
        if (Hls.isSupported()) {
            if (tvHls) {
                tvHls.destroy();
            }
            tvHls = new Hls();
            tvHls.loadSource(url);
            tvHls.attachMedia(tvVideoPlayer);
            tvHls.on(Hls.Events.MANIFEST_PARSED, () => {
                tvVideoPlayer.play();
            });
        } else if (tvVideoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            tvVideoPlayer.src = url;
            tvVideoPlayer.play();
        }
    }

    function initTvModal() {
        document.getElementById('close-tv-player-btn').addEventListener('click', closeTvPlayerModal);
        tvChannelSearch.addEventListener('input', (e) => renderTvChannels(e.target.value));
        tvModalInitialized = true;
    }

    // --- Event Listeners ---
    document.getElementById('filmes-tab').addEventListener('click', (e) => { e.preventDefault(); switchTab('filmes'); });
    document.getElementById('series-tab').addEventListener('click', (e) => { e.preventDefault(); switchTab('series'); });
    document.getElementById('tv-tab').addEventListener('click', (e) => { e.preventDefault(); openTvPlayerModal(); });

    // Initial Load
    loadM3U().then(() => {
        switchTab('filmes'); // Display initial tab
    });
});