// Web 播放器 + 律动页面 HTML（供 WebPlayer.tsx 的 WebView source={{html}} 使用）
// 音频用 <audio> + AudioContext + AnalyserNode 播放并分析频谱（不依赖系统 Visualizer）
// 与 RN 通过 window.ReactNativeWebView.postMessage 双向通信

export const WEB_PLAYER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>LX Music Web Player</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000; color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
#wrap { position: relative; width: 100%; height: 100%; }
#bg { position: absolute; inset: 0; z-index: 0; }
#content { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column;
  padding: 16px; }
#header { display: flex; align-items: center; justify-content: space-between; height: 48px; }
#header .title { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font-size: 16px; font-weight: 600; padding: 0 12px; }
#header button { background: rgba(255,255,255,.15); border: none; color: #fff;
  width: 40px; height: 40px; border-radius: 20px; font-size: 18px; }
#main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
#pic { width: 55vmin; height: 55vmin; border-radius: 8px; object-fit: cover; margin-bottom: 16px;
  background: #333; }
#lyric { flex: 1; width: 100%; overflow: hidden; text-align: center; display: flex;
  flex-direction: column; align-items: center; justify-content: center; padding: 8px 0; }
.lyric-line { font-size: 15px; color: rgba(255,255,255,.6); padding: 4px 0; }
.lyric-line.active { color: #00D4FF; font-size: 17px; }
#controls { display: flex; align-items: center; justify-content: center; gap: 24px; height: 64px; }
#controls button { background: rgba(255,255,255,.15); border: none; color: #fff;
  width: 52px; height: 52px; border-radius: 26px; font-size: 22px; }
#controls button.play { width: 60px; height: 60px; border-radius: 30px; font-size: 26px; }
#progress { display: flex; align-items: center; gap: 8px; font-size: 12px;
  color: rgba(255,255,255,.7); padding: 0 16px 8px; }
#progress input { flex: 1; }
#status { text-align: center; font-size: 12px; color: rgba(255,255,255,.5); padding-bottom: 8px; }
</style>
</head>
<body>
<div id="wrap">
  <canvas id="bg"></canvas>
  <div id="content">
    <div id="header">
      <button onclick="exit()">←</button>
      <div class="title" id="title">未播放</div>
      <button onclick="toggleMode()">♫</button>
    </div>
    <div id="main">
      <img id="pic" src="" alt="" />
      <div id="lyric"></div>
    </div>
    <div id="progress">
      <span id="cur">0:00</span>
      <input type="range" id="seek" min="0" max="0" value="0" oninput="onSeek(this.value)" />
      <span id="dur">0:00</span>
    </div>
    <div id="controls">
      <button onclick="cmd('prev')">⏮</button>
      <button class="play" id="playBtn" onclick="cmd('togglePlay')">▶</button>
      <button onclick="cmd('next')">⏭</button>
    </div>
    <div id="status"></div>
  </div>
</div>
<script>
// ---------- RN 通信 ----------
function post(msg) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
function cmd(c) { post({ type: 'command', payload: { cmd: c } }); }
function exit() { post({ type: 'command', payload: { cmd: 'exit' } }); }

// ---------- 音频 + 频谱 ----------
const audio = new Audio();
audio.crossOrigin = 'anonymous';
let ctx = null, analyser = null;
let mode = 0, visualizerEnabled = false, curTrackId = null;

function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaElementSource(audio);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  analyser.connect(ctx.destination);
  requestAnimationFrame(draw);
}

// ---------- 律动绘制(6 种模式移植) ----------
const canvas = document.getElementById('bg');
const gctx = canvas.getContext('2d');
let freq = new Uint8Array(0);

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

function getLevels(n) {
  if (!analyser) return new Float32Array(n).fill(0.02);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(buf);
  const levels = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * buf.length / n);
    const end = Math.max(start + 1, Math.floor((i + 1) * buf.length / n));
    let s = 0; for (let k = start; k < end; k++) s += buf[k];
    levels[i] = Math.min(1, s / (end - start) / 200);
  }
  return levels;
}

