/**
 * YouTube Auto-Dub Popup Script
 */
const ALL_LANGUAGES = [
  {
    "code": "hi",
    "name": "Hindi",
    "nativeName": "हिन्दी",
    "country": "India",
    "ttsPrefix": "hi-IN"
  },
  {
    "code": "si",
    "name": "Sinhala",
    "nativeName": "සිංහල",
    "country": "Sri Lanka",
    "ttsPrefix": "si-LK"
  },
  {
    "code": "en",
    "name": "English",
    "nativeName": "English",
    "country": "United States",
    "ttsPrefix": "en-US"
  },
  {
    "code": "es",
    "name": "Spanish",
    "nativeName": "Español",
    "country": "Spain",
    "ttsPrefix": "es-ES"
  },
  {
    "code": "zh",
    "name": "Chinese (Simplified)",
    "nativeName": "简体中文",
    "country": "China",
    "ttsPrefix": "zh-CN"
  },
  {
    "code": "ar",
    "name": "Arabic",
    "nativeName": "العربية",
    "country": "Saudi Arabia",
    "ttsPrefix": "ar-SA"
  },
  {
    "code": "bn",
    "name": "Bengali",
    "nativeName": "বাংলা",
    "country": "Bangladesh",
    "ttsPrefix": "bn-BD"
  },
  {
    "code": "pt",
    "name": "Portuguese",
    "nativeName": "Português",
    "country": "Brazil",
    "ttsPrefix": "pt-BR"
  },
  {
    "code": "ru",
    "name": "Russian",
    "nativeName": "Русский",
    "country": "Russia",
    "ttsPrefix": "ru-RU"
  },
  {
    "code": "ja",
    "name": "Japanese",
    "nativeName": "日本語",
    "country": "Japan",
    "ttsPrefix": "ja-JP"
  },
  {
    "code": "pa",
    "name": "Punjabi",
    "nativeName": "ਪੰਜਾਬੀ",
    "country": "India",
    "ttsPrefix": "pa-IN"
  },
  {
    "code": "de",
    "name": "German",
    "nativeName": "Deutsch",
    "country": "Germany",
    "ttsPrefix": "de-DE"
  },
  {
    "code": "jv",
    "name": "Javanese",
    "nativeName": "Basa Jawa",
    "country": "Indonesia",
    "ttsPrefix": "jv-ID"
  },
  {
    "code": "ko",
    "name": "Korean",
    "nativeName": "한국어",
    "country": "South Korea",
    "ttsPrefix": "ko-KR"
  },
  {
    "code": "fr",
    "name": "French",
    "nativeName": "Français",
    "country": "France",
    "ttsPrefix": "fr-FR"
  },
  {
    "code": "te",
    "name": "Telugu",
    "nativeName": "తెలుగు",
    "country": "India",
    "ttsPrefix": "te-IN"
  },
  {
    "code": "mr",
    "name": "Marathi",
    "nativeName": "मराठी",
    "country": "India",
    "ttsPrefix": "mr-IN"
  },
  {
    "code": "tr",
    "name": "Turkish",
    "nativeName": "Türkçe",
    "country": "Turkey",
    "ttsPrefix": "tr-TR"
  },
  {
    "code": "ta",
    "name": "Tamil",
    "nativeName": "தமிழ்",
    "country": "India / Sri Lanka",
    "ttsPrefix": "ta-IN"
  },
  {
    "code": "vi",
    "name": "Vietnamese",
    "nativeName": "Tiếng Việt",
    "country": "Vietnam",
    "ttsPrefix": "vi-VN"
  },
  {
    "code": "ur",
    "name": "Urdu",
    "nativeName": "اردو",
    "country": "Pakistan",
    "ttsPrefix": "ur-PK"
  },
  {
    "code": "it",
    "name": "Italian",
    "nativeName": "Italiano",
    "country": "Italy",
    "ttsPrefix": "it-IT"
  },
  {
    "code": "gu",
    "name": "Gujarati",
    "nativeName": "ગુજરાતી",
    "country": "India",
    "ttsPrefix": "gu-IN"
  },
  {
    "code": "fa",
    "name": "Persian (Farsi)",
    "nativeName": "فارسی",
    "country": "Iran",
    "ttsPrefix": "fa-IR"
  },
  {
    "code": "bho",
    "name": "Bhojpuri",
    "nativeName": "भोजपुरी",
    "country": "India",
    "ttsPrefix": "hi-IN"
  },
  {
    "code": "pl",
    "name": "Polish",
    "nativeName": "Polski",
    "country": "Poland",
    "ttsPrefix": "pl-PL"
  },
  {
    "code": "uk",
    "name": "Ukrainian",
    "nativeName": "Українська",
    "country": "Ukraine",
    "ttsPrefix": "uk-UA"
  },
  {
    "code": "ml",
    "name": "Malayalam",
    "nativeName": "മലയാളം",
    "country": "India",
    "ttsPrefix": "ml-IN"
  },
  {
    "code": "kn",
    "name": "Kannada",
    "nativeName": "ಕನ್ನಡ",
    "country": "India",
    "ttsPrefix": "kn-IN"
  },
  {
    "code": "or",
    "name": "Odia",
    "nativeName": "ଓଡ଼ିଆ",
    "country": "India",
    "ttsPrefix": "or-IN"
  },
  {
    "code": "my",
    "name": "Burmese",
    "nativeName": "မြန်မာစာ",
    "country": "Myanmar",
    "ttsPrefix": "my-MM"
  },
  {
    "code": "th",
    "name": "Thai",
    "nativeName": "ไทย",
    "country": "Thailand",
    "ttsPrefix": "th-TH"
  },
  {
    "code": "ha",
    "name": "Hausa",
    "nativeName": "Harshen Hausa",
    "country": "Nigeria",
    "ttsPrefix": "ha-NG"
  },
  {
    "code": "id",
    "name": "Indonesian",
    "nativeName": "Bahasa Indonesia",
    "country": "Indonesia",
    "ttsPrefix": "id-ID"
  },
  {
    "code": "yo",
    "name": "Yoruba",
    "nativeName": "Èdè Yorùbá",
    "country": "Nigeria",
    "ttsPrefix": "yo-NG"
  },
  {
    "code": "sw",
    "name": "Swahili",
    "nativeName": "Kiswahili",
    "country": "Kenya / Tanzania",
    "ttsPrefix": "sw-KE"
  },
  {
    "code": "nl",
    "name": "Dutch",
    "nativeName": "Nederlands",
    "country": "Netherlands",
    "ttsPrefix": "nl-NL"
  },
  {
    "code": "ro",
    "name": "Romanian",
    "nativeName": "Română",
    "country": "Romania",
    "ttsPrefix": "ro-RO"
  },
  {
    "code": "am",
    "name": "Amharic",
    "nativeName": "አማርኛ",
    "country": "Ethiopia",
    "ttsPrefix": "am-ET"
  },
  {
    "code": "az",
    "name": "Azerbaijani",
    "nativeName": "Azərbaycan",
    "country": "Azerbaijan",
    "ttsPrefix": "az-AZ"
  },
  {
    "code": "ku",
    "name": "Kurdish",
    "nativeName": "Kurdî",
    "country": "Iraq",
    "ttsPrefix": "ku-TR"
  },
  {
    "code": "ps",
    "name": "Pashto",
    "nativeName": "پښتو",
    "country": "Afghanistan",
    "ttsPrefix": "ps-AF"
  },
  {
    "code": "uz",
    "name": "Uzbek",
    "nativeName": "Oʻzbekcha",
    "country": "Uzbekistan",
    "ttsPrefix": "uz-UZ"
  },
  {
    "code": "sd",
    "name": "Sindhi",
    "nativeName": "سنڌي",
    "country": "Pakistan",
    "ttsPrefix": "sd-PK"
  },
  {
    "code": "ne",
    "name": "Nepali",
    "nativeName": "नेपाली",
    "country": "Nepal",
    "ttsPrefix": "ne-NP"
  },
  {
    "code": "as",
    "name": "Assamese",
    "nativeName": "অসমীয়া",
    "country": "India",
    "ttsPrefix": "as-IN"
  },
  {
    "code": "el",
    "name": "Greek",
    "nativeName": "Ελληνικά",
    "country": "Greece",
    "ttsPrefix": "el-GR"
  },
  {
    "code": "cs",
    "name": "Czech",
    "nativeName": "Čeština",
    "country": "Czech Republic",
    "ttsPrefix": "cs-CZ"
  },
  {
    "code": "sv",
    "name": "Swedish",
    "nativeName": "Svenska",
    "country": "Sweden",
    "ttsPrefix": "sv-SE"
  },
  {
    "code": "hu",
    "name": "Hungarian",
    "nativeName": "Magyar",
    "country": "Hungary",
    "ttsPrefix": "hu-HU"
  },
  {
    "code": "be",
    "name": "Belarusian",
    "nativeName": "Беларуская",
    "country": "Belarus",
    "ttsPrefix": "be-BY"
  },
  {
    "code": "bg",
    "name": "Bulgarian",
    "nativeName": "Български",
    "country": "Bulgaria",
    "ttsPrefix": "bg-BG"
  },
  {
    "code": "da",
    "name": "Danish",
    "nativeName": "Dansk",
    "country": "Denmark",
    "ttsPrefix": "da-DK"
  },
  {
    "code": "fi",
    "name": "Finnish",
    "nativeName": "Suomi",
    "country": "Finland",
    "ttsPrefix": "fi-FI"
  },
  {
    "code": "he",
    "name": "Hebrew",
    "nativeName": "עברית",
    "country": "Israel",
    "ttsPrefix": "he-IL"
  },
  {
    "code": "no",
    "name": "Norwegian",
    "nativeName": "Norsk",
    "country": "Norway",
    "ttsPrefix": "no-NO"
  },
  {
    "code": "sk",
    "name": "Slovak",
    "nativeName": "Slovenčina",
    "country": "Slovakia",
    "ttsPrefix": "sk-SK"
  },
  {
    "code": "sr",
    "name": "Serbian",
    "nativeName": "Српски",
    "country": "Serbia",
    "ttsPrefix": "sr-RS"
  },
  {
    "code": "hr",
    "name": "Croatian",
    "nativeName": "Hrvatski",
    "country": "Croatia",
    "ttsPrefix": "hr-HR"
  },
  {
    "code": "lt",
    "name": "Lithuanian",
    "nativeName": "Lietuvių",
    "country": "Lithuania",
    "ttsPrefix": "lt-LT"
  },
  {
    "code": "sl",
    "name": "Slovenian",
    "nativeName": "Slovenščina",
    "country": "Slovenia",
    "ttsPrefix": "sl-SI"
  },
  {
    "code": "lv",
    "name": "Latvian",
    "nativeName": "Latviešu",
    "country": "Latvia",
    "ttsPrefix": "lv-LV"
  },
  {
    "code": "et",
    "name": "Estonian",
    "nativeName": "Eesti",
    "country": "Estonia",
    "ttsPrefix": "et-EE"
  },
  {
    "code": "km",
    "name": "Khmer",
    "nativeName": "ខ្មែរ",
    "country": "Cambodia",
    "ttsPrefix": "km-KH"
  },
  {
    "code": "lo",
    "name": "Lao",
    "nativeName": "ລາວ",
    "country": "Laos",
    "ttsPrefix": "lo-LA"
  },
  {
    "code": "ka",
    "name": "Georgian",
    "nativeName": "ქართული",
    "country": "Georgia",
    "ttsPrefix": "ka-GE"
  },
  {
    "code": "hy",
    "name": "Armenian",
    "nativeName": "Հայերեն",
    "country": "Armenia",
    "ttsPrefix": "hy-AM"
  },
  {
    "code": "sq",
    "name": "Albanian",
    "nativeName": "Shqip",
    "country": "Albania",
    "ttsPrefix": "sq-AL"
  },
  {
    "code": "mk",
    "name": "Macedonian",
    "nativeName": "Македонски",
    "country": "North Macedonia",
    "ttsPrefix": "mk-MK"
  },
  {
    "code": "bs",
    "name": "Bosnian",
    "nativeName": "Bosanski",
    "country": "Bosnia",
    "ttsPrefix": "bs-BA"
  },
  {
    "code": "ms",
    "name": "Malay",
    "nativeName": "Bahasa Melayu",
    "country": "Malaysia",
    "ttsPrefix": "ms-MY"
  },
  {
    "code": "tl",
    "name": "Tagalog (Filipino)",
    "nativeName": "Tagalog",
    "country": "Philippines",
    "ttsPrefix": "fil-PH"
  },
  {
    "code": "af",
    "name": "Afrikaans",
    "nativeName": "Afrikaans",
    "country": "South Africa",
    "ttsPrefix": "af-ZA"
  },
  {
    "code": "is",
    "name": "Icelandic",
    "nativeName": "Íslenska",
    "country": "Iceland",
    "ttsPrefix": "is-IS"
  },
  {
    "code": "ga",
    "name": "Irish",
    "nativeName": "Gaeilge",
    "country": "Ireland",
    "ttsPrefix": "ga-IE"
  },
  {
    "code": "cy",
    "name": "Welsh",
    "nativeName": "Cymraeg",
    "country": "United Kingdom",
    "ttsPrefix": "cy-GB"
  },
  {
    "code": "mt",
    "name": "Maltese",
    "nativeName": "Malti",
    "country": "Malta",
    "ttsPrefix": "mt-MT"
  },
  {
    "code": "mn",
    "name": "Mongolian",
    "nativeName": "Монгол хэл",
    "country": "Mongolia",
    "ttsPrefix": "mn-MN"
  },
  {
    "code": "kk",
    "name": "Kazakh",
    "nativeName": "Қазақша",
    "country": "Kazakhstan",
    "ttsPrefix": "kk-KZ"
  },
  {
    "code": "ky",
    "name": "Kyrgyz",
    "nativeName": "Кыргызча",
    "country": "Kyrgyzstan",
    "ttsPrefix": "ky-KG"
  },
  {
    "code": "tg",
    "name": "Tajik",
    "nativeName": "Тоҷикӣ",
    "country": "Tajikistan",
    "ttsPrefix": "tg-TJ"
  },
  {
    "code": "tk",
    "name": "Turkmen",
    "nativeName": "Türkmençe",
    "country": "Turkmenistan",
    "ttsPrefix": "tk-TM"
  },
  {
    "code": "so",
    "name": "Somali",
    "nativeName": "Soomaaliga",
    "country": "Somalia",
    "ttsPrefix": "so-SO"
  },
  {
    "code": "mg",
    "name": "Malagasy",
    "nativeName": "Malagasy",
    "country": "Madagascar",
    "ttsPrefix": "mg-MG"
  },
  {
    "code": "sn",
    "name": "Shona",
    "nativeName": "chiShona",
    "country": "Zimbabwe",
    "ttsPrefix": "sn-ZW"
  },
  {
    "code": "zu",
    "name": "Zulu",
    "nativeName": "isiZulu",
    "country": "South Africa",
    "ttsPrefix": "zu-ZA"
  },
  {
    "code": "xh",
    "name": "Xhosa",
    "nativeName": "isiXhosa",
    "country": "South Africa",
    "ttsPrefix": "xh-ZA"
  },
  {
    "code": "st",
    "name": "Sesotho",
    "nativeName": "Sesotho",
    "country": "Lesotho",
    "ttsPrefix": "st-LS"
  },
  {
    "code": "ig",
    "name": "Igbo",
    "nativeName": "Asụsụ Igbo",
    "country": "Nigeria",
    "ttsPrefix": "ig-NG"
  },
  {
    "code": "rw",
    "name": "Kinyarwanda",
    "nativeName": "Ikinyarwanda",
    "country": "Rwanda",
    "ttsPrefix": "rw-RW"
  },
  {
    "code": "ny",
    "name": "Chichewa",
    "nativeName": "Chichewa",
    "country": "Malawi",
    "ttsPrefix": "ny-MW"
  },
  {
    "code": "gd",
    "name": "Scottish Gaelic",
    "nativeName": "Gàidhlig",
    "country": "United Kingdom",
    "ttsPrefix": "gd-GB"
  },
  {
    "code": "eu",
    "name": "Basque",
    "nativeName": "Euskara",
    "country": "Spain",
    "ttsPrefix": "eu-ES"
  },
  {
    "code": "gl",
    "name": "Galician",
    "nativeName": "Galego",
    "country": "Spain",
    "ttsPrefix": "gl-ES"
  },
  {
    "code": "ca",
    "name": "Catalan",
    "nativeName": "Català",
    "country": "Spain",
    "ttsPrefix": "ca-ES"
  },
  {
    "code": "eo",
    "name": "Esperanto",
    "nativeName": "Esperanto",
    "country": "International",
    "ttsPrefix": "eo"
  },
  {
    "code": "la",
    "name": "Latin",
    "nativeName": "Latina",
    "country": "Vatican",
    "ttsPrefix": "la"
  },
  {
    "code": "haw",
    "name": "Hawaiian",
    "nativeName": "ʻŌlelo Hawaiʻi",
    "country": "United States",
    "ttsPrefix": "haw"
  },
  {
    "code": "sm",
    "name": "Samoan",
    "nativeName": "Gagana Samoa",
    "country": "Samoa",
    "ttsPrefix": "sm"
  },
  {
    "code": "mi",
    "name": "Maori",
    "nativeName": "Te Reo Māori",
    "country": "New Zealand",
    "ttsPrefix": "mi-NZ"
  }
];


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
  autoEnableCaptions: true,
  aiSimplify: true
};

