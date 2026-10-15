/**
 * YouTube Auto-Dub page hook — runs in the page's own JS world (MAIN) at document_start.
 *
 * YouTube signs most caption requests, so instead of fetching captions ourselves we observe the
 * player's own /api/timedtext responses and hand the full timed transcript to content.js.
 * That lets the dub be translated and pre-buffered ahead of time instead of reacting to on-screen text.
 */
(() => {
  if (window.__ytdubPageHook) return;
  window.__ytdubPageHook = true;

  const ORIGIN = location.origin;
  const isTimedText = (url) => typeof url === 'string' && url.includes('/api/timedtext');
  const post = (type, payload) => window.postMessage({ source: 'ytdub-page', type, ...payload }, ORIGIN);
  const postBody = (url, body) => {
    if (body && body.length > 20) post('TIMEDTEXT', { url, body });
  };

  const nativeFetch = window.fetch;
  window.fetch = function (input) {
    const promise = nativeFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input && input.url);
      if (isTimedText(url)) {
        promise.then(res => res.clone().text()).then(body => postBody(url, body)).catch(() => {});
      }
    } catch (e) { /* never break the page */ }
    return promise;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__ytdubUrl = String(url); } catch (e) { /* ignore */ }
    return nativeOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (isTimedText(this.__ytdubUrl)) {
      this.addEventListener('load', () => {
        try {
          const type = this.responseType;
          let body = null;
          if (type === '' || type === 'text') body = this.responseText;
          else if (type === 'json') body = JSON.stringify(this.response);
          else if (type === 'arraybuffer') body = new TextDecoder().decode(this.response);
          postBody(this.__ytdubUrl, body);
        } catch (e) { /* ignore */ }
      });
    }
    return nativeSend.apply(this, arguments);
  };

  // Prefer a human-made track in the spoken language, then the auto-generated one.
  function pickTrack(tracks) {
    const asr = tracks.find(t => t.kind === 'asr');
    const spoken = asr && asr.languageCode;
    return tracks.find(t => t.kind !== 'asr' && spoken && t.languageCode === spoken) || asr || tracks[0];
  }

  // Direct fetch of the default track. Works when the caption URL is not signed; otherwise the
  // content script turns captions on and the interception above picks up the player's request.
  async function fetchTranscript(videoId, attempt = 0) {
    const player = document.getElementById('movie_player');
    const resp = player && typeof player.getPlayerResponse === 'function' ? player.getPlayerResponse() : null;
    if (!resp || (videoId && resp.videoDetails && resp.videoDetails.videoId !== videoId)) {
      if (attempt < 6) setTimeout(() => fetchTranscript(videoId, attempt + 1), 800);
      return;
    }
    const list = resp.captions && resp.captions.playerCaptionsTracklistRenderer;
    const tracks = (list && list.captionTracks) || [];
    if (!tracks.length) {
      post('NO_CAPTIONS', { videoId });
      return;
    }
    try {
      const url = pickTrack(tracks).baseUrl + '&fmt=json3';
      const res = await nativeFetch(url, { credentials: 'include' });
      postBody(url, await res.text());
    } catch (e) { /* fall back to interception */ }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'ytdub-ext') return;
    if (e.data.type === 'FETCH_TRANSCRIPT') fetchTranscript(e.data.videoId);
  });
})();
