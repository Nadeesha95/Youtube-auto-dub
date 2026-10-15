/**
 * YouTube Auto-Dub Background Service Worker (Manifest V3)
 */
const DEFAULT_SETTINGS = {
  targetLanguage: 'hi',
  autoDubEnabled: true,
  dubVolume: 1.0,
  originalVolumeDuringDub: 0.15,
  speechRate: 1.1,
  maxSpeechRate: 1.6,
  ttsEngine: 'auto',
  simplifyLanguage: true,
  subtitlesEnabled: true,
  subtitleMode: 'bilingual',
  autoEnableCaptions: true
};

const CACHE_LIMIT = 3000;
const translationCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  // Merge so users upgrading from an older version get the new keys without losing their choices.
  chrome.storage.local.get(['ytdub_settings'], (result) => {
    chrome.storage.local.set({
      ytdub_settings: { ...DEFAULT_SETTINGS, ...(result.ytdub_settings || {}) }
    });
  });
});

function cacheSet(key, value) {
  if (translationCache.size >= CACHE_LIMIT) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(key, value);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'TRANSLATE') return false;

  const { text, targetLang } = request;
  const cacheKey = `${targetLang}:${text}`;
  if (translationCache.has(cacheKey)) {
    sendResponse(translationCache.get(cacheKey));
    return false;
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      const translatedText = (data && data[0] ? data[0].map(item => item[0]).join('') : '').trim();
      const result = { translatedText, sourceLang: (data && data[2]) || '' };
      if (translatedText) cacheSet(cacheKey, result);
      sendResponse(result);
    })
    .catch(() => sendResponse(null)); // content script retries later

  return true;
});
