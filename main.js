// CartoonMaker - client-side animation and recording

const els = {
  scriptInput: document.getElementById('scriptInput'),
  imagesInput: document.getElementById('imagesInput'),
  segmentDuration: document.getElementById('segmentDuration'),
  fps: document.getElementById('fps'),
  resolution: document.getElementById('resolution'),
  exportEngine: document.getElementById('exportEngine'),
  stylePreset: document.getElementById('stylePreset'),
  transitionPreset: document.getElementById('transitionPreset'),
  showCaptions: document.getElementById('showCaptions'),
  captionSize: document.getElementById('captionSize'),
  captionStyle: document.getElementById('captionStyle'),
  musicInput: document.getElementById('musicInput'),
  includeMic: document.getElementById('includeMic'),
  useTitleCard: document.getElementById('useTitleCard'),
  useEndCard: document.getElementById('useEndCard'),
  previewBtn: document.getElementById('previewBtn'),
  recordBtn: document.getElementById('recordBtn'),
  downloadLink: document.getElementById('downloadLink'),
  status: document.getElementById('status'),
  canvas: document.getElementById('stage'),
  segmentsList: document.getElementById('segmentsList'),
  notice: document.getElementById('notice'),
  resetNoticesBtn: document.getElementById('resetNoticesBtn'),
  exportHelpBtn: document.getElementById('exportHelpBtn'),
  exportHelpTip: document.getElementById('exportHelpTip'),
};

const ctx = els.canvas.getContext('2d');

let state = {
  images: [],
  segments: [],
  segmentStyles: [],
  timeline: [],
  running: false,
  recording: false,
  recorder: null,
  chunks: [],
  startTime: 0,
  style: 'none',
  transition: 'none',
  captionPx: 24,
  captionStyle: 'box',
  audioElement: null,
  audioStream: null,
  micStream: null,
};

// Mobile detection and sensible defaults
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
if (isMobile) {
  // Lower FPS and default resolution for smoother performance
  if (els.fps) els.fps.value = '24';
  if (els.resolution) els.resolution.value = '1280x720';
}

function setStatus(msg) {
  els.status.textContent = msg || '';
}

function showNotice(msg, withSwitchButton = true, type = 'general') {
  if (!els.notice) return;
  if (sessionStorage.getItem(`noticeDismissed_${type}`) === '1') return;
  const btnHtml = withSwitchButton ? ' <button id="switchAutoBtn" type="button">Switch to Auto</button>' : '';
  const dismissHtml = '<button class="dismiss" id="noticeDismiss" aria-label="Dismiss">×</button>';
  els.notice.innerHTML = `${dismissHtml}${msg}${btnHtml}`;
  els.notice.style.display = 'block';
  const btn = document.getElementById('switchAutoBtn');
  if (btn) {
    btn.onclick = () => {
      if (els.exportEngine) els.exportEngine.value = 'auto';
      els.notice.style.display = 'none';
      setStatus('Switched to Auto (MediaRecorder).');
    };
  }
  const dismissBtn = document.getElementById('noticeDismiss');
  if (dismissBtn) {
    dismissBtn.onclick = () => {
      sessionStorage.setItem(`noticeDismissed_${type}`, '1');
      els.notice.style.display = 'none';
    };
  }
}

function hideNotice() {
  if (!els.notice) return;
  els.notice.style.display = 'none';
}

function parseResolution(value) {
  const [w, h] = value.split('x').map(Number);
  return { width: w, height: h };
}

function resizeCanvasToResolution() {
  const { width, height } = parseResolution(els.resolution.value);
  els.canvas.width = width;
  els.canvas.height = height;
}