const $ = (id) => document.getElementById(id);
const elements = {
  autoDubToggle: $('auto-dub-toggle'),
  langSelect: $('lang-select'),
  langSearch: $('lang-search'),
  dubVolume: $('dub-volume'),
  originalVolume: $('original-volume'),
  speechRate: $('speech-rate'),
  maxRate: $('max-rate'),
  simplifyToggle: $('simplify-toggle'),
  aiToggle: $('ai-toggle'),
  aiStatus: $('ai-status'),
  aiDownloadBtn: $('ai-download-btn'),
  subtitlesToggle: $('subtitles-toggle'),
  subtitleMode: $('subtitle-mode'),
  ttsEngine: $('tts-engine'),
  testBtn: $('test-voice-btn'),
  status: $('status-line')
};

let currentSettings = { ...DEFAULT_SETTINGS };

function renderLanguageOptions(filter = '') {
  elements.langSelect.innerHTML = '';
  const search = filter.toLowerCase().trim();

  const filtered = ALL_LANGUAGES.filter(l =>
    l.name.toLowerCase().includes(search) ||
    l.nativeName.toLowerCase().includes(search) ||
    l.country.toLowerCase().includes(search) ||
    l.code.toLowerCase().includes(search)
  );

  filtered.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = `${lang.name} (${lang.nativeName}) - ${lang.country}`;
    if (lang.code === currentSettings.targetLanguage) opt.selected = true;
    elements.langSelect.appendChild(opt);
  });
}

