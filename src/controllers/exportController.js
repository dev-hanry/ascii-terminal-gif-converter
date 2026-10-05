'use strict';

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
  generateTXTExport,
  generateJSONExport,
  generateBashScript,
  generatePlaybackCommand,
} = require('../services/exportService');
const { createSessionDir, sessionFilePath } = require('../utils/fileUtils');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

/**
 * POST /api/export/prepare
 * Receives ASCII frame data from the client, generates all export files,
 * and returns an exportSessionId for subsequent downloads.
 *
 * Body: { frames: [...], meta: { gifName, asciiWidth, asciiHeight, fps, densityPreset, mode } }
 */
async function prepareExport(req, res, next) {
  try {
    const { frames, meta = {} } = req.body;

    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: 'No frames provided. Convert a GIF first.' });
    }

    if (frames.length > 500) {
      return res.status(400).json({ error: 'Too many frames (max 500).' });
    }

    // Validate frame structure
    for (let i = 0; i < Math.min(frames.length, 5); i++) {
      if (typeof frames[i].ascii !== 'string' || typeof frames[i].delay !== 'number') {
        return res.status(400).json({
          error: `Invalid frame structure at index ${i}. Expected { ascii: string, delay: number }.`,
        });
      }
    }

    // Create an export session
    const exportSessionId = uuidv4();
    const sessionDir = createSessionDir(UPLOADS_DIR, exportSessionId);

    // Generate all export artifacts
    const txtContent = generateTXTExport(frames, meta);
    const jsonContent = generateJSONExport(frames, meta);
    const shContent = generateBashScript(frames, meta);

    fs.writeFileSync(path.join(sessionDir, 'animation.txt'), txtContent, 'utf8');
    fs.writeFileSync(path.join(sessionDir, 'animation.json'), jsonContent, 'utf8');
    fs.writeFileSync(path.join(sessionDir, 'play_ascii.sh'), shContent, 'utf8');

    // Write meta
    fs.writeFileSync(
      path.join(sessionDir, 'meta.json'),
      JSON.stringify({ ...meta, exportSessionId, createdAt: new Date().toISOString() }, null, 2)
    );

    console.log(`[EXPORT] Prepared export session: ${exportSessionId} | ${frames.length} frames`);

    return res.status(201).json({
      exportSessionId,
      playbackCommand: generatePlaybackCommand('play_ascii.sh'),
      files: {
        txt: `/api/export/${exportSessionId}/animation.txt`,
        json: `/api/export/${exportSessionId}/animation.json`,
        sh: `/api/export/${exportSessionId}/play_ascii.sh`,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/export/:exportSessionId/:filename
 * Download a specific export file by name.
 */
function downloadExportFile(req, res, next) {
  try {
    const { exportSessionId, filename } = req.params;

    // Validate session ID format
    if (!/^[0-9a-f-]{36}$/.test(exportSessionId)) {
      return res.status(400).json({ error: 'Invalid export session ID.' });
    }

    // Allow only known filenames to prevent directory traversal
    const allowedFiles = ['animation.txt', 'animation.json', 'play_ascii.sh'];
    if (!allowedFiles.includes(filename)) {
      return res.status(400).json({ error: 'Unknown export file requested.' });
    }

    const filePath = path.join(UPLOADS_DIR, exportSessionId, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Export file not found or session expired.' });
    }

    // Set appropriate content disposition for download
    const contentTypes = {
      'animation.txt': 'text/plain',
      'animation.json': 'application/json',
      'play_ascii.sh': 'application/x-sh',
    };

    res.setHeader('Content-Type', contentTypes[filename]);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

module.exports = { prepareExport, downloadExportFile };
