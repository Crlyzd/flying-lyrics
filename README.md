# Flying Romanized Lyrics 🎵

> [!NOTE]
> ALL LYRICS PANEL FOR SPOTIFY AND YOUTUBE MUSIC IN THE WHOLE INTERNET IS TRASH (IF YOU FOUND A BETTER ONE PLEASE TELL ME SO I CAN DITCH MY RELEASE) BECAUSE THEY COULD NOT EVEN ROMANIZED JAPANESE OR KOREAN LETTERS SO I MADE THIS SIMPLE EXTENSION FOR CHROMIUM BROWSER

A browser extension that creates a floating **Picture-in-Picture (PiP)** window to show lyrics from Spotify and YouTube Music with AI-powered Romanization and live Translation.

<img width="885" height="1177" alt="{ED81112B-FFF7-43C2-9AA8-783643252E36}" src="https://github.com/user-attachments/assets/8440b55f-ee5d-4e90-9ad2-707156b4e2cd" />


## ✨ Features

### 1. 🎤 Advanced 3-Line Lyrics Engine
Unlike standard lyrics displays, this extension provides a rich 3-line format for multi-lingual listeners:
- **Romaji / Pinyin / Zhuyin**: Automatically generated for Japanese, Korean, and Chinese (CJK) songs. Styled in *Gold/Italic*.
- **Original Lyrics**: The main timestamped lyrics. Styled in **Bold**.
- **Live Translation**: Real-time translation into your language of choice. Powered by Google Translate API.

### 2. 🎨 Dynamic Visuals & Aesthetics
- **Adaptive Coloring**: The extension extracts dominant colors from the current track's album art. Lyrics and accents dynamically change color to match the aesthetic of the song.
- **Glassmorphism UI**: High-fidelity PiP window with modern shadows, gradients, and responsive layouts.
- **Floating PiP Window**: Keep your lyrics visible while browsing other tabs using the Document Picture-in-Picture API.

### 3. 🕹️ Interactive Controls
- **Enhanced Player UI**: Thick, high-visibility SVG controls for Play/Pause, Skip, and Mute.
- **Translation Toggle (CC)**: Quickly toggle translations on/off directly from the PiP window.
- **Mute Control**: Dedicated mute button for convenience.

### 4. ⚙️ Smart Settings & Persistence
- **Customizable Language**: Choose your preferred translation language in the extension popup.
- **Sync Offset Tool**: Adjust lyric timing in ±100ms increments to fix desynced tracks.
- **Song-Specific Memory**: The extension remembers your sync offset adjustments for individual songs, so you don't have to fix the same song twice!

## 🚀 Installation

1.  Download the `Flying Lyrics.zip` from the [Releases](https://github.com/Crlyzd/flying-lyrics/releases) page.
2.  **Extract** the zip file into a permanent folder on your computer.
3.  Open `edge://extensions/` (or `chrome://extensions/`).
4.  Toggle **Developer mode** ON.
5.  Click the **Load unpacked** button.
6.  Select the folder where you just extracted the files (the folder containing `manifest.json`).

<img width="478" height="558" alt="{8F2C30E7-C7C5-4AA9-8713-2D774F85A36E}" src="https://github.com/user-attachments/assets/4ede8b8d-4f2c-48e8-823a-ecacc83f8145" />

## 🛠️ Built With

*   **Core**: Vanilla JavaScript (ES6+), HTML5, CSS3
*   **APIs**:
    *   [Document Picture-in-Picture API](https://developer.chrome.com/docs/web-platform/document-picture-in-picture/) (for the floating window)
    *   [MediaSession API](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession) (for track information)
    *   [LRCLIB API](https://lrclib.net/) (for high-quality synced lyrics)
    *   Google Translate API (for AI Romanization and Translation)

## CURRENT BUG
- The seek bar might act weirdly when using Spotify, fuck you Spotify 🖕🖕🖕🖕

## 📝 License
This project is open-source and available under the MIT License.
