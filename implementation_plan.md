# Hybrid Picture-in-Picture Modes

Introduce a setting that allows users to toggle between two distinct architectural layouts for the Picture-in-Picture (PiP) window:
1. **Standard HTML (Document PiP)**: Full HTML layout with active interactive overlays (volume, track buttons, translate toggle, clickable seeking, hover tooltips). However, Chrome forces a visible window title bar with the site's origin for security.
2. **Borderless Canvas (Video PiP)**: Streams the rendering `<canvas>` into a native floating `<video>` container. This results in a completely clean, borderless floating window with no title bar. However, it is completely non-interactive (custom buttons cannot be clicked/hovered inside the PiP).

---

## User Review & Design Decisions

### 1. Stripped-out UI Controls in Video PiP Mode
* **Decision**: All custom interactive HTML UI overlays present in Document PiP are **completely stripped out** in Video PiP mode:
  * **Mute Button**: Stripped out entirely. Muting must be done via the browser tab or OS/system volume controls.
  * **Back to Tab Button**: Stripped out entirely. Returning to the tab is done via browser-native PiP buttons or closing the window.
  * **Translate (CC) Button**: Stripped out entirely.
  * **Seeker Bar & Visualizer**: Stripped out entirely. Only lyrics and album art/gradients are drawn on the canvas, keeping the canvas extremely clean.

### 2. Supported Native Hover Controls
* **Details**: The native browser hover controls in Video PiP are restricted to standard actions supported by the browser and the Media Session API:
  * **Supported**: Play/Pause, Next Track, Previous Track.
  * **Not Supported**: Volume adjustments, muting, or custom actions.

### 3. File Structure & Modularity Decisions
* **Decision**: We will proceed with **Option A**:
  * Create a **new file** `src/content/pipDrivers.js` and update `manifest.json` to load it.
  * This cleanly separates all driver-specific logic (DOM instantiation, resizing listeners, and streaming hooks) from the main UI injection script.
* **Customization Settings Code**: The existing customization options (Font Size, Blur, Spacing, alignment, etc.) in the preferences panel will **not require any code changes**. The same storage variables will be updated, but the canvas renderer will handle applying them directly using canvas APIs instead of CSS.

---

## Proposed Changes

### Configuration & Preferences

#### [MODIFY] [config.js](file:///e:/Default/DEVS/Flying%20Lyricss/flying-lyrics/src/content/config.js)
- Add `pipMode: 'document'` to the default settings object (`window.FLYING_LYRICS.defaults`) to represent the two modes (`'document'` and `'video'`).

---

### Popup Settings UI

#### [MODIFY] [popup.html](file:///e:/Default/DEVS/Flying%20Lyricss/flying-lyrics/src/popup/popup.html)
- Add a new settings toggle card in Slide 1 (above or below Auto-Launch) for "Borderless PiP Mode".
- Include subtext describing the trade-off (hides title bar, disables button interactions inside the PiP window).

#### [MODIFY] [popup.js](file:///e:/Default/DEVS/Flying%20Lyricss/flying-lyrics/src/popup/popup.js)
- Add `pipMode: 'document'` to `fallbackDefaults`.
- Bind event listener to the new switch toggle to save settings in `chrome.storage.local` and broadcast the `SETTINGS_UPDATE` message to active tabs.
- Set/restore toggle state on popup load.

---

### Content Script Logic

#### [MODIFY] [content.js](file:///e:/Default/DEVS/Flying%20Lyricss/flying-lyrics/src/content/content.js)
- Read `pipMode` from storage on initialization and store it as `fl.pipMode`.
- Update `fl.pipMode` when receiving a `SETTINGS_UPDATE` message.

#### [MODIFY] [ui.js](file:///e:/Default/DEVS/Flying%20Lyricss/flying-lyrics/src/content/ui.js)
- In the launch trigger listener (`btn.onclick`):
  - Check `fl.pipMode`.
  - If `fl.pipMode === 'video'`:
    - Create a hidden (or offscreen) `<video>` element in the main tab context.
    - Set up a stream from the tab's rendering `<canvas>` using `fl.canvas.captureStream(30)`.
    - Set `video.srcObject = stream` and call `video.requestPictureInPicture()`.
    - Store the resulting picture-in-Picture window reference as needed (e.g., listening for `'leavepictureinpicture'` to perform cleanup).
  - If `fl.pipMode === 'document'`, retain the current `documentPictureInPicture.requestWindow()` flow.

#### [MODIFY] [renderer.js](file:///e:/Default/DEVS/Flying%20Lyricss/flying-lyrics/src/content/renderer.js)
- Update `renderLoop` to bypass DOM overlays when running in Video PiP mode:
  - Skip trying to cache or update elements like `seekerContainer`, `ppBtn`, and `muteBtn` (since there's no PiP document DOM).
  - Ensure the render loop keeps running and drawing to the canvas context, which is captured by the video stream.
  - Implement canvas-resizing logic when the native PiP window dimensions change (Video PiP triggers resize events differently, so we must handle canvas resizing cleanly).
- **Canvas-based Customizations implementation in Video PiP Mode**:
  - **Background Cover Image Drawing**: Load the active track cover art as an image object and draw it directly onto the canvas.
  - **Cover Background Mode (Fill, Center, Repeat)**:
    - *Fill*: Scale and crop the image to cover the canvas viewport.
    - *Repeat*: Create a repeating pattern via `ctx.createPattern(img, 'repeat')` and fill the canvas.
    - *Center*: Draw the image centered at its native aspect ratio.
  - **Background Blur**: Apply canvas filter `ctx.filter = 'blur(' + fl.userBgBlur + 'px)'` before drawing the background cover image (then reset the filter for lyrics).
  - **Background Darkness**: Fill a solid rectangle `ctx.fillStyle = 'rgba(0, 0, 0, ' + fl.userBgDarkness / 100 + ')'` on top of the background image before rendering text.
  - **Album Cover Mode**: When `fl.albumCoverMode` is enabled, bypass text layout rendering and draw a large centered album cover with drop shadows directly in the center of the canvas.
  - **Glow and Fonts**: Keep existing canvas text-shadow glow logic (already fully canvas-based). Custom fonts are pre-loaded in the parent tab document.

---

## Verification Plan

### Manual Verification
- Load the modified extension.
- Open the settings popup and verify the new "Borderless PiP Mode" toggle is present.
- **Test 1: Document PiP Mode (Toggle Off)**:
  - Click "Flying Lyrics" to launch the PiP.
  - Verify that the window title bar is visible.
  - Verify that custom button interactions (prev, next, play/pause, CC translation) and seeker clicks function correctly.
- **Test 2: Borderless Video PiP Mode (Toggle On)**:
  - Toggle Borderless Mode on.
  - Click "Flying Lyrics" to launch the PiP.
  - Verify that the window has **no title bar** (is borderless).
  - Verify that the lyrics scroll smoothly and match the audio/video.
  - Verify that closing the window terminates the stream correctly.
