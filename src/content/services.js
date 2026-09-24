(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — SERVICES COORDINATOR (content script context)
    //
    //  Orchestrates lyric lifecycle, player synchronization, and overrides.
    //  Modular sub-components:
    //    - services/metadataHelper.js (DOM metadata extractors & noise sanitization)
    //    - services/lyricsCache.js    (Memory and chrome.storage.local caching)
    //    - services/lrcParser.js      (LRC timestamp parsing and span validator)
    //    - services/translator.js     (Multi-tier translation waterfall)
    // ─────────────────────────────────────────────────────────────────────────────

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
            fl.activateLyrics();
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
                synced: !!resData.syncedLyrics || !!resData.instrumental,
                isEmpty: isEmpty
            };
            fl.activateLyrics();
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
            fl.activateLyrics();
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
            fl.activateLyrics();
            return raw;
        }
        return "";
    };

    fl.activateLyrics = function () {
        fl._waitForItStartTime = null;
        fl.isMissingLyrics = false;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
        chrome.runtime.sendMessage({ type: 'ACTIVE_LYRIC_CHANGED', payload: fl.activeLyricSource }).catch(() => {});

        const currentMeta = typeof fl.getCurrentTrackMetadata === 'function' ? fl.getCurrentTrackMetadata() : null;
        const meta = currentMeta || navigator.mediaSession?.metadata;
        if (meta && meta.title && meta.artist) {
            const key = `${meta.artist} - ${meta.title}`;
            if (typeof fl.incrementStatsTrack === 'function') {
                fl.incrementStatsTrack(key);
            }
        }
    };

    fl.handleMissingLyrics = function () {
        fl._waitForItStartTime = null;
        fl.activeLyricSource = null;
        fl.activeTranslationTier = 'None';
        fl._translationSessionId = (fl._translationSessionId || 0) + 1;
        fl.lyricLines = [];
        fl.isCurrentLyricSynced = false;
        fl.isMissingLyrics = true;
        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
        chrome.runtime.sendMessage({ type: 'ACTIVE_LYRIC_CHANGED', payload: null }).catch(() => {});
    };

    let lastPlayerNotFoundLog = 0;
    fl.getPlayerState = function () {
        let currentTime = 0;
        let duration = 1;
        let paused = true;
        let playerFound = false;

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

        if (!fl._mediaEl || fl._mediaEl.readyState < 1 || fl._mediaEl.id === 'fl-video-pip-element') {
            const mediaElements = typeof fl.queryMediaAll === 'function' ? fl.queryMediaAll('video, audio') : [];
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

        if (!playerFound && fl.pipWin && !fl.pipWin.closed) {
            const now = Date.now();
            if (now - lastPlayerNotFoundLog > 30000) {
                lastPlayerNotFoundLog = now;
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: {
                        eventName: 'context_failure',
                        params: { failure_reason: 'player_element_not_found' }
                    }
                }).catch(() => {});
            }
        }

        return { currentTime, duration, paused };
    };

    fl.getCoverArt = function () {
        const isValid = (src) => src && src !== window.location.href && src !== window.location.origin + '/';
        let src = "";

        const meta = navigator.mediaSession?.metadata;
        if (meta && meta.artwork && meta.artwork.length > 0) {
            const s = meta.artwork[meta.artwork.length - 1].src;
            if (isValid(s)) src = s;
        }

        if (!src) {
            const adapter = fl.getActiveAdapter?.();
            if (adapter) {
                const s = adapter.getCoverArt();
                if (isValid(s)) src = s;
            }
        }

        if (src) {
            if (src.includes('i.scdn.co/image/')) {
                src = src.replace(/ab67616d0000[0-9a-f]{4}/i, 'ab67616d0000b273');
            } else if (src.includes('googleusercontent.com') || src.includes('ggpht.com')) {
                src = src.replace(/=w\d+-h\d+/i, '=w544-h544').replace(/=s\d+/i, '=s544');
            }
        }
        return src;
    };

    fl.fetchLyrics = async function (retryCount = 0, options = {}) {
        if (typeof retryCount === 'object' && retryCount !== null) {
            options = retryCount;
            retryCount = 0;
        }
        fl.isBackgroundSearchFailed = false;
        const fetchSessionTrack = options?.sessionTrack || fl.currentTrack;
        const currentMeta = typeof fl.getCurrentTrackMetadata === 'function'
            ? fl.getCurrentTrackMetadata()
            : { title: navigator.mediaSession?.metadata?.title || '', artist: navigator.mediaSession?.metadata?.artist || '' };

        if (!currentMeta || !currentMeta.title) {
            if (retryCount < 5) {
                setTimeout(() => {
                    if (fl.currentTrack === fetchSessionTrack) {
                        fl.fetchLyrics(retryCount + 1, { ...options, sessionTrack: fetchSessionTrack });
                    }
                }, 1000);
            } else if (retryCount === 5) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: {
                        eventName: 'context_failure',
                        params: { failure_reason: 'metadata_extraction_failed' }
                    }
                }).catch(() => {});
                if (fl.currentTrack === fetchSessionTrack) {
                    fl.handleMissingLyrics();
                }
            }
            return;
        }

        if (fl._currentFetchController) {
            fl._currentFetchController.abort();
        }
        fl._translationSessionId = (fl._translationSessionId || 0) + 1;
        fl._currentFetchController = new AbortController();
        const abortSignal = fl._currentFetchController.signal;

        try {
            const key = `${currentMeta.artist} - ${currentMeta.title}`;
            if (typeof fl.applySavedSyncOffset === 'function') fl.applySavedSyncOffset(key);

            const isBypassingCache = !!(options?.bypassCache || fl.devBypassCache);

            // Tier 1: in-memory cache
            if (!isBypassingCache && typeof fl.checkLyricsCache === 'function' && fl.checkLyricsCache(key)) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: { eventName: 'cache_check', params: { result: 'hit', tier: 'memory' } }
                }).catch(() => {});
                return;
            }

            // Tier 2: chrome.storage.local
            if (!isBypassingCache && typeof fl.loadFromPersistentCache === 'function' && await fl.loadFromPersistentCache(key)) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: { eventName: 'cache_check', params: { result: 'hit', tier: 'persistent' } }
                }).catch(() => {});
                return;
            }

            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                payload: { eventName: 'cache_check', params: { result: 'miss' } }
            }).catch(() => {});

            // Tier 3: network fetch
            let raw = await fl.resolveManualOverride(key, abortSignal);

            if (!raw && fl.lyricsOverrides && fl.lyricsOverrides[key]) {
                const failedOverride = fl.lyricsOverrides[key];
                delete fl.lyricsOverrides[key];
                FLYING_LYRICS.storage.set({ lyricsOverrides: fl.lyricsOverrides });
                chrome.runtime.sendMessage({
                    type: 'LYRIC_FETCH_FAILED',
                    payload: { key: key, override: failedOverride }
                }).catch(() => {});
            }

            let initialSearchTimedOut = false;

            if (!raw) {
                if (abortSignal?.aborted) throw new Error('TrackChanged');

                const { duration } = fl.getPlayerState();
                const searchResult = await fl.sendMessageWithTimeout(
                    {
                        type: 'UNIFIED_AUTO_SEARCH',
                        payload: {
                            rawArtist: currentMeta.artist || '',
                            rawTitle:  currentMeta.title  || '',
                            duration:  duration           || 0,
                            timeoutMs: 5000
                        }
                    },
                    7000,
                    { result: { rawLyric: null, source: null, synced: false, isNetworkError: true, hasTimeout: true } }
                );

                if (abortSignal?.aborted) throw new Error('TrackChanged');

                if (searchResult?.result) {
                    raw = searchResult.result.rawLyric;
                    fl.activeLyricSource = searchResult.result.source;
                    initialSearchTimedOut = !!searchResult.result.hasTimeout;
                }
            }

            if (raw) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    payload: { eventName: 'lyrics_fetch_result', params: { status: 'success' } }
                }).catch(() => {});

                fl.activateLyrics();
                const lines = raw.split('\n');
                if (typeof fl.parseLrcOrGeneratePseudoSync === 'function') {
                    fl.parseLrcOrGeneratePseudoSync(lines, raw);
                }

                // Lyric timestamp span validation
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
                fl.cachedLyrics.source = fl.activeLyricSource;

                if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;

                if (typeof fl.translateExistingLyrics === 'function') {
                    fl.translateExistingLyrics().then(() => {
                        if (!isBypassingCache && typeof fl.saveToPersistentCache === 'function') {
                            fl.saveToPersistentCache(key);
                        }
                    });
                }
            }

            // Retry pipeline if missing or timed out
            if (!raw || initialSearchTimedOut) {
                if (!raw) {
                    chrome.runtime.sendMessage({
                        type: 'TRACK_EVENT',
                        payload: { eventName: 'lyrics_fetch_result', params: { status: 'failure', error_type: 'no_match_first_pass' } }
                    }).catch(() => {});
                    fl.handleMissingLyrics();
                }

                if (typeof fl.setIndicatorRetrying === 'function') {
                    fl.setIndicatorRetrying(true);
                }

                try {
                    const { duration } = fl.getPlayerState();
                    const retryResult = await fl.sendMessageWithTimeout(
                        {
                            type: 'UNIFIED_AUTO_SEARCH',
                            payload: {
                                rawArtist: currentMeta.artist || '',
                                rawTitle:  currentMeta.title  || '',
                                duration:  duration           || 0,
                                timeoutMs: 30000
                            }
                        },
                        32500,
                        { result: { rawLyric: null, source: null, synced: false, isNetworkError: true, hasTimeout: true } }
                    );

                    if (abortSignal?.aborted) {
                        if (typeof fl.setIndicatorRetrying === 'function') fl.setIndicatorRetrying(false);
                        return;
                    }

                    if (retryResult?.result?.rawLyric) {
                        if (retryResult.result.rawLyric === raw) return;
                        raw = retryResult.result.rawLyric;
                        fl.activeLyricSource = retryResult.result.source;

                        chrome.runtime.sendMessage({
                            type: 'TRACK_EVENT',
                            payload: { eventName: 'lyrics_fetch_result', params: { status: 'success_on_retry' } }
                        }).catch(() => {});

                        fl.activateLyrics();
                        const lines = raw.split('\n');
                        if (typeof fl.parseLrcOrGeneratePseudoSync === 'function') {
                            fl.parseLrcOrGeneratePseudoSync(lines, raw);
                        }

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
                        fl.cachedLyrics.source = fl.activeLyricSource;

                        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;

                        if (typeof fl.translateExistingLyrics === 'function') {
                            await fl.translateExistingLyrics();
                            if (!isBypassingCache && typeof fl.saveToPersistentCache === 'function') {
                                fl.saveToPersistentCache(key);
                            }
                        }
                    } else if (!raw) {
                        fl.activeLyricSource = null;
                        fl.activeTranslationTier = 'None';
                        const isNetworkError = !retryResult || !retryResult.result || !!retryResult.result.isNetworkError;
                        if (isNetworkError) {
                            chrome.runtime.sendMessage({
                                type: 'TRACK_EVENT',
                                payload: { eventName: 'lyrics_fetch_result', params: { status: 'failure', error_type: 'network_error_retry' } }
                            }).catch(() => {});
                            fl.isBackgroundSearchFailed = true;
                            setTimeout(() => {
                                if (fl.isBackgroundSearchFailed) {
                                    fl.isBackgroundSearchFailed = false;
                                    if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                                }
                            }, 5000);
                        } else {
                            chrome.runtime.sendMessage({
                                type: 'TRACK_EVENT',
                                payload: { eventName: 'lyrics_fetch_result', params: { status: 'not_found', error_type: 'no_match_retry' } }
                            }).catch(() => {});
                            fl.isBackgroundSearchFailed = false;
                            if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                        }
                    }
                } catch (retryErr) {
                    console.warn("FL: Background retry error:", retryErr);
                    if (!raw) {
                        fl.activeLyricSource = null;
                        fl.activeTranslationTier = 'None';
                        fl.isBackgroundSearchFailed = true;
                        setTimeout(() => {
                            if (fl.isBackgroundSearchFailed) {
                                fl.isBackgroundSearchFailed = false;
                                if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                            }
                        }, 5000);
                    }
                } finally {
                    if (typeof fl.setIndicatorRetrying === 'function') fl.setIndicatorRetrying(false);
                }
            }
        } catch (e) {
            if (e.message === 'TrackChanged' || e.name === 'AbortError') return;
            const errType = e.name === 'AbortError' || e.message?.includes('timeout') ? 'timeout' : 'network_error';
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                payload: { eventName: 'lyrics_fetch_result', params: { status: 'failure', error_type: errType } }
            }).catch(() => {});
            fl.lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
            fl.isCurrentLyricSynced = false;
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
        }
    };

})();
