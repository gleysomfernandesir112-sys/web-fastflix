import { db, ref, get } from './firebase-init.js';

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

            // Auto-play the first channel
            if (index === 0 && !filter) {
                li.click();
            }
        });
    }

    searchInput.addEventListener('input', () => {
        renderChannelList(searchInput.value);
    });

    // A lógica para carregar canais de TV precisa ser adaptada.
    // Por enquanto, vamos usar um placeholder ou buscar do player.js se possível.
    // Idealmente, a lógica de parsing do M3U seria movida para um módulo compartilhado.
    // Como um passo inicial, vamos assumir que os canais estão em `sessionStorage` ou faremos um fetch.
    
    // Esta é uma simplificação. A lógica completa do player.js deve ser refatorada
    // para que `allChannels` seja acessível globalmente ou por módulos.
    const cachedData = localStorage.getItem('m3u_data');
    if (cachedData) {
        const { data } = JSON.parse(cachedData);
        if (data.tv) {
            // Flatten all tv channels from all subcategories into one list
            channels = Object.values(data.tv).flat();
            renderChannelList();
        } else {
            channelListUl.innerHTML = '<li class="text-red-500">Nenhuma categoria de TV encontrada no cache.</li>';
        }
    } else {
        channelListUl.innerHTML = '<li class="text-red-500">Cache de canais não encontrado. Por favor, carregue a página inicial primeiro.</li>';
    }
});
