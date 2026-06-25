(() => {
    const fl = window.FLYING_LYRICS;

    // --- UTILS ---

    fl.extractPalette = async function (imgUrl) {
        if (!imgUrl || imgUrl === fl.lastExtractedArt) return;

        const mySessionId = fl.pipSessionId;
        fl.lastExtractedArt = imgUrl;

        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error(`Failed to load image: ${imgUrl}`));
                img.src = imgUrl;
            });

            if (mySessionId !== fl.pipSessionId) return;

            // 1. Downsample to 128x128 canvas
            const targetSize = 128;
            const canvas = document.createElement('canvas');
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, targetSize, targetSize);

            // 2. Compute 10% border metrics (12px border, 104px center box)
            const borderSize = Math.floor(targetSize * 0.10); // 12px
            const centerSize = targetSize - (borderSize * 2);  // 104px

            // A. Helper to retrieve raw pixels (minimizing getImageData calls)
            const getRawPixels = (clearCenter) => {
                if (clearCenter) {
                    ctx.clearRect(borderSize, borderSize, centerSize, centerSize);
                } else {
                    ctx.drawImage(img, 0, 0, targetSize, targetSize); // Restore center
                }
                const imgData = ctx.getImageData(0, 0, targetSize, targetSize).data;
                const pix = [];
                for (let i = 0; i < imgData.length; i += 4) {
                    const r = imgData[i];
                    const g = imgData[i + 1];
                    const b = imgData[i + 2];
                    const a = imgData[i + 3];
                    if (a >= 125) {
                        pix.push({ r, g, b });
                    }
                }
                return pix;
            };

            // B. Helper to run K-Means
            const runKMeans = (pixels) => {
                if (pixels.length === 0) return [];

                // Subsample pixels if count exceeds 2,000 to avoid blocking the JavaScript main thread.
                // 2,000 pixels is statistically more than enough to determine dominant colors accurately.
                const maxKMeansPixels = 2000;
                let samplePixels = pixels;
                if (pixels.length > maxKMeansPixels) {
                    const step = Math.ceil(pixels.length / maxKMeansPixels);
                    samplePixels = [];
                    for (let i = 0; i < pixels.length; i += step) {
                        samplePixels.push(pixels[i]);
                    }
                }

                const k = 8;
                let centroids = [];
                for (let i = 0; i < k; i++) {
                    const idx = Math.floor(samplePixels.length * (i / k));
                    centroids.push({ ...samplePixels[idx] });
                }

                for (let iter = 0; iter < 10; iter++) {
                    const buckets = Array.from({ length: k }, () => []);
                    for (const p of samplePixels) {
                        let minD = Infinity;
                        let bestIdx = 0;
                        for (let c = 0; c < k; c++) {
                            const ctr = centroids[c];
                            const dist = (p.r - ctr.r)**2 + (p.g - ctr.g)**2 + (p.b - ctr.b)**2;
                            if (dist < minD) {
                                minD = dist;
                                bestIdx = c;
                            }
                        }
                        buckets[bestIdx].push(p);
                    }

                    for (let c = 0; c < k; c++) {
                        const b = buckets[c];
                        if (b.length > 0) {
                            let sumR = 0, sumG = 0, sumB = 0;
                            for (const p of b) {
                                sumR += p.r;
                                sumG += p.g;
                                sumB += p.b;
                            }
                            centroids[c] = {
                                r: Math.round(sumR / b.length),
                                g: Math.round(sumG / b.length),
                                b: Math.round(sumB / b.length),
                                count: b.length
                            };
                        } else {
                            centroids[c] = { ...samplePixels[Math.floor(Math.random() * samplePixels.length)], count: 0 };
                        }
                    }
                }
                return centroids;
            };

            // C. Helper to score centroids
            const scoreCentroids = (centroids) => {
                let bestCentroid = null;
                let highestScore = -1;

                for (const c of centroids) {
                    if (c.count === 0) continue;
                    const hsl = fl.rgbToHsl(c.r, c.g, c.b);
                    if (hsl.l < 0.12 || hsl.l > 0.88 || hsl.s < 0.12) continue;

                    const popWeight = Math.log(1 + c.count);
                    const satWeight = hsl.s * hsl.s;
                    const lumaWeight = 1 - Math.abs(hsl.l - 0.55) * 2;
                    const score = popWeight * satWeight * lumaWeight;

                    if (score > highestScore) {
                        highestScore = score;
                        bestCentroid = c;
                    }
                }
                return bestCentroid;
            };

            let bestCentroid = null;
            let fromPass3 = false;

            // --- PASS 1 & 2: BORDER ---
            const borderPixels = getRawPixels(true); // getImageData Call 1
            
            // Pass 1: Border vibrant pixels only
            const vibrantBorderPixels = borderPixels.filter(p => {
                const hsl = fl.rgbToHsl(p.r, p.g, p.b);
                return hsl.s >= 0.15 && hsl.l >= 0.12 && hsl.l <= 0.88;
            });

            if (vibrantBorderPixels.length >= 55) {
                const centroids = runKMeans(vibrantBorderPixels);
                bestCentroid = scoreCentroids(centroids);
            }

            // Pass 2: Border all pixels fallback
            if (!bestCentroid && borderPixels.length > 0) {
                const centroids = runKMeans(borderPixels);
                bestCentroid = scoreCentroids(centroids);
            }

            // --- PASS 3 & 4: FULL IMAGE ---
            if (!bestCentroid) {
                const fullPixels = getRawPixels(false); // getImageData Call 2

                // Pass 3: Full image vibrant pixels only
                const vibrantFullPixels = fullPixels.filter(p => {
                    const hsl = fl.rgbToHsl(p.r, p.g, p.b);
                    return hsl.s >= 0.15 && hsl.l >= 0.12 && hsl.l <= 0.88;
                });

                if (vibrantFullPixels.length >= 160) {
                    const centroids = runKMeans(vibrantFullPixels);
                    bestCentroid = scoreCentroids(centroids);
                    if (bestCentroid) {
                        fromPass3 = true;
                    }
                }

                // Pass 4: Full image all pixels fallback
                if (!bestCentroid && fullPixels.length > 0) {
                    const centroids = runKMeans(fullPixels);
                    bestCentroid = scoreCentroids(centroids);

                    // Absolute fallback to largest cluster
                    if (!bestCentroid) {
                        let maxCount = -1;
                        for (const c of centroids) {
                            if (c.count > maxCount) {
                                maxCount = c.count;
                                bestCentroid = c;
                            }
                        }
                    }
                }
            }

            // 5. Hydrate the Palette
            if (bestCentroid) {
                const hsl = fl.rgbToHsl(bestCentroid.r, bestCentroid.g, bestCentroid.b);
                const satMultiplier = fromPass3 ? 1.5 : 1.0;
                const finalSat = Math.min(1.0, hsl.s * satMultiplier);

                fl.currentPalette.vibrant = fl.hslToRgb(hsl.h, Math.max(finalSat, 0.2), Math.max(hsl.l, 0.6));
                fl.currentPalette.trans = fl.hslToRgb(hsl.h, Math.max(finalSat, 0.15), Math.max(hsl.l, 0.8));
                fl.currentPalette.romaji = fl.hslToRgb((hsl.h + (30 / 360)) % 1, Math.max(finalSat, 0.2), Math.max(hsl.l, 0.8));
                fl.currentPalette.raw = fl.hslToRgb(hsl.h, finalSat, hsl.l);

                if (fl.pipWin && fl.pipWin.document) {
                    fl.pipWin.document.body.style.setProperty('--vibrant-color', fl.currentPalette.vibrant);
                    if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
                }

                chrome.storage.local.set({ currentVibrantColor: fl.currentPalette.vibrant });
            }
        } catch (e) {
            console.debug("K-Means color extraction skipped/failed.", e);
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

    fl.formatTime = function (secs) {
        if (isNaN(secs) || secs < 0) return "0:00";
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }

})();
