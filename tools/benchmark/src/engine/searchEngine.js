import { searchLrclib } from './providers/lrclib.js';
import { searchNetease, fetchNeteaseLyric } from './providers/netease.js';
import { cleanTitle, cleanArtist } from './sanitizer.js';
import { scoreCandidate } from './matcher.js';
import { extractTitleAliases, romanize, isNonAscii } from './romanizer.js';

async function fetchCandidates(title, artist, durationSec) {
    const [lrclibResults, neteaseResults] = await Promise.allSettled([
        searchLrclib(title, artist, durationSec),
        searchNetease(title, artist)
    ]);

    return [
        ...(lrclibResults.status === 'fulfilled' ? lrclibResults.value : []),
        ...(neteaseResults.status === 'fulfilled' ? neteaseResults.value : [])
    ];
}

async function verifyAndScoreCandidates(candidates, title, artist, durationSec) {
    if (!candidates || candidates.length === 0) return [];

    const scored = [];
    for (const c of candidates) {
        const scoreMeta = scoreCandidate(c, title, artist, durationSec);
        scored.push({
            ...c,
            ...scoreMeta
        });
    }

    scored.sort((a, b) => b.score - a.score);

    // Validate top NetEase candidate if it has no pre-resolved lyric text
    for (let i = 0; i < Math.min(scored.length, 3); i++) {
        const cand = scored[i];
        if (cand.source === 'netease' && cand.rawLyric === null) {
            const lyricMeta = await fetchNeteaseLyric(cand.id);
            if (lyricMeta && lyricMeta.rawLyric) {
                cand.rawLyric = lyricMeta.rawLyric;
                cand.synced = lyricMeta.synced;
                cand.instrumental = lyricMeta.instrumental;
            } else {
                // If NetEase ID has no actual lyrics, penalise score so it doesn't falsely pass
                cand.score = 0;
            }
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
}

function evaluateWinner(winner) {
    if (!winner || winner.score <= 0) return false;
    const isDurationAcceptable = winner.durationDiff === null || winner.durationDiff <= 6;
    const isScoreAcceptable = winner.score >= 60 && winner.titleScore >= 60;
    return isScoreAcceptable && isDurationAcceptable;
}

/**
 * Execute unified multi-pass search for a track matching the extension search hierarchy:
 *  - Pass 1: Cleaned Title & Artist (LRCLIB + NetEase Cloud)
 *  - Pass 2: Dual-Language Title Alias Decomposition (e.g. "좋은 날 (Good Day)")
 *  - Pass 3: Phonetic Romanization for CJK scripts (Hangul/Kana -> Romaji)
 *
 * @param {string} rawTitle
 * @param {string} rawArtist
 * @param {number} durationSec
 * @returns {Promise<{ status: 'SUCCESS' | 'NO_MATCH' | 'NO_LYRICS', bestMatch: object | null, candidateCount: number }>}
 */
export async function benchmarkSearchTrack(rawTitle, rawArtist, durationSec) {
    const title = cleanTitle(rawTitle);
    const artist = cleanArtist(rawArtist);

    let allCandidates = [];

    // ── PASS 1: Cleaned Title Search (LRCLIB + NetEase) ──────────────────────────
    const pass1Candidates = await fetchCandidates(title, artist, durationSec);
    allCandidates.push(...pass1Candidates);

    let scoredPass1 = await verifyAndScoreCandidates(pass1Candidates, title, artist, durationSec);
    if (scoredPass1.length > 0 && evaluateWinner(scoredPass1[0])) {
        return {
            status: 'SUCCESS',
            bestMatch: scoredPass1[0],
            candidateCount: allCandidates.length,
            pass: 1
        };
    }

    // ── PASS 2: Dual-Language Title Alias Splitting ──────────────────────────────
    const aliases = extractTitleAliases(rawTitle);
    for (const alias of aliases) {
        if (alias.toLowerCase() === title.toLowerCase()) continue;

        const aliasCandidates = await fetchCandidates(alias, artist, durationSec);
        allCandidates.push(...aliasCandidates);

        const scoredAlias = await verifyAndScoreCandidates(aliasCandidates, alias, artist, durationSec);
        if (scoredAlias.length > 0 && evaluateWinner(scoredAlias[0])) {
            return {
                status: 'SUCCESS',
                bestMatch: scoredAlias[0],
                candidateCount: allCandidates.length,
                pass: 2
            };
        }
    }

    // ── PASS 3: Phonetic Romanization for CJK non-ASCII titles ──────────────────
    if (isNonAscii(title)) {
        const romanizedTitle = romanize(title);
        if (romanizedTitle && romanizedTitle.toLowerCase() !== title.toLowerCase()) {
            const romCandidates = await searchLrclib(romanizedTitle, artist, durationSec);
            allCandidates.push(...romCandidates);

            const scoredRom = await verifyAndScoreCandidates(romCandidates, romanizedTitle, artist, durationSec);
            if (scoredRom.length > 0 && evaluateWinner(scoredRom[0])) {
                return {
                    status: 'SUCCESS',
                    bestMatch: scoredRom[0],
                    candidateCount: allCandidates.length,
                    pass: 3
                };
            }
        }
    }

    if (allCandidates.length === 0) {
        return {
            status: 'NO_LYRICS',
            bestMatch: null,
            candidateCount: 0
        };
    }

    // Rescore all accumulated candidates against primary title to find closest best match
    const finalScored = await verifyAndScoreCandidates(allCandidates, title, artist, durationSec);
    const bestMatch = finalScored[0] || null;

    if (evaluateWinner(bestMatch)) {
        return {
            status: 'SUCCESS',
            bestMatch,
            candidateCount: allCandidates.length
        };
    }

    return {
        status: 'NO_MATCH',
        bestMatch,
        candidateCount: allCandidates.length
    };
}

