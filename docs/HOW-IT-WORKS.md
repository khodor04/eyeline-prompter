# How it works

EyeLine is a single-page Progressive Web App with **no framework and no build step**. Everything runs in the browser.

```
┌───────────── index.html ─────────────┐
│ Home ─ Editor ─ Prompter ─ Settings ─ Result │
└──────────────────┬───────────────────┘
                   │
        app.js  ───┼─── matcher.js  (pure, unit-tested)
                   │
   ┌───────────────┼──────────────────────────────┐
   │ Scroll engines│ Camera / recording │ Audio   │
   │  voice / auto │ getUserMedia,      │ Web     │
   │  / manual     │ canvas, Media-     │ Audio   │
   │               │ Recorder           │ chain   │
   └───────────────┴──────────────────────────────┘
        localStorage (scripts, settings)   sw.js (offline cache)
```

## 1. Rendering the script

`buildText()` turns the script into one `<p dir="auto">` per line and one `<span>` per token:

- `.w`: a readable word. Each one gets an index `data-i` into `P.words`. A token like `well-known` produces **two** entries (`well`, `known`) that point to the same span.
- `.cue`: `[bracketed]` text. Shown, never matched.
- `.sym`: punctuation-only tokens (`—`, `…`). Shown, never matched.

The app's position is a single integer, `P.pos`, the index of the **next word to be read**. `setPos(i)` repaints only the words between the old and new position (`.done` = said, `.now` = current), then scrolls.

### Scrolling and eye contact

The viewport is a fixed-height box (`lines × font size × line-height`) placed right under the camera. Scrolling is a CSS `translateY` on the inner text, computed so that the current word's line sits on the **reading line**:

```js
translateY = eyeLine * lineHeight - currentWord.offsetTop
```

There's a CSS transition, so line changes glide rather than jump. The bottom of the box fades out with a mask gradient, which keeps your eyes on the top line.

## 2. Voice follow (`matcher.js`)

The browser's `SpeechRecognition` runs in `continuous` + `interimResults` mode. On every result, the app rebuilds the full transcript, normalises it and takes the **last 8 words** (the *tail*). Using only the tail makes the algorithm robust to the recogniser rewriting earlier guesses.

### Normalisation (`norm`)
Lower-case → strip Latin accents and Arabic diacritics/tatweel → drop apostrophes → drop anything that isn't a letter or digit → map `0–20, 30…100` to words (`3` ↔ `three`).

### Fuzzy word equality (`sim`)
Two words match if they're equal, or if both are ≥ 4 letters and one is a prefix of the other (interim partials like `beaut` → `beautiful`, plurals), or if their Levenshtein distance is ≤ 1 (≤ 2 for words of 8+ letters). Short words must match exactly.

### Alignment (`findNext`)
For every script index `j` in the window `[pos − 60, pos + 60]` where `script[j]` matches the **last** heard word:

1. **Score** (`suffixScore`) walks backwards through the heard words and the script ending at `j` *in step*: each word that lines up adds 1 (0.6 for words of 1–3 letters, which are everywhere). Up to 2 skipped, extra or misheard words are tolerated (−0.3 each); after that it stops. So the evidence has to be the **same words, in the same order, side by side**, not a few common words scattered over a paragraph.
2. **Anchor:** any move outside the "near" zone (`d = j − pos` from −3 to +2) also requires the last **two** heard words to sit side by side at `j−1, j`. A misheard last word can't create a jump.
3. **Evidence threshold** grows with the distance:
   - near (`−3 ≤ d ≤ 2`) → the word itself (0.6)
   - `d ≤ 10` → 1.8 (about 2 words)
   - further ahead → 2.6 (about 3 words)
   - **back** (`d < −3`, re-reading) → 3 (about 4 words)
4. **Value** = score − 0.05 × |d|, +0.5 inside the near zone. The highest value wins, so a phrase that appears twice in the script resolves to the copy nearest the reader.
5. A weak match behind the reader means "still here", so the position stays put. Only a strong (≥ 3) match moves it back.

The new position is `j + 1`. It can be **behind** the current one: when you repeat a sentence, the highlight follows you back, then carries on when you continue.

This gives the behaviour you'd want:
| Situation | Result |
|---|---|
| Read word-for-word | Advances one word at a time |
| Misheard / filler / ad-lib words | Ignored: there's no candidate, or not enough evidence |
| Skipped a sentence | Catches up after about 3 matching words |
| Same phrase appears twice in the script | Stays on the copy you're reading |
| You repeat a sentence | Follows you back after about 4 words |
| Common word ("the", "a") on its own | Never jumps |

In a simulation of 500 noisy reads (6% dropped, 6% misheard, 4% filler words) of a script with many repeated phrases, the old LCS-window matcher ran more than 2 words ahead of the reader 23,157 times (worst case 94 words). This one did so 6 times, never by more than 3 words.

