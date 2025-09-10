import { loadM3UData } from './m3u-loader.js';

document.addEventListener('DOMContentLoaded', () => {
    let allChannels = { filmes: {}, series: {}, tv: {} };
    const ITEMS_PER_PAGE = 20;
    let currentTab = 'filmes';
    let currentSubcat = 'all';
    let lastNavigationTime = 0;
    const NAVIGATION_DEBOUNCE_MS = 1000;
    const POSTER_CACHE = new Map();
    const TMDB_API_KEY = 'f87eef10a1d7a66a49e0325f48efad94';

    function normalizeTitle(title) {
        return title ? title.trim().replace(/\b\w/g, c => c.toUpperCase()) : 'Sem Título';
    }

    function debounceNavigation(url) {
        const now = Date.now();
        if (now - lastNavigationTime < NAVIGATION_DEBOUNCE_MS) {
            console.warn('Navegação bloqueada por debounce:', url);
            return false;
        }
        lastNavigationTime = now;
        console.log('Navegando para:', url);
        return true;
    }

    async function fetchSeriesPoster(seriesName) {
        if (POSTER_CACHE.has(seriesName)) {
            return POSTER_CACHE.get(seriesName);
        }
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
        } catch (error) { console.error(`Erro Kitsu para "${seriesName}":`, error); }
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
        } catch (error) { console.error(`Erro TMDB para "${seriesName}":`, error); }
        POSTER_CACHE.set(seriesName, posterUrl);
        return posterUrl;
    }

    async function initialize() {
        try {
            showLoadingIndicator(true);
            allChannels = await loadM3UData();
            displayChannels();
        } catch (error) {
            console.error("Failed to initialize page:", error);
            alert("Falha ao carregar dados da lista de reprodução.");
        } finally {
            showLoadingIndicator(false);
        }
    }

    function showLoadingIndicator(show) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = show ? 'block' : 'none';
        }
    }

    function getSubcatsForTab(tab) {
        let data;
        if (tab === 'filmes') data = allChannels.filmes;
        else if (tab === 'series') data = allChannels.series;
        else if (tab === 'tv') data = allChannels.tv;
        else return [];
        return Object.keys(data).sort();
    }

    function getFilteredItems(tab, filter = '') {
        const lowerFilter = filter.toLowerCase();
        let items = [];
        let data;
        if (tab === 'filmes') {
            data = allChannels.filmes;
            if (currentSubcat === 'all') {
                for (let sub in data) { if (Array.isArray(data[sub])) { items = items.concat(data[sub]); } }
            } else if (data[currentSubcat] && Array.isArray(data[currentSubcat])) {
                items = data[currentSubcat];
            }
            return items.filter(item => item.title && item.title.toLowerCase().includes(lowerFilter));
        } else if (tab === 'series') {
            data = allChannels.series;
            let allSeriesObj = {};
            if (currentSubcat === 'all') {
                for (let sub in data) {
                    if (data[sub] && typeof data[sub] === 'object') {
                        for (let key in data[sub]) {
                            if (!allSeriesObj[key]) { allSeriesObj[key] = data[sub][key]; }
                            else { for (let s in data[sub][key].seasons) { if (!allSeriesObj[key].seasons[s]) { allSeriesObj[key].seasons[s] = data[sub][key].seasons[s]; } } }
                        }
                    }
                }
            } else if (data[currentSubcat] && typeof data[currentSubcat] === 'object') {
                for (let key in data[currentSubcat]) { allSeriesObj[key] = data[currentSubcat][key]; }
            }
            return Object.values(allSeriesObj).filter(item => item.displayName && item.displayName.toLowerCase().includes(lowerFilter));
        } else if (tab === 'tv') {
            data = allChannels.tv;
            if (currentSubcat === 'all') {
                for (let sub in data) { if (Array.isArray(data[sub])) { items = items.concat(data[sub]); } }
            } else if (data[currentSubcat] && Array.isArray(data[currentSubcat])) {
                items = data[currentSubcat];
            }
            return items.filter(item => item.title && item.title.toLowerCase().includes(lowerFilter));
        }
        return [];
    }

    function displayChannels(filter = '') {
        const activeId = currentTab;
        const listContainer = document.getElementById(activeId);
        const paginationContainer = document.getElementById(`${activeId}-pagination`);
        if (!listContainer || !paginationContainer) {
            console.error('Container ou paginação não encontrado:', activeId);
            if (listContainer) { listContainer.innerHTML = '<p class="text-red-500 text-center">Erro: Container de paginação não encontrado.</p>'; }
            return;
        }
        const subcatSelector = document.getElementById('category-filter');
        if (!subcatSelector) {
            console.error('Seletor de categoria não encontrado');
            listContainer.innerHTML = '<p class="text-red-500 text-center">Erro: Seletor de categoria não encontrado.</p>';
            return;
        }
        const previouslySelected = subcatSelector.value;
        subcatSelector.innerHTML = '<option value="all">Todas as Categorias</option>';
        const subcats = getSubcatsForTab(activeId);
        subcats.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub;
            option.textContent = normalizeTitle(sub);
            subcatSelector.appendChild(option);
        });
        if (subcats.includes(previouslySelected)) {
            subcatSelector.value = previouslySelected;
            currentSubcat = previouslySelected;
        } else {
            subcatSelector.value = 'all';
            currentSubcat = 'all';
        }
        const filteredItems = getFilteredItems(activeId, filter);
        if (filteredItems.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-300 text-center">Nenhum item encontrado.</p>';
        } else {
            if (activeId === 'filmes') {
                displayPaginatedList(activeId, filteredItems, createMovieCard);
            } else if (activeId === 'series') {
                displayPaginatedList(activeId, filteredItems, createSeriesCard);
            } else if (activeId === 'tv') {
                displayPaginatedList(activeId, filteredItems, createTVCard);
            }
        }
    }

    function createMovieCard(item) {
        const div = document.createElement('div');
        div.className = 'card bg-gray-800 rounded-md overflow-hidden';
        div.setAttribute('data-tooltip', item.title);
        div.innerHTML = `
            <img src="${item.logo || 'https://via.placeholder.com/200x300?text=Filme'}" alt="${item.title || 'Sem Título'}" class="w-full h-auto object-cover" loading="lazy">
            <p class="p-2 text-center text-sm">${item.title || 'Sem Título'}</p>
        `;
        div.addEventListener('click', (e) => {
            e.preventDefault();
            const url = 'player-filmes.html?videoUrl=' + encodeURIComponent(item.url);
            if (debounceNavigation(url)) {
                window.location.href = url;
            }
        });
        return div;
    }

    async function createSeriesCard(item) {
        const div = document.createElement('div');
        div.className = 'card bg-gray-800 rounded-md overflow-hidden';
        div.setAttribute('data-tooltip', item.displayName);
        let posterUrl = item.logo || await fetchSeriesPoster(item.displayName);
        div.innerHTML = `
            <img src="${posterUrl}" alt="${item.displayName || 'Sem Título'}" class="w-full h-auto object-cover" loading="lazy">
            <p class="p-2 text-center text-sm">${item.displayName || 'Sem Título'}</p>
        `;
        div.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.setItem('currentSeries', JSON.stringify(item));
            const url = 'player-series.html';
            if (debounceNavigation(url)) {
                window.location.href = url;
            }
        });
        return div;
    }

    function createTVCard(item) {
        const div = document.createElement('div');
        div.className = 'card bg-gray-800 rounded-md overflow-hidden';
        div.setAttribute('data-tooltip', item.title);
        div.innerHTML = `
            <img src="${item.logo || 'https://via.placeholder.com/200x300?text=TV'}" alt="${item.title || 'Sem Título'}" class="w-full h-auto object-cover" loading="lazy">
            <p class="p-2 text-center text-sm">${item.title || 'Sem Título'}${item.isLive ? ' <span class="text-red-500">(Ao Vivo)</span>' : ''}</p>
        `;
        div.style.cursor = 'default';
        return div;
    }

    function displayPaginatedList(categoryId, items, createItemElement) {
        const listContainer = document.getElementById(categoryId);
        const paginationContainer = document.getElementById(`${categoryId}-pagination`);
        if (!listContainer || !paginationContainer) { console.error('Container ou paginação não encontrado:', categoryId); return; }
        let currentPage = parseInt(localStorage.getItem(`${categoryId}_page`) || '1');
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        if (currentPage > totalPages) { currentPage = 1; }
        async function renderPage(page) {
            currentPage = page;
            localStorage.setItem(`${categoryId}_page`, currentPage);
            listContainer.innerHTML = '';
            const start = (page - 1) * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            for (const item of items.slice(start, end)) {
                try { listContainer.appendChild(await createItemElement(item)); }
                catch (error) { console.error('Erro ao criar card:', item, error); }
            }
            renderPagination();
        }
        function renderPagination() {
            paginationContainer.innerHTML = '';
            if (totalPages <= 1) return;
            const prevButton = document.createElement('button');
            prevButton.textContent = 'Anterior';
            prevButton.disabled = currentPage === 1;
            prevButton.className = 'px-4 py-2 bg-gray-700 text-white rounded mr-2 disabled:opacity-50';
            prevButton.addEventListener('click', () => renderPage(currentPage - 1));
            paginationContainer.appendChild(prevButton);
            const nextButton = document.createElement('button');
            nextButton.textContent = 'Próxima';
            nextButton.disabled = currentPage === totalPages;
            nextButton.className = 'px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50';
            nextButton.addEventListener('click', () => renderPage(currentPage + 1));
            paginationContainer.appendChild(nextButton);
        }
        renderPage(currentPage);
    }

    window.switchTab = function(tab) {
        currentTab = tab;
        currentSubcat = 'all';
        document.querySelectorAll('.navbar a, .navbar div').forEach(a => a.classList.remove('active'));
        const tabElement = document.getElementById(`${tab}-tab`);
        if (tabElement) tabElement.classList.add('active');
        document.querySelectorAll('.category').forEach(c => c.classList.remove('active'));
        const categoryElement = document.getElementById(`${tab}-category`);
        if (categoryElement) categoryElement.classList.add('active');
        displayChannels(document.getElementById('search')?.value || '');
    }

    window.openSeriesModal = function(series) {
        // Obsolete
    }

    window.closeModal = function() {
        // Obsolete
    }

    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            displayChannels(this.value);
        });
    }

    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            currentSubcat = e.target.value;
            displayChannels(document.getElementById('search')?.value || '');
        });
    }

    initialize();
});