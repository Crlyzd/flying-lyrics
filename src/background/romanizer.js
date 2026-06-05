// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — TRANSLITERATION / ROMANIZATION UTILITY
//
//  Provides offline transliteration helpers for matching titles and artists
//  across different scripts (Japanese Kana, Korean Hangul) in the search engine.
// ─────────────────────────────────────────────────────────────────────────────

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
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    
    // Combos
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

function kanaToRomaji(text) {
    if (!text) return '';
    // Convert Katakana to Hiragana first by shifting codepoints by 0x60
    let src = text.replace(/[\u30a1-\u30f6]/g, (match) => {
        return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });

    let result = '';
    let i = 0;
    while (i < src.length) {
        // Check for 2-character combo (e.g. きゃ)
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
            // Double consonant (sokuon)
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
            // Extend previous vowel (ignore in phonetic matching)
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

// Korean Hangul Unicode Jamo decomposition mappings
const HANGUL_LEADS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const HANGUL_VOWELS = ["a", "ae", "ya", "yae", "eo", "e", "ye", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const HANGUL_TAILS = ["", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg", "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s", "ss", "ng", "j", "ch", "k", "t", "p", "h"];

function hangulToRomaji(text) {
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

/**
 * Helper to check if a string contains any non-ASCII characters (e.g. CJK/Cyrillic scripts)
 */
function isNonAscii(text) {
    return /[^\x00-\x7F]/.test(text);
}

/**
 * Unified romanize function.
 * Converts Japanese Kana and Korean Hangul phonetically into Latin character counterparts.
 */
function romanize(text) {
    if (!text) return '';
    let result = text;
    result = kanaToRomaji(result);
    result = hangulToRomaji(result);
    return result;
}