function draw() {
  requestAnimationFrame(draw);
  if (!visualizerEnabled) return;
  const w = canvas.width, h = canvas.height;
  gctx.clearRect(0, 0, w, h);
  const levels = getLevels(64);
  switch (mode) {
    case 0: drawBars(levels, w, h); break;
    case 1: drawWave(levels, w, h); break;
    case 2: drawRing(levels, w, h); break;
    case 3: drawRingWave(levels, w, h); break;
    case 4: drawMirror(levels, w, h); break;
    case 5: drawRadial(levels, w, h); break;
  }
}
function bar(x, y, bw, bh) { gctx.fillRect(x, y, bw, bh); }
function drawBars(l, w, h) {
  const bw = w / l.length, mid = h / 2;
  gctx.fillStyle = '#00D4FF';
  for (let i = 0; i < l.length; i++) { const bh = l[i] * h * 0.8; bar(i * bw, mid - bh / 2, bw - 1, bh); }
}
function drawWave(l, w, h) {
  gctx.strokeStyle = '#00D4FF'; gctx.lineWidth = 3; gctx.beginPath();
  for (let i = 0; i < l.length; i++) { const x = i * w / l.length, y = h / 2 - l[i] * h * 0.4;
    i ? gctx.lineTo(x, y) : gctx.moveTo(x, y); }
  gctx.stroke();
}
function drawRing(l, w, h) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
  gctx.strokeStyle = '#00D4FF'; gctx.lineWidth = 4;
  for (let i = 0; i < l.length; i++) {
    const a = i * 2 * Math.PI / l.length, r = R + l[i] * R * 0.8;
    gctx.beginPath(); gctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    gctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); gctx.stroke();
  }
}
function drawRingWave(l, w, h) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
  gctx.strokeStyle = '#00D4FF'; gctx.lineWidth = 3; gctx.beginPath();
  for (let i = 0; i <= l.length; i++) {
    const a = i * 2 * Math.PI / l.length, r = R + l[i % l.length] * R * 0.6;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? gctx.lineTo(x, y) : gctx.moveTo(x, y);
  }
  gctx.closePath(); gctx.stroke();
}
function drawMirror(l, w, h) {
  const bw = w / l.length, mid = h / 2; gctx.fillStyle = '#00D4FF';
  for (let i = 0; i < l.length; i++) { const bh = l[i] * h * 0.4;
    bar(i * bw, mid - bh, bw - 1, bh); bar(i * bw, mid, bw - 1, bh); }
}
function drawRadial(l, w, h) {
  const cx = w / 2, cy = h / 2; gctx.strokeStyle = '#00D4FF'; gctx.lineWidth = 3;
  for (let i = 0; i < l.length; i++) {
    const a = i * 2 * Math.PI / l.length, len = l[i] * Math.min(w, h) * 0.45;
    gctx.beginPath(); gctx.moveTo(cx, cy);
    gctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); gctx.stroke();
  }
}

// ---------- 歌词(简单按时间高亮) ----------
let lrcLines = []; // {time, text}
function parseLrc(text) {
  lrcLines = [];
  if (!text) return;
  text.split('\\n').forEach(line => {
    const m = line.match(/\\[(\\d+):(\\d+(?:\\.\\d+)?)\\](.*)/);
    if (m) lrcLines.push({ time: +m[1] * 60 + +m[2], text: m[3] });
  });
}
function updateLyric() {
  const t = audio.currentTime;
  let idx = -1;
  for (let i = lrcLines.length - 1; i >= 0; i--) { if (t >= lrcLines[i].time) { idx = i; break; } }
  const el = document.getElementById('lyric');
  el.innerHTML = '';
  lrcLines.forEach((l, i) => {
    const d = document.createElement('div');
    d.className = 'lyric-line' + (i === idx ? ' active' : '');
    d.textContent = l.text || '';
    el.appendChild(d);
  });
  // 滚动到当前行
  if (idx >= 0) { const line = el.children[idx]; if (line) line.scrollIntoView({ block: 'center' }); }
}

// ---------- 事件 ----------
audio.addEventListener('timeupdate', () => {
  const dur = audio.duration || 0;
  const seek = document.getElementById('seek');
  seek.max = dur; seek.value = audio.currentTime;
  document.getElementById('cur').textContent = fmt(audio.currentTime);
  document.getElementById('dur').textContent = fmt(dur);
  post({ type: 'state', payload: { isPlay: !audio.paused, nowPlayTime: audio.currentTime, maxPlayTime: dur } });
  updateLyric();
});
audio.addEventListener('play', () => { document.getElementById('playBtn').textContent = '⏸'; post({ type: 'state', payload: { isPlay: true, nowPlayTime: audio.currentTime } }); });
audio.addEventListener('pause', () => { document.getElementById('playBtn').textContent = '▶'; post({ type: 'state', payload: { isPlay: false, nowPlayTime: audio.currentTime } }); });
audio.addEventListener('ended', () => { post({ type: 'ended' }); });
audio.addEventListener('error', () => { post({ type: 'error', payload: { message: audio.error ? audio.error.message : 'audio error' } }); });

function fmt(s) { if (!isFinite(s)) s = 0; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; }
function onSeek(v) { audio.currentTime = +v; }
function toggleMode() { mode = (mode + 1) % 6; }

// ---------- RN 消息接收 ----------
window.addEventListener('message', e => {
  const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  handle(msg);
});
function handle(msg) {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'setTrack': {
      const p = msg.payload || {};
      curTrackId = p.id;
      document.getElementById('title').textContent = (p.name || '') + ' - ' + (p.singer || '');
      const pic = document.getElementById('pic');
      if (p.picUrl) pic.src = p.picUrl; else pic.removeAttribute('src');
      parseLrc(p.lrc || '');
      updateLyric();
      if (p.url) { audio.src = p.url; audio.play().catch(() => {}); }
      break;
    }
    case 'setState': {
      const p = msg.payload || {};
      if (p.isPlay) audio.play().catch(() => {}); else audio.pause();
      break;
    }
    case 'setSettings': {
      const p = msg.payload || {};
      mode = p.mode != null ? p.mode : mode;
      visualizerEnabled = !!p.enabled;
      initAudio();
      break;
    }
  }
}
// 通知 RN 已就绪
setTimeout(() => post({ type: 'ready' }), 200);
</script>
</body>
</html>`
