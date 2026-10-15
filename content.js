/**
 * YouTube Auto-Dub Content Script (Manifest V3) - v2.0.0
 *
 * Transcript mode (preferred): the full timed caption track is captured from YouTube's own request
 *   (inject.js), grouped into sentences, translated up to a minute ahead and the voice for the next
 *   lines is pre-buffered, so each line is spoken exactly when it is said in the video.
 * Live mode (fallback, e.g. live streams): reads the on-screen captions, extracts only the newly added
 *   words (YouTube's rolling captions repeat the previous line) and voices each finished phrase once.
 *
 * Fast speech: lines are fitted to their time slot by speeding the voice up (capped), then by dropping
 *   filler words and minor clauses; if the dub still falls behind, stale lines are skipped so the voice
 *   always follows what is being said now.
 * Original audio is ducked through a Web Audio gain node, so YouTube's own volume slider is never changed.
 */
(() => {
  'use strict';

  const DEFAULTS = {
    targetLanguage: 'hi',
    autoDubEnabled: true,
    dubVolume: 1.0,
    originalVolumeDuringDub: 0.15,
    speechRate: 1.1,
    maxSpeechRate: 1.6,
    speechPitch: 1.0,
    ttsEngine: 'auto',          // 'auto' = Google voice (pre-buffered) with browser-voice fallback, 'local' = browser voices
    simplifyLanguage: true,     // shorten lines that cannot fit their time slot
    aiSimplify: true,           // use Gemini (user's free API key) for shortening when a key is set
    subtitlesEnabled: true,
    subtitleMode: 'bilingual',
    autoEnableCaptions: true,
  };

  const LEAD_SEC = 0.15;              // start slightly early to absorb audio start-up latency
  const TRANSLATE_AHEAD_SEC = 60;
  const PREFETCH_AHEAD = 3;           // upcoming lines whose voice audio is pre-buffered
  const MAX_INFLIGHT = 3;
  const MAX_SHORTEN_INFLIGHT = 20;     // lines waiting to be shortened (Gemini batches them)
  const DUCK_HOLD_MS = 700;           // keep the original ducked between consecutive lines (no volume pumping)
  const LIVE_FLUSH_PAUSE_MS = 700;
  const LIVE_MAX_WORDS = 14;
  const TTS_CHUNK = 180;              // Google TTS rejects long requests

  let settings = { ...DEFAULTS };
  const synth = window.speechSynthesis || null;
  let voices = [];

  let video = null;
  const hookedVideos = new WeakSet();
  let currentVideoId = null;
  let videoChangedAt = 0;
  let noCaptions = false;

  // Transcript mode state
  let cues = [];
  let transcriptVideoId = null;
  let transcriptSig = '';
  let epoch = 0;                      // bumped whenever translations must be discarded
  let inflight = 0;
  let shortenInflight = 0;

  let ccAutoTried = false;
  let weEnabledCC = false;
  const intervals = [];
  let dead = false;

  // ---------------------------------------------------------------- text helpers

  function normalize(str) {
    return (str || '').toLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
  }

  function cleanCaption(text) {
    return (text || '')
      .replace(/\[[^\]]*\]|♪+|>>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dedupeWords(text) {
    const out = [];
    let prev = '';
    for (const w of text.split(/\s+/)) {
      const n = normalize(w);
      if (n && n === prev) continue;
      out.push(w);
      prev = n;
    }
    return out.join(' ');
  }

  // Filler words carry no meaning but cost dubbing time (English + Hindi/Hinglish sources).
  // \b does not work for Devanagari, hence the explicit boundaries.
  const SOURCE_FILLERS = [
    [/\b(?:um+|uh+|erm+|hmm+|uh-huh)\b[,.]?/gi, ' '],
    [/\b(?:you know|i mean|kind of|sort of|basically|literally)\b,?/gi, ' '],
    [/(^|[.!?]\s+)(?:so|well|okay|ok|right|yeah|like)\s*,\s*/gi, '$1'],
    [/(^|\s)(?:मतलब|यानी(?: कि)?|देखिए|देखो|समझे ना|अच्छा तो|है ना)(?=[\s,.।!?]|$)/g, '$1'],
    [/\b(?:matlab|yaani|dekhiye|dekho|haina)\b,?/gi, ' '],
  ];

  function simplifySource(text) {
    let t = text;
    for (const [re, rep] of SOURCE_FILLERS) t = t.replace(re, rep);
    t = dedupeWords(t.replace(/\([^)]*\)/g, ' '));
    return t.replace(/\s+([,.!?।])/g, '$1').replace(/^[\s,]+/, '').replace(/\s+/g, ' ').trim();
  }

  // Shortens a translated line so it can be spoken in its slot: drops parentheticals and repeated
  // words, then middle clauses (shortest first). First and last clauses are kept because they
  // usually carry the subject and — in SOV languages like Hindi — the verb.
  function condenseToFit(text, maxChars) {
    if (!text || text.length <= maxChars) return text;
    const t = dedupeWords(text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')).replace(/\s+/g, ' ').trim();
    if (t.length <= maxChars) return t;

    const clauses = t.split(/(?<=[,;:，、।|])\s+|\s+[-–—]\s+/).filter(Boolean);
    if (clauses.length < 3) return t;

    const dropped = new Set();
    let total = t.length;
    const middle = clauses.slice(1, -1).map((c, i) => ({ c, i: i + 1 })).sort((a, b) => a.c.length - b.c.length);
    for (const m of middle) {
      if (total <= maxChars) break;
      dropped.add(m.i);
      total -= m.c.length + 1;
    }
    return clauses.filter((_, i) => !dropped.has(i)).join(' ').replace(/[,;:，、]\s*$/, '');
  }

  // ---------------------------------------------------------------- translation

  function targetLang() {
    return (settings.targetLanguage || 'hi').toLowerCase();
  }

  function ttsLang(lang) {
    return { zh: 'zh-CN', bho: 'hi', tl: 'fil' }[lang] || lang;
  }

  function translate(text) {
    return new Promise(resolve => {
      if (!text) return resolve(null);
      try {
        chrome.runtime.sendMessage({ action: 'TRANSLATE', text, targetLang: targetLang() }, res => {
          if (chrome.runtime.lastError || !res || !res.translatedText) return resolve(null);
          const src = (res.sourceLang || '').split('-')[0];
          resolve({ text: res.translatedText, sourceLang: res.sourceLang || '', same: !!src && src === targetLang().split('-')[0] });
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function requestTranslation(c) {
    if (inflight >= MAX_INFLIGHT) return;
    if ((c.fails || 0) >= 3) { c.tr = ''; return; }
    const src = settings.simplifyLanguage ? simplifySource(c.text) : c.text;
    if (!src) { c.tr = ''; return; }
    c.tr = null; // pending
    inflight++;
    const myEpoch = epoch;
    translate(src).then(res => {
      if (myEpoch !== epoch) return; // inflight was reset with the epoch
      inflight--;
      if (!res) { c.tr = undefined; c.fails = (c.fails || 0) + 1; return; }
      c.tr = res.text;
      c.srcLang = res.sourceLang;
      c.same = res.same;
    });
  }

  // How much a line must shrink to be spoken in slotSec at max speed (1 = it already fits).
  function shrinkRatio(text, slotSec) {
    const r = (slotSec * settings.maxSpeechRate * cpsFor(targetLang())) / text.length;
    return r >= 1 ? 1 : Math.max(0.35, Math.floor(r * 0.95 * 20) / 20);
  }

  // Asks for the line's meaning in fewer words (rewritten in English, then translated).
  function requestShorten(text, sourceLang, ratio, maxChars, useAI) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action: 'SHORTEN', text, sourceLang, targetLang: targetLang(), ratio, maxChars, useAI }, res => {
          resolve(chrome.runtime.lastError || !res ? null : res.translatedText || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Lines too long for their slot get a simplified spoken version (c.say); subtitles keep c.tr.
  // Re-evaluated every tick because the voice's real speaking speed is learned as clips load.
  function maybeShorten(c, slot) {
    if (c.shortening || shortenInflight >= MAX_SHORTEN_INFLIGHT) return;
    const ratio = shrinkRatio(c.tr, slot);
    if (ratio >= 1) return;
    if (c.sayRatio !== undefined && c.sayRatio - ratio < 0.1) return;
    c.shortening = true;
    shortenInflight++;
    const myEpoch = epoch;
    requestShorten(c.text, c.srcLang, ratio, Math.floor(c.tr.length * ratio), settings.aiSimplify).then(say => {
      if (myEpoch !== epoch) return;
      shortenInflight--;
      c.shortening = false;
      c.sayRatio = ratio;
      if (say && say.length < (c.say || c.tr).length) {
        c.say = say;
        c.recondensed = false;
        disposeClip(c);
      }
    });
  }

  function needsShortening(c, slot) {
    return c.shortening || (c.sayRatio === undefined && shrinkRatio(c.tr, slot) < 1);
  }

  // ---------------------------------------------------------------- voices / clips

  const cpsByLang = {}; // learned characters-per-second of the TTS voice at rate 1.0

  function cpsFor(lang) {
    return cpsByLang[lang] || 13;
  }

  function learnCps(lang, chars, dur) {
    if (!(dur > 0.8) || chars < 8 || !isFinite(dur)) return;
    const v = chars / dur;
    cpsByLang[lang] = cpsByLang[lang] ? cpsByLang[lang] * 0.7 + v * 0.3 : v;
  }

  function loadVoices() {
    if (synth) voices = synth.getVoices() || [];
  }

  function pickVoice(lang) {
    const tag = ttsLang(lang).toLowerCase();
    const base = tag.split('-')[0];
    const matches = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(base));
    return matches.find(v => v.lang.toLowerCase().startsWith(tag) && /google/i.test(v.name))
      || matches.find(v => /google/i.test(v.name))
      || matches[0] || null;
  }

  function splitForTts(text) {
    const parts = [];
    let rest = text.trim();
    while (rest.length > TTS_CHUNK) {
      const win = rest.slice(0, TTS_CHUNK);
      const punct = Math.max(...['।', '.', '!', '?', ',', ';', ':', '，'].map(p => win.lastIndexOf(p)));
      let cut = punct > TTS_CHUNK * 0.5 ? punct + 1 : win.lastIndexOf(' ');
      if (cut <= 0) cut = TTS_CHUNK;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function createSynthClip(text, lang) {
    const clip = {
      text, lang,
      duration: text.length / cpsFor(lang),
      started: false, stopped: false, timer: 0,
      play(rate, volume, onEnd) {
        const finish = () => {
          if (clip.stopped) return;
          clip.stopped = true;
          clearTimeout(clip.timer);
          onEnd();
        };
        // No installed voice for this language (common for Sinhala, Tamil, Bengali…): stay silent
        // rather than reading the text with a wrong-language voice.
        const v = pickVoice(lang);
        if (!synth || !v) return finish();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = ttsLang(lang);
        u.rate = rate;
        u.pitch = settings.speechPitch || 1.0;
        u.volume = volume;
        u.voice = v;
        u.onend = finish;
        u.onerror = finish;
        clip.started = true;
        synth.cancel();
        synth.speak(u);
        // Chrome occasionally never fires onend
        clip.timer = setTimeout(finish, (clip.duration / rate + 4) * 1000);
      },
      setVolume() { /* cannot change mid-utterance */ },
      stop() {
        clip.stopped = true;
        clearTimeout(clip.timer);
        if (clip.started && synth) synth.cancel();
      },
    };
    return clip;
  }

  // Voice audio is downloaded by the background worker: Google's TTS rejects requests that carry a
  // youtube.com Referer, which is what an <audio> element on this page would send.
  function loadTtsAudio(text, lang) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action: 'TTS', text, lang: ttsLang(lang) }, res => {
          if (chrome.runtime.lastError || !res || !res.audio) return resolve(null);
          const bin = atob(res.audio);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve(URL.createObjectURL(new Blob([bytes], { type: res.mime || 'audio/mpeg' })));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function createCloudClip(text, lang) {
    let index = 0;
    let loaded = 0;
    const clip = {
      text, lang,
      duration: null, failed: false, stopped: false, released: false,
      fallback: null, onReady: null,
      play(rate, volume, onEnd) {
        const finish = () => {
          if (clip.stopped) return;
          clip.stop();
          onEnd();
        };
        const useFallback = () => {
          if (clip.stopped || clip.fallback) return;
          clip.fallback = createSynthClip(parts.slice(index).map(p => p.text).join(' '), lang);
          clip.fallback.play(rate, volume, finish);
        };
        const next = () => {
          if (clip.stopped) return;
          if (index >= parts.length) return finish();
          const part = parts[index];
          part.ready.then(ok => {
            if (clip.stopped) return;
            if (!ok) return useFallback();
            const a = part.audio;
            a.playbackRate = rate;
            a.volume = Math.max(0, Math.min(1, volume));
            a.onended = () => { index++; next(); };
            a.onerror = useFallback;
            a.play().catch(useFallback);
          });
        };
        next();
      },
      setVolume(v) {
        const vol = Math.max(0, Math.min(1, v));
        parts.forEach(p => { p.audio.volume = vol; });
      },
      // A clip is never replayed, so stopping also frees its audio.
      stop() {
        clip.stopped = true;
        if (clip.fallback) clip.fallback.stop();
        if (clip.released) return;
        clip.released = true;
        parts.forEach(p => {
          p.audio.onended = null;
          p.audio.onerror = null;
          p.audio.pause();
          if (p.url) {
            p.audio.removeAttribute('src');
            p.audio.load();
            URL.revokeObjectURL(p.url);
          }
        });
      },
      dispose() {
        clip.stop();
      },
    };

    const parts = splitForTts(text).map(t => {
      const part = { text: t, audio: new Audio(), url: null };
      part.audio.preload = 'auto';
      part.audio.addEventListener('loadedmetadata', () => {
        if (++loaded !== parts.length) return;
        clip.duration = parts.reduce((s, p) => s + (isFinite(p.audio.duration) ? p.audio.duration : 0), 0);
        learnCps(lang, text.length, clip.duration);
        if (clip.onReady) clip.onReady();
      }, { once: true });
      part.ready = loadTtsAudio(t, lang).then(url => {
        if (!url) { clip.failed = true; return false; }
        if (clip.released) { URL.revokeObjectURL(url); return false; }
        part.url = url;
        part.audio.src = url;
        return true;
      });
      return part;
    });
    return clip;
  }

  function createClip(text, lang) {
    if (settings.ttsEngine === 'local' && pickVoice(lang)) return createSynthClip(text, lang);
    return createCloudClip(text, lang);
  }

  function disposeClip(c) {
    if (!c.clip) return;
    if (c.clip.dispose) c.clip.dispose();
    else c.clip.stop();
    c.clip = null;
  }

  function fitText(text, slotSec) {
    if (!settings.simplifyLanguage) return text;
    return condenseToFit(text, Math.floor(slotSec * settings.maxSpeechRate * cpsFor(targetLang())));
  }

  // ---------------------------------------------------------------- original-audio ducking

  const duck = {
    ctx: null, gain: null, source: null, el: null,
    unsupported: new WeakSet(),
    target: 1,
    holdTimer: 0,
    userVolume: null,       // only used by the element-volume fallback
    expectedVolume: null,

    // Routes the video through a gain node; returns false if Web Audio cannot be used (yet).
    attach(v) {
      if (!v || this.unsupported.has(v)) return false;
      if (this.el === v && this.gain) return true;
      try {
        if (!this.ctx) {
          this.ctx = new AudioContext();
          this.ctx.onstatechange = () => {
            if (this.gain && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
          };
        }
        if (this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
          return false; // needs a user gesture first; never route audio into a silent context
        }
        const src = this.ctx.createMediaElementSource(v);
        const g = this.ctx.createGain();
        src.connect(g).connect(this.ctx.destination);
        if (this.source) { try { this.source.disconnect(); } catch (e) { /* ignore */ } }
        this.source = src;
        this.gain = g;
        this.el = v;
        if (this.userVolume != null) { v.volume = this.userVolume; this.userVolume = null; }
        g.gain.value = this.target;
        return true;
      } catch (e) {
        this.unsupported.add(v); // e.g. already connected to another audio graph
        return false;
      }
    },

    prime() {
      if (!this.ctx) { try { this.ctx = new AudioContext(); } catch (e) { return; } }
      this.ctx.resume().then(() => this.attach(video)).catch(() => {});
    },

    apply(level, rampSec) {
      this.target = level;
      if (this.attach(video)) {
        const now = this.ctx.currentTime;
        const p = this.gain.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(level, now + rampSec);
        return;
      }
      this.applyElementVolume(level);
    },

    applyElementVolume(level) {
      if (!video) return;
      if (level < 0.999) {
        if (this.userVolume == null) this.userVolume = video.volume;
        this.setElementVolume(this.userVolume * level);
      } else if (this.userVolume != null) {
        const u = this.userVolume;
        this.userVolume = null;
        this.setElementVolume(u);
      }
    },

    setElementVolume(val) {
      this.expectedVolume = Math.max(0, Math.min(1, val));
      video.volume = this.expectedVolume;
    },

    // User moved YouTube's slider while the fallback had it ducked: respect their new volume.
    onVolumeChange() {
      if (this.userVolume != null && Math.abs(video.volume - this.expectedVolume) > 0.02) {
        this.userVolume = null;
      }
    },

    down() {
      clearTimeout(this.holdTimer);
      this.apply(settings.originalVolumeDuringDub, 0.15);
    },
    upSoon() {
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => this.up(), DUCK_HOLD_MS);
    },
    up() {
      clearTimeout(this.holdTimer);
      if (this.target !== 1) this.apply(1, 0.4);
    },
    refresh() {
      if (this.target < 1) this.apply(settings.originalVolumeDuringDub, 0.1);
    },
  };

  // ---------------------------------------------------------------- dub player

  const dub = {
    clip: null,
    cue: null,
    play(cue, clip, rate) {
      this.stop(false);
      this.clip = clip;
      this.cue = cue;
      duck.down();
      clip.play(rate, settings.dubVolume, () => {
        if (this.clip !== clip) return;
        this.clip = null;
        this.cue = null;
        duck.upSoon();
        pumpLive();
      });
    },
    stop(restore = true) {
      const c = this.clip;
      this.clip = null;
      this.cue = null;
      if (c) c.stop();
      if (restore) duck.up();
    },
  };

  // ---------------------------------------------------------------- transcript parsing

  function parseTimedText(body) {
    const trimmed = body.trim();
    const tokens = [];
    if (trimmed.startsWith('{')) {
      const data = JSON.parse(trimmed);
      for (const ev of data.events || []) {
        if (!ev.segs) continue;
        const evStart = ev.tStartMs || 0;
        const evEnd = evStart + (ev.dDurationMs || 0);
        const segs = ev.segs.filter(s => s.utf8 && s.utf8.trim());
        const wordLevel = segs.length > 1;
        segs.forEach((s, i) => {
          const start = evStart + (s.tOffsetMs || 0);
          const next = segs[i + 1];
          let end = next ? evStart + (next.tOffsetMs || 0) : evEnd;
          if (!next && wordLevel) end = Math.min(end, start + 1000);
          tokens.push({ start: start / 1000, end: end / 1000, text: s.utf8.replace(/\n/g, ' ').trim() });
        });
      }
    } else if (trimmed.startsWith('<')) {
      const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
      const ps = doc.querySelectorAll('body > p, p[t]');
      if (ps.length) { // srv3: times in ms
        ps.forEach(p => {
          const start = +p.getAttribute('t') || 0;
          const end = start + (+p.getAttribute('d') || 0);
          const words = p.querySelectorAll('s');
          if (words.length > 1) {
            words.forEach((w, i) => {
              const ws = start + (+w.getAttribute('t') || 0);
              const nx = words[i + 1];
              const we = nx ? start + (+nx.getAttribute('t') || 0) : Math.min(end, ws + 1000);
              tokens.push({ start: ws / 1000, end: we / 1000, text: w.textContent.trim() });
            });
          } else if (p.textContent.trim()) {
            tokens.push({ start: start / 1000, end: end / 1000, text: p.textContent.replace(/\n/g, ' ').trim() });
          }
        });
      } else { // srv1: times in seconds
        doc.querySelectorAll('text').forEach(n => {
          const start = parseFloat(n.getAttribute('start')) || 0;
          const end = start + (parseFloat(n.getAttribute('dur')) || 0);
          const txt = n.textContent.replace(/\n/g, ' ').trim();
          if (txt) tokens.push({ start, end, text: txt });
        });
      }
    }

    tokens.sort((a, b) => a.start - b.start);
    for (let i = 0; i < tokens.length; i++) {
      const next = tokens[i + 1];
      if (next && next.start > tokens[i].start) tokens[i].end = Math.min(tokens[i].end, next.start);
      tokens[i].end = Math.max(tokens[i].end, tokens[i].start + 0.1);
    }
    return tokens.filter(t => t.text);
  }

  // Groups word/line tokens into sentence-sized lines (split on punctuation, pauses, or length).
  function buildCues(tokens) {
    const out = [];
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const text = cleanCaption(cur.words.join(' '));
      if (normalize(text)) out.push({ start: cur.start, end: cur.end, text, tr: undefined, same: false, clip: null, state: 'pending' });
      cur = null;
    };
    for (const tk of tokens) {
      if (cur && tk.start - cur.end > 0.8) flush();
      if (!cur) cur = { start: tk.start, end: tk.end, words: [] };
      cur.words.push(tk.text);
      cur.end = Math.max(cur.end, tk.end);
      const dur = cur.end - cur.start;
      const len = cur.words.join(' ').length;
      const sentenceEnd = /[.!?।？！。]["')\]]?$/.test(tk.text);
      if ((sentenceEnd && dur >= 1.0) || dur >= 6.5 || len >= 130 || (/[,;:，、]$/.test(tk.text) && dur >= 3.5)) flush();
    }
    flush();

    // The dub may use the gap after a line (up to 1s) but never the next line's time.
    let searchEnd = 0;
    out.forEach((c, i) => {
      const next = out[i + 1];
      c.slotEnd = next ? Math.min(Math.max(next.start, c.end), c.end + 1.0) : c.end + 1.0;
      searchEnd = Math.max(searchEnd, c.slotEnd);
      c.searchEnd = searchEnd;
    });
    return out;
  }

  function transcriptActive() {
    return cues.length > 0 && transcriptVideoId === currentVideoId;
  }

  function handleTimedText(url, body) {
    let vid = null;
    try { vid = new URL(url, location.href).searchParams.get('v'); } catch (e) { /* ignore */ }
    if (!currentVideoId || (vid && vid !== currentVideoId)) return; // e.g. hover previews on the home page
    const sig = `${vid}:${body.length}:${body.slice(0, 300)}`;
    if (sig === transcriptSig) return;

    let newCues = [];
    try { newCues = buildCues(parseTimedText(body)); } catch (e) { return; }
    if (!newCues.length) return;

    transcriptSig = sig;
    dub.stop();
    cues.forEach(disposeClip);
    epoch++;
    inflight = 0;
    shortenInflight = 0;
    cues = newCues;
    transcriptVideoId = vid || currentVideoId;
    resetLive();
    updateNativeCaptionVisibility();
  }

  function resetTranslations() {
    epoch++;
    inflight = 0;
    shortenInflight = 0;
    dub.stop();
    cues.forEach(c => {
      disposeClip(c);
      c.tr = undefined;
      c.say = undefined;
      c.sayRatio = undefined;
      c.shortening = false;
      c.same = false;
      c.fails = 0;
      c.recondensed = false;
    });
    resetLive();
    shownKey = null;
  }

  // ---------------------------------------------------------------- transcript scheduler

  function cueIndexAt(t) { // first cue whose slot has not ended yet
    let lo = 0;
    let hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].searchEnd <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function prepareClip(c) {
    const lang = targetLang();
    const slot = (c.slotEnd - c.start) / (video.playbackRate || 1);
    const text = fitText(c.say || c.tr, slot);
    const clip = createClip(text, lang);
    c.clip = clip;
    // Once the real audio length is known, condense further if it cannot fit even at max speed.
    clip.onReady = () => {
      if (c.clip !== clip || !settings.simplifyLanguage || c.recondensed) return;
      const need = clip.duration / settings.maxSpeechRate;
      if (need <= slot * 1.2) return;
      const shorter = condenseToFit(text, Math.floor(text.length * (slot * 1.1) / need));
      if (shorter.length < text.length * 0.9) {
        c.recondensed = true;
        clip.dispose();
        c.clip = createClip(shorter, lang);
      }
    };
  }

  function speakCue(c, t) {
    const vRate = video.playbackRate || 1;
    const remaining = Math.max(0.8, (c.slotEnd - t) / vRate);
    let clip = c.clip;
    c.clip = null;
    if (!clip) clip = createClip(fitText(c.say || c.tr, remaining), targetLang());
    const dur = clip.duration || clip.text.length / cpsFor(targetLang());
    let rate = settings.speechRate;
    if (dur / rate > remaining) rate = Math.min(settings.maxSpeechRate, dur / remaining);
    c.state = 'spoken';
    dub.play(c, clip, rate);
  }

  function skipCue(c) {
    c.state = 'skipped';
    disposeClip(c);
  }

  function tickTranscript() {
    const t = video.currentTime;
    const vRate = video.playbackRate || 1;
    const i0 = cueIndexAt(t);

    let ahead = 0;
    for (let i = i0; i < cues.length; i++) {
      const c = cues[i];
      if (c.start > t + TRANSLATE_AHEAD_SEC * vRate) break;
      if (c.tr === undefined) requestTranslation(c);
      if (!settings.autoDubEnabled || c.state !== 'pending' || !c.tr || c.same) continue;
      const slot = (c.slotEnd - c.start) / vRate;
      if (settings.simplifyLanguage) maybeShorten(c, slot);
      if (ahead < PREFETCH_AHEAD) {
        ahead++;
        // Wait for the simplified version unless the line is about to start.
        const waitForShort = settings.simplifyLanguage && needsShortening(c, slot) && c.start - t > 1.5 * vRate;
        if (!c.clip && !waitForShort) prepareClip(c);
      }
    }

    updateSubtitleForTime(t, i0);

    if (!settings.autoDubEnabled || video.paused || video.seeking) return;

    const due = [];
    for (let i = i0; i < cues.length && cues[i].start <= t + LEAD_SEC * vRate; i++) {
      if (cues[i].state === 'pending') due.push(cues[i]);
    }
    if (!due.length) return;

    // Behind schedule: drop older lines and voice what is being said now.
    const c = due.pop();
    due.forEach(skipCue);

    if (c.tr == null) return; // still translating
    const late = t - c.start;
    if (!c.tr || c.same || late > Math.max(1.5, (c.slotEnd - c.start) * 0.5)) return skipCue(c);

    if (dub.clip) {
      const cur = dub.cue;
      const overrun = !cur || cur.live || t > cur.slotEnd + 0.3;
      if (!overrun || late < 0.8) return; // let the current line finish
    }
    speakCue(c, t);
  }

  // ---------------------------------------------------------------- live captions fallback

  const live = {
    container: null, observer: null, readTimer: 0, hideTimer: 0,
    prev: [], buffer: [], startedAt: 0, lastChange: 0,
    recent: [], queue: [],
  };

  function resetLive() {
    live.prev = [];
    live.buffer = [];
    live.queue = [];
  }

  function watchCaptionContainer(player) {
    const container = player && player.querySelector('.ytp-caption-window-container');
    if (!container || container === live.container) return;
    if (live.observer) live.observer.disconnect();
    live.container = container;
    live.observer = new MutationObserver(() => {
      clearTimeout(live.readTimer);
      live.readTimer = setTimeout(readLiveCaptions, 60);
    });
    live.observer.observe(container, { childList: true, subtree: true, characterData: true });
  }

  // Words of `cur` that were not on screen before. YouTube's rolling captions keep the previous
  // line visible, so the overlap with the previous snapshot must not be voiced again.
  function newWords(prev, cur) {
    const np = prev.map(normalize);
    const nc = cur.map(normalize);
    for (let k = Math.min(np.length, nc.length); k > 0; k--) {
      let ok = true;
      for (let j = 0; j < k; j++) {
        if (np[np.length - k + j] !== nc[j]) { ok = false; break; }
      }
      if (ok) return cur.slice(k);
    }
    // Speech recognition revised the last word(s) in place: replace them if not yet voiced.
    let p = 0;
    while (p < np.length && p < nc.length && np[p] === nc[p]) p++;
    if (p > 0) {
      const revised = np.slice(p);
      const tail = live.buffer.slice(-revised.length).map(normalize);
      if (revised.length && tail.join(' ') === revised.join(' ')) live.buffer.splice(-revised.length);
      return cur.slice(p);
    }
    return cur;
  }

  function readLiveCaptions() {
    if (!live.container || transcriptActive() || !working()) { live.prev = []; return; }
    const lines = live.container.querySelectorAll('.caption-visual-line');
    const texts = lines.length
      ? Array.from(lines, e => e.textContent)
      : Array.from(live.container.querySelectorAll('.ytp-caption-segment'), e => e.textContent);
    const words = cleanCaption(texts.join(' ')).split(/\s+/).filter(Boolean);
    const added = newWords(live.prev, words);
    live.prev = words;
    if (!added.length) return;

    const now = performance.now();
    if (!live.buffer.length) live.startedAt = now;
    live.buffer.push(...added);
    live.lastChange = now;
    const last = added[added.length - 1];
    if ((/[.!?।？！。]$/.test(last) && live.buffer.length >= 3) || live.buffer.length >= LIVE_MAX_WORDS) flushLive();
  }

  function flushLive() {
    if (!live.buffer.length) return;
    const text = cleanCaption(live.buffer.join(' '));
    const span = Math.max(1.2, (performance.now() - live.startedAt) / 1000 + 0.6);
    live.buffer = [];
    const n = normalize(text);
    if (!n || live.recent.some(r => r === n || (n.length > 12 && r.includes(n)))) return;
    live.recent.push(n);
    if (live.recent.length > 12) live.recent.shift();

    const myEpoch = epoch;
    translate(settings.simplifyLanguage ? simplifySource(text) : text).then(res => {
      if (!res || myEpoch !== epoch || transcriptActive()) return;
      showLiveSubtitle(res.same ? null : res.text, text);
      if (res.same || !settings.autoDubEnabled || !video || video.paused) return;
      const enqueue = (say) => {
        if (myEpoch !== epoch || transcriptActive()) return;
        live.queue.push({ tr: say || res.text, span, at: performance.now() });
        while (live.queue.length > 2) live.queue.shift(); // fell behind: drop the oldest phrases
        pumpLive();
      };
      const ratio = settings.simplifyLanguage ? shrinkRatio(res.text, span) : 1;
      // Live captions are already late, so only the instant rule-based shortener is used here.
      if (ratio < 1) requestShorten(text, res.sourceLang, ratio, Math.floor(res.text.length * ratio), false).then(enqueue);
      else enqueue(null);
    });
  }

  function pumpLive() {
    if (dub.clip || transcriptActive()) return;
    while (live.queue.length) {
      const item = live.queue.shift();
      if (performance.now() - item.at > 6000) continue; // too stale to be useful
      const lang = targetLang();
      const clip = createClip(fitText(item.tr, item.span), lang);
      const dur = clip.text.length / cpsFor(lang);
      const rate = Math.max(settings.speechRate, Math.min(settings.maxSpeechRate, dur / item.span));
      dub.play({ live: true }, clip, rate);
      return;
    }
  }

  // ---------------------------------------------------------------- UI

  let overlay = null;
  let shownKey = null;

  function playerEl() {
    return (video && video.closest('.html5-video-player')) || document.getElementById('movie_player');
  }

  function ensureOverlay() {
    const player = playerEl();
    if (!player) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ytdub-overlay-container';
      const box = document.createElement('div');
      box.className = 'ytdub-subtitle-box';
      box.hidden = true;
      const tag = document.createElement('div');
      tag.className = 'ytdub-pill-tag';
      const dubbed = document.createElement('div');
      dubbed.className = 'ytdub-dubbed-text';
      const original = document.createElement('div');
      original.className = 'ytdub-original-text';
      box.append(tag, dubbed, original);
      overlay.append(box);
      overlay.parts = { box, tag, dubbed, original };
    }
    if (overlay.parentElement !== player) player.appendChild(overlay);
  }

  function showSubtitle(dubbed, original) {
    if (!overlay) return;
    const { box, tag, dubbed: dEl, original: oEl } = overlay.parts;
    if (!settings.subtitlesEnabled || (!dubbed && !original)) {
      box.hidden = true;
      shownKey = null;
      return;
    }
    const key = `${dubbed}|${original}|${settings.subtitleMode}|${targetLang()}`;
    if (key === shownKey) return;
    shownKey = key;
    tag.textContent = `🎙️ Auto-Dub: ${targetLang().toUpperCase()}`;
    dEl.textContent = dubbed || original || '';
    const showOrig = settings.subtitleMode === 'bilingual' && dubbed && original && dubbed !== original;
    oEl.textContent = showOrig ? original : '';
    oEl.hidden = !showOrig;
    box.hidden = false;
  }

  function updateSubtitleForTime(t, i0) {
    let c = null;
    for (let i = i0; i < cues.length && cues[i].start <= t; i++) {
      if (t < cues[i].slotEnd) c = cues[i];
    }
    if (!c) return showSubtitle(null, null);
    showSubtitle(c.same ? null : c.tr || null, c.text);
  }

  function showLiveSubtitle(dubbed, original) {
    showSubtitle(dubbed, original);
    clearTimeout(live.hideTimer);
    live.hideTimer = setTimeout(() => showSubtitle(null, null), 6000);
  }

  function updateNativeCaptionVisibility() {
    const player = playerEl();
    if (!player) return;
    const hide = working() && transcriptActive() && (settings.subtitlesEnabled || weEnabledCC);
    player.classList.toggle('ytdub-hide-native', hide);
  }

  function ensurePlayerButton() {
    const player = playerEl();
    const controls = player && player.querySelector('.ytp-right-controls');
    if (!controls) return;
    let btn = controls.querySelector('.ytdub-player-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'ytdub-player-btn';
      btn.title = 'YouTube Auto-Dub (click to toggle voice dubbing)';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveSettings({ autoDubEnabled: !settings.autoDubEnabled });
      });
      controls.prepend(btn);
    }
    const label = `🎙️ DUB: ${targetLang().toUpperCase()}`;
    if (btn.textContent !== label) btn.textContent = label;
    btn.classList.toggle('active', !!settings.autoDubEnabled);
  }

  function tryEnableCaptions() {
    const player = playerEl();
    const btn = player && player.querySelector('.ytp-subtitles-button');
    if (!btn || btn.offsetParent === null) return;
    if (btn.getAttribute('aria-pressed') === 'false') {
      btn.click();
      weEnabledCC = true;
    }
  }

  // ---------------------------------------------------------------- settings

  function working() {
    return settings.autoDubEnabled || settings.subtitlesEnabled;
  }

  function applySettings(next) {
    const prev = settings;
    settings = { ...DEFAULTS, ...next };

    if (prev.targetLanguage !== settings.targetLanguage || prev.simplifyLanguage !== settings.simplifyLanguage) {
      resetTranslations();
    } else if (prev.maxSpeechRate !== settings.maxSpeechRate || prev.ttsEngine !== settings.ttsEngine
        || prev.aiSimplify !== settings.aiSimplify) {
      epoch++;
      shortenInflight = 0;
      cues.forEach(c => {
        if (c.state !== 'pending') return;
        disposeClip(c);
        c.recondensed = false;
        c.say = undefined;
        c.sayRatio = undefined;
        c.shortening = false;
        if (c.tr === null) c.tr = undefined; // translation dropped by the epoch change
      });
      inflight = 0;
    }
    if (!settings.autoDubEnabled) {
      dub.stop();
      live.queue = [];
    }
    if (dub.clip) dub.clip.setVolume(settings.dubVolume);
    duck.refresh();

    shownKey = null;
    if (!working()) showSubtitle(null, null);
    ensurePlayerButton();
    updateNativeCaptionVisibility();
  }

  function saveSettings(patch) {
    const next = { ...settings, ...patch };
    applySettings(next);
    try { chrome.storage.local.set({ ytdub_settings: next }); } catch (e) { /* context gone */ }
  }

  // ---------------------------------------------------------------- video / navigation

  function findVideo() {
    const candidates = [
      document.querySelector('#movie_player video'),
      document.querySelector('video.html5-main-video'),
      document.querySelector('#shorts-player video'),
      document.querySelector('video'),
    ].filter(Boolean);
    return candidates.find(v => !v.paused) || candidates[0] || null;
  }

  function currentIdFromUrl() {
    try {
      const u = new URL(location.href);
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function hookVideo(v) {
    if (hookedVideos.has(v)) return;
    hookedVideos.add(v);
    v.addEventListener('pause', () => dub.stop());
    v.addEventListener('seeking', () => {
      dub.stop();
      cues.forEach(c => { disposeClip(c); c.state = 'pending'; });
      resetLive();
    });
    v.addEventListener('volumechange', () => { if (v === video) duck.onVolumeChange(); });
  }

  function onVideoChanged(id) {
    currentVideoId = id;
    videoChangedAt = performance.now();
    dub.stop();
    cues.forEach(disposeClip);
    cues = [];
    transcriptVideoId = null;
    transcriptSig = '';
    noCaptions = false;
    epoch++;
    inflight = 0;
    shortenInflight = 0;
    ccAutoTried = false;
    weEnabledCC = false;
    resetLive();
    live.recent = [];
    showSubtitle(null, null);
    updateNativeCaptionVisibility();
    if (id) window.postMessage({ source: 'ytdub-ext', type: 'FETCH_TRANSCRIPT', videoId: id }, location.origin);
  }

  function contextAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  // Extension was reloaded/updated: this script is orphaned, so leave the page as we found it.
  function teardown() {
    dead = true;
    intervals.forEach(clearInterval);
    dub.stop();
    duck.apply(1, 0.05);
    if (overlay) overlay.remove();
    document.querySelectorAll('.ytdub-player-btn').forEach(b => b.remove());
    const player = playerEl();
    if (player) player.classList.remove('ytdub-hide-native');
    if (live.observer) live.observer.disconnect();
  }

  function housekeeping() {
    if (dead) return;
    if (!contextAlive()) return teardown();

    const v = findVideo();
    if (v && v !== video) {
      video = v;
      hookVideo(v);
    }
    const id = currentIdFromUrl();
    if (id !== currentVideoId) onVideoChanged(id);

    ensureOverlay();
    ensurePlayerButton();
    watchCaptionContainer(playerEl());
    updateNativeCaptionVisibility();

    if (live.buffer.length && performance.now() - live.lastChange > LIVE_FLUSH_PAUSE_MS) flushLive();

    // Captions are the source of the dub: switch them on if the user has not.
    if (!ccAutoTried && !transcriptActive() && settings.autoDubEnabled && settings.autoEnableCaptions
        && video && !video.paused && performance.now() - videoChangedAt > 1500) {
      ccAutoTried = true;
      tryEnableCaptions();
    }
  }

  function tick() {
    if (dead || !video || !working()) return;
    const player = playerEl();
    if (player && player.classList.contains('ad-showing')) {
      if (dub.clip) dub.stop();
      return;
    }
    if (transcriptActive()) tickTranscript();
  }

  // ---------------------------------------------------------------- init

  function init() {
    loadVoices();
    if (synth && 'onvoiceschanged' in synth) synth.addEventListener('voiceschanged', loadVoices);

    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || e.data.source !== 'ytdub-page') return;
      if (e.data.type === 'TIMEDTEXT' && typeof e.data.body === 'string') handleTimedText(e.data.url, e.data.body);
      else if (e.data.type === 'NO_CAPTIONS' && e.data.videoId === currentVideoId) noCaptions = true;
    });

    // Web Audio needs a user gesture before it may route the video's sound.
    const prime = () => { if (settings.autoDubEnabled) duck.prime(); };
    document.addEventListener('pointerdown', prime, true);
    document.addEventListener('keydown', prime, true);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.ytdub_settings && changes.ytdub_settings.newValue) {
        applySettings(changes.ytdub_settings.newValue);
      }
    });

    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (req && req.action === 'GET_STATUS') {
        sendResponse({
          hasVideo: !!video,
          mode: transcriptActive() ? 'transcript' : (noCaptions ? 'no-captions' : 'live'),
          lines: transcriptActive() ? cues.length : 0,
          audioRouting: duck.gain ? 'webaudio' : 'element',
        });
      }
    });

    housekeeping();
    intervals.push(setInterval(housekeeping, 500));
    intervals.push(setInterval(tick, 100));
  }

  chrome.storage.local.get(['ytdub_settings'], (result) => {
    settings = { ...DEFAULTS, ...((result && result.ytdub_settings) || {}) };
    init();
  });
})();
