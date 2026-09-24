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
            const p = msg.payload;
            if (p.autoLaunch !== undefined) {
                fl.autoLaunch = p.autoLaunch;
            }
            if (p.lastPipWidth !== undefined) {
                fl.lastPipWidth = p.lastPipWidth;
            }
            if (p.lastPipHeight !== undefined) {
                fl.lastPipHeight = p.lastPipHeight;
            }
            if (p.pipMode !== undefined) {
                if (fl.pipMode !== p.pipMode) {
                    fl.pipMode = p.pipMode;
                    if (fl.pipMode === 'video' && typeof fl.prepareVideoPip === 'function') {
                        fl.prepareVideoPip();
                    }
                    if (fl.pipWin) {
                        const wasType = fl.activePipType;
                        if (wasType === 'video') {
                            document.exitPictureInPicture().catch(() => {});
                        } else if (wasType === 'document' && !fl.pipWin.closed) {
                            fl.pipWin.close();
                        }
                        // Automatically try to reopen in the new mode
                        setTimeout(() => {
                            if (typeof fl.launchPip === 'function') {
                                fl.launchPip().catch(err => {
                                    console.warn("Auto-reopen failed due to browser user-gesture restrictions:", err);
                                });
                            }
                        }, 600);
                    }
                }
            }
            if (p.showTranslation !== undefined) {
                fl.showTranslation = p.showTranslation;
                fl.needsLayoutUpdate = true;
                if (fl.showTranslation && typeof fl.translateExistingLyrics === 'function') fl.translateExistingLyrics();
                if (typeof fl.updateCCButtonState === 'function') fl.updateCCButtonState();
            }
            if (p.translationLang !== undefined) {
                fl.translationLang = p.translationLang;
                fl.lyricLines.forEach(line => line.translation = "");
                fl.needsLayoutUpdate = true;
                if (fl.showTranslation && typeof fl.translateExistingLyrics === 'function') fl.translateExistingLyrics();
            }
            if (p.globalSyncOffset !== undefined) {
                fl.globalSyncOffset = p.globalSyncOffset;
                const currentMeta = typeof fl.getCurrentTrackMetadata === 'function' ? fl.getCurrentTrackMetadata() : null;
                const meta = currentMeta || navigator.mediaSession?.metadata;
                if (meta && meta.title && meta.artist) {
                    const key = p.trackKey || `${meta.artist} - ${meta.title}`;
                    if (fl.songOffsets[key] === undefined) {
                        fl.syncOffset = fl.globalSyncOffset;
                    }
                }
            }
            if (p.syncOffset !== undefined) {
                fl.syncOffset = p.syncOffset;
                const currentMeta = typeof fl.getCurrentTrackMetadata === 'function' ? fl.getCurrentTrackMetadata() : null;
                const meta = currentMeta || navigator.mediaSession?.metadata;
                if ((meta && meta.title && meta.artist) || p.trackKey) {
                    const primaryKey = p.trackKey || `${meta.artist} - ${meta.title}`;
                    const fallbackKey = (meta && meta.title && meta.artist) ? `${meta.artist} - ${meta.title}` : primaryKey;
                    FLYING_LYRICS.storage.get({ songOffsets: {} }, (items) => {
                        const latestOffsets = items.songOffsets || {};
                        latestOffsets[primaryKey] = fl.syncOffset;
                        if (fallbackKey !== primaryKey) {
                            latestOffsets[fallbackKey] = fl.syncOffset;
                        }
                        fl.songOffsets = latestOffsets;
                        FLYING_LYRICS.storage.set({ songOffsets: latestOffsets });
                    });
                }
            }
            if (p.lyricOverride !== undefined) {
                const currentMeta = typeof fl.getCurrentTrackMetadata === 'function' ? fl.getCurrentTrackMetadata() : null;
                const meta = currentMeta || navigator.mediaSession?.metadata;
                if ((meta && meta.title && meta.artist) || p.trackKey) {
                    const primaryKey = p.trackKey || `${meta.artist} - ${meta.title}`;
                    const fallbackKey = (meta && meta.title && meta.artist) ? `${meta.artist} - ${meta.title}` : primaryKey;

                    // Retrieve BOTH overrides and the persistence cache
                    FLYING_LYRICS.storage.get(['lyricsOverrides', 'lyricsCache'], (items) => {
                        const latestOverrides = items.lyricsOverrides || {};
                        latestOverrides[primaryKey] = p.lyricOverride;
                        if (fallbackKey !== primaryKey) {
                            latestOverrides[fallbackKey] = p.lyricOverride;
                        }
                        fl.lyricsOverrides = latestOverrides;

                        const updates = { lyricsOverrides: latestOverrides };

                        // If the old wrong lyrics are in Tier 2 cache, obliterate them
                        if (items.lyricsCache) {
                            const cache = items.lyricsCache;
                            const keysToPurge = [primaryKey, fallbackKey].filter(Boolean);
                            let modified = false;

                            keysToPurge.forEach(k => {
                                if (cache.entries && cache.entries[k]) {
                                    delete cache.entries[k];
                                    modified = true;
                                }
                                if (cache.order && cache.order.includes(k)) {
                                    cache.order = cache.order.filter(entryKey => entryKey !== k);
                                    modified = true;
                                }
                            });

                            if (modified) {
                                updates.lyricsCache = cache;
                            }
                        }

                        FLYING_LYRICS.storage.set(updates, () => {
                            // Clear Tier 1 active memory
                            fl.cachedLyrics.key = "";
                            fl.cachedLyrics.source = null;
                            // Trigger full fetch (Tier 3 Network check)
                            if (typeof fl.fetchLyrics === 'function') fl.fetchLyrics();
                        });
                    });
                }
            }

            // --- Visual Customization Settings ---
            if (p.customFont !== undefined) {
                fl.userFontFamily = p.customFont;
                fl.needsLayoutUpdate = true;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.fontSize !== undefined) {
                fl.userFontSize = p.fontSize;
                fl.needsLayoutUpdate = true;
            }
            if (p.bgBlur !== undefined) {
                fl.userBgBlur = p.bgBlur;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.bgDarkness !== undefined) {
                fl.userBgDarkness = p.bgDarkness;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.coverMode !== undefined) {
                fl.userCoverMode = p.coverMode;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.glowEnabled !== undefined) {
                fl.userGlowEnabled = p.glowEnabled;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.glowStyle !== undefined) {
                fl.userGlowStyle = p.glowStyle;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.spotlightEnabled !== undefined) {
                fl.userSpotlightEnabled = p.spotlightEnabled;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.lyricShadowEnabled !== undefined) {
                fl.userLyricShadowEnabled = p.lyricShadowEnabled;
                // Shadow toggle doesn't change layout metrics (no relayout needed).
                // Clearing the idle flag is enough to wake the loop for one immediate redraw.
                fl.hasDrawnIdleFrame = false;
            }

            if (p.lyricAlignment !== undefined) {
                fl.userLyricAlignment = p.lyricAlignment;
                fl.needsLayoutUpdate = true;
            }
            if (p.lineSpacing !== undefined) {
                // lineSpacing is a raw vmin multiplier (0–10)
                fl.userLineSpacing = p.lineSpacing;
                fl.needsLayoutUpdate = true;
            }
            if (p.verticalAnchor !== undefined) {
                fl.userVerticalAnchor = p.verticalAnchor;
                fl.needsLayoutUpdate = true;
            }
            if (p.albumCoverMode !== undefined) {
                fl.albumCoverMode = p.albumCoverMode;
                fl.needsLayoutUpdate = true;
                fl.hasDrawnIdleFrame = false;
                if (fl.albumCoverMode) {
                    fl.scrollPos = fl.targetScroll;
                }
                // Re-apply visuals immediately — forces or releases the cover mode override
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }

            if (p.popupBgAnimation !== undefined) {
                fl.popupBgAnimation = p.popupBgAnimation;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.popupColor1 !== undefined) {
                fl.popupColor1 = p.popupColor1;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.popupColor2 !== undefined) {
                fl.popupColor2 = p.popupColor2;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.popupColor3 !== undefined) {
                fl.popupColor3 = p.popupColor3;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.galaxyMode !== undefined) {
                fl.galaxyMode = p.galaxyMode;
                fl.needsLayoutUpdate = true;
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            }
            if (p.ecoMode !== undefined) {
                fl.ecoMode = p.ecoMode;
            }
            if (p.fluidScrolling !== undefined) {
                fl.fluidScrolling = p.fluidScrolling;
            }
            if (p.devBypassCache !== undefined) {
                fl.devBypassCache = p.devBypassCache;
            }
            if (p.devDisableTranslation !== undefined) {
                fl.devDisableTranslation = p.devDisableTranslation;
            }
            if (p.devTranslateStagger !== undefined) {
                fl.devTranslateStagger = p.devTranslateStagger;
            }
            if (p.devSearchProviders !== undefined) {
                fl.devSearchProviders = p.devSearchProviders;
            }
            if (p.devSearchLatency !== undefined) {
                fl.devSearchLatency = p.devSearchLatency;
            }
            if (p.devSimulateSearch !== undefined) {
                fl.devSimulateSearch = p.devSimulateSearch;
            }
            if (p.devSimulateTrans !== undefined) {
                fl.devSimulateTrans = p.devSimulateTrans;
            }
            if (p.devTransProviders !== undefined) {
                fl.devTransProviders = p.devTransProviders;
            }
            // If any visual settings were changed, trigger a single-frame redraw
            // and force-push the frame to the video PiP window if it is currently paused.
            const hasVisualUpdate = p.customFont !== undefined || p.fontSize !== undefined ||
                p.bgBlur !== undefined || p.bgDarkness !== undefined || p.coverMode !== undefined ||
                p.glowEnabled !== undefined || p.glowStyle !== undefined || p.spotlightEnabled !== undefined ||
                p.lyricShadowEnabled !== undefined || p.lyricAlignment !== undefined ||
                p.lineSpacing !== undefined || p.verticalAnchor !== undefined ||
                p.albumCoverMode !== undefined;

            if (hasVisualUpdate) {
                fl.hasDrawnIdleFrame = false;
                fl.needsVideoFramePush = true;
            }

            fl.reportPreferencesDebounced();
            if (typeof sendResponse === 'function') {
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
        }
    });

})();
