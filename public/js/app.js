/**
 * app.js
 * Application orchestrator.
 *
 * Responsibilities:
 *  - Initialize all modules (Uploader, GIFConverter, TerminalRenderer,
 *    Controls, Exporter, WebcamASCII)
 *  - Wire inter-module communication
 *  - Manage application state machine (idle → uploaded → converting → ready)
 *  - Drive the status bar and error panel
 */

import { Uploader }         from './uploader.js';
import { GIFConverter }     from './converter.js';
import { TerminalRenderer } from './renderer.js';
import { Controls }         from './controls.js';
import { Exporter }         from './exporter.js';
import { WebcamASCII }      from './webcam.js';

// ── Application State ─────────────────────────────────────────────
const AppState = Object.freeze({
  IDLE:        'idle',
  UPLOADED:    'uploaded',
  CONVERTING:  'converting',
  READY:       'ready',
  WEBCAM:      'webcam',
});

// ── DOM References ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  // Upload
  uploadZone:         $('uploadZone'),
  fileInput:          $('fileInput'),
  uploadProgress:     $('uploadProgress'),
  uploadProgressBar:  $('uploadProgressBar'),
  uploadProgressLabel: document.querySelector('#uploadProgress .progress-label span:first-child'),
  uploadProgressPct:  $('uploadProgressPct'),

  // Terminal
  terminalPlaceholder: $('terminalPlaceholder'),
  terminalProcessing:  $('terminalProcessing'),
  terminalOutput:      $('terminalOutput'),
  terminalTitle:       $('terminalTitle'),
  frameCounter:        $('frameCounter'),
  processingLog:       $('processingLog'),
  conversionProgressBar:   $('conversionProgressBar'),
  conversionProgressLabel: $('conversionProgressLabel'),

  // GIF Info
  gifInfo:         $('gifInfo'),
  gifPreviewWrap:  $('gifPreviewWrap'),
  gifPreviewImg:   $('gifPreviewImg'),

  // Controls
  resolutionPills: $('resolutionPills'),
  customWidthRow:  $('customWidthRow'),
  customWidth:     $('customWidth'),
  densitySelect:   $('densitySelect'),
  modePills:       $('modePills'),
  loopPills:       $('loopPills'),
  btnConvert:      $('btnConvert'),
  btnPlay:         $('btnPlay'),
  btnPause:        $('btnPause'),
  btnRestart:      $('btnRestart'),
  fpsSlider:       $('fpsSlider'),
  fpsValue:        $('fpsValue'),
  fontSizeSlider:  $('fontSizeSlider'),
  fontSizeValue:   $('fontSizeValue'),
  fpsOverrideToggle: $('fpsOverrideToggle'),

  // Export
  exportTXT:           $('exportTXT'),
  exportJSON:          $('exportJSON'),
  exportSH:            $('exportSH'),
  exportClipboard:     $('exportClipboard'),
  exportServerPrepare: $('exportServerPrepare'),
  exportServerLinks:   $('exportServerLinks'),
  exportServerTXT:     $('exportServerTXT'),
  exportServerJSON:    $('exportServerJSON'),
  exportServerSH:      $('exportServerSH'),
  exportFrameInfo:     $('exportFrameInfo'),

  // Webcam
  btnWebcam:       $('btnWebcam'),
  btnWebcamStop:   $('btnWebcamStop'),
  webcamVideo:     $('webcamVideo'),
  webcamWidth:     $('webcamWidth'),
  webcamWidthVal:  $('webcamWidthVal'),
  webcamResRow:    $('webcamResRow'),

  // Status / Error
  statusIndicator: $('statusIndicator'),
  statusText:      $('statusText'),
  statusBarIcon:   $('statusBarIcon'),
  statusBarText:   $('statusBarText'),
  statusBarTime:   $('statusBarTime'),
  errorPanel:      $('errorPanel'),
  errorMessage:    $('errorMessage'),
  errorClose:      $('errorClose'),
};

// ── Module Instances ──────────────────────────────────────────────
const uploader  = new Uploader({
  zone:          els.uploadZone,
  input:         els.fileInput,
  progress:      els.uploadProgress,
  progressBar:   els.uploadProgressBar,
  progressLabel: els.uploadProgressLabel,
  progressPct:   els.uploadProgressPct,
});

const converter = new GIFConverter();

const renderer  = new TerminalRenderer(els.terminalOutput, els.frameCounter);

const controls  = new Controls(els);

const exporter  = new Exporter();

const webcam    = new WebcamASCII(els.terminalOutput, els.webcamVideo, els.frameCounter);

// ── App-level State ───────────────────────────────────────────────
let appState        = AppState.IDLE;
let currentFile     = null;   // { sessionId, originalName, size, arrayBuffer, objectURL }
let conversionMeta  = {};     // gifName, asciiWidth, asciiHeight, densityPreset, mode, fps

