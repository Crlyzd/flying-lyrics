// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — UNIFIED SEARCH ENGINE (background context)
//
//  This module is the single source of truth for all lyric search operations.
//  It is called exclusively by message handlers in background.js:
//
//    UNIFIED_SEARCH      → used by popup.js (Manual Search)
//    UNIFIED_AUTO_SEARCH → used by services.js (Auto Search)
//
//  Architecture:
//    1. Fires LRCLIB and Netease search concurrently (Promise.allSettled).
//    2. Normalises both APIs into a flat, unified candidate array.
//    3. Scores and sorts candidates with a single algorithm that both
//       auto and manual search share.
//    4. Auto Search walks down the sorted list, lazily fetching Netease raw
//       lyrics on demand to check for LRC timestamps (Lazy Evaluation).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000;

// ─── Levenshtein helpers ─────────────────────────────────────────────────────

function levenshtein(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();
    const m = a.length, n = b.length;
    const dp = new Int32Array((m + 1) * (n + 1));
    for (let i = 0; i <= m; i++) dp[i * (n + 1)] = i;
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i * (n + 1) + j] = Math.min(
                dp[(i - 1) * (n + 1) + j] + 1,
                dp[i * (n + 1) + (j - 1)] + 1,
                dp[(i - 1) * (n + 1) + (j - 1)] + cost
            );
        }
    }
    return dp[m * (n + 1) + n];
}

function titleSimilarity(a, b) {
    if (!a && !b) return 100;
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

// ─── Metadata cleaning ───────────────────────────────────────────────────────

function cleanTitle(title) {
    const noiseTerms = [
        'official video', 'official audio', 'official music video', 'lyrics video',
        'radio edit', 'club mix', 'single version', 'album version', 'bonus track',
        'hidden track', 'high res', 'hi-res', 'a cappella',
        'remaster', 'remastered', 'remix', 'rework', 'vip', 'stereo', 'mono',
        'extended', 'deluxe', 'dub', 'live', 'acoustic', 'unplugged', 'demo',
        'session', 'instrumental', 'cover', 'explicit', 'clean', 'edited',
        'anniversary', 'b-side', 'mv', '4k', '1080p', 'hq', 'hd',
        'feat\\.', 'ft\\.', 'featuring', 'with', 'vs\\.'
    ].join('|');

    const bracketRegex = new RegExp(
        `\\s*[([\\[](?:[^\\]()[\\]]*?(?:${noiseTerms})[^\\]()[\\]]*?)[)\\]]`,
        'gi'
    );
    let clean = title.replace(bracketRegex, '');

    const trailingRegex = new RegExp(`\\s*-\\s*(?:${noiseTerms}).*$`, 'gi');
    clean = clean.replace(trailingRegex, '');

    return clean.trim();
}

function extractPrimaryArtist(artist) {
    let primary = artist.split(/,|&|＆|、|・|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bvs\.?\b|\sx\s/i)[0].trim();
    primary = primary.replace(/\s*[（\(]CV[.:：]?[^）\)]*[）\)]/gi, '').trim();
    return primary;
}

function cleanArtist(artist) {
    if (!artist) return '';
    let cleaned = artist.split(/\b(feat\.?|ft\.?|featuring|with|vs\.?)\b/i)[0].trim();
    cleaned = cleaned.replace(/\s*[（\(]CV[.:：]?[^）\)]*[）\)]/gi, '').trim();
    return cleaned.replace(/[\s,;&＆]+$/, '').trim();
}

function extractShortTitle(title) {
    if (!title) return '';
    if (/\s+-/.test(title)) {
        const parts = title.split(/\s+-\s*/);
        if (parts[0] && parts[0].trim()) {
            return parts[0].trim();
        }
    }
    return title;
}

