# Flying Lyrics 🎵 - Romanize Your Lyrics ✨✨

> [!NOTE]
> ALL LYRICS PANEL FOR SPOTIFY AND YOUTUBE MUSIC IN THE WHOLE INTERNET IS TRASH (IF YOU FOUND A BETTER ONE PLEASE TELL ME SO I CAN DITCH MY RELEASE) BECAUSE THEY COULD NOT EVEN ROMANIZED JAPANESE OR KOREAN LETTERS SO I MADE THIS SIMPLE EXTENSION FOR CHROMIUM BROWSER

<img width="1611" height="1319" alt="image" src="https://github.com/user-attachments/assets/73ad54a2-9339-41e0-9dbb-69fd3d753c3d" />

# 🎵 Flying Lyrics - Romanize Your Lyrics
**Lyrics that follow you wherever you go. Flying Lyrics is a floating browser extension that pulls in synchronized lyrics, romanization, and translations so you can sing along while multitasking without ever switching tabs.**

## ✨ Key Features

### 🚀 The "Always-on-Top" Player
* **Floating Window:** Watch your lyrics in a small, resizable window that stays on top of everything else on your screen.
* **Spotify & YouTube Music:** Works perfectly with both Spotify Web Player and YouTube Music.
* **Borderless Mode (Video PiP):** Toggle Borderless Mode in the settings to run native Video Picture-in-Picture. This hides title bars and window borders, providing a clean, completely borderless overlay.
* **Bi-directional Controls:** Sync playback controls directly from the native PiP window back to Spotify or YouTube Music. Controlling volume, pausing, or playing from the borderless window works seamlessly.
* **No Setup Required:** Automatically finds and downloads the right lyrics as soon as you hit play.
* **Multi-Source Support:** Automatically fetches from LRCLIB (Default), Netease, or your Local Files.
* **Local LRC Support:** Have a rare track? Load your own `.lrc` files directly into the player.
* **Auto-Launch:** Enable "Auto-Launch Lyrics" in settings to have the player open automatically when music starts.

<img width="284" height="284" alt="image" src="https://github.com/user-attachments/assets/9d2ea346-2584-41ba-bcd6-3d6cce931002" />
<img width="242" height="320" alt="image" src="https://github.com/user-attachments/assets/7113301b-514a-482d-9325-7ec231b62e1c" />

### 🌍 Read & Understand Everything
* **Triple-Layer View:** See original lyrics, romanization (supporting **Japanese, Korean, or Mandarin**), and translations—all at the same time.
* **Non-Blocking Translations:** Lyrics render immediately upon download; translation queries and local storage caching run asynchronously in the background so you never have to wait.
* **Auto-Detected Translation:** Automatically matches your browser or operating system's language to select the default translation locale (supporting 18 languages).
* **Instant Translation:** Uses Google Translate to provide translations on the fly if none are available.
* **Cinematic Feel:** The current line glows and stays in focus, while inactive lines fade out.
* **Smart "Pseudo-Scroll":** For unsynced lyrics, the panel automatically scrolls based on song duration and line count.
* **Sync Indicators:** Easily see whether you are viewing Synced, Unsynced, or No Lyrics with a color-coded status badge (Emerald Green for Synced, Slate Gray for Unsynced, Amber/Gold for No Lyrics) featuring text glows and spin animations. Works in both Document and Video PiP modes!

<img width="138" height="135" alt="Sync Indicator" src="https://github.com/user-attachments/assets/db46a459-24a1-4b2e-a0ae-90d81ceb5c3a" />

