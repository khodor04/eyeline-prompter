'use strict';
/* EyeLine Prompter — voice-following teleprompter that keeps your eyes at the camera. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const { splitWords, findNext } = window.Matcher;

/* ------------------------------------------------------------------ storage */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const DEFAULTS = {
  mode: 'voice',            // voice | auto | manual
  lang: navigator.language || 'en-US',
  wpm: 140,
  anchor: 'top',            // top | left | right
  topOffset: 8,
  width: 86,
  lines: 4,
  eyeLine: 0,
  fontSize: 34,
  highlight: '#ffd23f',
  mirror: false,
  camera: true,
  facing: 'user',           // user (front) | environment (back)
  filter: 'none',
  brightness: 100,
  mirrorPreview: false,     // preview = exactly what gets recorded
  mirrorRecording: false,   // saved video is never flipped unless asked
  recordAudio: true,
  audioMode: 'clean',       // natural | clean | studio
  micId: '',                // '' = default microphone
  countdown: 3,
  showHeard: true,
};
const settings = Object.assign({}, DEFAULTS, store.get('eyeline.settings', {}));
const saveSettings = () => store.set('eyeline.settings', settings);

const SAMPLE_TEXT = `Hey everyone, welcome back to the channel. [smile]

This is EyeLine, a teleprompter that follows your voice. Just start talking and the words you say light up while the text scrolls by itself.

The text stays right under your camera, so it looks like you're talking straight to your audience.

If you skip a sentence or go off script, don't worry. It catches up as soon as you're back on track. [pause]

Tap any word to jump there. Thanks for watching!`;

let scripts = store.get('eyeline.scripts', null);
if (!Array.isArray(scripts) || !scripts.length) {
  scripts = [{ id: uid(), title: 'Welcome — try me', text: SAMPLE_TEXT, updated: Date.now() }];
}
const saveScripts = () => store.set('eyeline.scripts', scripts);
let current = null;

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* ------------------------------------------------------------------ helpers */
let toastT = 0;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function show(id) { $$('.view').forEach(v => v.classList.toggle('active', v.id === id)); }
function countWords(text) { return (text.replace(/\[[^\]]*\]/g, ' ').match(/\S+/g) || []).length; }
function fmtMin(words) {
  const m = words / 140;
  return m < 1 ? `${Math.max(1, Math.round(m * 60))} s` : `${m.toFixed(m < 10 ? 1 : 0)} min`;
}

/* ------------------------------------------------------------------ home */
function renderList() {
  const ul = $('#list');
  ul.innerHTML = '';
  scripts.sort((a, b) => b.updated - a.updated).forEach(s => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="meta"><strong dir="auto"></strong><span dir="auto"></span></div>
      <button class="icon-btn del" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    const n = countWords(s.text);
    li.querySelector('strong').textContent = s.title || 'Untitled';
    li.querySelector('span').textContent = `${n} words · ~${fmtMin(n)} · ${s.text.replace(/\s+/g, ' ').slice(0, 60)}`;
    li.addEventListener('click', e => {
      if (e.target.closest('.del')) {
        if (confirm(`Delete “${s.title || 'Untitled'}”?`)) {
          scripts = scripts.filter(x => x !== s);
          saveScripts(); renderList();
        }
        return;
      }
      openEditor(s);
    });
    ul.append(li);
  });
}

$('#newBtn').addEventListener('click', () => {
  const s = { id: uid(), title: '', text: '', updated: Date.now() };
  scripts.push(s); saveScripts();
  openEditor(s);
  setTimeout(() => $('#body').focus(), 50);
});

/* ------------------------------------------------------------------ editor */
function openEditor(s) {
  current = s;
  $('#title').value = s.title;
  $('#body').value = s.text;
  updateStats();
  show('editor');
}
function updateStats() {
  const n = countWords($('#body').value);
  $('#stats').textContent = n ? `${n} words · ~${fmtMin(n)}` : '';
}
function touchScript() { current.updated = Date.now(); saveScripts(); }
$('#title').addEventListener('input', e => { current.title = e.target.value; touchScript(); });
$('#body').addEventListener('input', e => { current.text = e.target.value; touchScript(); updateStats(); });
$('#backBtn').addEventListener('click', () => {
  if (current && !current.title.trim() && !current.text.trim()) { scripts = scripts.filter(x => x !== current); saveScripts(); }
  renderList(); show('home');
});
$('#goBtn').addEventListener('click', openPrompter);