function parseScript(text) {
  return text
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function loadImages(files) {
  const list = Array.from(files || []);
  const load = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const imgs = [];
  for (const f of list) {
    try { imgs.push(await load(f)); } catch (e) { console.warn('Failed to load', f.name, e); }
  }
  return imgs;
}

function buildTimeline(segments, images, segmentDuration) {
  const tl = [];
  const totalSegments = segments.length;
  for (let i = 0; i < totalSegments; i++) {
    const img = images.length ? images[i % images.length] : null;
    const start = i * segmentDuration;
    const end = start + segmentDuration;
    // Gentle randomized Ken Burns parameters
    const zoomStart = 1.05 + Math.random() * 0.15; // 1.05 - 1.20
    const zoomEnd = 1.10 + Math.random() * 0.20;   // 1.10 - 1.30
    const panX = (Math.random() - 0.5) * 0.15;     // -0.075 - 0.075
    const panY = (Math.random() - 0.5) * 0.15;
    tl.push({
      segmentIndex: i,
      text: segments[i],
      img,
      start,
      end,
      zoomStart,
      zoomEnd,
      panX,
      panY,
      style: state.segmentStyles[i] || state.style,
    });
  }
  return tl;
}

function drawFrame(timeSec) {
  const { width, height } = els.canvas;
  ctx.clearRect(0, 0, width, height);

  if (!state.timeline.length) return;
  const tl = state.timeline;
  const current = tl.find(seg => timeSec >= seg.start && timeSec < seg.end) || tl[tl.length - 1];
  const currentIndex = current.segmentIndex;
  const progress = Math.min(1, Math.max(0, (timeSec - current.start) / (current.end - current.start)));

  // Background
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, width, height);

  if (current.img) {
    const img = current.img;
    // Compute cover fit
    const scale = Math.max(width / img.width, height / img.height);
    // Ken Burns zoom
    const zoom = current.zoomStart + (current.zoomEnd - current.zoomStart) * progress;
    const scaledW = img.width * scale * zoom;
    const scaledH = img.height * scale * zoom;
    // Pan offsets
    const panOffsetX = current.panX * (width * 0.4) * progress;
    const panOffsetY = current.panY * (height * 0.4) * progress;
    const dx = (width - scaledW) / 2 + panOffsetX;
    const dy = (height - scaledH) / 2 + panOffsetY;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Apply style filter (per segment) before drawing
    ctx.save();
    applyStyleFilter(ctx, current.style);
    ctx.drawImage(img, dx, dy, scaledW, scaledH);
    ctx.restore();
  } else {
    // No image: draw a placeholder gradient
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#1f2937');
    g.addColorStop(1, '#0b1020');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  // Overlays (vignette, halftone, noise, neon, etc.)
  applyStyleOverlays(ctx, current.style, width, height);

  // Transitions near segment boundaries
  const T = 0.6; // seconds
  const segLen = current.end - current.start;
  const nearStart = progress < T / segLen;
  const nearEnd = progress > 1 - T / segLen;
  if (state.transition !== 'none' && (nearStart || nearEnd)) {
    const prev = tl[currentIndex - 1];
    const next = tl[currentIndex + 1];
    if (nearStart && prev && prev.img) {
      const pct = (T / segLen - progress) / (T / segLen);
      drawTransition(ctx, prev, current, pct, width, height);
    } else if (nearEnd && next && next.img) {
      const pct = (progress - (1 - T / segLen)) / (T / segLen);
      drawTransition(ctx, current, next, pct, width, height);
    }
  }

  // Caption overlay
  if (els.showCaptions.checked && current.text) {
    const pad = 14;
    const maxWidth = width * 0.8;
    const fontPx = state.captionPx;
    ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Measure text
    const metrics = ctx.measureText(current.text);
    const textWidth = Math.min(metrics.width, maxWidth);
    const textHeight = fontPx * 1.6;
    const boxX = width / 2 - textWidth / 2 - pad;
    const boxY = height - textHeight - 28 - pad;
    const boxW = textWidth + pad * 2;
    const boxH = textHeight + pad * 2;
    if (state.captionStyle === 'box') {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.6)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = '#e5e7eb';
    } else if (state.captionStyle === 'shadow') {
      ctx.fillStyle = '#e5e7eb';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.fillStyle = '#e5e7eb';
    }
    wrapTextCentered(ctx, current.text, width / 2, boxY + boxH / 2, maxWidth, fontPx);
  }
}