// ── Status Helpers ────────────────────────────────────────────────
function setStatus(message, level = 'idle') {
  // Header indicator
  els.statusIndicator.className = `status-dot status-${level}`;
  els.statusText.textContent    = level.toUpperCase();

  // Footer status bar
  els.statusBarText.textContent = message;
  els.statusBarTime.textContent = new Date().toLocaleTimeString();
}

function logProcessing(message) {
  const line       = document.createElement('div');
  line.className   = 'processing-line';
  line.textContent = message;
  els.processingLog.appendChild(line);
  els.processingLog.scrollTop = els.processingLog.scrollHeight;
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorPanel.hidden        = false;
  setStatus(message, 'error');
  console.error('[AppError]', message);
}

function clearError() {
  els.errorPanel.hidden        = true;
  els.errorMessage.textContent = '';
}

function setTerminalState(state) {
  // 'placeholder' | 'processing' | 'output'
  els.terminalPlaceholder.hidden  = (state !== 'placeholder');
  els.terminalProcessing.hidden   = (state !== 'processing');
  els.terminalOutput.hidden       = (state !== 'output');
}

// ── Upload Flow ───────────────────────────────────────────────────
uploader.onStatus = (msg) => setStatus(msg, 'active');
uploader.onError  = (msg) => showError(msg);

uploader.onFileReady = (result) => {
  currentFile = result;
  appState    = AppState.UPLOADED;

  // Show GIF info panel
  const sizeFmt = formatSize(result.size);
  els.gifInfo.innerHTML = `
    <div class="info-row"><span class="info-key">name</span><span class="info-val" title="${result.originalName}">${truncate(result.originalName, 22)}</span></div>
    <div class="info-row"><span class="info-key">size</span><span class="info-val">${sizeFmt}</span></div>
  `;

  // Show GIF preview
  els.gifPreviewImg.src      = result.objectURL;
  els.gifPreviewWrap.hidden  = false;

  // Parse GIF metadata
  let gifMeta;
  try {
    gifMeta = converter.loadFromBuffer(result.arrayBuffer);
    els.gifInfo.innerHTML += `
      <div class="info-row"><span class="info-key">dims</span><span class="info-val">${gifMeta.width}×${gifMeta.height}px</span></div>
      <div class="info-row"><span class="info-key">frames</span><span class="info-val">${gifMeta.frameCount}</span></div>
    `;
  } catch (err) {
    showError(`GIF parse error: ${err.message}`);
    return;
  }

  controls.setConvertEnabled(true);
  setStatus(`GIF loaded: ${result.originalName} (${gifMeta.frameCount} frames)`, 'done');

  // Update terminal title
  els.terminalTitle.textContent = result.originalName + ' — ascii-converter';
};

// ── Conversion Flow ───────────────────────────────────────────────
controls.onConvert = async () => {
  if (!currentFile || appState === AppState.CONVERTING) return;

  appState = AppState.CONVERTING;
  clearError();

  const settings = controls.getConversionSettings();
  setStatus('Converting GIF to ASCII...', 'active');

  // Switch terminal to processing view
  setTerminalState('processing');
  els.processingLog.innerHTML = '';
  els.conversionProgressBar.style.width = '0%';
  els.conversionProgressLabel.textContent = 'Initializing...';

  // Disable convert button during processing
  controls.setConvertEnabled(false);
  controls.setPlaybackEnabled(false);

  try {
    const frames = await converter.convertToASCII({
      width:          settings.width,
      densityPreset:  settings.densityPreset,
      mode:           settings.mode,
      onProgress: (frac) => {
        const pct = Math.round(frac * 100);
        els.conversionProgressBar.style.width = `${pct}%`;
        els.conversionProgressLabel.textContent = `Processing frames... ${pct}%`;
      },
      onLog: (msg) => logProcessing(msg),
    });

    // Build metadata for export
    const sampleLine = frames[0]?.ascii?.split('\n')[0] || '';
    conversionMeta = {
      gifName:       currentFile.originalName,
      asciiWidth:    sampleLine.length,
      asciiHeight:   (frames[0]?.ascii?.split('\n').length) || 0,
      densityPreset: settings.densityPreset,
      mode:          settings.mode,
      fps:           controls.state.fps,
    };

    // Load into renderer
    renderer.mode     = settings.mode;
    renderer.loopMode = controls.state.loopMode;
    renderer.loadFrames(frames);

    // Load into exporter
    exporter.setData(frames, conversionMeta);
    els.exportFrameInfo.textContent = `${frames.length} frames · ${conversionMeta.asciiWidth}×${conversionMeta.asciiHeight}`;

    // Show ASCII output
    setTerminalState('output');
    renderer.play();

    appState = AppState.READY;

    controls.setConvertEnabled(true);
    controls.setPlaybackEnabled(true);
    controls.setPlayState(true);

    setStatus(`Ready — ${frames.length} frames @ ${conversionMeta.asciiWidth} cols`, 'done');

  } catch (err) {
    appState = AppState.UPLOADED;
    showError(`Conversion failed: ${err.message}`);
    setTerminalState('placeholder');
    controls.setConvertEnabled(true);
  }
};