/* ------------------------------------------------------------------ prompter state */
const P = {
  words: [],        // [{ el, n }]
  norms: [],        // normalized words for matcher
  pos: 0,           // index of the next word to be read
  playing: false,
  counting: false,
  cdToken: null,
  recog: null,
  autoF: 0, lastT: 0, raf: 0,
  stream: null, audio: null,
  recorder: null, chunks: [], recStart: 0, recTimer: 0,
  lock: null, idleT: 0, resultUrl: null, resultBlob: null,
};

const isRecording = () => P.recorder && P.recorder.state === 'recording';
const lineH = () => settings.fontSize * 1.32;

function buildText(text) {
  const root = $('#text');
  root.innerHTML = '';
  P.words = [];
  const frag = document.createDocumentFragment();
  text.replace(/\r/g, '').split('\n').forEach(line => {
    const p = document.createElement('p');
    p.dir = 'auto';
    if (!line.trim()) { p.className = 'gap'; frag.append(p); return; }
    for (const tok of line.match(/\[[^\]]*\]|\S+/g) || []) {
      const span = document.createElement('span');
      span.textContent = tok;
      if (tok.startsWith('[')) {
        span.className = 'cue';
      } else {
        const parts = splitWords(tok);
        if (parts.length) {
          span.className = 'w';
          span.dataset.i = P.words.length;
          parts.forEach(n => P.words.push({ el: span, n }));
        } else {
          span.className = 'sym';
        }
      }
      p.append(span, ' ');
    }
    frag.append(p);
  });
  root.append(frag);
  P.norms = P.words.map(w => w.n);
}

function paint(k) {
  const w = P.words[k];
  if (!w) return;
  w.el.classList.toggle('done', k < P.pos);
  w.el.classList.toggle('now', k === P.pos);
}

function setPos(i, { fromEngine = false } = {}) {
  i = Math.max(0, Math.min(P.words.length, i));
  const old = P.pos;
  if (i === old && fromEngine) return;
  P.pos = i;
  const lo = Math.min(old, i), hi = Math.min(Math.max(old, i), P.words.length - 1);
  for (let k = lo; k <= hi; k++) paint(k);
  if (!fromEngine) P.autoF = i;
  scrollToPos();
  if (i >= P.words.length && P.playing && fromEngine) {
    stopEngines();
    P.playing = false;
    updateHud();
    toast(isRecording() ? 'End of script — tap ■ to stop recording' : 'End of script 🎬');
  }
}

function scrollToPos() {
  const w = P.words[Math.min(P.pos, P.words.length - 1)];
  if (!w) return;
  const y = w.el.offsetTop;
  $('#text').style.transform = `translateY(${settings.eyeLine * lineH() - y}px)`;
}

function moveLines(n) {
  if (!P.words.length) return;
  const cur = P.words[Math.min(P.pos, P.words.length - 1)];
  const target = cur.el.offsetTop + n * lineH();
  let i = P.words.findIndex(w => w.el.offsetTop >= target - lineH() * 0.4);
  if (i < 0) i = P.words.length;
  if (n < 0 && i >= P.pos && P.pos > 0) i = 0;
  setPos(i);
  restartEngineAfterJump();
}

function applyLayout() {
  const r = document.documentElement.style;
  r.setProperty('--fs', settings.fontSize + 'px');
  r.setProperty('--lines', settings.lines);
  r.setProperty('--w', settings.width + '%');
  r.setProperty('--top', settings.topOffset + 'px');
  r.setProperty('--eye', settings.eyeLine);
  r.setProperty('--hl', settings.highlight);
  $('#box').dataset.anchor = settings.anchor;
  $('#viewport').classList.toggle('mirror', settings.mirror);
  $('#heard').hidden = !settings.showHeard || settings.mode !== 'voice';
  applyCamLook();
  requestAnimationFrame(scrollToPos);
}

async function openPrompter() {
  if (!current || !current.text.trim()) { toast('Write or paste a script first'); return; }
  buildText(current.text);
  if (!P.words.length) { toast('No readable words in this script'); return; }
  P.pos = 0; P.autoF = 0;
  show('prompter');
  applyLayout();
  P.words.forEach((_, k) => paint(k));
  $('#heard').textContent = '';
  updateHud();
  wake();
  document.documentElement.requestFullscreen?.().catch(() => {});
  keepAwake(true);
  startCamera();
  if (!store.get('eyeline.tipShown', false)) {
    store.set('eyeline.tipShown', true);
    setTimeout(() => toast('Press ▶ to prompt, or ● to record. Tap any word to jump to it.', 5000), 400);
  }
}

function closePrompter() {
  cancelCountdown();
  if (isRecording()) stopRecording();
  pause();
  stopCamera();
  keepAwake(false);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  show('editor');
}

