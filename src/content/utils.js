// --- UTILS ---

async function extractPalette(imgUrl) {
    if (!imgUrl || imgUrl === lastExtractedArt) return;
    lastExtractedArt = imgUrl;

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
        canvas_element.width = 50; // Small for performance
        canvas_element.height = 50;
        context.drawImage(img, 0, 0, 50, 50);

        const data = context.getImageData(0, 0, 50, 50).data;

        // --- Histogram bucketing for dominant color ---
        // Quantize each pixel into coarse RGB buckets (step = 32 → 8 levels per channel)
        // then pick the bucket with the most pixels.
        const STEP = 32;
        const buckets = {};   // key: "qR,qG,qB" → { r, g, b, count }

        for (let i = 0; i < data.length; i += 4) {
            const tr = data[i], tg = data[i + 1], tb = data[i + 2];
            const brightness = (tr * 299 + tg * 587 + tb * 114) / 1000;

            // Skip very dark / very light pixels (backgrounds, highlights)
            if (brightness <= 40 || brightness >= 220) continue;

            // Also skip low-saturation (gray) pixels — they dilute the dominant hue
            const maxC = Math.max(tr, tg, tb), minC = Math.min(tr, tg, tb);
            if (maxC - minC < 30) continue; // near-gray → skip

            const qR = Math.floor(tr / STEP) * STEP;
            const qG = Math.floor(tg / STEP) * STEP;
            const qB = Math.floor(tb / STEP) * STEP;
            const key = `${qR},${qG},${qB}`;

            if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
            buckets[key].r += tr;
            buckets[key].g += tg;
            buckets[key].b += tb;
            buckets[key].count++;
        }

        // Find the bucket with the highest pixel count
        let best = null;
        for (const key in buckets) {
            if (!best || buckets[key].count > best.count) {
                best = buckets[key];
            }
        }

        // Fallback: if no colorful bucket found, use simple average
        if (!best || best.count === 0) {
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
            }
            if (count > 0) best = { r, g, b, count };
        }

        if (best && best.count > 0) {
            // Average the actual pixel colors inside the winning bucket for accuracy
            const r = Math.floor(best.r / best.count);
            const g = Math.floor(best.g / best.count);
            const b = Math.floor(best.b / best.count);

            // Boost saturation and brightness for the "vibrant" color
            const hsl = rgbToHsl(r, g, b);
            currentPalette.vibrant = hslToRgb(hsl.h, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.6));
            currentPalette.trans = hslToRgb(hsl.h, Math.max(hsl.s, 0.4), Math.max(hsl.l, 0.8));
            currentPalette.romaji = hslToRgb((hsl.h + (30 / 360)) % 1, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.8));

            // Set CSS custom properties for UI controls
            if (pipWin && pipWin.document) {
                pipWin.document.body.style.setProperty('--vibrant-color', currentPalette.vibrant);
            }
        }
    } catch (e) {
        console.warn("Color extraction failed:", e);
    }
}

function rgbToHsl(r, g, b) {
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

function hslToRgb(h, s, l) {
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
// Keyed by text + maxWidth + font to avoid redundant measureText calls on every frame.
const wrapCache = new Map();

function getWrapLines(ctx, text, maxWidth) {
    if (!text) return [];
    const key = `${text}|${maxWidth}|${ctx.font}`;
    if (wrapCache.has(key)) return wrapCache.get(key);

    const words = text.split(' ');
    const lines = [];
    let line = '';

    /**
     * Helper: break a single word wider than maxWidth into character-by-character
     * segments that each fit within maxWidth, flushing the current `line` buffer first.
     */
    const breakWord = (word) => {
        // Flush any existing line buffer before the oversized word
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
        // Remainder of the broken word becomes the start of the next line
        line = charLine + ' ';
    };

    for (const word of words) {
        // First, check if the word itself exceeds the max width - regardless of position
        if (ctx.measureText(word).width > maxWidth) {
            breakWord(word);
            continue;
        }

        // Standard word-wrap: check if appending this word overflows
        const testLine = line + word + ' ';
        if (ctx.measureText(testLine).width > maxWidth && line.trim().length > 0) {
            lines.push(line.trim());
            line = word + ' ';
        } else {
            line = testLine;
        }
    }

    if (line.trim().length > 0) lines.push(line.trim());

    wrapCache.set(key, lines);
    return lines;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, growUpwards = false) {
    const lines = getWrapLines(ctx, text, maxWidth);
    let currentY = growUpwards ? y - ((lines.length - 1) * lineHeight) : y;

    for (let k = 0; k < lines.length; k++) {
        ctx.fillText(lines[k], x, currentY);
        currentY += lineHeight;
    }
}

/**
 * Calculates an ideal font size for a text to fill the available width.
 *
 * The strategy:
 *  1. Measure the text at `baseSize`.
 *  2. Scale proportionally so it would fill `targetWidth`.
 *  3. Clamp the result between `minSize` and `maxSize`.
 *
 * Only call this during layout invalidation (not every frame) — it uses
 * ctx.measureText which is fast but not free.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string}  text         - The text to measure
 * @param {string}  fontTemplate - A CSS font string with a placeholder, e.g. "700 {SIZE}px Noto Sans"
 * @param {number}  targetWidth  - The width we want the text to fill (e.g. maxWidth)
 * @param {number}  baseSize     - The fallback/starting size in px
 * @param {number}  minSize      - The minimum allowed size in px
 * @param {number}  maxSize      - The maximum allowed size in px
 * @returns {number} The clamped ideal font size in px
 */
function calculateFitSize(ctx, text, fontTemplate, targetWidth, baseSize, minSize, maxSize) {
    if (!text || targetWidth <= 0) return baseSize;

    ctx.font = fontTemplate.replace('{SIZE}', baseSize);
    const measuredWidth = ctx.measureText(text).width;

    if (measuredWidth <= 0) return baseSize;

    const idealSize = baseSize * (targetWidth / measuredWidth);
    return Math.max(minSize, Math.min(maxSize, idealSize));
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}