function renderRangeLabels() {
  $('dub-volume-value').textContent = `${Math.round(currentSettings.dubVolume * 100)}%`;
  $('original-volume-value').textContent = currentSettings.originalVolumeDuringDub === 0
    ? 'Muted'
    : `${Math.round(currentSettings.originalVolumeDuringDub * 100)}%`;
  $('speech-rate-value').textContent = `${Number(currentSettings.speechRate).toFixed(2)}×`;
  $('max-rate-value').textContent = `${Number(currentSettings.maxSpeechRate).toFixed(1)}×`;
}

function applySettingsToUI() {
  elements.autoDubToggle.checked = currentSettings.autoDubEnabled;
  elements.dubVolume.value = Math.round(currentSettings.dubVolume * 100);
  elements.originalVolume.value = Math.round(currentSettings.originalVolumeDuringDub * 100);
  elements.speechRate.value = currentSettings.speechRate;
  elements.maxRate.value = currentSettings.maxSpeechRate;
  elements.simplifyToggle.checked = currentSettings.simplifyLanguage;
  elements.aiToggle.checked = currentSettings.aiSimplify;
  elements.subtitlesToggle.checked = currentSettings.subtitlesEnabled;
  elements.subtitleMode.value = currentSettings.subtitleMode === 'bilingual' ? 'bilingual' : 'dubbed';
  elements.ttsEngine.value = currentSettings.ttsEngine === 'local' ? 'local' : 'auto';
  renderRangeLabels();
  renderLanguageOptions(elements.langSearch.value);
}

