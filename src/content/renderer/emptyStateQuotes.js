(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — EMPTY STATE & WAITING QUOTES (content context)
    // ─────────────────────────────────────────────────────────────────────────────

    const EMPTY_STATE_TEXTS = [
        { type: "stat", key: "totalSynced", template: "You've synced {val} tracks so far. Nice." },
        { type: "stat", key: "dailyStreak", template: "Current streak: {val} days of good music." },
        { type: "stat", key: "totalSynced", template: "{val} songs and counting..." },
        { type: "stat", key: "hoursListening", template: "You've spent {val} hours reading lyrics." },
        { type: "stat", key: "favoriteTime", template: "Fun fact: your most active time is {val}." },
        { type: "meme", text: "Waiting for the beat to drop..." },
        { type: "meme", text: "Tuning the digital piano..." },
        { type: "meme", text: "Checking if the aux cord is plugged in..." },
        { type: "meme", text: "Pigeons can recognize good music. Can you?" },
        { type: "meme", text: "Loading the next banger..." },
        { type: "meme", text: "Are you going to play something or just stare at me?" },
        { type: "meme", text: "Polishing the vinyl..." },
        { type: "meme", text: "Warming up the vocal cords..." },
        { type: "meme", text: "Searching the multiverse for lyrics..." },
        { type: "meme", text: "Did you forget to press play?" },
        { type: "meme", text: "Mic check, one two, one two..." },
        { type: "meme", text: "The silence is deafening." },
        { type: "meme", text: "Vibing in the void..." },
        { type: "meme", text: "Even silence has a rhythm..." },
        { type: "meme", text: "Summoning the music gods..." },
        { type: "meme", text: "Is this John Cage's 4'33\"?" },
        { type: "meme", text: "Brewing some lo-fi beats..." },
        { type: "meme", text: "Untangling the headphone wires..." },
        { type: "meme", text: "Blowing dust off the cartridge..." },
        { type: "meme", text: "Waiting for the DJ to show up..." },
        { type: "meme", text: "Looking for the play button..." },
        { type: "meme", text: "Translating silence into Japanese..." },
        { type: "meme", text: "Connecting to the music matrix..." },
        { type: "meme", text: "Charging the flux capacitor..." },
        { type: "meme", text: "Still waiting..." }
    ];

    function resolveStatText(item) {
        if (!fl.userStats) return null;
        if (item.key === "totalSynced") {
            const val = fl.userStats.totalSynced || 0;
            if (val === 0) return null;
            return item.template.replace("{val}", val);
        }
        if (item.key === "dailyStreak") {
            const val = fl.userStats.dailyStreak || 0;
            if (val === 0) return null;
            return item.template.replace("{val}", val);
        }
        if (item.key === "hoursListening") {
            const val = fl.userStats.hoursListening || 0;
            const formatted = val.toFixed(1);
            if (parseFloat(formatted) === 0) return null;
            return item.template.replace("{val}", formatted);
        }
        if (item.key === "favoriteTime") {
            const counts = fl.userStats.timeOfDayCounts || {};
            let maxCount = 0;
            let favPeriod = "";
            for (let p in counts) {
                if (counts[p] > maxCount) {
                    maxCount = counts[p];
                    favPeriod = p;
                }
            }
            if (maxCount === 0 || !favPeriod) return null;
            return item.template.replace("{val}", favPeriod);
        }
        return null;
    }

    fl.getResolvedText = function (idx) {
        const item = EMPTY_STATE_TEXTS[idx];
        if (item.type === "stat") {
            const resolved = resolveStatText(item);
            if (resolved !== null) return resolved;
            const memeIndex = (idx * 7) % 25;
            return EMPTY_STATE_TEXTS[5 + memeIndex].text;
        }
        return item.text;
    };

    fl.EMPTY_STATE_TEXTS = EMPTY_STATE_TEXTS;

})();
