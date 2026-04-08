(() => {
    const fl = window.FLYING_LYRICS || {};
    window.FLYING_LYRICS = fl;

    // --- GLOBAL STATE & INIT ---
    fl.currentTrack = "";
    fl.lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "", translation: "" }];
    fl.isCurrentLyricSynced = false;
    fl.scrollPos = 0;
    fl.targetScroll = 0;
    fl.pipWin = null;

    // Settings
    fl.showTranslation = fl.defaults.showTranslation;
    fl.translationLang = fl.defaults.translationLang;
    fl.globalSyncOffset = fl.defaults.globalSyncOffset;
    fl.syncOffset = fl.globalSyncOffset;
    fl.autoLaunch = fl.defaults.autoLaunch;
    fl.songOffsets = fl.defaults.songOffsets;
    fl.lyricsOverrides = fl.defaults.lyricsOverrides;

    // Visual Settings
    fl.userFontFamily = fl.defaults.customFont;
    fl.userFontSize = fl.defaults.fontSize;
    fl.userBgBlur = fl.defaults.bgBlur;
    fl.userBgDarkness = fl.defaults.bgDarkness;
    fl.userCoverMode = fl.defaults.coverMode;
    fl.userGlowEnabled = fl.defaults.glowEnabled;
    fl.userGlowStyle = fl.defaults.glowStyle;
    fl.userShowLyrics = fl.defaults.showLyrics;
    fl.userLyricAlignment = fl.defaults.lyricAlignment;
    fl.userLineSpacing = fl.defaults.lineSpacing;

    // Cache State
    fl.cachedLyrics = { key: "", lines: [], isSynced: false };

    // Active Lyric Source
    fl.activeLyricSource = null;

    // Dynamic Colors State
    fl.currentPalette = {
        vibrant: "#1DB954", // Default Spotify Green
        trans: "#A0C0E0",   // Default Translation Blue
        romaji: "#F5AF19"   // Default Romaji Orange
    };
    fl.lastExtractedArt = "";

    fl.canvas = null;
    fl.ctx = null;

    // For Spotify Time Interpolation
    fl.lastTimeStr = "";
    fl.lastTimeValue = 0;
    fl.lastUpdateMs = performance.now();
    fl.needsLayoutUpdate = false;

    // Load initial settings (main + visual customization) ONCE
    chrome.storage.local.get(fl.defaults, (items) => {
        // Functional
        fl.showTranslation = items.showTranslation;
        fl.translationLang = items.translationLang;
        fl.globalSyncOffset = items.globalSyncOffset;
        fl.syncOffset = fl.globalSyncOffset; // Fallback init
        fl.autoLaunch = items.autoLaunch;
        fl.songOffsets = items.songOffsets;
        fl.lyricsOverrides = items.lyricsOverrides;

        // Visual
        fl.userFontFamily = items.customFont;
        fl.userFontSize = items.fontSize;
        fl.userBgBlur = items.bgBlur;
        fl.userBgDarkness = items.bgDarkness;
        fl.userCoverMode = items.coverMode;
        fl.userGlowEnabled = items.glowEnabled;
        fl.userGlowStyle = items.glowStyle;
        fl.userShowLyrics = items.showLyrics;
        fl.userLyricAlignment = items.lyricAlignment;
        fl.userLineSpacing = items.lineSpacing;

        fl.needsLayoutUpdate = true;
        if (typeof fl.applyVisualSettings === 'function') {
            fl.applyVisualSettings();
        }
    });

    // Listen for updates
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'SETTINGS_UPDATE') {
            const p = msg.payload;
            if (p.autoLaunch !== undefined) {
                fl.autoLaunch = p.autoLaunch;
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
                const meta = navigator.mediaSession.metadata;
                if (meta && meta.title && meta.artist) {
                    const key = `${meta.artist} - ${meta.title}`;
                    if (fl.songOffsets[key] === undefined) {
                        fl.syncOffset = fl.globalSyncOffset;
                    }
                }
            }
            if (p.syncOffset !== undefined) {
                fl.syncOffset = p.syncOffset;
                const meta = navigator.mediaSession.metadata;
                if (meta && meta.title && meta.artist) {
                    const key = `${meta.artist} - ${meta.title}`;
                    chrome.storage.local.get({ songOffsets: {} }, (items) => {
                        const latestOffsets = items.songOffsets || {};
                        latestOffsets[key] = fl.syncOffset;
                        fl.songOffsets = latestOffsets;
                        chrome.storage.local.set({ songOffsets: latestOffsets });
                    });
                }
            }
            if (p.lyricOverride !== undefined) {
                const meta = navigator.mediaSession.metadata;
                if (meta && meta.title && meta.artist) {
                    const key = `${meta.artist} - ${meta.title}`;

                    // Retrieve BOTH overrides and the persistence cache
                    chrome.storage.local.get(['lyricsOverrides', 'lyricsCache'], (items) => {
                        const latestOverrides = items.lyricsOverrides || {};
                        latestOverrides[key] = p.lyricOverride;
                        fl.lyricsOverrides = latestOverrides;

                        const updates = { lyricsOverrides: latestOverrides };

                        // If the old wrong lyrics are in Tier 2 cache, obliterate them
                        if (items.lyricsCache) {
                            const cache = items.lyricsCache;
                            const hasEntry = cache.entries && cache.entries[key];
                            const inOrder = cache.order && cache.order.includes(key);

                            if (hasEntry || inOrder) {
                                if (hasEntry) delete cache.entries[key];
                                if (inOrder) cache.order = cache.order.filter(k => k !== key);
                                updates.lyricsCache = cache;
                            }
                        }

                        chrome.storage.local.set(updates, () => {
                            // Clear Tier 1 active memory
                            fl.cachedLyrics.key = "";
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
            if (p.showLyrics !== undefined) {
                fl.userShowLyrics = p.showLyrics;
                fl.needsLayoutUpdate = true;
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
        } else if (msg.type === 'GET_SYNC_OFFSET') {
            sendResponse({ syncOffset: fl.syncOffset });
        } else if (msg.type === 'GET_CURRENT_TRACK') {
            const meta = navigator.mediaSession.metadata;
            if (meta && meta.title && meta.artist) {
                sendResponse({ artist: meta.artist, title: meta.title });
            } else {
                sendResponse({ error: 'No active track' });
            }
        } else if (msg.type === 'GET_ACTIVE_LYRIC') {
            sendResponse({ source: fl.activeLyricSource });
        }
    });

    // Bootstrapper
    setInterval(() => {
        if (typeof fl.createLauncher === 'function') fl.createLauncher();
    }, 2000);

})();