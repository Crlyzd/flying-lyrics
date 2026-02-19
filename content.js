// --- GLOBAL STATE ---
let currentTrack = "";
let lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "" }];
let scrollPos = 0;
let targetScroll = 0;
let pipWin = null;

// For Spotify Time Interpolation
let lastTimeStr = "";
let lastTimeValue = 0;
let lastUpdateMs = performance.now();

// --- ICONS (SVG STRINGS) ---
const ICON_PREV = `<svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24"><line x1="10" y1="4" x2="10" y2="20"></line><line x1="14" y1="4" x2="14" y2="20"></line></svg>`;
let canvas, ctx;

// --- 1. CORE FUNCTIONS ---

function wrapText(ctx, text, x, y, maxWidth, lineHeight, growUpwards = false) {
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

    let currentY = growUpwards ? y - ((lines.length - 1) * lineHeight) : y;

    for (let k = 0; k < lines.length; k++) {
        ctx.fillText(lines[k], x, currentY);
        currentY += lineHeight;
    }
}

async function fetchLyrics(retryCount = 0) {
    const meta = navigator.mediaSession.metadata;

    if (!meta || !meta.title) {
        if (retryCount < 5) setTimeout(() => fetchLyrics(retryCount + 1), 1000);
        return;
    }

    try {
        const query = `artist_name=${encodeURIComponent(meta.artist)}&track_name=${encodeURIComponent(meta.title)}`;
        const res = await fetch(`https://lrclib.net/api/get?${query}`);
        const data = await res.json();
        const raw = data.syncedLyrics || data.plainLyrics || "";
        
        if (!raw) {
            lyricLines = [{ time: 0, text: "No lyrics found", romaji: "" }];
            return;
        }

        const lines = raw.split('\n');
        const temp = [];
        for (let line of lines) {
            const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
            if (!match) continue;
            
            const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            const text = match[3].trim();
            if (!text) continue;

            let romaji = "";
            if (/[぀-ゟ゠-ヿ一-鿿가-힣]/.test(text)) {
                try {
                    const tRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`);
                    const tData = await tRes.json();
                    romaji = tData?.[0]?.[0]?.[3] || "";
                } catch (e) { }
            }
            temp.push({ time, text, romaji });
        }
        lyricLines = temp.length ? temp : [{ time: 0, text: "No Lyrics Available", romaji: "" }];
    } catch (e) {
        lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
    }
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

function getPlayerState() {
    let currentTime = 0;
    let duration = 1;
    let paused = false;

    const mediaElements = Array.from(document.querySelectorAll('video, audio'));
    const activeMedia = mediaElements.find(m => m.readyState >= 2 && !m.paused) 
                     || mediaElements.find(m => m.readyState >= 2);

    if (activeMedia && activeMedia.duration > 0 && activeMedia.currentTime > 0) {
        return { currentTime: activeMedia.currentTime, duration: activeMedia.duration, paused: activeMedia.paused };
    }

    if (window.location.hostname.includes('spotify')) {
        const timeEl = document.querySelector('[data-testid="playback-position"]');
        const durationEl = document.querySelector('[data-testid="playback-duration"]');
        const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
        
        if (timeEl && durationEl) {
            const currentStr = timeEl.textContent;
            duration = parseTime(durationEl.textContent) || 1;
            
            if (playBtn) {
                paused = playBtn.getAttribute('aria-label') === 'Play';
            }

            if (currentStr !== lastTimeStr) {
                lastTimeStr = currentStr;
                lastTimeValue = parseTime(currentStr);
                lastUpdateMs = performance.now();
            }

            currentTime = lastTimeValue;
            if (!paused) {
                currentTime += (performance.now() - lastUpdateMs) / 1000;
            }
        }
    }

    return { currentTime, duration, paused };
}

function getCoverArt() {
    // 1. MediaSession API (Grab the last item, which is inherently the highest resolution)
    const meta = navigator.mediaSession?.metadata;
    if (meta && meta.artwork && meta.artwork.length > 0) {
        return meta.artwork[meta.artwork.length - 1].src;
    }
    
    // 2. Spotify DOM Fallback (Directly targets the bottom-left playing widget)
    const spotiImg = document.querySelector('[data-testid="now-playing-widget"] img') || 
                     document.querySelector('img[data-testid="cover-art-image"]');
    if (spotiImg) return spotiImg.src;
    
    // 3. YouTube Music DOM Fallback
    const ytImg = document.querySelector('.ytmusic-player-bar img');
    if (ytImg) return ytImg.src;
    
    return "";
}

function renderLoop() {
    if (!pipWin || pipWin.closed) return;

    const meta = navigator.mediaSession.metadata;
    const nowTitle = meta?.title || "";
    if (nowTitle !== currentTrack) {
        currentTrack = nowTitle;
        fetchLyrics();
    }

// --- CONTINUOUS BACKGROUND IMAGE SYNC ---
    const art = getCoverArt();
    const bg = pipWin.document.getElementById('bg-cover');
    
    if (bg && art) {
        const newBg = `url("${art}")`;
        // Only trigger a DOM repaint if the image actually changed
        if (bg.style.backgroundImage !== newBg) {
            bg.style.backgroundImage = newBg;
        }
    }

    if (!canvas || !pipWin.document.body.contains(canvas)) {
        canvas = pipWin.document.getElementById('lyricCanvas');
        ctx = null;
    }
    if (!canvas) return pipWin.requestAnimationFrame(renderLoop); 
    if (!ctx) ctx = canvas.getContext('2d');

    const w = pipWin.innerWidth;
    const h = pipWin.innerHeight;
    canvas.width = w; 
    canvas.height = h;

    const vh = h / 100;

    const state = getPlayerState();
    
    const seeker = pipWin.document.getElementById('seeker-bar');
    if (seeker) seeker.style.width = `${(state.currentTime / state.duration) * 100}%`;
    
    const ppBtn = pipWin.document.getElementById('playpause');
    if (ppBtn) {
        const targetIcon = (state.paused) ? ICON_PLAY : ICON_PAUSE;
        if (ppBtn.innerHTML !== targetIcon) ppBtn.innerHTML = targetIcon;
    }

    ctx.clearRect(0, 0, w, h);

    let activeIdx = lyricLines.findIndex((l, i) => 
        state.currentTime >= l.time && (!lyricLines[i+1] || state.currentTime < lyricLines[i+1].time)
    );
    if (activeIdx === -1) activeIdx = 0;

    const spacing = vh * 22; 
    targetScroll = activeIdx * spacing;
    scrollPos += (targetScroll - scrollPos) * 0.1;

    ctx.save();
    ctx.translate(w / 2, (h / 2) - scrollPos);

    lyricLines.forEach((line, i) => {
        const dist = Math.abs(i - activeIdx);
        ctx.globalAlpha = Math.max(0.1, 1 - dist * 0.3);
        ctx.textAlign = "center";
        
        const y = i * spacing;
        const isCurrent = (i === activeIdx);

        if (line.romaji) {
            const romajiSize = vh * 4;
            ctx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
            ctx.fillStyle = "#F5AF19";
            wrapText(ctx, line.romaji, 0, y - (vh * 6), w * 0.85, romajiSize * 1.2, true);
        }

        const mainSize = isCurrent ? vh * 4.5 : vh * 3.5;
        ctx.font = isCurrent ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
        ctx.fillStyle = isCurrent ? "#1DB954" : "#FFFFFF";
        
        if (isCurrent) {
            ctx.shadowColor = "rgba(29, 185, 84, 0.5)";
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }

        wrapText(ctx, line.text, 0, y, w * 0.85, mainSize * 1.2, false);
    });

    ctx.restore();
    
    pipWin.requestAnimationFrame(renderLoop); 
}

function injectStructure() {
    const doc = pipWin.document;
    doc.body.innerHTML = `
        <div id="bg-cover"></div>
        <canvas id="lyricCanvas"></canvas>
        <button id="back-btn">⤺ Back to tab</button>
        <div id="ui-container">
            <div id="seeker-container"><div id="seeker-bar"></div></div>
            <div id="controls">
                <button class="btn" id="prev">${ICON_PREV}</button>
                <button class="btn" id="playpause">${ICON_PAUSE}</button>
                <button class="btn" id="next">${ICON_NEXT}</button>
            </div>
        </div>
        <style>
            #back-btn {
                position: absolute; top: 15px; left: 15px;
                background: rgba(255,255,255,0.2); border: none;
                color: white; padding: 8px 15px; border-radius: 20px;
                font-weight: bold; cursor: pointer; backdrop-filter: blur(5px);
                font-family: 'Segoe UI', sans-serif; opacity: 0; transition: opacity 0.2s;
                z-index: 20;
            }
            body:hover #back-btn { opacity: 1; }
            #back-btn:hover { background: rgba(255,255,255,0.4); }
        </style>
    `;
    
    const click = (sel) => document.querySelector(sel)?.click();
    doc.getElementById('prev').onclick = () => click('[data-testid="control-button-skip-back"], .previous-button');
    doc.getElementById('next').onclick = () => click('[data-testid="control-button-skip-forward"], .next-button');
    doc.getElementById('playpause').onclick = () => click('[data-testid="control-button-playpause"], .play-pause-button');
    
    doc.getElementById('back-btn').onclick = () => pipWin.close();
    
    doc.getElementById('seeker-container').onclick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        
        const p = document.querySelector('video, audio');
        if (p && p.duration > 0) {
            p.currentTime = percent * p.duration;
        }

        // --- THE POINTER EVENT FIX ---
        const spotifyProgressBar = document.querySelector('[data-testid="progress-bar"]');
        if (spotifyProgressBar) {
            const spRect = spotifyProgressBar.getBoundingClientRect();
            const targetX = spRect.left + (percent * spRect.width);
            const targetY = spRect.top + (spRect.height / 2);
            
            const pointerDown = new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true,
                clientX: targetX, clientY: targetY, pointerId: 1, pointerType: 'mouse'
            });
            spotifyProgressBar.dispatchEvent(pointerDown);
            
            const pointerUp = new PointerEvent('pointerup', {
                bubbles: true, cancelable: true,
                clientX: targetX, clientY: targetY, pointerId: 1, pointerType: 'mouse'
            });
            spotifyProgressBar.dispatchEvent(pointerUp);
        }
    };
}

// --- 2. LAUNCHER ---

const createLauncher = () => {
    const host = window.location.hostname;
    if (!host.includes('spotify') && !host.includes('music.youtube')) return;

    if (document.getElementById('pip-trigger')) return;
    const btn = document.createElement('button');
    btn.id = 'pip-trigger';
    btn.innerText = '🎵 FLYING LYRICS';
    Object.assign(btn.style, {
        position: 'fixed', top: '80px', right: '20px', zIndex: 99999,
        padding: '10px 20px', background: '#1DB954', color: '#fff',
        border: 'none', borderRadius: '50px', cursor: 'pointer',
        fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    });
    
    btn.onclick = async () => {
        try {
            pipWin = await window.documentPictureInPicture.requestWindow({ width: 300, height: 300 });
            
            const link = pipWin.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = chrome.runtime.getURL('styles.css');
            pipWin.document.head.appendChild(link);

            injectStructure();
            fetchLyrics();
            
            pipWin.requestAnimationFrame(renderLoop);
        } catch (e) {
            console.error("Launch Failed:", e);
        }
    };

    document.body.appendChild(btn);
};

setInterval(createLauncher, 2000);