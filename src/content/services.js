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

    /**
     * Generates up to 3 search passes from raw metadata, each progressively cleaner:
     *
     *   Pass 1 — Exact   : raw artist + raw title (current behaviour, preserved for databases
     *                        that index tracks exactly as the platform reports them).
     *   Pass 2 — Cleaned : primary artist + noise-stripped title.
     *   Pass 3 — Title   : no artist restriction + noise-stripped title (broadest net;
     *                        relies on duration + Levenshtein scoring to reject false positives).
     *
     * Duplicate passes are eliminated so a clean title == raw title doesn't waste an API call.
     *
     * @param {{ artist: string, title: string }} meta - Raw mediaSession metadata.
     * @returns {Array<{ artist: string, title: string, cleanTitle: string }>}
     */
    fl.generateSearchPasses = function (meta) {
        const rawArtist  = (meta.artist || '').trim();
        const rawTitle   = (meta.title  || '').trim();
        const cleanedTitle   = fl.cleanTitle(rawTitle);
        const primaryArtist  = fl.extractPrimaryArtist(rawArtist);

        const passes = [
            // Pass 1: send exactly what the platform gave us
            { artist: rawArtist, title: rawTitle, cleanTitle: cleanedTitle },
        ];

        // Pass 2: cleaned title + primary artist (skip if identical to Pass 1)
        if (primaryArtist !== rawArtist || cleanedTitle !== rawTitle) {
            passes.push({ artist: primaryArtist, title: cleanedTitle, cleanTitle: cleanedTitle });
        }

        // Pass 3: title-only (skip if a previous pass already has no artist)
        if (passes.every(p => p.artist !== '')) {
            passes.push({ artist: '', title: cleanedTitle, cleanTitle: cleanedTitle });
        }

        return passes;
    };


    fl.fetchLyrics = async function (retryCount = 0) {
        const meta = navigator.mediaSession.metadata;

        if (!meta || !meta.title) {
            if (retryCount < 5) setTimeout(() => fl.fetchLyrics(retryCount + 1), 1000);
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
            if (fl.checkLyricsCache(key)) return;

            // Tier 2: chrome.storage.local (survives tab refreshes and browser restarts)
            if (await fl.loadFromPersistentCache(key)) return;

            // Tier 3: network fetch
            let raw = await fl.resolveManualOverride(key, abortSignal);

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
            if (!raw) {
                const passes = fl.generateSearchPasses(meta);

                // Rolling plain-text fallbacks — prefer LRCLIB over Netease
                let lrcLibPlainFallback  = null;
                let lrcLibSourceFallback = null;
                let neteaseRawFallback   = null;

                // PHASE 1: Try all passes on LRCLIB first
                for (const pass of passes) {
                    const passLabel = pass.artist
                        ? `"${pass.artist}" / "${pass.title}"`
                        : `title-only "${pass.title}"`;

                    // ── LRCLIB ──────────────────────────────────────────
                    const lrcRaw = await fl.fetchFromLrcLib(pass, key, abortSignal);

                    if (lrcRaw && fl.activeLyricSource?.synced) {
                        // Synced hit — done!
                        console.log(`FL: LRCLIB synced hit on pass ${passLabel}`);
                        raw = lrcRaw;
                        break;
                    } else if (lrcRaw && !lrcLibPlainFallback) {
                        // Plain text fallback — keep searching for synced
                        console.log(`FL: LRCLIB plain text fallback on pass ${passLabel}`);
                        lrcLibPlainFallback  = lrcRaw;
                        lrcLibSourceFallback = { ...fl.activeLyricSource };
                    }
                }

                // PHASE 2: If LRCLIB completely failed, try all passes on Netease
                if (!raw) {
                    for (const pass of passes) {
                        const passLabel = pass.artist
                            ? `"${pass.artist}" / "${pass.title}"`
                            : `title-only "${pass.title}"`;

                        // ── NETEASE ─────────────────────────────────────────
                        const neteaseRaw = await fl.fetchFromNeteaseFallback(pass, key, abortSignal);

                        if (neteaseRaw) {
                            const isNeteaseSynced = /\[\d{2}:\d{2}\.\d{2,3}\]/.test(neteaseRaw);

                            if (isNeteaseSynced) {
                                // Synced hit from Netease — done!
                                console.log(`FL: Netease synced hit on pass ${passLabel}`);
                                raw = neteaseRaw;
                                if (fl.activeLyricSource) fl.activeLyricSource.synced = true;
                                break;
                            } else if (!neteaseRawFallback) {
                                neteaseRawFallback = neteaseRaw;
                            }
                        }
                    }
                }

                // Loop ended without a synced hit — fall back to best plain text collected
                if (!raw) {
                    if (lrcLibPlainFallback) {
                        // Prefer LRCLIB plain text (it's a dedicated lyrics database)
                        raw = lrcLibPlainFallback;
                        fl.activeLyricSource = lrcLibSourceFallback;
                    } else if (neteaseRawFallback) {
                        raw = neteaseRawFallback;
                        if (fl.activeLyricSource) fl.activeLyricSource.synced = false;
                    }
                }
            }

            if (!raw) {
                fl.handleMissingLyrics();
                return;
            }

            const lines = raw.split('\n');
            fl.parseLrcOrGeneratePseudoSync(lines, raw);

            // --- LYRIC TIMESTAMP SPAN VALIDATION ---
            // Guard against synced lyric files whose timestamps cover less than 50% of
            // the real track duration (e.g. a garbage LRCLIB entry that only goes to 30s
            // on a 3-minute song). In that case, demote to pseudo-sync so the lines are
            // spread evenly across the real duration instead of freezing on the last line.
            if (fl.isCurrentLyricSynced && fl.lyricLines.length > 1) {
                const lastTs = fl.lyricLines[fl.lyricLines.length - 1].time;
                const realDuration = fl.getPlayerState().duration;
                if (realDuration > 60 && lastTs < realDuration * 0.5) {
                    console.log(`FL: Synced lyrics span only ${Math.round(lastTs)}s vs ${Math.round(realDuration)}s track — demoting to pseudo-sync.`);
                    fl.isCurrentLyricSynced = false;
                    if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                    // Strip timestamps and rebuild with even spacing across real duration
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

            // Warm the in-memory cache immediately so fast navigation is instant
            fl.cachedLyrics.key = key;
            fl.cachedLyrics.lines = fl.lyricLines;
            fl.cachedLyrics.isSynced = fl.isCurrentLyricSynced;
            fl.cachedLyrics.translationLang = fl.translationLang;

            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;

            // Await translations so the persistent entry is always fully-enriched
            // (romaji + translations baked in — no re-fetch on future loads).
            await fl.translateExistingLyrics();

            // Persist the enriched entry to chrome.storage.local (fire-and-forget).
            fl.saveToPersistentCache(key);
        } catch (e) {
            if (e.message === 'TrackChanged' || e.name === 'AbortError') {
                console.log("FL: Aborted previous fetchLyrics pipeline (track changed).");
                return;
            }
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
            chrome.storage.local.get('lyricsCache', ({ lyricsCache }) => {
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

        chrome.storage.local.get('lyricsCache', ({ lyricsCache }) => {
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

            chrome.storage.local.set({ lyricsCache: cache });
        });
    };

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
    fl._fetchWithTimeout = function (url, ms = 5000, externalSignal = null) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        
        if (externalSignal) {
            if (externalSignal.aborted) controller.abort();
            else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }

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
        const override = fl.lyricsOverrides[key];
        if (!override) return "";

        if (override.type === 'local') {
            fl.activeLyricSource = { type: 'local', id: null, name: key };
            fl.activateLyrics();
            return override.data;
        } else if (override.type === 'api' && override.id) {
            try {
                // Use a longer timeout for direct ID lookups — this endpoint is called only
                // once per song change (not in a loop), so a longer wait is safe. The default
                // 5s was designed for the search pipeline where requests stack sequentially.
                const res = await fl._fetchWithTimeout(`https://lrclib.net/api/get/${override.id}`, 12000, abortSignal);
                const data = await res.json();
                const raw = data.syncedLyrics || data.plainLyrics || "";
                if (raw) fl.activeLyricSource = { type: 'api', id: override.id, name: data.trackName || key, synced: !!data.syncedLyrics };
                return raw;
            } catch (err) {
                if (abortSignal?.aborted) throw new Error('TrackChanged');
                // AbortError = 12s timeout fired; any other error = network/API failure.
                // Return "" so fetchLyrics() falls through to the multi-pass search
                // pipeline gracefully instead of crashing the session with "Network Error".
                console.warn(`FL: Manual override fetch failed for ID ${override.id}:`,
                    err.name === 'AbortError' ? 'Request timed out (12s)' : err.message);
                return "";
            }
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

    /**
     * Queries LRCLIB for the given pass metadata and returns the best raw lyric string.
     *
     * Candidate scoring formula:
     *   score = (isSynced ? 10_000 : 0) - durationDelta + (titleSimilarity * 10)
     *
     *   - isSynced adds a huge bonus so synced results always rank above plain text.
     *   - durationDelta penalises candidates whose track length differs from the real player duration.
     *   - titleSimilarity (Levenshtein %) rewards candidates whose title closely matches our
     *     clean title, which is especially important in Pass 3 (title-only, no artist filter).
     *
     * @param {{ artist: string, title: string, cleanTitle: string }} passMeta
     * @param {string} key - Cache key ("Artist - Title").
     * @returns {Promise<string>}
     */
    fl.fetchFromLrcLib = async function (passMeta, key, abortSignal) {
        try {
            const actualDuration = fl.getPlayerState().duration || 0;

            // Pass 3 has no artist — use a broad free-text query instead of field-specific params
            const searchQuery = passMeta.artist
                ? `artist_name=${encodeURIComponent(passMeta.artist)}&track_name=${encodeURIComponent(passMeta.title)}`
                : `q=${encodeURIComponent(passMeta.title)}`;

            const res = await fl._fetchWithTimeout(`https://lrclib.net/api/search?${searchQuery}`, 15000, abortSignal);

            if (!res.ok) return "";
            const candidates = await res.json();
            if (!Array.isArray(candidates) || candidates.length === 0) return "";

            const scored = candidates.map(c => {
                const isSynced      = !!c.syncedLyrics;
                const durationDelta = actualDuration > 0 ? Math.abs((c.duration || 0) - actualDuration) : 0;
                // Title similarity guards against false positives in Pass 3 (title-only search)
                const titleSim      = fl.titleSimilarity(passMeta.cleanTitle, c.trackName || '');
                // Artist similarity helps tiebreak when multiple candidates share a perfect title match
                const artistSim     = passMeta.artist ? fl.titleSimilarity(passMeta.artist, c.artistName || '') : 0;
                const score         = (isSynced ? 10000 : 0) - durationDelta + (titleSim * 10) + (artistSim * 5);
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
            if (abortSignal?.aborted) throw new Error('TrackChanged');
            // AbortError = our 15s timeout fired; any other error = network/API failure.
            // Either way, log it and let the caller fall through to Netease.
            console.log("LRCLIB ranked search failed:", err.name === 'AbortError' ? 'Request timed out (15s)' : err);
        }
        return "";
    };

    /**
     * Queries Netease for the given pass metadata and returns the best raw lyric string.
     * The clean title is forwarded to background.js so it can apply Levenshtein scoring
     * when ranking the Netease candidate list.
     *
     * @param {{ artist: string, title: string, cleanTitle: string }} passMeta
     * @param {string} key - Cache key ("Artist - Title").
     * @returns {Promise<string>}
     */
    fl.fetchFromNeteaseFallback = async function (passMeta, key, abortSignal) {
        const actualDuration = fl.getPlayerState().duration || 0;
        const neteaseQuery   = `${passMeta.artist} ${passMeta.title}`.trim();
        console.log("Querying Netease:", neteaseQuery);

        if (abortSignal?.aborted) throw new Error('TrackChanged');

        const resMsg = await new Promise(resolve => {
            chrome.runtime.sendMessage({
                type: 'FETCH_NETEASE',
                payload: {
                    query:      neteaseQuery,
                    duration:   actualDuration,
                    cleanTitle: passMeta.cleanTitle  // used by background.js for Levenshtein scoring
                }
            }, resolve);
        });

        if (abortSignal?.aborted) throw new Error('TrackChanged');

        const raw = resMsg?.lyric || "";
        if (raw) fl.activeLyricSource = { type: 'netease', id: resMsg?.id || null, name: resMsg?.name || key };
        return raw;
    };

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
    };

    fl.handleMissingLyrics = function () {
        fl.activeLyricSource = null;
        // Clear lyricLines entirely so the canvas draws nothing (Cover Album Mode)
        fl.lyricLines = [];
        fl.isCurrentLyricSynced = false;
        fl.isMissingLyrics = true;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
    }

    fl.parseLrcOrGeneratePseudoSync = function (lines, rawStr) {
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

        // --- YOUTUBE MUSIC: Read track-scoped ARIA attributes ---
        // YTM appends tracks into a combined timeline MSE buffer. Native <video>.duration
        // is the length of the queue, not the current song.
        // 
        // We previously parsed `span.time-info` DOM text ("2:29 / 4:10"), but updating at
        // 1-second intervals caused the interpolated visual seeker bar to stutter/"lag".
        // Solution: Pull from `#progress-bar` accessibility attributes (`aria-valuenow/max`).
        // Screen reader attributes are track-scoped, highly frequent, and fully readable
        // from the Chrome Extension "Isolated World" context.
        if (window.location.hostname.includes('music.youtube')) {
            const pb = document.querySelector('#progress-bar.ytmusic-player-bar');

            if (pb) {
                const trackDuration = parseFloat(pb.getAttribute('aria-valuemax'));
                const trackCurrentTime = parseFloat(pb.getAttribute('aria-valuenow'));

                if (trackDuration > 0 && !isNaN(trackDuration)) {
                    duration = trackDuration;

                    // Interpolate sub-second precision between ARIA attribute updates.
                    // ARIA attributes update frequently, but bridging frame gaps ensures 60fps smoothness.
                    const currentStr = String(trackCurrentTime);
                    if (currentStr !== fl.lastTimeStr) {
                        fl.lastTimeStr = currentStr;
                        fl.lastTimeValue = isNaN(trackCurrentTime) ? 0 : trackCurrentTime;
                        fl.lastUpdateMs = performance.now();
                    }

                    // Paused state: use the <video> element directly — only time/duration
                    // are affected by MSE gapless buffering; paused is always accurate.
                    const vid = document.querySelector('video');
                    paused = vid ? vid.paused : true;

                    currentTime = fl.lastTimeValue;
                    if (!paused) {
                        currentTime += (performance.now() - fl.lastUpdateMs) / 1000;
                    }

                    return { currentTime, duration, paused };
                }
            }
            // Sub-element not found yet — fall through to generic fallback.
        }

        // --- NON-SPOTIFY / NON-YTM: Use media element ---
        // For any other platform using standard HTML5 audio/video whose native properties
        // are reliable (no MSE gapless multi-track buffering).
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
