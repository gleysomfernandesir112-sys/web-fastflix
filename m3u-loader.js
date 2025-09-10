const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50 MB
const CACHE_VALIDITY_MS = 24 * 3600000; // 24 horas
let allChannels = null; // Cache in memory

function parseM3UInWorker(content) {
    return new Promise((resolve, reject) => {
        const workerCode = `
            self.onmessage = function(e) {
                try {
                    var content = e.data;
                    var lines = content.split('\n');
                    var allChannels = { filmes: {}, series: {}, tv: {} };
                    var currentChannel = null;

                    function normalizeTitle(title) {
                        return title ? title.trim().replace(/\b\w/g, function(c) { return c.toUpperCase(); }) : "Sem Título";
                    }

                    function parseGroup(group) {
                        var clean = group.replace(/[◆]/g, "").trim();
                        var parts = clean.split("|").map(function(part) { return part.trim(); });
                        var main = parts[0].toLowerCase();
                        var sub = parts.length > 1 ? parts[1] : "Outros";
                        return { main: main, sub: sub };
                    }

                    function categorizeChannel(channel) {
                        try {
                            var title = channel.title.toLowerCase();
                            var groupInfo = parseGroup(channel.group);
                            var main = groupInfo.main;
                            var sub = groupInfo.sub;
                            var hasSeriesPattern = /(s\d{1,2}e\d{1,2})|(temporada\s*\d+)|(episodio\s*\d+)|(ep\s*\d+)|(capitulo\s*\d+)|(season\s*\d+)|(episode\s*\d+)/i.test(title);
                            var looksLikeLinearChannel = /(24h|canal|mix|ao vivo|live|4k|fhd|hd|sd|channel|tv|plus|stream|broadcast)/i.test(title);

                            if (main.includes("canais") || main.includes("canal") || looksLikeLinearChannel) {
                                if (!allChannels.tv[sub]) allChannels.tv[sub] = [];
                                allChannels.tv[sub].push({ 
                                    title: normalizeTitle(channel.title), 
                                    url: channel.url, 
                                    logo: channel.logo,
                                    isLive: true
                                });
                                return;
                            }

                            if (main.includes("series") || main.includes("série") || hasSeriesPattern && !looksLikeLinearChannel) {
                                var seriesName, season, episodeTitle;
                                var match = title.match(/^(.*?)\s*(?:[Ss](\d{1,2})\s*[Ee](\d{1,2})|(temporada|season)\s*(\d+)|(episodio|ep|episode|capitulo)\s*(\d+))/i);
                                if (match) {
                                    seriesName = normalizeTitle(match[1] || title.replace(/(temporada|episodio|season|episode|capitulo).*/i, "").trim());
                                    season = match[2] || match[5] || match[7] || "1";
                                    episodeTitle = match[3] ? "Episódio " + match[3] : (match[7] ? "Episódio " + match[7] : normalizeTitle(title));
                                } else {
                                    seriesName = normalizeTitle(title.replace(/(temporada|episodio|season|episode|capitulo).*/i, "").trim());
                                    season = "1";
                                    episodeTitle = normalizeTitle(title);
                                }
                                var seriesKey = seriesName.toLowerCase();
                                if (!allChannels.series[sub]) allChannels.series[sub] = {};
                                var seriesSub = allChannels.series[sub];
                                if (!seriesSub[seriesKey]) {
                                    seriesSub[seriesKey] = { displayName: seriesName, seasons: {}, logo: channel.logo };
                                }
                                if (!seriesSub[seriesKey].seasons[season]) {
                                    seriesSub[seriesKey].seasons[season] = [];
                                }
                                seriesSub[seriesKey].seasons[season].push({ title: episodeTitle, url: channel.url, logo: channel.logo });
                                seriesSub[seriesKey].seasons[season].sort((a, b) => {
                                    var epA = parseInt(a.title.match(/\d+/)?.[0] || 0);
                                    var epB = parseInt(b.title.match(/\d+/)?.[0] || 0);
                                    return epA - epB;
                                });
                                return;
                            }

                            if (main.includes("filmes") || main.includes("filme") && !looksLikeLinearChannel && title.length > 5) {
                                if (!allChannels.filmes[sub]) allChannels.filmes[sub] = [];
                                allChannels.filmes[sub].push({ 
                                    title: normalizeTitle(channel.title), 
                                    url: channel.url, 
                                    logo: channel.logo 
                                });
                                return;
                            }

                            if (!allChannels.tv["Outros"]) allChannels.tv["Outros"] = [];
                            allChannels.tv["Outros"].push({ 
                                title: normalizeTitle(channel.title), 
                                url: channel.url, 
                                logo: channel.logo,
                                isLive: looksLikeLinearChannel
                            });
                        } catch (error) {
                            console.error("Erro ao categorizar canal:", channel.title, error);
                            if (!allChannels.tv["Outros"]) allChannels.tv["Outros"] = [];
                            allChannels.tv["Outros"].push({ 
                                title: normalizeTitle(channel.title), 
                                url: channel.url, 
                                logo: channel.logo,
                                isLive: false
                            });
                        }
                    }

                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        try {
                            if (line.startsWith("#EXTINF:")) {
                                var titleMatch = line.match(/,(.+)/) || line.match(/tvg-name="([^"]+)"/i);
                                var groupMatch = line.match(/group-title="([^"]+)"/i);
                                var logoMatch = line.match(/tvg-logo="([^"]+)"/i);
                                var title = titleMatch ? titleMatch[1].trim() : "Canal Desconhecido";
                                currentChannel = {
                                    title: title,
                                    url: "",
                                    group: groupMatch ? groupMatch[1] : "",
                                    logo: logoMatch ? logoMatch[1] : ""
                                };
                            } else if (line && !line.startsWith("#") && currentChannel) {
                                currentChannel.url = line;
                                categorizeChannel(currentChannel);
                                currentChannel = null;
                            }
                        }
                        catch (error) {
                            console.error("Erro ao processar linha", i, ":", line, error);
                            currentChannel = null;
                        }
                    }

                    self.postMessage(allChannels);
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