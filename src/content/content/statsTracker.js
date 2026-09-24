(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — USER STATS TRACKER (content script context)
    // ─────────────────────────────────────────────────────────────────────────────

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

})();
