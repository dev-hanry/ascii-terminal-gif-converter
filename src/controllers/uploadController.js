'use strict';

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { validateGIFMagicBytes, createSessionDir, writeSessionMeta, formatFileSize } = require('../utils/fileUtils');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

/**
 * POST /api/upload
 * Accepts a GIF file upload, validates it, and creates a server-side session.
 *
 * Returns:
 *  { sessionId, fileUrl, originalName, size, sizeFormatted }
 */
async function handleUpload(req, res, next) {
  try {
    // multer puts file info on req.file
    if (!req.file) {
      return res.status(400).json({ error: 'No file received. Please attach a GIF.' });
    }

    const { originalname, size, path: tempPath, mimetype } = req.file;

    // ── Validation ──────────────────────────────────────────────────

    // MIME type check (browser-provided, not reliable alone)
    const allowedMimes = ['image/gif', 'image/x-gif'];
    if (!allowedMimes.includes(mimetype)) {
      return res.status(422).json({
        error: `Invalid file type: "${mimetype}". Only GIF files are accepted.`,
      });
    }

    // Extension check
    const ext = path.extname(originalname).toLowerCase();
    if (ext !== '.gif') {
      return res.status(422).json({
        error: `Invalid file extension "${ext}". Only .gif files are accepted.`,
      });
    }

    // Size check (also enforced by multer, but double-checked here)
    if (size > MAX_FILE_SIZE) {
      return res.status(413).json({
        error: `File too large (${formatFileSize(size)}). Maximum allowed size is ${formatFileSize(MAX_FILE_SIZE)}.`,
      });
    }

    // Magic bytes check — catches renamed non-GIF files
    const magicResult = validateGIFMagicBytes(tempPath);
    if (!magicResult.valid) {
      return res.status(422).json({ error: magicResult.reason });
    }

    // ── Session Setup ───────────────────────────────────────────────

    const sessionId = uuidv4();
    const sessionDir = createSessionDir(UPLOADS_DIR, sessionId);

    // Move the temp file into the session dir with a normalized name
    const fs = require('fs');
    const destPath = path.join(sessionDir, 'source.gif');
    fs.renameSync(tempPath, destPath);

    // Persist session metadata
    const meta = {
      sessionId,
      originalName: originalname,
      storedName: 'source.gif',
      size,
      mimetype,
    };
    writeSessionMeta(sessionDir, meta);

    // Build the URL path where the GIF can be fetched by the client
    const fileUrl = `/api/upload/${sessionId}/source.gif`;

    console.log(`[UPLOAD] Session created: ${sessionId} | ${originalname} (${formatFileSize(size)})`);

    return res.status(201).json({
      sessionId,
      fileUrl,
      originalName: originalname,
      size,
      sizeFormatted: formatFileSize(size),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/upload/:sessionId/source.gif
 * Serve the stored GIF back to the client for client-side decoding.
 */
function serveUploadedGIF(req, res, next) {
  try {
    const { sessionId } = req.params;

    // Basic UUID format validation to prevent path traversal
    if (!/^[0-9a-f-]{36}$/.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format.' });
    }

    const gifPath = path.join(UPLOADS_DIR, sessionId, 'source.gif');
    const fs = require('fs');

    if (!fs.existsSync(gifPath)) {
      return res.status(404).json({ error: 'Session not found or has expired.' });
    }

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'private, max-age=1800');
    res.sendFile(gifPath);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/upload/:sessionId
 * Explicitly delete a session and its files.
 */
function deleteSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format.' });
    }

    const { deleteSession: deleteSessionUtil } = require('../utils/fileUtils');
    deleteSessionUtil(UPLOADS_DIR, sessionId);

    console.log(`[DELETE] Session removed: ${sessionId}`);
    return res.json({ success: true, sessionId });
  } catch (err) {
    next(err);
  }
}

module.exports = { handleUpload, serveUploadedGIF, deleteSession };
