# Deployment

EyeLine is a static site: a few HTML, CSS and JS files. The only hard requirement is **HTTPS**, because browsers only allow the camera, microphone, speech recognition and service workers on secure origins (`localhost` counts as secure for development).

## Coolify

1. **+ New → Resource → Public Repository** and paste `https://github.com/khodor04/eyeline-prompter` (or your fork).
2. Branch: `main`. Build pack: **Dockerfile**.
3. Ports exposed: `80`. Port `3000` also works, because the container listens on both.
4. Add a domain with `https://`. Coolify issues the TLS certificate.
5. Deploy. Turn on **Auto Deploy** so pushes to `main` go live.

The container has a health check, so Coolify only switches traffic once nginx is answering.

**Voice models:** the image downloads the English on-device model at build time (served from `/models/` on your domain). To add languages, set the build argument `VOSK_MODELS` (space-separated), e.g.
`vosk-model-small-en-us-0.15 vosk-model-small-fr-pguyot-0.3 vosk-model-small-es-0.3`.
See `local-asr.js` for the list. Missing models are fetched from the public vosk-browser mirror instead.

## Docker

```bash
docker build -t eyeline .
docker run -d -p 8080:80 --name eyeline eyeline
```

Put it behind a reverse proxy with TLS (Caddy, Traefik, nginx) for phone use.

## Static hosts

There's no build command. Publish the repository root.

| Host | Settings |
|---|---|
| Netlify | Build command: *none*. Publish directory: `.` (or drag the folder onto app.netlify.com/drop) |
| Vercel | Framework: *Other*. Output directory: `.` |
| Cloudflare Pages | Build command: *none*. Output: `/` |
| GitHub Pages | Settings → Pages → deploy from `main` / root |

## Updating

The service worker is **network-first** and nginx sends `Cache-Control: no-cache` for HTML/JS/CSS, so a new deploy is picked up the next time the app is opened online. If you change the list of cached files, bump `CACHE` in `sw.js`.

## Publishing on Google Play (TWA)

You can wrap the hosted PWA as an Android app with a **Trusted Web Activity**. It runs in Chrome, so voice follow, the camera and recording all keep working.

1. Deploy the app to your HTTPS domain.
2. Go to **[pwabuilder.com](https://www.pwabuilder.com)**, enter your URL, then **Package for stores → Android**.
3. Set the package ID (e.g. `com.yourname.eyeline`) and download the package. Keep the **signing key** it generates somewhere safe. You need it for every future update.
4. Copy the generated `assetlinks.json` content into `.well-known/assetlinks.json` in this repo and deploy. It should look like:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.yourname.eyeline",
       "sha256_cert_fingerprints": ["AA:BB:…"]
     }
   }]
   ```
   If you use **Play App Signing**, also add the SHA-256 fingerprint from Play Console → *App integrity*.
   Check that `https://your-domain/.well-known/assetlinks.json` loads. If it doesn't, the app shows a browser address bar.
5. Upload the `.aab` file in the Play Console.

> New **personal** developer accounts must currently run a **closed test with at least 12 testers for 14 days** before they can publish to production. Check the current rules in your Play Console.

Web content updates go live without a new store release. You only need to rebuild the package to change the app name, icon or package settings.