/* ------------------------------------------------------------------ engines */
// The engine actually running: normally the chosen mode, but a take can temporarily
// fall back to auto-scroll when the phone won't share the mic (iPhone).
const engine = () => P.engineOverride || settings.mode;
const autoWpm = () => P.overrideWpm || settings.wpm;

function startEngines() {
  if (engine() === 'voice') startRecognition();
  else if (engine() === 'auto') startAuto();
  updateHud();
}
function stopEngines() { stopRecognition(); stopAuto(); setMic(false); savePace(); }
function restartEngineAfterJump() { if (P.playing && engine() === 'auto') P.autoF = P.pos; }

// Learn the speaker's real pace from voice follow, used when we must fall back to auto-scroll.
function trackPace() {
  const now = performance.now();
  if (!P.pace) { P.pace = { t: now, pos: P.pos }; return; }
  const words = P.pos - P.pace.pos, min = (now - P.pace.t) / 60000;
  if (words >= 15 && min > 0) P.pace.wpm = Math.round(Math.min(220, Math.max(80, words / min)));
}
function savePace() {
  if (P.pace?.wpm) { settings.learnedWpm = P.pace.wpm; saveSettings(); }
  P.pace = null;
}

function fallbackToAuto(reason) {
  if (P.engineOverride === 'auto') return;
  savePace();
  stopRecognition();
  setMic(false);
  P.engineOverride = 'auto';
  P.overrideWpm = settings.learnedWpm || settings.wpm;
  if (P.playing) startAuto();
  updateHud();
  toast(`${reason} This take auto-scrolls at your pace (${P.overrideWpm} wpm). Swipe or tap a word to adjust.`, 7000);
}
function clearFallback() { P.engineOverride = null; P.overrideWpm = null; }

async function togglePlay() {
  if (P.counting) { cancelCountdown(); return; }
  if (P.playing) { pause(); return; }
  if (P.pos >= P.words.length) setPos(0);
  if (P.pos === 0 && !isRecording()) {
    const go = await countdown(settings.countdown);
    if (!go) return;
  }
  P.playing = true;
  startEngines();
  wake();
}
function pause() {
  P.playing = false;
  stopEngines();
  updateHud();
  wake();
}

// auto-scroll
function startAuto() {
  stopAuto();
  P.autoF = P.pos;
  P.lastT = performance.now();
  const tick = t => {
    if (!P.playing || engine() !== 'auto') return;
    const dt = Math.min(0.25, (t - P.lastT) / 1000);
    P.lastT = t;
    P.autoF += dt * autoWpm() / 60;
    const i = Math.floor(P.autoF);
    if (i !== P.pos) setPos(i, { fromEngine: true });
    if (P.playing) P.raf = requestAnimationFrame(tick);
  };
  P.raf = requestAnimationFrame(tick);
}
function stopAuto() { cancelAnimationFrame(P.raf); P.raf = 0; }

// voice follow
function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('Voice follow isn’t supported in this browser (use Chrome on Android or Safari on iPhone). Switching to auto-scroll.', 5000);
    settings.mode = 'auto'; saveSettings(); syncForm(); applyLayout();
    startAuto(); updateHud();
    return;
  }
  stopRecognition();
  const r = new SR();
  P.recog = r;
  r.lang = settings.lang || 'en-US';
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;

  let ends = [];
  r.onstart = () => setMic(true);
  r.onresult = e => {
    ends = [];
    let t = '';
    for (let k = 0; k < e.results.length; k++) t += ' ' + e.results[k][0].transcript;
    const spoken = splitWords(t);
    if (settings.showHeard) $('#heard').textContent = '🎙 ' + t.trim().split(/\s+/).slice(-7).join(' ');
    pulseMic();
    const np = findNext(P.norms, P.pos, spoken.slice(-8));
    if (np > P.pos) { setPos(np, { fromEngine: true }); trackPace(); }
  };
  r.onerror = e => {
    if (e.error === 'no-speech' || e.error === 'aborted') return; // normal; onend restarts
    if (isRecording()) {
      // Never stop the take: keep the prompter moving instead.
      fallbackToAuto(e.error === 'network'
        ? 'Voice follow lost its connection.'
        : 'This phone can’t use the mic for voice follow while recording.');
    } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('Microphone permission was blocked. Allow mic access for this site in your browser settings.', 5000);
      pause();
    } else if (e.error === 'audio-capture') {
      toast('No microphone available for voice follow.', 5000);
    } else if (e.error === 'network') {
      toast('Voice follow needs an internet connection on this device.', 4000);
    }
  };
  r.onend = () => {
    setMic(false);
    if (P.recog !== r || !P.playing || engine() !== 'voice') return;
    // Silent failure: recognition keeps ending without hearing anything while recording
    const now = Date.now();
    ends = ends.filter(t => now - t < 10000).concat(now);
    if (isRecording() && ends.length >= 4) {
      fallbackToAuto('Voice follow isn’t getting the mic while recording.');
      return;
    }
    // browsers end recognition after silence / ~60s — restart transparently
    setTimeout(() => {
      if (P.recog === r && P.playing) { try { r.start(); } catch { /* already started */ } }
    }, 120);
  };
  try { r.start(); } catch { /* ignore */ }
}
function stopRecognition() {
  const r = P.recog;
  P.recog = null;
  if (r) { r.onend = null; r.onresult = null; try { r.abort(); } catch { /* ignore */ } }
}
function setMic(on) { $('#micDot').classList.toggle('live', on); }
let pulseT = 0;
function pulseMic() {
  const d = $('#micDot');
  d.classList.add('hit');
  clearTimeout(pulseT);
  pulseT = setTimeout(() => d.classList.remove('hit'), 160);
}

