import { isNonAscii, romanize } from './romanizer.js';

/**
 * Levenshtein distance and matching algorithm.
 */

export function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    if (a.length < b.length) {
        const tmp = a; a = b; b = tmp;
    }

    const m = a.length;
    const n = b.length;

    let prevRow = new Int32Array(n + 1);
    let currRow = new Int32Array(n + 1);

    for (let j = 0; j <= n; j++) prevRow[j] = j;

    for (let i = 1; i <= m; i++) {
        currRow[0] = i;
        const charA = a[i - 1];
        for (let j = 1; j <= n; j++) {
            const cost = charA === b[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
                prevRow[j] + 1,
                currRow[j - 1] + 1,
                prevRow[j - 1] + cost
            );
        }
        const temp = prevRow;
        prevRow = currRow;
        currRow = temp;
    }
    return prevRow[n];
}

export function titleSimilarity(a, b) {
    if (!a && !b) return 100;
    if (!a || !b) return 0;

    const normA = a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normB = b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

    if (!normA && !normB) return 100;
    if (!normA || !normB) return 0;
    if (normA === normB) return 100;

    const maxLen = Math.max(normA.length, normB.length);
    const dist = levenshtein(normA, normB);
    return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}

export function scoreCandidate(candidate, trackTitle, trackArtist, trackDuration) {
    let titleScore = titleSimilarity(candidate.trackName, trackTitle);
    const artistScore = titleSimilarity(candidate.artistName, trackArtist);

    // Cross-script phonetic similarity check for CJK
    if (titleScore < 65 && (isNonAscii(trackTitle) || isNonAscii(candidate.trackName))) {
        const romTrack = romanize(trackTitle);
        const romCand = romanize(candidate.trackName);
        const romScore = titleSimilarity(romCand, romTrack);
        if (romScore > titleScore) {
            titleScore = romScore;
        }
    }

    let durationScore = 100;
    let diff = null;
    if (trackDuration > 0 && candidate.duration > 0) {
        diff = Math.abs(candidate.duration - trackDuration);
        if (diff <= 2) durationScore = 100;
        else if (diff <= 4) durationScore = 80;
        else if (diff <= 6) durationScore = 60;
        else if (diff <= 10) durationScore = 30;
        else durationScore = 0;
    }

    // Synced lyric bonus (+10 if candidate is known synced)
    const syncedBonus = candidate.synced ? 10 : 0;
    // Source preference (+2 for LRCLIB as tie-breaker)
    const sourceBonus = candidate.source === 'lrclib' ? 2 : 0;

    // Weighted aggregate score
    let totalScore = (titleScore * 0.5) + (artistScore * 0.3) + (durationScore * 0.2) + syncedBonus + sourceBonus;
    totalScore = Math.min(100, Math.round(totalScore));

    // Cross-script relaxation: If artist matches strongly and duration is within 3s, allow title match
    const isScriptMismatch = isNonAscii(trackTitle) !== isNonAscii(candidate.trackName);
    if (isScriptMismatch && artistScore >= 80 && diff !== null && diff <= 3 && titleScore < 60) {
        titleScore = 65; // Relax title score
        totalScore = Math.max(totalScore, 65);
    }

    return {
        score: totalScore,
        titleScore,
        artistScore,
        durationScore,
        durationDiff: diff
    };
}

