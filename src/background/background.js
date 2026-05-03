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

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the Levenshtein edit distance between two strings (both lowercased).
 * Mirrors the implementation in services.js so the background script can
 * independently score Netease candidates by title similarity.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Edit distance (0 = identical).
 */
function levenshtein(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();
    const m = a.length, n = b.length;
    const dp = new Int32Array((m + 1) * (n + 1));
    for (let i = 0; i <= m; i++) dp[i * (n + 1)] = i;
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i * (n + 1) + j] = Math.min(
                dp[(i - 1) * (n + 1) + j] + 1,
                dp[i * (n + 1) + (j - 1)] + 1,
                dp[(i - 1) * (n + 1) + (j - 1)] + cost
            );
        }
    }
    return dp[m * (n + 1) + n];
}

/**
 * Converts a Levenshtein distance into a 0–100 similarity percentage.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function titleSimilarity(a, b) {
    if (!a && !b) return 100;
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FOCUS_TAB' && sender.tab) {
        // 1. Focus the tab itself
        chrome.tabs.update(sender.tab.id, { active: true });

        chrome.windows.update(sender.tab.windowId, { focused: true });

        sendResponse({ status: 'ok' });
    }

    if (message.type === 'FETCH_NETEASE') {
        const { id, query, cleanTitle } = message.payload;

        // Direct ID lookup — used when the user explicitly selected a Netease result
        if (id) {
            fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`)
                .then(r => r.json())
                .then(data => {
                    sendResponse({ lyric: data?.lrc?.lyric || "" });
                })
                .catch(() => {
                    sendResponse({ lyric: "" });
                });
            return true;
        }

        // Fallback: search by query string, then pick the best match using a
        // combined score of duration proximity and title similarity (Levenshtein).
        fetch(`https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1`)
            .then(r => r.json())
            .then(data => {
                const songs = data?.result?.songs;
                if (!songs || songs.length === 0) throw new Error("No Netease track found");

                const targetDuration = message.payload.duration || 0;

                // Score each of the top-5 candidates using:
                //   - durationDelta   : penalises a track whose length doesn't match the actual player duration
                //   - titleSimilarity : rewards a track whose title is close to our clean title
                //     (critical for Pass 3 / title-only searches where the query has no artist restriction)
                const top5 = songs.slice(0, 5)
                    .map(song => {
                        const durationDelta = Math.abs((song.dt / 1000) - targetDuration);
                        const titleSim = cleanTitle
                            ? titleSimilarity(cleanTitle, song.name || '')
                            : 50; // neutral score when cleanTitle was not provided
                        // Lower combinedScore = better candidate
                        const combinedScore = durationDelta - (titleSim * 10);
                        return { song, combinedScore };
                    })
                    .sort((a, b) => a.combinedScore - b.combinedScore)
                    .map(x => x.song);

                // Recursive function to check each ranked candidate until we find real lyrics
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
                                // Empty or junk lyrics, try the next best match
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
            .catch(() => {
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
            .catch(() => {
                sendResponse({ results: [] });
            });

        return true;
    }
});
