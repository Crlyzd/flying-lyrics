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

    // Settings
    fl.showTranslation = fl.defaults.showTranslation;
    fl.translationLang = fl.defaults.translationLang;
    fl.globalSyncOffset = fl.defaults.globalSyncOffset;
    fl.syncOffset = fl.globalSyncOffset;
    fl.autoLaunch = fl.defaults.autoLaunch;
    fl.songOffsets = fl.defaults.songOffsets;
    fl.lyricsOverrides = fl.defaults.lyricsOverrides;
    fl.pipMode = fl.defaults.pipMode;

    // Visual Settings
    fl.userFontFamily = fl.defaults.customFont;
    fl.userFontSize = fl.defaults.fontSize;
    fl.userBgBlur = fl.defaults.bgBlur;
    fl.userBgDarkness = fl.defaults.bgDarkness;
    fl.userCoverMode = fl.defaults.coverMode;
    fl.userGlowEnabled = fl.defaults.glowEnabled;
    fl.userGlowStyle = fl.defaults.glowStyle;
    fl.userLyricAlignment = fl.defaults.lyricAlignment;
    fl.userLineSpacing = fl.defaults.lineSpacing;
    fl.userVerticalAnchor = fl.defaults.verticalAnchor;
    fl.albumCoverMode = fl.defaults.albumCoverMode;
    fl.popupBgAnimation = fl.defaults.popupBgAnimation;
    fl.popupColor1 = fl.defaults.popupColor1;
    fl.popupColor2 = fl.defaults.popupColor2;
    fl.popupColor3 = fl.defaults.popupColor3;
    fl.galaxyMode = fl.defaults.galaxyMode;

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

    // Seed the default vibrant color in storage so the popup settings page
    // always has a value to read even before any album art is extracted.
    chrome.storage.local.get('currentVibrantColor', (existing) => {
        if (!existing.currentVibrantColor) {
            chrome.storage.local.set({ currentVibrantColor: fl.currentPalette.vibrant });
        }
    });

    // Stats Tracking State & Helpers
    fl.userStats = {
        totalSynced: 0,
        dailyStreak: 0,
        hoursListening: 0.0,
        lastSyncedDate: "",
        timeOfDayCounts: { morning: 0, afternoon: 0, evening: 0, night: 0 }
    };
    fl.lastSyncedTrackKey = "";
    fl.listeningTimeBufferMs = 0;
    fl.lastActiveTickMs = null;

    fl.checkDailyStreak = function () {
        const stats = fl.userStats;
        if (!stats.lastSyncedDate) return;
        const now = new Date();
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        if (stats.lastSyncedDate === todayStr) return; // Still active today

        const lastDate = new Date(stats.lastSyncedDate + 'T00:00:00');
        const todayDate = new Date(todayStr + 'T00:00:00');
        const diffTime = todayDate - lastDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 1) {
            stats.dailyStreak = 0; // Streak broken
            FLYING_LYRICS.storage.set({ userStats: stats });
        }
    };

    fl.incrementStatsTrack = function (key) {
        if (!key || fl.lastSyncedTrackKey === key) return;
        fl.lastSyncedTrackKey = key;

        const stats = fl.userStats;
        stats.totalSynced = (stats.totalSynced || 0) + 1;

        const now = new Date();
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        
        // Time of day
        const hour = now.getHours();
        let period = "night";
        if (hour >= 5 && hour < 12) period = "morning";
        else if (hour >= 12 && hour < 17) period = "afternoon";
        else if (hour >= 17 && hour < 21) period = "evening";
        
        stats.timeOfDayCounts = stats.timeOfDayCounts || { morning: 0, afternoon: 0, evening: 0, night: 0 };
        stats.timeOfDayCounts[period] = (stats.timeOfDayCounts[period] || 0) + 1;

        // Streak logic
        if (stats.lastSyncedDate) {
            if (stats.lastSyncedDate !== todayStr) {
                const lastDate = new Date(stats.lastSyncedDate + 'T00:00:00');
                const todayDate = new Date(todayStr + 'T00:00:00');
                const diffTime = todayDate - lastDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays === 1) {
                    stats.dailyStreak = (stats.dailyStreak || 0) + 1;
                } else {
                    stats.dailyStreak = 1;
                }
                stats.lastSyncedDate = todayStr;
            }
        } else {
            stats.dailyStreak = 1;
            stats.lastSyncedDate = todayStr;
        }

        FLYING_LYRICS.storage.set({ userStats: stats });
    };

    fl.listeningTimeBufferMs = 0;
    fl.accumulateListeningTime = function (deltaMs) {
        fl.listeningTimeBufferMs += deltaMs;
        if (fl.listeningTimeBufferMs >= 10000) { // Update every 10s
            const stats = fl.userStats;
            const hoursAdded = fl.listeningTimeBufferMs / (1000 * 60 * 60);
            stats.hoursListening = (stats.hoursListening || 0) + hoursAdded;
            fl.listeningTimeBufferMs = 0;
            FLYING_LYRICS.storage.set({ userStats: stats });
        }
    };

    fl.canvas = null;
    fl.ctx = null;

    // For Spotify / YTM DOM Time Interpolation
    fl.lastTimeStr = "";
    fl.lastTimeValue = 0;
    fl.lastUpdateMs = performance.now();
    fl.needsLayoutUpdate = false;

    let prefTimeout = null;
    function reportPreferencesDebounced() {
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
                        lyricAlignment: fl.userLyricAlignment,
                        lineSpacing: fl.userLineSpacing,
                        verticalAnchor: fl.userVerticalAnchor,
                        albumCoverMode: fl.albumCoverMode
                    }
                }
            });
        }, 1000);
    }

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

        // Visual
        fl.userFontFamily = items.customFont;
        fl.userFontSize = items.fontSize;
        fl.userBgBlur = items.bgBlur;
        fl.userBgDarkness = items.bgDarkness;
        fl.userCoverMode = items.coverMode;
        fl.userGlowEnabled = items.glowEnabled;
        fl.userGlowStyle = items.glowStyle;
        fl.userLyricAlignment = items.lyricAlignment;
        fl.userLineSpacing = items.lineSpacing;
        fl.userVerticalAnchor = items.verticalAnchor;
        fl.albumCoverMode = items.albumCoverMode;
        fl.popupBgAnimation = items.popupBgAnimation;
        fl.popupColor1 = items.popupColor1;
        fl.popupColor2 = items.popupColor2;
        fl.popupColor3 = items.popupColor3;
        fl.galaxyMode = items.galaxyMode ?? false;

        fl.needsLayoutUpdate = true;
        if (typeof fl.applyVisualSettings === 'function') {
            fl.applyVisualSettings();
        }

        // Report initial preferences snapshot
        reportPreferencesDebounced();
    });

    // Listen for updates
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'SETTINGS_UPDATE') {
            const p = msg.payload;
            if (p.autoLaunch !== undefined) {
                fl.autoLaunch = p.autoLaunch;
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
                    FLYING_LYRICS.storage.get({ songOffsets: {} }, (items) => {
                        const latestOffsets = items.songOffsets || {};
                        latestOffsets[key] = fl.syncOffset;
                        fl.songOffsets = latestOffsets;
                        FLYING_LYRICS.storage.set({ songOffsets: latestOffsets });
                    });
                }
            }
            if (p.lyricOverride !== undefined) {
                const meta = navigator.mediaSession.metadata;
                if (meta && meta.title && meta.artist) {
                    const key = `${meta.artist} - ${meta.title}`;

                    // Retrieve BOTH overrides and the persistence cache
                    FLYING_LYRICS.storage.get(['lyricsOverrides', 'lyricsCache'], (items) => {
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

                        FLYING_LYRICS.storage.set(updates, () => {
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
            reportPreferencesDebounced();
        } else if (msg.type === 'GET_SYNC_OFFSET') {
            sendResponse({ syncOffset: fl.syncOffset });
        } else if (msg.type === 'GET_CURRENT_TRACK') {
            const meta = navigator.mediaSession.metadata;
            if (meta && meta.title && meta.artist) {
                // Also expose the sanitized values so the popup can pre-fill a
                // clean, API-friendly search query without any manual editing.
                const cleanTitle     = typeof fl.cleanTitle === 'function'
                    ? fl.cleanTitle(meta.title)
                    : meta.title;
                const primaryArtist  = typeof fl.extractPrimaryArtist === 'function'
                    ? fl.extractPrimaryArtist(meta.artist)
                    : meta.artist;
                sendResponse({ artist: meta.artist, title: meta.title, cleanTitle, primaryArtist });
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

    // Bootstrapper
    setInterval(() => {
        if (typeof fl.createLauncher === 'function') fl.createLauncher();
    }, 2000);

})();