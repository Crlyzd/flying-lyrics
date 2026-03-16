(() => {
    const fl = window.FLYING_LYRICS;

    // --- UTILS ---

    fl.extractPalette = async function (imgUrl) {
        if (!imgUrl || imgUrl === fl.lastExtractedArt) return;
        fl.lastExtractedArt = imgUrl;

        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error(`Image failed to load: ${imgUrl}`));
                img.src = imgUrl;
            });

            const v = new Vibrant(img, {
                colorCount: 32, // Increase for better accuracy on sparse accents
                quality: 3,
                useAlphas: false
            });
            const palette = await v.getPalette();

            // 1. Try Vibrant profile (the bright accent color like pink hair)
            let best = palette.Vibrant;

            // 2. Fallbacks: If Muted drastically outweighs Vibrant, it's likely a B&W cover. 
            // We want to avoid tiny JPEG color artifacts overriding the main vibe.
            if (palette.Muted && palette.Vibrant) {
                if (palette.Muted.population > (palette.Vibrant.population * 10)) {
                    best = palette.Muted || palette.DarkMuted;
                }
            }

            if (!best) {
                best = palette.Vibrant || palette.LightVibrant || palette.DarkVibrant || palette.Muted;
            }

            if (best) {
                const [r, g, b] = best.getRgb();
                const hsl = fl.rgbToHsl(r, g, b);

                // Lowering minimum saturation floor to 0.2 to allow realistic grey/B&W covers
                fl.currentPalette.vibrant = fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.2), Math.max(hsl.l, 0.6));
                fl.currentPalette.trans = fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.15), Math.max(hsl.l, 0.8));
                fl.currentPalette.romaji = fl.hslToRgb((hsl.h + (30 / 360)) % 1, Math.max(hsl.s, 0.2), Math.max(hsl.l, 0.8));

                if (fl.pipWin && fl.pipWin.document) {
                    fl.pipWin.document.body.style.setProperty('--vibrant-color', fl.currentPalette.vibrant);
                    // Apply background immediately — no need for the 250ms setTimeout workaround
                    if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
                }
            }
        } catch (e) {
            // Silently swallow extraction failures so they don't pollute the 
            // Chrome Extension Errors dashboard. The UI gracefully falls back 
            // to the default dark theme anyway.
            console.debug("Color extraction skipped/failed.", e);
        }
    }

    fl.rgbToHsl = function (r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    }

    fl.hslToRgb = function (h, s, l) {
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }

    // --- TEXT WRAP CACHE ---
    fl.wrapCache = new Map();

    fl.getWrapLines = function (ctx, text, maxWidth) {
        if (!text) return [];
        const key = `${text}|${maxWidth}|${ctx.font}`;
        if (fl.wrapCache.has(key)) return fl.wrapCache.get(key);

        const words = text.split(' ');
        const lines = [];
        let line = '';

        const breakWord = (word) => {
            if (line.trim().length > 0) {
                lines.push(line.trim());
                line = '';
            }
            let charLine = '';
            for (const ch of word) {
                const test = charLine + ch;
                if (ctx.measureText(test).width > maxWidth && charLine.length > 0) {
                    lines.push(charLine);
                    charLine = ch;
                } else {
                    charLine = test;
                }
            }
            line = charLine + ' ';
        };

        for (const word of words) {
            if (ctx.measureText(word).width > maxWidth) {
                breakWord(word);
                continue;
            }

            const testLine = line + word + ' ';
            if (ctx.measureText(testLine).width > maxWidth && line.trim().length > 0) {
                lines.push(line.trim());
                line = word + ' ';
            } else {
                line = testLine;
            }
        }

        if (line.trim().length > 0) lines.push(line.trim());

        // OPT-6: Prevent unbounded cache growth. With many songs, font sizes, and
        // window resizes the cache can accumulate thousands of stale entries.
        // Maps preserve insertion order, so deleting the first key evicts the oldest entry.
        if (fl.wrapCache.size >= 500) {
            fl.wrapCache.delete(fl.wrapCache.keys().next().value);
        }
        fl.wrapCache.set(key, lines);
        return lines;
    }

    fl.wrapText = function (ctx, text, x, y, maxWidth, lineHeight, growUpwards = false, doStroke = false) {
        const lines = fl.getWrapLines(ctx, text, maxWidth);
        let currentY = growUpwards ? y - ((lines.length - 1) * lineHeight) : y;

        for (let k = 0; k < lines.length; k++) {
            if (doStroke) ctx.strokeText(lines[k], x, currentY);
            ctx.fillText(lines[k], x, currentY);
            currentY += lineHeight;
        }
    }

    fl.calculateFitSize = function (ctx, text, fontTemplate, targetWidth, baseSize, minSize, maxSize) {
        if (!text || targetWidth <= 0) return baseSize;

        ctx.font = fontTemplate.replace('{SIZE}', baseSize);
        const measuredWidth = ctx.measureText(text).width;

        if (measuredWidth <= 0) return baseSize;

        const idealSize = baseSize * (targetWidth / measuredWidth);
        return Math.max(minSize, Math.min(maxSize, idealSize));
    }

    fl.parseTime = function (timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    }

})();
