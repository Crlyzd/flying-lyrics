chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FOCUS_TAB' && sender.tab) {
        // 1. Focus the tab itself
        chrome.tabs.update(sender.tab.id, { active: true });

        chrome.windows.update(sender.tab.windowId, { focused: true });

        sendResponse({ status: 'ok' });
    }

    if (message.type === 'FETCH_NETEASE') {
        const query = message.payload.query;
        // Step 1. Use /pc endpoint to bypass abroad geoblocking
        fetch(`https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1`)
            .then(r => r.json())
            .then(data => {
                const id = data?.result?.songs?.[0]?.id;
                if (!id) throw new Error("No Netease track found");
                // Step 2. Get lyric
                return fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`);
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
