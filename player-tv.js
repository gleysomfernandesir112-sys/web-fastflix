document.addEventListener('DOMContentLoaded', () => {
    let allTvChannels = [];
    const videoPlayer = document.getElementById('tvPlayer');
    const channelList = document.getElementById('channel-list');
    const searchInput = document.getElementById('channel-search');
    let hls = new Hls();

    function normalizeTitle(title) {
        return title ? title.trim().replace(/\b\w/g, c => c.toUpperCase()) : 'Sem Título';
    }

    async function loadM3U() {
        const cacheKey = 'm3u_data';
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                // Using cached data even if it's expired, for faster loading.
                // The main page will refresh the cache if needed.
                if (data && data.tv) {
                    let tvChannels = [];
                    for (let sub in data.tv) {
                        if (Array.isArray(data.tv[sub])) {
                            tvChannels = tvChannels.concat(data.tv[sub]);
                        }
                    }
                    allTvChannels = tvChannels;
                    renderChannels();
                    return;
                }
            } catch (e) {
                console.error('Erro ao ler cache do localStorage:', e);
            }
        }
        
        // If no cache, show loading and try to fetch from network
        // This part is simplified as the main page should have already fetched it.
        channelList.innerHTML = '<li class="text-gray-400">Carregue a lista na página inicial primeiro.</li>';
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
                <span>${channel.title}</span>
            `;
            li.addEventListener('click', () => {
                playChannel(channel.url);
                // Highlight the selected channel
                document.querySelectorAll('#channel-list li.active').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
            });
            channelList.appendChild(li);
        });
    }

    function playChannel(url) {
        if (Hls.isSupported()) {
            hls.destroy();
            hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoPlayer.play();
            });
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            videoPlayer.src = url;
            videoPlayer.addEventListener('loadedmetadata', () => {
                videoPlayer.play();
            });
        }
    }

    searchInput.addEventListener('input', (e) => {
        renderChannels(e.target.value);
    });

    const backButton = document.querySelector('.back-button');

    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault(); // Impede a navegação imediata

            if (hls) {
                hls.stopLoad();
                hls.destroy();
            }
            if (videoPlayer) {
                videoPlayer.pause();
                videoPlayer.src = "";
                videoPlayer.removeAttribute('src'); // For good measure
                videoPlayer.load();
            }

            // Atraso para garantir que tudo foi limpo antes de navegar
            setTimeout(() => {
                window.location.href = e.target.href;
            }, 100);
        });
    }

    loadM3U();
});