// ── Playback Controls ─────────────────────────────────────────────
controls.onPlay = () => {
  if (appState !== AppState.READY) return;
  renderer.play();
  controls.setPlayState(true);
  setStatus('Playing...', 'active');
};

controls.onPause = () => {
  if (appState !== AppState.READY) return;
  renderer.pause();
  controls.setPlayState(false);
  setStatus(`Paused at frame ${renderer.currentIndex + 1}/${renderer.frameCount}`, 'idle');
};

controls.onRestart = () => {
  if (appState !== AppState.READY) return;
  renderer.restart();
  controls.setPlayState(true);
  setStatus('Restarted', 'active');
};

controls.onFPSChange = (fps) => {
  renderer.fpsOverride = fps;
};

controls.onFontChange = (px) => {
  els.terminalOutput.style.fontSize = `${px}px`;
};

controls.onModeChange = (mode) => {
  renderer.mode = mode;
};

controls.onLoopChange = (loopMode) => {
  renderer.loopMode = loopMode;
};

// ── Export Buttons ────────────────────────────────────────────────
els.exportTXT?.addEventListener('click', () => {
  if (appState !== AppState.READY) return;
  exporter.exportTXT();
  setStatus('Exported TXT file', 'done');
});

els.exportJSON?.addEventListener('click', () => {
  if (appState !== AppState.READY) return;
  exporter.exportJSON();
  setStatus('Exported JSON file', 'done');
});

els.exportSH?.addEventListener('click', () => {
  if (appState !== AppState.READY) return;
  exporter.exportSH();
  setStatus('Exported bash script: play_ascii.sh', 'done');
});

els.exportClipboard?.addEventListener('click', async () => {
  if (appState !== AppState.READY) return;
  try {
    const cmd = await exporter.copyCommand();
    setStatus(`Copied to clipboard: ${cmd}`, 'done');
    // Visual feedback
    const btn = els.exportClipboard;
    const orig = btn.querySelector('.export-label').textContent;
    btn.querySelector('.export-label').textContent = 'Copied!';
    setTimeout(() => btn.querySelector('.export-label').textContent = orig, 2000);
  } catch (err) {
    showError('Clipboard copy failed. Try a modern browser.');
  }
});

els.exportServerPrepare?.addEventListener('click', async () => {
  if (appState !== AppState.READY) return;
  els.exportServerPrepare.disabled = true;
  els.exportServerPrepare.textContent = 'Preparing...';

  try {
    const result = await exporter.prepareServerExport();
    els.exportServerLinks.hidden  = false;
    els.exportServerTXT.href      = result.files.txt;
    els.exportServerJSON.href     = result.files.json;
    els.exportServerSH.href       = result.files.sh;
    setStatus('Server export ready — click links to download', 'done');
  } catch (err) {
    showError(`Server export failed: ${err.message}`);
  } finally {
    els.exportServerPrepare.disabled    = false;
    els.exportServerPrepare.textContent = 'Prepare Server Export';
  }
});

// ── Webcam ────────────────────────────────────────────────────────
els.btnWebcam?.addEventListener('click', async () => {
  setTerminalState('output');
  els.terminalOutput.hidden = false;
  els.btnWebcam.hidden      = true;
  els.btnWebcamStop.hidden  = false;
  els.webcamResRow.hidden   = false;

  appState = AppState.WEBCAM;
  webcam.asciiWidth = parseInt(els.webcamWidth.value, 10) || 60;
  await webcam.start();
});

els.btnWebcamStop?.addEventListener('click', () => {
  webcam.stop();
  els.btnWebcam.hidden      = false;
  els.btnWebcamStop.hidden  = true;
  els.webcamResRow.hidden   = true;

  if (appState === AppState.WEBCAM) {
    appState = AppState.IDLE;
    setTerminalState('placeholder');
  }
  setStatus('Webcam stopped', 'idle');
});

els.webcamWidth?.addEventListener('input', () => {
  const w = parseInt(els.webcamWidth.value, 10);
  els.webcamWidthVal.textContent = w;
  webcam.asciiWidth = w;
});

webcam.onStart = () => setStatus('Webcam ASCII live', 'active');
webcam.onStop  = () => setStatus('Webcam stopped', 'idle');
webcam.onError = (msg) => {
  showError(msg);
  els.btnWebcam.hidden      = false;
  els.btnWebcamStop.hidden  = true;
  appState = AppState.IDLE;
};

// ── Error Panel ───────────────────────────────────────────────────
els.errorClose?.addEventListener('click', clearError);

// ── Utility Helpers ───────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ── Boot ──────────────────────────────────────────────────────────
setStatus('Ready. Upload a GIF to begin.', 'idle');
setTerminalState('placeholder');
controls.setPlaybackEnabled(false);
controls.setConvertEnabled(false);

console.log(
  '%c[ASCII Terminal GIF Converter] %cReady.',
  'color: #00ff41; font-weight: bold',
  'color: #888'
);
