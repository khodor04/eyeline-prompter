# Vendored libraries

| File | Library | Version | License |
|---|---|---|---|
| `vosk.js` | [vosk-browser](https://github.com/ccoreilly/vosk-browser) (Vosk / Kaldi speech recognition compiled to WebAssembly) | 0.0.8 | Apache-2.0 |

Speech models (`models/*.tar.gz`) are [Vosk models](https://alphacephei.com/vosk/models) by Alpha Cephei (Apache-2.0),
in the browser-ready format published by vosk-browser. They're downloaded at Docker build time and are not committed.
