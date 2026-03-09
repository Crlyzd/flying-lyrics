(() => {
    const fl = window.FLYING_LYRICS;

    // --- SERVICES ---

    fl.fetchLyrics = async function (retryCount = 0) {
        const meta = navigator.mediaSession.metadata;

        if (!meta || !meta.title) {
            if (retryCount < 5) setTimeout(() => fl.fetchLyrics(retryCount + 1), 1000);
            return;
        }

        try {
            const key = `${meta.artist} - ${meta.title}`;
            fl.applySavedSyncOffset(key);

            if (fl.checkLyricsCache(key)) return;

            let raw = await fl.resolveManualOverride(key);

            // --- ADVANCED PIPELINE: Prioritize Synced Lyrics Across Providers ---
            let lrcLibPlainFallback = null;
            let lrcLibSourceFallback = null;

            if (!raw) {
                raw = await fl.fetchFromLrcLib(meta, key);

                // If LRCLIB returned lyrics, but they are NOT synced, save them as a fallback
                // and force the system to check Netease to see if it has *synced* versions.
                if (raw && fl.activeLyricSource && !fl.activeLyricSource.synced) {
                    lrcLibPlainFallback = raw;
                    lrcLibSourceFallback = { ...fl.activeLyricSource };
                    raw = null; // Clear raw to force Netease check
                }
            }

            if (!raw) {
                let neteaseRaw = await fl.fetchFromNeteaseFallback(meta, key);

                if (neteaseRaw) {
                    // Determine if Netease returned synced lyrics by checking for timestamps like [00:12.34]
                    const isNeteaseSynced = /\[\d{2}:\d{2}\.\d{2,3}\]/.test(neteaseRaw);

                    if (isNeteaseSynced) {
                        raw = neteaseRaw;
                        fl.activeLyricSource.synced = true;
                    } else {
                        // Netease found lyrics, but they are ALSO plain text.
                        // Prefer LRCLIB's plain text (if we had it) because LRCLIB is dedicated to lyrics.
                        if (lrcLibPlainFallback) {
                            raw = lrcLibPlainFallback;
                            fl.activeLyricSource = lrcLibSourceFallback;
                        } else {
                            raw = neteaseRaw;
                            fl.activeLyricSource.synced = false;
                        }
                    }
                } else if (lrcLibPlainFallback) {
                    // Netease completely failed or returned nothing. Safely revert to LRCLIB's plain text.
                    raw = lrcLibPlainFallback;
                    fl.activeLyricSource = lrcLibSourceFallback;
                }
            }

            if (!raw) {
                fl.handleMissingLyrics();
                return;
            }

            const lines = raw.split('\n');
            fl.parseLrcOrGeneratePseudoSync(lines, raw);

            // Save to Cache immediately
            fl.cachedLyrics.key = key;
            fl.cachedLyrics.lines = fl.lyricLines;
            fl.cachedLyrics.isSynced = fl.isCurrentLyricSynced;

            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true; // Invalidate cached layout

            // Fire off translations in the background without awaiting them
            fl.translateExistingLyrics();
        } catch (e) {
            fl.lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
            fl.isCurrentLyricSynced = false;
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        }
    }

    // --- fetchLyrics Pipeline Helpers ---

    /**
     * Wraps fetch() with a hard timeout using AbortController.
     * When lrclib.net is down the TCP connection can hang for 30+ seconds before the
     * browser gives up, blocking the entire lyrics pipeline. This caps the wait to
     * `ms` milliseconds and rejects with a descriptive error so the caller can fall
     * back to Netease immediately.
     *
     * @param {string} url - URL to fetch.
     * @param {number} [ms=5000] - Timeout in milliseconds.
     * @returns {Promise<Response>}
     */
    fl._fetchWithTimeout = function (url, ms = 5000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return fetch(url, { signal: controller.signal })
            .finally(() => clearTimeout(timer));
    };

    fl.applySavedSyncOffset = function (key) {
        fl.activeLyricSource = null;
        fl.syncOffset = fl.songOffsets[key] !== undefined ? fl.songOffsets[key] : fl.globalSyncOffset;
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', payload: { syncOffset: fl.syncOffset } }).catch(() => { });
    }

    fl.checkLyricsCache = function (key) {
        if (fl.cachedLyrics.key === key && fl.cachedLyrics.lines.length > 0) {
            fl.lyricLines = fl.cachedLyrics.lines;
            fl.isCurrentLyricSynced = fl.cachedLyrics.isSynced;
            if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            return true;
        }
        return false;
    }

    fl.resolveManualOverride = async function (key) {
        const override = fl.lyricsOverrides[key];
        if (!override) return "";

        if (override.type === 'local') {
            fl.activeLyricSource = { type: 'local', id: null, name: key };
            return override.data;
        } else if (override.type === 'api' && override.id) {
            const res = await fl._fetchWithTimeout(`https://lrclib.net/api/get/${override.id}`);
            const data = await res.json();
            const raw = data.syncedLyrics || data.plainLyrics || "";
            if (raw) fl.activeLyricSource = { type: 'api', id: override.id, name: data.trackName || key, synced: !!data.syncedLyrics };
            return raw;
        } else if (override.type === 'netease' && override.id) {
            const resMsg = await new Promise(resolve => {
                chrome.runtime.sendMessage({ type: 'FETCH_NETEASE', payload: { id: override.id } }, resolve);
            });
            const raw = resMsg?.lyric || "";
            if (raw) fl.activeLyricSource = { type: 'netease', id: resMsg?.id || override.id, name: resMsg?.name || key };
            return raw;
        }
        return "";
    }

    fl.fetchFromLrcLib = async function (meta, key) {
        try {
            const actualDuration = fl.getPlayerState().duration || 0;
            const searchQuery = `artist_name=${encodeURIComponent(meta.artist)}&track_name=${encodeURIComponent(meta.title)}`;
            const res = await fl._fetchWithTimeout(`https://lrclib.net/api/search?${searchQuery}`);

            if (!res.ok) return "";
            const candidates = await res.json();
            if (!Array.isArray(candidates) || candidates.length === 0) return "";

            const scored = candidates.map(c => {
                const isSynced = !!c.syncedLyrics;
                const durationDelta = actualDuration > 0 ? Math.abs((c.duration || 0) - actualDuration) : 0;
                const score = (isSynced ? 10000 : 0) - durationDelta;
                return { c, score };
            });
            scored.sort((a, b) => b.score - a.score);
            const best = scored[0].c;

            if (best.syncedLyrics) {
                fl.activeLyricSource = { type: 'api', id: best.id, name: best.trackName || key, synced: true };
                return best.syncedLyrics;
            } else if (best.plainLyrics) {
                console.log("LRCLIB best match has only plain lyrics. Delaying fallback check.");
                fl.activeLyricSource = { type: 'api', id: best.id, name: best.trackName || key, synced: false };
                return best.plainLyrics;
            }
        } catch (err) {
            // AbortError = our 5s timeout fired; any other error = network/API failure.
            // Either way, log it and let the caller fall through to Netease.
            console.log("LRCLIB ranked search failed:", err.name === 'AbortError' ? 'Request timed out (5s)' : err);
        }
        return "";
    }

    fl.fetchFromNeteaseFallback = async function (meta, key) {
        const actualDuration = fl.getPlayerState().duration || 0;
        const neteaseQuery = `${meta.artist} ${meta.title}`;
        console.log("Falling back to Netease for:", neteaseQuery);

        const resMsg = await new Promise(resolve => {
            chrome.runtime.sendMessage({
                type: 'FETCH_NETEASE',
                payload: { query: neteaseQuery, duration: actualDuration }
            }, resolve);
        });

        const raw = resMsg?.lyric || "";
        if (raw) fl.activeLyricSource = { type: 'netease', id: resMsg?.id || null, name: resMsg?.name || key };
        return raw;
    }

    fl.handleMissingLyrics = function () {
        fl.activeLyricSource = null;
        fl.lyricLines = [{ time: 0, text: "No lyrics found", romaji: "", translation: "" }];
        fl.isCurrentLyricSynced = false;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
    }

    fl.parseLrcOrGeneratePseudoSync = function (lines, rawStr) {
        if (typeof fl.wrapCache !== 'undefined') fl.wrapCache.clear();
        const temp = [];

        const isSynced = /\[\d+:\d+\.\d+\]/.test(rawStr);
        fl.isCurrentLyricSynced = isSynced;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();

        if (!isSynced) {
            const cleanLines = lines.map(l => l.trim()).filter(l => l);
            if (cleanLines.length === 0) {
                fl.handleMissingLyrics();
                return;
            }

            const duration = fl.getPlayerState().duration || 180;
            const timePerLine = duration / cleanLines.length;

            for (let i = 0; i < cleanLines.length; i++) {
                temp.push({ time: i * timePerLine, text: cleanLines[i], romaji: "", translation: "" });
            }
        } else {
            for (let line of lines) {
                const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
                if (!match) continue;
                const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
                const text = match[3].trim();
                if (!text) continue;
                temp.push({ time, text, romaji: "", translation: "" });
            }
        }

        fl.lyricLines = temp.length ? temp : [{ time: 0, text: "No Lyrics Available", romaji: "", translation: "" }];
    }

    fl.getPlayerState = function () {
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
                duration = fl.parseTime(durationEl.textContent) || 1;

                if (currentStr !== fl.lastTimeStr) {
                    fl.lastTimeStr = currentStr;
                    fl.lastTimeValue = fl.parseTime(currentStr);
                    fl.lastUpdateMs = performance.now();
                }

                currentTime = fl.lastTimeValue;
                if (!paused) {
                    currentTime += (performance.now() - fl.lastUpdateMs) / 1000;
                }
            }

            return { currentTime, duration, paused };
        }

        // --- NON-SPOTIFY: Use media element (YouTube Music, etc.) ---
        // These sites use standard HTML5 audio/video whose native properties are reliable.
        // OPT-5: Cache the active media element in fl._mediaEl to avoid a full DOM
        // querySelectorAll scan every rAF frame. Re-scan only when the cached reference
        // is gone or the element is no longer ready (e.g. after a page navigation).
        if (!fl._mediaEl || fl._mediaEl.readyState < 1) {
            const mediaElements = Array.from(document.querySelectorAll('video, audio'));

            // Prefer <audio> over <video> so YouTube Music's <video> is used correctly
            // while still avoiding accidental matches on silent background videos elsewhere.
            const audioEls = mediaElements.filter(m => m.tagName === 'AUDIO');
            const videoEls = mediaElements.filter(m => m.tagName === 'VIDEO');
            const pool = audioEls.length > 0 ? audioEls : videoEls;

            fl._mediaEl = pool.find(m => m.readyState >= 2 && !m.paused)
                || pool.find(m => m.readyState >= 2)
                || null;
        }

        const activeMedia = fl._mediaEl;
        if (activeMedia && activeMedia.duration > 0 && activeMedia.currentTime >= 0) {
            return { currentTime: activeMedia.currentTime, duration: activeMedia.duration, paused: activeMedia.paused };
        }

        return { currentTime, duration, paused };
    }

    fl.getCoverArt = function () {
        const isValid = (src) => src && src !== window.location.href && src !== window.location.origin + '/';

        // 1. MediaSession API (Grab the last item, which is inherently the highest resolution)
        const meta = navigator.mediaSession?.metadata;
        if (meta && meta.artwork && meta.artwork.length > 0) {
            const src = meta.artwork[meta.artwork.length - 1].src;
            if (isValid(src)) return src;
        }

        // 2. Spotify DOM Fallback (Directly targets the bottom-left playing widget)
        const spotiImg = document.querySelector('[data-testid="now-playing-widget"] img') ||
            document.querySelector('img[data-testid="cover-art-image"]');
        if (spotiImg && isValid(spotiImg.src)) return spotiImg.src;

        // 3. YouTube Music DOM Fallback
        const ytImg = document.querySelector('.ytmusic-player-bar img');
        if (ytImg && isValid(ytImg.src)) return ytImg.src;

        return "";
    }

    fl.translateExistingLyrics = async function () {
        if (!fl.lyricLines || fl.lyricLines.length === 0) return;

        const placeholders = ["Waiting for music...", "No lyrics found", "Network Error", "Wait for it...", "No Lyrics Available"];

        // 1. Gather all lines that actually need Romaji
        const romajiQueue = [];
        fl.lyricLines.forEach((item, index) => {
            if (!placeholders.includes(item.text) && !item.romaji && /[぀-ゟ゠-ヿ一-鿿가-힣]/.test(item.text)) {
                romajiQueue.push({ index, text: item.text });
            }
        });

        // 2. Gather all lines that actually need Translation
        const transQueue = [];
        if (fl.showTranslation) {
            fl.lyricLines.forEach((item, index) => {
                if (!placeholders.includes(item.text) && !item.translation) {
                    transQueue.push({ index, text: item.text });
                }
            });
        }

        // Process Romaji in batches
        if (romajiQueue.length > 0) {
            await fl.processTranslateBatch(romajiQueue, 'rm', 'en', (itemIndex, resultText) => {
                fl.lyricLines[itemIndex].romaji = resultText;
            });
        }

        // Process Translations in batches
        if (transQueue.length > 0) {
            await fl.processTranslateBatch(transQueue, 't', fl.translationLang, (itemIndex, resultText) => {
                fl.lyricLines[itemIndex].translation = resultText;
            });
        }

        if ((romajiQueue.length > 0 || transQueue.length > 0) && typeof fl.needsLayoutUpdate !== 'undefined') {
            fl.needsLayoutUpdate = true;
        }
    }

    /**
     * Batches translation requests to prevent Google Translate API 429 Too Many Requests errors.
     * Joins ~15 lines using a delimiter mapping, fetching them as a single block.
     */
    fl.processTranslateBatch = async function (queue, dtMode, targetLang, applyCallback) {
        const CHUNK_SIZE = 15; // Max lines per single fetch request
        const DELIMITER = ' ||| ';

        for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
            const chunk = queue.slice(i, i + CHUNK_SIZE);
            const combinedText = chunk.map(q => q.text).join(DELIMITER);

            try {
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=${dtMode}&q=${encodeURIComponent(combinedText)}`);
                if (!res.ok) continue;

                const data = await res.json();

                let translatedCombo = "";
                if (dtMode === 'rm') {
                    // Romaji format is slightly different. Punctuation doesn't get romaji and returns null.
                    // We fallback to x[0] to preserve our ' ||| ' delimiters.
                    translatedCombo = data?.[0]?.map(x => x[3] || x[0] || "").join("") || "";
                } else if (dtMode === 't' && data && data[0]) {
                    // Standard translation sentences are split into multiple arrays if long
                    translatedCombo = data[0].map(x => x[0] || "").join('');
                }

                if (!translatedCombo) continue;

                // Split back by our delimiter
                // The API often adds spaces around punctuation (e.g. converting '|||' into '| | |') so we split flexibly.
                const translatedLines = translatedCombo.split(/\s*\|\s*\|\s*\|\s*/);

                // Apply back to the original indexes
                for (let j = 0; j < chunk.length; j++) {
                    if (translatedLines[j]) {
                        applyCallback(chunk[j].index, translatedLines[j].trim());
                    }
                }

                // Trigger layout recalculation immediately so the canvas allocates
                // vertical space for the newly fetched translations. Without this,
                // the canvas blindly draws them on top of existing text until the
                // active lyric advances.
                if (typeof fl.needsLayoutUpdate !== 'undefined') {
                    fl.needsLayoutUpdate = true;
                }
            } catch (e) {
                console.log("Batch translation failed:", e);
            }
        }
    }

})();
