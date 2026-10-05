'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { handleUpload, serveUploadedGIF, deleteSession } = require('../controllers/uploadController');

const router = express.Router();

// Use OS temp dir for initial upload staging
const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/gif', 'image/x-gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid MIME type: ${file.mimetype}. Only GIF files are accepted.`));
    }
  },
});

// POST /api/upload — receive and validate a GIF
router.post('/', upload.single('gif'), handleUpload);

// GET /api/upload/:sessionId/source.gif — serve the stored GIF
router.get('/:sessionId/source.gif', serveUploadedGIF);

// DELETE /api/upload/:sessionId — explicit session cleanup
router.delete('/:sessionId', deleteSession);

module.exports = router;
