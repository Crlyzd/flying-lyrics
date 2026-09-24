/**
 * Multi-Pass Search Engine Coordinator for Benchmark Runner.
 * 100% parity with Flying Lyrics extension (src/background/searchEngine.js).
 */

import { searchLrclib } from './providers/lrclib.js';
import { searchNetease, fetchNeteaseLyric } from './providers/netease.js';
import { searchKugou, fetchKugouLyric } from './providers/kugou.js';
import { cleanTitle, cleanArtist, extractPrimaryArtist, extractShortTitle } from './sanitizer.js';
import { isNonAscii, extractTitleAliases, fetchRomanizedMetadata } from './romanizer.js';
import { scoreCandidate, getTitleSimilarity, getArtistSimilarity, getQueryMetadata } from './matcher.js';

async function fetchPassCandidates(query, durationSec, options = {}) {
    const skipLrc = options.neteaseOnly || options.kugouOnly;
    const skipNet = options.lrclibOnly || options.noNetease || options.kugouOnly;
    const skipKu = options.lrclibOnly || options.noKugou || options.neteaseOnly;

    const [lrcRes, netRes, kuRes] = await Promise.allSettled([
        skipLrc ? Promise.resolve([]) : searchLrclib(query, '', durationSec),
        skipNet ? Promise.resolve([]) : searchNetease(query, ''),
        skipKu ? Promise.resolve([]) : searchKugou(query, '')
    ]);

    return [
        ...(lrcRes.status === 'fulfilled' && Array.isArray(lrcRes.value) ? lrcRes.value : []),
        ...(netRes.status === 'fulfilled' && Array.isArray(netRes.value) ? netRes.value : []),
        ...(kuRes.status === 'fulfilled' && Array.isArray(kuRes.value) ? kuRes.value : [])
    ];
}

