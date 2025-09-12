document.addEventListener('DOMContentLoaded', () => {
    let allChannels = { filmes: {}, series: {}, tv: {} };
    const ITEMS_PER_PAGE = 20;
    let currentTab = 'filmes';
    let currentSubcat = 'all';
    const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50 MB
    let lastNavigationTime = 0;
    const NAVIGATION_DEBOUNCE_MS = 1000;
    const CACHE_VALIDITY_MS = 24 * 3600000; // 24 horas
    const POSTER_CACHE = new Map();
    let tvHlsInstance = null;
    const CHUNK_SIZE = 10000; // Parse 10,000 lines at a time
    let isParsing = false;

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

    function checkProtocolAndWarn() {
        const hasSeenProtocolWarning = localStorage.getItem('hasSeenProtocolWarning');
        if (!hasSeenProtocolWarning) {
            const protocolWarningPopup = document.getElementById('protocolWarningPopup');
            if (protocolWarningPopup) {
                protocolWarningPopup.style.display = 'flex';
            } else {
                console.warn('Elemento de aviso de protocolo (#protocolWarningPopup) não encontrado no DOM');
            }
        }
    }

    async function fetchSeriesPoster(seriesName) {
        if (POSTER_CACHE.has(seriesName)) {
            return POSTER_CACHE.get(seriesName);
        }

        const cleanName = seriesName.trim();
        let posterUrl = 'https://via.placeholder.com/200x300?text=Série';

        try {
            const response = await fetch(
                `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanName)}`,
                { headers: { 'Accept': 'application/vnd.api+json' } }
            );
            if (response.ok) {
                const data = await response.json();
                if (data.data && data.data.length > 0) {
                    const posterPath = data.data[0].attributes.posterImage?.large;
                    if (posterPath) {
                        posterUrl = posterPath;
                        POSTER_CACHE.set(seriesName, posterUrl);
                        console.log(`Capa encontrada na Kitsu para "${seriesName}": ${posterUrl}`);
                        return posterUrl;
                    }
                }
            }
        } catch (error) {
            console.error(`Erro ao buscar capa na Kitsu para "${seriesName}":`, error);
        }

        POSTER_CACHE.set(seriesName, posterUrl);
        console.warn(`Nenhuma capa encontrada para "${seriesName}", usando placeholder`);
        return posterUrl;
    }

    async function loadM3U(tab = currentTab, subcat = currentSubcat) {
        const cacheKey = `m3u_data_${tab}_${subcat}`;
        const startTime = performance.now();
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                console.log(`Cache data for ${tab}/${subcat}:`, JSON.stringify(data, null, 2));
                if (Date.now() - timestamp < CACHE_VALIDITY_MS && data && Object.keys(data).length > 0) {
                    allChannels[tab][subcat] = data;
                    console.log(`Carregado do cache para ${tab}/${subcat}:`, Object.keys(allChannels[tab][subcat]).length, 'itens');
                    displayChannels();
                    showLoadingIndicator(false);
                    return true;
                } else {
                    console.log(`Cache expirado ou inválido para ${tab}/${subcat}, recarregando...`);
                }
            } catch (e) {
                console.error(`Erro ao ler cache do localStorage para ${tab}/${subcat}:`, e);
            }
        }

        showLoadingIndicator(true);

        const filePaths = [
            'https://pub-b518a77f46ca4165b58d8329e13fb2a9.r2.dev/206609967_playlist.m3u'
        ];
        const fallbackUrl = 'https://cdnnekotv.sbs/get.php?username=206609967&password=860883584&type=m3u_plus&output=m3u8';

        let content = null;
        let loadedFrom = '';

        for (const filePath of filePaths) {
            try {
                const fetchStart = performance.now();
                const response = await fetch(filePath, {
                    headers: { 'Accept': 'text/plain,*/*' }
                });
                if (response.ok) {
                    content = await response.text();
                    loadedFrom = filePath;
                    console.log(`Carregado de ${filePath} em ${performance.now() - fetchStart} ms`);
                    break;
                } else {
                    console.error(`Falha ao carregar ${filePath}: ${response.status} ${response.statusText}`);
                }
            } catch (error) {
                console.error(`Erro ao buscar ${filePath}:`, error.message);
            }
        }

        if (!content) {
            try {
                const fetchStart = performance.now();
                const response = await fetch(fallbackUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'text/plain,*/*',
                        'Referer': 'http://localhost'
                    }
                });
                if (response.ok) {
                    content = await response.text();
                    loadedFrom = fallbackUrl;
                    console.log(`Carregado de fallback URL em ${performance.now() - fetchStart} ms`);
                } else {
                    console.error(`Falha ao carregar fallback URL: ${response.status} ${response.statusText}`);
                    alert(`Erro ao carregar a lista M3U: ${response.status} ${response.statusText}`);
                    showLoadingIndicator(false);
                    return false;
                }
            } catch (error) {
                console.error(`Erro ao carregar fallback URL:`, error.message);
                alert(`Erro ao carregar a lista M3U: ${error.message}`);
                showLoadingIndicator(false);
                return false;
            }
        }

        if (content) {
            console.log('M3U content (first 500 chars):', content.substring(0, 500));
            await parseM3UInChunks(content, tab, subcat);
            console.log(`Parse concluído para ${tab}/${subcat}:`, Object.keys(allChannels[tab][subcat] || {}).length, 'itens');
            try {
                saveToCacheIfPossible(tab, subcat);
            } catch (e) {
                console.warn(`Falha ao salvar cache para ${tab}/${subcat}, continuando com exibição:`, e);
            }
            displayChannels();
            showLoadingIndicator(false);
            console.log(`Carregamento total levou ${performance.now() - startTime} ms`);
            return true;
        } else {
            showLoadingIndicator(false);
            alert('Nenhum conteúdo M3U carregado.');
            return false;
        }
    }

    async function parseM3UInChunks(content, tab, subcat) {
        if (isParsing) {
            console.warn('Parsing em andamento, aguardando conclusão...');
            return;
        }
        isParsing = true;

        try {
            const lines = content.split('\n');
            const totalLines = lines.length;
            console.log(`Total de linhas no M3U: ${totalLines}`);

            for (let i = 0; i < totalLines; i += CHUNK_SIZE) {
                const chunk = lines.slice(i, i + CHUNK_SIZE);
                console.log(`Processando chunk ${i / CHUNK_SIZE + 1} (${i} a ${Math.min(i + CHUNK_SIZE, totalLines)})`);
                await new Promise((resolve, reject) => {
                    parseM3UChunk(chunk, tab, subcat).then(resolve).catch(reject);
                });
                // Yield to avoid blocking the main thread
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        } catch (error) {
            console.error('Erro ao processar M3U em chunks:', error);
            alert('Erro ao processar a lista M3U: ' + error.message);
        } finally {
            isParsing = false;
        }
    }

    function parseM3UChunk(chunk, tab, subcat) {
        return new Promise((resolve, reject) => {
            const workerCode = `
                self.onmessage = function(e) {
                    try {
                        const { chunk, tab, subcat } = e.data;
                        const lines = chunk;
                        const channels = { filmes: {}, series: {}, tv: {} };
                        let currentChannel = null;

                        function normalizeTitle(title) {
                            return title ? title.trim().replace(/\\b\\w/g, c => c.toUpperCase()) : "Sem Título";
                        }

                        function parseGroup(group) {
                            const clean = group.replace(/[◆]/g, "").trim();
                            const parts = clean.split("|").map(part => part.trim());
                            const main = parts[0].toLowerCase();
                            const sub = parts.length > 1 ? parts[1] : "Outros";
                            return { main, sub };
                        }

                        function categorizeChannel(channel) {
                            try {
                                const title = channel.title.toLowerCase();
                                const groupInfo = parseGroup(channel.group);
                                const main = groupInfo.main;
                                const sub = groupInfo.sub;

                                // Convert HTTP to HTTPS
                                channel.url = channel.url.replace(/^http:/, 'https:');
                                channel.logo = channel.logo ? channel.logo.replace(/^http:/, 'https:') : '';

                                // Only process channels matching the requested tab and subcat
                                if (tab !== 'all' && !main.includes(tab)) return;
                                if (subcat !== 'all' && sub !== subcat) return;

                                const hasSeriesPattern = /(s\\d{1,2}e\\d{1,2})|(temporada\\s*\\d+)|(episodio\\s*\\d+)/i.test(title);
                                const looksLikeLinearChannel = /(24h|canal|mix|ao vivo|live|4k|fhd|hd|sd|channel|tv|plus)/i.test(title);

                                if (main.includes("canais") || main.includes("canal") || looksLikeLinearChannel) {
                                    if (!channels.tv[sub]) channels.tv[sub] = [];
                                    channels.tv[sub].push({ 
                                        title: normalizeTitle(channel.title), 
                                        url: channel.url, 
                                        logo: channel.logo 
                                    });
                                    return;
                                }

                                if (main.includes("series") || main.includes("série")) {
                                    if (hasSeriesPattern && !looksLikeLinearChannel) {
                                        let seriesName, season, episodeTitle;
                                        const match = title.match(/^(.*?)\\s*[Ss](\\d{1,2})\\s*[Ee](\\d{1,2})/);
                                        if (match) {
                                            seriesName = normalizeTitle(match[1]);
                                            season = match[2];
                                            episodeTitle = "Episodio " + match[3];
                                        } else {
                                            seriesName = normalizeTitle(title.replace(/(temporada|episodio).*/i, "").trim());
                                            season = "1";
                                            episodeTitle = normalizeTitle(title);
                                        }
                                        const seriesKey = seriesName.toLowerCase();
                                        if (!channels.series[sub]) channels.series[sub] = {};
                                        const seriesSub = channels.series[sub];
                                        if (!seriesSub[seriesKey]) {
                                            seriesSub[seriesKey] = { displayName: seriesName, seasons: {}, logo: channel.logo };
                                        }
                                        if (!seriesSub[seriesKey].seasons[season]) {
                                            seriesSub[seriesKey].seasons[season] = [];
                                        }
                                        seriesSub[seriesKey].seasons[season].push({ title: episodeTitle, url: channel.url, logo: channel.logo });
                                        return;
                                    } else {
                                        if (!channels.tv[sub]) channels.tv[sub] = [];
                                        channels.tv[sub].push({ 
                                            title: normalizeTitle(channel.title), 
                                            url: channel.url, 
                                            logo: channel.logo 
                                        });
                                        return;
                                    }
                                }

                                if (main.includes("filmes") || main.includes("filme")) {
                                    if (!looksLikeLinearChannel && title.length > 5) {
                                        if (!channels.filmes[sub]) channels.filmes[sub] = [];
                                        channels.filmes[sub].push({ 
                                            title: normalizeTitle(channel.title), 
                                            url: channel.url, 
                                            logo: channel.logo 
                                        });
                                        return;
                                    } else {
                                        if (!channels.tv[sub]) channels.tv[sub] = [];
                                        channels.tv[sub].push({ 
                                            title: normalizeTitle(channel.title), 
                                            url: channel.url, 
                                            logo: channel.logo 
                                        });
                                        return;
                                    }
                                }

                                if (!channels.tv["Outros"]) channels.tv["Outros"] = [];
                                channels.tv["Outros"].push({ 
                                    title: normalizeTitle(channel.title), 
                                    url: channel.url, 
                                    logo: channel.logo 
                                });
                            } catch (error) {
                                console.error("Erro ao categorizar canal:", channel.title, error);
                                if (!channels.tv["Outros"]) channels.tv["Outros"] = [];
                                channels.tv["Outros"].push({ 
                                    title: normalizeTitle(channel.title), 
                                    url: channel.url, 
                                    logo: channel.logo 
                                });
                            }
                        }

                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i].trim();
                            try {
                                if (line.startsWith("#EXTINF:")) {
                                    const titleMatch = line.match(/,(.+)$/) || line.match(/tvg-name=\"([^\"]+)\"/i);
                                    const groupMatch = line.match(/group-title=\"([^\"]+)\"/i);
                                    const logoMatch = line.match(/tvg-logo=\"([^\"]+)\"/i);
                                    const title = titleMatch ? titleMatch[1].trim() : "Canal Desconhecido";
                                    currentChannel = {
                                        title,
                                        url: "",
                                        group: groupMatch ? groupMatch[1] : "",
                                        logo: logoMatch ? logoMatch[1] : ""
                                    };
                                } else if (line && !line.startsWith("#") && currentChannel) {
                                    currentChannel.url = line;
                                    categorizeChannel(currentChannel);
                                    currentChannel = null;
                                }
                            } catch (error) {
                                console.error("Erro ao processar linha", i, ":", line, error);
                                currentChannel = null;
                            }
                        }

                        self.postMessage(channels);
                    } catch (error) {
                        self.postMessage({ error: "Erro geral no parsing: " + error.message });
                    }
                };
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript; charset=utf-8' });
            const worker = new Worker(URL.createObjectURL(blob));

            worker.onmessage = (e) => {
                if (e.data.error) {
                    reject(new Error(e.data.error));
                } else {
                    const channels = e.data;
                    // Merge chunk data into allChannels
                    if (channels.filmes[subcat]) allChannels.filmes[subcat] = channels.filmes[subcat];
                    if (channels.series[subcat]) allChannels.series[subcat] = channels.series[subcat];
                    if (channels.tv[subcat]) allChannels.tv[subcat] = channels.tv[subcat];
                    resolve();
                }
                worker.terminate();
            };

            worker.onerror = (error) => {
                reject(error);
                worker.terminate();
            };

            worker.postMessage({ chunk, tab, subcat });
        });
    }

    function saveToCacheIfPossible(tab, subcat) {
        const cacheKey = `m3u_data_${tab}_${subcat}`;
        let cacheData;
        try {
            cacheData = JSON.stringify({ timestamp: Date.now(), data: allChannels[tab][subcat] });
            if (cacheData.length < MAX_CACHE_SIZE) {
                localStorage.setItem(cacheKey, cacheData);
                console.log(`Cache salvo com sucesso no localStorage para ${tab}/${subcat}`);
            } else {
                console.warn(`Cache excedeu o limite do localStorage para ${tab}/${subcat}, usando IndexedDB.`);
                saveToIndexedDB(cacheKey, cacheData);
            }
        } catch (e) {
            console.error(`Erro ao salvar no localStorage para ${tab}/${subcat}:`, e);
            if (cacheData) {
                saveToIndexedDB(cacheKey, cacheData);
            } else {
                console.warn(`cacheData não definido, ignorando salvamento no IndexedDB para ${tab}/${subcat}`);
            }
        }
    }

    async function saveToIndexedDB(cacheKey, cacheData) {
        try {
            const dbRequest = indexedDB.open('m3uDatabase', 1);

            dbRequest.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('m3uStore')) {
                    db.createObjectStore('m3uStore', { keyPath: 'key' });
                }
            };

            const db = await new Promise((resolve, reject) => {
                dbRequest.onsuccess = () => resolve(dbRequest.result);
                dbRequest.onerror = () => reject(dbRequest.error);
            });

            const transaction = db.transaction(['m3uStore'], 'readwrite');
            const store = transaction.objectStore('m3uStore');
            await new Promise((resolve, reject) => {
                const request = store.put({ key: cacheKey, data: cacheData });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            console.log(`Cache salvo no IndexedDB para ${cacheKey}`);
        } catch (error) {
            console.error(`Erro ao salvar no IndexedDB para ${cacheKey}:`, error);
        }
    }

    function showLoadingIndicator(show) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = show ? 'block' : 'none';
        } else {
            console.warn('Elemento de loading (#loading) não encontrado no DOM');
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
                for (let sub in data) {
                    if (Array.isArray(data[sub])) {
                        items = items.concat(data[sub]);
                    }
                }
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
                            if (!allSeriesObj[key]) {
                                allSeriesObj[key] = data[sub][key];
                            } else {
                                console.log('Série duplicada encontrada:', key, 'em subcategorias diferentes. Mesclando temporadas.');
                                for (let s in data[sub][key].seasons) {
                                    if (!allSeriesObj[key].seasons[s]) {
                                        allSeriesObj[key].seasons[s] = data[sub][key].seasons[s];
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (data[currentSubcat] && typeof data[currentSubcat] === 'object') {
                for (let key in data[currentSubcat]) {
                    allSeriesObj[key] = data[currentSubcat][key];
                }
            }
            return Object.values(allSeriesObj).filter(item => item.displayName && item.displayName.toLowerCase().includes(lowerFilter));
        } else if (tab === 'tv') {
            data = allChannels.tv;
            if (currentSubcat === 'all') {
                for (let sub in data) {
                    if (Array.isArray(data[sub])) {
                        items = items.concat(data[sub]);
                    }
                }
            } else if (data[currentSubcat] && Array.isArray(data[currentSubcat])) {
                items = data[currentSubcat];
            }
            return items.filter(item => item.title && item.title.toLowerCase().includes(lowerFilter));
        }
        return [];
    }

    function displayChannels(filter = '') {
        console.log('Displaying channels for tab:', currentTab, 'subcat:', currentSubcat, 'filter:', filter);
        const activeId = currentTab;
        const listContainer = document.getElementById(activeId);
        const paginationContainer = document.getElementById(`${activeId}-pagination`);

        if (!listContainer || !paginationContainer) {
            console.error('Container ou paginação não encontrado:', activeId);
            if (listContainer) {
                listContainer.innerHTML = '<p class="text-red-500 text-center">Erro: Container de paginação não encontrado.</p>';
            }
            return;
        }

        const subcatSelector = document.getElementById('category-filter');
        if (!subcatSelector) {
            console.error('Seletor de categoria (#category-filter) não encontrado no DOM');
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
            console.warn('Nenhum item encontrado para a aba:', activeId, 'subcat:', currentSubcat);
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
        const defaultImage = 'https://via.placeholder.com/200x300?text=Filme';
        const div = document.createElement('div');
        div.className = 'card bg-gray-800 rounded-md overflow-hidden';
        div.innerHTML = `
            <img src="${item.logo || defaultImage}" alt="${item.title || 'Sem Título'}" class="w-full h-auto object-cover">
            <p class="p-2 text-center text-sm">${item.title || 'Sem Título'}</p>
        `;
        div.addEventListener('click', (e) => {
            e.preventDefault();
            openMoviePlayerModal(item.url);
        });
        return div;
    }

    async function createSeriesCard(item) {
        const defaultImage = 'https://via.placeholder.com/200x300?text=Série';
        const div = document.createElement('div');
        div.className = 'card bg-gray-800 rounded-md overflow-hidden';
        
        let posterUrl = item.logo || await fetchSeriesPoster(item.displayName);
        
        div.innerHTML = `
            <img src="${posterUrl || defaultImage}" alt="${item.displayName || 'Sem Título'}" class="w-full h-auto object-cover">
            <p class="p-2 text-center text-sm">${item.displayName || 'Sem Título'}</p>
        `;
        div.addEventListener('click', (e) => {
            e.preventDefault();
            openSeriesPlayerModal(item);
        });
        return div;
    }

    function createTVCard(item) {
        const defaultImage = 'https://via.placeholder.com/200x300?text=TV';
        const div = document.createElement('div');
        div.className = 'card bg-gray-800 rounded-md overflow-hidden';
        div.innerHTML = `
            <img src="${item.logo || defaultImage}" alt="${item.title || 'Sem Título'}" class="w-full h-auto object-cover">
            <p class="p-2 text-center text-sm">${item.title || 'Sem Título'}</p>
        `;
        div.addEventListener('click', (e) => {
            e.preventDefault();
            openMoviePlayerModal(item.url);
        });
        return div;
    }

    let hls = new Hls();

    function playVideoInModal(videoPlayer, url) {
        if (url.endsWith('.m3u8')) {
            if (Hls.isSupported()) {
                hls.destroy();
                const hlsConfig = {
                    maxMaxBufferLength: 100,
                };
                hls = new Hls(hlsConfig);
                hls.loadSource(url);
                hls.attachMedia(videoPlayer);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoPlayer.play();
                });
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS Error:', data);
                    alert('Erro ao carregar o vídeo: ' + data.type);
                });
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                videoPlayer.src = url;
                videoPlayer.addEventListener('loadedmetadata', () => {
                    videoPlayer.play();
                });
            } else {
                console.error('HLS não suportado e formato M3U8 não compatível');
                alert('Formato de vídeo não suportado pelo navegador');
            }
        } else {
            videoPlayer.src = url;
            videoPlayer.play().catch(error => {
                console.error('Erro ao reproduzir vídeo:', error);
                alert('Erro ao reproduzir vídeo: ' + error.message);
            });
        }
    }

    window.openMoviePlayerModal = function(url) {
        const modal = document.getElementById('movie-player-modal');
        const videoPlayer = document.getElementById('movieVideoPlayer');
        playVideoInModal(videoPlayer, url);
        modal.classList.add('show');
    }

    window.closeMoviePlayerModal = function() {
        const modal = document.getElementById('movie-player-modal');
        const videoPlayer = document.getElementById('movieVideoPlayer');
        videoPlayer.pause();
        videoPlayer.src = '';
        hls.destroy();
        modal.classList.remove('show');
    }

    window.openSeriesPlayerModal = function(series) {
        const modal = document.getElementById('series-player-modal');
        const videoPlayer = document.getElementById('seriesVideoPlayer');
        const modalTitle = document.getElementById('series-modal-title');
        const seasonSelectorContainer = document.getElementById('season-selector');
        const episodesContainer = document.getElementById('modal-episodes');
        
        modalTitle.textContent = series.displayName || 'Sem Título';
        seasonSelectorContainer.innerHTML = '';
        episodesContainer.innerHTML = '';

        if (!series.seasons || Object.keys(series.seasons).length === 0) {
            episodesContainer.innerHTML = '<p class="text-red-500">Nenhum episódio encontrado para esta série.</p>';
        } else {
            const sortedSeasons = Object.keys(series.seasons).sort((a, b) => a - b);

            const select = document.createElement('select');
            select.className = 'w-full bg-gray-700 text-white p-2 rounded-md';

            sortedSeasons.forEach(seasonNumber => {
                const option = document.createElement('option');
                option.value = seasonNumber;
                option.textContent = `Temporada ${seasonNumber}`;
                select.appendChild(option);
            });

            select.addEventListener('change', () => {
                const selectedSeason = select.value;
                episodesContainer.innerHTML = '';
                const episodesList = document.createElement('ul');
                episodesList.className = 'space-y-2';
                series.seasons[selectedSeason].forEach(episode => {
                    const li = document.createElement('li');
                    li.className = 'p-2 hover:bg-gray-700 rounded cursor-pointer';
                    li.textContent = episode.title || 'Sem Título';
                    li.addEventListener('click', () => {
                        episodesList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
                        li.classList.add('active');
                        playVideoInModal(videoPlayer, episode.url);
                    });
                    episodesList.appendChild(li);
                });
                episodesContainer.appendChild(episodesList);
                if (series.seasons[selectedSeason][0]) {
                    playVideoInModal(videoPlayer, series.seasons[selectedSeason][0].url);
                    if (episodesList.children.length > 0) {
                        episodesList.querySelector('li').classList.add('active');
                    }
                }
            });

            seasonSelectorContainer.appendChild(select);
            select.dispatchEvent(new Event('change'));
        }

        modal.classList.add('show');
    }

    window.closeSeriesPlayerModal = function() {
        const modal = document.getElementById('series-player-modal');
        const videoPlayer = document.getElementById('seriesVideoPlayer');
        videoPlayer.pause();
        videoPlayer.src = '';
        hls.destroy();
        modal.classList.remove('show');
    }

    function displayPaginatedList(categoryId, items, createItemElement) {
        const listContainer = document.getElementById(categoryId);
        const paginationContainer = document.getElementById(`${categoryId}-pagination`);
        if (!listContainer || !paginationContainer) {
            console.error('Container ou paginação não encontrado:', categoryId);
            return;
        }

        let currentPage = parseInt(localStorage.getItem(`${categoryId}_page`) || '1');
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

        if (currentPage > totalPages) {
            currentPage = 1;
        }

        async function renderPage(page) {
            currentPage = page;
            localStorage.setItem(`${categoryId}_page`, currentPage);
            listContainer.innerHTML = '';
            const start = (page - 1) * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            for (const item of items.slice(start, end)) {
                try {
                    listContainer.appendChild(await createItemElement(item));
                } catch (error) {
                    console.error('Erro ao criar card para item:', item, error);
                }
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

    let tvPlayerInitialized = false;

    window.switchTab = async function(tab) {
        const mainContent = document.querySelector('.max-w-6xl.mx-auto.p-4');
        const tvPlayerContainer = document.getElementById('tv-player-container');
        const navbar = document.getElementById('main-nav');
        const tvPlayer = document.getElementById('tvPlayer');

        if (tab === 'tv') {
            mainContent.style.display = 'none';
            navbar.style.display = 'none';
            tvPlayerContainer.style.display = 'block';
            if (!tvPlayerInitialized) {
                initTvPlayer();
                tvPlayerInitialized = true;
            }
            checkProtocolAndWarn();
            // Load TV channels if not already loaded
            if (!allChannels.tv[currentSubcat]) {
                await loadM3U('tv', currentSubcat);
            }
        } else {
            mainContent.style.display = 'block';
            navbar.style.display = 'flex';
            tvPlayerContainer.style.display = 'none';
            
            if (tvHlsInstance) {
                tvHlsInstance.destroy();
            }
            if (tvPlayer) {
                tvPlayer.pause();
                tvPlayer.src = '';
                tvPlayer.removeAttribute('src');
            }
            
            currentTab = tab;
            currentSubcat = 'all';
            document.querySelectorAll('.navbar a, .navbar div').forEach(a => a.classList.remove('active'));
            const tabElement = document.getElementById(`${tab}-tab`);
            if (tabElement) tabElement.classList.add('active');
            document.querySelectorAll('.category').forEach(c => c.classList.remove('active'));
            const categoryElement = document.getElementById(`${tab}-category`);
            if (categoryElement) categoryElement.classList.add('active');
            // Load data for the new tab if not already loaded
            if (!allChannels[tab][currentSubcat]) {
                await loadM3U(tab, currentSubcat);
            }
            displayChannels(document.getElementById('search')?.value || '');
        }
    }

    function initTvPlayer() {
        const videoPlayer = document.getElementById('tvPlayer');
        const channelList = document.getElementById('channel-list-tv');
        const searchInput = document.getElementById('channel-search-tv');
        tvHlsInstance = new Hls();
        let allTvChannels = [];

        for (let sub in allChannels.tv) {
            if (Array.isArray(allChannels.tv[sub])) {
                allTvChannels = allTvChannels.concat(allChannels.tv[sub]);
            }
        }

        function renderChannels(filter = '') {
            const lowerFilter = filter.toLowerCase();
            channelList.innerHTML = '';
            const filteredChannels = allTvChannels.filter(channel => channel.title.toLowerCase().includes(lowerFilter));

            if (filteredChannels.length === 0) {
                channelList.innerHTML = '<li class="text-gray-400">Nenhum canal encontrado.</li>';
                return;
            }

            filteredChannels.forEach(channel => {
                const li = document.createElement('li');
                li.className = 'p-2 hover:bg-gray-700 rounded cursor-pointer flex items-center';
                li.innerHTML = `
                    <img src="${channel.logo || 'https://via.placeholder.com/50x50?text=TV'}" alt="${channel.title}" class="w-10 h-10 mr-4">
                    <span>${normalizeTitle(channel.title)}</span>
                `;
                li.addEventListener('click', () => {
                    playChannel(channel.url);
                    document.querySelectorAll('#channel-list-tv li.active').forEach(el => el.classList.remove('active'));
                    li.classList.add('active');
                });
                channelList.appendChild(li);
            });
        }

        function playChannel(url) {
            if (url.endsWith('.m3u8')) {
                if (Hls.isSupported()) {
                    tvHlsInstance.destroy();
                    const hlsConfig = {
                        maxMaxBufferLength: 100,
                    };
                    tvHlsInstance = new Hls(hlsConfig);
                    tvHlsInstance.loadSource(url);
                    tvHlsInstance.attachMedia(videoPlayer);
                    tvHlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                        videoPlayer.play();
                    });
                    tvHlsInstance.on(Hls.Events.ERROR, (event, data) => {
                        console.error('HLS Error:', data);
                        alert('Erro ao carregar o canal: ' + data.type);
                    });
                } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                    videoPlayer.src = url;
                    videoPlayer.addEventListener('loadedmetadata', () => {
                        videoPlayer.play();
                    });
                } else {
                    console.error('HLS não suportado e formato M3U8 não compatível');
                    alert('Formato de vídeo não suportado pelo navegador');
                }
            } else {
                videoPlayer.src = url;
                videoPlayer.play().catch(error => {
                    console.error('Erro ao reproduzir canal:', error);
                    alert('Erro ao reproduzir canal: ' + error.message);
                });
            }
        }

        searchInput.addEventListener('input', (e) => {
            renderChannels(e.target.value);
        });

        const toggleButton = document.getElementById('toggle-channels-btn');
        toggleButton.addEventListener('click', () => {
            document.getElementById('channel-list-sidebar').classList.toggle('show');
        });

        const closeButton = document.getElementById('close-channels-btn');
        closeButton.addEventListener('click', () => {
            document.getElementById('channel-list-sidebar').classList.remove('show');
        });

        renderChannels();
    }

    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            displayChannels(this.value);
        });
    } else {
        console.warn('Input de busca (#search) não encontrado no DOM');
    }

    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', async (e) => {
            currentSubcat = e.target.value;
            if (!allChannels[currentTab][currentSubcat]) {
                await loadM3U(currentTab, currentSubcat);
            }
            displayChannels(document.getElementById('search')?.value || '');
        });
    } else {
        console.error('Seletor de categoria (#category-filter) não encontrado no DOM');
    }

    // Initial load for default tab
    loadM3U(currentTab, currentSubcat);
});