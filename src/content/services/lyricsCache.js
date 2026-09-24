(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — LYRICS CACHE MANAGER (content script context)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Tier-2 cache read: looks up `key` in chrome.storage.local.
     * On hit, populates fl.lyricLines + in-memory cache and fires
     * translateExistingLyrics() to fill any missing translations.
     *
     * @param {string} key - "Artist - Title" cache key.
     * @returns {Promise<boolean>} true if cache hit.
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
                fl.activeLyricSource = entry.source || null;

                if (entry.translationLang !== fl.translationLang) {
                    fl.lyricLines.forEach(l => l.translation = "");
                }

                // Warm the in-memory cache so subsequent same-session skips are instant
                fl.cachedLyrics.key = key;
                fl.cachedLyrics.lines = entry.lines;
                fl.cachedLyrics.isSynced = entry.isSynced;
                fl.cachedLyrics.translationLang = fl.translationLang;
                fl.cachedLyrics.source = entry.source || null;

                if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
                if (typeof fl.activateLyrics === 'function') fl.activateLyrics();

                // Fill any missing translations/romaji without blocking the resolve
                if (typeof fl.translateExistingLyrics === 'function') fl.translateExistingLyrics();

                // Fire-and-forget save back to storage to persist new language
                if (entry.translationLang !== fl.translationLang) {
                    setTimeout(() => fl.saveToPersistentCache(key), 3000);
                }

                resolve(true);
            });
        });
    };

    /**
     * Tier-2 cache write: persists current fl.lyricLines (including romaji/translations)
     * to chrome.storage.local under an LRU map (cap: 200 songs).
     *
     * @param {string} key - "Artist - Title" cache key.
     */
    fl.saveToPersistentCache = function (key) {
        const MAX_ENTRIES = 200;

        FLYING_LYRICS.storage.get('lyricsCache', ({ lyricsCache }) => {
            const cache = lyricsCache ?? { order: [], entries: {} };

            // Move key to front (most recently used)
            cache.order = cache.order.filter(k => k !== key);

            // Evict oldest entries until under cap
            while (cache.order.length >= MAX_ENTRIES) {
                const oldest = cache.order.pop();
                delete cache.entries[oldest];
            }

            cache.order.unshift(key);
            cache.entries[key] = {
                lines: fl.lyricLines,
                isSynced: fl.isCurrentLyricSynced,
                translationLang: fl.translationLang,
                savedAt: Date.now(),
                source: fl.activeLyricSource
            };

            FLYING_LYRICS.storage.set({ lyricsCache: cache });
        });
    };

    fl.applySavedSyncOffset = function (key) {
        fl.activeLyricSource = null;
        fl.syncOffset = fl.songOffsets[key] !== undefined ? fl.songOffsets[key] : fl.globalSyncOffset;
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', payload: { syncOffset: fl.syncOffset } }).catch(() => { });
    };

    fl.checkLyricsCache = function (key) {
        if (fl.cachedLyrics.key === key && fl.cachedLyrics.lines.length > 0) {
            fl.lyricLines = fl.cachedLyrics.lines;
            fl.isCurrentLyricSynced = fl.cachedLyrics.isSynced;
            fl.activeLyricSource = fl.cachedLyrics.source || null;

            if (fl.cachedLyrics.translationLang !== fl.translationLang) {
                fl.lyricLines.forEach(l => l.translation = "");
                fl.cachedLyrics.translationLang = fl.translationLang;
            }

            if (typeof fl.activateLyrics === 'function') fl.activateLyrics();
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            if (typeof fl.translateExistingLyrics === 'function') fl.translateExistingLyrics();
            return true;
        }
        return false;
    };

})();
