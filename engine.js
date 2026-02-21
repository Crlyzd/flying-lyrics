// =============================================================================
//  ENGINE: Normalization, API Fetching, Scoring, and Parsing
// =============================================================================

/**
 * Normalizes a track or artist string for more accurate search and scoring.
 * Removes common tags like (feat. X), [Remastered], (Live), and strips special chars.
 */
function normalizeText(str) {
    if (!str) return "";
    return str.toLowerCase()
        // Remove accents and diacritics
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        // Strip parenthetical content (feat., live, etc.)
        .replace(/\([^)]+\)/g, "")
        .replace(/\[[^\]]+\]/g, "")
        // Remove common punctuation and decorators separator
        .replace(/[-_~]+$/, "")
        .replace(/[:"',.?!]/g, "")
        // Collapse multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Scores a search result against the currently playing track.
 * Max Score ~100. Higher is better.
 */
function scoreMatch(result, currentTitle, currentArtist, currentDuration) {
    let score = 0;
    const cleanCurrentTitle = normalizeText(currentTitle);
    const cleanCurrentArtist = normalizeText(currentArtist);

    const cleanResultName = normalizeText(result.name);
    const cleanResultArtist = normalizeText(result.artist);

    // Title Matching
    if (cleanResultName === cleanCurrentTitle) {
        score += 40;
    } else if (cleanResultName.includes(cleanCurrentTitle) || cleanCurrentTitle.includes(cleanResultName)) {
        score += 10;
    }

    // Artist Matching
    if (cleanResultArtist === cleanCurrentArtist) {
        score += 30;
    } else if (cleanResultArtist.includes(cleanCurrentArtist) || cleanCurrentArtist.includes(cleanResultArtist)) {
        score += 15;
    }

    // Duration Matching (if provided by API like LRCLIB)
    if (result.duration && currentDuration > 0) {
        const diff = Math.abs(result.duration - currentDuration);
        if (diff <= 2) {
            score += 20; // 0-2 seconds diff is generally identical
        } else if (diff <= 5) {
            score += 10;
        }
    }

    return score;
}

// --- API HELPERS ---

async function fetchLrclibSearch(title, artist) {
    try {
        const q = `track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
        const res = await fetch(`https://lrclib.net/api/search?${q}`);
        if (!res.ok) return [];
        const data = await res.json();
        return (Array.isArray(data) ? data : []).map(item => ({
            id: item.id,
            name: item.trackName || item.name || title,
            artist: item.artistName || item.artist || artist,
            duration: item.duration || 0,
            source: 'lrclib',
            isSynced: !!item.syncedLyrics
        }));
    } catch {
        return [];
    }
}

async function fetchLrclibById(id) {
    try {
        const res = await fetch(`https://lrclib.net/api/get/${id}`);
        if (!res.ok) return "";
        const data = await res.json();
        return data.syncedLyrics || data.plainLyrics || "";
    } catch {
        return "";
    }
}

async function fetchNeteaseSearch(query) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'FETCH_NETEASE_SEARCH', query }, (results) => {
            resolve((results || []).map(s => ({
                id: s.id,
                name: s.name,
                artist: s.artist,
                duration: s.duration || 0, // In ms usually, background.js maps it to s
                source: 'netease',
                isSynced: true // Assume true until fetch, Netease usually has synced
            })));
        });
    });
}

async function fetchNeteaseLyricsById(id) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'FETCH_NETEASE_LYRICS', id }, (response) => {
            resolve(response?.lyric || "");
        });
    });
}

// --- CORE PIPELINE ---

/**
 * Searches LRCLIB and Netease concurrently, scores the results against the current track,
 * and sorts them from highest to lowest score.
 */
async function searchAndScoreLyrics(title, artist, durationSeconds) {
    const cleanTitle = normalizeText(title);

    // Fire concurrent searches. We search original title + clean title on Netease for broader reach
    const results = await Promise.all([
        fetchLrclibSearch(title, artist).catch(() => []),
        fetchNeteaseSearch(`${cleanTitle} ${normalizeText(artist)}`).catch(() => [])
    ]);

    const combined = [...results[0], ...results[1]];

    // Apply scoring
    combined.forEach(res => {
        res.score = scoreMatch(res, title, artist, durationSeconds);
    });

    // Sort descending by score
    combined.sort((a, b) => b.score - a.score);
    return combined;
}

/**
 * Parses raw LRC text into the standard `{ time, text, romaji, translation }` array format.
 * Includes the teleprompter fallback logic for plain text lyrics.
 */
function parseLrc(raw, songDurationSeconds) {
    if (!raw) return [];

    const lines = raw.split('\n');
    const temp = [];

    // Pass 1: Extract timestamps
    for (let line of lines) {
        const match = line.match(/\[(\d+):(\d+\.\d+|^\d+)\](.*)/);
        if (!match) continue;

        const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
        const text = match[3].trim();
        if (!text) continue;

        temp.push({ time, text, romaji: "", translation: "" });
    }

    // Pass 2: Teleprompter Fallback for Unsynced Lyrics
    if (temp.length === 0 && raw.trim().length > 0) {
        const rawLines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (rawLines.length > 0) {
            const duration = songDurationSeconds || 200;
            const timePerLine = duration / rawLines.length;

            for (let i = 0; i < rawLines.length; i++) {
                temp.push({
                    time: i * timePerLine,
                    text: rawLines[i],
                    romaji: "",
                    translation: ""
                });
            }
        }
    }

    return temp.length ? temp : [{ time: 0, text: "No Lyrics Available", romaji: "", translation: "" }];
}
