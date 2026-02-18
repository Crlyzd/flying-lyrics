// --- GLOBAL STATE ---
let currentTrack = "";
let lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "" }];
let scrollPos = 0;
let targetScroll = 0;
let pipWin = null;
// --- ICONS (SVG STRINGS) ---
const ICON_PREV = `<svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24"><line x1="10" y1="4" x2="10" y2="20"></line><line x1="14" y1="4" x2="14" y2="20"></line></svg>`;
let canvas, ctx;

// --- 1. CORE FUNCTIONS ---

// THE WRAPPER ALGORITHM (Now handles UPWARD wrapping for Romaji)
function wrapText(ctx, text, x, y, maxWidth, lineHeight, growUpwards = false) {
    const words = text.split(' ');
    let line = '';
    const lines = [];

    // 1. Calculate all lines first
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

    // 2. Determine Start Y
    // If growing upwards (Romaji), we shift start Y up based on number of lines
    let currentY = growUpwards ? y - ((lines.length - 1) * lineHeight) : y;

    // 3. Draw
    for (let k = 0; k < lines.length; k++) {
        ctx.fillText(lines[k], x, currentY);
        currentY += lineHeight;
    }
}

async function fetchLyrics() {
    const meta = navigator.mediaSession.metadata;
    if (!meta) return;

    if (pipWin && pipWin.document) {
        const art = meta.artwork?.[0]?.src || "";
        const bg = pipWin.document.getElementById('bg-cover');
        if (bg) bg.style.backgroundImage = `url(${art})`;
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
                } catch (e) { /* silent fail */ }
            }
            temp.push({ time, text, romaji });
        }
        lyricLines = temp.length ? temp : [{ time: 0, text: "No Lyrics Available", romaji: "" }];
    } catch (e) {
        lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
    }
}

function renderLoop() {
    if (!pipWin || pipWin.closed) return;

    const meta = navigator.mediaSession.metadata;
    const nowTitle = meta?.title || "";
    if (nowTitle !== currentTrack) {
        currentTrack = nowTitle;
        fetchLyrics();
    }

    if (!canvas) canvas = pipWin.document.getElementById('lyricCanvas');
    if (!canvas) return requestAnimationFrame(renderLoop);
    if (!ctx) ctx = canvas.getContext('2d');

    const w = pipWin.innerWidth;
    const h = pipWin.innerHeight;
    canvas.width = w; 
    canvas.height = h;

    const vh = h / 100;
    const player = document.querySelector('video, audio');
    const currentTime = player?.currentTime || 0;
    const duration = player?.duration || 1;

    const seeker = pipWin.document.getElementById('seeker-bar');
    if (seeker) seeker.style.width = `${(currentTime / duration) * 100}%`;
    
    const ppBtn = pipWin.document.getElementById('playpause');
    if (ppBtn) {
        // Only update if the icon actually changed to save performance
        const targetIcon = (player?.paused) ? ICON_PLAY : ICON_PAUSE;
        if (ppBtn.innerHTML !== targetIcon) ppBtn.innerHTML = targetIcon;
    }

    ctx.clearRect(0, 0, w, h);

    let activeIdx = lyricLines.findIndex((l, i) => 
        currentTime >= l.time && (!lyricLines[i+1] || currentTime < lyricLines[i+1].time)
    );
    if (activeIdx === -1) activeIdx = 0;

    const spacing = vh * 22; // More spacing for double-wrapped lines
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

        // 1. Draw ROMAJI (Wrapped, Growing Upwards)
        if (line.romaji) {
            const romajiSize = vh * 4;
            ctx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
            ctx.fillStyle = "#F5AF19";
            // We pass 'true' for growUpwards so it stacks up
            wrapText(ctx, line.romaji, 0, y - (vh * 6), w * 0.85, romajiSize * 1.2, true);
        }

        // 2. Draw MAIN TEXT (Wrapped, Growing Downwards)
        const mainSize = isCurrent ? vh * 4.5 : vh * 3.5;
        ctx.font = isCurrent ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
        ctx.fillStyle = isCurrent ? "#1DB954" : "#FFFFFF";
        
        if (isCurrent) {
            ctx.shadowColor = "rgba(29, 185, 84, 0.5)";
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }

        // wrapText(ctx, text, x, y, maxWidth, lineHeight, growUpwards)
        wrapText(ctx, line.text, 0, y, w * 0.85, mainSize * 1.2, false);
    });

    ctx.restore();
    requestAnimationFrame(renderLoop);
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
    
    // ... keep the rest of the click handlers ...
    const click = (sel) => document.querySelector(sel)?.click();
    doc.getElementById('prev').onclick = () => click('[data-testid="control-button-skip-back"], .previous-button');
    doc.getElementById('next').onclick = () => click('[data-testid="control-button-skip-forward"], .next-button');
    doc.getElementById('playpause').onclick = () => click('[data-testid="control-button-playpause"], .play-pause-button');
    
    doc.getElementById('back-btn').onclick = () => pipWin.close();
    
    doc.getElementById('seeker-container').onclick = (e) => {
        const p = document.querySelector('video, audio');
        if (p) {
            const rect = e.currentTarget.getBoundingClientRect();
            p.currentTime = ((e.clientX - rect.left) / rect.width) * p.duration;
        }
    };
}

// --- 2. LAUNCHER ---

const createLauncher = () => {
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
            pipWin = await window.documentPictureInPicture.requestWindow({ width: 500, height: 500 });
            
            const link = pipWin.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = chrome.runtime.getURL('styles.css');
            pipWin.document.head.appendChild(link);

            injectStructure();
            fetchLyrics();
            requestAnimationFrame(renderLoop);
        } catch (e) {
            console.error("Launch Failed:", e);
        }
    };

    document.body.appendChild(btn);
};

setInterval(createLauncher, 2000);