function wrapTextCentered(ctx, text, centerX, centerY, maxWidth, fontPx) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    const width = ctx.measureText(test).width;
    if (width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const totalHeight = lines.length * fontPx * 1.2;
  let y = centerY - totalHeight / 2 + fontPx / 2;
  for (const l of lines) {
    ctx.fillText(l, centerX, y);
    y += fontPx * 1.2;
  }
}

function getTotalDurationSec() {
  const segDur = Number(els.segmentDuration.value);
  return Math.max(0, state.segments.length * segDur);
}

function speakPreview(segments) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    segments.forEach((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 0.8;
      window.speechSynthesis.speak(u);
    });
  } catch (e) {
    console.warn('Speech synthesis error:', e);
  }
}

function stopAnimation() {
  state.running = false;
}

async function prepare() {
  setStatus('Preparing assets...');
  resizeCanvasToResolution();
  // Parse script and optionally inject title/end cards
  const base = parseScript(els.scriptInput.value);
  const segments = [...base];
  if (els.useTitleCard && els.useTitleCard.checked && base.length > 0) {
    segments.unshift(base[0]);
  }
  if (els.useEndCard && els.useEndCard.checked && base.length > 1) {
    segments.push(base[base.length - 1]);
  }
  state.segments = segments;

  state.images = await loadImages(els.imagesInput.files);
  const segDur = Math.max(1, Number(els.segmentDuration.value) || 4);
  // Default per-line styles initialize to global style if not set
  state.style = els.stylePreset.value;
  state.segmentStyles = state.segmentStyles.length === state.segments.length ? state.segmentStyles : new Array(state.segments.length).fill(state.style);
  state.timeline = buildTimeline(state.segments, state.images, segDur);
  state.transition = els.transitionPreset ? els.transitionPreset.value : 'none';
  state.captionPx = Number(els.captionSize ? els.captionSize.value : 24) || 24;
  state.captionStyle = els.captionStyle ? els.captionStyle.value : 'box';
  setStatus(`Loaded ${state.images.length} image(s), ${state.segments.length} segment(s).`);
  renderSegmentsList();
}

async function preview() {
  await prepare();
  const total = getTotalDurationSec();
  if (total === 0) {
    setStatus('Add script lines to preview.');
    return;
  }
  speakPreview(state.segments);
  state.running = true;
  state.startTime = performance.now();

  const loop = () => {
    if (!state.running) return;
    const elapsedSec = (performance.now() - state.startTime) / 1000;
    const t = Math.min(elapsedSec, total);
    drawFrame(t);
    if (elapsedSec < total) {
      requestAnimationFrame(loop);
    } else {
      state.running = false;
      setStatus('Preview finished.');
    }
  };
  requestAnimationFrame(loop);
}

