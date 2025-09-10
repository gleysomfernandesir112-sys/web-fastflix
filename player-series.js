document.addEventListener('DOMContentLoaded', () => {
    const videoPlayer = document.getElementById('videoPlayer');
    const seriesTitleEl = document.getElementById('series-title');
    const seasonSelectorContainer = document.getElementById('season-selector');
    const episodeListUl = document.getElementById('episode-list');
    const episodeSidebar = document.getElementById('episode-sidebar');
    const episodeToggleButton = document.querySelector('.episode-toggle-button');
    const prevEpisodeBtn = document.getElementById('prev-episode');
    const nextEpisodeBtn = document.getElementById('next-episode');

    let hls;
    let currentSeriesData;
    let currentSeasonNumber;
    let currentEpisodeIndex;

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

    function updateEpisode(season, episodeIndex) {
        currentSeasonNumber = season;
        currentEpisodeIndex = episodeIndex;

        const episode = currentSeriesData.seasons[season][episodeIndex];
        playVideo(episode.url);

        // Update URL for deep linking
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('season', season);
        urlParams.set('episode', episodeIndex);
        history.pushState(null, '', `${window.location.pathname}?${urlParams.toString()}`);

        // Update active state in the list
        document.querySelectorAll('#episode-list li').forEach(item => item.classList.remove('active'));
        const activeLi = document.querySelector(`[data-season='${season}'][data-episode-index='${episodeIndex}']`);
        if (activeLi) {
            activeLi.classList.add('active');
            activeLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Update button states
        prevEpisodeBtn.disabled = (episodeIndex === 0 && season === Object.keys(currentSeriesData.seasons)[0]);
        const lastSeason = Object.keys(currentSeriesData.seasons).pop();
        const lastEpisode = currentSeriesData.seasons[lastSeason].length - 1;
        nextEpisodeBtn.disabled = (episodeIndex === lastEpisode && season === lastSeason);
    }

    function renderEpisodes(season) {
        episodeListUl.innerHTML = '';
        currentSeriesData.seasons[season].forEach((episode, index) => {
            const li = document.createElement('li');
            li.textContent = episode.title;
            li.dataset.season = season;
            li.dataset.episodeIndex = index;
            li.addEventListener('click', () => {
                updateEpisode(season, index);
            });
            episodeListUl.appendChild(li);
        });
    }

    prevEpisodeBtn.addEventListener('click', () => {
        if (currentEpisodeIndex > 0) {
            updateEpisode(currentSeasonNumber, currentEpisodeIndex - 1);
        } else {
            const seasonKeys = Object.keys(currentSeriesData.seasons);
            const currentSeasonIndex = seasonKeys.indexOf(currentSeasonNumber);
            if (currentSeasonIndex > 0) {
                const prevSeason = seasonKeys[currentSeasonIndex - 1];
                const prevSeasonLastEpisode = currentSeriesData.seasons[prevSeason].length - 1;
                renderEpisodes(prevSeason);
                updateEpisode(prevSeason, prevSeasonLastEpisode);
                seasonSelectorContainer.querySelector('select').value = prevSeason;
            }
        }
    });

    nextEpisodeBtn.addEventListener('click', () => {
        if (currentEpisodeIndex < currentSeriesData.seasons[currentSeasonNumber].length - 1) {
            updateEpisode(currentSeasonNumber, currentEpisodeIndex + 1);
        } else {
            const seasonKeys = Object.keys(currentSeriesData.seasons);
            const currentSeasonIndex = seasonKeys.indexOf(currentSeasonNumber);
            if (currentSeasonIndex < seasonKeys.length - 1) {
                const nextSeason = seasonKeys[currentSeasonIndex + 1];
                renderEpisodes(nextSeason);
                updateEpisode(nextSeason, 0);
                seasonSelectorContainer.querySelector('select').value = nextSeason;
            }
        }
    });

    // Load series data from sessionStorage
    const seriesDataString = sessionStorage.getItem('currentSeries');
    if (seriesDataString) {
        currentSeriesData = JSON.parse(seriesDataString);
        seriesTitleEl.textContent = currentSeriesData.displayName;

        const sortedSeasons = Object.keys(currentSeriesData.seasons).sort((a, b) => a - b);
        const select = document.createElement('select');
        select.className = 'w-full bg-gray-700 text-white p-2 rounded-md';
        sortedSeasons.forEach(seasonNumber => {
            const option = document.createElement('option');
            option.value = seasonNumber;
            option.textContent = `Temporada ${seasonNumber}`;
            select.appendChild(option);
        });
        select.addEventListener('change', () => renderEpisodes(select.value));
        seasonSelectorContainer.appendChild(select);

        // Determine starting episode from URL or default to S1E1
        const urlParams = new URLSearchParams(window.location.search);
        const startSeason = urlParams.get('season') || sortedSeasons[0];
        const startEpisode = parseInt(urlParams.get('episode') || 0, 10);

        select.value = startSeason;
        renderEpisodes(startSeason);
        updateEpisode(startSeason, startEpisode);

    } else {
        seriesTitleEl.textContent = 'Nenhuma série selecionada';
        episodeSidebar.style.display = 'none';
    }

    episodeToggleButton.addEventListener('click', () => {
        episodeSidebar.classList.toggle('show');
    });
});