### 🎨 Beautiful & Adaptive Design
* **Matching Colors:** The window automatically extracts colors from your song's album art using our new **custom K-Means algorithm**. It is incredibly lightweight, fast, and replaces heavy external libraries to keep your browser running fast.
* **Smart Color Swatch Selection:** Evaluates saturation, population, and lighting levels across 4 separate analysis passes to pick the most vibrant colors for your interface, even with tricky or complex album artwork.
* **Galaxy Mode & Theme Customization:** Go beyond defaults! Enable **Galaxy Mode** to enjoy animated floating background blobs and twinkling stars. Choose from 30 beautiful designer presets (such as Orion, Sunset, Cyberpunk, Void, and Solar Flare) neatly organized into thematic groups (Cosmic, Nature, Cyber, Minimal), or customize your own colors using HSL sliders.
* **Organized Visual Controls:** All your visual settings (fonts, layout, colors, backdrops) are now neatly grouped into collapsible "Typography & Layout" and "Backdrop & Effects" sections to keep the settings menu clean and save space.
* **Smart Text Contrast System:** The player automatically calculates background brightness to adjust slider knobs, active buttons, tags, and settings text to black or white, ensuring perfect readability regardless of what custom colors you select.
* **Spotify Green Fallback:** Switching off Galaxy Mode cleanly restores standard Spotify green layouts without any color bleed from your custom themes.
* **Cloud Font Previews & Fail-safes:** Choose from thousands of Google Fonts with real-time previews. If a font fails to load, the system safely reverts to your last working font and highlights the issue with a warning indicator.
* **Optimized Album Cover Mode:** Hide text lyrics to vibe with the album art alone. This mode pauses all text drawing operations, dropping computer resource usage down to near-zero for static displays.
* **Rounded Album Art & Drop Shadows:** Album covers feature a sleek, viewport-scaled border-radius with smooth clipping and a subtle, premium drop-shadow box.
* **Advanced Visual Menu:** Dial in the look with adjustable **Blur** and **Darkness** options for the album cover background to make the lyrics pop.
* **Performance Warning Indicator:** A warning badge dynamically appears under the "Aura" option to let you know that heavy text glow filters might impact your device's performance.
* **Background Modes:** Choose how your background looks with **Center**, **Repeat**, or **Fill** modes.
* **Dynamic Aurora & Twinkling Sparkles:** When waiting for music or loading lyrics, enjoy a smooth animated aurora gradient that shifts dynamically alongside a premium particle system that spawns 25 twinkling sparkles (reduced to 8 sparkles and frozen in Eco Mode to conserve power) and cross-flare stars.
* **High-Res Art Upgrades:** Spotify and YouTube Music album artwork URLs are automatically upgraded to high resolution (up to 640x640 for Spotify and 544x544 for YouTube Music).

<img width="1626" height="1278" alt="image" src="https://github.com/user-attachments/assets/9caeb6ef-a925-41a1-8623-b3699ceca706" />

### 🕹️ Full Control at Your Fingertips
* **Universal Language Support:** Play/pause controls work perfectly regardless of your browser's display language. Uses direct HTML5 media elements state monitoring and a smart SVG path shape analyzer to translate click actions.
* **Manual Cloud Search:** Can't find the right match? Search by Artist and Title to browse and pick the perfect version.
* **Built-in Lyrics Editor:** Notice a typo or a lyric that's out of sync? Open the popup editor to manually fix the text or timing tags, and save your custom version directly to your extension. It is now restricted to a single window instance, automatically focusing your existing tab if you try to open it again!
* **Theme-Adaptive Lyrics Editor:** The built-in Lyrics Editor now automatically styles itself to match your current custom Galaxy colors.
* **Built-in Controls:** Pause, skip, or scrub through the song using the seeker bar directly inside the floating window.
* **Timing Fixes:** Use the Sync Offset buttons to line up lyrics perfectly. Use the **"Set Global"** button to set a universal timing baseline for your entire library.
* **Smart Memory:** The extension remembers your timing fixes for every song so you only have to fix it once.
* **Automatic Cloud Settings Sync:** Your visual settings, option preferences, and custom theme configs now automatically synchronize across all of your Chrome browsers/devices (with a simple toggle to use local storage instead).
* **One-Click Music Launchers:** Open or jump straight to Spotify or YouTube Music player tabs using new quick-launch buttons directly in the control panel. If the tab is already open, it automatically switches to it!
* **Settings Portability:** Easily **Export and Import** your configurations to keep your setup consistent across different devices.
* **Dynamic Help Button:** A handy "Help, how to use Flying Lyrics ??" button appears in the extension popup for quick access to setup and onboarding guides.

<img width="674" height="647" alt="image" src="https://github.com/user-attachments/assets/b3367b4c-5c34-48d7-a0bb-c379354dcc79" />

