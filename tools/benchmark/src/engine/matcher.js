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
    const titleScore = titleSimilarity(candidate.trackName, trackTitle);
    const artistScore = titleSimilarity(candidate.artistName, trackArtist);

    let durationScore = 100;
    if (trackDuration > 0 && candidate.duration > 0) {
        const diff = Math.abs(candidate.duration - trackDuration);
        if (diff <= 2) durationScore = 100;
        else if (diff <= 4) durationScore = 80;
        else if (diff <= 8) durationScore = 50;
        else if (diff <= 15) durationScore = 20;
        else durationScore = 0;
    }

    // Weighted aggregate score
    const totalScore = (titleScore * 0.5) + (artistScore * 0.3) + (durationScore * 0.2);

    return {
        score: totalScore,
        titleScore,
        artistScore,
        durationScore,
        durationDiff: trackDuration > 0 && candidate.duration > 0 ? Math.abs(candidate.duration - trackDuration) : null
    };
}
