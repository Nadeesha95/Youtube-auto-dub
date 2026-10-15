/**
 * YouTube Auto-Dub Content Script (Manifest V3) - v1.3.0
 * 1. Two-Stage Audio Ducking: 5% at cue, FULLY MUTED (0%) while voice is speaking!
 * 2. Strict Anti-Repetition Guard: Prevents repeated sentences or looping phrases.
 * 3. Real-Time Instant Options Update & Cloud HD Audio.
 */
(() => {
  let settings = {
    targetLanguage: 'hi',
    autoDetectCountry: true,
    autoDubEnabled: true,
    dubVolume: 1.0,
    originalVolumeDucking: 0.05,
    speechRate: 1.15,
    speechPitch: 1.0,
    voiceGender: 'auto',
    ttsEngine: 'auto',
    simplifyLanguage: true,
    subtitlesEnabled: true,
    subtitleMode: 'bilingual',
    subtitleFontSize: 'medium',
    subtitleBackgroundOpacity: 85,
    noDelaySync: true,
    prebufferLeadTimeMs: 250,
    usage: {
      date: new Date().toISOString().split('T')[0],
      wordsUsedToday: 0,
      secondsUsedToday: 0,
      dailyWordLimit: 2500,
      dailySecondsLimit: 900,
      tier: 'free',
      licenseKey: null
    }
  };

  const CLOUD_FALLBACK_LANGUAGES = ['si', 'ta', 'te', 'kn', 'ml', 'or', 'as', 'my', 'km', 'am', 'ne', 'lo'];

  let videoElement = null;
  let synth = window.speechSynthesis;
  let activeAudioStream = null;
  let preloadedAudio = null;
  let preloadedKey = '';
  let originalVolumeBeforeDucking = 1.0;
  let isDucking = false;
  let subtitleContainer = null;
  let currentVoices = [];

  // ANTI-REPETITION STATE
  let lastSpokenNormalized = '';
  let lastSpokenTimestamp = 0;
  const recentSpokenPhrases = new Set();

  function normalizeText(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_~`()?"'।]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Real-time listener for instant settings updates
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'SETTINGS_CHANGED' && request.settings) {
        applyRealtimeSettings(request.settings);
        sendResponse({ success: true });
      } else if (request.action === 'TEST_DUBBING') {
        speakDubbing(request.sampleText || 'Live voice test.', 3.0, true);
        sendResponse({ success: true });
      }
    });
  }

  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['ytdub_settings'], (result) => {
      if (result && result.ytdub_settings) {
        settings = { ...settings, ...result.ytdub_settings };
      }
      init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.ytdub_settings) {
        applyRealtimeSettings(changes.ytdub_settings.newValue);
      }
    });
  } else {
    init();
  }

  function applyRealtimeSettings(newSettings) {
    settings = { ...settings, ...newSettings };

    const btn = document.querySelector('.ytdub-player-btn');
    if (btn) {
      btn.classList.toggle('active', settings.autoDubEnabled);
      btn.style.color = settings.autoDubEnabled ? '#38bdf8' : '#94a3b8';
      btn.innerHTML = `🎙️ <span style="margin-left:4px">DUB: ${(settings.targetLanguage || 'HI').toUpperCase()}</span>`;
    }

    if (videoElement && !settings.autoDubEnabled) {
      stopAllAudio();
      restoreAudioVolume();
    }
  }

  function init() {
    loadVoices();
    if (synth && synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }

    waitForVideo();
    injectSubtitleOverlay();
    injectPlayerControls();
    observeCaptions();
  }

  function loadVoices() {
    if (!synth) return;
    currentVoices = synth.getVoices() || [];
  }

  function waitForVideo() {
    const checkVideo = () => {
      const vid = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (vid && vid !== videoElement) {
        videoElement = vid;
        originalVolumeBeforeDucking = vid.volume || 1.0;
        attachVideoEvents(videoElement);
      }
    };
    checkVideo();
    setInterval(checkVideo, 1200);
  }

  function attachVideoEvents(vid) {
    vid.addEventListener('pause', () => stopAllAudio());
    vid.addEventListener('seeked', () => {
      stopAllAudio();
      recentSpokenPhrases.clear();
      lastSpokenNormalized = '';
    });
    vid.addEventListener('volumechange', () => {
      if (!isDucking) {
        originalVolumeBeforeDucking = vid.volume;
      }
    });
  }

  // TWO-STAGE DUCKING:
  // Stage 1: Cue start -> 5% volume
  function duckToCueLevel() {
    if (!videoElement) return;
    if (videoElement.volume > 0.1) {
      originalVolumeBeforeDucking = videoElement.volume;
    }
    videoElement.volume = 0.05; // 5%
    isDucking = true;
  }

  // Stage 2: Actively speaking -> 0% FULLY MUTED
  function muteFullyDuringSpeech() {
    if (!videoElement) return;
    videoElement.volume = 0.0; // Fully muted!
    isDucking = true;
  }

  function restoreAudioVolume() {
    if (!videoElement || !isDucking) return;
    videoElement.volume = originalVolumeBeforeDucking;
    isDucking = false;
  }

  function stopAllAudio() {
    if (synth) synth.cancel();
    if (activeAudioStream) {
      activeAudioStream.pause();
      activeAudioStream.currentTime = 0;
      activeAudioStream = null;
    }
    restoreAudioVolume();
  }

  // Zero-delay speech dubbing with anti-repetition protection
  function speakDubbing(text, availableDurationSec = 3.5, force = false) {
    if (!settings.autoDubEnabled || !text) return;

    const normalized = normalizeText(text);
    const now = Date.now();

    // STRICT ANTI-REPETITION FILTER:
    // Drop if same phrase was spoken in last 4 seconds or is currently in recent set!
    if (!force) {
      if (normalized === lastSpokenNormalized && (now - lastSpokenTimestamp < 4000)) {
        return; // DROP DUPLICATE!
      }
      if (recentSpokenPhrases.has(normalized) && (now - lastSpokenTimestamp < 6000)) {
        return; // DROP DUPLICATE!
      }
    }

    lastSpokenNormalized = normalized;
    lastSpokenTimestamp = now;
    recentSpokenPhrases.add(normalized);
    setTimeout(() => recentSpokenPhrases.delete(normalized), 8000);

    stopAllAudio();
    duckToCueLevel(); // First step: reduce to 5%

    let finalText = text;
    if (settings.simplifyLanguage && finalText.length > 70) {
      finalText = simplifyTextForVoice(finalText);
    }

    const lang = settings.targetLanguage.toLowerCase();
    const needsCloudStream =
      settings.ttsEngine === 'cloud_stream' ||
      CLOUD_FALLBACK_LANGUAGES.includes(lang) ||
      !hasLocalVoiceForLang(lang);

    let effectiveRate = settings.speechRate || 1.15;
    if (settings.noDelaySync && availableDurationSec > 0) {
      const estSec = finalText.length / 15;
      if (estSec > availableDurationSec) {
        effectiveRate = Math.min(1.65, effectiveRate * (estSec / availableDurationSec));
      }
    }

    if (needsCloudStream) {
      playCloudTtsAudio(finalText, lang, effectiveRate);
    } else {
      playLocalSpeechSynthesis(finalText, lang, effectiveRate);
    }
  }

  function hasLocalVoiceForLang(lang) {
    if (!currentVoices.length) loadVoices();
    return currentVoices.some(v => v.lang.toLowerCase().startsWith(lang));
  }

  function playCloudTtsAudio(text, lang, rate) {
    try {
      const encoded = encodeURIComponent(text.slice(0, 200));
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encoded}`;
      const audio = new Audio(url);

      audio.playbackRate = rate;
      audio.volume = settings.dubVolume || 1.0;
      activeAudioStream = audio;

      audio.onplay = () => {
        // FULLY MUTE ORIGINAL VIDEO WHILE SPEAKING!
        muteFullyDuringSpeech();
      };

      audio.onended = () => {
        restoreAudioVolume();
        activeAudioStream = null;
      };

      audio.onerror = () => {
        playLocalSpeechSynthesis(text, lang, rate);
      };

      audio.play().catch(() => {
        playLocalSpeechSynthesis(text, lang, rate);
      });
    } catch (e) {
      playLocalSpeechSynthesis(text, lang, rate);
    }
  }

  function playLocalSpeechSynthesis(text, lang, rate) {
    if (!synth) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = settings.speechPitch || 1.0;
    utterance.volume = settings.dubVolume || 1.0;

    const matchVoice = currentVoices.find(v => v.lang.toLowerCase().startsWith(lang));
    if (matchVoice) utterance.voice = matchVoice;

    utterance.onstart = () => {
      // FULLY MUTE ORIGINAL VIDEO WHILE SPEAKING!
      muteFullyDuringSpeech();
    };

    utterance.onend = () => restoreAudioVolume();
    utterance.onerror = () => restoreAudioVolume();

    synth.speak(utterance);
  }

  function simplifyTextForVoice(str) {
    return str
      .replace(/\(.*?\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function injectSubtitleOverlay() {
    if (document.getElementById('ytdub-overlay-container')) return;
    const player = document.querySelector('#movie_player') || document.body;

    subtitleContainer = document.createElement('div');
    subtitleContainer.id = 'ytdub-overlay-container';
    subtitleContainer.innerHTML = `
      <div class="ytdub-subtitle-box" id="ytdub-subtitle-box" style="display: none;">
        <div class="ytdub-pill-tag" id="ytdub-pill-tag">
          <span>🎙️ Auto-Dub: <strong id="ytdub-badge-lang">HI</strong></span>
        </div>
        <div class="ytdub-dubbed-text" id="ytdub-dubbed-text"></div>
        <div class="ytdub-original-text" id="ytdub-original-text"></div>
      </div>
    `;
    player.appendChild(subtitleContainer);
  }

  function updateSubtitleDisplay(dubbedText, originalText) {
    if (!settings.subtitlesEnabled) {
      const box = document.getElementById('ytdub-subtitle-box');
      if (box) box.style.display = 'none';
      return;
    }

    const box = document.getElementById('ytdub-subtitle-box');
    const dubbedElem = document.getElementById('ytdub-dubbed-text');
    const origElem = document.getElementById('ytdub-original-text');
    const badgeLang = document.getElementById('ytdub-badge-lang');

    if (!box || !dubbedElem) return;

    if (badgeLang) {
      badgeLang.textContent = (settings.targetLanguage || 'HI').toUpperCase();
    }
    dubbedElem.textContent = dubbedText;

    if (settings.subtitleMode === 'bilingual' && originalText && originalText !== dubbedText) {
      origElem.style.display = 'block';
      origElem.textContent = originalText;
    } else {
      origElem.style.display = 'none';
    }

    box.style.display = 'inline-block';
  }

  function injectPlayerControls() {
    const checkControls = () => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (rightControls && !document.querySelector('.ytdub-player-btn')) {
        const btn = document.createElement('button');
        btn.className = 'ytdub-player-btn active';
        btn.title = 'YouTube Auto-Dub (Click to toggle voice dubbing)';
        btn.innerHTML = `🎙️ <span style="margin-left:4px">DUB: ${(settings.targetLanguage || 'HI').toUpperCase()}</span>`;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          settings.autoDubEnabled = !settings.autoDubEnabled;
          btn.classList.toggle('active', settings.autoDubEnabled);
          btn.style.color = settings.autoDubEnabled ? '#38bdf8' : '#94a3b8';
          if (!settings.autoDubEnabled) {
            stopAllAudio();
          }
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ ytdub_settings: settings });
          }
        });
        rightControls.prepend(btn);
      }
    };
    setInterval(checkControls, 1500);
  }

  function translateAndSpeak(captionText, durationSec = 3.5) {
    chrome.runtime.sendMessage({
      action: 'TRANSLATE_CAPTION',
      text: captionText,
      targetLang: settings.targetLanguage,
      simplify: settings.simplifyLanguage
    }, (response) => {
      if (response && response.translatedText) {
        updateSubtitleDisplay(response.translatedText, captionText);
        speakDubbing(response.translatedText, durationSec);
      }
    });
  }

  // Caption Mutation Observer with Strict Incremental Deduplication
  function observeCaptions() {
    let observedCache = '';

    const observer = new MutationObserver(() => {
      const captionSegments = document.querySelectorAll('.ytp-caption-segment');
      if (!captionSegments || captionSegments.length === 0) return;

      let fullCaption = Array.from(captionSegments).map(s => s.textContent).join(' ').trim();
      if (!fullCaption) return;

      const norm = normalizeText(fullCaption);
      // If same or prefix/fragment of recent caption, ignore!
      if (norm === observedCache || (observedCache && norm.startsWith(observedCache) && norm.length - observedCache.length < 5)) {
        return;
      }

      observedCache = norm;
      translateAndSpeak(fullCaption, 3.5);
    });

    const captionWindow = document.querySelector('.ytp-caption-window-container') || document.body;
    observer.observe(captionWindow, { childList: true, subtree: true, characterData: true });
  }
})();
