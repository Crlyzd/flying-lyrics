// --- SERVICES ---

async function fetchLyrics(retryCount = 0) {
    const meta = navigator.mediaSession.metadata;

    if (!meta || !meta.title) {
        if (retryCount < 5) setTimeout(() => fetchLyrics(retryCount + 1), 1000);
        return;
    }

    try {
        const query = `artist_name=${encodeURIComponent(meta.artist)}&track_name=${encodeURIComponent(meta.title)}`;

        // --- APPLY SAVED OFFSET ---
        const key = `${meta.artist} - ${meta.title}`;

        // Reset receipt — ensures popup never shows a stale previous-song source
        activeLyricSource = null;
        if (songOffsets[key] !== undefined) {
            syncOffset = songOffsets[key];
        } else {
            syncOffset = globalSyncOffset; // Default if no custom offset
        }
        // Broadcast new offset to Popup (so UI updates if open)
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', payload: { syncOffset } }).catch(() => { });

        // --- CACHE EARLY RETURN ---
        if (cachedLyrics.key === key && cachedLyrics.lines.length > 0) {
            lyricLines = cachedLyrics.lines;
            isCurrentLyricSynced = cachedLyrics.isSynced;

            if (typeof updateSyncIndicator === 'function') updateSyncIndicator();
            if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true;
            return;
        }

        let raw = "";

        // --- CHECK FOR MANUAL OVERRIDES ---
        const override = lyricsOverrides[key];
        if (override) {
            if (override.type === 'local') {
                raw = override.data; // Use the provided local text directly
                activeLyricSource = { type: 'local', id: null, name: key };
            } else if (override.type === 'api' && override.id) {
                const res = await fetch(`https://lrclib.net/api/get/${override.id}`);
                const data = await res.json();
                raw = data.syncedLyrics || data.plainLyrics || "";
                if (raw) activeLyricSource = { type: 'api', id: override.id, name: data.trackName || key, synced: !!data.syncedLyrics };
            } else if (override.type === 'netease' && override.id) {
                const resMsg = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ type: 'FETCH_NETEASE', payload: { id: override.id } }, resolve);
                });
                raw = resMsg?.lyric || "";
                if (raw) activeLyricSource = { type: 'netease', id: resMsg?.id || override.id, name: resMsg?.name || key };
            }
        }

        // --- RANKED SEARCH via LRCLIB ---
        if (!raw) {
            try {
                // Read the actual playing song duration to aid ranking
                const actualDuration = getPlayerState().duration || 0;
                const searchQuery = `artist_name=${encodeURIComponent(meta.artist)}&track_name=${encodeURIComponent(meta.title)}`;
                const res = await fetch(`https://lrclib.net/api/search?${searchQuery}`);

                if (res.ok) {
                    const candidates = await res.json();

                    if (Array.isArray(candidates) && candidates.length > 0) {
                        // --- RANKING ALGORITHM ---
                        // Score each candidate: huge bonus for synced lyrics,
                        // then penalize by how far the duration deviates from the actual song.
                        const scored = candidates.map(c => {
                            const isSynced = !!c.syncedLyrics;
                            const durationDelta = actualDuration > 0
                                ? Math.abs((c.duration || 0) - actualDuration)
                                : 0;
                            // 10000 point bonus for being synced, minus 1 point per second off
                            const score = (isSynced ? 10000 : 0) - durationDelta;
                            return { c, score };
                        });
                        scored.sort((a, b) => b.score - a.score);
                        const best = scored[0].c;

                        const syncedRaw = best.syncedLyrics || "";
                        const plainFallback = best.plainLyrics || "";

                        if (syncedRaw) {
                            // Best candidate has synced lyrics — best possible result
                            raw = syncedRaw;
                            activeLyricSource = { type: 'api', id: best.id, name: best.trackName || key, synced: true };
                        } else if (plainFallback) {
                            // Best candidate only has plain text — try Netease first
                            console.log("LRCLIB best match has only plain lyrics. Attempting Netease...");
                            const neteaseMsg = await new Promise(resolve => {
                                chrome.runtime.sendMessage({
                                    type: 'FETCH_NETEASE',
                                    payload: { query: `${meta.artist} ${meta.title}`, duration: actualDuration }
                                }, resolve);
                            });
                            const neteaseRaw = neteaseMsg?.lyric || "";
                            if (neteaseRaw) {
                                raw = neteaseRaw;
                                activeLyricSource = { type: 'netease', id: neteaseMsg?.id || null, name: neteaseMsg?.name || key, synced: false };
                            } else {
                                raw = plainFallback;
                                activeLyricSource = { type: 'api', id: best.id, name: best.trackName || key, synced: false };
                            }
                        }
                    }
                }
            } catch (err) {
                console.log("LRCLIB ranked search failed:", err);
            }
        }

        // --- FALLBACK TO NETEASE (lrclib returned nothing at all) ---
        if (!raw) {
            const actualDuration = getPlayerState().duration || 0;
            const neteaseQuery = `${meta.artist} ${meta.title}`;
            console.log("LRCLIB empty/failed. Falling back to Netease for:", neteaseQuery);
            const resMsg = await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    type: 'FETCH_NETEASE',
                    payload: { query: neteaseQuery, duration: actualDuration }
                }, resolve);
            });
            raw = resMsg?.lyric || "";
            if (raw) activeLyricSource = { type: 'netease', id: resMsg?.id || null, name: resMsg?.name || key };
        }

        if (!raw) {
            activeLyricSource = null; // Nothing was found for this song
            lyricLines = [{ time: 0, text: "No lyrics found", romaji: "", translation: "" }];
            isCurrentLyricSynced = false;
            if (typeof updateSyncIndicator === 'function') updateSyncIndicator();
            return;
        }

        const lines = raw.split('\n');
        const temp = [];

        // Clear the wrap-line cache so stale results from the previous song don't persist
        if (typeof wrapCache !== 'undefined') wrapCache.clear();

        // --- PSEUDO-SYNC LOGIC FOR UNSYNCED LYRICS ---
        const isSynced = /\[\d+:\d+\.\d+\]/.test(raw);
        isCurrentLyricSynced = isSynced;
        if (typeof updateSyncIndicator === 'function') updateSyncIndicator();

        if (!isSynced) {
            const cleanLines = lines.map(l => l.trim()).filter(l => l);
            if (cleanLines.length === 0) {
                lyricLines = [{ time: 0, text: "No lyrics found", romaji: "", translation: "" }];
                isCurrentLyricSynced = false;
                if (typeof updateSyncIndicator === 'function') updateSyncIndicator();
                return;
            }

            const duration = getPlayerState().duration || 180; // Default to 3 mins if duration is unreadable
            const timePerLine = duration / cleanLines.length;

            for (let i = 0; i < cleanLines.length; i++) {
                temp.push({
                    time: i * timePerLine,
                    text: cleanLines[i],
                    romaji: "",
                    translation: ""
                });
            }
        } else {
            // Standard LRC parsing
            for (let line of lines) {
                const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
                if (!match) continue;

                const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
                const text = match[3].trim();
                if (!text) continue;

                temp.push({ time, text, romaji: "", translation: "" });
            }
        }

        // --- NON-BLOCKING TRANSLATION RUNNER ---
        lyricLines = temp.length ? temp : [{ time: 0, text: "No Lyrics Available", romaji: "", translation: "" }];

        // Save to Cache immediately (translation references modify the array in place, so the cache will get translations as they arrive)
        cachedLyrics.key = key;
        cachedLyrics.lines = lyricLines;
        cachedLyrics.isSynced = isCurrentLyricSynced;

        if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true; // Invalidate cached layout

        // Fire off translations in the background without awaiting them
        translateExistingLyrics();
    } catch (e) {
        lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
        isCurrentLyricSynced = false;
        if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true;
        if (typeof updateSyncIndicator === 'function') updateSyncIndicator();
    }
}

