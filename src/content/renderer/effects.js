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

        if (art) {
            if (!fl.canvasBgImage || fl.canvasBgImageUrl !== art) {
                fl.canvasBgImageUrl = art;
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    fl.canvasBgImage = img;
                    fl.needsLayoutUpdate = true;
                };
                img.src = art;
            }
        } else {
            fl.canvasBgImage = null;
            fl.canvasBgImageUrl = "";
        }

        const effectiveCoverMode = fl.isMissingLyrics ? 'contain' : fl.userCoverMode;
        const effectiveDarkness = fl.isMissingLyrics ? 0.35 : fl.userCoverDarkness;
        const blurPx = fl.isMissingLyrics ? 0 : Math.round(w * (fl.userCoverBlur / 100));

        // Offscreen cache hit check
        if (
            fl.bgCacheCanvas &&
            fl.bgCacheW === w &&
            fl.bgCacheH === h &&
            fl.bgCacheUrl === fl.canvasBgImageUrl &&
            fl.bgCacheBlur === blurPx &&
            fl.bgCacheDarkness === effectiveDarkness &&
            fl.bgCacheMode === effectiveCoverMode &&
            fl.bgCacheVibrant === fl.currentPalette.vibrant &&
            fl.bgCacheRaw === fl.currentPalette.raw
        ) {
            fl.ctx.drawImage(fl.bgCacheCanvas, 0, 0);
            return;
        }

        if (!fl.bgCacheCanvas) {
            fl.bgCacheCanvas = document.createElement('canvas');
        }
        if (fl.bgCacheCanvas.width !== w || fl.bgCacheCanvas.height !== h) {
            fl.bgCacheCanvas.width = w;
            fl.bgCacheCanvas.height = h;
            fl.bgCacheCtx = fl.bgCacheCanvas.getContext('2d');
        }

        fl.drawDirectBackground(fl.bgCacheCtx, w, h, effectiveCoverMode, blurPx, effectiveDarkness);

        fl.bgCacheW = w;
        fl.bgCacheH = h;
        fl.bgCacheUrl = fl.canvasBgImageUrl;
        fl.bgCacheBlur = blurPx;
        fl.bgCacheDarkness = effectiveDarkness;
        fl.bgCacheMode = effectiveCoverMode;
        fl.bgCacheVibrant = fl.currentPalette.vibrant;
        fl.bgCacheRaw = fl.currentPalette.raw;
        fl.bgCacheImgElement = fl.canvasBgImage;

        fl.ctx.drawImage(fl.bgCacheCanvas, 0, 0);
    };

    fl.drawDirectBackground = function (ctx, w, h, effectiveCoverMode, blurPx, effectiveDarkness) {
        ctx.clearRect(0, 0, w, h);

        if (fl.canvasBgImage && fl.canvasBgImage.complete && fl.canvasBgImage.naturalWidth > 0) {
            const img = fl.canvasBgImage;
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;

            if (effectiveCoverMode === 'crop') {
                const scale = Math.max(w / iw, h / ih);
                const sw = w / scale;
                const sh = h / scale;
                const sx = (iw - sw) / 2;
                const sy = (ih - sh) / 2;

                ctx.save();
                if (blurPx > 0) {
                    ctx.filter = `blur(${blurPx}px)`;
                    const bleed = blurPx * 2;
                    ctx.drawImage(img, sx, sy, sw, sh, -bleed, -bleed, w + bleed * 2, h + bleed * 2);
                } else {
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
                }
                ctx.restore();
            } else if (effectiveCoverMode === 'contain') {
                ctx.save();
                const bgScale = Math.max(w / iw, h / ih);
                const bgSw = w / bgScale;
                const bgSh = h / bgScale;
                const bgSx = (iw - bgSw) / 2;
                const bgSy = (ih - bgSh) / 2;

                ctx.filter = 'blur(20px)';
                ctx.drawImage(img, bgSx, bgSy, bgSw, bgSh, -40, -40, w + 80, h + 80);
                ctx.restore();

                const fgScale = Math.min(w / iw, h / ih) * 0.85;
                const fgDw = iw * fgScale;
                const fgDh = ih * fgScale;
                const fgDx = (w - fgDw) / 2;
                const fgDy = (h - fgDh) / 2;

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = 30;
                ctx.drawImage(img, 0, 0, iw, ih, fgDx, fgDy, fgDw, fgDh);
                ctx.restore();
            }

            if (effectiveDarkness > 0) {
                ctx.fillStyle = `rgba(0, 0, 0, ${effectiveDarkness})`;
                ctx.fillRect(0, 0, w, h);
            }
        } else {
            const vibrantColor = fl.currentPalette.vibrant || 'rgba(30, 30, 40, 0.9)';
            const rawColor = fl.currentPalette.raw || 'rgba(10, 10, 15, 0.95)';

            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, vibrantColor);
            grad.addColorStop(1, rawColor);

            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            if (effectiveDarkness > 0) {
                ctx.fillStyle = `rgba(0, 0, 0, ${effectiveDarkness})`;
                ctx.fillRect(0, 0, w, h);
            }
        }
    };

})();
