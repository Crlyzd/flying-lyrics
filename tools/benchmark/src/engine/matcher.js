/**
 * Levenshtein Distance & Candidate Scoring Engine.
 * 100% parity with Flying Lyrics extension (src/background/search/scoring.js).
 */

import { cleanTitle, cleanArtist, extractShortTitle, extractPrimaryArtist, splitArtists } from './sanitizer.js';
import { romanize, isNonAscii } from './romanizer.js';

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
    const maxLen = Math.max(a.length, b.length);
    return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

export function getTitleSimilarity(query, candidateTitle) {
    const isObj = query && typeof query === 'object';
    const qTitleClean = isObj ? query.titleLower : (query || '').toLowerCase();
    const qTitleShort = isObj ? query.titleShort : extractShortTitle(query || '').toLowerCase();
    const qTitleCleanRomaji = isObj ? query.titleCleanRomaji : romanize(qTitleClean);
    const qTitleShortRomaji = isObj ? query.titleShortRomaji : romanize(qTitleShort);

    const cClean = cleanTitle(candidateTitle || '');
    const cTitleClean = cClean.toLowerCase();
    const cShort = extractShortTitle(cTitleClean);
    const cTitleShort = cShort.toLowerCase();
    const cTitleCleanRomaji = romanize(cTitleClean);
    const cTitleShortRomaji = romanize(cTitleShort);

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

export function getArtistSimilarity(query, candidateArtist) {
    const isObj = query && typeof query === 'object';
    const qArtistFull = isObj ? query.artistLower : cleanArtist(query || '').toLowerCase();
    const qArtistFullRomaji = isObj ? query.artistFullRomaji : romanize(qArtistFull);
    const qArtistPrimary = isObj ? query.artistPrimary : extractPrimaryArtist(query || '').toLowerCase();
    const qArtistPrimaryRomaji = isObj ? query.artistPrimaryRomaji : romanize(qArtistPrimary);

    const cArtistClean = cleanArtist(candidateArtist || '');
    const cArtistFull = cArtistClean.toLowerCase();
    const cArtistFullRomaji = romanize(cArtistFull);
    const cPrimary = extractPrimaryArtist(candidateArtist || '');
    const cArtistPrimary = cPrimary.toLowerCase();
    const cArtistPrimaryRomaji = romanize(cArtistPrimary);

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

    const qArtists = splitArtists(qArtistFull);
    const cArtists = splitArtists(cArtistFull);
    if (qArtists.length > 1 || cArtists.length > 1) {
        let maxComponentSim = 0;
        for (const qa of qArtists) {
            const qaRomaji = romanize(qa);
            for (const ca of cArtists) {
                const caRomaji = romanize(ca);
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

export function getQueryMetadata(cleanQueryTitle, cleanQueryArtist, extraRomajiTitle = '', extraRomajiArtist = '') {
    const titleLower = (cleanQueryTitle || '').toLowerCase();
    const titleShort = (extractShortTitle(cleanQueryTitle || '') || '').toLowerCase();
    
    const artistLower = (cleanArtist(cleanQueryArtist || '') || '').toLowerCase();
    const artistPrimary = (extractPrimaryArtist(cleanQueryArtist || '') || '').toLowerCase();

    return {
        titleLower,
        titleShort,
        titleCleanRomaji: (extraRomajiTitle || romanize(titleLower)).toLowerCase(),
        titleShortRomaji: romanize(titleShort).toLowerCase(),
        artistLower,
        artistFullRomaji: (extraRomajiArtist || romanize(artistLower)).toLowerCase(),
        artistPrimary,
        artistPrimaryRomaji: romanize(artistPrimary).toLowerCase()
    };
}

export function scoreCandidate(candidate, actualDuration, queryMetadata) {
    const syncedBonus  = candidate.synced ? 10000 : 0;
    const sourceBonus  = candidate.source === 'lrclib' ? 100 : 0;

    const durationDelta = actualDuration > 0
        ? Math.max(0, Math.abs((candidate.duration || 0) - actualDuration) - 5)
        : 0;

    const isMetadataObj = queryMetadata && typeof queryMetadata === 'object';
    const queryMeta = isMetadataObj ? queryMetadata : getQueryMetadata(queryMetadata, '');
    const titleSim = getTitleSimilarity(queryMeta, candidate.trackName);
    const artistSim = getArtistSimilarity(queryMeta, candidate.artistName);

    const queryTitleText = queryMeta.titleLower;
    let titleMismatchPenalty = 0;

    if (queryTitleText && titleSim < 40) {
        const isQueryNonAscii = isNonAscii(queryTitleText) || isNonAscii(queryMeta.artistLower || '');
        const isCandidateNonAscii = isNonAscii(candidate.trackName || '') || isNonAscii(candidate.artistName || '');
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
