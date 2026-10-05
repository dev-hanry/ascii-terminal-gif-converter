/**
 * webcam.js
 * Live webcam-to-ASCII preview module (bonus feature).
 *
 * Captures frames from the user's camera, converts each to ASCII
 * on the fly, and renders them into the terminal output element.
 * Uses requestAnimationFrame for smooth rendering.
 */

import { ASCII_PRESETS } from './converter.js';

const CHAR_ASPECT_RATIO = 0.45;

export class WebcamASCII {
  /**
   * @param {HTMLPreElement}   outputEl   - Terminal output <pre>
   * @param {HTMLVideoElement} videoEl    - Hidden <video> for webcam feed
   * @param {HTMLElement}      counterEl  - Frame counter element
   */
  constructor(outputEl, videoEl, counterEl) {
    this._output  = outputEl;
    this._video   = videoEl;
    this._counter = counterEl;

    this._canvas      = document.createElement('canvas');
    this._ctx         = this._canvas.getContext('2d', { willReadFrequently: true });
    this._stream      = null;
    this._rafId       = null;
    this._isRunning   = false;
    this._frameCount  = 0;

    // Settings (mutable after construction)
    this.asciiWidth     = 60;
    this.densityPreset  = 'standard';
    this.mode           = 'inverted'; // Inverted often looks better for webcam

    // Callbacks
    this.onStart = null;  // () => void
    this.onStop  = null;  // () => void
    this.onError = null;  // (message: string) => void
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Request camera access and begin live ASCII rendering. */
  async start() {
    if (this._isRunning) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.onError?.('WebRTC getUserMedia is not supported in this browser.');
      return;
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err) {
      const messages = {
        NotAllowedError:  'Camera permission denied. Please allow camera access and try again.',
        NotFoundError:    'No camera found on this device.',
        NotReadableError: 'Camera is in use by another application.',
        OverconstrainedError: 'Camera does not meet the required constraints.',
      };
      this.onError?.(messages[err.name] || `Camera error: ${err.message}`);
      return;
    }

    this._video.srcObject = this._stream;
    await this._video.play().catch(() => {});

    // Wait for first frame to be available
    await new Promise((resolve) => {
      if (this._video.readyState >= 2) return resolve();
      this._video.addEventListener('canplay', resolve, { once: true });
    });

    this._isRunning = true;
    this._frameCount = 0;
    this._loop();
    this.onStart?.();
  }

  /** Stop the webcam feed and clean up resources. */
  stop() {
    this._isRunning = false;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }

    this._video.srcObject = null;
    this.onStop?.();
  }

  /** Is the webcam currently active? */
  get isRunning() { return this._isRunning; }

  // ── Render Loop ────────────────────────────────────────────────

  _loop() {
    if (!this._isRunning) return;

    this._rafId = requestAnimationFrame(() => {
      this._captureAndRender();
      this._loop();
    });
  }

  _captureAndRender() {
    const video = this._video;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    // Compute target ASCII dimensions
    const asciiWidth  = Math.max(20, this.asciiWidth);
    const scaleX      = asciiWidth / video.videoWidth;
    const asciiHeight = Math.max(5, Math.round(video.videoHeight * scaleX * CHAR_ASPECT_RATIO));

    // Resize canvas if needed
    if (this._canvas.width !== asciiWidth || this._canvas.height !== asciiHeight) {
      this._canvas.width  = asciiWidth;
      this._canvas.height = asciiHeight;
    }

    // Mirror horizontally for natural webcam feel
    this._ctx.save();
    this._ctx.translate(asciiWidth, 0);
    this._ctx.scale(-1, 1);
    this._ctx.drawImage(video, 0, 0, asciiWidth, asciiHeight);
    this._ctx.restore();

    const imageData = this._ctx.getImageData(0, 0, asciiWidth, asciiHeight);
    const ascii     = this._toASCII(imageData, asciiWidth, asciiHeight);

    this._output.className  = `terminal-output mode-${this.mode}`;
    this._output.textContent = ascii;

    this._frameCount++;
    if (this._counter) {
      this._counter.textContent = `CAM ${String(this._frameCount).padStart(5, '0')}`;
    }
  }

  // ── Pixel to ASCII ─────────────────────────────────────────────

  _toASCII(imageData, width, height) {
    const density = ASCII_PRESETS[this.densityPreset] || ASCII_PRESETS.standard;
    const maxIdx  = density.length - 1;
    const { data } = imageData;
    const isInverted = this.mode === 'inverted';

    const lines = [];
    for (let y = 0; y < height; y++) {
      let line = '';
      for (let x = 0; x < width; x++) {
        const base = (y * width + x) * 4;
        const r    = data[base];
        const g    = data[base + 1];
        const b    = data[base + 2];

        let brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (isInverted) brightness = 1 - brightness;

        const charIdx = Math.round(brightness * maxIdx);
        line += density[charIdx] ?? ' ';
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
}
