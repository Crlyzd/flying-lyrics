// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — UNIFIED SEARCH ENGINE (background context coordinator)
//
//  This module orchestrates lyric search operations across providers.
//  Sub-responsibilities are cleanly decoupled into:
//    - search/sanitizer.js          (Title/artist noise stripping & alias extraction)
//    - search/scoring.js            (Levenshtein, token similarity & candidate scoring)
//    - search/network.js            (Fetch timeout & telemetry instrumentation)
//    - search/providers/lrclib.js   (LRCLIB API adapter)
//    - search/providers/netease.js  (NetEase API adapter)
//    - search/providers/kugou.js    (KuGou API adapter & Base64 UTF-8 decoder)
// ─────────────────────────────────────────────────────────────────────────────

const LRC_TIMESTAMP_RE = /\[\d{2}:\d{2}\.\d{2,3}\]/;

// In-memory cache for transliteration: key -> transliterated string
const transliterationCache = new Map();

/**
 * Asynchronously fetches romanized/phonetic transcription via Google Translate (dt=rm).
 * Returns tone-stripped Latin string, or falls back to offline romanize().
 */
async function fetchRomanizedMetadata(text, timeoutMs = 2000) {
    if (!text || (typeof isNonAscii === 'function' && !isNonAscii(text))) return text || '';
    const key = text.trim().toLowerCase();
    if (transliterationCache.has(key)) {
        return transliterationCache.get(key);
    }

    const fetchFn = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;

    // Tier 1 (Primary): client=gtx (fast for single-line title/artist strings)
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
        const res = await fetchFn(url, timeoutMs);
        if (res && res.ok) {
            const data = await res.json();
            let romanized = '';
            if (Array.isArray(data?.[0])) {
                romanized = data[0].map(x => (Array.isArray(x) && x[3]) ? x[3] : (x?.[0] || '')).join('').trim();
            }
            if (romanized) {
                const cleaned = (typeof stripDiacritics === 'function' ? stripDiacritics(romanized) : romanized).trim();
                transliterationCache.set(key, cleaned);
                return cleaned;
            }
        }
    } catch {
        // Fallback to Tier 2 on network error/timeout
    }

    // Tier 2 (Network Fallback): client=dict-chrome-ex
    try {
        const fallbackUrl = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
        const res2 = await fetchFn(fallbackUrl, timeoutMs);
        if (res2 && res2.ok) {
            const data2 = await res2.json();
            let romanized2 = '';
            if (Array.isArray(data2?.[0])) {
                romanized2 = data2[0].map(x => (Array.isArray(x) && x[3]) ? x[3] : (x?.[0] || '')).join('').trim();
            }
            if (romanized2) {
                const cleaned2 = (typeof stripDiacritics === 'function' ? stripDiacritics(romanized2) : romanized2).trim();
                transliterationCache.set(key, cleaned2);
                return cleaned2;
            }
        }
    } catch {
        // Fallback to Tier 3 on failure
    }

    // Tier 3 (Offline Safety Net): local rule-based romanization
    const fallback = typeof romanize === 'function' ? romanize(text) : text;
    transliterationCache.set(key, fallback);
    return fallback;
}

function getQueryMetadata(cleanQueryTitle, cleanQueryArtist, extraRomajiTitle = '', extraRomajiArtist = '') {
    const titleLower = (cleanQueryTitle || '').toLowerCase();
    const titleShort = (typeof extractShortTitle === 'function' ? extractShortTitle(cleanQueryTitle || '') : cleanQueryTitle || '').toLowerCase();
    
    const artistLower = (typeof cleanArtist === 'function' ? cleanArtist(cleanQueryArtist || '') : cleanQueryArtist || '').toLowerCase();
    const artistPrimary = (typeof extractPrimaryArtist === 'function' ? extractPrimaryArtist(cleanQueryArtist || '') : cleanQueryArtist || '').toLowerCase();

    const romFn = typeof romanize === 'function' ? romanize : (s => s);

    return {
        titleLower,
        titleShort,
        titleCleanRomaji: (extraRomajiTitle || romFn(titleLower)).toLowerCase(),
        titleShortRomaji: romFn(titleShort).toLowerCase(),
        artistLower,
        artistFullRomaji: (extraRomajiArtist || romFn(artistLower)).toLowerCase(),
        artistPrimary,
        artistPrimaryRomaji: romFn(artistPrimary).toLowerCase()
    };
}

/**
 * Unified candidate search across providers.
 */
