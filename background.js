chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ---- Existing: focus the tab/window from content script ----
    if (message.type === 'FOCUS_TAB' && sender.tab) {
        chrome.tabs.update(sender.tab.id, { active: true });
        chrome.windows.update(sender.tab.windowId, { focused: true });
        sendResponse({ status: 'ok' });

        // ---- New: proxy Netease search (bypasses CORS in content script) ----
    } else if (message.type === 'FETCH_NETEASE_SEARCH') {
        const url = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(message.query)}&type=1&limit=5&offset=0`;
        fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                const songs = data?.result?.songs || [];
                sendResponse(songs.map(song => ({
                    id: song.id,
                    name: song.name,
                    artist: (song.ar || song.artists || []).map(a => a.name).join(', ') || ''
                })));
            })
            .catch(error => {
                console.error("Netease Search Error:", error);
                sendResponse([]);
            });
        return true; // keep channel open for async sendResponse

        // ---- New: proxy Netease lyrics by ID (bypasses CORS in content script) ----
    } else if (message.type === 'FETCH_NETEASE_LYRICS') {
        const url = `https://music.163.com/api/song/lyric?id=${message.id}&lv=1&kv=1&tv=-1`;
        fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            .then(res => res.ok ? res.json() : null)
            .then(data => sendResponse({ lyric: data?.lrc?.lyric || "" }))
            .catch(error => {
                console.error("Netease Lyrics Fetch Error:", error);
                sendResponse({ lyric: "" });
            });
        return true; // keep channel open for async sendResponse
    }
});
