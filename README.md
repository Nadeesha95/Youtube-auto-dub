# YouTube Auto-Dub & 100-Language Subtitles (Manifest V3) - v2.0.0

## How it works
1. **Transcript-synced dubbing**: the extension captures the video's full timed captions from
   YouTube's own caption request (`inject.js`), splits them into sentences, translates up to a minute
   ahead and pre-buffers the voice for the next lines. Each line is spoken at the moment it is said
   in the video — no waiting for captions to appear on screen, no repeated lines.
   Captions are switched on automatically if needed (YouTube's captions are hidden behind ours).
2. **Fast speech handling** ("Smart simplify"):
   - The voice speeds up to fit each line's time slot (up to "Max catch-up speed").
   - Filler words (um, you know, basically, मतलब, यानी, है ना …) are removed before translating.
   - Lines still too long lose minor middle clauses; the first and last clause (subject and verb) are kept.
   - If the dub still falls behind, stale lines are skipped so the voice follows what is being said now.
3. **Smooth audio ducking**: the original audio fades to the level you choose while the dub speaks and
   stays down between back-to-back lines (no pumping). It is done through Web Audio, so YouTube's own
   volume slider is never changed.
4. **Live mode fallback** (e.g. live streams): reads on-screen captions, voices only newly added words.
5. All popup settings apply to the playing video instantly.

---

## How to Install in Chrome / Edge / Brave:
1. Download `youtube-auto-dub-extension.zip`.
2. Extract the folder.
3. Go to `chrome://extensions`.
4. Enable **Developer mode** toggle in top-right.
5. Click **Load unpacked** and select the folder.
6. Reload any YouTube tabs that were already open.