/* ------------------------------------------------------------------ countdown */
function countdown(n) {
  n = +n || 0;
  if (!n) return Promise.resolve(true);
  const el = $('#countdown');
  const token = {};
  P.cdToken = token;
  P.counting = true;
  updateHud();
  return new Promise(resolve => {
    let k = n;
    el.textContent = k; el.hidden = false;
    const iv = setInterval(() => {
      if (P.cdToken !== token) { clearInterval(iv); el.hidden = true; resolve(false); return; }
      k--;
      if (k <= 0) {
        clearInterval(iv); el.hidden = true;
        P.counting = false; P.cdToken = null;
        resolve(true);
      } else el.textContent = k;
    }, 1000);
  });
}
function cancelCountdown() {
  P.cdToken = null;
  P.counting = false;
  $('#countdown').hidden = true;
  updateHud();
}

/* ------------------------------------------------------------------ filters */
const FILTERS = {
  none:    { name: 'Original', css: '' },
  bright:  { name: 'Bright',   css: 'brightness(1.1) contrast(.96) saturate(1.08)' },
  warm:    { name: 'Warm',     css: 'sepia(.22) saturate(1.25) brightness(1.04)' },
  cool:    { name: 'Cool',     css: 'hue-rotate(8deg) saturate(.95) brightness(1.04) contrast(1.04)' },
  vivid:   { name: 'Vivid',    css: 'contrast(1.12) saturate(1.35)' },
  soft:    { name: 'Soft',     css: 'brightness(1.07) contrast(.9) saturate(1.05) blur(.6px)' },
  film:    { name: 'Film',     css: 'sepia(.4) contrast(1.06) saturate(.9) brightness(1.02)' },
  mono:    { name: 'B&W',      css: 'grayscale(1) contrast(1.12)' },
};
function filterString() {
  const parts = [FILTERS[settings.filter]?.css || ''];
  if (settings.brightness !== 100) parts.push(`brightness(${settings.brightness / 100})`);
  return parts.filter(Boolean).join(' ') || 'none';
}
const isFront = () => settings.facing === 'user';
function applyCamLook() {
  const v = $('#cam');
  v.style.filter = filterString();
  v.classList.toggle('mirror', settings.mirrorPreview && isFront());
  $$('#filterChips .pill').forEach(b => b.classList.toggle('on', b.dataset.f === settings.filter));
  $('#brightness').value = settings.brightness;
}
function buildFilterChips() {
  const wrap = $('#filterChips');
  wrap.innerHTML = '';
  for (const [key, f] of Object.entries(FILTERS)) {
    const b = document.createElement('button');
    b.className = 'pill';
    b.dataset.f = key;
    b.textContent = f.name;
    b.addEventListener('click', () => setSetting('filter', key));
    wrap.append(b);
  }
}
$('#filterBtn').addEventListener('click', () => {
  const f = $('#filters');
  f.hidden = !f.hidden;
  $('#filterBtn').classList.toggle('on', !f.hidden);
});
$('#brightness').addEventListener('input', e => setSetting('brightness', +e.target.value));
$('#flipBtn').addEventListener('click', async () => {
  if (isRecording()) { toast('Stop recording before switching cameras'); return; }
  setSetting('facing', isFront() ? 'environment' : 'user');
  if (settings.facing === 'environment') toast('Back camera: the text stays near the front camera, so eye contact won’t line up.', 4000);
});

