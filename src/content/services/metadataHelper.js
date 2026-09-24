(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — METADATA SANITIZATION & DOM EXTRACTORS
    // ─────────────────────────────────────────────────────────────────────────────

    fl.levenshtein = function (a, b) {
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
    };

    fl.titleSimilarity = function (a, b) {
        if (!a && !b) return 100;
        if (!a || !b) return 0;
        const maxLen = Math.max(a.length, b.length);
        return Math.round((1 - fl.levenshtein(a, b) / maxLen) * 100);
    };

    fl.cleanTitle = function (title) {
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

        let clean = title;
        const animeQuoteMatch = clean.match(/^[【『「《（［〔].*?[】』」》）］〕].*?[「『]([^」』]+)[」』]/);
        if (animeQuoteMatch && animeQuoteMatch[1]) {
            clean = animeQuoteMatch[1];
        }

        const bracketRegex = new RegExp(
            '\\s*[({\\[【『「《（［〔](?:[^)}\\]】』」》）］〕]*?(?:' + noiseTerms + ')[^)}\\]】』」》）］〕]*?)[)}\\]】』」》）］〕]',
            'gi'
        );
        clean = clean.replace(bracketRegex, '');
        const trailingRegex = new RegExp('\\s*-\\s*(?:' + noiseTerms + ').*$', 'gi');
        clean = clean.replace(trailingRegex, '');
        clean = clean.replace(/^[「『《〈](.+)[」』》〉]$/, '$1');
        return clean.trim();
    };

    fl.extractPrimaryArtist = function (artist) {
        if (!artist) return '';
        let primary = artist.split(/,|&|＆|、|・|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bvs\.?\b|\sx\s/i)[0].trim();
        primary = primary.replace(/\s*[（\(]CV[.:：]?[^）\)]*[）\)]/gi, '').trim();
        return primary;
    };

    fl.getCurrentTrackMetadata = function () {
        const meta = navigator.mediaSession?.metadata;
        let rawTitle = meta?.title || '';
        let rawArtist = meta?.artist || '';

        const adapter = typeof fl.getActiveAdapter === 'function' ? fl.getActiveAdapter() : null;
        if (adapter && typeof adapter.getDomMetadata === 'function') {
            const dom = adapter.getDomMetadata();
            if (dom && dom.title) {
                const isDomNonAscii = /[^\x00-\x7F]/.test(dom.title);
                const isMetaNonAscii = /[^\x00-\x7F]/.test(rawTitle);
                if (!rawTitle || (isDomNonAscii && !isMetaNonAscii) || dom.title.length > rawTitle.length) {
                    rawTitle = dom.title;
                }
            }
            if (dom && dom.artist) {
                const isDomArtistNonAscii = /[^\x00-\x7F]/.test(dom.artist);
                const isMetaArtistNonAscii = /[^\x00-\x7F]/.test(rawArtist);
                if (!rawArtist || (isDomArtistNonAscii && !isMetaArtistNonAscii)) {
                    rawArtist = dom.artist;
                }
            }
        }

        const cleanTitle = typeof fl.cleanTitle === 'function' ? fl.cleanTitle(rawTitle) : rawTitle;
        const primaryArtist = typeof fl.extractPrimaryArtist === 'function' ? fl.extractPrimaryArtist(rawArtist) : rawArtist;

        return {
            title: rawTitle,
            artist: rawArtist,
            cleanTitle,
            primaryArtist,
            rawTitle,
            rawArtist
        };
    };

})();
