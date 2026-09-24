/**
 * Transliteration & Romanization module for benchmark runner.
 * 100% parity with Flying Lyrics extension (src/background/romanizer.js).
 */

const HIRA_TO_ROMAJI = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'wo', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'де': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo'
};

export function kanaToRomaji(text) {
    if (!text) return '';
    let src = text.replace(/[\u30a1-\u30f6]/g, match =>
        String.fromCharCode(match.charCodeAt(0) - 0x60)
    );

    let result = '';
    let i = 0;
    while (i < src.length) {
        if (i + 1 < src.length) {
            const combo = src.substring(i, i + 2);
            if (HIRA_TO_ROMAJI[combo]) {
                result += HIRA_TO_ROMAJI[combo];
                i += 2;
                continue;
            }
        }

        const char = src[i];
        if (char === 'っ' || char === 'ッ') {
            if (i + 1 < src.length) {
                let nextRomaji = '';
                if (i + 2 < src.length) {
                    const nextCombo = src.substring(i + 1, i + 3);
                    if (HIRA_TO_ROMAJI[nextCombo]) nextRomaji = HIRA_TO_ROMAJI[nextCombo];
                }
                if (!nextRomaji) {
                    const nextChar = src[i + 1];
                    nextRomaji = HIRA_TO_ROMAJI[nextChar] || '';
                }
                if (nextRomaji && nextRomaji.length > 0) {
                    result += nextRomaji[0];
                }
            }
            i++;
        } else if (char === 'ー') {
            i++;
        } else if (HIRA_TO_ROMAJI[char]) {
            result += HIRA_TO_ROMAJI[char];
            i++;
        } else {
            result += char;
            i++;
        }
    }
    return result;
}

const HANGUL_LEADS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const HANGUL_VOWELS = ["a", "ae", "ya", "yae", "eo", "e", "ye", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const HANGUL_TAILS = ["", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg", "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s", "ss", "ng", "j", "ch", "k", "t", "p", "h"];

export function hangulToRomaji(text) {
    if (!text) return '';
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code >= 0xAC00 && code <= 0xD7A3) {
            const sIndex = code - 0xAC00;
            const lead = HANGUL_LEADS[Math.floor(sIndex / 588)];
            const vowel = HANGUL_VOWELS[Math.floor((sIndex % 588) / 28)];
            const tail = HANGUL_TAILS[sIndex % 28];
            result += lead + vowel + tail;
        } else {
            result += text[i];
        }
    }
    return result;
}

export function isNonAscii(text) {
    return /[^\x00-\x7F]/.test(text);
}

export function stripDiacritics(text) {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function extractTitleAliases(title) {
    if (!title) return [];
    const aliases = [];
    const match = title.match(/^(.+?)\s*[([\\[【『「《（［〔]([^)\]】』」》）］〕]+)[)\]】』」》）］〕]\s*$/);
    if (match) {
        const part1 = match[1].trim();
        const part2 = match[2].trim();
        if (part1) aliases.push(part1);
        if (part2) aliases.push(part2);
    }
    return aliases;
}

export function romanize(text) {
    if (!text) return '';
    let result = text;
    result = kanaToRomaji(result);
    result = hangulToRomaji(result);
    return stripDiacritics(result);
}

const transliterationCache = new Map();

export async function fetchRomanizedMetadata(text, timeoutMs = 2000) {
    if (!text || !isNonAscii(text)) return text || '';
    const key = text.trim().toLowerCase();
    if (transliterationCache.has(key)) {
        return transliterationCache.get(key);
    }

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (res && res.ok) {
            const data = await res.json();
            let romanizedText = '';
            if (Array.isArray(data?.[0])) {
                romanizedText = data[0].map(x => (Array.isArray(x) && x[3]) ? x[3] : (x?.[0] || '')).join('').trim();
            }
            if (romanizedText) {
                const cleaned = stripDiacritics(romanizedText).trim();
                transliterationCache.set(key, cleaned);
                return cleaned;
            }
        }
    } catch {}

    try {
        const fallbackUrl = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
        const res2 = await fetch(fallbackUrl, { signal: AbortSignal.timeout(timeoutMs) });
        if (res2 && res2.ok) {
            const data2 = await res2.json();
            let romanizedText2 = '';
            if (Array.isArray(data2?.[0])) {
                romanizedText2 = data2[0].map(x => (Array.isArray(x) && x[3]) ? x[3] : (x?.[0] || '')).join('').trim();
            }
            if (romanizedText2) {
                const cleaned2 = stripDiacritics(romanizedText2).trim();
                transliterationCache.set(key, cleaned2);
                return cleaned2;
            }
        }
    } catch {}

    const fallback = romanize(text);
    transliterationCache.set(key, fallback);
    return fallback;
}