function getTitleSimilarity(queryTitle, candidateTitle) {
    const qTitleClean = queryTitle.toLowerCase();
    const qTitleShort = extractShortTitle(queryTitle).toLowerCase();
    const qTitleCleanRomaji = romanize(qTitleClean);
    const qTitleShortRomaji = romanize(qTitleShort);

    const cTitleClean = cleanTitle(candidateTitle || '').toLowerCase();
    const cTitleShort = extractShortTitle(cTitleClean).toLowerCase();
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

function getArtistSimilarity(queryArtist, candidateArtist) {
    const qArtistFull = cleanArtist(queryArtist).toLowerCase();
    const qArtistFullRomaji = romanize(qArtistFull);
    const qArtistPrimary = extractPrimaryArtist(queryArtist).toLowerCase();
    const qArtistPrimaryRomaji = romanize(qArtistPrimary);

    const cArtistFull = cleanArtist(candidateArtist || '').toLowerCase();
    const cArtistFullRomaji = romanize(cArtistFull);
    const cArtistPrimary = extractPrimaryArtist(candidateArtist || '').toLowerCase();
    const cArtistPrimaryRomaji = romanize(cArtistPrimary);

    return Math.max(
        titleSimilarity(qArtistPrimary, cArtistPrimary),
        titleSimilarity(qArtistPrimary, cArtistPrimaryRomaji),
        titleSimilarity(qArtistPrimaryRomaji, cArtistPrimary),
        titleSimilarity(qArtistPrimaryRomaji, cArtistPrimaryRomaji),
        titleSimilarity(qArtistFull, cArtistFull),
        titleSimilarity(qArtistFull, cArtistFullRomaji),
        titleSimilarity(qArtistFullRomaji, cArtistFull),
        titleSimilarity(qArtistFullRomaji, cArtistFullRomaji)
    );
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Scores a single normalised candidate.
 *
 * Score breakdown (higher = better):
 *   +10 000  : synced lyric (confirmed LRC timestamps)
 *   +100     : LRCLIB source bonus — acts as a TIE-BREAKER only between equally
 *              good matches; intentionally small so it never overrides a title mismatch.
 *   -8 000   : title mismatch gate — applied when titleSim < 40%, ensuring a clearly
 *              wrong title (e.g. "Made In Heaven" when searching "Faith") can never
 *              beat a correct result regardless of source or sync status.
 *   -delta   : absolute seconds difference between candidate and actual duration
 *              (only penalised when delta > 5s to allow platform rounding)
 *   +titleSim*10  : Levenshtein closeness of candidate title to clean query title
 *   +artistSim*5  : Levenshtein closeness of candidate artist to clean query artist
 *
 * @param {object} candidate – normalised candidate (see normalizeLrcLib / normalizeNetease)
 * @param {number} actualDuration – current player duration in seconds
 * @param {string} cleanQueryTitle – noise-stripped title for similarity scoring
 * @param {string} cleanQueryArtist – primary artist/full artist for similarity scoring
 * @returns {number}
 */
function scoreCandidate(candidate, actualDuration, cleanQueryTitle, cleanQueryArtist) {
    const syncedBonus  = candidate.synced ? 10000 : 0;
    // Small tie-breaker only — NOT large enough to override a title mismatch
    const sourceBonus  = candidate.source === 'lrclib' ? 100 : 0;

    const durationDelta = actualDuration > 0
        ? Math.max(0, Math.abs((candidate.duration || 0) - actualDuration) - 5)
        : 0;

    const titleSim = getTitleSimilarity(cleanQueryTitle, candidate.trackName);
    const artistSim = getArtistSimilarity(cleanQueryArtist, candidate.artistName);

    // Gate: heavily penalise candidates whose title is clearly wrong.
    // BUT relax the penalty if:
    //   1. The primary artist matches perfectly (artistSim >= 90%).
    //   2. The title scripts differ (one contains non-ASCII and the other is pure ASCII).
    // This protects non-ASCII (e.g. Mandarin, Cyrillic) synced lyrics from being penalized
    // when searched with an English/Romaji query.
    let titleMismatchPenalty = 0;
    if (cleanQueryTitle && titleSim < 40) {
        const isQueryNonAscii = isNonAscii(cleanQueryTitle);
        const isCandidateNonAscii = isNonAscii(candidate.trackName || '');
        const scriptMismatch = isQueryNonAscii !== isCandidateNonAscii;

        if (artistSim >= 90 && scriptMismatch) {
            // Relaxed mismatch penalty — still negative to favor matching titles, but not severe enough to kill the candidate
            titleMismatchPenalty = -2000;
        } else {
            // Standard severe penalty
            titleMismatchPenalty = -12000;
        }
    }

    return syncedBonus + sourceBonus + titleMismatchPenalty - durationDelta + (titleSim * 10) + (artistSim * 5);
}

// ─── Normalise API responses ──────────────────────────────────────────────────

function normalizeLrcLib(item) {
    return {
        source:     'lrclib',
        id:         item.id,
        trackName:  item.trackName  || '',
        artistName: item.artistName || '',
        albumName:  item.albumName  || '',
        duration:   item.duration   || 0,
        // Pre-resolved: LRCLIB always returns the full lyric text in the search response
        synced:     !!item.syncedLyrics,
        rawLyric:   item.syncedLyrics || item.plainLyrics || '',
    };
}

function normalizeNetease(song) {
    return {
        source:     'netease',
        id:         song.id,
        trackName:  song.name                              || '',
        artistName: song.ar ? song.ar.map(a => a.name).join(', ') : '',
        albumName:  song.al ? song.al.name                 : '',
        duration:   song.dt ? Math.floor(song.dt / 1000)  : 0,
        // Unknown until we lazily fetch the raw lyric string
        synced:     null,
        rawLyric:   null,
    };
}

// ─── Network helpers ──────────────────────────────────────────────────────────

/**
 * Wraps fetch() with a hard timeout using AbortController.
 * Caps request duration to prevent extension hanging when external API servers are slow.
 *
 * @param {string} url - URL to fetch
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, timeoutMs) {
    const startTime = performance.now();
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const cleanUrl = url.split('?')[0];

    return fetch(url, { signal: controller.signal })
        .then(res => {
            clearTimeout(id);
            const latency = Math.round(performance.now() - startTime);
            // Log api_latency event anonymously
            if (typeof trackEvent === 'function') {
                trackEvent('api_latency', { url: cleanUrl, latency_ms: latency, status: res.status });
                if (res.status === 429) {
                    trackEvent('rate_limited', { url: cleanUrl });
                }
            }
            return res;
        })
        .catch(err => {
            clearTimeout(id);
            const latency = Math.round(performance.now() - startTime);
            if (typeof trackEvent === 'function') {
                const errName = err.name === 'AbortError' ? 'timeout' : (err.message || err.name || 'network_error');
                trackEvent('api_latency', { url: cleanUrl, latency_ms: latency, error: errName });
            }
            throw err;
        });
}

/** Fetches the raw Netease lyric text for a specific song ID. */
function fetchNeteaseRaw(id, timeoutMs) {
    return fetchWithTimeout(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`, timeoutMs || DEFAULT_TIMEOUT_MS)
        .then(r => r.json())
        .then(data => data?.lrc?.lyric || '')
        .catch(() => '');
}

/** Fetches the raw LRCLIB lyric data for a specific song ID. */
function fetchLrcLibRaw(id, timeoutMs) {
    return fetchWithTimeout(`https://lrclib.net/api/get/${id}`, timeoutMs || DEFAULT_TIMEOUT_MS)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
}

const LRC_TIMESTAMP_RE = /\[\d{2}:\d{2}\.\d{2,3}\]/;

// ─── Core search ─────────────────────────────────────────────────────────────

/**
 * The unified search function.
 *
 * Fires LRCLIB and Netease search requests concurrently and returns an array
 * of normalised candidates sorted best-first by score.
 *
 * Netease candidates have synced=null / rawLyric=null at this stage.
 * For Manual Search this is fine — the popup shows the metadata list and
 * only fetches the raw lyric when the user clicks a result.
 * For Auto Search, getBestAutoMatch() handles Lazy Evaluation on top.
 *
 * @param {string} query           – The search string (e.g. "Artist - Clean Title")
 * @param {number} actualDuration  – Player duration in seconds (0 = unknown)
 * @param {string} cleanTitle      – Noise-stripped title for scoring
 * @param {string} cleanArtist     – Primary artist for scoring
 * @returns {Promise<object[]>}    – Sorted candidate array
 */
async function unifiedSearch(query, actualDuration, cleanTitle, cleanArtist, timeoutMs) {
    const activeTimeout = timeoutMs || DEFAULT_TIMEOUT_MS;

    let lrcTimedOut = false;
    let neteaseTimedOut = false;

    const [lrcRes, neteaseRes] = await Promise.allSettled([
        fetchWithTimeout(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, activeTimeout)
            .then(r => r.ok ? r.json() : [])
            .catch((err) => {
                if (err.name === 'AbortError' || err.message?.includes('timeout')) {
                    lrcTimedOut = true;
                }
                return [];
            }),

        fetchWithTimeout(`https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1`, activeTimeout)
            .then(r => r.json())
            .then(data => data?.result?.songs || [])
            .catch((err) => {
                if (err.name === 'AbortError' || err.message?.includes('timeout')) {
                    neteaseTimedOut = true;
                }
                return [];
            })
    ]);

    const candidates = [];

    if (lrcRes.status === 'fulfilled') {
        const lrcItems = Array.isArray(lrcRes.value) ? lrcRes.value : [];
        // Limit to top 10 per source to keep the result list manageable
        candidates.push(...lrcItems.slice(0, 10).map(normalizeLrcLib));
    }

    if (neteaseRes.status === 'fulfilled') {
        const netItems = Array.isArray(neteaseRes.value) ? neteaseRes.value : [];
        candidates.push(...netItems.slice(0, 10).map(normalizeNetease));
    }

    // Score and sort best-first
    candidates.sort((a, b) =>
        scoreCandidate(b, actualDuration, cleanTitle, cleanArtist) -
        scoreCandidate(a, actualDuration, cleanTitle, cleanArtist)
    );

    return { candidates, hasTimeout: lrcTimedOut || neteaseTimedOut };
}

// ─── Auto Search ─────────────────────────────────────────────────────────────

/**
 * Auto Search entry-point.
 *
 * Runs the unified search pipeline and walks down the sorted list to find
 * the highest-quality (preferably synced) lyric automatically.
 *
 * Strategy:
 *   Pass 1 – "CleanArtist - CleanTitle"  (mirrors Manual Search pre-fill)
 *   Pass 2 – "CleanTitle only"           (fallback if Pass 1 yields nothing synced)
 *
 * Within each pass, candidates are walked top-to-bottom:
 *   - LRCLIB candidates have rawLyric already resolved → check synced flag directly.
 *   - Netease candidates need a lazy fetch to read the LRC string and detect timestamps.
 *
 * Returns the best result object: { rawLyric, source, synced }
 * Returns null if nothing is found.
 *
 * @param {string} rawArtist    – Raw artist string from mediaSession
 * @param {string} rawTitle     – Raw title string from mediaSession
 * @param {number} duration     – Player duration in seconds
 * @returns {Promise<{rawLyric:string, source:object, synced:boolean}|null>}
 */
async function getBestAutoMatch(rawArtist, rawTitle, duration, timeoutMs) {
    const cArtistFull = cleanArtist(rawArtist || '');
    const cTitleFull  = cleanTitle(rawTitle || '');
    const cTitleShort = extractShortTitle(cTitleFull);

    const passes = [
        `${cArtistFull} - ${cTitleShort}`.trim(),
        cTitleShort,
    ].filter(Boolean);

    // Deduplicate: if artist is empty the two passes would be identical
    const uniquePasses = [...new Set(passes)];

    // 1. Run all searches concurrently
    const searchPromises = uniquePasses.map(query => unifiedSearch(query, duration, cTitleFull, cArtistFull, timeoutMs));
    const results = await Promise.all(searchPromises);

    // 2. Combine and deduplicate candidates by source & id
    const allCandidates = [];
    const seenCandidates = new Set();
    let hasTimeout = false;

    for (const res of results) {
        if (res?.hasTimeout) {
            hasTimeout = true;
        }
        const candidatesList = res?.candidates || [];
        for (const c of candidatesList) {
            const key = `${c.source}-${c.id}`;
            if (!seenCandidates.has(key)) {
                seenCandidates.add(key);
                allCandidates.push(c);
            }
        }
    }

    const resolvedPool = []; // { rawLyric, source, synced, score }
    const neteaseToFetch = []; // array of candidates to lazy fetch

    // 3. Early filtering and sorting
    for (const c of allCandidates) {
        const titleSim = getTitleSimilarity(cTitleFull, c.trackName);

        let isMatchPossible = true;
        if (titleSim < 40) {
            // Protect multi-script tracks from early discard if artist matches perfectly
            const isQueryNonAscii = isNonAscii(cTitleFull);
            const isCandidateNonAscii = isNonAscii(c.trackName || '');
            const scriptMismatch = isQueryNonAscii !== isCandidateNonAscii;

            const artistSim = getArtistSimilarity(cArtistFull, c.artistName);

            if (artistSim >= 90 && scriptMismatch) {
                // Keep candidate: script-relaxed scoring will evaluate it
            } else {
                isMatchPossible = false;
            }
        }

        if (!isMatchPossible) {
            // Drop candidates with <40% title similarity that are not valid script mismatches.
            continue;
        }

        if (c.source === 'lrclib') {
            if (!c.rawLyric) continue;
            resolvedPool.push({
                rawLyric: c.rawLyric,
                source:   { type: 'api', id: c.id, name: c.trackName, synced: c.synced },
                synced:   c.synced,
                score:    scoreCandidate(c, duration, cTitleFull, cArtistFull),
            });
        } else if (c.source === 'netease') {
            // Store Netease candidate for optimistic pre-scoring
            neteaseToFetch.push(c);
        }
    }

    // Helper to download Netease lyrics and check sync status
    const fetchNeteaseCandidates = async (candidatesList) => {
        const promises = candidatesList.map(async (c) => {
            try {
                const raw = await fetchNeteaseRaw(c.id, timeoutMs);
                if (raw && raw.trim().length >= 5) {
                    const isSynced = LRC_TIMESTAMP_RE.test(raw);
                    const resolved = { ...c, synced: isSynced };
                    return {
                        rawLyric: raw,
                        source:   { type: 'netease', id: c.id, name: c.trackName, synced: isSynced },
                        synced:   isSynced,
                        score:    scoreCandidate(resolved, duration, cTitleFull, cArtistFull),
                    };
                }
            } catch (err) {
                console.warn(`FL: Auto-fetch Netease ID ${c.id} failed:`, err);
            }
            return null;
        });
        const fetched = await Promise.all(promises);
        return fetched.filter(Boolean);
    };

    // 4. Optimistically pre-score and limit Netease candidates
    if (neteaseToFetch.length > 0) {
        // Score Netease candidate assuming the best case: it is synced (synced: true)
        const optimisticScoredNetease = neteaseToFetch.map(c => {
            const optimisticCandidate = { ...c, synced: true };
            return {
                candidate: c,
                optimisticScore: scoreCandidate(optimisticCandidate, duration, cTitleFull, cArtistFull)
            };
        });

        // Sort descending by optimistic score
        optimisticScoredNetease.sort((a, b) => b.optimisticScore - a.optimisticScore);

        // Determine fetch depth based on whether LRCLIB has a synced candidate
        const hasSyncedLrcLib = resolvedPool.some(r => r.synced);
        const initialDepth = hasSyncedLrcLib ? 3 : 5;

        // Take only the top initialDepth Netease candidates for Batch 1
        const firstBatch = optimisticScoredNetease.slice(0, initialDepth).map(x => x.candidate);

        // 5. Fetch first batch concurrently
        const resolvedBatch1 = await fetchNeteaseCandidates(firstBatch);
        resolvedPool.push(...resolvedBatch1);

        // 6. Check if we found a synced lyric in Batch 1
        const hasSyncedInBatch1 = resolvedBatch1.some(r => r.synced);

        // 7. Tiered fetch fallback: If no synced lyric is found in Batch 1, fetch Batch 2 (next 3)
        if (!hasSyncedInBatch1 && optimisticScoredNetease.length > initialDepth) {
            const secondBatch = optimisticScoredNetease
                .slice(initialDepth, initialDepth + 3)
                .map(x => x.candidate);
            const resolvedBatch2 = await fetchNeteaseCandidates(secondBatch);
            resolvedPool.push(...resolvedBatch2);
        }
    }

    if (resolvedPool.length === 0) {
        return {
            rawLyric: null,
            source:   null,
            synced:   false,
            hasTimeout
        };
    }

    // 8. Sort the fully-resolved pool by score (descending) and return the winner
    resolvedPool.sort((a, b) => b.score - a.score);
    const winner = resolvedPool[0];

    return {
        rawLyric:   winner.rawLyric,
        source:     winner.source,
        synced:     winner.synced,
        hasTimeout
    };
}

// ─── Manual Search ────────────────────────────────────────────────────────────

/**
 * Manual Search entry-point.
 *
 * Returns a flat, scored array of metadata-only candidates suitable for
 * rendering in the popup results list. Raw lyrics are NOT fetched here —
 * the content script fetches them via FETCH_NETEASE / direct LRCLIB id
 * only when the user clicks a result.
 *
 * @param {string} query         – Raw query string from the search input
 * @param {number} duration      – Player duration in seconds (0 = unknown)
 * @param {string} cleanArtist   – Primary artist for scoring (may be empty)
 * @param {string} cleanTitleStr – Noise-stripped title for scoring (may be empty)
 * @returns {Promise<object[]>}  – UI-ready candidate list
 */
async function manualSearch(query, duration, cleanArtist, cleanTitleStr, timeoutMs) {
    const { candidates, hasTimeout } = await unifiedSearch(query, duration, cleanTitleStr, cleanArtist, timeoutMs);

    // Map to a UI-friendly format (popup.js will render this directly)
    const results = candidates.map(c => ({
        source:     c.source === 'lrclib' ? 'api' : 'netease',
        id:         c.id,
        name:       c.trackName,
        artistName: c.artistName,
        albumName:  c.albumName,
        duration:   c.duration,
        synced:     c.synced,         // null for Netease (unknown until clicked)
        // Include the pre-resolved raw lyric for LRCLIB so the popup can apply
        // the manual override immediately without an extra network round-trip
        rawLyric:   c.source === 'lrclib' ? (c.rawLyric || '') : null,
    }));

    return { results, hasTimeout };
}
