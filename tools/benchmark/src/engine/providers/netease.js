/**
 * Netease Cloud Music Provider Client
 */

export async function searchNetease(title, artist) {
    const query = artist ? `${artist} ${title}` : title;
    const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(query)}&type=1&offset=0&total=true&limit=5`;

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
            artistName: (song.artists || []).map(a => a.name).join(', '),
            albumName: song.album?.name || '',
            duration: Math.round((song.duration || 0) / 1000),
            synced: null,
            rawLyric: null,
            instrumental: false
        }));
    } catch (e) {
        return [];
    }
}
