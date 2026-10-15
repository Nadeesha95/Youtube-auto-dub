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
  aiSimplify: true,
  subtitlesEnabled: true,
  subtitleMode: 'bilingual',
  autoEnableCaptions: true
};

const CACHE_LIMIT = 3000;
const translationCache = new Map();
const shortenCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  // Merge so users upgrading from an older version get the new keys without losing their choices.
  chrome.storage.local.get(['ytdub_settings'], (result) => {
    chrome.storage.local.set({
      ytdub_settings: { ...DEFAULT_SETTINGS, ...(result.ytdub_settings || {}) }
    });
  });
});

function cacheSet(cache, key, value) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

// ---------------------------------------------------------------- translation

function translateText(text, targetLang) {
  const cacheKey = `${targetLang}:${text}`;
  if (translationCache.has(cacheKey)) return Promise.resolve(translationCache.get(cacheKey));

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      const translatedText = (data && data[0] ? data[0].map(item => item[0]).join('') : '').trim();
      const result = { translatedText, sourceLang: (data && data[2]) || '' };
      if (translatedText) cacheSet(translationCache, cacheKey, result);
      return result;
    });
}

// ---------------------------------------------------------------- voice

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

// ---------------------------------------------------------------- shortening for dubbing
// Some languages (e.g. Sinhala) take much longer to say than the English original. When a line
// cannot fit its time slot, the English sentence is rewritten to a word budget first and that
// shorter meaning is translated, instead of cutting the translated text.

const countWords = (s) => s.split(/\s+/).filter(Boolean).length;

const SUBJECT = { "i'm": 'I', 'i am': 'I', "we're": 'we', 'we are': 'we', "you're": 'you', 'you are': 'you',
  "they're": 'they', 'they are': 'they', "he's": 'he', "she's": 'she', "it's": 'it', 'it is': 'it' };

