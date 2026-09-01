/**
 * Title & Artist Sanitization module for benchmark runner.
 */

export function cleanTitle(title) {
    if (!title) return '';
    let cleaned = title;

    // Remove noise: (feat. ...), [feat. ...], (with ...), (ft. ...)
    cleaned = cleaned.replace(/\s*[\(\[](?:feat|ft|with)\.?\s+[^\)\]]+[\)\]]/gi, '');

    // Remove (Remastered...), [Remastered...], (Official Video), (Lyric Video), etc.
    cleaned = cleaned.replace(/\s*[\(\[](?:remaster(?:ed)?|official|lyric|audio|deluxe|bonus|anniversary|version|edit|extended)[^\)\]]*[\)\]]/gi, '');

    // Remove Japanese/Chinese bracket noise: 【...】, 「...」, 『...』
    cleaned = cleaned.replace(/【[^】]*】/g, '');
    cleaned = cleaned.replace(/「[^」]*」/g, '');
    cleaned = cleaned.replace(/『[^』]*』/g, '');

    // Remove leading/trailing punctuation and double spaces
    cleaned = cleaned.replace(/^[-\s/|]+|[-\s/|]+$/g, '').replace(/\s{2,}/g, ' ').trim();

    return cleaned || title;
}

export function cleanArtist(artist) {
    if (!artist) return '';
    // Take primary artist before comma, slash, or feat
    const primary = artist.split(/,|&|\/|feat\.|ft\./i)[0].trim();
    return primary || artist.trim();
}
