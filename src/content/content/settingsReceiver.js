(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — SETTINGS RECEIVER & RUNTIME DISPATCHER
    // ─────────────────────────────────────────────────────────────────────────────

    fl.handleSettingsUpdate = function (msg, sendResponse) {
        const p = msg.payload;
        if (!p) {
            if (typeof sendResponse === 'function') sendResponse({ success: false });
            return;
        }

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
                const hasActivePip = !!fl.pipWin || (fl.activePipType === 'video' && !!document.pictureInPictureElement);
                if (hasActivePip) {
                    const wasType = fl.activePipType;
                    if (wasType === 'video' || document.pictureInPictureElement) {
                        document.exitPictureInPicture().catch(() => {});
                    } else if (wasType === 'document' && fl.pipWin && !fl.pipWin.closed) {
                        fl.pipWin.close();
                    }

                    const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');

                    if (isFirefox) {
                        // Firefox (Gecko) does not propagate transient user activation across extension IPC.
                        // Calling fl.launchPip() asynchronously throws NotAllowedError.
                        // Prompt the user via a pulsing FLYING LYRICS launcher button on the host tab.
                        if (typeof fl.pulseLauncherButton === 'function') {
                            fl.pulseLauncherButton(fl.pipMode);
                        }
                    } else {
                        // Chrome / Chromium preserves user activation across tabs.sendMessage via UAv2.
                        // Clear latches and auto-reopen in the new mode without manual user gesture prompts.
                        fl.pipWin = null;
                        fl.isLaunchingPip = false;
                        setTimeout(() => {
                            if (typeof fl.launchPip === 'function') {
                                fl.launchPip().catch(err => {
                                    console.warn("[Flying Lyrics] Chromium auto-reopen failed:", err);
                                });
                            }
                        }, 100);
                    }
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

        if (typeof fl.reportPreferencesDebounced === 'function') {
            fl.reportPreferencesDebounced();
        }
        if (typeof sendResponse === 'function') {
            sendResponse({ success: true });
        }
    };
})();
