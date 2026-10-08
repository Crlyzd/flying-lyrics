(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — RUNTIME MESSAGE ROUTER & PREFERENCES REPORTER
    // ─────────────────────────────────────────────────────────────────────────────

    let prefTimeout = null;
    fl.reportPreferencesDebounced = function () {
        if (prefTimeout) clearTimeout(prefTimeout);
        prefTimeout = setTimeout(() => {
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                payload: {
                    eventName: 'user_preferences',
                    params: {
                        showTranslation: fl.showTranslation,
                        translationLang: fl.translationLang,
                        globalSyncOffset: fl.globalSyncOffset,
                        autoLaunch: fl.autoLaunch,
                        customFont: fl.userFontFamily,
                        fontSize: fl.userFontSize,
                        bgBlur: fl.userBgBlur,
                        bgDarkness: fl.userBgDarkness,
                        coverMode: fl.userCoverMode,
                        glowEnabled: fl.userGlowEnabled,
                        glowStyle: fl.userGlowStyle,
                        spotlightEnabled: fl.userSpotlightEnabled,
                        lyricShadowEnabled: fl.userLyricShadowEnabled,
                        lyricAlignment: fl.userLyricAlignment,
                        lineSpacing: fl.userLineSpacing,
                        verticalAnchor: fl.userVerticalAnchor,
                        albumCoverMode: fl.albumCoverMode
                    }
                }
            });
        }, 1000);
    };

    // Listen for updates
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'SETTINGS_UPDATE') {
            if (typeof fl.handleSettingsUpdate === 'function') {
                fl.handleSettingsUpdate(msg, sendResponse);
            } else if (typeof sendResponse === 'function') {
                sendResponse({ success: true });
            }
        } else if (msg.type === 'PURGE_LYRICS_CACHE') {
            fl.cachedLyrics = { key: "", lines: [], isSynced: false, translationLang: "", source: null };
            console.log('[Flying Lyrics:Dev] In-memory lyric cache purged');
            if (typeof sendResponse === 'function') sendResponse({ success: true });
        } else if (msg.type === 'FORCE_REFETCH_CURRENT') {
            const meta = typeof fl.getCurrentTrackMetadata === 'function'
                ? fl.getCurrentTrackMetadata()
                : navigator.mediaSession?.metadata;
            if (meta && meta.artist && meta.title) {
                const key = `${meta.artist} - ${meta.title}`;
                fl.cachedLyrics = { key: "", lines: [], isSynced: false, translationLang: "", source: null };
                fl.activeLyricSource = null;
                fl.activeTranslationTier = fl.devDisableTranslation ? 'Disabled (Dev)' : 'None';
                FLYING_LYRICS.storage.get('lyricsCache', async ({ lyricsCache }) => {
                    if (lyricsCache?.entries?.[key]) {
                        delete lyricsCache.entries[key];
                        lyricsCache.order = (lyricsCache.order || []).filter(k => k !== key);
                        FLYING_LYRICS.storage.set({ lyricsCache });
                    }
                    if (typeof fl.fetchLyrics === 'function') {
                        try {
                            await fl.fetchLyrics(0, { bypassCache: true });
                        } catch (e) {}
                    }
                    if (typeof sendResponse === 'function') sendResponse({ success: true });
                });
                return true;
            } else {
                if (typeof sendResponse === 'function') sendResponse({ success: false, error: 'No active track' });
            }
        } else if (msg.type === 'GET_SYNC_OFFSET') {
            sendResponse({ syncOffset: fl.syncOffset });
        } else if (msg.type === 'GET_CURRENT_TRACK') {
            const trackMeta = typeof fl.getCurrentTrackMetadata === 'function'
                ? fl.getCurrentTrackMetadata()
                : null;
            const meta = trackMeta || navigator.mediaSession?.metadata;
            if (meta && meta.title && meta.artist) {
                const cleanTitle = typeof fl.cleanTitle === 'function' ? fl.cleanTitle(meta.title) : meta.title;
                const primaryArtist = typeof fl.extractPrimaryArtist === 'function' ? fl.extractPrimaryArtist(meta.artist) : meta.artist;
                const key = `${meta.artist} - ${meta.title}`;
                let lyricSourceStr = 'None';
                if (typeof fl.activeLyricSource === 'string') {
                    lyricSourceStr = fl.activeLyricSource;
                } else if (fl.activeLyricSource && typeof fl.activeLyricSource === 'object') {
                    lyricSourceStr = fl.activeLyricSource.provider || fl.activeLyricSource.type || fl.activeLyricSource.name || 'Unknown';
                }

                sendResponse({
                    artist: meta.artist,
                    title: meta.title,
                    cleanTitle,
                    primaryArtist,
                    duration: (fl.getPlayerState && typeof fl.getPlayerState === 'function') ? (fl.getPlayerState().duration || 0) : 0,
                    lyricSource: lyricSourceStr,
                    isSynced: fl.isCurrentLyricSynced || false,
                    isCached: !!(fl.cachedLyrics && fl.cachedLyrics.key === key && fl.cachedLyrics.lines?.length),
                    lineCount: Array.isArray(fl.lyricLines) ? fl.lyricLines.length : 0,
                    translationTier: fl.activeTranslationTier || 'None'
                });
            } else {
                sendResponse({ error: 'No active track' });
            }
        } else if (msg.type === 'IS_PIP_OPEN') {
            const isOpen = !!(fl.pipWin && !fl.pipWin.closed) || (fl.activePipType === 'video' && !!document.pictureInPictureElement);
            sendResponse({ isOpen: isOpen });
        } else if (msg.type === 'GET_ACTIVE_LYRIC') {
            sendResponse({ source: fl.activeLyricSource });
        } else if (msg.type === 'GET_LYRIC_LRC') {
            if (!fl.lyricLines || fl.lyricLines.length === 0) {
                sendResponse({ lrcText: '' });
                return;
            }
            // Skip placeholders
            if (fl.lyricLines.length === 1 && fl.lyricLines[0].time === 0 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder || fl.lyricLines[0].text === "No lyrics found")) {
                sendResponse({ lrcText: '' });
                return;
            }
            const lrcLines = fl.lyricLines.map(l => {
                const min = Math.floor(l.time / 60).toString().padStart(2, '0');
                const sec = (l.time % 60).toFixed(2).padStart(5, '0');
                return `[${min}:${sec}]${l.text}`;
            });
            sendResponse({ lrcText: lrcLines.join('\n') });
        } else if (msg.type === 'GET_PIP_STREAM_STATE') {
            const playerState = typeof fl.getPlayerState === 'function' ? fl.getPlayerState() : { time: 0, duration: 1, paused: true };
            const adapter = fl.getActiveAdapter?.();
            const meta = typeof fl.getCurrentTrackMetadata === 'function' ? fl.getCurrentTrackMetadata() : navigator.mediaSession?.metadata;
            sendResponse({
                title: meta?.title || '',
                artist: meta?.artist || '',
                currentTime: playerState.time || 0,
                duration: playerState.duration || 1,
                paused: playerState.paused,
                isMuted: adapter?.isMuted ? adapter.isMuted() : false,
                coverArt: fl.getCoverArt?.() || null,
                lyricLines: fl.lyricLines || [],
                isSynced: fl.isCurrentLyricSynced || false,
                currentPalette: fl.currentPalette || null,
                syncOffset: fl.syncOffset || 0
            });
        } else if (msg.type === 'PLAYER_COMMAND') {
            const { action, payload } = msg;
            const adapter = fl.getActiveAdapter?.();
            if (adapter) {
                if (action === 'playpause') adapter.clickPlayPause();
                else if (action === 'next') adapter.clickNext();
                else if (action === 'prev') adapter.clickPrev();
                else if (action === 'mute') adapter.toggleMute();
                else if (action === 'seek' && payload?.percent !== undefined) adapter.seek(payload.percent);
                else if (action === 'toggle_translation') {
                    fl.showTranslation = !fl.showTranslation;
                    if (typeof FLYING_LYRICS?.storage?.set === 'function') {
                        FLYING_LYRICS.storage.set({ showTranslation: fl.showTranslation });
                    }
                    if (fl.showTranslation && typeof fl.translateExistingLyrics === 'function') {
                        fl.translateExistingLyrics();
                    }
                    fl.needsLayoutUpdate = true;
                }
            }
            sendResponse({ success: true });
        }
    });

})();