/* ------------------------------------------------------------------ camera & recording */
async function startCamera() {
  if (!settings.camera || P.stream) { $('#cam').hidden = !settings.camera; return; }
  if (!navigator.mediaDevices?.getUserMedia) { toast('Camera needs HTTPS (or localhost).'); return; }
  try {
    P.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: settings.facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    if (!$('#prompter').classList.contains('active')) { stopCamera(); return; }
    const v = $('#cam');
    v.srcObject = P.stream;
    v.hidden = false;
    v.play().catch(() => {});
    const stream = P.stream;
    // iOS can end the camera track when the audio session changes; restart it.
    stream.getVideoTracks().forEach(t => t.addEventListener('ended', () => {
      if (P.stream === stream) { P.stream = null; setTimeout(recoverCamera, 300); }
    }));
  } catch (err) {
    toast('Camera unavailable: ' + (err.name === 'NotAllowedError' ? 'permission denied' : err.message || err.name));
  }
}
function stopCamera() {
  if (isRecording()) return;
  P.stream?.getTracks().forEach(t => t.stop());
  P.stream = null;
  const v = $('#cam');
  v.srcObject = null;
  v.hidden = true;
}

function pickMime() {
  const types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return types.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

async function prepareRecording() {
  if (!window.MediaRecorder) { toast('Recording isn’t supported in this browser.'); return false; }
  if (!P.stream) {
    settings.camera = true; saveSettings(); syncForm();
    await startCamera();
    if (!P.stream) return false;
  }
  // Raw camera stream = saved exactly as the camera sees it (best quality).
  // A filter or "mirror saved video" needs a canvas pipeline.
  const tracks = needsCanvas() ? startCanvasPipeline() : [...P.stream.getVideoTracks()];
  if (settings.recordAudio) {
    try {
      P.audio = await getMic();
      tracks.push(...(settings.audioMode === 'studio' ? processAudio(P.audio) : P.audio.getAudioTracks()));
    } catch (err) {
      toast('Recording without audio: ' + (err.message || err.name));
    }
  }
  const mimeType = pickMime();
  try {
    P.recorder = new MediaRecorder(new MediaStream(tracks), mimeType
      ? { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 } : undefined);
  } catch {
    P.recorder = new MediaRecorder(new MediaStream(tracks));
  }
  P.chunks = [];
  P.recorder.ondataavailable = e => { if (e.data && e.data.size) P.chunks.push(e.data); };
  P.recorder.onstop = finishRecording;
  return true;
}
function needsCanvas() {
  return filterString() !== 'none' || (settings.mirrorRecording && isFront());
}
function startCanvasPipeline() {
  const v = $('#cam');
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!('filter' in ctx) && filterString() !== 'none') {
    toast('This browser can’t burn filters into the video — it will be saved without the filter.', 5000);
  }
  const fit = () => {
    let w = v.videoWidth || 1280, h = v.videoHeight || 720;
    const s = Math.min(1, 1920 / Math.max(w, h));
    w = Math.round(w * s / 2) * 2; h = Math.round(h * s / 2) * 2;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  };
  let alive = true;
  const schedule = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(draw) : requestAnimationFrame(draw));
  function draw() {
    if (!alive) return;
    fit();
    // settings are read every frame, so changing the filter mid-take applies live
    if (settings.mirrorRecording && isFront()) ctx.setTransform(-1, 0, 0, 1, c.width, 0);
    else ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = filterString();
    ctx.drawImage(v, 0, 0, c.width, c.height);
    schedule();
  }
  fit();
  draw();
  const out = c.captureStream(30);
  P.pipe = { stop() { alive = false; out.getTracks().forEach(t => t.stop()); } };
  return out.getVideoTracks();
}
/* ---------- audio ---------- */
// No echo cancellation / auto-gain: those are tuned for calls and make voices sound thin.
async function getMic() {
  const base = {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: settings.audioMode !== 'natural',
    channelCount: 1,
    sampleRate: 48000,
  };
  if (settings.micId) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: settings.micId } } }); }
    catch { toast('Selected mic not found — using the default one'); }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base });
}

