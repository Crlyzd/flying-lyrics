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
            } else if (override.type === 'api' && override.id) {
                const res = await fetch(`https://lrclib.net/api/get/${override.id}`);
                const data = await res.json();
                raw = data.syncedLyrics || data.plainLyrics || "";
            } else if (override.type === 'netease' && override.id) {
                const resMsg = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ type: 'FETCH_NETEASE', payload: { id: override.id } }, resolve);
                });
                raw = resMsg?.lyric || "";
            }
        }

        // --- FALLBACK TO STANDARD SEARCH ---
        if (!raw) {
            try {
                const res = await fetch(`https://lrclib.net/api/get?${query}`);
                if (res.ok) {
                    const data = await res.json();
                    raw = data.syncedLyrics || data.plainLyrics || "";
                }
            } catch (err) {
                console.log("LRCLIB failed to fetch");
            }
        }

        // --- FALLBACK TO NETEASE ---
        if (!raw) {
            const neteaseQuery = `${meta.artist} ${meta.title}`;
            console.log("LRCLIB empty/failed. Falling back to Netease for:", neteaseQuery);
            const resMsg = await new Promise(resolve => {
                chrome.runtime.sendMessage({ type: 'FETCH_NETEASE', payload: { query: neteaseQuery } }, resolve);
            });
            raw = resMsg?.lyric || "";
        }

        if (!raw) {
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
        if (temp.length > 0) {
            temp.forEach(item => {
                if (/[぀-ゟ゠-ヿ一-鿿가-힣]/.test(item.text)) {
                    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(item.text)}`)
                        .then(r => r.json())
                        .then(d => {
                            item.romaji = d?.[0]?.[0]?.[3] || "";
                            if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true; // Fix overlap
                        })
                        .catch(() => { });
                }

                if (showTranslation) {
                    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translationLang}&dt=t&q=${encodeURIComponent(item.text)}`)
                        .then(r => r.json())
                        .then(d => {
                            if (d && d[0]) {
                                item.translation = d[0].map(x => x[0]).join('');
                                if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true; // Fix overlap
                            }
                        })
                        .catch(() => { });
                }
            });
        }
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
