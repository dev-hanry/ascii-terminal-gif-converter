/**
 * converter.js
 * Core GIF-to-ASCII conversion engine.
 *
 * Responsibilities:
 *  - Decode GIF frames using gifuct-js
 *  - Composite patches into full frames on a canvas
 *  - Resize to target ASCII dimensions
 *  - Map pixel brightness to ASCII density characters
 *  - Optionally pre-render colored HTML or ANSI strings
 *  - Report progress via callbacks
 */

// ── ASCII Density Presets ────────────────────────────────────────
// Characters are ordered from darkest (most "ink") to lightest.
export const ASCII_PRESETS = {
  standard: '@%#*+=-:. ',
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}?-_+~<>i!lI;:,". ',
  blocks:   '█▓▒░ ',
  simple:   '#@+=- ',
  binary:   '10 ',
  minimal:  '@: ',
};

// Aspect-ratio correction factor for typical terminal fonts.
// Terminal characters are ~2× taller than wide, so we halve the row count.
const CHAR_ASPECT_RATIO = 0.45;

// ── GIFConverter Class ───────────────────────────────────────────
export class GIFConverter {
  constructor() {
    this.rawFrames      = [];   // gifuct-js decompressed frames
    this.asciiFrames    = [];   // { ascii, coloredHtml, delay } objects
    this.gifWidth       = 0;
    this.gifHeight      = 0;

    // Off-screen canvases (reused across frames to avoid GC pressure)
    this._composeCanvas = null;  // Compositing canvas (full GIF size)
    this._composeCtx    = null;
    this._scaleCanvas   = null;  // Scaling canvas (target ASCII size)
    this._scaleCtx      = null;
    this._patchCanvas   = null;  // Single-frame patch canvas
    this._patchCtx      = null;
    this._savedCanvas   = null;  // Saved state for disposal type 3
  }

  // ── Load & Decode ──────────────────────────────────────────────

  /**
   * Parse and decompress a GIF from an ArrayBuffer.
   * Returns basic metadata for the caller's use.
   *
   * @param {ArrayBuffer} buffer - Raw GIF bytes
   * @returns {{ width: number, height: number, frameCount: number }}
   */
  loadFromBuffer(buffer) {
    // Resolve gifuct-js API regardless of how the UMD module exports
    const _gifuct = (typeof gifuct !== 'undefined')
      ? gifuct
      : window.gifuct;

    if (!_gifuct || typeof _gifuct.parseGIF !== 'function') {
      throw new Error('gifuct-js library not loaded. Check your internet connection.');
    }

    const gif = _gifuct.parseGIF(buffer);

    // decompressFrames(gif, buildPatch = true) populates frame.patch with RGBA data
    this.rawFrames = _gifuct.decompressFrames(gif, true);

    if (!this.rawFrames || this.rawFrames.length === 0) {
      throw new Error('No frames found in GIF. The file may be corrupt or a static image.');
    }

    this.gifWidth  = gif.lsd.width;
    this.gifHeight = gif.lsd.height;

    this._initCanvases();

    return {
      width:      this.gifWidth,
      height:     this.gifHeight,
      frameCount: this.rawFrames.length,
    };
  }

  /** Create / resize off-screen canvases. */
  _initCanvases() {
    this._composeCanvas = document.createElement('canvas');
    this._composeCanvas.width  = this.gifWidth;
    this._composeCanvas.height = this.gifHeight;
    this._composeCtx = this._composeCanvas.getContext('2d', { willReadFrequently: true });

    this._patchCanvas = document.createElement('canvas');
    this._patchCtx    = this._patchCanvas.getContext('2d', { willReadFrequently: true });

    this._savedCanvas = document.createElement('canvas');
    this._savedCanvas.width  = this.gifWidth;
    this._savedCanvas.height = this.gifHeight;
  }

  // ── Frame Compositing ──────────────────────────────────────────

