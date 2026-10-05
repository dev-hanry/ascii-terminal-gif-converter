'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const uploadRoutes = require('./src/routes/uploadRoutes');
const exportRoutes = require('./src/routes/exportRoutes');

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads dir exists on startup
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));        // Large ASCII frame payloads
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logger (development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/upload', uploadRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Serve frontend for any unmatched route (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handling ───────────────────────────────────────────────────────────

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);

  // Multer-specific errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 15MB.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected field in upload request.' });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ─── Cleanup Job ─────────────────────────────────────────────────────────────
// Purge upload sessions older than 30 minutes every 10 minutes

const UPLOAD_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function cleanupOldUploads() {
  try {
    const now = Date.now();
    const entries = fs.readdirSync(UPLOADS_DIR);
    let removed = 0;

    for (const entry of entries) {
      const fullPath = path.join(UPLOADS_DIR, entry);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > UPLOAD_TTL_MS) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[CLEANUP] Removed ${removed} expired session(s).`);
    }
  } catch (err) {
    console.error('[CLEANUP] Error during cleanup:', err.message);
  }
}

setInterval(cleanupOldUploads, CLEANUP_INTERVAL_MS);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   ASCII Terminal GIF Converter       ║`);
  console.log(`  ║   Server running on port ${PORT}        ║`);
  console.log(`  ╚══════════════════════════════════════╝`);
  console.log(`\n  → http://localhost:${PORT}\n`);
});

module.exports = app;
