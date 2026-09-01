import { searchLrclib } from './providers/lrclib.js';
import { searchNetease } from './providers/netease.js';
import { cleanTitle, cleanArtist } from './sanitizer.js';
import { scoreCandidate } from './matcher.js';

/**
 * Execute unified search for a track and classify the outcome.
 *
 * @param {string} rawTitle
 * @param {string} rawArtist
 * @param {number} durationSec
 * @returns {Promise<{ status: 'SUCCESS' | 'NO_MATCH' | 'NO_LYRICS', bestMatch: object | null, candidateCount: number }>}
 */
export async function benchmarkSearchTrack(rawTitle, rawArtist, durationSec) {
    const title = cleanTitle(rawTitle);
    const artist = cleanArtist(rawArtist);

    // Concurrently fetch LRCLIB and Netease candidates
    const [lrclibResults, neteaseResults] = await Promise.allSettled([
        searchLrclib(title, artist, durationSec),
        searchNetease(title, artist)
    ]);

    const candidates = [
        ...(lrclibResults.status === 'fulfilled' ? lrclibResults.value : []),
        ...(neteaseResults.status === 'fulfilled' ? neteaseResults.value : [])
    ];

    if (candidates.length === 0) {
        return {
            status: 'NO_LYRICS',
            bestMatch: null,
            candidateCount: 0
        };
    }

    // Score all candidates
    const scoredCandidates = candidates.map(candidate => {
        const { score, titleScore, artistScore, durationScore, durationDiff } = scoreCandidate(
            candidate,
            title,
            artist,
            durationSec
        );
        return {
            ...candidate,
            score,
            titleScore,
            artistScore,
            durationScore,
            durationDiff
        };
    });

    // Sort by highest score first
    scoredCandidates.sort((a, b) => b.score - a.score);

    const winner = scoredCandidates[0];

    // Flying lyrics criteria:
    // Success: Title score >= 70, Artist score >= 50 (or total >= 65), duration difference <= 6 seconds
    const isDurationAcceptable = winner.durationDiff === null || winner.durationDiff <= 6;
    const isScoreAcceptable = winner.score >= 60 && winner.titleScore >= 65;

    if (isScoreAcceptable && isDurationAcceptable) {
        return {
            status: 'SUCCESS',
            bestMatch: winner,
            candidateCount: candidates.length
        };
    }

    return {
        status: 'NO_MATCH',
        bestMatch: winner,
        candidateCount: candidates.length
    };
}