// The content script listens to storage changes, so every write applies to the video immediately.
let saveTimer = 0;
function update(patch, { immediate = true } = {}) {
  currentSettings = { ...currentSettings, ...patch };
  renderRangeLabels();
  clearTimeout(saveTimer);
  const save = () => chrome.storage.local.set({ ytdub_settings: currentSettings });
  if (immediate) save();
  else saveTimer = setTimeout(save, 60); // throttle while a slider is being dragged
}

function bindToggle(el, key) {
  el.addEventListener('change', () => update({ [key]: el.checked }));
}

function bindRange(el, key, toValue) {
  el.addEventListener('input', () => update({ [key]: toValue(el.value) }, { immediate: false }));
  el.addEventListener('change', () => update({ [key]: toValue(el.value) }));
}

elements.langSearch.addEventListener('input', (e) => renderLanguageOptions(e.target.value));
elements.langSelect.addEventListener('change', (e) => update({ targetLanguage: e.target.value }));
bindToggle(elements.autoDubToggle, 'autoDubEnabled');
bindToggle(elements.simplifyToggle, 'simplifyLanguage');
bindToggle(elements.aiToggle, 'aiSimplify');
bindToggle(elements.subtitlesToggle, 'subtitlesEnabled');
bindRange(elements.dubVolume, 'dubVolume', v => Number(v) / 100);
bindRange(elements.originalVolume, 'originalVolumeDuringDub', v => Number(v) / 100);
bindRange(elements.speechRate, 'speechRate', Number);
bindRange(elements.maxRate, 'maxSpeechRate', Number);
elements.subtitleMode.addEventListener('change', (e) => update({ subtitleMode: e.target.value }));
elements.ttsEngine.addEventListener('change', (e) => update({ ttsEngine: e.target.value }));

