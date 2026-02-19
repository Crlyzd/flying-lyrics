const DEFAULTS = { translationEnabled: true, targetLanguage: "id", offset: 0 };

const toggleEl = document.getElementById('translation-enabled');
const langEl = document.getElementById('target-lang');
const offsetEl = document.getElementById('sync-offset');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-msg');

// Load saved settings on popup open
chrome.storage.sync.get(DEFAULTS, (settings) => {
  toggleEl.checked = settings.translationEnabled;
  langEl.value = settings.targetLanguage;
  offsetEl.value = settings.offset;
});

// Save settings
saveBtn.addEventListener('click', () => {
  const settings = {
    translationEnabled: toggleEl.checked,
    targetLanguage: langEl.value,
    offset: parseInt(offsetEl.value, 10) || 0
  };

  chrome.storage.sync.set(settings, () => {
    statusMsg.classList.add('show');
    setTimeout(() => statusMsg.classList.remove('show'), 2000);
  });
});
