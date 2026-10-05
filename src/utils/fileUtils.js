'use strict';

const fs = require('fs');
const path = require('path');

// GIF magic bytes: GIF87a or GIF89a
const GIF_MAGIC_87 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // GIF87a
const GIF_MAGIC_89 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a

/**
 * Validate that a file is a real GIF by checking its magic bytes.
 * This prevents malicious files with a .gif extension.
 * @param {string} filePath - Absolute path to the file
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateGIFMagicBytes(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(6);
    fs.readSync(fd, header, 0, 6, 0);
    fs.closeSync(fd);

    const is87a = header.equals(GIF_MAGIC_87);
    const is89a = header.equals(GIF_MAGIC_89);

    if (!is87a && !is89a) {
      return { valid: false, reason: 'File does not appear to be a valid GIF (magic bytes mismatch).' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Could not read file for validation: ${err.message}` };
  }
}

/**
 * Create a session directory for storing session-specific files.
 * @param {string} uploadsDir - Root uploads directory
 * @param {string} sessionId - UUID session identifier
 * @returns {string} Absolute path to session directory
 */
function createSessionDir(uploadsDir, sessionId) {
  const sessionDir = path.join(uploadsDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

/**
 * Write session metadata JSON file.
 * @param {string} sessionDir
 * @param {object} meta
 */
function writeSessionMeta(sessionDir, meta) {
  const metaPath = path.join(sessionDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({ ...meta, createdAt: new Date().toISOString() }, null, 2));
}

/**
 * Read session metadata, returns null if not found.
 * @param {string} uploadsDir
 * @param {string} sessionId
 * @returns {object|null}
 */
function readSessionMeta(uploadsDir, sessionId) {
  try {
    const metaPath = path.join(uploadsDir, sessionId, 'meta.json');
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Safely delete a session directory.
 * @param {string} uploadsDir
 * @param {string} sessionId
 */
function deleteSession(uploadsDir, sessionId) {
  const sessionDir = path.join(uploadsDir, sessionId);
  fs.rmSync(sessionDir, { recursive: true, force: true });
}

/**
 * Build an absolute path for an export file within a session.
 * @param {string} uploadsDir
 * @param {string} sessionId
 * @param {string} filename
 * @returns {string}
 */
function sessionFilePath(uploadsDir, sessionId, filename) {
  return path.join(uploadsDir, sessionId, filename);
}

/**
 * Format file size in human-readable form.
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

module.exports = {
  validateGIFMagicBytes,
  createSessionDir,
  writeSessionMeta,
  readSessionMeta,
  deleteSession,
  sessionFilePath,
  formatFileSize,
};