async function unifiedSearch(query, actualDuration, cleanTitleStr, cleanArtistStr, timeoutMs, simOrProviders) {
    const defaultMs = typeof DEFAULT_TIMEOUT_MS !== 'undefined' ? DEFAULT_TIMEOUT_MS : 5000;
    const activeTimeout = timeoutMs || defaultMs;
    const fetchFn = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;

    let lrcTimedOut = false;
    let neteaseTimedOut = false;
    let kugouTimedOut = false;
    let lrcOk = false;
    let neteaseOk = false;
    let kugouOk = false;

    let skipLrc = false;
    let skipNetease = false;
    let skipKugou = false;

    if (simOrProviders && typeof simOrProviders === 'object') {
        skipLrc = simOrProviders.lrclib === false;
        skipNetease = simOrProviders.netease === false;
        skipKugou = simOrProviders.kugou === false;
    } else if (typeof simOrProviders === 'string') {
        skipLrc = (simOrProviders === 'force_lrclib_down' || simOrProviders === 'force_lrclib_netease_down' || simOrProviders === 'force_all_down');
        skipNetease = (simOrProviders === 'force_netease_down' || simOrProviders === 'force_lrclib_netease_down' || simOrProviders === 'force_all_down');
        skipKugou = (simOrProviders === 'force_kugou_down' || simOrProviders === 'force_all_down');
    }

    const lrcPromise = skipLrc
        ? Promise.resolve({ ok: false, json: () => Promise.resolve([]) })
        : fetchFn(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, activeTimeout);

    const neteasePromise = skipNetease
        ? Promise.resolve({ ok: false, json: () => Promise.resolve({ result: { songs: [] } }) })
        : fetchFn(`https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1`, activeTimeout);

    const kugouSearchFn = typeof searchKugouCandidates === 'function' 
        ? searchKugouCandidates 
        : (globalThis.KUGOU_PROVIDER?.searchKugouCandidates || (() => Promise.resolve({ candidates: [] })));

    const kugouPromise = skipKugou
        ? Promise.resolve({ candidates: [], ok: false, timedOut: false })
        : kugouSearchFn(query, activeTimeout);

    const [lrcRes, neteaseRes, kugouRes] = await Promise.allSettled([
        lrcPromise
            .then(r => {
                if (r.ok) {
                    lrcOk = true;
                    return r.json();
                }
                return [];
            })
            .catch((err) => {
                if (err.name === 'AbortError' || err.message?.includes('timeout')) {
                    lrcTimedOut = true;
                }
                return [];
            }),

        neteasePromise
            .then(r => {
                if (r.ok) {
                    neteaseOk = true;
                    return r.json();
                }
                return { result: { songs: [] } };
            })
            .then(data => data?.result?.songs || [])
            .catch((err) => {
                if (err.name === 'AbortError' || err.message?.includes('timeout')) {
                    neteaseTimedOut = true;
                }
                return [];
            }),

        kugouPromise
            .then(res => {
                if (res?.ok) kugouOk = true;
                if (res?.timedOut) kugouTimedOut = true;
                return res?.candidates || [];
            })
            .catch((err) => {
                if (err.name === 'AbortError' || err.message?.includes('timeout')) {
                    kugouTimedOut = true;
                }
                return [];
            })
    ]);

    const candidates = [];
    const normLrc = typeof normalizeLrcLib === 'function' ? normalizeLrcLib : (c => c);
    const normNet = typeof normalizeNetease === 'function' ? normalizeNetease : (c => c);
    const normKu = typeof normalizeKugou === 'function' ? normalizeKugou : (c => c);

    if (lrcRes.status === 'fulfilled') {
        const lrcItems = Array.isArray(lrcRes.value) ? lrcRes.value : [];
        candidates.push(...lrcItems.slice(0, 10).map(normLrc));
    }

    if (neteaseRes.status === 'fulfilled') {
        const netItems = Array.isArray(neteaseRes.value) ? neteaseRes.value : [];
        candidates.push(...netItems.slice(0, 10).map(normNet));
    }

    if (kugouRes.status === 'fulfilled') {
        const kugouItems = Array.isArray(kugouRes.value) ? kugouRes.value : [];
        candidates.push(...kugouItems.slice(0, 10).map(normKu));
    }

    // Pre-calculate query metadata and score each candidate exactly once
    const queryMetadata = getQueryMetadata(cleanTitleStr, cleanArtistStr);
    const scoreFn = typeof scoreCandidate === 'function' ? scoreCandidate : (() => 0);

    for (const c of candidates) {
        c._score = scoreFn(c, actualDuration, queryMetadata);
    }

    candidates.sort((a, b) => b._score - a._score);
    const isNetworkError = !lrcOk && !neteaseOk && !kugouOk;

    return { candidates, hasTimeout: lrcTimedOut || neteaseTimedOut || kugouTimedOut, isNetworkError };
}

/**
 * Auto Search entry-point with multi-pass query fallback and lazy evaluation.
 */
