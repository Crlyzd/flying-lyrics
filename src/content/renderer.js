(() => {
    const fl = window.FLYING_LYRICS;

    // --- RENDERER ---

    // Layout cache state — tracks what we last computed so we can skip redundant math
    fl.lastW = -1;
    fl.lastH = -1;     // Last known PiP window dimensions (-1 forces first-frame resize)
    fl.lastActiveIdx = -1;          // Last active lyric line index
    fl.lastLyricsLen = 0;           // Last known lyric count
    fl.needsLayoutUpdate = true;    // Dirty flag (true on first run)
    fl.cachedLayout = [];           // Pre-computed {y, mainSize} for each lyric line

    // OPT-4: Cached PiP DOM element references (populated by injectStructure via _refreshEls).
    // Avoids getElementById on every frame once the PiP structure is stable.
    fl._els = null;

    fl._refreshEls = function () {
        if (!fl.pipWin) { fl._els = null; return; }
        const doc = fl.pipWin.document;
        fl._els = {
            bgCover: doc.getElementById('bg-cover'),
            seeker: doc.getElementById('seeker-bar'),
            seekerContainer: doc.getElementById('seeker-container'),
            ppBtn: doc.getElementById('playpause'),
            muteBtn: doc.getElementById('mute-btn'),
        };
    };

    const EMPTY_STATE_TEXTS = [
        // Category 1: User Stats
        { type: "stat", key: "totalSynced", template: "You've synced {val} tracks so far. Nice." },
        { type: "stat", key: "dailyStreak", template: "Current streak: {val} days of good music." },
        { type: "stat", key: "totalSynced", template: "{val} songs and counting..." },
        { type: "stat", key: "hoursListening", template: "You've spent {val} hours reading lyrics." },
        { type: "stat", key: "favoriteTime", template: "Fun fact: your most active time is {val}." },
        
        // Category 2: Funny Memes & Text
        { type: "meme", text: "Waiting for the beat to drop..." },
        { type: "meme", text: "Tuning the digital piano..." },
        { type: "meme", text: "Checking if the aux cord is plugged in..." },
        { type: "meme", text: "Pigeons can recognize good music. Can you?" },
        { type: "meme", text: "Loading the next banger..." },
        { type: "meme", text: "Are you going to play something or just stare at me?" },
        { type: "meme", text: "Polishing the vinyl..." },
        { type: "meme", text: "Warming up the vocal cords..." },
        { type: "meme", text: "Searching the multiverse for lyrics..." },
        { type: "meme", text: "Did you forget to press play?" },
        { type: "meme", text: "Mic check, one two, one two..." },
        { type: "meme", text: "The silence is deafening." },
        { type: "meme", text: "Vibing in the void..." },
        { type: "meme", text: "Even silence has a rhythm..." },
        { type: "meme", text: "Summoning the music gods..." },
        { type: "meme", text: "Is this John Cage's 4'33\"?" },
        { type: "meme", text: "Brewing some lo-fi beats..." },
        { type: "meme", text: "Untangling the headphone wires..." },
        { type: "meme", text: "Blowing dust off the cartridge..." },
        { type: "meme", text: "Waiting for the DJ to show up..." },
        { type: "meme", text: "Looking for the play button..." },
        { type: "meme", text: "Translating silence into Japanese..." },
        { type: "meme", text: "Connecting to the music matrix..." },
        { type: "meme", text: "Charging the flux capacitor..." },
        { type: "meme", text: "Still waiting..." }
    ];

    function resolveStatText(item) {
        if (!fl.userStats) return null;
        if (item.key === "totalSynced") {
            const val = fl.userStats.totalSynced || 0;
            if (val === 0) return null;
            return item.template.replace("{val}", val);
        }
        if (item.key === "dailyStreak") {
            const val = fl.userStats.dailyStreak || 0;
            if (val === 0) return null;
            return item.template.replace("{val}", val);
        }
        if (item.key === "hoursListening") {
            const val = fl.userStats.hoursListening || 0;
            const formatted = val.toFixed(1);
            if (parseFloat(formatted) === 0) return null;
            return item.template.replace("{val}", formatted);
        }
        if (item.key === "favoriteTime") {
            const counts = fl.userStats.timeOfDayCounts || {};
            let maxCount = 0;
            let favPeriod = "";
            for (let p in counts) {
                if (counts[p] > maxCount) {
                    maxCount = counts[p];
                    favPeriod = p;
                }
            }
            if (maxCount === 0 || !favPeriod) return null;
            return item.template.replace("{val}", favPeriod);
        }
        return null;
    }

    function getResolvedText(idx) {
        const item = EMPTY_STATE_TEXTS[idx];
        if (item.type === "stat") {
            const resolved = resolveStatText(item);
            if (resolved !== null) return resolved;
            
            const memeIndex = (idx * 7) % 25;
            return EMPTY_STATE_TEXTS[5 + memeIndex].text;
        }
        return item.text;
    }

    fl.drawWaitingState = function (w, h, vmin, maxWidth, anchorOffset) {
        const cycleTimeMs = 30000;
        const totalMs = performance.now();
        const cycleIndex = Math.floor(totalMs / cycleTimeMs);
        const currentTextIndex = cycleIndex % EMPTY_STATE_TEXTS.length;
        const nextTextIndex = (cycleIndex + 1) % EMPTY_STATE_TEXTS.length;
        
        const timeInCycle = totalMs % cycleTimeMs;
        const transitionMs = 600;
        
        const currentString = getResolvedText(currentTextIndex);
        const nextString = getResolvedText(nextTextIndex);
        
        // Trigger layout update on text index switch to update lyricLines[0] wrapping
        if (fl.lastEmptyStateIndex !== currentTextIndex) {
            fl.lastEmptyStateIndex = currentTextIndex;
            if (fl.lyricLines && fl.lyricLines[0]) {
                fl.lyricLines[0].text = currentString;
                fl.lyricLines[0].isWaitingPlaceholder = true;
            }
            fl.needsLayoutUpdate = true;
        }
        
        const timeSec = totalMs / 1000;
        const tColor = (Math.sin(timeSec * 0.4) + 1) / 2;
        const r = Math.round(140 + (240 - 140) * tColor);
        const g = Math.round(215 + (155 - 215) * tColor);
        const b = Math.round(160 + (190 - 160) * tColor);
        const activeColor = `rgb(${r}, ${g}, ${b})`;
        
        // Sync button colors
        const uiContainer = fl._els?.seekerContainer?.parentElement;
        if (uiContainer) {
            uiContainer.style.setProperty('--vibrant-color', activeColor);
        }
        
        const displayFontFamily = "'Noto Sans', 'Segoe UI', sans-serif";
        const mainSize = vmin * 6.5;
        const lineHeight = mainSize * 1.45; // relaxed line spacing
        
        const y = 0;
        const drawX = 0;
        
        fl.ctx.save();
        fl.ctx.shadowColor = activeColor;
        fl.ctx.shadowBlur = 15;
        fl.ctx.font = `700 ${mainSize}px ${displayFontFamily}`;
        fl.ctx.fillStyle = "#FFFFFF";
        fl.ctx.textAlign = 'center';
        
        if (timeInCycle > cycleTimeMs - transitionMs) {
            const progress = (timeInCycle - (cycleTimeMs - transitionMs)) / transitionMs;
            
            // Draw current text fading out
            fl.ctx.save();
            fl.ctx.globalAlpha = 1.0 - progress;
            const currentLines = fl.getWrapLines(fl.ctx, currentString, maxWidth);
            const currentY = y - ((currentLines.length - 1) * lineHeight) / 2;
            fl.wrapText(fl.ctx, currentString, drawX, currentY, maxWidth, lineHeight, false, false);
            fl.ctx.restore();
            
            // Draw next text fading in
            fl.ctx.save();
            fl.ctx.globalAlpha = progress;
            const nextLines = fl.getWrapLines(fl.ctx, nextString, maxWidth);
            const nextY = y - ((nextLines.length - 1) * lineHeight) / 2;
            fl.wrapText(fl.ctx, nextString, drawX, nextY, maxWidth, lineHeight, false, false);
            fl.ctx.restore();
        } else {
            const currentLines = fl.getWrapLines(fl.ctx, currentString, maxWidth);
            const currentY = y - ((currentLines.length - 1) * lineHeight) / 2;
            fl.wrapText(fl.ctx, currentString, drawX, currentY, maxWidth, lineHeight, false, false);
        }
        fl.ctx.restore();
        
        // Draw Wide Equalizer at the bottom (growing downwards)
        const barCount = 35;
        const totalW = maxWidth * 0.65;
        const barW = (totalW / barCount) * 0.7;
        const barGap = (totalW / barCount) * 0.3;
        const startX = -(totalW / 2) + (barW / 2);
        
        fl.ctx.font = `700 ${mainSize}px ${displayFontFamily}`;
        const currentLinesCount = fl.getWrapLines(fl.ctx, currentString, maxWidth).length;
        const nextLinesCount = fl.getWrapLines(fl.ctx, nextString, maxWidth).length;
        const maxLines = Math.max(currentLinesCount, nextLinesCount);
        const textHeightOffset = (maxLines - 1) * lineHeight;
        
        const eqY = y + (mainSize * 1.5) + textHeightOffset; // pushed down for relaxed breathing room
        
        fl.ctx.save();
        const grad = fl.ctx.createLinearGradient(0, eqY, 0, eqY + mainSize * 1.2);
        grad.addColorStop(0, activeColor);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
        fl.ctx.fillStyle = grad;
        fl.ctx.shadowColor = activeColor;
        fl.ctx.shadowBlur = 10;
        
        for (let b = 0; b < barCount; b++) {
            const distFromCenter = Math.abs(b - (barCount - 1) / 2) / ((barCount - 1) / 2);
            const bellFactor = Math.exp(-3 * distFromCenter * distFromCenter);
            
            const speed = 3.5;
            const timeScale = timeSec * speed;
            const noise = 0.3 * Math.sin(timeScale + b * 0.4) +
                          0.4 * Math.sin(timeScale * 1.6 - b * 0.25) +
                          0.3 * Math.sin(timeScale * 2.2 + b * 0.7);
            
            const maxH = mainSize * 1.1 * bellFactor;
            const barH = Math.max(mainSize * 0.15, maxH * (0.35 + 0.65 * noise));
            
            fl.ctx.fillRect(startX + b * (barW + barGap) - barW / 2, eqY, barW, barH);
        }
        fl.ctx.restore();
    };

    fl.drawCanvasBackground = function (w, h) {
        if (fl.activePipType !== 'video') return;

        const art = fl.getCoverArt();

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
        const effectiveCoverMode = isAlbumCoverForced ? 'centered' : fl.userCoverMode;
        const blurPx = isAlbumCoverForced ? 0 : fl.userBgBlur;
        const effectiveDarkness = isAlbumCoverForced ? 0 : fl.userBgDarkness;

        if (effectiveCoverMode === 'centered') {
            // Draw gradient background only when palette has been extracted from actual art.
            // fl.currentPalette.raw is set by extractPalette() in rgb() format — safe for deriveDarkBg.
            // The default fl.currentPalette.vibrant is a hex string (#1DB954) which the
            // /\d+/g regex in deriveDarkBg misparses, producing near-black colours.
            if (fl.canvasBgImage && fl.currentPalette && fl.currentPalette.raw) {
                const rawColor = fl.currentPalette.raw;
                const baseBg = fl.deriveDarkBg(rawColor);
                const topBg = fl.deriveLightBg(rawColor);
                const grad = fl.ctx.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, topBg);
                grad.addColorStop(1, baseBg);
                fl.ctx.fillStyle = grad;
                fl.ctx.fillRect(0, 0, w, h);
            } else {
                fl.ctx.fillStyle = '#121212';
                fl.ctx.fillRect(0, 0, w, h);
            }

            // Draw centered art with drop shadow
            if (fl.canvasBgImage) {
                fl.ctx.save();
                const size = Math.min(w, h) * 0.65;
                const x = (w - size) / 2;
                const y = (h - size) / 2;
                const vmin = Math.min(w, h) / 100;
                fl.ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
                fl.ctx.shadowBlur = vmin * 8;
                fl.ctx.shadowOffsetY = vmin * 2;
                fl.ctx.drawImage(fl.canvasBgImage, x, y, size, size);
                fl.ctx.restore();
            }
        } else {
            // Fill or Repeated cover mode
            if (fl.canvasBgImage) {
                fl.ctx.save();
                if (blurPx > 0) {
                    fl.ctx.filter = `blur(${blurPx}px)`;
                }

                if (effectiveCoverMode === 'repeated') {
                    // Create repeated pattern
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = 400;
                    tempCanvas.height = 400;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.drawImage(fl.canvasBgImage, 0, 0, 400, 400);
                    const pattern = fl.ctx.createPattern(tempCanvas, 'repeat');
                    fl.ctx.fillStyle = pattern;
                    // Extra margin to hide blur border artifacts
                    fl.ctx.fillRect(-blurPx * 2, -blurPx * 2, w + blurPx * 4, h + blurPx * 4);
                } else {
                    // Fill / Cover mode
                    const imgW = fl.canvasBgImage.width;
                    const imgH = fl.canvasBgImage.height;
                    const scale = Math.max(w / imgW, h / imgH);
                    const drawW = imgW * scale;
                    const drawH = imgH * scale;
                    const drawX = (w - drawW) / 2;
                    const drawY = (h - drawH) / 2;
                    fl.ctx.drawImage(fl.canvasBgImage, drawX - blurPx * 2, drawY - blurPx * 2, drawW + blurPx * 4, drawH + blurPx * 4);
                }
                fl.ctx.restore();
            } else {
                fl.ctx.fillStyle = '#121212';
                fl.ctx.fillRect(0, 0, w, h);
            }
        }

        // Draw darkness overlay
        if (effectiveDarkness > 0) {
            fl.ctx.fillStyle = `rgba(0, 0, 0, ${effectiveDarkness / 100})`;
            fl.ctx.fillRect(0, 0, w, h);
        }
    };

    fl.renderLoop = function () {
        if (!fl.pipWin || (fl.activePipType !== 'video' && fl.pipWin.closed)) return;

        fl.isRenderLoopRunning = true;

        const state = fl.getPlayerState();
        // Apply Sync Offset
        if (!state.paused) {
            state.currentTime += (fl.syncOffset / 1000);
        }

        // Auto-heal/re-fetch if duration becomes valid (transitioned from <= 5 to > 5)
        if (fl.currentTrack && 
            (fl.isMissingLyrics || (fl.lyricLines.length === 1 && fl.lyricLines[0].text === "Wait for it...")) &&
            state.duration > 5 && 
            (!fl.lastKnownValidDuration || fl.lastKnownValidDuration <= 5)) {
            
            console.log(`FL: Duration became valid (${state.duration}s). Re-fetching lyrics...`);
            fl.fetchLyrics();
        }
        fl.lastKnownValidDuration = state.duration;

        const meta = navigator.mediaSession.metadata;
        const nowTitle = meta?.title || "";
        if (nowTitle !== fl.currentTrack) {
            fl.currentTrack = nowTitle;

            if (nowTitle === "") {
                fl.lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "", translation: "" }];
                fl.lyricLines[0].isWaitingPlaceholder = true;
                fl.isCurrentLyricSynced = false;
                fl.isMissingLyrics = false;
                fl.needsLayoutUpdate = true;
                fl._els = null;
                fl.lastKnownValidDuration = 0;
                if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
            } else {
                // --- INSTANT FLUSH: Clear old lyrics immediately ---
                fl.lyricLines = [{ time: 0, text: "Wait for it...", romaji: "", translation: "" }];
                fl.isCurrentLyricSynced = false;
                fl.isMissingLyrics = false;
                fl.needsLayoutUpdate = true;
                fl._els = null; // invalidate DOM cache on track change (new PiP may be up)
                fl.lastKnownValidDuration = 0;
                if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();

                // Reset media element cache so getPlayerState() re-scans on the next call.
                fl._mediaEl = null;

                // Reset time interpolation state.
                fl.lastTimeStr = "";
                fl.lastTimeValue = 0;
                fl.lastUpdateMs = performance.now();

                fl.fetchLyrics();
            }
        }

        // OPT-4: Refresh element cache if not yet populated or canvas was replaced.
        if (fl.activePipType !== 'video' && !fl._els) fl._refreshEls();

        // --- CONTINUOUS BACKGROUND IMAGE SYNC ---
        const art = fl.getCoverArt();
        if (fl.activePipType === 'video') {
            if (art && fl.lastExtractedArt !== art) {
                fl.lastExtractedArt = art;
                fl.extractPalette(art);
            }
        } else {
            const bg = fl._els?.bgCover;

            if (bg && art) {
                const newBg = `url("${art}")`;
                // Only trigger a DOM repaint if the image actually changed
                if (bg.style.backgroundImage !== newBg) {
                    bg.style.backgroundImage = newBg;
                    bg.classList.remove('bg-waiting');
                    fl.extractPalette(art); // Trigger color extraction

                    // Also update the centered art (if in centered mode)
                    if (typeof fl.updateCenteredArt === 'function') {
                        fl.updateCenteredArt(art);
                    }
                }
            } else if (bg && !art) {
                if (bg.style.backgroundImage !== 'none' && bg.style.backgroundImage !== '') {
                    bg.style.backgroundImage = 'none';
                    if (typeof fl.updateCenteredArt === 'function') {
                        fl.updateCenteredArt("");
                    }
                }

                // Only apply animated background when strictly waiting for music
                const isWaiting = (fl.lyricLines.length === 1 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder)) ||
                                  (state.paused && state.duration <= 5);
                if (isWaiting) {
                    if (!bg.classList.contains('bg-waiting')) bg.classList.add('bg-waiting');
                } else {
                    if (bg.classList.contains('bg-waiting')) bg.classList.remove('bg-waiting');
                }
            }
        }

        if (fl.activePipType === 'video') {
            if (!fl.canvas) {
                return fl.pipWin ? window.requestAnimationFrame(fl.renderLoop) : null;
            }
        } else {
            if (!fl.canvas || !fl.pipWin.document.body.contains(fl.canvas)) {
                fl.canvas = fl.pipWin.document.getElementById('lyricCanvas');
                fl.ctx = null;
                fl.lastW = -1; // Force resize for the new canvas
                fl.lastH = -1;
                fl._els = null; // Canvass replaced — re-cache all elements
            }
        }
        if (!fl.canvas) {
            const nextFrame = fl.activePipType === 'video' ? window.requestAnimationFrame : fl.pipWin.requestAnimationFrame;
            return nextFrame(fl.renderLoop);
        }
        if (!fl.ctx) fl.ctx = fl.canvas.getContext('2d');

        const w = fl.activePipType === 'video' ? fl.pipWin.width : fl.pipWin.innerWidth;
        const h = fl.activePipType === 'video' ? fl.pipWin.height : fl.pipWin.innerHeight;

        // Bail out if the PiP window hasn't finished laying out yet (can happen on the very first frame).
        // Re-queuing the loop is cheaper than drawing garbage into a 0x0 canvas.
        if (w <= 0 || h <= 0) {
            const nextFrame = fl.activePipType === 'video' ? window.requestAnimationFrame : fl.pipWin.requestAnimationFrame;
            return nextFrame(fl.renderLoop);
        }

        // --- CANVAS RESIZE GUARD ---
        // Only resize when dimensions actually changed. Assigning canvas.width/height
        // every frame thrashes memory and is the single biggest CPU culprit.
        if (w !== fl.lastW || h !== fl.lastH) {
            fl.canvas.width = w;
            fl.canvas.height = h;
            fl.lastW = w; fl.lastH = h;
            fl.needsLayoutUpdate = true; // Window changed — recompute all offsets
        }

        const vmin = Math.min(w, h) / 100;
        const maxWidth = w * 0.94;

        // --- OPT-4: Use cached element refs for per-frame DOM writes ---
        const seekerContainer = fl._els?.seekerContainer;
        const hasTrack = fl.currentTrack && 
                         fl.currentTrack !== "" && 
                         !((fl.lyricLines.length === 1 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder)) || (state.paused && state.duration <= 5));

        // Accumulate listening stats
        if (hasTrack && !state.paused) {
            const nowTick = performance.now();
            if (fl.lastActiveTickMs) {
                const deltaMs = nowTick - fl.lastActiveTickMs;
                if (typeof fl.accumulateListeningTime === 'function') {
                    fl.accumulateListeningTime(deltaMs);
                }
            }
            fl.lastActiveTickMs = nowTick;
        } else {
            fl.lastActiveTickMs = null;
        }

        if (fl.activePipType !== 'video') {
            if (seekerContainer) {
                seekerContainer.style.display = hasTrack ? 'block' : 'none';
            }

            const seeker = fl._els?.seeker;
            if (seeker && hasTrack) seeker.style.width = `${(state.currentTime / state.duration) * 100}%`;

            const ppBtn = fl._els?.ppBtn;
            if (ppBtn) {
                const targetState = state.paused ? 'paused' : 'playing';
                if (ppBtn.dataset.state !== targetState) {
                    ppBtn.dataset.state = targetState;
                    ppBtn.innerHTML = state.paused ? fl.ICON_PLAY : fl.ICON_PAUSE;
                }
            }

            // Update mute button icon if changed externally (or by our toggle)
            const muteBtn = fl._els?.muteBtn;
            if (muteBtn) {
                const adapter = fl.getActiveAdapter?.();
                let isMuted = false;
                if (adapter) {
                    isMuted = adapter.isMuted();
                } else {
                    const media = fl.queryMedia('audio') || fl.queryMedia('video, audio');
                    isMuted = media ? (media.muted || media.volume === 0) : false;
                }
                const targetMuteIcon = isMuted ? fl.ICON_VOL_MUTE : fl.ICON_VOL_HIGH;
                if (muteBtn.innerHTML !== targetMuteIcon) muteBtn.innerHTML = targetMuteIcon;
            }
        } else {
            // Sync host player state -> virtual video element in Video PiP
            const video = document.getElementById('fl-video-pip-element');
            if (video) {
                // Sync play/pause state
                if (state.paused !== video.paused) {
                    if (state.paused) {
                        video.pause();
                    } else {
                        video.play().catch(() => {});
                    }
                }
                // Sync muted state
                const adapter = fl.getActiveAdapter?.();
                let isMuted = false;
                if (adapter) {
                    isMuted = adapter.isMuted();
                } else {
                    const media = fl.queryMedia('audio') || fl.queryMedia('video, audio');
                    isMuted = media ? (media.muted || media.volume === 0) : false;
                }
                if (video.muted !== isMuted) {
                    video.muted = isMuted;
                }
            }
        }

        // --- Optimization / Bounds Checking ---
        // If the window is too small, the CSS overlay is showing and the canvas is hidden.
        if (fl.activePipType !== 'video' && (w < 200 || h < 200)) {
            fl.pipWin.requestAnimationFrame(fl.renderLoop);
            return;
        }

        fl.ctx.clearRect(0, 0, w, h);
        fl.drawCanvasBackground(w, h);

        let activeIdx = fl.lyricLines.findIndex((l, i) =>
            state.currentTime >= l.time && (!fl.lyricLines[i + 1] || state.currentTime < fl.lyricLines[i + 1].time)
        );
        if (activeIdx === -1) activeIdx = 0;

        // --- LAYOUT CACHE ---
        // Recompute line offsets only when something meaningful changes:
        // song loaded/changed, window resized, or active line moved (different font size).
        if (fl.needsLayoutUpdate || activeIdx !== fl.lastActiveIdx || fl.lyricLines.length !== fl.lastLyricsLen) {
            const baseSpacing = vmin * (fl.userLineSpacing ?? 8);
            let currentYOffset = 0;
            const lineOffsets = [];

            // Scale factor derived from the user font size slider.
            // Default slider value (18) yields scale = 1.0.
            // Range 10–36 gives roughly 0.56x to 2.0x.

            // OPT-1: O(1) Set lookup instead of Array.includes() for system message detection.
            const isSystemMessage = fl.lyricLines.length === 1 && fl.SYSTEM_MSG_SET.has(fl.lyricLines[0].text);
            const fontScale = isSystemMessage ? 1 : (fl.userFontSize / 18);

            // Target width for the active line fit
            const fitWidth = maxWidth * 0.75;
            const displayFontFamily = isSystemMessage ? "'Noto Sans', 'Segoe UI', sans-serif" : fl.userFontFamily;
            const activeSizeMin = vmin * 6.5 * fontScale;
            const activeSizeMax = vmin * 9.5 * fontScale;

            for (let i = 0; i < fl.lyricLines.length; i++) {
                const line = fl.lyricLines[i];

                // Inactive lines: fixed vmin-based size (unchanged behaviour).
                // Active line: scale to fill horizontal space, then clamp.
                // OPT-2: Store computed mainSize in the layout object so the draw
                // pass can reuse it — eliminating the duplicate calculateFitSize /
                // measureText call that previously happened every frame for the active line.
                let mainSize;
                if (i === activeIdx) {
                    mainSize = fl.calculateFitSize(
                        fl.ctx,
                        line.text,
                        `700 {SIZE}px ${displayFontFamily}`,
                        fitWidth,
                        vmin * 7.5 * fontScale, // baseline measurement size
                        activeSizeMin,
                        activeSizeMax
                    );
                } else {
                    mainSize = vmin * 6.0 * fontScale; // Bumped from 5.2 for better readability
                }

                // Romaji and translation for the active line scale with mainSize
                // so they feel proportionally cohesive rather than jumping to a
                // fixed vmin value that may be much smaller than the main text.
                // NOTE: fontScale applied here to stay in sync with the draw pass.
                const romajiSize = (i === activeIdx) ? mainSize * 0.86 : vmin * 5.2 * fontScale;
                const transSize = (i === activeIdx) ? mainSize * 0.86 : vmin * 5.2 * fontScale;

                let romajiHeight = 0;
                if (line.romaji) {
                    fl.ctx.font = `italic 600 ${romajiSize}px ${displayFontFamily}`;
                    romajiHeight = fl.getWrapLines(fl.ctx, line.romaji, maxWidth).length * (romajiSize * 1.2);
                }

                fl.ctx.font = (i === activeIdx) ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                let mainHeight = fl.getWrapLines(fl.ctx, line.text, maxWidth).length * (mainSize * 1.2);

                let transHeight = 0;
                if (fl.showTranslation && line.translation) {
                    fl.ctx.font = `600 ${transSize}px ${displayFontFamily}`;
                    transHeight = fl.getWrapLines(fl.ctx, `(${line.translation})`, maxWidth).length * (transSize * 1.2);
                }

                // --- ASYMMETRIC BOUNDARY CALCULATION ---
                // Text always grows DOWNWARD when it wraps, never upward.
                // So topBoundary is fixed to a single-line anchor, and
                // bottomBoundary expands to cover any extra wrapped rows.
                fl.ctx.font = (i === activeIdx) ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                const mainLineCount = fl.getWrapLines(fl.ctx, line.text, maxWidth).length;
                // Extra downward shift when the main lyric wraps beyond one line
                const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

                // Top boundary: fixed at half a single line height (anchors the drawn Y position).
                // When romaji is present, it uses a proportional gap from romajiSize instead of a fixed vmin offset.
                // Reduced from 0.6 to 0.45 to shift the active line anchor upward
                const singleLineHalf = mainSize * 0.45;
                const topBoundary = line.romaji
                    ? (romajiSize * 1.5) + romajiHeight
                    : singleLineHalf;

                // Bottom boundary: extends downward to cover wrapped rows + translation gap.
                let bottomBoundary = singleLineHalf + mainWrapShift;
                if (fl.showTranslation && line.translation) {
                    bottomBoundary = mainWrapShift + (transSize * 1.5) + transHeight;
                }

                const baseY = currentYOffset + topBoundary;
                // OPT-2: store {y, mainSize} so the draw pass can read mainSize directly.
                lineOffsets.push({ y: baseY, mainSize });

                const totalBlockHeight = topBoundary + bottomBoundary;

                // --- SMART AUTO-SCALING (PLAN B) ---
                // Shrink the gap proportionally if the block has fewer layers
                // so the visual density remains constant across all songs.
                const hasRomaji = !!line.romaji;
                const hasTl = fl.showTranslation && !!line.translation;
                const layerCount = 1 + (hasRomaji ? 1 : 0) + (hasTl ? 1 : 0);

                let dynamicGap = baseSpacing;
                if (layerCount === 2) dynamicGap = baseSpacing * 2.0;
                if (layerCount === 1) dynamicGap = baseSpacing * 3.0;

                currentYOffset += totalBlockHeight + dynamicGap;
            }

            fl.cachedLayout = lineOffsets;
            // Update scroll target inside the invalidation block so the lerp always
            // chases the new position, even when scrollPos is mid-animation.
            fl.targetScroll = (fl.cachedLayout[activeIdx]?.y) || 0;
            fl.lastActiveIdx = activeIdx;
            fl.lastLyricsLen = fl.lyricLines.length;
            fl.needsLayoutUpdate = false;
        }

        const scrollDelta = fl.targetScroll - fl.scrollPos;

        // --- OPTIMIZATION: Cinematic "Teleport and Glide" for Large Jumps ---
        // If the user clicks the seeker bar and jumps 40 lines away, lerping across
        // the entire history forces the GPU to render dozens of heavy text shadows per frame, causing massive lag.
        // Instead of a hard, ugly instant snap, we teleport the scroll position to just slightly before 
        // the destination (0.3x screen height), then let the normal easing smoothly slide it the rest of the way.
        if (Math.abs(scrollDelta) > h * 0.8) {
            fl.scrollPos = fl.targetScroll - (Math.sign(scrollDelta) * (h * 0.3));
        } else {
            fl.scrollPos += scrollDelta * 0.1;
        }

        const isFastScroll = Math.abs(scrollDelta) > (h * 0.05);

        // --- OPT-3: IDLE THROTTLE ---
        // When the track is paused AND the scroll animation has fully settled,
        // the canvas content is static. Drop to ~4fps to save CPU/battery.
        // The threshold of 0.5px is imperceptible in the PiP window.
        const absScrollDelta = Math.abs(fl.targetScroll - fl.scrollPos);
        const isIdle = state.paused && absScrollDelta < 0.5 && !fl.needsLayoutUpdate;

        const anchorOffset = ((fl.userVerticalAnchor ?? 5) - 5) * vmin * 5;

        fl.ctx.save();
        fl.ctx.translate(w / 2, (h / 2) - fl.scrollPos + anchorOffset);

        // --- VIDEO PIP LOADING PLACEHOLDER ---
        // When the canvas album-art image hasn't loaded yet (async) AND there's nothing
        // else to render (albumCoverMode=true OR lyrics are missing), the canvas would
        // otherwise be solid black. Show the waiting animation regardless of albumCoverMode
        // so the user sees something meaningful while the image loads.
        const shouldShowLoadingPlaceholder =
            fl.activePipType === 'video' &&
            !fl.canvasBgImage &&
            (fl.albumCoverMode || (fl.isMissingLyrics && fl.lyricLines.length === 0));

        if (shouldShowLoadingPlaceholder) {
            fl.drawWaitingState(w, h, vmin, maxWidth, anchorOffset);
        } else if (!fl.albumCoverMode) {
            // isMissingLyrics sets lyricLines = [] — no forEach would draw anything.
            // Treat that as a waiting state so the idle animation shows instead of a black canvas.
            const isWaiting = (fl.lyricLines.length === 1 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder)) ||
                              (state.paused && state.duration <= 5) ||
                              (fl.isMissingLyrics && fl.lyricLines.length === 0 && !fl.canvasBgImage);
            if (isWaiting) {
                if (fl.lyricLines && fl.lyricLines[0]) {
                    fl.lyricLines[0].isWaitingPlaceholder = true;
                }
                fl.drawWaitingState(w, h, vmin, maxWidth, anchorOffset);
            } else {
                fl.lyricLines.forEach((line, i) => {
                    const entry = fl.cachedLayout[i];
                    if (!entry) return;
                    const y = entry.y;

                    // --- CULLING: Skip drawing off-screen lines ---
                    // Calculate where this line will actually render on the screen
                    const screenY = (h / 2) - fl.scrollPos + anchorOffset + y;

                    // If it's more than half a full screen-height above or below the view, ignore it.
                    // We give it a generous buffer window so shadows don't abruptly pop in.
                    if (screenY < -h * 0.5 || screenY > h * 1.5) {
                        return;
                    }

                    const dist = Math.abs(i - activeIdx);
                    // Increase alpha floor from 0.1 to 0.3 for better visibility of distant lines
                    fl.ctx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);

                    // OPT-1: O(1) Set lookup for system message detection in the draw pass.
                    const isSystemMessage = fl.lyricLines.length === 1 && fl.SYSTEM_MSG_SET.has(line.text);
                    let drawX = 0;
                    if (isSystemMessage) {
                        fl.ctx.textAlign = 'center';
                    } else if (fl.userLyricAlignment === 'left') {
                        fl.ctx.textAlign = 'left';
                        drawX = -(maxWidth / 2);
                    } else if (fl.userLyricAlignment === 'right') {
                        fl.ctx.textAlign = 'right';
                        drawX = maxWidth / 2;
                    } else {
                        fl.ctx.textAlign = 'center';
                    }

                    const isCurrent = (i === activeIdx);
                    const displayFontFamily = isSystemMessage ? "'Noto Sans', 'Segoe UI', sans-serif" : fl.userFontFamily;

                    // Universal Dark Shadow for all text
                    fl.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                    fl.ctx.shadowBlur = 8;

                    // Mirror the layout block's sizing logic exactly so draw positions
                    // match the pre-computed offsets in cachedLayout.
                    const fontScale = isSystemMessage ? 1 : (fl.userFontSize / 18);

                    // OPT-2: Reuse the mainSize already computed in the layout pass.
                    // For the active line this avoids a second calculateFitSize → measureText call.
                    const mainSize = entry.mainSize;
                    const romajiSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;
                    const transSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;

                    // 1. Romaji (Top)
                    if (line.romaji) {
                        fl.ctx.font = `italic 600 ${romajiSize}px ${displayFontFamily}`;
                        // Revert inactive romaji to light gray for readability
                        fl.ctx.fillStyle = isCurrent ? fl.currentPalette.romaji : "#DDDDDD";
                        // Shift up to make room
                        fl.wrapText(fl.ctx, line.romaji, drawX, y - (romajiSize * 1.5), maxWidth, romajiSize * 1.2, true);
                    }

                    // 2. Original Text (Middle)
                    fl.ctx.font = isCurrent ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                    // Inactive main text stays white, active main text glows (white core if neon)
                    fl.ctx.fillStyle = (isCurrent && !fl.userGlowEnabled) ? fl.currentPalette.vibrant : "#FFFFFF";

                    // Draw main text
                    fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false);

                    // Draw glow pass for the active line:
                    // If glowEnabled, pulse the shadowBlur via a sine wave; otherwise use the
                    // fixed vibrant glow that already existed (subtle, palette-matched).
                    if (isCurrent) {
                        if (fl.userGlowEnabled && fl.userGlowStyle === 'rainbow') {
                            const timeSec = performance.now() / 1000;
                            const hue = (timeSec * 60) % 360;
                            fl.ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
                            fl.ctx.strokeStyle = `hsl(${hue}, 100%, 65%)`;
                        } else {
                            fl.ctx.shadowColor = fl.currentPalette.vibrant;
                            fl.ctx.strokeStyle = fl.currentPalette.vibrant;
                        }

                        if (fl.userGlowEnabled && !isFastScroll) {
                            fl.ctx.lineWidth = Math.max(2, mainSize * 0.04);
                            // Pulse between 10 and 40 shadow blur over ~2s cycle
                            const glowTime = performance.now() / 1000;
                            const pulsedBlur = 10 + 30 * (0.5 + 0.5 * Math.sin(glowTime * Math.PI));
                            fl.ctx.shadowBlur = pulsedBlur;
                            // Request a re-render next frame so the animation is continuous
                            // (handled by the outer requestAnimationFrame loop in renderLoop)
                            fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, true);
                        } else {
                            fl.ctx.shadowBlur = 15;
                            fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, false);
                        }
                    }

                    // 3. Translation (Bottom)
                    if (fl.showTranslation && line.translation) {
                        // Calculate downward baseline shift for wrapped lyrics
                        fl.ctx.font = isCurrent ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                        const mainLineCount = fl.getWrapLines(fl.ctx, line.text, maxWidth).length;
                        const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

                        fl.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                        fl.ctx.shadowBlur = 8;

                        fl.ctx.font = `600 ${transSize}px ${displayFontFamily}`;
                        fl.ctx.fillStyle = isCurrent ? fl.currentPalette.trans : "#CCCCCC";

                        fl.wrapText(fl.ctx, `(${line.translation})`, drawX, y + mainWrapShift + (transSize * 1.5), maxWidth, transSize * 1.2, false);
                    }
                });
            }
        }

        fl.ctx.restore();

        // OPT-3: If truly idle (paused + scroll settled + no layout dirty), sleep for
        // ~250ms before the next rAF tick. This cuts CPU wakeups from ~60/s to ~4/s.
        // Glow animations bypass the throttle because needsLayoutUpdate stays false
        // while glow is active — but glow forces a repaint via the continuous rAF loop
        // below. When glow is on and the track is paused we still want smooth glow,
        // so we skip throttling if glow is enabled too.
        const isWaitingState = (fl.lyricLines.length === 1 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder)) ||
                               (state.paused && state.duration <= 5) ||
                               (fl.isMissingLyrics && fl.lyricLines.length === 0 && !fl.canvasBgImage) ||
                               shouldShowLoadingPlaceholder; // also animates when album art hasn't loaded yet
        const nextFrame = fl.activePipType === 'video' ? window.requestAnimationFrame : fl.pipWin.requestAnimationFrame;
        if (isIdle && !fl.userGlowEnabled && !isWaitingState) {
            const timerHost = fl.activePipType === 'video' ? window : fl.pipWin;
            timerHost.setTimeout(() => nextFrame(fl.renderLoop), 250);
        } else {
            nextFrame(fl.renderLoop);
        }
    }

})();
