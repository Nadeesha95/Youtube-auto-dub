/**
 * On-device sentence shortener using Chrome's built-in AI (Prompt API / Gemini Nano).
 * Loaded by background.js, or by offscreen.html when the service worker does not expose the API.
 * Returns null whenever the model is unavailable, slow, or gives an unusable answer — callers then
 * fall back to the rule-based shortener.
 */
(() => {
  const MODEL_OPTIONS = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
  };
  const SYSTEM_PROMPT =
    'You shorten spoken lines from video subtitles so a dubbing voice can say them in less time. ' +
    'Rewrite the line in plain, simple English using no more than the requested number of words. ' +
    'Keep the core meaning, names and numbers. Drop filler, hedging, repetition and minor details. ' +
    'Reply with the rewritten line only.';
  const TIMEOUT_MS = 5000;

  let base = null;
  let queue = Promise.resolve();

  async function getBaseSession() {
    if (typeof LanguageModel === 'undefined') return null;
    if (base) return base;
    if ((await LanguageModel.availability(MODEL_OPTIONS)) !== 'available') return null;
    base = await LanguageModel.create({
      ...MODEL_OPTIONS,
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }]
    });
    return base;
  }

  function validate(out, text, maxWords) {
    if (typeof out !== 'string') return null;
    const line = out.split('\n').map(s => s.trim()).find(Boolean) || '';
    const clean = line.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
    if (!clean || clean.length >= text.length) return null;
    if (clean.split(/\s+/).length > Math.ceil(maxWords * 1.4)) return null;
    return clean;
  }

  // The model handles one prompt at a time, so requests are serialized.
  function shorten(text, maxWords) {
    const job = queue.then(async () => {
      const session = await getBaseSession();
      if (!session) return null;
      const s = await session.clone();
      try {
        return await Promise.race([
          s.prompt(`Rewrite in at most ${maxWords} words:\n${text}`),
          new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT_MS))
        ]);
      } finally {
        s.destroy();
      }
    }).catch(() => {
      base = null;
      return null;
    });
    queue = job.then(() => {}, () => {});
    return job.then(out => validate(out, text, maxWords));
  }

  self.ytdubAi = {
    MODEL_OPTIONS,
    supported: () => typeof LanguageModel !== 'undefined',
    shorten
  };
})();