### ⚡ Smarter Performance & Polished Experience
* **Tiered Lyric Searching:** Smarter and faster lyric lookups! Dynamically adjusts search depth based on whether synced candidates exist (e.g. Netease vs LRCLIB) to reduce network waste and rate limiting.
* **Silky Smooth Animations:** The lyrics scrolling engine is incredibly lightweight and uses **frame-rate independent scrolling (delta-time physics)** to deliver butter-smooth animation whether you're using a standard 30Hz/60Hz display or a high-refresh rate screen.
* **Cinematic Scroll Easing:** Large timing jumps instantly teleport close to the destination line before smoothly easing in, eliminating lag spikes.
* **Eco Mode (Reduce CPU):** Enable **Eco Mode** to restrict background processing (capping frames at 30 FPS for floating windows and 20 FPS for borderless overlay), limit dynamic background animations, reduce canvas resolutions to 480px, and dynamically pause updates when idle to keep battery drain to an absolute minimum.
* **Battery Saver (Idle Throttle):** Redrawing pauses completely when lyrics are static or playback is paused (waking up just a few times a second under the hood) to reduce computer load to zero.
* **Small Window Throttling:** If you shrink the floating window to a tiny size (less than 140x140px), the graphics engine automatically dials down updates to preserve resources.
* **YouTube Music Autoplay Stability:** Built-in workaround to prevent seeker bar input freezes during YouTube Music's autoplay transitions, keeping controls fully responsive.
* **Background Cache Rendering:** Uses a smart offscreen background canvas cache for blurred visuals, saving CPU cycles by avoiding heavy real-time CSS/canvas filters on every frame.
* **Welcome Onboarding Guide:** First time installing? A brand-new setup guide (featuring a video tutorial at https://youtu.be/f-DYtvHDSas) will walk you through exactly how to launch the floating window. If no active player is found, it can automatically open YouTube Music for you.
* **Handy Tooltips & Indicators:** Hover over the progress bar to see exact timestamps before skipping, and get clearer status bubbles that tell you if lyrics are synced, unsynced, or still retrying.
* **Privacy-First Performance Tracking:** To make Flying Lyrics faster and better, we optionally collect anonymous speed metrics (like how fast lyrics load). You have full control with an easy opt-out switch in the welcome screen.

<img width="309" height="605" alt="image" src="https://github.com/user-attachments/assets/b3dddd6d-a437-47a8-8a12-6ba94849b05f" />
<img width="324" height="601" alt="image" src="https://github.com/user-attachments/assets/b1b9738a-7382-4eb6-9061-c3f10e36e9d8" />
<img width="324" height="601" alt="image" src="https://github.com/user-attachments/assets/ccf0c899-aea6-4d10-b070-02a2eecaf773" />
<img width="324" height="575" alt="image" src="https://github.com/user-attachments/assets/c50db21e-f827-4f50-a78a-e3e7dc2afe78" />
<img width="305" height="562" alt="image" src="https://github.com/user-attachments/assets/701f957b-618e-4312-8a7d-838164172bf3" />


---

## 🚀 Installation
1. Install the extension.
2. Navigate to [Spotify Web Player](http://googleusercontent.com/spotify.com/4) or [YouTube Music](https://music.youtube.com/).
3. Locate the green "♫ FLYING LYRICS" button:
   - **YouTube Music:** Top right corner of the page.
   - **Spotify:** Bottom right corner of the playback bar, next to the volume and queue icons.
4. Click to launch the Picture-in-Picture window and enjoy!

<img width="620" height="430" alt="YT Music Location" src="https://github.com/user-attachments/assets/2b0c0b54-bb32-48d6-84e7-6f4db47e5a4d" />
<br>
<img width="240" height="172" alt="Image" src="https://github.com/user-attachments/assets/9a0f7026-d777-4925-9ec2-93ee656fa06e" />

---

## ⚠️ Known Limitations & Tips
* **Translation Speed:** Due to the free Google Translate API, translations may take 1-2 seconds to load.
* **API Protection:** Avoid switching translation languages too rapidly to prevent temporary API rate-limiting.

---

Made with 💖 by Kaleksanan Bagus

☕ Buy me a coffee [Saweria](https://saweria.co/curlyzed) [PayPal](https://paypal.me/BagusMassani)

---