// "Studio voice": rumble cut + voice presence + leveling compressor + soft noise gate
function processAudio(stream) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return stream.getAudioTracks();
  const ac = new AC();
  ac.resume().catch(() => {});
  const src = ac.createMediaStreamSource(stream);

  const highpass = ac.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 85; highpass.Q.value = 0.7;

  const mud = ac.createBiquadFilter();
  mud.type = 'peaking'; mud.frequency.value = 300; mud.Q.value = 1; mud.gain.value = -2;

  const presence = ac.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 3500; presence.Q.value = 1; presence.gain.value = 3;

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -24; comp.knee.value = 10; comp.ratio.value = 3.5;
  comp.attack.value = 0.005; comp.release.value = 0.2;

  const makeup = ac.createGain(); makeup.gain.value = 1.7;
  const gate = ac.createGain();
  const meter = ac.createAnalyser(); meter.fftSize = 1024;
  const dest = ac.createMediaStreamDestination();

  src.connect(highpass).connect(mud).connect(presence).connect(comp).connect(makeup).connect(gate).connect(dest);
  highpass.connect(meter);

  // Gate: when you're not talking, turn the room down (not fully off — sounds more natural)
  const buf = new Float32Array(meter.fftSize);
  let lastVoice = 0;
  const iv = setInterval(() => {
    meter.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const db = 10 * Math.log10(sum / buf.length + 1e-12);
    const now = ac.currentTime;
    if (db > -48) { lastVoice = now; gate.gain.setTargetAtTime(1, now, 0.01); }
    else if (now - lastVoice > 0.3) gate.gain.setTargetAtTime(0.15, now, 0.08);
  }, 20);

  P.audioFx = { ac, iv };
  return dest.stream.getAudioTracks();
}

async function populateMics() {
  const sel = $('#micSel');
  let mics = [];
  try { mics = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch { /* ignore */ }
  sel.innerHTML = '';
  sel.append(new Option('Default microphone', ''));
  mics.filter(m => m.deviceId && m.deviceId !== 'default').forEach((m, i) => {
    sel.append(new Option(m.label || `Microphone ${i + 1}`, m.deviceId));
  });
  sel.value = [...sel.options].some(o => o.value === settings.micId) ? settings.micId : '';
}

function releaseAudio() {
  P.audio?.getTracks().forEach(t => t.stop());
  P.audio = null;
  if (P.audioFx) { clearInterval(P.audioFx.iv); P.audioFx.ac.close().catch(() => {}); P.audioFx = null; }
  P.pipe?.stop();
  P.pipe = null;
}

async function toggleRecord() {
  if (isRecording()) { stopRecording(); return; }
  if (P.counting) { cancelCountdown(); releaseAudio(); P.recorder = null; return; }
  pause();
  if (!(await prepareRecording())) return;
  if (P.pos >= P.words.length) setPos(0);
  const go = await countdown(settings.countdown);
  if (!go) { releaseAudio(); P.recorder = null; updateHud(); return; }
  P.recorder.start(1000);
  P.recStart = Date.now();
  $('#recTime').hidden = false;
  tickRecTime();
  P.recTimer = setInterval(tickRecTime, 500);
  P.playing = true;
  startEngines();
  wake();
}
function tickRecTime() {
  const s = Math.floor((Date.now() - P.recStart) / 1000);
  $('#recTime').textContent = `● ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function stopRecording() {
  clearInterval(P.recTimer);
  $('#recTime').hidden = true;
  pause();
  clearFallback();
  try { P.recorder?.stop(); } catch { /* ignore */ }
  if (!P.recorder) recoverCamera();
}
function finishRecording() {
  const type = P.recorder?.mimeType || pickMime() || 'video/webm';
  const blob = new Blob(P.chunks, { type: type.split(';')[0] });
  P.chunks = [];
  P.recorder = null;
  releaseAudio();
  updateHud();
  if (!blob.size) { toast('Recording was empty'); recoverCamera(); return; }
  if (P.resultUrl) URL.revokeObjectURL(P.resultUrl);
  P.resultBlob = blob;
  P.resultUrl = URL.createObjectURL(blob);
  const v = $('#resultVideo');
  v.src = P.resultUrl;
  $('#resultInfo').textContent = `${(blob.size / 1048576).toFixed(1)} MB · ${blob.type.includes('mp4') ? 'MP4' : 'WebM'}`;
  $('#result').hidden = false;
}
function resultFileName() {
  const ext = P.resultBlob?.type.includes('mp4') ? 'mp4' : 'webm';
  const name = (current?.title || 'take').replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'take';
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${name}-${stamp}.${ext}`;
}
function downloadResult() {
  const a = document.createElement('a');
  a.href = P.resultUrl;
  a.download = resultFileName();
  document.body.append(a);
  a.click();
  a.remove();
}
async function shareResult() {
  const file = new File([P.resultBlob], resultFileName(), { type: P.resultBlob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: current?.title || 'My take' }); }
    catch (err) { if (err.name !== 'AbortError') downloadResult(); }
  } else {
    downloadResult();
  }
}
function closeResult() {
  const v = $('#resultVideo');
  v.pause(); v.removeAttribute('src'); v.load();
  $('#result').hidden = true;
  resetDiscard();
  // iPhone pauses the live camera while the take plays back: bring it back.
  recoverCamera();
}
$('#downloadBtn').addEventListener('click', downloadResult);
$('#shareBtn').addEventListener('click', shareResult);
$('#resultClose').addEventListener('click', closeResult);

