import { loadM3UData } from './m3u-loader.js';

document.addEventListener('DOMContentLoaded', async () => {
    const videoPlayer = document.getElementById('tvPlayer');
    const channelListUl = document.getElementById('channel-list');
    const searchInput = document.getElementById('channel-search');
    let hls;
    let channels = [];

    function playVideo(url) {
        if (hls) {
            hls.destroy();
        }
        if (Hls.isSupported() && url.includes('.m3u8')) {
            hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(videoPlayer);
        } else {
            videoPlayer.src = url;
        }
        videoPlayer.play();
    }

    function renderChannelList(filter = '') {
        channelListUl.innerHTML = '';
        const filteredChannels = channels.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));

        if (filteredChannels.length === 0) {
            channelListUl.innerHTML = '<li class="text-gray-400">Nenhum canal encontrado.</li>';
            return;
        }

        filteredChannels.forEach((channel, index) => {
            const li = document.createElement('li');
            li.textContent = channel.title;
            li.dataset.url = channel.url;
            li.addEventListener('click', () => {
                playVideo(channel.url);
                document.querySelectorAll('#channel-list li').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
            });
            channelListUl.appendChild(li);

            if (index === 0 && !filter) {
                li.click();
            }
        });
    }

    searchInput.addEventListener('input', () => {
        renderChannelList(searchInput.value);
    });

    try {
        const data = await loadM3UData();
        if (data.tv) {
            channels = Object.values(data.tv).flat().sort((a, b) => a.title.localeCompare(b.title));
            renderChannelList();
        } else {
            channelListUl.innerHTML = '<li class="text-red-500">Nenhuma categoria de TV encontrada.</li>';
        }
    } catch (error) {
        console.error('Failed to load TV channels:', error);
        channelListUl.innerHTML = `<li class="text-red-500">Erro ao carregar canais: ${error.message}</li>`;
    }
});
