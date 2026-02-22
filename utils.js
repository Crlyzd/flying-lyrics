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
        let r = 0, g = 0, b = 0, count = 0;

        // Simple dominant color sampling (filtering out extremes)
        for (let i = 0; i < data.length; i += 4) {
            const tr = data[i], tg = data[i + 1], tb = data[i + 2];
            const brightness = (tr * 299 + tg * 587 + tb * 114) / 1000;
            // Filter out very dark or very light pixels to find "color"
            if (brightness > 40 && brightness < 220) {
                r += tr; g += tg; b += tb;
                count++;
            }
        }

        if (count > 0) {
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            // Boost saturation and brightness for the "vibrant" color
            const hsl = rgbToHsl(r, g, b);
            currentPalette.vibrant = hslToRgb(hsl.h, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.6));
            currentPalette.trans = hslToRgb(hsl.h, Math.max(hsl.s, 0.4), Math.max(hsl.l, 0.8));
            // Fix: hue is 0-1, so shift by 30 degrees is 30/360. Also guarantee high lightness for readability.
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
    let line = '';
    const lines = [];

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);

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

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}
