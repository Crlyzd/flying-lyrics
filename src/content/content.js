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
    fl.hasAutoLaunched = false;
    fl.hasTriggeredAutoNext = false; // Latch to prevent multiple simulated next clicks per song (workaround for YTM seeker bar desync)

    // Settings
    fl.showTranslation = fl.defaults.showTranslation;
    fl.translationLang = fl.defaults.translationLang;
    fl.globalSyncOffset = fl.defaults.globalSyncOffset;
    fl.syncOffset = fl.globalSyncOffset;
    fl.autoLaunch = fl.defaults.autoLaunch;
    fl.songOffsets = fl.defaults.songOffsets;
    fl.lyricsOverrides = fl.defaults.lyricsOverrides;
    fl.pipMode = fl.defaults.pipMode;
    fl.ecoMode = fl.defaults.ecoMode;
    fl.fluidScrolling = fl.defaults.fluidScrolling;
    fl.lastPipWidth = fl.defaults.lastPipWidth;
    fl.lastPipHeight = fl.defaults.lastPipHeight;

    // Visual Settings
    fl.userFontFamily = fl.defaults.customFont;
    fl.userFontSize = fl.defaults.fontSize;
    fl.userBgBlur = fl.defaults.bgBlur;
    fl.userBgDarkness = fl.defaults.bgDarkness;
    fl.userCoverMode = fl.defaults.coverMode;
    fl.userGlowEnabled = fl.defaults.glowEnabled;
    fl.userGlowStyle = fl.defaults.glowStyle;
    fl.userSpotlightEnabled = fl.defaults.spotlightEnabled;
    fl.userLyricShadowEnabled = fl.defaults.lyricShadowEnabled;
    fl.userLyricAlignment = fl.defaults.lyricAlignment;
    fl.userLineSpacing = fl.defaults.lineSpacing;
    fl.userVerticalAnchor = fl.defaults.verticalAnchor;
    fl.albumCoverMode = fl.defaults.albumCoverMode;
    fl.popupBgAnimation = fl.defaults.popupBgAnimation;
    fl.popupColor1 = fl.defaults.popupColor1;
    fl.popupColor2 = fl.defaults.popupColor2;
    fl.popupColor3 = fl.defaults.popupColor3;
    fl.galaxyMode = fl.defaults.galaxyMode;
    fl.needsVideoFramePush = false;

    // Cache State
    fl.cachedLyrics = { key: "", lines: [], isSynced: false, source: null };

    // Active Lyric Source
    fl.activeLyricSource = null;

    // Dynamic Colors State
    fl.currentPalette = {
        vibrant: "#1DB954", // Default Spotify Green
        trans: "#A0C0E0",   // Default Translation Blue
        romaji: "#F5AF19"   // Default Romaji Orange
    };
    fl.lastExtractedArt = "";

    // Seed the default vibrant color in storage so the popup settings page
    // always has a value to read even before any album art is extracted.
    chrome.storage.local.get('currentVibrantColor', (existing) => {
        if (!existing.currentVibrantColor) {
            chrome.storage.local.set({ currentVibrantColor: fl.currentPalette.vibrant });
        }
    });

    fl.canvas = null;
    fl.ctx = null;

    // For Spotify / YTM DOM Time Interpolation
    fl.lastTimeStr = "";
    fl.lastTimeValue = 0;
    fl.lastUpdateMs = performance.now();
    fl.needsLayoutUpdate = false;

    // Load initial settings (main + visual customization) ONCE
    const initialQuery = Object.assign({}, fl.defaults, { userStats: null });
    FLYING_LYRICS.storage.get(initialQuery, (items) => {
        // Load User Stats
        if (items.userStats) {
            fl.userStats = Object.assign(fl.userStats, items.userStats);
        }
        fl.checkDailyStreak();

        // Functional
        fl.showTranslation = items.showTranslation;
        fl.translationLang = items.translationLang;
        fl.globalSyncOffset = items.globalSyncOffset;
        fl.syncOffset = fl.globalSyncOffset; // Fallback init
        fl.autoLaunch = items.autoLaunch;
        fl.songOffsets = items.songOffsets;
        fl.lyricsOverrides = items.lyricsOverrides;
        fl.pipMode = items.pipMode;
        fl.ecoMode = items.ecoMode;
        fl.fluidScrolling = items.fluidScrolling;
        fl.lastPipWidth = items.lastPipWidth;
        fl.lastPipHeight = items.lastPipHeight;

        // Visual
        fl.userFontFamily = items.customFont;
        fl.userFontSize = items.fontSize;
        fl.userBgBlur = items.bgBlur;
        fl.userBgDarkness = items.bgDarkness;
        fl.userCoverMode = items.coverMode;
        fl.userGlowEnabled = items.glowEnabled;
        fl.userGlowStyle = items.glowStyle;
        fl.userSpotlightEnabled = items.spotlightEnabled;
        fl.userLyricShadowEnabled = items.lyricShadowEnabled ?? true; // default true for existing installs
        fl.userLyricAlignment = items.lyricAlignment;
        fl.userLineSpacing = items.lineSpacing;
        fl.userVerticalAnchor = items.verticalAnchor;
        fl.albumCoverMode = items.albumCoverMode;
        fl.popupBgAnimation = items.popupBgAnimation;
        fl.popupColor1 = items.popupColor1;
        fl.popupColor2 = items.popupColor2;
        fl.popupColor3 = items.popupColor3;
        fl.galaxyMode = items.galaxyMode ?? false;
        fl.devBypassCache = items.devBypassCache ?? false;
        fl.devDisableTranslation = items.devDisableTranslation ?? false;
        fl.devTranslateStagger = items.devTranslateStagger || 150;
        fl.devSearchProviders = items.devSearchProviders || null;
        fl.devSearchLatency = items.devSearchLatency ?? false;
        fl.devSimulateSearch = items.devSimulateSearch || 'none';
        fl.devSimulateTrans = items.devSimulateTrans || 'none';
        fl.devTransProviders = items.devTransProviders || null;

        fl.needsLayoutUpdate = true;
        if (typeof fl.applyVisualSettings === 'function') {
            fl.applyVisualSettings();
        }

        // Report initial preferences snapshot
        if (typeof fl.reportPreferencesDebounced === 'function') {
            fl.reportPreferencesDebounced();
        }
    });

    // Bootstrapper
    setInterval(() => {
        if (typeof fl.createLauncher === 'function') fl.createLauncher();
    }, 2000);

})();