// Two-tap discard instead of confirm(): native dialogs are unreliable in iOS home-screen apps.
let discardT = 0;
function resetDiscard() {
  clearTimeout(discardT);
  const b = $('#discardBtn');
  b.textContent = 'Discard';
  b.classList.remove('danger');
}
$('#discardBtn').addEventListener('click', () => {
  const b = $('#discardBtn');
  if (!b.classList.contains('danger')) {
    b.textContent = 'Tap again to discard';
    b.classList.add('danger');
    clearTimeout(discardT);
    discardT = setTimeout(resetDiscard, 3000);
    return;
  }
  closeResult();
  if (P.resultUrl) URL.revokeObjectURL(P.resultUrl);
  P.resultUrl = null; P.resultBlob = null;
  toast('Take discarded');
});
$('#result').addEventListener('click', e => { if (e.target.id === 'result') closeResult(); });

// Make sure the live camera is running again (after playback, a phone call, app switching...).
async function recoverCamera() {
  if (!$('#prompter').classList.contains('active') || !settings.camera || isRecording()) return;
  const track = P.stream?.getVideoTracks()[0];
  if (!track || track.readyState === 'ended' || track.muted) {
    P.stream?.getTracks().forEach(t => t.stop());
    P.stream = null;
    await startCamera();
  } else {
    const v = $('#cam');
    if (v.srcObject !== P.stream) v.srcObject = P.stream;
    v.play().catch(() => {});
  }
}

/* ------------------------------------------------------------------ wake lock */
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !P.lock) {
      P.lock = await navigator.wakeLock.request('screen');
      P.lock.addEventListener('release', () => { P.lock = null; });
    } else if (!on && P.lock) {
      await P.lock.release();
      P.lock = null;
    }
  } catch { /* not supported / denied */ }
}
document.addEventListener('visibilitychange', () => {
  const inPrompter = $('#prompter').classList.contains('active');
  if (document.visibilityState === 'visible' && inPrompter) { keepAwake(true); recoverCamera(); }
  if (document.visibilityState === 'hidden' && inPrompter && P.playing && !isRecording()) pause();
});

/* ------------------------------------------------------------------ HUD */
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/></svg>';
const MODE_TEXT = { voice: 'Voice follow', auto: 'Auto-scroll', manual: 'Manual' };

function updateHud() {
  $('#playBtn').innerHTML = P.playing || P.counting ? ICON_PAUSE : ICON_PLAY;
  $('#recBtn').classList.toggle('on', isRecording());
  let label = MODE_TEXT[engine()];
  if (P.engineOverride) label += ' (mic busy)';
  if (engine() === 'voice') label += ` · ${settings.lang}`;
  if (engine() === 'auto') label += ` · ${autoWpm()} wpm`;
  if (!P.playing) label += P.pos > 0 && P.pos < P.words.length ? ' · paused' : '';
  $('#modeLabel').textContent = label;
}
function wake() {
  const h = $('#hud');
  h.classList.remove('idle');
  clearTimeout(P.idleT);
  if (P.playing) P.idleT = setTimeout(() => h.classList.add('idle'), 3000);
}

$('#playBtn').addEventListener('click', togglePlay);
$('#recBtn').addEventListener('click', toggleRecord);
$('#closeBtn').addEventListener('click', closePrompter);
$('#restartBtn').addEventListener('click', () => { setPos(0); restartEngineAfterJump(); $('#heard').textContent = ''; });
$('#prompter').addEventListener('pointerdown', wake);

// tap a word to jump
$('#text').addEventListener('click', e => {
  const w = e.target.closest('.w');
  if (!w) return;
  setPos(+w.dataset.i);
  restartEngineAfterJump();
});

// swipe on the text box to move by lines
let swipeY = null;
$('#box').addEventListener('touchstart', e => { swipeY = e.touches[0].clientY; }, { passive: true });
$('#box').addEventListener('touchend', e => {
  if (swipeY == null) return;
  const dy = swipeY - e.changedTouches[0].clientY;
  swipeY = null;
  if (Math.abs(dy) > 30) moveLines(Math.max(1, Math.round(Math.abs(dy) / lineH())) * Math.sign(dy));
});
$('#box').addEventListener('wheel', e => { e.preventDefault(); moveLines(Math.sign(e.deltaY)); }, { passive: false });

