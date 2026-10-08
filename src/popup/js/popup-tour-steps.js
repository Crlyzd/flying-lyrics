// src/popup/js/popup-tour-steps.js

window.FLYING_LYRICS = window.FLYING_LYRICS || {};
window.FLYING_LYRICS.popup = window.FLYING_LYRICS.popup || {};

window.FLYING_LYRICS.popup.tourSteps = [
    {
        tab: "lyrics",
        element: "#search-query",
        title: "Manual Lyric Search",
        desc: "If the automatically matched lyrics are wrong or missing, search by <strong>Artist - Title</strong> here to find and load other synced versions."
    },
    {
        tab: "lyrics",
        element: ".sync-control-row",
        title: "Sync Offset Adjustments",
        desc: "Adjust lyric timing in milliseconds to speed up or slow down the lines, syncing them perfectly with the singer."
    },
    {
        tab: "visuals",
        subTab: "pip",
        element: "#visual-controls-wrapper",
        title: "Visual Customization",
        desc: "Expand these sections to customize fonts, sizes, spacing, background blur, and glowing text. Changes apply instantly to the floating window."
    },
    {
        tab: "visuals",
        subTab: "popup",
        element: "#galaxy-mode-toggle-card",
        title: "Galaxy Mode",
        desc: "Enable a custom animated background inside the extension popup and customize its colors."
    },
    {
        tab: "settings",
        element: "#toggle-borderless-pip",
        title: "Borderless Mode",
        desc: "Turn this on to run in borderless mode (removes the window frame)."
    },
    {
        tab: "settings",
        element: "#toggle-eco-mode",
        title: "Eco Mode (ON by Default)",
        desc: "Eco Mode is enabled by default to save battery and CPU (caps rate at 30 FPS). If the text looks slightly soft on your monitor, turn this <strong>OFF</strong> for ultra-sharp quality and smoother scroll animations."
    },
    {
        tab: "settings",
        element: "#toggle-translation",
        title: "Lyric Translation",
        desc: "Toggle this to automatically translate song lyrics into your preferred language using Google Translate."
    },
    {
        tab: "settings",
        element: "#lang-select",
        title: "Translation Language",
        desc: "Choose your preferred translation language. It matches your browser's language by default."
    },
    {
        tab: "settings",
        element: ".global-offset-row",
        title: "Global Sync Offset",
        desc: "Set a default timing offset (in milliseconds) that applies to all songs as a global fallback. This will not override any custom offsets you save for individual songs."
    }
];
