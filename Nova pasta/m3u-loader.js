const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50 MB
const CACHE_VALIDITY_MS = 24 * 3600000; // 24 horas
let allChannels = null; // Cache in memory

function parseM3UInWorker(content) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./worker.js');

        worker.onmessage = (e) => {
            if (e.data.error) {
                reject(new Error(e.data.error));
            } else {
                resolve(e.data);
            }
            worker.terminate();
        };

        worker.onerror = (error) => {
            reject(error);
            worker.terminate();
        };

        worker.postMessage(content);
    });
}

function saveToCache(data) {
    let cacheData;
    try {
        cacheData = JSON.stringify({ timestamp: Date.now(), data });
        if (cacheData.length < MAX_CACHE_SIZE) {
            localStorage.setItem('m3u_data', cacheData);
            console.log('Cache salvo no localStorage');
        } else {
            console.warn('Cache muito grande para localStorage');
        }
    } catch (e) {
        console.error('Erro ao salvar no localStorage:', e);
    }
}

export async function loadM3UData() {
    if (allChannels) {
        return allChannels;
    }

    const cacheKey = 'm3u_data';
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_VALIDITY_MS && data) {
                allChannels = data;
                console.log('M3U data loaded from cache.');
                return allChannels;
            }
        } catch (e) {
            console.error('Error reading M3U from cache:', e);
        }
    }

    const m3uUrl = 'https://pub-b518a77f46ca4165b58d8329e13fb2a9.r2.dev/206609967_playlist.m3u';
    let content = null;

    try {
        const response = await fetch(m3uUrl, {
            headers: { 'Accept': 'text/plain,*/*' }
        });
        if (response.ok) {
            content = await response.text();
        }
    } catch (error) {
        console.error(`Failed to load ${m3uUrl}:`, error.message);
    }

    if (content) {
        try {
            const parsedData = await parseM3UInWorker(content);
            allChannels = parsedData;
            saveToCache(allChannels);
            return allChannels;
        } catch (error) {
            console.error('Error parsing M3U in worker:', error);
            throw new Error('Failed to process M3U list.');
        }
    } else {
        throw new Error('Failed to load M3U list from the specified source.');
    }
}