function getPlayerState() {
    let currentTime = 0;
    let duration = 1;
    let paused = true;

    // --- SPOTIFY: Always use the DOM as primary source of truth ---
    // Spotify manages its own React state — audio.paused is unreliable there
    // (it may stay "playing" even when the UI is paused). The play button's
    // aria-label is the only accurate signal.
    if (window.location.hostname.includes('spotify')) {
        const timeEl = document.querySelector('[data-testid="playback-position"]');
        const durationEl = document.querySelector('[data-testid="playback-duration"]');
        const playBtn = document.querySelector('[data-testid="control-button-playpause"]');

        // Read paused state independently — don't gate it behind timeEl/durationEl.
        // If the play button isn't found, assume playing (safest visual default).
        if (playBtn) {
            paused = playBtn.getAttribute('aria-label') === 'Play';
        }

        if (timeEl && durationEl) {
            const currentStr = timeEl.textContent;
            duration = parseTime(durationEl.textContent) || 1;

            if (currentStr !== lastTimeStr) {
                lastTimeStr = currentStr;
                lastTimeValue = parseTime(currentStr);
                lastUpdateMs = performance.now();
            }

            currentTime = lastTimeValue;
            if (!paused) {
                currentTime += (performance.now() - lastUpdateMs) / 1000;
            }
        }

        return { currentTime, duration, paused };
    }

    // --- NON-SPOTIFY: Use media element (YouTube Music, etc.) ---
    // These sites use standard HTML5 audio/video whose native properties are reliable.
    const mediaElements = Array.from(document.querySelectorAll('video, audio'));

    // Prefer <audio> over <video> so YouTube Music's <video> is used correctly
    // while still avoiding accidental matches on silent background videos elsewhere.
    const audioEls = mediaElements.filter(m => m.tagName === 'AUDIO');
    const videoEls = mediaElements.filter(m => m.tagName === 'VIDEO');
    const pool = audioEls.length > 0 ? audioEls : videoEls;

    const activeMedia = pool.find(m => m.readyState >= 2 && !m.paused)
        || pool.find(m => m.readyState >= 2);

    if (activeMedia && activeMedia.duration > 0 && activeMedia.currentTime >= 0) {
        return { currentTime: activeMedia.currentTime, duration: activeMedia.duration, paused: activeMedia.paused };
    }

    return { currentTime, duration, paused };
}