async function record() {
  await prepare();
  const totalSec = getTotalDurationSec();
  const fps = Math.max(10, Math.min(60, Number(els.fps.value) || 30));
  if (totalSec === 0) {
    setStatus('Add script lines to export video.');
    return;
  }
  const supportsCanvasStream = typeof els.canvas.captureStream === 'function';
  const supportsRecorder = 'MediaRecorder' in window;

  // Route to FFmpeg fallback if selected, or if APIs are unsupported
  const engine = els.exportEngine ? els.exportEngine.value : 'auto';
  if (engine === 'ffmpeg' || (!supportsRecorder || !supportsCanvasStream)) {
    return recordFFmpegFallback(fps);
  }

  const videoStream = els.canvas.captureStream(fps);
  const tracks = [...videoStream.getTracks()];

  // Include background music if provided
  if (els.musicInput && els.musicInput.files && els.musicInput.files[0]) {
    try {
      if (!state.audioElement) state.audioElement = new Audio();
      state.audioElement.src = URL.createObjectURL(els.musicInput.files[0]);
      state.audioElement.loop = true;
      await state.audioElement.play();
      const audioStream = state.audioElement.captureStream ? state.audioElement.captureStream() : null;
      state.audioStream = audioStream;
      if (audioStream) tracks.push(...audioStream.getAudioTracks());
    } catch (e) {
      console.warn('Audio capture failed:', e);
    }
  }

  // Optional microphone narration
  if (els.includeMic && els.includeMic.checked && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tracks.push(...state.micStream.getAudioTracks());
    } catch (e) {
      console.warn('Microphone capture failed:', e);
    }
  }

  const mixed = new MediaStream(tracks);
  const recorder = new MediaRecorder(mixed, { mimeType: 'video/webm;codecs=vp9' });
  state.recorder = recorder;
  state.chunks = [];
  state.recording = true;
  setStatus('Recording...');

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) state.chunks.push(e.data);
  };
  recorder.onstop = () => {
    state.recording = false;
    const blob = new Blob(state.chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    els.downloadLink.href = url;
    els.downloadLink.style.display = 'inline-block';
    setStatus('Recording complete. Download ready.');
  };

  recorder.start();
  state.running = true;
  state.startTime = performance.now();

  const tickIntervalMs = 1000 / fps;
  let lastTick = performance.now();
  const run = () => {
    if (!state.running) return;
    const now = performance.now();
    if (now - lastTick >= tickIntervalMs) {
      lastTick = now;
      const elapsedSec = (now - state.startTime) / 1000;
      const t = Math.min(elapsedSec, totalSec);
      drawFrame(t);
      const pct = Math.round((t / totalSec) * 100);
      setStatus(`Recording... ${pct}%`);
    }
    if ((now - state.startTime) / 1000 < totalSec) {
      requestAnimationFrame(run);
    } else {
      state.running = false;
      recorder.stop();
    }
  };
  requestAnimationFrame(run);
}