Cost per result: about 120 candidates × a short backward walk. That's negligible on a phone.

`npm test` runs these scenarios.

### Two recognition engines
| | Browser (`SpeechRecognition`) | On-device (`local-asr.js`) |
|---|---|---|
| Engine | Google / Apple cloud (or OS) | [Vosk](https://alphacephei.com/vosk/) small models, Kaldi compiled to WebAssembly via [vosk-browser](https://github.com/ccoreilly/vosk-browser), in a Web Worker |
| Audio source | Opens the mic **itself** | **Any MediaStream we pass**, i.e. the same mic stream that's being recorded |
| Works while recording on iPhone | ❌ | ✅ |
| Vocabulary | Open | Restricted to the script's words + `[unk]` (a Vosk grammar), which greatly improves accuracy for small models |
| Network | Usually required | One-time model download, then offline |

The on-device pipeline: mic `MediaStream` → `AudioContext` → `ScriptProcessorNode` (4096 frames) → `recognizer.acceptWaveform()` → `partialresult` / `result` events → the same `handleTranscript()` → `findNext()` path as the browser engine.

Models are served from `/models/` on your own server (downloaded at Docker build time, `VOSK_MODELS` build arg) with a fallback to the vosk-browser public mirror. Vosk stores the extracted model in IndexedDB, so it only downloads once per device.

**Why not Whisper?** Whisper is more accurate and multilingual (including Arabic), but it transcribes in multi-second chunks and isn't a streaming recogniser. On a phone CPU, word-level latency would be seconds, which is too slow to scroll with a speaker. It would be a good fit for generating captions *after* a take.

### Recognition lifecycle
Browsers end recognition after silence or roughly a minute. `onend` restarts it transparently while prompting. Permission errors and `audio-capture` (the mic is busy, usually because recording is holding it) show a toast explaining what to do.

## 3. Auto and manual modes

- **Auto**: a `requestAnimationFrame` loop adds `dt × wpm / 60` to a fractional position and calls `setPos(floor(pos))`.
- **Manual**: no engine. Moves come from tapping, swiping (`moveLines`), the wheel or the keyboard.

## 4. Camera and recording

- Preview: `getUserMedia({ video: { facingMode, ideal 1920×1080 } })` in a full-screen `<video>`. The filter is applied with a CSS `filter`, and selfie mirroring with an optional CSS `scaleX(-1)`. Both are cheap and run on the GPU.
- Recording uses **two paths**:
  - **Direct**: no filter and no mirroring, so the raw camera track goes straight to `MediaRecorder`. This gives the best quality and lowest CPU use, and the video is exactly what the camera sees.
  - **Canvas**: when a filter or "mirror saved video" is on, each camera frame is drawn to a `<canvas>` with `ctx.filter` and an optional mirror transform, using `requestVideoFrameCallback` when available. `canvas.captureStream(30)` then feeds the recorder. Settings are read every frame, so changing the filter mid-take is applied live.
- Format: the first supported of MP4 (H.264/AAC) → WebM (VP9/VP8 + Opus), at 8 Mbps video and 192 kbps audio.
- The microphone is opened **only when recording starts**, not for the preview.

## 5. Audio chain

`getMic()` always disables `echoCancellation` and `autoGainControl`. `noiseSuppression` is on for *Noise reduction* and *Studio voice*.

**Studio voice** adds a Web Audio graph:

```
mic → high-pass 85 Hz → peaking −2 dB @300 Hz → peaking +3 dB @3.5 kHz
    → compressor (−24 dB, 3.5:1, 5 ms / 200 ms) → make-up gain ×1.7
    → gate gain → MediaStreamDestination → MediaRecorder
                ↑
   analyser (after high-pass) measures RMS every 20 ms:
   above −48 dBFS → gate opens (gain 1, 10 ms);
   300 ms below → gate eases down to 0.15 (−16 dB, not full mute).
```

## 6. Storage and offline

- `localStorage`: `eyeline.scripts` (an array of `{ id, title, text, updated }`), `eyeline.settings` and `eyeline.tipShown`. Every access is wrapped in try/catch so the app still works in private mode.
- `sw.js`: **network-first** with a cache fallback. Updates show up as soon as you deploy, and the app still opens offline.
- Wake Lock keeps the screen on while the prompter is open.

## Files

| File | Responsibility |
|---|---|
| `index.html` | Markup for all views and sheets |
| `style.css` | Styling. Prompter sizing comes from CSS variables (`--fs`, `--lines`, `--w`, `--top`, `--eye`, `--hl`). |
| `app.js` | State (`settings`, `P`), views, engines, camera, recording, audio, settings form binding |
| `matcher.js` | `norm`, `splitWords`, `sim`, `lcs`, `findNext` (with `suffixScore`). Works in the browser (`window.Matcher`) and Node (`module.exports`). |
| `sw.js` | Offline cache |
| `nginx.conf`, `Dockerfile` | Self-hosting image |
