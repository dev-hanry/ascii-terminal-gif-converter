/**
 * controls.js
 * Manages all UI control interactions:
 *  - Resolution pills + custom width input
 *  - Density preset selector
 *  - Render mode pills
 *  - Playback controls (play/pause/restart)
 *  - FPS slider and font-size slider
 *  - Loop mode pills
 *  - FPS override toggle
 */

export class Controls {
  /**
   * @param {object} elements - DOM element references
   */
  constructor(elements) {
    this._el = elements;

    // Current settings state
    this.state = {
      resolution:   80,    // ASCII column width
      densityPreset: 'standard',
      mode:          'grayscale',
      fps:           12,
      fontSize:      10,
      loopMode:      'loop',
      fpsOverride:   false,
    };

    // Callbacks
    this.onConvert     = null;  // () => void
    this.onPlay        = null;
    this.onPause       = null;
    this.onRestart     = null;
    this.onFPSChange   = null;  // (fps: number|null) => void
    this.onFontChange  = null;  // (px: number) => void
    this.onModeChange  = null;  // (mode: string) => void
    this.onLoopChange  = null;  // (mode: string) => void

    this._bindAll();
  }

  // ── Setup ──────────────────────────────────────────────────────

  _bindAll() {
    this._bindPills('resolutionPills', (value) => {
      if (value === 'custom') {
        this._el.customWidthRow.style.display = 'flex';
        this.state.resolution = parseInt(this._el.customWidth.value, 10) || 100;
      } else {
        this._el.customWidthRow.style.display = 'none';
        this.state.resolution = parseInt(value, 10);
      }
    });

    this._el.customWidth?.addEventListener('input', () => {
      this.state.resolution = parseInt(this._el.customWidth.value, 10) || 80;
    });

    this._el.densitySelect?.addEventListener('change', () => {
      this.state.densityPreset = this._el.densitySelect.value;
    });

    this._bindPills('modePills', (value) => {
      this.state.mode = value;
      this.onModeChange?.(value);
    });

    this._bindPills('loopPills', (value) => {
      this.state.loopMode = value;
      this.onLoopChange?.(value);
    });

    // Convert button
    this._el.btnConvert?.addEventListener('click', () => {
      this.onConvert?.();
    });

    // Playback buttons
    this._el.btnPlay?.addEventListener('click', () => this.onPlay?.());
    this._el.btnPause?.addEventListener('click', () => this.onPause?.());
    this._el.btnRestart?.addEventListener('click', () => this.onRestart?.());

    // FPS slider
    this._el.fpsSlider?.addEventListener('input', () => {
      const fps = parseInt(this._el.fpsSlider.value, 10);
      this.state.fps = fps;
      if (this._el.fpsValue) this._el.fpsValue.textContent = fps;
      if (this.state.fpsOverride) {
        this.onFPSChange?.(fps);
      }
    });

    // FPS override toggle
    this._el.fpsOverrideToggle?.addEventListener('change', () => {
      this.state.fpsOverride = this._el.fpsOverrideToggle.checked;
      this.onFPSChange?.(this.state.fpsOverride ? this.state.fps : null);
    });

    // Font size slider
    this._el.fontSizeSlider?.addEventListener('input', () => {
      const px = parseInt(this._el.fontSizeSlider.value, 10);
      this.state.fontSize = px;
      if (this._el.fontSizeValue) this._el.fontSizeValue.textContent = `${px}px`;
      this.onFontChange?.(px);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', this._onKeyDown.bind(this));
  }

  /**
   * Bind click handlers to a group of pill buttons.
   * @param {string} elKey - Key into this._el
   * @param {Function} onChange
   */
  _bindPills(elKey, onChange) {
    const container = this._el[elKey];
    if (!container) return;

    container.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;

      // Update active state
      container.querySelectorAll('.pill').forEach((p) => p.classList.remove('pill-active'));
      pill.classList.add('pill-active');

      onChange(pill.dataset.value);
    });
  }

  _onKeyDown(e) {
    // Only if not focused on an input/select
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        // Toggle play/pause
        if (this._el.btnPlay && !this._el.btnPlay.disabled) {
          const paused = !this._el.btnPlay.hidden;
          if (paused) this.onPlay?.();
          else this.onPause?.();
        }
        break;
      case 'r':
      case 'R':
        if (!this._el.btnRestart?.disabled) this.onRestart?.();
        break;
    }
  }

  // ── State Management ───────────────────────────────────────────

  /** Enable or disable the Convert button. */
  setConvertEnabled(enabled) {
    if (this._el.btnConvert) this._el.btnConvert.disabled = !enabled;
  }

  /** Enable or disable playback controls as a group. */
  setPlaybackEnabled(enabled) {
    [this._el.btnPlay, this._el.btnPause, this._el.btnRestart].forEach((btn) => {
      if (btn) btn.disabled = !enabled;
    });
    [this._el.exportTXT, this._el.exportJSON, this._el.exportSH,
     this._el.exportClipboard, this._el.exportServerPrepare].forEach((btn) => {
      if (btn) btn.disabled = !enabled;
    });
  }

  /** Switch the play/pause button display. */
  setPlayState(isPlaying) {
    if (!this._el.btnPlay || !this._el.btnPause) return;
    if (isPlaying) {
      this._el.btnPlay.hidden  = true;
      this._el.btnPause.hidden = false;
    } else {
      this._el.btnPlay.hidden  = false;
      this._el.btnPause.hidden = true;
    }
  }

  /** Get current conversion settings. */
  getConversionSettings() {
    return {
      width:         this.state.resolution,
      densityPreset: this.state.densityPreset,
      mode:          this.state.mode,
    };
  }
}
