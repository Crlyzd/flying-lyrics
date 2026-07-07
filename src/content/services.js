(() => {
    const fl = window.FLYING_LYRICS;

    // --- SERVICES ---

    // ─────────────────────────────────────────────────────────
    //  METADATA SANITIZATION HELPERS
    // ─────────────────────────────────────────────────────────

    /**
     * Computes the Levenshtein edit distance between two strings (both lowercased).
     * Used to score candidate title similarity when ranking lyrics search results.
     *
     * @param {string} a
     * @param {string} b
     * @returns {number} Edit distance (0 = identical).
     */
    fl.levenshtein = function (a, b) {
        a = a.toLowerCase();
        b = b.toLowerCase();
        const m = a.length, n = b.length;
        // Allocate a flat Int32Array for speed (avoids nested array allocation)
        const dp = new Int32Array((m + 1) * (n + 1));
        for (let i = 0; i <= m; i++) dp[i * (n + 1)] = i;
        for (let j = 0; j <= n; j++) dp[j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i * (n + 1) + j] = Math.min(
                    dp[(i - 1) * (n + 1) + j] + 1,    // deletion
                    dp[i * (n + 1) + (j - 1)] + 1,    // insertion
                    dp[(i - 1) * (n + 1) + (j - 1)] + cost // substitution
                );
            }
        }
        return dp[m * (n + 1) + n];
    };

    /**
     * Converts a Levenshtein distance into a 0–100 similarity percentage.
     *
     * @param {string} a
     * @param {string} b
     * @returns {number} Similarity percentage (100 = identical).
     */
    fl.titleSimilarity = function (a, b) {
        if (!a && !b) return 100;
        if (!a || !b) return 0;
        const maxLen = Math.max(a.length, b.length);
        return Math.round((1 - fl.levenshtein(a, b) / maxLen) * 100);
    };

    /**
     * Strips common noise keywords from a song title.
     * Uses two passes:
     *   1. Remove bracketed/parenthesised segments containing noise keywords.
     *   2. Remove trailing " - <noise keyword>…" suffixes.
     *
     * Master Noise List categories:
     *   Production  : remaster, remastered, remix, rework, vip, mix, stereo, mono, hi-res, high res
     *   Versions    : radio edit, extended, club mix, dub, single version, album version, deluxe
     *   Performance : live, acoustic, unplugged, demo, session, instrumental, a cappella, cover
     *   Release Type: bonus track, hidden track, b-side, explicit, clean, edited, anniversary
     *   Media Tags  : official video, official audio, lyrics video, mv, hd, hq, 4k, 1080p
     *   Collab tags : feat., ft., featuring, with, vs.
     *
     * @param {string} title - Raw title string.
     * @returns {string} Cleaned title.
     */
    fl.cleanTitle = function (title) {
        // Ordered list of noise terms (longer multi-word phrases first to avoid partial matches)
        const noiseTerms = [
            'official video', 'official audio', 'official music video', 'lyrics video',
            'radio edit', 'club mix', 'single version', 'album version', 'bonus track',
            'hidden track', 'high res', 'hi-res', 'a cappella',
            'remaster', 'remastered', 'remix', 'rework', 'vip', 'stereo', 'mono',
            'extended', 'deluxe', 'dub', 'live', 'acoustic', 'unplugged', 'demo',
            'session', 'instrumental', 'cover', 'explicit', 'clean', 'edited',
            'anniversary', 'b-side', 'mv', '4k', '1080p', 'hq', 'hd',
            'feat\.', 'ft\.', 'featuring', 'with', 'vs\.'
        ].join('|');

        // Pass 1: Remove entire parenthesised/bracketed groups that contain a noise keyword
        //   e.g. "Song Name (2009 Remaster)" → "Song Name"
        //        "Song Name [Official Video]" → "Song Name"
        const bracketRegex = new RegExp(
            `\\s*[([\\[](?:[^\\]()[\\]]*?(?:${noiseTerms})[^\\]()[\\]]*?)[)\\]]`,
            'gi'
        );
        let clean = title.replace(bracketRegex, '');

        // Pass 2: Remove trailing " - <noise keyword>" suffixes (no brackets)
        //   e.g. "Song Name - Remastered" → "Song Name"
        //        "Song Name - Radio Edit" → "Song Name"
        const trailingRegex = new RegExp(
            `\\s*-\\s*(?:${noiseTerms}).*$`,
            'gi'
        );
        clean = clean.replace(trailingRegex, '');

        return clean.trim();
    };

    /**
     * Extracts the primary (first-listed) artist from a raw artist string.
     * Handles separators: commas, ampersands, feat./ft./featuring, "with", "vs.", " x ".
     *
     * @param {string} artist - Raw artist string.
     * @returns {string} Primary artist name.
     */
    fl.extractPrimaryArtist = function (artist) {
        // Split on English and full-width/Japanese separators
        let primary = artist.split(/,|&|＆|、|・|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bvs\.?\b|\sx\s/i)[0].trim();
        // Strip CV annotations: e.g., (CV:Name), (CV.Name), （CV：Name）
        primary = primary.replace(/\s*[（\(]CV[.:：]?[^）\)]*[）\)]/gi, '').trim();
        return primary;
    };

    // generateSearchPasses removed — search is now handled by the background
    // engine via UNIFIED_AUTO_SEARCH. See src/background/searchEngine.js.


    fl.fetchLyrics = async function (retryCount = 0) {
        const meta = navigator.mediaSession.metadata;

        if (!meta || !meta.title) {
            if (retryCount < 5) {
                setTimeout(() => fl.fetchLyrics(retryCount + 1), 1000);
            } else if (retryCount === 5) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: {
                        eventName: 'context_failure',
                        params: { failure_reason: 'metadata_extraction_failed' }
                    }
                });
            }
            return;
        }

        if (fl._currentFetchController) {
            fl._currentFetchController.abort();
        }
        fl._currentFetchController = new AbortController();
        const abortSignal = fl._currentFetchController.signal;

        try {
            const key = `${meta.artist} - ${meta.title}`;
            fl.applySavedSyncOffset(key);

            // Tier 1: in-memory cache (instant, same session)
            if (fl.checkLyricsCache(key)) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: {
                        eventName: 'cache_check',
                        params: { result: 'hit', tier: 'memory' }
                    }
                });
                return;
            }

            // Tier 2: chrome.storage.local (survives tab refreshes and browser restarts)
            if (await fl.loadFromPersistentCache(key)) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: {
                        eventName: 'cache_check',
                        params: { result: 'hit', tier: 'persistent' }
                    }
                });
                return;
            }

            // Tier 3 Cache Miss
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                payload: {
                    eventName: 'cache_check',
                    params: { result: 'miss' }
                }
            });

            // Tier 3: network fetch
            let raw = await fl.resolveManualOverride(key, abortSignal);

            if (!raw && fl.lyricsOverrides && fl.lyricsOverrides[key]) {
                delete fl.lyricsOverrides[key];
                FLYING_LYRICS.storage.set({ lyricsOverrides: fl.lyricsOverrides });
            }

            // ─────────────────────────────────────────────────────────
            //  MULTI-PASS SEARCH PIPELINE
            //
            //  We try up to 3 progressively-cleaner metadata variants:
            //    Pass 1 — Exact   : raw artist + raw title
            //    Pass 2 — Cleaned : primary artist + noise-stripped title
            //    Pass 3 — Title   : no artist + noise-stripped title
            //
            //  For each pass we query LRCLIB first, then Netease.
            //  - A SYNCED result stops the loop immediately.
            //  - A PLAIN TEXT result is saved as a fallback; the loop
            //    continues trying to find a synced result in later passes.
            //  - If the loop exhausts all passes, we use the best plain
            //    text we collected (LRCLIB preferred over Netease).
            // ─────────────────────────────────────────────────────────
            let initialSearchTimedOut = false;

            if (!raw) {
                // Delegate all search work to the background engine.
                // It runs LRCLIB + Netease concurrently and uses lazy evaluation
                // for Netease synced detection (see src/background/searchEngine.js).
                if (abortSignal?.aborted) throw new Error('TrackChanged');

                const { duration } = fl.getPlayerState();
                const searchResult = await new Promise(resolve =>
                    chrome.runtime.sendMessage({
                        type: 'UNIFIED_AUTO_SEARCH',
                        payload: {
                            rawArtist: meta.artist || '',
                            rawTitle:  meta.title  || '',
                            duration:  duration    || 0,
                            timeoutMs: 5000 // Strict 5-second initial timeout
                        }
                    }, resolve)
                );

                if (abortSignal?.aborted) throw new Error('TrackChanged');

                if (searchResult?.result) {
                    raw = searchResult.result.rawLyric;
                    fl.activeLyricSource = searchResult.result.source;
                    initialSearchTimedOut = !!searchResult.result.hasTimeout;
                }
            }

            // Immediately parse and render if we got something in the first pass
            if (raw) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: {
                        eventName: 'lyrics_fetch_result',
                        params: { status: 'success' }
                    }
                });

                const lines = raw.split('\n');
                fl.parseLrcOrGeneratePseudoSync(lines, raw);

                // --- LYRIC TIMESTAMP SPAN VALIDATION ---
                if (fl.isCurrentLyricSynced && fl.lyricLines.length > 1) {
                    const lastTs = fl.lyricLines[fl.lyricLines.length - 1].time;
                    const realDuration = fl.getPlayerState().duration;
                    if (realDuration > 60 && lastTs < realDuration * 0.5) {
                        console.log(`FL: Synced lyrics span only ${Math.round(lastTs)}s vs ${Math.round(realDuration)}s track — demoting to pseudo-sync.`);
                        fl.isCurrentLyricSynced = false;
                        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                        const cleanLines = raw
                            .split('\n')
                            .map(l => l.replace(/^\[\d+:\d+\.\d+\]/, '').trim())
                            .filter(l => l);
                        const timePerLine = realDuration / cleanLines.length;
                        fl.lyricLines = cleanLines.map((text, i) => ({
                            time: i * timePerLine, text, romaji: "", translation: ""
                        }));
                    }
                }

                fl.cachedLyrics.key = key;
                fl.cachedLyrics.lines = fl.lyricLines;
                fl.cachedLyrics.isSynced = fl.isCurrentLyricSynced;
                fl.cachedLyrics.translationLang = fl.translationLang;

                if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;

                // Fire-and-forget translation and cache saving
                fl.translateExistingLyrics().then(() => {
                    fl.saveToPersistentCache(key);
                });
            }

            // Trigger retry/deep search if we found nothing OR if a timeout occurred
            if (!raw || initialSearchTimedOut) {
                if (!raw) {
                    // Switch to Album Cover Mode immediately (loading indicator / background retry)
                    chrome.runtime.sendMessage({
                        type: 'TRACK_EVENT',
                        payload: {
                            eventName: 'lyrics_fetch_result',
                            params: { status: 'failure', error_type: 'no_match_first_pass' }
                        }
                    });
                    fl.handleMissingLyrics();
                }

                if (typeof fl.setIndicatorRetrying === 'function') {
                    fl.setIndicatorRetrying(true);
                }

                try {
                    const { duration } = fl.getPlayerState();
                    const retryResult = await new Promise(resolve =>
                        chrome.runtime.sendMessage({
                            type: 'UNIFIED_AUTO_SEARCH',
                            payload: {
                                rawArtist: meta.artist || '',
                                rawTitle:  meta.title  || '',
                                duration:  duration    || 0,
                                timeoutMs: 30000 // 30-second timeout for background retry
                            }
                        }, resolve)
                    );

                    if (abortSignal?.aborted) {
                        if (typeof fl.setIndicatorRetrying === 'function') fl.setIndicatorRetrying(false);
                        return;
                    }

                    if (retryResult?.result?.rawLyric) {
                        if (retryResult.result.rawLyric === raw) {
                            return;
                        }
                        raw = retryResult.result.rawLyric;
                        fl.activeLyricSource = retryResult.result.source;

                        chrome.runtime.sendMessage({
                            type: 'TRACK_EVENT',
                            payload: {
                                eventName: 'lyrics_fetch_result',
                                params: { status: 'success_on_retry' }
                            }
                        });

                        fl.activateLyrics();

                        const lines = raw.split('\n');
                        fl.parseLrcOrGeneratePseudoSync(lines, raw);

                        // Sync Validation
                        if (fl.isCurrentLyricSynced && fl.lyricLines.length > 1) {
                            const lastTs = fl.lyricLines[fl.lyricLines.length - 1].time;
                            const realDuration = fl.getPlayerState().duration;
                            if (realDuration > 60 && lastTs < realDuration * 0.5) {
                                fl.isCurrentLyricSynced = false;
                                if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                                const cleanLines = raw
                                    .split('\n')
                                    .map(l => l.replace(/^\[\d+:\d+\.\d+\]/, '').trim())
                                    .filter(l => l);
                                const timePerLine = realDuration / cleanLines.length;
                                fl.lyricLines = cleanLines.map((text, i) => ({
                                    time: i * timePerLine, text, romaji: "", translation: ""
                                }));
                            }
                        }

                        fl.cachedLyrics.key = key;
                        fl.cachedLyrics.lines = fl.lyricLines;
                        fl.cachedLyrics.isSynced = fl.isCurrentLyricSynced;
                        fl.cachedLyrics.translationLang = fl.translationLang;

                        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;

                        await fl.translateExistingLyrics();
                        fl.saveToPersistentCache(key);
                    } else {
                        if (!raw) {
                            chrome.runtime.sendMessage({
                                type: 'TRACK_EVENT',
                                payload: {
                                    eventName: 'lyrics_fetch_result',
                                    params: { status: 'failure', error_type: 'no_match_retry' }
                                }
                            });
                        }
                    }
                } catch (retryErr) {
                    console.warn("FL: Background retry error:", retryErr);
                } finally {
                    if (typeof fl.setIndicatorRetrying === 'function') {
                        fl.setIndicatorRetrying(false);
                    }
                }
            }
        } catch (e) {
            if (e.message === 'TrackChanged' || e.name === 'AbortError') {
                console.log("FL: Aborted previous fetchLyrics pipeline (track changed).");
                return;
            }
            const errType = e.name === 'AbortError' || e.message?.includes('timeout') ? 'timeout' : 'network_error';
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                payload: {
                    eventName: 'lyrics_fetch_result',
                    params: { status: 'failure', error_type: errType }
                }
            });
            fl.lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
            fl.isCurrentLyricSynced = false;
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        }
    }

    // --- PERSISTENT LYRICS CACHE (chrome.storage.local) ---

    /**
     * Tier-2 cache read: looks up `key` in chrome.storage.local.
     * On hit, populates fl.lyricLines + the in-memory cache and fires
     * translateExistingLyrics() to fill any missing translations (e.g. if
     * CC was off during the original fetch).
     *
     * @param {string} key - "Artist - Title" cache key.
     * @returns {Promise<boolean>} true if the cache was hit.
     */
    fl.loadFromPersistentCache = async function (key) {
        return new Promise(resolve => {
            FLYING_LYRICS.storage.get('lyricsCache', ({ lyricsCache }) => {
                const entry = lyricsCache?.entries?.[key];
                if (!entry || !Array.isArray(entry.lines) || entry.lines.length === 0) {
                    return resolve(false);
                }

                fl.lyricLines = entry.lines;
                fl.isCurrentLyricSynced = entry.isSynced;

                if (entry.translationLang !== fl.translationLang) {
                    fl.lyricLines.forEach(l => l.translation = "");
                }

                // Warm the in-memory cache so subsequent same-session skips are instant
                fl.cachedLyrics.key = key;
                fl.cachedLyrics.lines = entry.lines;
                fl.cachedLyrics.isSynced = entry.isSynced;
                fl.cachedLyrics.translationLang = fl.translationLang;

                if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
                fl.activateLyrics();

                // Fill any missing translations/romaji without blocking the resolve
                // (This will also fetch the new language if we just wiped it above)
                fl.translateExistingLyrics();

                // Fire-and-forget save back to storage to persist the new language
                if (entry.translationLang !== fl.translationLang) {
                    // We wait 3 seconds to give translateExistingLyrics a head start
                    setTimeout(() => fl.saveToPersistentCache(key), 3000);
                }

                resolve(true);
            });
        });
    };

    /**
     * Tier-2 cache write: persists the current fl.lyricLines (including romaji
     * and translations) to chrome.storage.local under an LRU map.
     * Evicts the oldest entry when the cap of 200 songs is reached.
     *
     * Called fire-and-forget after translateExistingLyrics() resolves so the
     * stored entry always contains the fully-enriched data.
     *
     * @param {string} key - "Artist - Title" cache key.
     */
    fl.saveToPersistentCache = function (key) {
        const MAX_ENTRIES = 200;

        FLYING_LYRICS.storage.get('lyricsCache', ({ lyricsCache }) => {
            const cache = lyricsCache ?? { order: [], entries: {} };

            // Move key to front (most recently used)
            cache.order = cache.order.filter(k => k !== key);

            // Evict oldest entries until we're under the cap
            while (cache.order.length >= MAX_ENTRIES) {
                const oldest = cache.order.pop();
                delete cache.entries[oldest];
            }

            cache.order.unshift(key);
            cache.entries[key] = {
                lines: fl.lyricLines,       // array of {time, text, romaji, translation}
                isSynced: fl.isCurrentLyricSynced,
                translationLang: fl.translationLang,
                savedAt: Date.now()
            };

            FLYING_LYRICS.storage.set({ lyricsCache: cache });
        });
    };

    // --- fetchLyrics Pipeline Helpers ---

    // Note: _fetchWithTimeout, fetchFromLrcLib, and fetchFromNeteaseFallback have
    // been removed. All search network I/O is now handled exclusively by the
    // background engine (src/background/searchEngine.js) via UNIFIED_AUTO_SEARCH.

    fl.applySavedSyncOffset = function (key) {
        fl.activeLyricSource = null;
        fl.syncOffset = fl.songOffsets[key] !== undefined ? fl.songOffsets[key] : fl.globalSyncOffset;
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', payload: { syncOffset: fl.syncOffset } }).catch(() => { });
    }

    fl.checkLyricsCache = function (key) {
        if (fl.cachedLyrics.key === key && fl.cachedLyrics.lines.length > 0) {
            fl.lyricLines = fl.cachedLyrics.lines;
            fl.isCurrentLyricSynced = fl.cachedLyrics.isSynced;

            if (fl.cachedLyrics.translationLang !== fl.translationLang) {
                fl.lyricLines.forEach(l => l.translation = "");
                fl.cachedLyrics.translationLang = fl.translationLang;
            }

            fl.activateLyrics();
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            // Always attempt translation after a cache hit.
            // translateExistingLyrics() skips lines that already have translations
            // (checks !item.translation), so this is a no-op for fully-translated caches.
            // It covers two real scenarios that previously required the user to toggle CC:
            //   1. CC was OFF during first play → cached lines have no translations
            //   2. Translation was still in-flight when the song was re-detected
            fl.translateExistingLyrics();
            return true;
        }
        return false;
    }

    fl.resolveManualOverride = async function (key, abortSignal) {
        const override = fl.lyricsOverrides ? fl.lyricsOverrides[key] : null;
        if (!override) return "";

        if (override.type === 'local') {
            fl.activeLyricSource = { type: 'local', id: null, name: key };
            fl.activateLyrics();
            return override.data;
        } else if (override.type === 'api' && override.id) {
            const resData = await new Promise(resolve => {
                chrome.runtime.sendMessage({ type: 'FETCH_LRCLIB', payload: { id: override.id, timeoutMs: 30000 } }, resolve);
            });
            if (abortSignal?.aborted) throw new Error('TrackChanged');

            const raw = resData?.syncedLyrics || resData?.plainLyrics || "";
            if (raw) fl.activeLyricSource = { type: 'api', id: override.id, name: resData.trackName || key, synced: !!resData.syncedLyrics };
            return raw;
        } else if (override.type === 'netease' && override.id) {
            const resMsg = await new Promise(resolve => {
                chrome.runtime.sendMessage({ type: 'FETCH_NETEASE', payload: { id: override.id, timeoutMs: 30000 } }, resolve);
            });
            const raw = resMsg?.lyric || "";
            if (raw) fl.activeLyricSource = { type: 'netease', id: resMsg?.id || override.id, name: resMsg?.name || key };
            return raw;
        }
        return "";
    }

    // fetchFromLrcLib and fetchFromNeteaseFallback removed — replaced by the
    // unified background engine. See src/background/searchEngine.js.

    /**
     * Shared helper called by every lyric-loading path (cache hit, persistent cache,
     * local file, and network fetch) the moment real lyrics are available.
     * Resets the missing-lyrics state flag and immediately restores the user's
     * visual settings (blur, darkness, cover mode) that were overridden while
     * Cover Album Mode was active.
     */
    fl.activateLyrics = function () {
        fl.isMissingLyrics = false;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
        chrome.runtime.sendMessage({ type: 'ACTIVE_LYRIC_CHANGED', payload: fl.activeLyricSource }).catch(() => {});

        const meta = navigator.mediaSession.metadata;
        if (meta && meta.title && meta.artist) {
            const key = `${meta.artist} - ${meta.title}`;
            if (typeof fl.incrementStatsTrack === 'function') {
                fl.incrementStatsTrack(key);
            }
        }
    };

    fl.handleMissingLyrics = function () {
        fl.activeLyricSource = null;
        // Clear lyricLines entirely so the canvas draws nothing (Cover Album Mode)
        fl.lyricLines = [];
        fl.isCurrentLyricSynced = false;
        fl.isMissingLyrics = true;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
        chrome.runtime.sendMessage({ type: 'ACTIVE_LYRIC_CHANGED', payload: null }).catch(() => {});
    }

    fl.parseLrcOrGeneratePseudoSync = function (lines, rawStr) {
        const startTime = performance.now();
        if (typeof fl.wrapCache !== 'undefined') fl.wrapCache.clear();
        const temp = [];

        // Reset missing-lyrics state via the shared helper — restores user's visual
        // settings (blur, darkness, cover mode) if Cover Album Mode was previously active.
        fl.activateLyrics();

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

        const parseDuration = Math.round(performance.now() - startTime);
        chrome.runtime.sendMessage({
            type: 'TRACK_EVENT',
            payload: {
                eventName: 'processing_duration',
                params: { parse_time_ms: parseDuration }
            }
        });
    }

    let lastPlayerNotFoundLog = 0;
    fl.getPlayerState = function () {
        let currentTime = 0;
        let duration = 1;
        let paused = true;
        let playerFound = false;

        // --- PLATFORM ADAPTER EXTRACTION ---
        const adapter = fl.getActiveAdapter?.();
        if (adapter) {
            const currentVal = adapter.getCurrentTime();
            const durationVal = adapter.getDuration();
            paused = adapter.isPaused();

            if (durationVal !== null && !isNaN(durationVal) && durationVal > 0) {
                duration = durationVal;
            }

            if (currentVal !== null && !isNaN(currentVal)) {
                playerFound = true;
                if (currentVal !== fl.lastTimeValue) {
                    fl.lastTimeValue = currentVal;
                    fl.lastUpdateMs = performance.now();
                }
                currentTime = fl.lastTimeValue;
                if (!paused) {
                    currentTime += (performance.now() - fl.lastUpdateMs) / 1000;
                }
                return { currentTime, duration, paused };
            }
        }

        // --- NON-ADAPTER FALLBACK (e.g. generic audio/video element) ---
        // OPT-5: Cache the active media element in fl._mediaEl to avoid a full DOM
        // querySelectorAll scan every rAF frame. Re-scan only when the cached reference
        // is gone or the element is no longer ready (e.g. after a page navigation).
        if (!fl._mediaEl || fl._mediaEl.readyState < 1 || fl._mediaEl.id === 'fl-video-pip-element') {
            const mediaElements = fl.queryMediaAll('video, audio');

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
            playerFound = true;
            return { currentTime: activeMedia.currentTime, duration: activeMedia.duration, paused: activeMedia.paused };
        }

        // Throttled context failure reporting: if rendering but no active player element is found
        if (!playerFound && fl.pipWin && !fl.pipWin.closed) {
            const now = Date.now();
            if (now - lastPlayerNotFoundLog > 30000) { // Log at most once per 30 seconds
                lastPlayerNotFoundLog = now;
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: {
                        eventName: 'context_failure',
                        params: { failure_reason: 'player_element_not_found' }
                    }
                });
            }
        }

        return { currentTime, duration, paused };
    }

    fl.getCoverArt = function () {
        const isValid = (src) => src && src !== window.location.href && src !== window.location.origin + '/';
        let src = "";

        // 1. MediaSession API (Grab the last item, which is inherently the highest resolution)
        const meta = navigator.mediaSession?.metadata;
        if (meta && meta.artwork && meta.artwork.length > 0) {
            const s = meta.artwork[meta.artwork.length - 1].src;
            if (isValid(s)) src = s;
        }

        // 2. Active Platform Adapter Fallback
        if (!src) {
            const adapter = fl.getActiveAdapter?.();
            if (adapter) {
                const s = adapter.getCoverArt();
                if (isValid(s)) src = s;
            }
        }

        if (src) {
            // Upgrade Spotify CDN image URLs to high-res (640x640)
            if (src.includes('i.scdn.co/image/')) {
                src = src.replace(/ab67616d0000[0-9a-f]{4}/i, 'ab67616d0000b273');
            }
            // Upgrade YouTube Music image URLs to high-res (544x544)
            else if (src.includes('googleusercontent.com') || src.includes('ggpht.com')) {
                src = src.replace(/=w\d+-h\d+/i, '=w544-h544')
                         .replace(/=s\d+/i, '=s544');
            }
        }

        return src;
    }

    fl.translateExistingLyrics = async function () {
        if (!fl.lyricLines || fl.lyricLines.length === 0) return;
        if (fl.lyricLines.length === 1 && (fl.lyricLines[0].isWaitingPlaceholder || fl.SYSTEM_MSG_SET.has(fl.lyricLines[0].text))) return;

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

        // Run Romaji and Translation batches concurrently — cuts enrichment time in half
        // compared to the old sequential approach.
        const tasks = [];

        if (romajiQueue.length > 0) {
            tasks.push(fl.processTranslateBatch(romajiQueue, 'rm', 'en', (itemIndex, resultText) => {
                fl.lyricLines[itemIndex].romaji = resultText;
            }));
        }

        if (transQueue.length > 0) {
            tasks.push(fl.processTranslateBatch(transQueue, 't', fl.translationLang, (itemIndex, resultText) => {
                fl.lyricLines[itemIndex].translation = resultText;
            }));
        }

        if (tasks.length > 0) {
            await Promise.all(tasks);
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
        }
    }

    /**
     * Sends all chunks to Google Translate in parallel (Promise.all) rather than
     * serially. For a 100-line song this collapses 7 sequential ~2s round-trips
     * into a single ~2s wait, which is why translations now appear all at once
     * instead of trickling in over 15+ seconds.
     *
     * A 150ms staggered start per chunk is used so requests don't all hit the
     * API at exactly the same millisecond, reducing the chance of a 429.
     */
    fl.processTranslateBatch = async function (queue, dtMode, targetLang, applyCallback) {
        const CHUNK_SIZE = 15;
        // Romaji (dt=rm) uses '|||': its flat phonetic token-stream doesn't preserve \n,
        // but ASCII pipe characters pass through verbatim in the token output.
        // Translation (dt=t) uses '\n': Google's NLP engine treats it as a sentence boundary
        // and always preserves it, making splits reliable and immune to NLP mangling.
        const DELIMITER = (dtMode === 'rm') ? ' ||| ' : '\n';

        // Build all chunks up-front so we can dispatch them all in parallel.
        const chunks = [];
        for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
            chunks.push(queue.slice(i, i + CHUNK_SIZE));
        }

        // Fire all chunks concurrently with a small ramp-up stagger.
        await Promise.all(chunks.map((chunk, chunkIdx) => new Promise(resolve => {
            setTimeout(async () => {
                const combinedText = chunk.map(q => q.text).join(DELIMITER);
                try {
                    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=${dtMode}&q=${encodeURIComponent(combinedText)}`);
                    if (res.status === 429) {
                        chrome.runtime.sendMessage({
                            type: 'TRACK_EVENT',
                            payload: {
                                eventName: 'rate_limited',
                                params: { url: 'https://translate.googleapis.com/translate_a/single' }
                            }
                        });
                    }
                    if (!res.ok) return resolve();

                    const data = await res.json();

                    let translatedCombo = "";
                    if (dtMode === 'rm') {
                        // Romaji format: punctuation tokens return null for x[3], fall back to x[0].
                        translatedCombo = data?.[0]?.map(x => x[3] || x[0] || "").join("") || "";
                    } else if (dtMode === 't' && data && data[0]) {
                        // Standard translation: sentences may be split across multiple sub-arrays.
                        translatedCombo = data[0].map(x => x[0] || "").join('');
                    }

                    if (!translatedCombo) return resolve();

                    // Split back using the mode-appropriate delimiter.
                    const translatedLines = (dtMode === 'rm')
                        ? translatedCombo.split(/\s*\|\s*\|\s*\|\s*/)
                        : translatedCombo.split('\n');

                    for (let j = 0; j < chunk.length; j++) {
                        if (translatedLines[j]) {
                            applyCallback(chunk[j].index, translatedLines[j].trim());
                        }
                    }

                    // Trigger a layout refresh so the canvas allocates space for
                    // the newly arrived translations immediately.
                    if (typeof fl.needsLayoutUpdate !== 'undefined') {
                        fl.needsLayoutUpdate = true;
                    }
                } catch (e) {
                    console.log("Batch translation failed:", e);
                }
                resolve();
            }, chunkIdx * 150); // 150ms stagger per chunk to be kind to the rate limiter
        })));
    }

})();
