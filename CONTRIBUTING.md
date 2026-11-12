# Contributing to EyeLine Prompter

Thanks for helping! Bug reports, ideas, translations and code are all welcome.

## Getting started

```bash
git clone https://github.com/<you>/eyeline-prompter.git
cd eyeline-prompter
npm start        # http://localhost:8080
npm test         # matcher unit tests (Node 18+)
```

There are no dependencies and no build step. Edit a file and reload.

### Testing on a real phone
The camera, microphone and speech recognition need HTTPS, so a LAN IP like `http://192.168.x.x` won't work. Options:
- A tunnel: `npx localtunnel --port 8080`, `cloudflared tunnel --url http://localhost:8080`, or ngrok.
- Android: Chrome DevTools **port forwarding** (`chrome://inspect`) lets the phone open `localhost:8080`.
- A preview deploy on Netlify, Vercel or Coolify.

Please test changes to voice follow, recording or audio on at least one real phone, and say which in your PR (e.g. "Pixel 7 / Chrome 131").

## Project layout

See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md). In short: `app.js` is the app, `matcher.js` is the speech-to-script alignment, and `style.css` holds all styling.

## Guidelines

- **Keep it build-free.** Plain modern JavaScript, no frameworks, no bundler. A small, well-justified dependency loaded from a CDN or vendored is OK.
- **Mobile first.** Check portrait and landscape at phone width and safe areas (notches).
- **Privacy.** No analytics, trackers or remote storage of scripts or recordings.
- **Matcher changes need tests.** Add a scenario to `test/matcher.test.js` that fails before your change and passes after.
- **Accessibility.** Buttons need `aria-label`s, keep contrast high, and don't rely on colour alone.
- Match the existing code style: 2-space indent, semicolons, single quotes, small functions.

## Commits and pull requests

- One logical change per PR. Explain **what** and **why**, and include a screenshot or GIF for UI changes.
- Make sure `npm test` passes.
- Update the docs (`README.md` / `docs/`) if behaviour or settings change.

## Reporting bugs

Open an issue with:
- phone model, OS version, browser and version
- the mode (Voice / Auto / Manual) and the relevant settings
- what you expected and what happened
- for voice follow: the script excerpt and what "Show what the mic hears" displayed

## Good first issues

- Import a `.txt` file into the editor
- Export / import all scripts as JSON (backup)
- More filter presets
- Translations of the UI

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