async function recordFFmpegFallback(fps) {
  try {
    setStatus('Preparing FFmpeg (WebAssembly)...');
    const loaded = await ensureFFmpegLoaded();
    if (!loaded || !window.FFmpeg || !window.FFmpeg.createFFmpeg) {
      setStatus('FFmpeg not available. Please try again or use MediaRecorder.');
      showNotice('FFmpeg fallback is not available. Add local FFmpeg files under <code>vendor/ffmpeg</code> or switch to Auto (MediaRecorder).', true, 'missingFFmpeg');
      return;
    }
    const { createFFmpeg, fetchFile } = window.FFmpeg;
    const ffmpeg = createFFmpeg({ log: false, corePath: 'vendor/ffmpeg/ffmpeg-core.js' });
    await ffmpeg.load();

    const totalSec = getTotalDurationSec();
    const frames = Math.ceil(totalSec * fps);
    // Safety guard: extremely long videos may exceed memory limits
    if (frames > 1800) {
      setStatus('Video too long for FFmpeg fallback. Reduce duration or FPS.');
      return;
    }

    // Render and write each frame as PNG to FFmpeg FS
    setStatus('Rendering frames...');
    for (let i = 0; i < frames; i++) {
      const t = Math.min(i / fps, totalSec);
      drawFrame(t);
      // toBlob for better performance than toDataURL
      const blob = await new Promise(resolve => els.canvas.toBlob(resolve, 'image/png'));
      const fileData = await fetchFile(blob);
      const name = `frame${String(i + 1).padStart(6, '0')}.png`;
      ffmpeg.FS('writeFile', name, fileData);
      if ((i + 1) % Math.max(1, Math.floor(frames / 10)) === 0) {
        const pct = Math.round(((i + 1) / frames) * 100);
        setStatus(`Frames rendered: ${pct}%`);
      }
    }

    setStatus('Encoding MP4 with FFmpeg...');
    // Encode sequence into MP4 (baseline compatible, yuv420p)
    await ffmpeg.run(
      '-framerate', String(fps),
      '-i', 'frame%06d.png',
      '-pix_fmt', 'yuv420p',
      '-vf', 'format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      'output.mp4'
    );

    const data = ffmpeg.FS('readFile', 'output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    els.downloadLink.href = url;
    els.downloadLink.download = 'cartoonmaker.mp4';
    els.downloadLink.style.display = 'inline-block';
    setStatus('Export complete (MP4). Download ready.');
    hideNotice();
  } catch (e) {
    console.error('FFmpeg fallback error:', e);
    setStatus('FFmpeg export failed. Try Auto or lower FPS/resolution.');
    showNotice('FFmpeg export failed. Try Auto (MediaRecorder) or reduce FPS/resolution.', true, 'exportFailed');
  }
}

// Reset notices control
if (els.resetNoticesBtn) {
  els.resetNoticesBtn.addEventListener('click', () => {
    try {
      sessionStorage.removeItem('noticeDismissed_missingFFmpeg');
      sessionStorage.removeItem('noticeDismissed_exportFailed');
      sessionStorage.removeItem('noticeDismissed_general');
      setStatus('Notices re-enabled for this session.');
      // If a notice should be visible again, we don’t auto-show; user will trigger the state.
    } catch {
      setStatus('Unable to reset notices (sessionStorage error).');
    }
  });
}

// Export Engine help tooltip
if (els.exportHelpBtn && els.exportHelpTip) {
  const hideTip = () => {
    els.exportHelpTip.style.display = 'none';
    els.exportHelpBtn.setAttribute('aria-expanded', 'false');
  };
  const showTip = () => {
    els.exportHelpTip.style.display = 'block';
    els.exportHelpBtn.setAttribute('aria-expanded', 'true');
    // Position the tooltip anchored to the help button
    const rect = els.exportHelpBtn.getBoundingClientRect();
    const top = Math.round(rect.bottom + 8);
    // After visible, measure width to prevent overflow
    const tipWidth = els.exportHelpTip.offsetWidth || 320;
    let left = Math.round(rect.left);
    const maxLeft = window.innerWidth - tipWidth - 12;
    if (left > maxLeft) left = Math.max(12, maxLeft);
    els.exportHelpTip.style.top = `${top}px`;
    els.exportHelpTip.style.left = `${left}px`;
  };
  els.exportHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const visible = els.exportHelpTip.style.display === 'block';
    if (visible) hideTip(); else showTip();
  });
  document.addEventListener('click', (e) => {
    if (!els.exportHelpTip) return;
    if (els.exportHelpTip.style.display === 'block') {
      if (!els.exportHelpTip.contains(e.target) && e.target !== els.exportHelpBtn) {
        hideTip();
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.exportHelpTip && els.exportHelpTip.style.display === 'block') {
      hideTip();
    }
  });
}

