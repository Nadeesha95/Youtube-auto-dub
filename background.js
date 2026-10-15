/**
 * YouTube Auto-Dub Background Service Worker (Manifest V3)
 */
const translationCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['ytdub_settings'], (result) => {
    if (!result.ytdub_settings) {
      chrome.storage.local.set({
        ytdub_settings: {
          targetLanguage: 'hi',
          autoDetectCountry: true,
          autoDubEnabled: true,
          dubVolume: 1.0,
          speechRate: 1.15,
          simplifyLanguage: true,
          subtitlesEnabled: true,
          subtitleMode: 'bilingual',
          noDelaySync: true
        }
      });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TRANSLATE_CAPTION') {
    const { text, targetLang, simplify } = request;
    const cacheKey = `${targetLang}:${simplify ? 'simp:' : ''}${text}`;

    if (translationCache.has(cacheKey)) {
      sendResponse({
        translatedText: translationCache.get(cacheKey),
        durationSec: Math.max(2, text.length / 14)
      });
      return true;
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        let translated = '';
        if (data && data[0]) {
          translated = data[0].map(item => item[0]).join('');
        }
        if (simplify && translated.length > 70) {
          translated = translated.replace(/[,;]/g, ' -').trim();
        }
        translationCache.set(cacheKey, translated);
        sendResponse({
          translatedText: translated,
          durationSec: Math.max(2, translated.length / 15)
        });
      })
      .catch(err => {
        sendResponse({ translatedText: text, durationSec: 3 });
      });

    return true;
  }
});
