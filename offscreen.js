/**
 * Hosts the on-device AI model for the background worker (Chrome exposes the Prompt API to
 * extension pages, which may not include service workers).
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.target !== 'offscreen' || request.action !== 'AI_SHORTEN') return false;
  if (!self.ytdubAi.supported()) {
    sendResponse({ text: null, unsupported: true });
    return false;
  }
  self.ytdubAi.shorten(request.text, request.maxWords).then(text => sendResponse({ text }));
  return true;
});