// Applied in order, stopping as soon as the line fits.
const RULE_STEPS = [
  [ // filler and hedges
    [/\b(?:um+|uh+|erm+|hmm+|uh-huh)\b,?\s*/gi, ''],
    [/\b(?:you know|i mean|you see|kind of|sort of|basically|literally|actually|honestly|obviously|really|very|just|pretty much|totally|definitely|absolutely|simply)\b,?\s*/gi, ''],
    [/\bi (?:think|guess|believe|feel like|would say)(?: that)?\s*/gi, ''],
    [/\b(?:for example|for instance|by the way|of course|as you can see|if you will|as i said|you guys)\b,?\s*/gi, '']
  ],
  [ // wordy phrases -> short ones
    [/\b(?:what )?(?:i'm|we're|i am|we are) going to do (?:here )?is\s*/gi, ''],
    [/\b(?:let's |let us )?go ahead and\s+/gi, ''],
    [/\b(i'm|i am|we're|we are|you're|you are|they're|they are|he's|she's|it's|it is)\s+going to\b/gi, (m, s) => `${SUBJECT[s.toLowerCase()] || s} will`],
    [/\b(?:is|are) going to\b/gi, 'will'],
    [/\bwill be able to\b/gi, 'can'],
    [/\b(?:was|were) able to\b/gi, 'could'],
    [/\bin order to\b/gi, 'to'],
    [/\b(?:a lot of|lots of|a great deal of)\b/gi, 'many'],
    [/\ba little bit\b/gi, 'a bit'],
    [/\b(?:at this point in time|right now|at the moment)\b/gi, 'now'],
    [/\bdue to the fact that\b/gi, 'because'],
    [/\bin terms of\b/gi, 'for'],
    [/\bmake sure (?:that )?/gi, 'ensure '],
    [/\bas well\b/gi, 'too'],
    [/\bthe thing is,?\s*/gi, ''],
    [/\b(?:is|are|was|were) able to\b/gi, 'can']
  ],
  [ // weak sentence openers
    [/(^|[.!?]\s+)(?:and|but|so|well|okay|ok|now|then|alright|right|yeah)\b,?\s*/gi, '$1']
  ]
];

function tidy(s) {
  return s.replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s+/g, ' ');
}

// Drops side clauses until the line fits. The longest clause is taken as the main point and always
// kept; relative/aside clauses ("which is…", "who…") go first, then short ones ("So friends,").
const SIDE_CLAUSE = /^(?:which|who|whom|whose|where|that|as|while|although|though|like|including|especially|since|even)\b/i;

function dropClauses(text, maxWords) {
  const clauses = text.split(/(?<=[,;:])\s+|\s+[-–—]\s+/).filter(Boolean);
  if (clauses.length < 2) return text;
  const main = clauses.reduce((best, c, i) => (countWords(c) > countWords(clauses[best]) ? i : best), 0);
  const order = clauses
    .map((c, i) => ({ i, words: countWords(c), side: SIDE_CLAUSE.test(c) }))
    .filter(x => x.i !== main)
    .sort((a, b) => (b.side - a.side) || (a.words - b.words));
  const dropped = new Set();
  let words = countWords(text);
  for (const x of order) {
    if (words <= maxWords) break;
    dropped.add(x.i);
    words -= x.words;
  }
  return clauses.filter((_, i) => !dropped.has(i)).join(' ').replace(/[,;:]$/, '');
}

function ruleShorten(text, maxWords) {
  let t = text;
  for (const step of RULE_STEPS) {
    if (countWords(t) <= maxWords) break;
    for (const [re, rep] of step) t = t.replace(re, rep);
    t = tidy(t);
  }
  if (countWords(t) > maxWords) t = tidy(dropClauses(t, maxWords));
  return t || text;
}

// ---------------------------------------------------------------- Gemini (free tier, user's own key)
// Lines are batched (up to GEMINI_BATCH per request, one request every GEMINI_MIN_INTERVAL_MS) so a
// whole video stays well inside the free-tier rate limits. Any failure falls back to the rules.

const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
const GEMINI_BATCH = 20;
const GEMINI_COLLECT_MS = 1500;
const GEMINI_MIN_INTERVAL_MS = 6000;
const GEMINI_TIMEOUT_MS = 20000;

const gemini = { queue: [], timer: 0, busy: false, nextAt: 0, blockedUntil: 0, modelIndex: 0, lastError: '' };

function getGeminiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get(['ytdub_gemini_key'], r => resolve((r && r.ytdub_gemini_key || '').trim()));
  });
}

function languageName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch (e) {
    return code;
  }
}

function geminiPrompt(targetLang) {
  const lang = languageName(targetLang);
  return 'You write voice-over lines for dubbing videos into ' + lang + '. ' +
    'For each input line, write what the dubbing voice should say in ' + lang + ': the same core meaning ' +
    'in simple, natural, everyday spoken ' + lang + ', no longer than maxChars characters. ' +
    'Drop filler words, repetition, hedging and minor details. Keep names, numbers and the main point. ' +
    'Never add information. Return one item per input line with the same id.';
}

async function callGemini(key, targetLang, items) {
  const body = {
    systemInstruction: { parts: [{ text: geminiPrompt(targetLang) }] },
    contents: [{
      role: 'user',
      parts: [{ text: JSON.stringify(items.map((it, id) => ({ id, maxChars: it.maxChars, text: it.text }))) }]
    }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { id: { type: 'INTEGER' }, text: { type: 'STRING' } },
          required: ['id', 'text']
        }
      }
    }
  };

  while (gemini.modelIndex < GEMINI_MODELS.length) {
    const model = GEMINI_MODELS[gemini.modelIndex];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
    });
    if (!(res.headers.get('content-type') || '').includes('json')) {
      gemini.blockedUntil = Date.now() + 10 * 60 * 1000;
      throw new Error('The network blocks the Gemini API (firewall or proxy).');
    }
    if (res.status === 404) { gemini.modelIndex++; continue; } // model retired: try the next one
    if (res.status === 429) {
      gemini.blockedUntil = Date.now() + 60 * 1000;
      throw new Error('Free-tier limit reached; using built-in rules for a minute.');
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      gemini.blockedUntil = Date.now() + 5 * 60 * 1000;
      throw new Error('Gemini rejected the API key.');
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = (parts || []).map(p => p.text || '').join('');
    return JSON.parse(text);
  }
  throw new Error('No supported Gemini model found.');
}

