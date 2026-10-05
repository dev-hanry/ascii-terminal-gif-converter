/**
 * uploader.js
 * Handles all file input concerns:
 *  - Drag-and-drop onto the upload zone
 *  - File input (<input type="file">) selection
 *  - Client-side validation (type, size, GIF magic bytes via ArrayBuffer)
 *  - XMLHttpRequest upload to /api/upload with progress events
 *  - Returns { sessionId, fileUrl, arrayBuffer, objectURL }
 */

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const GIF_MAGIC = [
  [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
  [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
];

export class Uploader {
  /**
   * @param {object} elements - DOM element references
   * @param {HTMLElement} elements.zone       - Drop zone container
   * @param {HTMLInputElement} elements.input - Hidden file input
   * @param {HTMLElement} elements.progress   - Progress wrapper div
   * @param {HTMLElement} elements.progressBar
   * @param {HTMLElement} elements.progressLabel
   * @param {HTMLElement} elements.progressPct
   */
  constructor(elements) {
    this._zone          = elements.zone;
    this._input         = elements.input;
    this._progress      = elements.progress;
    this._progressBar   = elements.progressBar;
    this._progressLabel = elements.progressLabel;
    this._progressPct   = elements.progressPct;

    this.onFileReady = null;  // async (result) => void
    this.onError     = null;  // (message) => void
    this.onStatus    = null;  // (message) => void

    this._bindEvents();
  }

  // ── Event Binding ──────────────────────────────────────────────

  _bindEvents() {
    // Drag-and-drop
    this._zone.addEventListener('dragenter', this._onDragEnter.bind(this));
    this._zone.addEventListener('dragover',  this._onDragOver.bind(this));
    this._zone.addEventListener('dragleave', this._onDragLeave.bind(this));
    this._zone.addEventListener('drop',      this._onDrop.bind(this));

    // Click to open file picker
    this._zone.addEventListener('click', () => this._input.click());
    this._zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._input.click();
      }
    });

    // File input change
    this._input.addEventListener('change', () => {
      if (this._input.files?.[0]) {
        this._processFile(this._input.files[0]);
      }
    });
  }

  _onDragEnter(e) {
    e.preventDefault();
    this._zone.classList.add('drag-over');
  }

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  _onDragLeave(e) {
    // Only remove class if leaving the zone entirely (not a child element)
    if (!this._zone.contains(e.relatedTarget)) {
      this._zone.classList.remove('drag-over');
    }
  }

  _onDrop(e) {
    e.preventDefault();
    this._zone.classList.remove('drag-over');

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    this._processFile(file);
  }

  // ── File Processing Pipeline ───────────────────────────────────

  async _processFile(file) {
    this.onStatus?.('Validating file...');

    // ── Client-side validation ──────────────────────────────────
    const validationError = await this._validateFile(file);
    if (validationError) {
      this.onError?.(validationError);
      return;
    }

    // Read entire file into memory (needed for gifuct-js anyway)
    let arrayBuffer;
    try {
      arrayBuffer = await this._readFileAsArrayBuffer(file);
    } catch (err) {
      this.onError?.(`Failed to read file: ${err.message}`);
      return;
    }

    // Create an object URL for the GIF preview <img>
    const objectURL = URL.createObjectURL(file);

    this.onStatus?.(`Uploading ${file.name} (${this._formatSize(file.size)})...`);

    // ── Upload to server ────────────────────────────────────────
    let uploadResult;
    try {
      uploadResult = await this._uploadToServer(file);
    } catch (err) {
      this.onError?.(`Upload failed: ${err.message}`);
      this._hideProgress();
      return;
    }

    this._hideProgress();
    this.onStatus?.(`Upload complete. Session: ${uploadResult.sessionId}`);

    // Pass everything to the caller
    this.onFileReady?.({
      sessionId:   uploadResult.sessionId,
      fileUrl:     uploadResult.fileUrl,
      originalName: file.name,
      size:         file.size,
      arrayBuffer,
      objectURL,
    });
  }

  // ── Validation ─────────────────────────────────────────────────

  /**
   * Client-side file validation.
   * @returns {string|null} Error message, or null if valid.
   */
  async _validateFile(file) {
    // Extension
    if (!file.name.toLowerCase().endsWith('.gif')) {
      return `Invalid file type. Only .gif files are accepted (got: ${file.name}).`;
    }

    // MIME (browser-provided)
    if (!['image/gif', 'image/x-gif'].includes(file.type)) {
      return `Invalid MIME type: "${file.type}". Only GIF files are accepted.`;
    }

    // Size
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (${this._formatSize(file.size)}). Maximum size is 15 MB.`;
    }

    if (file.size < 6) {
      return 'File is too small to be a valid GIF.';
    }

    // Magic bytes — read just the first 6 bytes
    try {
      const header = await this._readFirstBytes(file, 6);
      const bytes  = new Uint8Array(header);
      const valid  = GIF_MAGIC.some((magic) =>
        magic.every((byte, i) => bytes[i] === byte)
      );
      if (!valid) {
        return 'File does not appear to be a valid GIF (magic bytes mismatch). It may be renamed or corrupted.';
      }
    } catch {
      // If we can't read, let the server validate
    }

    return null;
  }

  // ── XHR Upload with Progress ───────────────────────────────────

  _uploadToServer(file) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('gif', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          this._showProgress('Uploading...', pct);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Invalid server response.'));
          }
        } else {
          let msg = `Server error ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText);
            msg = body.error || msg;
          } catch { /* ignore */ }
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
      xhr.addEventListener('timeout', () => reject(new Error('Upload timed out.')));
      xhr.timeout = 30_000;

      xhr.send(formData);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────

  _readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsArrayBuffer(file);
    });
  }

  _readFirstBytes(file, count) {
    return this._readFileAsArrayBuffer(file.slice(0, count));
  }

  _showProgress(label, pct) {
    this._progress.classList.add('visible');
    this._progressLabel.textContent = label;
    this._progressPct.textContent   = `${pct}%`;
    this._progressBar.style.width   = `${pct}%`;
  }

  _hideProgress() {
    this._progress.classList.remove('visible');
    this._progressBar.style.width = '0%';
    // Reset the file input so the same file can be re-selected
    this._input.value = '';
  }

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  }
}
