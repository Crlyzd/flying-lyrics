chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FOCUS_TAB' && sender.tab) {
        // 1. Focus the tab itself
        chrome.tabs.update(sender.tab.id, { active: true });

        chrome.windows.update(sender.tab.windowId, { focused: true });

        sendResponse({ status: 'ok' });
    }

    if (message.type === 'FETCH_NETEASE') {
        const { id, query } = message.payload;

        // Direct ID lookup — used when the user explicitly selected a Netease result
        if (id) {
            fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`)
                .then(r => r.json())
                .then(data => {
                    sendResponse({ lyric: data?.lrc?.lyric || "" });
                })
                .catch(err => {
                    sendResponse({ lyric: "" });
                });
            return true;
        }

        // Fallback: search by query string, then pick the best match by duration
        fetch(`https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1`)
            .then(r => r.json())
            .then(data => {
                const songs = data?.result?.songs;
                if (!songs || songs.length === 0) throw new Error("No Netease track found");

                // --- NETEASE TOP-5 DURATION RANKING ---
                // Pick the best of the first 5 results based on how closely
                // each song's duration matches the actual playing track.
                // The `duration` from the payload is in seconds; Netease `dt` is in ms.
                const targetDuration = message.payload.duration || 0;
                const top5 = songs.slice(0, 5);
                const best = top5.reduce((prev, curr) => {
                    const prevDelta = Math.abs((prev.dt / 1000) - targetDuration);
                    const currDelta = Math.abs((curr.dt / 1000) - targetDuration);
                    return currDelta < prevDelta ? curr : prev;
                });

                return fetch(`https://music.163.com/api/song/lyric?id=${best.id}&lv=1&tv=-1`);
            })
            .then(r => r.json())
            .then(data => {
                sendResponse({ lyric: data?.lrc?.lyric || "" });
            })
            .catch(err => {
                sendResponse({ lyric: "" });
            });

        return true; // Keep message port open for async
    }

    if (message.type === 'SEARCH_NETEASE') {
        const query = message.payload.query;
        fetch(`https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1`)
            .then(r => r.json())
            .then(data => {
                const songs = data?.result?.songs || [];
                // Map to match LRCLIB format for the UI
                const results = songs.slice(0, 10).map(s => ({
                    id: s.id, // Netease ID
                    source: 'netease',
                    trackName: s.name,
                    artistName: s.ar ? s.ar.map(a => a.name).join(', ') : 'Unknown',
                    albumName: s.al ? s.al.name : 'Unknown',
                    duration: s.dt ? Math.floor(s.dt / 1000) : 0,
                    instrumental: false
                }));
                sendResponse({ results });
            })
            .catch(err => {
                sendResponse({ results: [] });
            });

        return true;
    }
});