  /**
   * Apply a raw gifuct-js frame onto the compositing canvas.
   * Handles all four GIF disposal methods correctly.
   *
   * @param {object} frame - gifuct-js frame object
   * @param {number} index - Frame index (0-based)
   */
  _applyFrame(frame, index) {
    const ctx = this._composeCtx;
    const { dims, patch, disposalType } = frame;

    // On the very first frame always start clean
    if (index === 0) {
      ctx.clearRect(0, 0, this.gifWidth, this.gifHeight);
    }

    // Draw patch data onto a temporary canvas, then composite it
    this._patchCanvas.width  = dims.width;
    this._patchCanvas.height = dims.height;

    const patchData = new ImageData(
      new Uint8ClampedArray(patch.buffer ? patch.buffer : patch),
      dims.width,
      dims.height
    );
    this._patchCtx.putImageData(patchData, 0, 0);

    // Save current state before draw if next disposal = 3 (restore to previous)
    const nextFrame = this.rawFrames[index + 1];
    if (nextFrame && nextFrame.disposalType === 3) {
      const savedCtx = this._savedCanvas.getContext('2d');
      savedCtx.clearRect(0, 0, this.gifWidth, this.gifHeight);
      savedCtx.drawImage(this._composeCanvas, 0, 0);
    }

    ctx.drawImage(this._patchCanvas, dims.left, dims.top);

    // Apply disposal for the CURRENT frame (affects the next frame's base)
    // disposalType: 0/1 = do not dispose, 2 = restore bg, 3 = restore previous
    // (disposal happens conceptually after display; we apply it before the next frame)
  }

  /**
   * Apply the disposal method of the PREVIOUS frame before drawing the next.
   *
   * @param {object} prevFrame
   */
  _applyDisposal(prevFrame) {
    if (!prevFrame) return;
    const ctx = this._composeCtx;
    const { dims, disposalType } = prevFrame;

    if (disposalType === 2) {
      // Restore to background color (typically transparent)
      ctx.clearRect(dims.left, dims.top, dims.width, dims.height);
    } else if (disposalType === 3) {
      // Restore to previous canvas state
      ctx.clearRect(dims.left, dims.top, dims.width, dims.height);
      ctx.drawImage(this._savedCanvas, 0, 0);
    }
    // disposalType 0/1: no action needed
  }

  // ── Conversion Pipeline ────────────────────────────────────────

  /**
   * Convert all raw frames to ASCII.
   * Processes frames in batches to keep the UI responsive.
   *
   * @param {object} options
   * @param {number}   options.width         - Target ASCII column count
   * @param {string}   options.densityPreset - Key of ASCII_PRESETS
   * @param {string}   options.mode          - 'grayscale' | 'inverted' | 'colored'
   * @param {Function} [options.onProgress]  - Called with (fractionDone 0-1)
   * @param {Function} [options.onLog]       - Called with status string messages
   * @returns {Promise<Array<{ ascii: string, coloredHtml: string, delay: number }>>}
   */
  async convertToASCII(options = {}) {
    const {
      width        = 80,
      densityPreset = 'standard',
      mode          = 'grayscale',
      onProgress,
      onLog,
    } = options;

    if (!this.rawFrames.length) {
      throw new Error('No GIF loaded. Call loadFromBuffer() first.');
    }

    // Calculate target dimensions respecting character aspect ratio
    const asciiWidth  = Math.max(20, Math.min(300, Math.round(width)));
    const scaleX      = asciiWidth / this.gifWidth;
    const asciiHeight = Math.max(5, Math.round(this.gifHeight * scaleX * CHAR_ASPECT_RATIO));

    onLog?.(`Resize target: ${asciiWidth} × ${asciiHeight} chars`);
    onLog?.(`Density: ${densityPreset}   Mode: ${mode}`);
    onLog?.(`Frames: ${this.rawFrames.length}`);

    // Prepare scale canvas
    if (!this._scaleCanvas) {
      this._scaleCanvas = document.createElement('canvas');
      this._scaleCtx    = this._scaleCanvas.getContext('2d', { willReadFrequently: true });
    }
    this._scaleCanvas.width  = asciiWidth;
    this._scaleCanvas.height = asciiHeight;

    this.asciiFrames = [];

    const BATCH_SIZE = 5; // Frames per tick to yield to UI thread

    for (let i = 0; i < this.rawFrames.length; i++) {
      // Yield to UI every BATCH_SIZE frames
      if (i % BATCH_SIZE === 0 && i > 0) {
        await this._yieldToUI();
      }

      const frame = this.rawFrames[i];

      // Composite frame onto compose canvas
      this._applyDisposal(this.rawFrames[i - 1]);
      this._applyFrame(frame, i);

      // Scale down to ASCII dimensions
      this._scaleCtx.drawImage(this._composeCanvas, 0, 0, asciiWidth, asciiHeight);
      const imageData = this._scaleCtx.getImageData(0, 0, asciiWidth, asciiHeight);

      // Convert pixels to ASCII
      const { ascii, coloredHtml } = this._pixelsToASCII(
        imageData,
        asciiWidth,
        asciiHeight,
        densityPreset,
        mode
      );

      // GIF delay is in hundredths of a second → convert to ms
      const delay = Math.max(20, (frame.delay || 10) * 10);

      this.asciiFrames.push({ ascii, coloredHtml, delay });

      onProgress?.(i / this.rawFrames.length);
    }

    onProgress?.(1.0);
    onLog?.(`Conversion complete. ${this.asciiFrames.length} frames rendered.`);

    return this.asciiFrames;
  }