function setStatus(text, kind = '') {
  elements.status.textContent = text;
  elements.status.className = `status-line ${kind}`;
}

function refreshStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !/^https?:\/\/([^/]+\.)?youtube\.com\//.test(tab.url || '')) {
      return setStatus('Open a YouTube video to start dubbing.');
    }
    chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        return setStatus('Reload this YouTube tab once to activate the extension.', 'warn');
      }
      if (!res.hasVideo) return setStatus('Waiting for a video…');
      if (res.mode === 'transcript') {
        return setStatus(`Synced to the full transcript (${res.lines} lines). Voice is prepared ahead of time.`, 'ok');
      }
      if (res.mode === 'no-captions') {
        return setStatus('This video has no captions, so it cannot be dubbed.', 'warn');
      }
      setStatus('Live mode: following on-screen captions (slight delay). Turn on CC if nothing is spoken.', 'warn');
    });
  });
}

elements.testBtn.addEventListener('click', () => {
  const samples = {
    si: 'ආයුබෝවන්! මෙය යූටියුබ් සිංහල හඬකැවීම් සාර්ථකව ක්‍රියාත්මක වන අයුරුයි.',
    ta: 'வணக்கம்! இது யூடியூப் தமிழ் குரல் மாற்ற சோதனை.',
    hi: 'नमस्ते! यह यूट्यूब हिंदी डबिंग का लाइव टेस्ट है।'
  };
  const lang = currentSettings.targetLanguage;
  const text = samples[lang] || 'Hello! Testing live audio.';
  const speakLocally = () => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = currentSettings.speechRate;
    utter.volume = currentSettings.dubVolume;
    window.speechSynthesis.speak(utter);
  };
  if (currentSettings.ttsEngine === 'local') return speakLocally();

  const tl = { zh: 'zh-CN', bho: 'hi', tl: 'fil' }[lang] || lang;
  const audio = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(tl)}&client=tw-ob&q=${encodeURIComponent(text)}`);
  audio.volume = currentSettings.dubVolume;
  audio.playbackRate = currentSettings.speechRate;
  audio.play().catch(speakLocally);
});

chrome.storage.local.get(['ytdub_settings'], (result) => {
  currentSettings = { ...DEFAULT_SETTINGS, ...((result && result.ytdub_settings) || {}) };
  applySettingsToUI();
});
refreshStatus();

// ---- Chrome built-in AI (Gemini Nano) used to rewrite long lines in simpler words
const AI_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }]
};
const RULES_NOTE = 'Built-in rewrite rules are used instead.';

async function refreshAiStatus() {
  elements.aiDownloadBtn.hidden = true;
  if (typeof LanguageModel === 'undefined') {
    elements.aiStatus.textContent = `Needs Chrome 138 or newer. ${RULES_NOTE}`;
    return;
  }
  let availability = 'unavailable';
  try { availability = await LanguageModel.availability(AI_OPTIONS); } catch (e) { /* treat as unavailable */ }
  if (availability === 'available') {
    elements.aiStatus.textContent = 'Ready. Long lines are rewritten in simpler words, privately on this computer.';
  } else if (availability === 'downloadable') {
    elements.aiStatus.textContent = `The AI model is not downloaded yet. ${RULES_NOTE}`;
    elements.aiDownloadBtn.hidden = false;
  } else if (availability === 'downloading') {
    elements.aiStatus.textContent = 'Downloading the AI model in the background…';
  } else {
    elements.aiStatus.textContent = `This computer can't run Chrome's on-device AI. ${RULES_NOTE}`;
  }
}

elements.aiDownloadBtn.addEventListener('click', async () => {
  elements.aiDownloadBtn.disabled = true;
  try {
    const session = await LanguageModel.create({
      ...AI_OPTIONS,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          elements.aiStatus.textContent = `Downloading the AI model… ${Math.round(e.loaded * 100)}% (keeps going if you close this popup)`;
        });
      }
    });
    session.destroy();
  } catch (e) {
    elements.aiStatus.textContent = `Download failed. ${RULES_NOTE}`;
  }
  elements.aiDownloadBtn.disabled = false;
  refreshAiStatus();
});

refreshAiStatus();
setInterval(refreshStatus, 2000);