async function getBestAutoMatch(rawArtist, rawTitle, duration, timeoutMs, simOrProviders) {
    const cPrimaryArtist = typeof extractPrimaryArtist === 'function' ? extractPrimaryArtist(rawArtist || '') : (rawArtist || '');
    const cArtistFull    = typeof cleanArtist === 'function' ? cleanArtist(rawArtist || '') : (rawArtist || '');
    const cTitleFull     = typeof cleanTitle === 'function' ? cleanTitle(rawTitle || '') : (rawTitle || '');
    const cTitleShort    = typeof extractShortTitle === 'function' ? extractShortTitle(cTitleFull) : cTitleFull;

    let romajiTitle = '';
    let romajiArtist = '';
    const nonAsciiFn = typeof isNonAscii === 'function' ? isNonAscii : (s => /[^\x00-\x7F]/.test(s));

    if (nonAsciiFn(cTitleFull) || nonAsciiFn(cArtistFull)) {
        const [rTitle, rArtist] = await Promise.all([
            fetchRomanizedMetadata(cTitleShort, Math.min(2000, timeoutMs || 2000)),
            fetchRomanizedMetadata(cPrimaryArtist, Math.min(2000, timeoutMs || 2000))
        ]);
        romajiTitle = rTitle || '';
        romajiArtist = rArtist || '';
    }

    const titleAliases = typeof extractTitleAliases === 'function' ? extractTitleAliases(cTitleFull) : [];

    const passes = [
        `${cPrimaryArtist} - ${cTitleShort}`.trim(),
        cTitleShort,
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
    const searchPromises = uniquePasses.map(query => unifiedSearch(query, duration, cTitleFull, cPrimaryArtist, timeoutMs, simOrProviders));
    const results = await Promise.all(searchPromises);

    const allCandidates = [];
    const seenCandidates = new Set();
    let hasTimeout = false;

    for (const res of results) {
        if (res?.hasTimeout) hasTimeout = true;
        const candidatesList = res?.candidates || [];
        for (const c of candidatesList) {
            const key = `${c.source}-${c.id}`;
            if (!seenCandidates.has(key)) {
                seenCandidates.add(key);
                allCandidates.push(c);
            }
        }
    }

    const resolvedPool = [];
    const candidatesToFetch = [];
    const queryMetadata = getQueryMetadata(cTitleFull, cPrimaryArtist, romajiTitle, romajiArtist);
    const titleSimFn = typeof getTitleSimilarity === 'function' ? getTitleSimilarity : (() => 100);
    const artistSimFn = typeof getArtistSimilarity === 'function' ? getArtistSimilarity : (() => 100);
    const scoreFn = typeof scoreCandidate === 'function' ? scoreCandidate : (() => 0);

    for (const c of allCandidates) {
        const titleSim = titleSimFn(queryMetadata, c.trackName);
        let isMatchPossible = true;

        if (titleSim < 40) {
            const isQueryNonAscii = nonAsciiFn(cTitleFull) || nonAsciiFn(cPrimaryArtist);
            const isCandidateNonAscii = nonAsciiFn(c.trackName || '') || nonAsciiFn(c.artistName || '');
            const scriptMismatch = isQueryNonAscii !== isCandidateNonAscii;

            const artistSim = artistSimFn(queryMetadata, c.artistName);
            const durationMatches = duration > 0 && Math.abs((c.duration || 0) - duration) <= 3;

            if ((artistSim >= 85 && scriptMismatch) || (durationMatches && scriptMismatch && (artistSim >= 40 || titleSim >= 20))) {
                // Keep candidate
            } else {
                isMatchPossible = false;
            }
        }

        if (!isMatchPossible) continue;

        if (c.source === 'lrclib') {
            if (!c.rawLyric) continue;
            resolvedPool.push({
                rawLyric: c.rawLyric,
                source: { 
                    type: 'api', 
                    id: c.id, 
                    name: c.trackName, 
                    synced: c.synced,
                    isEmpty: c.isEmpty || false,
                    instrumental: c.instrumental || false
                },
                synced: c.synced,
                score: scoreFn(c, duration, queryMetadata),
            });
        } else if (c.source === 'netease' || c.source === 'kugou') {
            candidatesToFetch.push(c);
        }
    }

    const fetchUnresolvedCandidates = async (candidatesList) => {
        const promises = candidatesList.map(async (c) => {
            try {
                if (c.source === 'kugou') {
                    const fetchKuFn = typeof fetchKugouRaw === 'function' ? fetchKugouRaw : (globalThis.KUGOU_PROVIDER?.fetchKugouRaw);
                    const resObj = await fetchKuFn(c.id, c.accesskey, timeoutMs);
                    const raw = typeof resObj === 'string' ? resObj : (resObj?.lyric || '');
                    if (raw && raw.trim().length >= 5) {
                        const isSynced = LRC_TIMESTAMP_RE.test(raw);
                        const resolved = { ...c, synced: isSynced };
                        return {
                            rawLyric: raw,
                            source: { 
                                type: 'kugou', 
                                id: c.id, 
                                accesskey: c.accesskey, 
                                name: c.trackName, 
                                synced: isSynced,
                                isEmpty: false,
                                instrumental: false
                            },
                            synced: isSynced,
                            score: scoreFn(resolved, duration, queryMetadata),
                        };
                    }
                } else {
                    const fetchNetFn = typeof fetchNeteaseRaw === 'function' ? fetchNeteaseRaw : (globalThis.NETEASE_PROVIDER?.fetchNeteaseRaw);
                    const resObj = await fetchNetFn(c.id, timeoutMs);
                    const raw = typeof resObj === 'string' ? resObj : (resObj?.lyric || '');
                    if (raw && raw.trim().length >= 5) {
                        const isSynced = LRC_TIMESTAMP_RE.test(raw);
                        const resolved = { ...c, synced: isSynced };
                        return {
                            rawLyric: raw,
                            source: { 
                                type: 'netease', 
                                id: c.id, 
                                name: c.trackName, 
                                synced: isSynced,
                                isEmpty: false,
                                instrumental: false,
                                tlyric: resObj?.tlyric || '',
                                romalrc: resObj?.romalrc || ''
                            },
                            synced: isSynced,
                            score: scoreFn(resolved, duration, queryMetadata),
                        };
                    }
                }
            } catch (err) {
                console.warn(`FL: Auto-fetch ${c.source} ID ${c.id} failed:`, err);
            }
            return null;
        });
        const fetched = await Promise.all(promises);
        return fetched.filter(Boolean);
    };

    if (candidatesToFetch.length > 0) {
        const optimisticScored = candidatesToFetch.map(c => ({
            candidate: c,
            optimisticScore: scoreFn({ ...c, synced: true }, duration, queryMetadata)
        }));
        optimisticScored.sort((a, b) => b.optimisticScore - a.optimisticScore);

        const hasSyncedLrcLib = resolvedPool.some(r => r.synced);
        const initialDepth = hasSyncedLrcLib ? 3 : 5;
        const firstBatch = optimisticScored.slice(0, initialDepth).map(x => x.candidate);

        const resolvedBatch1 = await fetchUnresolvedCandidates(firstBatch);
        resolvedPool.push(...resolvedBatch1);

        const hasSyncedInBatch1 = resolvedBatch1.some(r => r.synced);
        if (!hasSyncedInBatch1 && optimisticScored.length > initialDepth) {
            const secondBatch = optimisticScored.slice(initialDepth, initialDepth + 3).map(x => x.candidate);
            const resolvedBatch2 = await fetchUnresolvedCandidates(secondBatch);
            resolvedPool.push(...resolvedBatch2);
        }
    }

    const isNetworkError = results.length > 0 && results.every(res => res?.isNetworkError);

    if (resolvedPool.length === 0) {
        return { rawLyric: null, source: null, synced: false, hasTimeout, isNetworkError };
    }

    resolvedPool.sort((a, b) => b.score - a.score);
    const winner = resolvedPool[0];

    return {
        rawLyric: winner.rawLyric,
        source: winner.source,
        synced: winner.synced,
        hasTimeout,
        isNetworkError: false
    };
}

/**
 * Manual Search entry-point for popup UI.
 */
async function manualSearch(query, duration, cleanArtistStr, cleanTitleStr, timeoutMs, simOrProviders) {
    const { candidates, hasTimeout, isNetworkError } = await unifiedSearch(query, duration, cleanTitleStr, cleanArtistStr, timeoutMs, simOrProviders);

    const results = candidates.map(c => ({
        source:     c.source === 'lrclib' ? 'api' : (c.source === 'netease' ? 'netease' : 'kugou'),
        id:         c.id,
        accesskey:  c.accesskey || '',
        name:       c.trackName,
        artistName: c.artistName,
        albumName:  c.albumName,
        duration:   c.duration,
        synced:     c.synced,
        rawLyric:   c.source === 'lrclib' ? (c.rawLyric || '') : null,
        isEmpty:    c.isEmpty || false,
        instrumental: c.instrumental || false
    }));

    return { results, hasTimeout, isNetworkError: !!isNetworkError };
}

// Global scope exports for MV3 Service Worker
globalThis.SEARCH_ENGINE = {
    unifiedSearch,
    getBestAutoMatch,
    manualSearch,
    fetchRomanizedMetadata,
    getQueryMetadata
};