export async function benchmarkSearchTrack(rawTitle, rawArtist, durationSec, options = {}) {
    const cPrimaryArtist = extractPrimaryArtist(rawArtist || '');
    const cArtistFull = cleanArtist(rawArtist || '');
    const cTitleFull = cleanTitle(rawTitle || '');
    const cTitleShort = extractShortTitle(cTitleFull);

    let romajiTitle = '';
    let romajiArtist = '';

    if (isNonAscii(cTitleFull) || isNonAscii(cArtistFull)) {
        const [rTitle, rArtist] = await Promise.all([
            fetchRomanizedMetadata(cTitleShort, 2000),
            fetchRomanizedMetadata(cPrimaryArtist, 2000)
        ]);
        romajiTitle = rTitle || '';
        romajiArtist = rArtist || '';
    }

    const titleAliases = extractTitleAliases(cTitleFull);
    const passes = [
        `${cPrimaryArtist} - ${cTitleShort}`.trim(),
        cTitleShort
    ];

    if (romajiTitle && romajiArtist && (romajiTitle !== cTitleShort || romajiArtist !== cPrimaryArtist)) {
        passes.push(`${romajiArtist} - ${romajiTitle}`.trim());
        passes.push(romajiTitle.trim());
    } else if (romajiTitle && romajiTitle !== cTitleShort) {
        passes.push(romajiTitle.trim());
    }

    for (const alias of titleAliases) {
        if (alias && alias !== cTitleShort) {
            passes.push(`${cPrimaryArtist} - ${alias}`.trim());
            passes.push(alias.trim());
        }
    }

    if (cArtistFull && cArtistFull !== cPrimaryArtist) {
        passes.push(`${cArtistFull} - ${cTitleShort}`.trim());
    }

    const uniquePasses = [...new Set(passes.map(p => p.trim()).filter(Boolean))];
    const passResults = await Promise.all(
        uniquePasses.map(query => fetchPassCandidates(query, durationSec, options))
    );

    const allCandidates = [];
    const seen = new Set();
    passResults.forEach((candidatesList, passIdx) => {
        for (const c of candidatesList) {
            const key = `${c.source}-${c.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                allCandidates.push({ ...c, pass: passIdx + 1 });
            }
        }
    });

    if (allCandidates.length === 0) {
        return { status: 'NO_LYRICS', bestMatch: null, candidateCount: 0 };
    }

    const queryMetadata = getQueryMetadata(cTitleFull, cPrimaryArtist, romajiTitle, romajiArtist);
    const resolvedPool = [];
    const candidatesToFetch = [];

    for (const c of allCandidates) {
        const titleSim = getTitleSimilarity(queryMetadata, c.trackName);
        let isMatchPossible = true;

        if (titleSim < 40) {
            const isQueryNonAscii = isNonAscii(cTitleFull) || isNonAscii(cPrimaryArtist);
            const isCandidateNonAscii = isNonAscii(c.trackName || '') || isNonAscii(c.artistName || '');
            const scriptMismatch = isQueryNonAscii !== isCandidateNonAscii;
            const artistSim = getArtistSimilarity(queryMetadata, c.artistName);
            const durationMatches = durationSec > 0 && Math.abs((c.duration || 0) - durationSec) <= 3;

            if ((artistSim >= 85 && scriptMismatch) || (durationMatches && scriptMismatch && (artistSim >= 40 || titleSim >= 20))) {
                // Keep candidate
            } else {
                isMatchPossible = false;
            }
        }

        if (!isMatchPossible) continue;

        if (c.source === 'lrclib') {
            if (c.rawLyric) {
                resolvedPool.push({
                    ...c,
                    score: scoreCandidate(c, durationSec, queryMetadata)
                });
            }
        } else if (c.source === 'netease' || c.source === 'kugou') {
            candidatesToFetch.push(c);
        }
    }

    const fetchUnresolved = async (list) => {
        const promises = list.map(async (c) => {
            try {
                if (c.source === 'kugou') {
                    const lyricMeta = await fetchKugouLyric(c.id, c.accesskey, 4000);
                    if (lyricMeta && lyricMeta.rawLyric) {
                        const resolved = { ...c, synced: lyricMeta.synced, rawLyric: lyricMeta.rawLyric };
                        return {
                            ...resolved,
                            score: scoreCandidate(resolved, durationSec, queryMetadata)
                        };
                    }
                } else if (c.source === 'netease') {
                    const lyricMeta = await fetchNeteaseLyric(c.id);
                    if (lyricMeta && lyricMeta.rawLyric) {
                        const resolved = { ...c, synced: lyricMeta.synced, rawLyric: lyricMeta.rawLyric };
                        return {
                            ...resolved,
                            score: scoreCandidate(resolved, durationSec, queryMetadata)
                        };
                    }
                }
            } catch {}
            return null;
        });
        const fetched = await Promise.all(promises);
        return fetched.filter(Boolean);
    };

    if (candidatesToFetch.length > 0) {
        const optimistic = candidatesToFetch.map(c => ({
            candidate: c,
            optimisticScore: scoreCandidate({ ...c, synced: true }, durationSec, queryMetadata)
        }));
        optimistic.sort((a, b) => b.optimisticScore - a.optimisticScore);

        const hasSyncedLrc = resolvedPool.some(r => r.synced);
        const depth = hasSyncedLrc ? 3 : 5;
        const firstBatch = optimistic.slice(0, depth).map(x => x.candidate);

        const batch1 = await fetchUnresolved(firstBatch);
        resolvedPool.push(...batch1);

        if (!batch1.some(r => r.synced) && optimistic.length > depth) {
            const secondBatch = optimistic.slice(depth, depth + 3).map(x => x.candidate);
            const batch2 = await fetchUnresolved(secondBatch);
            resolvedPool.push(...batch2);
        }
    }

    if (resolvedPool.length === 0) {
        return { status: 'NO_MATCH', bestMatch: null, candidateCount: allCandidates.length };
    }

    resolvedPool.sort((a, b) => b.score - a.score);
    const winner = resolvedPool[0];

    return {
        status: 'SUCCESS',
        bestMatch: winner,
        candidateCount: allCandidates.length,
        pass: winner.pass || 1
    };
}