function getCoverArt() {
    // 1. MediaSession API (Grab the last item, which is inherently the highest resolution)
    const meta = navigator.mediaSession?.metadata;
    if (meta && meta.artwork && meta.artwork.length > 0) {
        return meta.artwork[meta.artwork.length - 1].src;
    }

    // 2. Spotify DOM Fallback (Directly targets the bottom-left playing widget)
    const spotiImg = document.querySelector('[data-testid="now-playing-widget"] img') ||
        document.querySelector('img[data-testid="cover-art-image"]');
    if (spotiImg) return spotiImg.src;

    // 3. YouTube Music DOM Fallback
    const ytImg = document.querySelector('.ytmusic-player-bar img');
    if (ytImg) return ytImg.src;

    return "";
}

function translateExistingLyrics() {
    if (!lyricLines || lyricLines.length === 0) return;

    // Filter out placeholder lines from fetching translation
    const placeholders = ["Waiting for music...", "No lyrics found", "Network Error", "Wait for it...", "No Lyrics Available"];

    lyricLines.forEach(item => {
        // Skip placeholders
        if (placeholders.includes(item.text)) return;

        // Romaji Fetch
        if (!item.romaji && /[぀-ゟ゠-ヿ一-鿿가-힣]/.test(item.text)) {
            fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(item.text)}`)
                .then(r => r.json())
                .then(d => {
                    item.romaji = d?.[0]?.[0]?.[3] || "";
                    if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true;
                })
                .catch(() => { });
        }

        // Translation Fetch
        if (showTranslation && !item.translation) {
            fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translationLang}&dt=t&q=${encodeURIComponent(item.text)}`)
                .then(r => r.json())
                .then(d => {
                    if (d && d[0]) {
                        item.translation = d[0].map(x => x[0]).join('');
                        if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true;
                    }
                })
                .catch(() => { });
        }
    });
}
