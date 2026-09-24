const LRC_TIMESTAMP_RE = /\[\d{2}:\d{2}\.\d{2,3}\]/;

function decodeBase64Utf8(base64Str) {
    if (!base64Str) return '';
    try {
        const binary = atob(base64Str);
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return '';
    }
}

export async function fetchKugouLyric(id, accesskey, timeoutMs = 5000) {
    if (!id || !accesskey) return null;
    const url = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(id)}&accesskey=${encodeURIComponent(accesskey)}&fmt=lrc&charset=utf8`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return null;
        const data = await res.json();
        const raw = decodeBase64Utf8(data?.content || '');
        if (raw && raw.trim().length >= 5) {
            return {
                rawLyric: raw,
                synced: LRC_TIMESTAMP_RE.test(raw),
                instrumental: false
            };
        }
        return null;
    } catch {
        return null;
    }
}

export async function searchKugou(title, artist, timeoutMs = 5000) {
    const query = artist ? `${artist} - ${title}` : title;
    if (!query) return [];

    const directPromise = fetch(
        `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(query)}&hash=`,
        { signal: AbortSignal.timeout(timeoutMs) }
    )
        .then(r => r.ok ? r.json() : { candidates: [] })
        .then(d => Array.isArray(d?.candidates) ? d.candidates : [])
        .catch(() => []);

    const songPromise = fetch(
        `https://msearch.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(query)}&page=1&pagesize=4`,
        { signal: AbortSignal.timeout(timeoutMs) }
    )
        .then(r => r.ok ? r.json() : null)
        .then(async data => {
            const songs = data?.data?.info || [];
            const hashes = [];
            for (const s of songs) {
                if (s?.hash && !hashes.includes(s.hash)) {
                    hashes.push(s.hash);
                    if (hashes.length >= 2) break;
                }
            }
            if (hashes.length === 0) return [];

            const hashPromises = hashes.map(hash =>
                fetch(
                    `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=&hash=${encodeURIComponent(hash)}`,
                    { signal: AbortSignal.timeout(timeoutMs) }
                )
                    .then(r => r.ok ? r.json() : { candidates: [] })
                    .then(d => Array.isArray(d?.candidates) ? d.candidates : [])
                    .catch(() => [])
            );
            const results = await Promise.all(hashPromises);
            return results.flat();
        })
        .catch(() => []);

    const [directRes, songRes] = await Promise.allSettled([directPromise, songPromise]);
    const candidates = [];
    const seen = new Set();
    const lists = [
        directRes.status === 'fulfilled' ? directRes.value : [],
        songRes.status === 'fulfilled' ? songRes.value : []
    ];

    for (const list of lists) {
        if (Array.isArray(list)) {
            for (const item of list) {
                const key = String(item.id || '');
                if (key && !seen.has(key)) {
                    seen.add(key);
                    candidates.push({
                        source: 'kugou',
                        id: key,
                        accesskey: String(item.accesskey || ''),
                        trackName: item.song || '',
                        artistName: item.singer || '',
                        albumName: '',
                        duration: item.duration ? Math.floor(item.duration / 1000) : 0,
                        synced: null,
                        rawLyric: null,
                        instrumental: false
                    });
                }
            }
        }
    }

    return candidates.slice(0, 10);
}
