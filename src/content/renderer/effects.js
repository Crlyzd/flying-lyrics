(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — CANVAS VISUAL EFFECTS & BACKGROUND (content script context)
    // ─────────────────────────────────────────────────────────────────────────────

    fl.drawCanvasBackground = function (w, h) {
        const isWaiting = (fl.lyricLines.length === 1 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder));
        if (!isWaiting && fl.activePipType !== 'video') return;

        if (isWaiting) {
            // Aurora Slosh: three soft radial blobs (green, blue, purple)
            const t = fl.ecoMode ? 0.5 : performance.now() * 0.0002;
            const diag = Math.sqrt(w * w + h * h);
            const blobR = diag * 0.65;

            fl.ctx.fillStyle = '#060a0f';
            fl.ctx.fillRect(0, 0, w, h);

            fl.ctx.globalCompositeOperation = 'lighter';

            const blobs = [
                { cx: w * (0.4 + 0.25 * Math.cos(t * 0.7)), cy: h * (0.35 + 0.22 * Math.sin(t * 0.5)), color: 'rgba(20, 190, 100, 0.27)' },
                { cx: w * (0.6 + 0.22 * Math.cos(t * 0.4 + 1.2)), cy: h * (0.55 + 0.28 * Math.sin(t * 0.65 + 2)), color: 'rgba(30, 80, 200, 0.20)' },
                { cx: w * (0.5 + 0.30 * Math.cos(t * 0.55 + 2.5)), cy: h * (0.45 + 0.20 * Math.sin(t * 0.45 + 1)), color: 'rgba(120, 30, 200, 0.18)' },
            ];

            for (const blob of blobs) {
                const grad = fl.ctx.createRadialGradient(blob.cx, blob.cy, 0, blob.cx, blob.cy, blobR);
                grad.addColorStop(0, blob.color);
                grad.addColorStop(0.5, blob.color.replace(/[\d.]+\)$/, '0.07)'));
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                fl.ctx.fillStyle = grad;
                fl.ctx.fillRect(0, 0, w, h);
            }

            fl.ctx.globalCompositeOperation = 'source-over';

            // Sparkles / Stars effect
            const maxSparkles = fl.ecoMode ? 8 : 25;
            if (!fl.waitingSparkles) fl.waitingSparkles = [];
            while (fl.waitingSparkles.length > maxSparkles) fl.waitingSparkles.pop();
            while (fl.waitingSparkles.length < maxSparkles) {
                const maxOpacity = (0.3 + Math.random() * 0.5) * 0.7;
                fl.waitingSparkles.push({
                    x: Math.random(),
                    y: Math.random(),
                    size: 1.5 + Math.random() * 2,
                    opacity: Math.random() * maxOpacity,
                    maxOpacity: maxOpacity,
                    speed: (0.005 + Math.random() * 0.01) / 6,
                    phase: Math.random() > 0.5 ? 'in' : 'out'
                });
            }

            for (const s of fl.waitingSparkles) {
                if (s.phase === 'in') {
                    s.opacity += s.speed;
                    if (s.opacity >= s.maxOpacity) {
                        s.opacity = s.maxOpacity;
                        s.phase = 'out';
                    }
                } else {
                    s.opacity -= s.speed;
                    if (s.opacity <= 0) {
                        s.opacity = 0;
                        s.x = Math.random();
                        s.y = Math.random();
                        s.size = 1.5 + Math.random() * 2;
                        s.maxOpacity = (0.3 + Math.random() * 0.5) * 0.7;
                        s.speed = (0.005 + Math.random() * 0.01) / 6;
                        s.phase = 'in';
                    }
                }

                const sx = s.x * w;
                const sy = s.y * h;

                fl.ctx.save();
                fl.ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity * 0.25})`;
                fl.ctx.beginPath();
                fl.ctx.arc(sx, sy, s.size * 0.95, 0, Math.PI * 2);
                fl.ctx.fill();

                fl.ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
                fl.ctx.beginPath();
                fl.ctx.arc(sx, sy, s.size * 0.4, 0, Math.PI * 2);
                fl.ctx.fill();

                fl.ctx.beginPath();
                fl.ctx.moveTo(sx - s.size * 2, sy);
                fl.ctx.lineTo(sx + s.size * 2, sy);
                fl.ctx.moveTo(sx, sy - s.size * 2);
                fl.ctx.lineTo(sx, sy + s.size * 2);
                fl.ctx.lineWidth = 0.6;
                fl.ctx.strokeStyle = `rgba(255, 255, 255, ${s.opacity * 0.5})`;
                fl.ctx.stroke();

                fl.ctx.restore();
            }

            return;
        }

        const art = typeof fl.getCoverArt === 'function' ? fl.getCoverArt() : '';

        // Manage cover art image loading
        if (art) {
            if (!fl.canvasBgImage || fl.canvasBgImageUrl !== art) {
                fl.canvasBgImageUrl = art;
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    if (fl.canvasBgImageUrl === art) {
                        fl.canvasBgImage = img;
                        fl.needsLayoutUpdate = true;
                    }
                };
                img.src = art;
            }
        } else {
            fl.canvasBgImage = null;
            fl.canvasBgImageUrl = "";
        }

        const isAlbumCoverForced = fl.isMissingLyrics || fl.albumCoverMode;
        const effectiveCoverMode = isAlbumCoverForced ? 'centered' : (fl.userCoverMode || 'fill');
        const blurPx = isAlbumCoverForced ? 0 : (fl.userBgBlur || 0);
        const effectiveDarkness = isAlbumCoverForced ? 0 : (fl.userBgDarkness || 0);

        // If Eco Mode is OFF, draw directly to the main canvas (no offscreen canvas cache)
        if (!fl.ecoMode) {
            fl.drawDirectBackground(fl.ctx, w, h, effectiveCoverMode, blurPx, effectiveDarkness);
            return;
        }

        const currentPalette = fl.currentPalette || {};
        const cacheMatches =
            fl.bgCacheCanvas &&
            fl.bgCacheW === w &&
            fl.bgCacheH === h &&
            fl.bgCacheUrl === fl.canvasBgImageUrl &&
            fl.bgCacheBlur === blurPx &&
            fl.bgCacheDarkness === effectiveDarkness &&
            fl.bgCacheMode === effectiveCoverMode &&
            fl.bgCacheVibrant === currentPalette.vibrant &&
            fl.bgCacheRaw === currentPalette.raw &&
            ((!fl.canvasBgImage) || (fl.bgCacheImgElement === fl.canvasBgImage));

        if (!cacheMatches) {
            if (!fl.bgCacheCanvas) {
                fl.bgCacheCanvas = document.createElement('canvas');
            }
            if (fl.bgCacheCanvas.width !== w) fl.bgCacheCanvas.width = w;
            if (fl.bgCacheCanvas.height !== h) fl.bgCacheCanvas.height = h;
            fl.bgCacheCtx = fl.bgCacheCanvas.getContext('2d');

            const cacheCtx = fl.bgCacheCtx;
            cacheCtx.clearRect(0, 0, w, h);

            fl.drawDirectBackground(cacheCtx, w, h, effectiveCoverMode, blurPx, effectiveDarkness);

            // Update cache parameters
            fl.bgCacheW = w;
            fl.bgCacheH = h;
            fl.bgCacheUrl = fl.canvasBgImageUrl;
            fl.bgCacheBlur = blurPx;
            fl.bgCacheDarkness = effectiveDarkness;
            fl.bgCacheMode = effectiveCoverMode;
            fl.bgCacheVibrant = currentPalette.vibrant;
            fl.bgCacheRaw = currentPalette.raw;
            fl.bgCacheImgElement = fl.canvasBgImage;
        }

        // Draw offscreen canvas
        fl.ctx.drawImage(fl.bgCacheCanvas, 0, 0);
    };

    fl.drawDirectBackground = function (ctx, w, h, effectiveCoverMode, blurPx, effectiveDarkness) {
        if (effectiveCoverMode === 'centered') {
            ctx.save();
            if (blurPx > 0) {
                ctx.filter = `blur(${blurPx}px)`;
            }

            // Draw gradient background only when palette has been extracted from actual art.
            if (fl.canvasBgImage && fl.currentPalette && fl.currentPalette.raw) {
                const rawColor = fl.currentPalette.raw;
                const baseBg = typeof fl.deriveDarkBg === 'function' ? fl.deriveDarkBg(rawColor) : rawColor;
                const topBg = typeof fl.deriveLightBg === 'function' ? fl.deriveLightBg(rawColor) : rawColor;
                const grad = ctx.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, topBg);
                grad.addColorStop(1, baseBg);
                ctx.fillStyle = grad;
                ctx.fillRect(-blurPx * 2, -blurPx * 2, w + blurPx * 4, h + blurPx * 4);
            } else {
                ctx.fillStyle = '#121212';
                ctx.fillRect(-blurPx * 2, -blurPx * 2, w + blurPx * 4, h + blurPx * 4);
            }

            // Draw centered art with drop shadow and rounded corners
            if (fl.canvasBgImage) {
                const size = Math.min(w, h) * 0.65;
                const cx = (w - size) / 2;
                const cy = (h - size) / 2;
                const vmin = Math.min(w, h) / 100;
                const cornerRadius = vmin * 4.5;

                // 1. Draw the drop shadow using a filled rounded rectangle only when unblurred
                if (blurPx === 0) {
                    ctx.save();
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
                    ctx.shadowBlur = vmin * 6;
                    ctx.shadowOffsetY = 0;
                    ctx.fillStyle = '#000000';
                    ctx.beginPath();
                    ctx.roundRect(cx, cy, size, size, cornerRadius);
                    ctx.fill();
                    ctx.restore();
                }

                // 2. Draw the album cover image with rounded corners
                ctx.save();
                if (blurPx === 0) {
                    ctx.beginPath();
                    ctx.roundRect(cx, cy, size, size, cornerRadius);
                    ctx.clip();
                    ctx.drawImage(fl.canvasBgImage, cx, cy, size, size);
                } else {
                    // Pre-render rounded corners to offscreen canvas so blur diffuses the curved contour
                    if (!fl.tempArtCanvas) {
                        fl.tempArtCanvas = document.createElement('canvas');
                    }
                    const offCanvas = fl.tempArtCanvas;
                    const dim = Math.ceil(size);
                    if (offCanvas.width !== dim || offCanvas.height !== dim) {
                        offCanvas.width = dim;
                        offCanvas.height = dim;
                    }
                    const offCtx = offCanvas.getContext('2d');
                    offCtx.clearRect(0, 0, dim, dim);
                    offCtx.beginPath();
                    offCtx.roundRect(0, 0, size, size, cornerRadius);
                    offCtx.clip();
                    offCtx.drawImage(fl.canvasBgImage, 0, 0, size, size);

                    // Draw rounded card into main canvas with an identical centered ambient elevation shadow
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
                    ctx.shadowBlur = vmin * 6;
                    ctx.shadowOffsetY = 0;
                    ctx.drawImage(offCanvas, cx, cy, size, size);
                }
                ctx.restore();
            }
            ctx.restore();
        } else {
            // Fill or Repeated cover mode
            if (fl.canvasBgImage) {
                ctx.save();
                if (blurPx > 0) {
                    ctx.filter = `blur(${blurPx}px)`;
                }

                if (effectiveCoverMode === 'repeated') {
                    // Create repeated pattern
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = 400;
                    tempCanvas.height = 400;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.drawImage(fl.canvasBgImage, 0, 0, 400, 400);
                    const pattern = ctx.createPattern(tempCanvas, 'repeat');
                    ctx.fillStyle = pattern;
                    ctx.fillRect(-blurPx * 2, -blurPx * 2, w + blurPx * 4, h + blurPx * 4);
                } else {
                    // Fill / Cover mode
                    const imgW = fl.canvasBgImage.naturalWidth || fl.canvasBgImage.width;
                    const imgH = fl.canvasBgImage.naturalHeight || fl.canvasBgImage.height;
                    const scale = Math.max(w / imgW, h / imgH);
                    const drawW = imgW * scale;
                    const drawH = imgH * scale;
                    const drawX = (w - drawW) / 2;
                    const drawY = (h - drawH) / 2;
                    ctx.drawImage(fl.canvasBgImage, drawX - blurPx * 2, drawY - blurPx * 2, drawW + blurPx * 4, drawH + blurPx * 4);
                }
                ctx.restore();
            } else {
                ctx.fillStyle = '#121212';
                ctx.fillRect(0, 0, w, h);
            }
        }

        // Draw darkness overlay
        if (effectiveDarkness > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${effectiveDarkness / 100})`;
            ctx.fillRect(0, 0, w, h);
        }
    };

})();
