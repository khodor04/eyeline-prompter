# EyeLine Prompter

A free, voice-following teleprompter for your phone, inspired by BIGVU and PowerCue.

- **Eye contact**: the text sits in a narrow strip right under the front camera, and the line you're reading stays at the top.
- **Voice follow**: listens and scrolls as you speak. Handles misreads, "um"s and skipped sentences.
- **Highlighting**: spoken words light up; the current word is underlined.
- **Recording**: phone camera + mic, saved unflipped (exactly as the camera sees it), with filters, brightness, a front/back switch, and audio modes (Natural / Noise reduction / Studio voice).
- Auto-scroll and manual modes, tap-a-word to jump, Bluetooth clicker support, mirror mode, `[cue]` notes.

Plain HTML/CSS/JS, no build step. Camera and mic need **HTTPS** (or `localhost`).

## Deploy (Coolify)

Choose the **Dockerfile** build pack and expose port **80**. The image is nginx serving the static files.

## Run locally

```
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080` (camera and mic work on localhost).

## Play Store (later)

Wrap the deployed URL with [PWABuilder](https://www.pwabuilder.com) to make an Android package (TWA).
Put the SHA-256 fingerprint it gives you into `.well-known/assetlinks.json`.

## Browser support

| Feature | Android Chrome | iPhone Safari |
|---|---|---|
| Voice follow | Yes | Yes (iOS 14.5+) |
| Recording | Yes | Yes |
| Filters burned into the video | Yes | Safari 18+ |
