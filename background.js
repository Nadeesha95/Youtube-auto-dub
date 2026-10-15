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

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Google's TTS returns 404 when the request carries a youtube.com Referer, so the voice cannot be
// loaded by an <audio> element on the YouTube page. Fetch it here (no referrer) and hand back the bytes.
function fetchTts(text, lang, sendResponse) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit' })
    .then(res => {
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('audio/')) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer().then(buf => sendResponse({ audio: toBase64(buf), mime: type.split(';')[0] }));
    })
    .catch(() => sendResponse(null));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TTS') {
    fetchTts(request.text, request.lang, sendResponse);
    return true;
  }
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
