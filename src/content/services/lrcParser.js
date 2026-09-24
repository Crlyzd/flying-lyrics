(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — LRC PARSER & TIMING SYNCHRONIZER (content script context)
    // ─────────────────────────────────────────────────────────────────────────────

    fl.extractLrcTimestampMap = function (lrcText) {
        if (!lrcText) return null;
        const map = new Map();
        const lines = lrcText.split('\n');
        for (const line of lines) {
            const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)$/);
            if (match) {
                const min = parseInt(match[1], 10);
                const sec = parseInt(match[2], 10);
                const msStr = match[3] || "0";
                const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr, 10);
                const totalSec = Math.round((min * 60 + sec + ms / 1000) * 10) / 10;
                const text = match[4]?.trim();
                if (text) map.set(totalSec, text);
            }
        }
        return map;
    };

    fl.findClosestLrcMatch = function (lrcMap, targetSec, toleranceSec = 1.0) {
        if (!lrcMap || lrcMap.size === 0) return null;
        const target = Math.round(targetSec * 10) / 10;
        if (lrcMap.has(target)) return lrcMap.get(target);

        let bestMatch = null;
        let minDiff = toleranceSec;
        for (const [time, text] of lrcMap.entries()) {
            const diff = Math.abs(time - target);
            if (diff < minDiff) {
                minDiff = diff;
                bestMatch = text;
            }
        }
        return bestMatch;
    };

    fl.parseLrcOrGeneratePseudoSync = function (lines, rawStr) {
        const startTime = performance.now();
        if (typeof fl.wrapCache !== 'undefined') fl.wrapCache.clear();
        const temp = [];

        if (typeof fl.activateLyrics === 'function') fl.activateLyrics();

        const isSynced = /\[\d+:\d+\.\d+\]/.test(rawStr);
        fl.isCurrentLyricSynced = isSynced;
        if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();

        if (!isSynced) {
            const cleanLines = lines.map(l => l.trim()).filter(l => l);
            if (cleanLines.length === 0) {
                if (typeof fl.handleMissingLyrics === 'function') fl.handleMissingLyrics();
                return;
            }

            const playerState = typeof fl.getPlayerState === 'function' ? fl.getPlayerState() : { duration: 180 };
            const duration = playerState.duration || 180;
            const timePerLine = duration / cleanLines.length;

            for (let i = 0; i < cleanLines.length; i++) {
                temp.push({ time: i * timePerLine, text: cleanLines[i], romaji: "", translation: "" });
            }
        } else {
            for (let line of lines) {
                const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
                if (!match) continue;
                const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
                const text = match[3].trim();
                if (!text) continue;
                temp.push({ time, text, romaji: "", translation: "" });
            }
        }

        fl.lyricLines = temp.length ? temp : [{ time: 0, text: "No Lyrics Available", romaji: "", translation: "" }];

        const parseDuration = Math.round(performance.now() - startTime);
        chrome.runtime.sendMessage({
            type: 'TRACK_EVENT',
            payload: {
                eventName: 'processing_duration',
                params: { parse_time_ms: parseDuration }
            }
        }).catch(() => {});
    };

})();
