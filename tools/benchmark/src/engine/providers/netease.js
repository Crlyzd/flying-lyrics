export const LRC_TIMESTAMP_RE = /\[\d{2}:\d{2}\.\d{2,3}\]/;

export async function searchNetease(title, artist) {
    const query = artist ? `${artist} ${title}` : title;
    const url = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1&offset=0&limit=10`;

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://music.163.com'
            },
            signal: AbortSignal.timeout(6000)
        });

        if (!res.ok) return [];

        const data = await res.json();
        const songs = data.result?.songs || [];

        return songs.map(song => ({
            source: 'netease',
            id: song.id,
            trackName: song.name || '',
            artistName: (song.ar || []).map(a => a.name).join(', '),
            albumName: song.al?.name || '',
            duration: Math.round((song.dt || 0) / 1000),
            synced: null,
            rawLyric: null,
            instrumental: false
        }));
    } catch (e) {
        return [];
    }
}

export async function fetchNeteaseLyric(songId) {
    const url = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&tv=-1`;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://music.163.com'
            },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        const raw = data?.lrc?.lyric || '';
        if (raw && raw.trim().length >= 5) {
            const isSynced = LRC_TIMESTAMP_RE.test(raw);
            return {
                rawLyric: raw,
                synced: isSynced,
                instrumental: !!data?.nolyric
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

