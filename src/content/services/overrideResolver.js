(() => {
    const fl = window.FLYING_LYRICS = window.FLYING_LYRICS || {};

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — OVERRIDE RESOLVER (content script submodule)
    //
    //  Resolves manual, local, or third-party lyric overrides (LRCLIB, NetEase, KuGou).
    //  Modular submodule consumed by services.js coordinator.
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Resolves a manual override if configured for the given track key.
     * @param {string} key - Normalized track key ("Artist - Title")
     * @param {AbortSignal} abortSignal - Abort signal to cancel in-flight fetches
     * @returns {Promise<string>} Raw LRC string or empty string
     */
    fl.resolveManualOverride = async function (key, abortSignal) {
        let override = fl.lyricsOverrides ? fl.lyricsOverrides[key] : null;
        if (!override && fl.lyricsOverrides) {
            const meta = navigator.mediaSession?.metadata;
            if (meta?.artist && meta?.title) {
                const mediaKey = `${meta.artist} - ${meta.title}`;
                override = fl.lyricsOverrides[mediaKey] || null;
            }
        }
        if (!override) return "";

        if (override.type === 'local') {
            fl.activeLyricSource = { type: 'local', id: null, name: key };
            if (typeof fl.activateLyrics === 'function') fl.activateLyrics();
            return override.data;
        } else if (override.type === 'api' && override.id) {
            const resData = await fl.sendMessageWithTimeout(
                { type: 'FETCH_LRCLIB', payload: { id: override.id, timeoutMs: 8000 } },
                10000,
                null
            );
            if (abortSignal?.aborted) throw new Error('TrackChanged');
            if (!resData) return "";

            let raw = resData.syncedLyrics || resData.plainLyrics || "";
            const isEmpty = !raw || !!resData.instrumental;
            if (isEmpty) raw = "[00:00.00] ♫ (Empty) ♫";

            fl.activeLyricSource = { 
                type: 'api', 
                id: override.id, 
                name: resData.trackName || key, 
                synced: !!resData.syncedLyrics,
                isEmpty: isEmpty
            };
            if (typeof fl.activateLyrics === 'function') fl.activateLyrics();
            return raw;
        } else if (override.type === 'netease' && override.id) {
            const resMsg = await fl.sendMessageWithTimeout(
                { type: 'FETCH_NETEASE', payload: { id: override.id, timeoutMs: 8000 } },
                10000,
                null
            );
            if (abortSignal?.aborted) throw new Error('TrackChanged');
            if (!resMsg) return "";

            let raw = resMsg.lyric || "";
            const isEmpty = !raw;
            if (isEmpty) raw = "[00:00.00] ♫ (Empty) ♫";

            fl.activeLyricSource = { 
                type: 'netease', 
                id: resMsg.id || override.id, 
                name: resMsg.name || key,
                isEmpty: isEmpty,
                tlyric: resMsg.tlyric || '',
                romalrc: resMsg.romalrc || ''
            };
            if (typeof fl.activateLyrics === 'function') fl.activateLyrics();
            return raw;
        } else if (override.type === 'kugou' && override.id && override.accesskey) {
            const resMsg = await fl.sendMessageWithTimeout(
                { type: 'FETCH_KUGOU', payload: { id: override.id, accesskey: override.accesskey, timeoutMs: 8000 } },
                10000,
                null
            );
            if (abortSignal?.aborted) throw new Error('TrackChanged');
            if (!resMsg) return "";

            let raw = resMsg.lyric || "";
            const isEmpty = !raw;
            if (isEmpty) raw = "[00:00.00] ♫ (Empty) ♫";
            const isSynced = /\[\d+:\d+\.\d+\]/.test(raw);

            fl.activeLyricSource = { 
                type: 'kugou', 
                id: resMsg.id || override.id, 
                accesskey: override.accesskey,
                name: key,
                synced: isSynced,
                isEmpty: isEmpty
            };
            if (typeof fl.activateLyrics === 'function') fl.activateLyrics();
            return raw;
        }
        return "";
    };

    /**
     * Cleans up a failed override from storage and dispatches failure event.
     * @param {string} key - Normalized track key
     */
    fl.clearFailedOverride = function (key) {
        if (!fl.lyricsOverrides || !fl.lyricsOverrides[key]) return;
        const failedOverride = fl.lyricsOverrides[key];
        delete fl.lyricsOverrides[key];
        if (window.FLYING_LYRICS?.storage?.set) {
            window.FLYING_LYRICS.storage.set({ lyricsOverrides: fl.lyricsOverrides });
        }
        chrome.runtime.sendMessage({
            type: 'LYRIC_FETCH_FAILED',
            payload: { key: key, override: failedOverride }
        }).catch(() => {});
    };

})();