function scheduleGemini() {
  if (gemini.timer || gemini.busy || !gemini.queue.length) return;
  const wait = Math.max(GEMINI_COLLECT_MS, gemini.nextAt - Date.now());
  gemini.timer = setTimeout(flushGemini, wait);
}

async function flushGemini() {
  gemini.timer = 0;
  if (!gemini.queue.length) return;
  const lang = gemini.queue[0].targetLang;
  const batch = gemini.queue.filter(it => it.targetLang === lang).slice(0, GEMINI_BATCH);
  gemini.queue = gemini.queue.filter(it => !batch.includes(it));
  gemini.busy = true;
  gemini.nextAt = Date.now() + GEMINI_MIN_INTERVAL_MS;
  try {
    const key = await getGeminiKey();
    if (!key || Date.now() < gemini.blockedUntil) throw new Error('Gemini not available');
    const out = await callGemini(key, lang, batch);
    gemini.lastError = '';
    const byId = new Map((Array.isArray(out) ? out : []).map(o => [o.id, (o.text || '').trim()]));
    batch.forEach((it, id) => {
      const text = byId.get(id);
      // Reject answers that ignore the length budget badly; the rules path takes over then.
      it.resolve(text && text.length <= it.maxChars * 1.5 ? text : null);
    });
  } catch (e) {
    if (e && e.message !== 'Gemini not available') gemini.lastError = e.message;
    batch.forEach(it => it.resolve(null));
  } finally {
    gemini.busy = false;
    scheduleGemini();
  }
}

async function geminiShorten(text, targetLang, maxChars) {
  if (Date.now() < gemini.blockedUntil || !(await getGeminiKey())) return null;
  return new Promise(resolve => {
    gemini.queue.push({ text, targetLang, maxChars, resolve });
    scheduleGemini();
  });
}

async function shortenForDub({ text, sourceLang, targetLang, ratio, maxChars, useAI }) {
  const cacheKey = `${targetLang}:${ratio.toFixed(2)}:${useAI ? 'ai' : 'r'}:${text}`;
  if (shortenCache.has(cacheKey)) return shortenCache.get(cacheKey);

  // Gemini writes the short spoken line directly in the target language.
  const direct = useAI && maxChars ? await geminiShorten(text, targetLang, maxChars) : null;
  if (direct) {
    const result = { translatedText: direct, method: 'gemini' };
    cacheSet(shortenCache, cacheKey, result);
    return result;
  }

  // Rules: shorten in English, then translate.
  let english = text;
  if (!/^en\b/i.test(sourceLang || '')) english = (await translateText(text, 'en')).translatedText || text;

  const maxWords = Math.max(3, Math.floor(countWords(english) * ratio));
  const short = ruleShorten(english, maxWords);
  if (short === english && countWords(english) <= maxWords) return null;

  const translated = /^en\b/i.test(targetLang) ? short : (await translateText(short, targetLang)).translatedText;
  if (!translated) return null;
  const result = { translatedText: translated, shortSource: short, method: 'rules' };
  cacheSet(shortenCache, cacheKey, result);
  return result;
}

// ---------------------------------------------------------------- messages

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return false;

  if (request.action === 'TTS') {
    fetchTts(request.text, request.lang, sendResponse);
    return true;
  }
  if (request.action === 'TRANSLATE') {
    translateText(request.text, request.targetLang)
      .then(sendResponse)
      .catch(() => sendResponse(null)); // content script retries later
    return true;
  }
  if (request.action === 'GEMINI_STATUS') {
    sendResponse({ lastError: gemini.lastError, blocked: Date.now() < gemini.blockedUntil });
    return false;
  }
  if (request.action === 'SHORTEN') {
    shortenForDub(request)
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }
  return false;
});
