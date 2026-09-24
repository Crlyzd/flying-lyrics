(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — VIDEO PIP BADGES & WAITING STATE OVERLAYS (content context)
    // ─────────────────────────────────────────────────────────────────────────────

    fl.drawWaitingState = function (w, h, vmin, maxWidth, anchorOffset) {
        const cycleTimeMs = 30000;
        const totalMs = performance.now();
        const cycleIndex = Math.floor(totalMs / cycleTimeMs);
        const quotesCount = fl.EMPTY_STATE_TEXTS?.length || 30;
        const currentTextIndex = cycleIndex % quotesCount;
        const nextTextIndex = (cycleIndex + 1) % quotesCount;

        const timeInCycle = totalMs % cycleTimeMs;
        const transitionMs = 600;

        const currentString = typeof fl.getResolvedText === 'function' ? fl.getResolvedText(currentTextIndex) : "Waiting for music...";
        const nextString = typeof fl.getResolvedText === 'function' ? fl.getResolvedText(nextTextIndex) : "Waiting for music...";

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

        const uiContainer = fl._els?.seekerContainer?.parentElement;
        if (uiContainer) {
            uiContainer.style.setProperty('--vibrant-color', activeColor);
        }

        const displayFontFamily = "'Noto Sans', 'Segoe UI', sans-serif";
        const mainSize = vmin * 6.5;
        const lineHeight = mainSize * 1.45;

        const y = 0;
        const drawX = 0;

        fl.ctx.save();
        if (fl.userLyricShadowEnabled) {
            fl.ctx.shadowColor = activeColor;
            fl.ctx.shadowBlur = 15;
        } else {
            fl.ctx.shadowBlur = 0;
        }
        fl.ctx.font = `700 ${mainSize}px ${displayFontFamily}`;
        fl.ctx.fillStyle = "#FFFFFF";
        fl.ctx.textAlign = 'center';

        if (timeInCycle > cycleTimeMs - transitionMs) {
            const progress = (timeInCycle - (cycleTimeMs - transitionMs)) / transitionMs;

            fl.ctx.save();
            fl.ctx.globalAlpha = 1.0 - progress;
            const currentLines = fl.getWrapLines(fl.ctx, currentString, maxWidth);
            const currentY = y - ((currentLines.length - 1) * lineHeight) / 2;
            fl.wrapText(fl.ctx, currentString, drawX, currentY, maxWidth, lineHeight, false, false);
            fl.ctx.restore();

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

        // Equalizer visualizer
        const barCount = fl.ecoMode ? 15 : 35;
        const totalW = maxWidth * 0.65;
        const barW = (totalW / barCount) * 0.7;
        const barGap = (totalW / barCount) * 0.3;
        const startX = -(totalW / 2) + (barW / 2);

        fl.ctx.font = `700 ${mainSize}px ${displayFontFamily}`;
        const currentLinesCount = fl.getWrapLines(fl.ctx, currentString, maxWidth).length;
        const nextLinesCount = fl.getWrapLines(fl.ctx, nextString, maxWidth).length;
        const maxLines = Math.max(currentLinesCount, nextLinesCount);
        const textHeightOffset = (maxLines - 1) * lineHeight;

        const eqY = y + (mainSize * 1.5) + textHeightOffset;

        fl.ctx.save();
        const grad = fl.ctx.createLinearGradient(0, eqY, 0, eqY + mainSize * 1.2);
        grad.addColorStop(0, activeColor);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
        fl.ctx.fillStyle = grad;

        if (fl.userLyricShadowEnabled) {
            fl.ctx.shadowColor = activeColor;
            fl.ctx.shadowBlur = 10;
        } else {
            fl.ctx.shadowBlur = 0;
        }

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

    fl.drawVideoPipSyncStatus = function (w, h) {
        if (fl.activePipType !== 'video') return;

        let statusText;
        let dotColor;
        let borderColor;
        let textColor;
        let spinnerTrackColor;
        let spinnerHeadColor;
        let dotGlowColor;
        let dotGlowBlur = 0;
        const isRetrying = fl.isRetrying || false;
        const isEmpty = fl.activeLyricSource && fl.activeLyricSource.isEmpty;

        if (fl.isBackgroundSearchFailed && !isRetrying) {
            statusText = 'FAILED';
            borderColor = 'rgba(239, 68, 68, 0.35)';
            textColor = '#FEE2E2';
            dotColor = '#EF4444';
            dotGlowColor = 'rgba(239, 68, 68, 0.5)';
            dotGlowBlur = 8;
        } else if (fl.isMissingLyrics || isEmpty) {
            if (fl.isMissingLyrics && isRetrying) {
                statusText = 'SEARCHING';
                borderColor = 'rgba(0, 210, 255, 0.35)';
                textColor = '#E0F7FA';
                spinnerTrackColor = 'rgba(0, 210, 255, 0.2)';
                spinnerHeadColor = '#00D2FF';
            } else {
                statusText = 'NO LYRICS';
                dotColor = '#F59E0B';
                borderColor = 'rgba(245, 158, 11, 0.25)';
                textColor = '#FEF3C7';
                dotGlowColor = 'rgba(245, 158, 11, 0.4)';
                dotGlowBlur = 6;
            }
        } else if (fl.isCurrentLyricSynced) {
            statusText = 'SYNCED';
            dotColor = '#10B981';
            borderColor = 'rgba(16, 185, 129, 0.25)';
            textColor = '#E6F4EA';
            dotGlowColor = 'rgba(16, 185, 129, 0.5)';
            dotGlowBlur = 8;
        } else {
            statusText = 'UNSYNCED';
            dotColor = '#94A3B8';
            borderColor = 'rgba(255, 255, 255, 0.1)';
            textColor = 'rgba(255, 255, 255, 0.7)';
        }

        fl.ctx.save();
        const margin = 15;
        fl.ctx.translate(w - margin, margin);
        fl.ctx.scale(0.6, 0.6);

        const fontName = "'Noto Sans', 'Segoe UI', sans-serif";
        const fontSize = 10;
        const paddingX = 8;
        const paddingY = 4;
        const gap = 6;
        const dotRadius = 3;
        const cornerR = 4;

        fl.ctx.font = `700 ${fontSize}px ${fontName}`;
        fl.ctx.textBaseline = 'middle';
        fl.ctx.textAlign = 'left';

        const textWidth = fl.ctx.measureText(statusText).width;
        const badgeHeight = fontSize + paddingY * 2;
        const badgeWidth = paddingX * 2 + dotRadius * 2 + gap + textWidth;

        const bx = -badgeWidth;
        const by = 0;

        fl.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        fl.ctx.beginPath();
        fl.ctx.moveTo(bx + cornerR, by);
        fl.ctx.lineTo(bx + badgeWidth - cornerR, by);
        fl.ctx.quadraticCurveTo(bx + badgeWidth, by, bx + badgeWidth, by + cornerR);
        fl.ctx.lineTo(bx + badgeWidth, by + badgeHeight - cornerR);
        fl.ctx.quadraticCurveTo(bx + badgeWidth, by + badgeHeight, bx + badgeWidth - cornerR, by + badgeHeight);
        fl.ctx.lineTo(bx + cornerR, by + badgeHeight);
        fl.ctx.quadraticCurveTo(bx, by + badgeHeight, bx, by + badgeHeight - cornerR);
        fl.ctx.lineTo(bx, by + cornerR);
        fl.ctx.quadraticCurveTo(bx, by, bx + cornerR, by);
        fl.ctx.closePath();
        fl.ctx.fill();

        fl.ctx.strokeStyle = borderColor;
        fl.ctx.lineWidth = 1;
        fl.ctx.stroke();

        const dotX = bx + paddingX + dotRadius;
        const dotY = by + badgeHeight / 2;

        if (isRetrying) {
            fl.ctx.save();
            fl.ctx.translate(dotX, dotY);
            const angle = (performance.now() / 150) % (Math.PI * 2);
            fl.ctx.rotate(angle);

            fl.ctx.beginPath();
            fl.ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
            fl.ctx.strokeStyle = spinnerTrackColor || 'rgba(0, 210, 255, 0.2)';
            fl.ctx.lineWidth = 1.5;
            fl.ctx.stroke();

            fl.ctx.beginPath();
            fl.ctx.arc(0, 0, dotRadius, -Math.PI / 2, 0);
            fl.ctx.strokeStyle = spinnerHeadColor || '#00D2FF';
            fl.ctx.stroke();
            fl.ctx.restore();
        } else {
            if (fl.isBackgroundSearchFailed && !isRetrying) {
                fl.ctx.strokeStyle = '#EF4444';
                fl.ctx.lineWidth = 1.5;
                fl.ctx.beginPath();
                fl.ctx.moveTo(dotX - 2.5, dotY - 2.5);
                fl.ctx.lineTo(dotX + 2.5, dotY + 2.5);
                fl.ctx.moveTo(dotX + 2.5, dotY - 2.5);
                fl.ctx.lineTo(dotX - 2.5, dotY + 2.5);
                fl.ctx.stroke();
            } else {
                fl.ctx.beginPath();
                fl.ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
                fl.ctx.fillStyle = dotColor;
                if (dotGlowBlur > 0 && fl.userLyricShadowEnabled) {
                    fl.ctx.shadowColor = dotGlowColor;
                    fl.ctx.shadowBlur = dotGlowBlur;
                }
                fl.ctx.fill();
                fl.ctx.shadowBlur = 0;
            }
        }

        fl.ctx.fillStyle = textColor;
        fl.ctx.fillText(statusText, dotX + dotRadius + gap, dotY);

        fl.ctx.restore();
    };

})();
