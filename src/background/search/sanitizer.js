// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — SEARCH METADATA SANITIZER (background context)
// ─────────────────────────────────────────────────────────────────────────────

function cleanTitle(title) {
    if (!title) return '';
    const noiseTerms = [
        'official video', 'official audio', 'official music video', 'lyrics video',
        'radio edit', 'club mix', 'single version', 'album version', 'bonus track',
        'hidden track', 'high res', 'hi-res', 'a cappella',
        'from the first take', 'anime ver\\.?', 'tv size ver\\.?', 'tv size', 'tv ver\\.?',
        'short ver\\.?', 'theme song', 'soundtrack', 'original soundtrack', 'ost',
        '主題歌', '挿入歌', 'テーマソング', 'エンディング', 'オープニング', '劇中歌', '伴奏', '伴奏版',
        'remaster', 'remastered', 'remix', 'rework', 'vip', 'stereo', 'mono',
        'extended', 'deluxe', 'dub', 'live', 'acoustic', 'unplugged', 'demo',
        'session', 'instrumental', 'cover', 'explicit', 'clean', 'edited',
        'anniversary', 'b-side', 'mv', '4k', '1080p', 'hq', 'hd',
        'feat\\.', 'ft\\.', 'featuring', 'with', 'vs\\.'
    ].join('|');

    // Pass 1: Extract song title if quoted in Japanese quotes with prefix e.g. 【推しの子】主題歌「アイドル」 -> アイドル
    let clean = title;
    const animeQuoteMatch = clean.match(/^[【『「《（［〔].*?[】』」》）］〕].*?[「『]([^」』]+)[」』]/);
    if (animeQuoteMatch && animeQuoteMatch[1]) {
        clean = animeQuoteMatch[1];
    }

    // Pass 2: Remove bracketed noise groups (including Asian full-width brackets)
    const bracketRegex = new RegExp(
        '\\s*[({\\[【『「《（［〔](?:[^)}\\]】』」》）］〕]*?(?:' + noiseTerms + ')[^)}\\]】』」》）］〕]*?)[)}\\]】』」》）］〕]',
        'gi'
    );
    clean = clean.replace(bracketRegex, '');

    // Pass 3: Remove trailing noise suffixes (- Remastered, - TV ver, etc.)
    const trailingRegex = new RegExp('\\s*-\\s*(?:' + noiseTerms + ').*$', 'gi');
    clean = clean.replace(trailingRegex, '');

    // Pass 4: Strip leading/trailing Japanese corner quotes e.g. 「アイドル」 -> アイドル
    clean = clean.replace(/^[「『《〈](.+)[」』》〉]$/, '$1');

    return clean.trim();
}

function extractPrimaryArtist(artist) {
    if (!artist) return '';
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

function splitArtists(artistStr) {
    if (!artistStr) return [];
    return artistStr
        .split(/[,;&/|、・]|\b(?:feat\.?|ft\.?|featuring|with|vs\.?)\b/i)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
}

// Global scope export for MV3 Service Worker importScripts compatibility
globalThis.SEARCH_SANITIZER = {
    cleanTitle,
    extractPrimaryArtist,
    cleanArtist,
    extractShortTitle,
    splitArtists
};