  // ── Core Pixel-to-ASCII Logic ──────────────────────────────────

  /**
   * Convert ImageData pixels to ASCII string + optional colored HTML.
   *
   * @param {ImageData} imageData
   * @param {number} width
   * @param {number} height
   * @param {string} densityPreset
   * @param {string} mode
   * @returns {{ ascii: string, coloredHtml: string }}
   */
  _pixelsToASCII(imageData, width, height, densityPreset, mode) {
    const density = ASCII_PRESETS[densityPreset] || ASCII_PRESETS.standard;
    const maxIdx  = density.length - 1;
    const { data } = imageData;

    const lines       = [];
    const colorLines  = [];
    const isColored   = mode === 'colored';
    const isInverted  = mode === 'inverted';

    for (let y = 0; y < height; y++) {
      let line      = '';
      let colorLine = '';

      for (let x = 0; x < width; x++) {
        const base = (y * width + x) * 4;
        const r    = data[base];
        const g    = data[base + 1];
        const b    = data[base + 2];
        const a    = data[base + 3];

        // Transparent pixel → space
        if (a < 32) {
          line      += ' ';
          colorLine += ' ';
          continue;
        }

        // Perceptual grayscale (ITU-R BT.601)
        let brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (isInverted) brightness = 1 - brightness;

        const charIdx = Math.round(brightness * maxIdx);
        const ch      = density[charIdx] ?? ' ';

        line += ch;

        if (isColored) {
          // Compute hue from RGB for colorization
          const [h, s, l] = this._rgbToHSL(r, g, b);
          const lightness  = Math.max(30, Math.min(80, l + 20));
          colorLine += `<span style="color:hsl(${h},${Math.round(s)}%,${Math.round(lightness)}%)">${this._escapeHTML(ch)}</span>`;
        }
      }

      lines.push(line);
      if (isColored) colorLines.push(colorLine);
    }

    return {
      ascii:       lines.join('\n'),
      coloredHtml: isColored ? colorLines.join('\n') : '',
    };
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** Yield to the browser event loop. */
  _yieldToUI() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Convert RGB to HSL.
   * @returns {[number, number, number]} [hue 0-360, saturation 0-100, lightness 0-100]
   */
  _rgbToHSL(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
      h = Math.round(h * 360);
    }
    return [h, Math.round(s * 100), Math.round(l * 100)];
  }

  /** Minimal HTML escaping for colored mode. */
  _escapeHTML(ch) {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      default:  return ch;
    }
  }
}
