/**
 * renderer.js
 * Terminal animation renderer.
 *
 * Uses requestAnimationFrame for smooth, jank-free frame playback.
 * Supports three render modes: grayscale (textContent), inverted
 * (textContent), and colored (innerHTML with pre-built HTML strings).
 *
 * Loop modes: 'loop' | 'once' | 'bounce'
 */

export class TerminalRenderer {
  /**
   * @param {HTMLPreElement} outputEl - The <pre> element to render into
   * @param {HTMLElement} counterEl   - Frame counter display element
   */
  constructor(outputEl, counterEl) {
    this._output    = outputEl;
    this._counter   = counterEl;

    this.frames     = [];       // Array of { ascii, coloredHtml, delay }
    this.mode       = 'grayscale'; // 'grayscale' | 'inverted' | 'colored'
    this.loopMode   = 'loop';   // 'loop' | 'once' | 'bounce'
    this.fpsOverride = null;    // null = use per-frame GIF delay; number = ms per frame

    this._currentIdx  = 0;
    this._direction   = 1;      // +1 or -1 for bounce mode
    this._isPlaying   = false;
    this._rafId       = null;
    this._lastTime    = 0;
    this._accumulated = 0;      // Accumulated ms since last frame advance

    // Event callbacks
    this.onFrameChange = null;  // (index, total) => void
    this.onComplete    = null;  // () => void — called when 'once' mode ends
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Load frames array and reset state. */
  loadFrames(frames) {
    this.frames      = frames;
    this._currentIdx = 0;
    this._direction  = 1;
    this._renderCurrentFrame();
    this._updateCounter();
  }

  /** Start or resume playback. */
  play() {
    if (this._isPlaying || this.frames.length === 0) return;
    this._isPlaying  = true;
    this._lastTime   = performance.now();
    this._accumulated = 0;
    this._tick();
  }

  /** Pause playback without resetting position. */
  pause() {
    this._isPlaying = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Restart from the first frame. */
  restart() {
    this.pause();
    this._currentIdx = 0;
    this._direction  = 1;
    this._renderCurrentFrame();
    this._updateCounter();
    this.play();
  }

  /** Is the renderer currently animating? */
  get isPlaying() { return this._isPlaying; }

  /** Get current frame index. */
  get currentIndex() { return this._currentIdx; }

  /** Total number of frames loaded. */
  get frameCount() { return this.frames.length; }

  /** Step forward one frame (when paused). */
  stepForward() {
    this._advanceFrame();
    this._renderCurrentFrame();
    this._updateCounter();
  }

  /** Step backward one frame (when paused). */
  stepBackward() {
    this._currentIdx = (this._currentIdx - 1 + this.frames.length) % this.frames.length;
    this._renderCurrentFrame();
    this._updateCounter();
  }

  // ── Animation Loop ─────────────────────────────────────────────

  _tick() {
    if (!this._isPlaying) return;

    this._rafId = requestAnimationFrame((now) => {
      const elapsed   = now - this._lastTime;
      this._lastTime  = now;
      this._accumulated += elapsed;

      const frame    = this.frames[this._currentIdx] || this.frames[0];
      const frameMs  = this.fpsOverride !== null
        ? (1000 / this.fpsOverride)
        : (frame.delay || 100);

      // Drain accumulated time — may need to advance multiple frames
      // if the tab was backgrounded and throttled
      let advanced = false;
      while (this._accumulated >= frameMs) {
        this._accumulated -= frameMs;
        this._advanceFrame();
        advanced = true;

        // In 'once' mode stop after the last frame
        if (this.loopMode === 'once' && this._currentIdx === 0) {
          this.pause();
          this.onComplete?.();
          this._renderCurrentFrame();
          this._updateCounter();
          return;
        }
      }

      if (advanced) {
        this._renderCurrentFrame();
        this._updateCounter();
        this.onFrameChange?.(this._currentIdx, this.frames.length);
      }

      this._tick();
    });
  }

  // ── Frame Advance Logic ────────────────────────────────────────

  /** Move to the next frame index according to loop mode. */
  _advanceFrame() {
    const total = this.frames.length;
    if (total === 0) return;

    if (this.loopMode === 'bounce') {
      this._currentIdx += this._direction;
      if (this._currentIdx >= total - 1) {
        this._currentIdx = total - 1;
        this._direction  = -1;
      } else if (this._currentIdx <= 0) {
        this._currentIdx = 0;
        this._direction  = 1;
      }
    } else {
      // 'loop' and 'once'
      this._currentIdx = (this._currentIdx + 1) % total;
    }
  }

  // ── Rendering ─────────────────────────────────────────────────

  /** Render the current frame to the output element. */
  _renderCurrentFrame() {
    const frame = this.frames[this._currentIdx];
    if (!frame) return;

    // Apply mode CSS class for styling
    this._output.className = `terminal-output mode-${this.mode}`;

    if (this.mode === 'colored' && frame.coloredHtml) {
      // Colored mode: use innerHTML (pre-built during conversion)
      this._output.innerHTML = frame.coloredHtml;
    } else {
      // Grayscale / inverted: use textContent (faster, safer)
      this._output.textContent = frame.ascii;
    }
  }

  /** Update the frame counter display. */
  _updateCounter() {
    if (this._counter) {
      const total = this.frames.length;
      const cur   = total > 0 ? this._currentIdx + 1 : 0;
      this._counter.textContent = `${String(cur).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
    }
  }
}
