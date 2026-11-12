// On-device speech recognition (Vosk, WebAssembly).
// Unlike the browser's built-in SpeechRecognition, this listens to a MediaStream we
// give it, so it can share ONE microphone with the video recording (needed on iPhone).
// Audio never leaves the device.
(function () {
  'use strict';

  const VOSK_JS = 'vendor/vosk.js';
  const REMOTE = 'https://ccoreilly.github.io/vosk-browser/models/';
  const MODELS = {
    en: { file: 'vosk-model-small-en-us-0.15', mb: 41 },
    'en-in': { file: 'vosk-model-small-en-in-0.4', mb: 37 },
    fr: { file: 'vosk-model-small-fr-pguyot-0.3', mb: 46 },
    es: { file: 'vosk-model-small-es-0.3', mb: 34 },
    de: { file: 'vosk-model-small-de-0.15', mb: 45 },
    it: { file: 'vosk-model-small-it-0.4', mb: 48 },
    pt: { file: 'vosk-model-small-pt-0.3', mb: 31 },
    tr: { file: 'vosk-model-small-tr-0.3', mb: 35 },
    ru: { file: 'vosk-model-small-ru-0.4', mb: 39 },
    fa: { file: 'vosk-model-small-fa-0.4', mb: 42 },
    ca: { file: 'vosk-model-small-ca-0.4', mb: 39 },
    vi: { file: 'vosk-model-small-vn-0.3', mb: 32 },
  };
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const LOADED_KEY = 'eyeline.models';

  function modelFor(lang) {
    const l = String(lang || '').toLowerCase();
    return MODELS[l] || MODELS[l.split('-')[0]] || null;
  }

  function loadedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(LOADED_KEY) || '[]')); } catch { return new Set(); }
  }
  function markLoaded(file) {
    try { const s = loadedSet(); s.add(file); localStorage.setItem(LOADED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
  }

  let scriptP = null;
  function loadScript() {
    if (window.Vosk) return Promise.resolve();
    return scriptP || (scriptP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = VOSK_JS;
      s.onload = resolve;
      s.onerror = () => { scriptP = null; reject(new Error('could not load the speech engine')); };
      document.head.append(s);
    }));
  }

  // Prefer the copy on our own server (Docker image), fall back to the public mirror.
  async function modelUrl(file) {
    const local = new URL(`models/${file}.tar.gz`, location.href).href;
    try {
      const r = await fetch(local, { method: 'HEAD', cache: 'no-store' });
      if (r.ok && !(r.headers.get('content-type') || '').includes('html')) return local;
    } catch { /* offline or missing */ }
    return REMOTE + file + '.tar.gz';
  }

  // Download once with progress (warms the HTTP cache). The engine then stores the
  // extracted model in IndexedDB, so later sessions start without downloading.
  async function prefetch(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const total = +res.headers.get('content-length') || 0;
    if (!res.body || !total) { await res.arrayBuffer(); return; }
    const reader = res.body.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      onProgress && onProgress(Math.min(0.99, got / total));
    }
  }

  // Words for a recognition grammar: limiting the recogniser to the script's vocabulary
  // makes the small model much more accurate for a teleprompter.
  function grammarFor(text) {
    const words = new Set();
    for (const raw of String(text).replace(/\[[^\]]*\]/g, ' ').split(/[\s\-–—\/]+/)) {
      let w = raw.toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}']+/gu, '').replace(/^'+|'+$/g, '');
      if (/^\d+$/.test(w)) w = NUM[+w] || '';
      if (w) words.add(w);
    }
    return [...words].slice(0, 4000);
  }

  const engine = {
    model: null,
    file: null,
    session: null,
    loading: null,

    supported(lang) { return !!modelFor(lang) && !!(window.WebAssembly && window.Worker); },
    info(lang) { return modelFor(lang); },
    isDownloaded(lang) { const m = modelFor(lang); return !!m && loadedSet().has(m.file); },
    isReady(lang) { const m = modelFor(lang); return !!m && this.file === m.file && !!this.model; },

    async prepare(lang, onProgress) {
      const m = modelFor(lang);
      if (!m) throw new Error(`no on-device model for ${lang}`);
      if (this.isReady(lang)) return;
      if (this.loading && this.loading.file === m.file) return this.loading.p;
      const p = (async () => {
        await loadScript();
        const url = await modelUrl(m.file);
        if (!loadedSet().has(m.file)) await prefetch(url, onProgress);
        onProgress && onProgress(1);
        if (this.model) { try { this.model.terminate(); } catch { /* ignore */ } }
        this.model = null;
        const model = await window.Vosk.createModel(url);
        this.model = model;
        this.file = m.file;
        markLoaded(m.file);
      })();
      this.loading = { file: m.file, p };
      try { await p; } finally { this.loading = null; }
    },

    // stream: a MediaStream with an audio track. onText(text) receives the running transcript.
    start(stream, scriptText, onText) {
      this.stop();
      if (!this.model) throw new Error('model not loaded');
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      ac.resume().catch(() => {});
      let rec;
      const words = grammarFor(scriptText);
      try {
        rec = new this.model.KaldiRecognizer(ac.sampleRate, JSON.stringify([...words, '[unk]']));
      } catch {
        rec = new this.model.KaldiRecognizer(ac.sampleRate);
      }
      let finals = '';
      rec.on('result', m => {
        const t = m.result && m.result.text;
        if (t) { finals = (finals + ' ' + t).trim().split(/\s+/).slice(-40).join(' '); onText(finals); }
      });
      rec.on('partialresult', m => {
        const p = m.result && m.result.partial;
        if (p) onText((finals + ' ' + p).trim());
      });
      const src = ac.createMediaStreamSource(stream);
      const proc = ac.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = e => { try { rec.acceptWaveform(e.inputBuffer); } catch { /* ignore */ } };
      const mute = ac.createGain();
      mute.gain.value = 0;
      src.connect(proc);
      proc.connect(mute);
      mute.connect(ac.destination); // a processor only runs when connected to the output
      this.session = { ac, rec, proc, src };
    },

    stop() {
      const s = this.session;
      if (!s) return;
      this.session = null;
      try { s.proc.onaudioprocess = null; s.src.disconnect(); s.proc.disconnect(); } catch { /* ignore */ }
      try { s.rec.remove(); } catch { /* ignore */ }
      s.ac.close().catch(() => {});
    },

    get active() { return !!this.session; },
  };

  window.LocalASR = engine;
})();
