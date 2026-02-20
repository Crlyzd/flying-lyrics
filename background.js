chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FOCUS_TAB' && sender.tab) {
        // 1. Focus the tab itself
        chrome.tabs.update(sender.tab.id, { active: true });

        // 2. Focus the window containing the tab (restores if minimized)
        chrome.windows.update(sender.tab.windowId, { focused: true });

        sendResponse({ status: 'ok' });
    }
});
