<p align="center">
  <img src="icons/icon-192.png" width="96" height="96" alt="EyeLine Prompter icon">
</p>

<h1 align="center">EyeLine Prompter</h1>

<p align="center">
  <b>A free, open-source teleprompter for your phone that follows your voice and keeps your eyes on the camera.</b><br>
  Inspired by BIGVU and PowerCue. No subscription, no account, no app store needed.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-yellow.svg"></a>
  <img alt="No build step" src="https://img.shields.io/badge/build-none-brightgreen.svg">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-blue.svg">
</p>

---

## Why?

Good phone teleprompters are expensive subscriptions. The basic idea isn't complicated, though: show the script right next to the camera, scroll it as you talk, and record. EyeLine does that in a single web page you can host yourself and install on your phone's home screen.

## Features

**🎯 Eye contact by design**
- The script sits in a narrow strip right under the front camera.
- The line you're reading stays pinned to the top, closest to the lens, so your eyes barely move.
- You can adjust the width, the distance from the camera and the number of visible lines. Left/right positions are available for landscape.

**🎙 Voice follow**
- It listens while you talk and scrolls with you. No foot pedal, no fixed speed.
- It tolerates misheard words, "um"s, ad-libs and skipped sentences, and catches up when you're back on script.
- Words you've said are highlighted and the current word is underlined, similar to PowerCue.
- It works in many languages, including Arabic and other right-to-left scripts.

**🎬 Built-in recording**
- Records with your phone's camera and microphone. The video is saved **exactly as the camera sees it** (never flipped).
- Filters (Bright, Warm, Cool, Vivid, Soft, Film, B&W) and a brightness slider are recorded into the video.
- Front/back camera switch, countdown, and a recording timer.
- Audio modes: **Natural**, **Noise reduction** and **Studio voice** (rumble cut, voice clarity, leveling, soft noise gate).
- External mic support (lav / USB-C).
- Save to your gallery or share straight to other apps.

**🧰 Everything else**
- **Auto-scroll** (set words per minute) and **Manual** modes.
- Tap any word to jump to it, swipe to move by lines, or use a **Bluetooth clicker or keyboard**.
- `[Cues]` in square brackets are shown but you don't need to say them: `[smile]`, `[pause]`, `[show product]`.
- Mirror mode for glass/beam-splitter teleprompter rigs.
- Multiple scripts saved on the device, word count and estimated read time.
- Installable PWA that works offline (voice follow needs a connection on most phones).

## Quick start

### Use it on your phone

1. Host it (see [Self-hosting](#self-hosting)) or run it locally.
2. Open the URL in **Chrome (Android)** or **Safari (iPhone)**.
3. Browser menu → **Add to Home screen**.
4. Open your script, press **Start prompter**, then **●** to record or **▶** to just prompt.

> Camera, microphone and voice control only work over **HTTPS** (or `localhost`).

### Run locally

There's no build step. It's plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/khodor04/eyeline-prompter.git
cd eyeline-prompter
npm start              # serves on http://localhost:8080
# or: python -m http.server 8080
```

## How to use it

| You want to... | Do this |
|---|---|
| Start prompting | Press **▶** (3-second countdown from the start of the script) |
| Record a take | Press **●**, and press **■** to stop. Then **Save / Share** or **Download** |
| Jump somewhere | Tap the word |
| Move line by line | Swipe on the text, or use a clicker / arrow keys / Page Up-Down |
| Pause / resume | **▶** button or **Space** |
| Change the look | **Filters** button above the controls |
| Tune everything else | ⚙ Settings (works live while prompting) |

### Tips for the best eye contact
- Keep **Text width** narrow (60–80%) so your eyes don't sweep left and right.
- Set **Distance from camera** so the first line sits just below the lens or notch.
- Leave **Reading line** on *1st line*.
- Hold the phone at arm's length or further. The further away the camera is, the less any eye movement shows.

### Tips for voice follow
- Set **Speech language** to your accent/dialect (e.g. `en-GB`, `ar-LB`).
- Speak naturally. You don't have to read word-perfectly.
- If it gets lost, tap the word you're on and keep going.
- Turn on **Show what the mic hears** to see what the phone is recognising.

Full settings reference: **[docs/USER-GUIDE.md](docs/USER-GUIDE.md)**

## Self-hosting

It's a static site, so any HTTPS host works. A Dockerfile (nginx) is included.

| Host | How |
|---|---|
| **Coolify** | New resource → this repo → build pack **Dockerfile**. Port 80 or 3000 both work. Add an `https://` domain. |
| **Docker** | `docker build -t eyeline . && docker run -p 8080:80 eyeline` |
| **Netlify / Vercel / Cloudflare Pages / GitHub Pages** | Deploy the repo root as a static site. There's no build command. |

Details: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**, including how to publish it on the **Google Play Store** as a TWA.

## Browser support

| Feature | Android · Chrome | iPhone · Safari | Desktop Chrome / Edge |
|---|:-:|:-:|:-:|
| Prompter, auto & manual scroll | ✅ | ✅ | ✅ |
| Voice follow | ✅ | ✅ iOS 14.5+ | ✅ |
| Recording (camera + mic) | ✅ MP4/WebM | ✅ MP4 | ✅ |
| Filters recorded into the video | ✅ | Safari 18+ | ✅ |
| Keep screen awake | ✅ | iOS 16.4+ | ✅ |

Firefox doesn't support speech recognition, so it falls back to auto-scroll.

**Known limitation:** some phones won't let voice follow and audio recording use the microphone at the same time. If voice follow stops while recording, the app shows a message. Use **Auto** mode for that take, or turn off **Record audio**.

## Privacy

- Scripts and settings stay **on your device** (browser local storage). There's no account, no analytics and no server-side storage.
- Recordings never leave your phone unless you share them.
- **Voice follow uses your browser's built-in speech recognition.** On most phones (Chrome / Safari), the browser sends the audio to Google's or Apple's speech service to transcribe it. EyeLine itself never sends or stores audio. If that matters for a recording, use **Auto** or **Manual** mode.

## How it works

The interesting part is matching speech to the script. Speech recognition is noisy: it mishears words, rewrites earlier guesses and drops filler. EyeLine aligns the **last ~8 words heard** against a window of the script around your position, using fuzzy word matching and a longest-common-subsequence score. The further ahead a candidate is, the more matching words it needs, which stops the prompter from jumping ahead on common words like "the".

Architecture, the matching algorithm, the recording pipeline and the audio chain are explained in **[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)**.

```
index.html       UI markup (home, editor, prompter, settings, result)
style.css        All styling
app.js           App logic: scripts, prompter, voice engine, camera, recording, audio, settings
matcher.js       Speech → script alignment (pure functions, unit tested)
sw.js            Service worker (offline support)
test/            Node tests for the matcher (npm test)
Dockerfile       nginx image for self-hosting
```

## Roadmap

Ideas and help welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

- [ ] Native Android build with a **floating overlay** over other camera apps (TikTok, Instagram, stock camera)
- [ ] AI noise removal (RNNoise / WebAssembly)
- [ ] Import scripts from .txt / .docx / Google Docs
- [ ] Rich text: bold, colours, line markers
- [ ] Multiple takes per script with a take list
- [ ] Remote control from a second phone
- [ ] Captions file (.srt) generated from the take

## Contributing

PRs and issues are welcome. Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. There's no build step, so you can just clone, open the page and edit.

## License

[MIT](LICENSE). Free to use, modify and ship, including commercially.