// Load FFmpeg script lazily; try local vendor first, then CDN
function ensureFFmpegLoaded() {
  return new Promise((resolve) => {
    if (window.FFmpeg && window.FFmpeg.createFFmpeg) return resolve(true);
    const s = document.createElement('script');
    s.src = 'vendor/ffmpeg/ffmpeg.min.js';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

// Events
els.previewBtn.addEventListener('click', () => {
  stopAnimation();
  preview();
});

els.recordBtn.addEventListener('click', () => {
  stopAnimation();
  record();
});

els.resolution.addEventListener('change', () => {
  resizeCanvasToResolution();
  drawFrame(0);
});

els.stylePreset.addEventListener('change', () => {
  state.style = els.stylePreset.value;
  drawFrame(0);
});

if (els.transitionPreset) {
  els.transitionPreset.addEventListener('change', () => {
    state.transition = els.transitionPreset.value;
    drawFrame(0);
  });
}

if (els.captionSize) {
  els.captionSize.addEventListener('input', () => {
    state.captionPx = Number(els.captionSize.value) || 24;
    drawFrame(0);
  });
}

if (els.captionStyle) {
  els.captionStyle.addEventListener('change', () => {
    state.captionStyle = els.captionStyle.value;
    drawFrame(0);
  });
}

// Initial setup
resizeCanvasToResolution();
drawFrame(0);

// ---------- Style Engine ----------
function applyStyleFilter(ctx, style) {
  switch (style) {
    case 'comic':
      ctx.filter = 'contrast(1.3) saturate(1.4) brightness(1.05)';
      break;
    case 'noir':
      ctx.filter = 'grayscale(1) contrast(1.4) brightness(0.95)';
      break;
    case 'sepia':
      ctx.filter = 'sepia(1) contrast(1.1) brightness(0.95)';
      break;
    case 'pop':
      ctx.filter = 'saturate(2.2) contrast(1.3) hue-rotate(15deg)';
      break;
    case 'manga':
      ctx.filter = 'grayscale(1) contrast(1.2)';
      break;
    case 'neon':
      ctx.filter = 'saturate(2.0) contrast(1.2) hue-rotate(180deg)';
      break;
    case 'watercolor':
      ctx.filter = 'saturate(1.1) contrast(0.9) blur(0.5px) brightness(1.05)';
      break;
    default:
      ctx.filter = 'none';
  }
}

// ---------- Transitions ----------
function drawTransition(ctx, fromSeg, toSeg, pct, width, height) {
  // pct: 0 -> fromSeg, 1 -> toSeg
  const drawSeg = (seg, offsetX = 0, offsetY = 0, alpha = 1) => {
    if (!seg || !seg.img) return;
    const img = seg.img;
    const scale = Math.max(width / img.width, height / img.height);
    const zoom = seg.zoomStart + (seg.zoomEnd - seg.zoomStart) * 0.5; // mid zoom
    const scaledW = img.width * scale * zoom;
    const scaledH = img.height * scale * zoom;
    const dx = (width - scaledW) / 2 + offsetX;
    const dy = (height - scaledH) / 2 + offsetY;
    ctx.save();
    ctx.globalAlpha = alpha;
    applyStyleFilter(ctx, seg.style);
    ctx.drawImage(img, dx, dy, scaledW, scaledH);
    applyStyleOverlays(ctx, seg.style, width, height);
    ctx.restore();
  };

  switch (state.transition) {
    case 'crossfade': {
      drawSeg(fromSeg, 0, 0, 1 - pct);
      drawSeg(toSeg, 0, 0, pct);
      break;
    }
    case 'slide_left': {
      const off = width * 0.4 * pct;
      drawSeg(fromSeg, -off, 0, 1);
      drawSeg(toSeg, width - off, 0, pct);
      break;
    }
    case 'slide_up': {
      const off = height * 0.4 * pct;
      drawSeg(fromSeg, 0, -off, 1);
      drawSeg(toSeg, 0, height - off, pct);
      break;
    }
    case 'zoom_dip': {
      const z = 1 - 0.2 * pct;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(z, z);
      ctx.translate(-width / 2, -height / 2);
      drawSeg(fromSeg, 0, 0, 1 - pct);
      ctx.restore();
      drawSeg(toSeg, 0, 0, pct);
      break;
    }
    default:
      // none
  }
}

function applyStyleOverlays(ctx, style, width, height) {
  ctx.save();
  switch (style) {
    case 'comic':
      drawNoiseOverlay(ctx, width, height, 0.05);
      drawVignette(ctx, width, height, 0.25);
      break;
    case 'noir':
      drawVignette(ctx, width, height, 0.45);
      break;
    case 'sepia':
      drawVignette(ctx, width, height, 0.35);
      drawPaperTexture(ctx, width, height, 0.08);
      break;
    case 'pop':
      drawHalftoneDots(ctx, width, height, 0.12);
      drawVignette(ctx, width, height, 0.20);
      break;
    case 'manga':
      drawHalftoneDots(ctx, width, height, 0.18, true);
      drawHatchLines(ctx, width, height, 0.08);
      break;
    case 'neon':
      drawNeonGradient(ctx, width, height, 0.18);
      drawVignette(ctx, width, height, 0.25);
      break;
    case 'watercolor':
      drawPaperTexture(ctx, width, height, 0.12);
      drawVignette(ctx, width, height, 0.15);
      break;
    default:
      // none
  }
  ctx.restore();
}

// Overlays helpers
let noiseCache = { w: 0, h: 0, canvas: null };
function ensureNoiseCanvas(w, h) {
  if (!noiseCache.canvas || noiseCache.w !== w || noiseCache.h !== h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const imgData = x.createImageData(w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = 200 + Math.random() * 55; // subtle bright paper/noise
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
    x.putImageData(imgData, 0, 0);
    noiseCache = { w, h, canvas: c };
  }
}

function drawNoiseOverlay(ctx, w, h, alpha = 0.06) {
  ensureNoiseCanvas(w, h);
  ctx.globalAlpha = alpha;
  ctx.drawImage(noiseCache.canvas, 0, 0);
  ctx.globalAlpha = 1;
}

function drawPaperTexture(ctx, w, h, alpha = 0.1) {
  ensureNoiseCanvas(w, h);
  // Slight blur using filter to soften texture
  ctx.save();
  ctx.filter = 'blur(0.6px)';
  ctx.globalAlpha = alpha;
  ctx.drawImage(noiseCache.canvas, 0, 0);
  ctx.restore();
}

function drawVignette(ctx, w, h, strength = 0.3) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.65);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawHalftoneDots(ctx, w, h, alpha = 0.15, grayscale = false) {
  const patternCanvas = document.createElement('canvas');
  const cell = 10; // dot grid size
  patternCanvas.width = cell;
  patternCanvas.height = cell;
  const pctx = patternCanvas.getContext('2d');
  pctx.clearRect(0, 0, cell, cell);
  pctx.fillStyle = grayscale ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.6)';
  pctx.beginPath();
  pctx.arc(cell / 2, cell / 2, 3, 0, Math.PI * 2);
  pctx.fill();
  const pattern = ctx.createPattern(patternCanvas, 'repeat');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawHatchLines(ctx, w, h, alpha = 0.08) {
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = 16;
  patternCanvas.height = 16;
  const pctx = patternCanvas.getContext('2d');
  pctx.strokeStyle = 'rgba(0,0,0,0.6)';
  pctx.lineWidth = 1.0;
  pctx.beginPath();
  pctx.moveTo(0, 16);
  pctx.lineTo(16, 0);
  pctx.stroke();
  const pattern = ctx.createPattern(patternCanvas, 'repeat');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawNeonGradient(ctx, w, h, alpha = 0.18) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(0,255,255,1)');
  g.addColorStop(1, 'rgba(255,0,255,1)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------- Segments UI ----------
function renderSegmentsList() {
  if (!els.segmentsList) return;
  els.segmentsList.innerHTML = '';
  const styles = ['none','comic','noir','sepia','pop','manga','neon','watercolor'];
  state.segmentStyles = state.segmentStyles.length === state.segments.length ? state.segmentStyles : new Array(state.segments.length).fill(state.style);
  state.segments.forEach((line, idx) => {
    const row = document.createElement('div');
    row.className = 'segment-row';
    const lineEl = document.createElement('div');
    lineEl.className = 'line';
    lineEl.textContent = line;
    const sel = document.createElement('select');
    styles.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      sel.appendChild(opt);
    });
    sel.value = state.segmentStyles[idx] || state.style;
    sel.addEventListener('change', () => {
      state.segmentStyles[idx] = sel.value;
      // rebuild timeline with updated styles
      const segDur = Math.max(1, Number(els.segmentDuration.value) || 4);
      state.timeline = buildTimeline(state.segments, state.images, segDur);
      drawFrame(0);
    });
    row.appendChild(lineEl);
    row.appendChild(sel);
    els.segmentsList.appendChild(row);
  });
}
