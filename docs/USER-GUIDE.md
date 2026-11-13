# User guide

## Scripts

- **+ New script** creates a script. Everything is saved automatically on your device as you type.
- The editor shows the word count and an estimated read time (at about 140 words per minute).
- Delete a script with the 🗑 button on the home screen.
- Scripts live in your browser's local storage. Clearing the browser's site data deletes them, so keep a copy of important scripts elsewhere.

### Writing tips

| Syntax | Effect |
|---|---|
| Empty line | Paragraph break (a small gap on screen) |
| `[smile]`, `[pause]`, `[B-roll here]` | **Cue.** Shown in small italic blue text. You don't need to say it, and voice follow ignores it. |
| `well-known`, `5`, `don't` | Handled automatically: hyphenated words, numbers 0–20 and round tens, and apostrophes all match what you say. |

Arabic, Hebrew and other right-to-left scripts are shown right-to-left automatically.

## The prompter screen

```
┌──────────────────────────┐
│          ● camera        │
│ ▶ This line is the one   │  ← reading strip, right under the camera
│   you're reading now...  │
│   next lines fade out    │
│                          │
│      (your camera)       │
│                          │
│  🎙 what the mic hears   │
│  [Flip camera] [Filters] │
│  ● Voice follow · en-US  │
│  ✕   ⟲   ▶   ●   ⚙       │
└──────────────────────────┘
```

| Control | What it does |
|---|---|
| ✕ | Close the prompter (stops any recording) |
| ⟲ | Back to the start of the script |
| ▶ / ❚❚ | Start / pause prompting. A countdown runs when starting from the beginning. |
| ● / ■ | Start / stop recording. The countdown always runs before recording. |
| ⚙ | Settings, applied live |
| Flip camera | Front / back camera |
| Filters | Filter chips and a brightness slider |
| Green dot | The microphone is listening. It pulses when speech is heard. |

The controls fade while prompting. Touch the screen to bring them back.

### Gestures and keys

| Input | Action |
|---|---|
| Tap a word | Jump there |
| Swipe up / down on the text | Move forward / back by lines |
| Mouse wheel on the text | Move by one line |
| `Space`, `Enter`, media play/pause | Play / pause |
| `↓` `→` `Page Down` | Next line |
| `↑` `←` `Page Up` | Previous line |
| `R` | Start / stop recording |
| `Esc` | Close the prompter |

Most cheap **Bluetooth page-turner / presentation clickers** send Page Up/Down or arrow keys, so they work as remotes. (Phone volume buttons can't be captured by web apps.)

## Settings reference

### Scroll mode
| Mode | Behaviour |
|---|---|
| **Voice** | Follows your speech. Spoken words are highlighted. Needs Chrome/Safari and usually an internet connection. |
| **Auto** | Scrolls at a fixed speed (60–260 words per minute). Works everywhere and offline. |
| **Manual** | Moves only when you swipe, tap or press a clicker. |

**Speech language**: the language/accent code used for recognition, e.g. `en-US`, `en-GB`, `ar-LB`, `fr-FR`. Pick the one closest to how you speak.

**Voice engine**
| Engine | How it works | Best for |
|---|---|---|
| **Auto** *(default)* | Browser speech while just prompting; on-device while recording | Most people |
| **Browser** | Google/Apple speech service. Very accurate, needs internet. Can't run while recording on iPhone. | Rehearsing, languages without an on-device model |
| **On-device** | Vosk runs on your phone. Private and offline, works while recording. One-time model download (~31–48 MB). | Privacy, offline use |

Use **Download voice model now** in Settings to grab the model on Wi-Fi. Otherwise it downloads the first time you record.
On-device languages: English (US/India), French, Spanish, German, Italian, Portuguese, Turkish, Russian, Persian, Catalan, Vietnamese. For other languages, a recording auto-scrolls at the speaking pace EyeLine measured while voice follow was working.

### Eye contact
| Setting | What it does | Suggested |
|---|---|---|
| Text position | Top for portrait. Left/Right for landscape, on the side your camera is on. | Top |
| Distance from camera | Gap between the screen edge and the text box | Just below the notch |
| Text width | Narrower means less side-to-side eye movement | 60–85% |
| Visible lines | How many lines are shown | 3–4 |
| Reading line | Where the current line sits. *1st line* is the closest to the camera. | 1st line |

### Text
- **Font size**: 18–84 px.
- **Highlight colour**: the colour of the words you've said.
- **Mirror text**: flips the text horizontally for glass teleprompter rigs (beam splitters).

### Camera & recording
| Setting | What it does |
|---|---|
| Record: Video / Audio only | **Audio only** keeps the camera off and records just your voice (.m4a on iPhone, .webm on Android), e.g. for voice-overs and podcasts. Voice follow and the audio modes still work. Also switchable from the **🎥 Video / 🎙 Audio only** button on the prompter screen. |
| Show camera behind text | Live camera preview. Turn it off for a plain black prompter. |
| Mirror the preview | Selfie-style flipped preview. Off by default, so the preview matches the saved video. |
| Mirror the saved video | Saves a flipped video. Off by default: the video is saved exactly as the camera sees it. |
| Record audio with video | Include the microphone in recordings |
| Audio | See below |
| Microphone | Choose an external mic (labels appear after you've granted mic permission once) |
| Countdown | Off / 3 s / 5 s |
| Show what the mic hears | Shows live recognised words near the bottom. Useful for checking the language setting. |

### Audio modes
| Mode | Processing | Use when |
|---|---|---|
| **Natural** | None. The raw microphone. | You have a good external mic in a quiet room |
| **Noise reduction** *(default)* | The browser's noise suppression | Most situations: fans, AC, hum |
| **Studio voice** | Noise suppression + 85 Hz high-pass + mud cut + presence boost + compressor + soft noise gate | Phone mic in an ordinary room, for a punchier voice |

Echo cancellation and auto-gain are always **off**. They're designed for calls and make recorded voices sound thin and pumpy.

## Saving your video

When you stop recording, a preview opens:
- **Save / Share**: opens the phone's share sheet. Choose *Save video* (iPhone) or your gallery, Drive, WhatsApp and so on.
- **Download**: saves the file through the browser (Android: Downloads folder).
- **Discard**: throws the take away.

The format is **MP4** where the browser supports it (Safari and recent Chrome), otherwise **WebM**.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Camera needs HTTPS" / no camera prompt | Open the app over `https://` (or `localhost`) |
| Voice follow doesn't move | Check the green dot is on and turn on *Show what the mic hears*. Set the right **Speech language**. Check the mic permission in the browser's site settings. |
| "Mic busy" / auto-scroll during a take | Browser speech can't share the mic with recording. Set **Voice engine** to *Auto* or *On-device* (needs a supported language). |
| Voice model download is slow | It's a one-time download of about 40 MB. Use **Download voice model now** on Wi-Fi. |
| It jumped to the wrong place | Tap the word you're on. It continues from there. |
| Android beeps when listening starts | That's Chrome's speech engine restarting after silence. Lower the media volume. |
| Filter missing from the saved video | Your browser can't burn filters into the video (older Safari). The app warns you when this happens. |
| Screen turns off | Your browser doesn't support Wake Lock. Increase the screen timeout in the phone's settings. |
| Changes after an update don't show | Close the app fully and reopen it. The service worker loads the newest version first. |
