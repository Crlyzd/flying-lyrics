// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — CANDIDATE SCORING & STRING DISTANCE (background context)
// ─────────────────────────────────────────────────────────────────────────────

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    if (a.length < b.length) {
        const tmp = a; a = b; b = tmp;
    }

    const m = a.length;
    const n = b.length;

    let prevRow = new Int32Array(n + 1);
    let currRow = new Int32Array(n + 1);

    for (let j = 0; j <= n; j++) {
        prevRow[j] = j;
    }

    for (let i = 1; i <= m; i++) {
        currRow[0] = i;
        const charA = a[i - 1];
        for (let j = 1; j <= n; j++) {
            const cost = charA === b[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
                prevRow[j] + 1,        // Deletion
                currRow[j - 1] + 1,    // Insertion
                prevRow[j - 1] + cost  // Substitution
            );
        }
        const temp = prevRow;
        prevRow = currRow;
        currRow = temp;
    }
    return prevRow[n];
}

function titleSimilarity(a, b) {
    if (!a && !b) return 100;
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

function getTitleSimilarity(query, candidateTitle) {
    const isObj = query && typeof query === 'object';
    const qTitleClean = isObj ? query.titleLower : (query || '').toLowerCase();
    const qTitleShort = isObj ? query.titleShort : (typeof extractShortTitle === 'function' ? extractShortTitle(query || '') : query || '').toLowerCase();
    const qTitleCleanRomaji = isObj ? query.titleCleanRomaji : (typeof romanize === 'function' ? romanize(qTitleClean) : qTitleClean);
    const qTitleShortRomaji = isObj ? query.titleShortRomaji : (typeof romanize === 'function' ? romanize(qTitleShort) : qTitleShort);

    const cClean = typeof cleanTitle === 'function' ? cleanTitle(candidateTitle || '') : (candidateTitle || '');
    const cTitleClean = cClean.toLowerCase();
    const cShort = typeof extractShortTitle === 'function' ? extractShortTitle(cTitleClean) : cTitleClean;
    const cTitleShort = cShort.toLowerCase();
    const cTitleCleanRomaji = typeof romanize === 'function' ? romanize(cTitleClean) : cTitleClean;
    const cTitleShortRomaji = typeof romanize === 'function' ? romanize(cTitleShort) : cTitleShort;

    return Math.max(
        titleSimilarity(qTitleClean, cTitleClean),
        titleSimilarity(qTitleClean, cTitleCleanRomaji),
        titleSimilarity(qTitleCleanRomaji, cTitleClean),
        titleSimilarity(qTitleCleanRomaji, cTitleCleanRomaji),
        titleSimilarity(qTitleShort, cTitleClean),
        titleSimilarity(qTitleShort, cTitleCleanRomaji),
        titleSimilarity(qTitleClean, cTitleShort),
        titleSimilarity(qTitleCleanRomaji, cTitleShort),
        titleSimilarity(qTitleShort, cTitleShort),
        titleSimilarity(qTitleShort, cTitleShortRomaji),
        titleSimilarity(qTitleShortRomaji, cTitleShort),
        titleSimilarity(qTitleShortRomaji, cTitleShortRomaji)
    );
}

function getArtistSimilarity(query, candidateArtist) {
    const isObj = query && typeof query === 'object';
    const qArtistFull = isObj ? query.artistLower : (typeof cleanArtist === 'function' ? cleanArtist(query || '') : query || '').toLowerCase();
    const qArtistFullRomaji = isObj ? query.artistFullRomaji : (typeof romanize === 'function' ? romanize(qArtistFull) : qArtistFull);
    const qArtistPrimary = isObj ? query.artistPrimary : (typeof extractPrimaryArtist === 'function' ? extractPrimaryArtist(query || '') : query || '').toLowerCase();
    const qArtistPrimaryRomaji = isObj ? query.artistPrimaryRomaji : (typeof romanize === 'function' ? romanize(qArtistPrimary) : qArtistPrimary);

    const cArtistClean = typeof cleanArtist === 'function' ? cleanArtist(candidateArtist || '') : (candidateArtist || '');
    const cArtistFull = cArtistClean.toLowerCase();
    const cArtistFullRomaji = typeof romanize === 'function' ? romanize(cArtistFull) : cArtistFull;
    const cPrimary = typeof extractPrimaryArtist === 'function' ? extractPrimaryArtist(candidateArtist || '') : candidateArtist || '';
    const cArtistPrimary = cPrimary.toLowerCase();
    const cArtistPrimaryRomaji = typeof romanize === 'function' ? romanize(cArtistPrimary) : cArtistPrimary;

    const baseScore = Math.max(
        titleSimilarity(qArtistPrimary, cArtistPrimary),
        titleSimilarity(qArtistPrimary, cArtistPrimaryRomaji),
        titleSimilarity(qArtistPrimaryRomaji, cArtistPrimary),
        titleSimilarity(qArtistPrimaryRomaji, cArtistPrimaryRomaji),
        titleSimilarity(qArtistFull, cArtistFull),
        titleSimilarity(qArtistFull, cArtistFullRomaji),
        titleSimilarity(qArtistFullRomaji, cArtistFull),
        titleSimilarity(qArtistFullRomaji, cArtistFullRomaji)
    );

    // Cross-set component comparison for multi-artist collaborations
    const splitFn = typeof splitArtists === 'function' ? splitArtists : (str => [str]);
    const qArtists = splitFn(qArtistFull);
    const cArtists = splitFn(cArtistFull);
    if (qArtists.length > 1 || cArtists.length > 1) {
        let maxComponentSim = 0;
        for (const qa of qArtists) {
            const qaRomaji = typeof romanize === 'function' ? romanize(qa) : qa;
            for (const ca of cArtists) {
                const caRomaji = typeof romanize === 'function' ? romanize(ca) : ca;
                const sim = Math.max(
                    titleSimilarity(qa, ca),
                    titleSimilarity(qa, caRomaji),
                    titleSimilarity(qaRomaji, ca),
                    titleSimilarity(qaRomaji, caRomaji)
                );
                if (sim > maxComponentSim) maxComponentSim = sim;
            }
        }
        if (maxComponentSim >= 85) {
            return Math.max(baseScore, 90, maxComponentSim);
        }
        return Math.max(baseScore, Math.round(maxComponentSim * 0.85));
    }

    return baseScore;
}

function scoreCandidate(candidate, actualDuration, cleanQueryTitle, cleanQueryArtist) {
    const syncedBonus  = candidate.synced ? 10000 : 0;
    // Small tie-breaker only — NOT large enough to override a title mismatch
    const sourceBonus  = candidate.source === 'lrclib' ? 100 : 0;

    const durationDelta = actualDuration > 0
        ? Math.max(0, Math.abs((candidate.duration || 0) - actualDuration) - 5)
        : 0;

    const isMetadataObj = cleanQueryTitle && typeof cleanQueryTitle === 'object';
    const titleSim = getTitleSimilarity(cleanQueryTitle, candidate.trackName);
    const artistSim = getArtistSimilarity(isMetadataObj ? cleanQueryTitle : cleanQueryArtist, candidate.artistName);

    const queryTitleText = isMetadataObj ? cleanQueryTitle.titleLower : cleanQueryTitle;

    // Gate: heavily penalise candidates whose title is clearly wrong.
    // BUT relax the penalty if:
    //   1. The primary artist matches closely (artistSim >= 85%).
    //   2. The title or artist scripts differ (cross-script e.g. English vs CJK/Kanji/Cyrillic).
    //   3. The track duration matches very closely (delta <= 3s) with partial title/artist similarity.
    let titleMismatchPenalty = 0;
    const nonAsciiFn = typeof isNonAscii === 'function' ? isNonAscii : (s => /[^\x00-\x7F]/.test(s));

    if (queryTitleText && titleSim < 40) {
        const isQueryNonAscii = nonAsciiFn(queryTitleText) || nonAsciiFn(isMetadataObj ? (cleanQueryTitle.artistLower || '') : (cleanQueryArtist || ''));
        const isCandidateNonAscii = nonAsciiFn(candidate.trackName || '') || nonAsciiFn(candidate.artistName || '');
        const scriptMismatch = isQueryNonAscii !== isCandidateNonAscii;
        const durationClose = actualDuration > 0 && Math.abs((candidate.duration || 0) - actualDuration) <= 3;

        if (artistSim >= 85 && scriptMismatch) {
            titleMismatchPenalty = -2000;
        } else if (durationClose && scriptMismatch && (artistSim >= 40 || titleSim >= 20)) {
            titleMismatchPenalty = -1500;
        } else {
            titleMismatchPenalty = -12000;
        }
    }

    return syncedBonus + sourceBonus + titleMismatchPenalty - durationDelta + (titleSim * 10) + (artistSim * 5);
}

// Global scope export for MV3 Service Worker importScripts compatibility
globalThis.SEARCH_SCORING = {
    levenshtein,
    titleSimilarity,
    getTitleSimilarity,
    getArtistSimilarity,
    scoreCandidate
};