// keyboard / Bluetooth clicker
document.addEventListener('keydown', e => {
  if (!$('#prompter').classList.contains('active') || !$('#settings').hidden) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter' || k === 'MediaPlayPause') { e.preventDefault(); togglePlay(); }
  else if (k === 'ArrowDown' || k === 'PageDown' || k === 'ArrowRight') { e.preventDefault(); moveLines(1); }
  else if (k === 'ArrowUp' || k === 'PageUp' || k === 'ArrowLeft') { e.preventDefault(); moveLines(-1); }
  else if (k === 'r' || k === 'R') toggleRecord();
  else if (k === 'Escape') closePrompter();
});

window.addEventListener('resize', () => requestAnimationFrame(scrollToPos));

/* ------------------------------------------------------------------ settings sheet */
const MODE_HELP = {
  voice: 'Listens to you and scrolls as you speak. Spoken words get highlighted.',
  auto: 'Scrolls at a steady speed. Works everywhere, even offline.',
  manual: 'Swipe the text, tap a word, or use a Bluetooth clicker to move.',
};
const OUT = {
  wpm: v => `${v} wpm`, topOffset: v => `${v}px`, width: v => `${v}%`,
  lines: v => v, fontSize: v => `${v}px`,
};

function syncForm() {
  $$('#settings [data-k]').forEach(el => {
    const k = el.dataset.k, v = settings[k];
    if (el.classList.contains('seg') || el.classList.contains('swatches')) {
      $$('button', el).forEach(b => b.classList.toggle('on', String(v) === b.dataset.v));
    } else if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el) el.value = v;
  });
  $$('#settings [data-o]').forEach(o => { o.textContent = OUT[o.dataset.o](settings[o.dataset.o]); });
  $$('#settings [data-show]').forEach(f => { f.hidden = f.dataset.show !== settings.mode; });
  $('#modeHelp').textContent = MODE_HELP[settings.mode];
  $('#audioHelp').textContent = AUDIO_HELP[settings.audioMode];
}
const AUDIO_HELP = {
  natural: 'Raw microphone, no processing. Best with an external mic in a quiet room.',
  clean: 'Removes background noise like fans, AC and traffic hum.',
  studio: 'Noise reduction + cuts rumble, adds voice clarity, evens out volume and quiets the room between sentences.',
};

function setSetting(k, v) {
  const before = settings[k];
  settings[k] = v;
  saveSettings();
  syncForm();
  applyLayout();
  const inPrompter = $('#prompter').classList.contains('active');
  if (k === 'mode') clearFallback();
  if (k === 'wpm') P.overrideWpm = null; // moving the slider takes over from the learned pace
  if (k === 'mode' && P.playing) { stopEngines(); startEngines(); }
  if (k === 'lang' && P.playing && settings.mode === 'voice' && before !== v) { stopRecognition(); startRecognition(); }
  if (k === 'camera' && inPrompter) { if (v) startCamera(); else stopCamera(); }
  if (k === 'facing' && inPrompter && before !== v) { stopCamera(); startCamera(); }
  updateHud();
}

$$('#settings [data-k]').forEach(el => {
  const k = el.dataset.k;
  if (el.classList.contains('seg') || el.classList.contains('swatches')) {
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const raw = b.dataset.v;
      setSetting(k, /^\d+$/.test(raw) ? +raw : raw);
    });
  } else if (el.type === 'checkbox') {
    el.addEventListener('change', () => setSetting(k, el.checked));
  } else if (el.type === 'range') {
    el.addEventListener('input', () => setSetting(k, +el.value));
  } else {
    el.addEventListener('change', () => setSetting(k, el.value.trim() || DEFAULTS[k]));
  }
});

function openSettings() { syncForm(); populateMics(); $('#settings').hidden = false; }
function closeSettings() { $('#settings').hidden = true; }
$$('[data-open-settings]').forEach(b => b.addEventListener('click', openSettings));
$('#settingsDone').addEventListener('click', closeSettings);
$('#settings').addEventListener('click', e => { if (e.target.id === 'settings') closeSettings(); });
$('#resetSettings').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  saveSettings(); syncForm(); applyLayout(); updateHud();
});

/* ------------------------------------------------------------------ boot */
buildFilterChips();
renderList();
syncForm();
applyLayout();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
