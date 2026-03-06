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
                img.onerror = reject;
                img.src = imgUrl;
            });

            const canvas_element = document.createElement('canvas');
            const context = canvas_element.getContext('2d');
            canvas_element.width = 100; // Increased sample size for better coverage
            canvas_element.height = 100;
            context.drawImage(img, 0, 0, 100, 100);

            const data = context.getImageData(0, 0, 100, 100).data;

            // --- HSL-based weighted bucketing for dominant color ---
            const buckets = {}; // key: "hueBucket" -> { r, g, b, weight, count }

            for (let i = 0; i < data.length; i += 32) {
                const tr = data[i], tg = data[i + 1], tb = data[i + 2];

                if ((tr > 245 && tg > 245 && tb > 245) || (tr < 10 && tg < 10 && tb < 10)) {
                    continue;
                }

                const hsl = fl.rgbToHsl(tr, tg, tb);

                const lightnessArc = 1 - Math.abs(hsl.l - 0.5) * 2;
                const score = (hsl.s * 3) + lightnessArc;

                let key = -1;
                if (hsl.s > 0.15) {
                    key = Math.floor(hsl.h * 36);
                }

                if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, weight: 0, count: 0 };
                buckets[key].r += tr;
                buckets[key].g += tg;
                buckets[key].b += tb;
                buckets[key].weight += score;
                buckets[key].count++;
            }

            let best = null;
            for (const key in buckets) {
                if (!best || buckets[key].weight > best.weight) {
                    best = buckets[key];
                }
            }

            if (!best || best.count === 0) {
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
                }
                if (count > 0) best = { r, g, b, count };
            }

            if (best && best.count > 0) {
                const r = Math.floor(best.r / best.count);
                const g = Math.floor(best.g / best.count);
                const b = Math.floor(best.b / best.count);

                const hsl = fl.rgbToHsl(r, g, b);
                fl.currentPalette.vibrant = fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.6));
                fl.currentPalette.trans = fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.4), Math.max(hsl.l, 0.8));
                fl.currentPalette.romaji = fl.hslToRgb((hsl.h + (30 / 360)) % 1, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.8));

                if (fl.pipWin && fl.pipWin.document) {
                    fl.pipWin.document.body.style.setProperty('--vibrant-color', fl.currentPalette.vibrant);
                }
            }
        } catch (e) {
            console.warn("Color extraction failed:", e);
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
