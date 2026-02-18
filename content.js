let currentTrack = "";

const createBtn = () => {
  if (document.getElementById('pip-lyrics-trigger')) return;
  const btn = document.createElement('button');
  btn.id = 'pip-lyrics-trigger';
  btn.innerHTML = '🎵 LYRICS';
  btn.style.cssText = 'position:fixed; top:60px; right:20px; z-index:2147483647; padding:12px 20px; background:#1DB954; color:white; border-radius:30px; border:2px solid white; cursor:pointer; font-weight:bold; box-shadow: 0 4px 15px rgba(0,0,0,0.5);';
  (document.body || document.documentElement).appendChild(btn);
  btn.onclick = () => startLyricWindow();
};

async function startLyricWindow() {
  const pipWin = await window.documentPictureInPicture.requestWindow({ width: 400, height: 600 });
  const doc = pipWin.document;
  
  // FIXED CSS: Added background-repeat and a dark overlay for readability
  const style = doc.createElement('style');
  style.textContent = `
    html, body { 
      height: 100%; 
      margin: 0; 
      padding: 0; 
      overflow-y: auto !important; 
      background-color: #000;
    }
    body { 
      color: #fff; 
      font-family: sans-serif; 
      text-align: center;
      background-attachment: local;
      background-repeat: repeat; /* This fills the vertical space */
      background-size: contain;  /* Keeps the cover art from pixelating */
    }
    /* Dark overlay to make sure lyrics stay readable over the artwork */
    #overlay {
      background: rgba(0, 0, 0, 0.6); 
      min-height: 100%;
      width: 100%;
      padding: 20px 0;
    }
    #lyric-container { padding: 0 20px; }
    h3 { color: #1DB954; font-size: 24px; text-shadow: 2px 2px 4px #000; }
    .artist-name { color: #ccc; font-size: 16px; margin-bottom: 20px; text-shadow: 1px 1px 2px #000; }
    .lyric-item { margin-bottom: 35px; }
    .romaji { display: block; font-size: 20px; color: #f5af19; font-weight: bold; font-style: italic; margin-bottom: 10px; text-shadow: 2px 2px 4px #000; }
    .original { font-size: 18px; text-shadow: 2px 2px 4px #000; }
  `;
  doc.head.append(style);
  
  const overlay = doc.createElement('div');
  overlay.id = "overlay";
  const container = doc.createElement('div');
  container.id = "lyric-container";
  overlay.append(container);
  doc.body.append(overlay);

  updateLyrics(container, doc);

  const observer = setInterval(() => {
    const activeTrack = navigator.mediaSession.metadata?.title || "";
    if (activeTrack !== currentTrack) {
      currentTrack = activeTrack;
      updateLyrics(container, doc);
    }
    if (pipWin.closed) clearInterval(observer);
  }, 3000);
}

async function updateLyrics(container, doc) {
  const metadata = navigator.mediaSession.metadata;
  const title = metadata?.title || "Unknown Track";
  const artist = metadata?.artist || "";
  const artworkUrl = metadata?.artwork?.[0]?.src || "";

  // Update Background Image
  if (artworkUrl) {
    doc.body.style.backgroundImage = `url(${artworkUrl})`;
  }

  container.innerHTML = `<h3>${title}</h3><p>AI Romanizing...</p>`;

  try {
    const res = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
    const data = await res.json();

    if (!data || !data.plainLyrics) {
      container.innerHTML = `<h3>${title}</h3><p style="color:#ff4444; font-weight:bold; margin-top:50px;">NO LYRIC AVAILABLE</p>`;
      return;
    }

    container.innerHTML = `<h3>${title}</h3><div class="artist-name">${artist}</div><hr style="border:0; border-top:1px solid rgba(255,255,255,0.4); margin:20px 0;">`;
    
    const lines = data.plainLyrics.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const lineDiv = doc.createElement('div');
      lineDiv.className = "lyric-item";
      container.appendChild(lineDiv);

      if (/[぀-ゟ゠-ヿ一-鿿가-힣]/.test(line)) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(line)}`;
        const transRes = await fetch(url);
        const transData = await transRes.json();
        const romaji = transData?.[0]?.[0]?.[3] || "";
        
        lineDiv.innerHTML = `<span class="romaji">${romaji}</span><span class="original">${line}</span>`;
      } else {
        lineDiv.innerHTML = `<span class="original">${line}</span>`;
      }
    }
  } catch (e) {
    container.innerHTML = "<h3>Error fetching lyrics</h3>";
  }
}

setInterval(createBtn, 3000);