// This script is injected into the MAIN world of the YouTube Music page, bypassing the
// Chrome Extension "Isolated World" boundary. It receives a target seek percentage 
// from the content script and executes the seek directly using YouTube's internal engine.

(function() {
    const scriptEl = document.currentScript;
    if (!scriptEl) return;
    
    // Read the seek percentage passed via the data attribute by ui.js
    const percent = parseFloat(scriptEl.dataset.percent);
    if (isNaN(percent)) return;

    // Approach 1: Try YTM's application-layer API first.
    // This API abstracts gapless playback and maps percentages directly to the active track.
    const bar = document.querySelector('ytmusic-player-bar');
    if (bar && bar.playerApi_ && typeof bar.playerApi_.getDuration === 'function' && typeof bar.playerApi_.seekTo === 'function') {
        const trackDuration = bar.playerApi_.getDuration();
        if (trackDuration > 0) {
            bar.playerApi_.seekTo(percent * trackDuration, true);
            return;
        }
    }

    // Approach 2: If the API isn't bound, simulate a native slider change strictly
    // as if the user dragged the dot on the `#progress-bar`.
    // Because this executes in the MAIN world, Polymer's two-way data bindings process
    // the UI update accurately within the boundaries of the current track.
    const pb = document.querySelector('#progress-bar.ytmusic-player-bar');
    if (pb && typeof pb.max !== 'undefined') {
        pb.value = percent * parseFloat(pb.max);
        // CustomEvent triggers the framework to commit the slider value to the player engine
        pb.dispatchEvent(new CustomEvent('change', { bubbles: true }));
    }
})();
