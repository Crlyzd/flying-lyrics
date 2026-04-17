chrome.runtime.onInstalled.addListener((details) => {
    chrome.runtime.setUninstallURL("https://forms.gle/QW6mLFdV1JnkVuzx9");

    // Open the update notification page whenever the Web Store pushes an update.
    // ("install" is skipped so first-time installs don't see the review prompt immediately.)
    if (details.reason === 'update') {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/pages/update.html')
        });
    }
});

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

                // --- NETEASE LAZY CHECK FALLBACK ---
                const targetDuration = message.payload.duration || 0;

                // 1. Get Top 5 and sort them by closest duration match
                const top5 = songs.slice(0, 5).sort((a, b) => {
                    const aDelta = Math.abs((a.dt / 1000) - targetDuration);
                    const bDelta = Math.abs((b.dt / 1000) - targetDuration);
                    return aDelta - bDelta;
                });

                // 2. Recursive function to check each match until we find real text
                const tryFetchLyric = (index) => {
                    if (index >= top5.length) {
                        // Exhausted all 5 attempts, none had lyrics
                        sendResponse({ lyric: "" });
                        return;
                    }

                    const candidate = top5[index];
                    fetch(`https://music.163.com/api/song/lyric?id=${candidate.id}&lv=1&tv=-1`)
                        .then(r => r.json())
                        .then(data => {
                            const lyricText = data?.lrc?.lyric || "";
                            if (lyricText.trim().length > 5) {
                                // Success! Found actual lyrics — also return the resolved ID and name
                                sendResponse({ lyric: lyricText, id: candidate.id, name: candidate.name || "" });
                            } else {
                                // Empty or junk lyrics, try the next best duration match
                                tryFetchLyric(index + 1);
                            }
                        })
                        .catch(() => {
                            // On network error for this specific ID, skip to next
                            tryFetchLyric(index + 1);
                        });
                };

                // Start the check loop
                tryFetchLyric(0);
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
