'use strict';

const express = require('express');
const { prepareExport, downloadExportFile } = require('../controllers/exportController');

const router = express.Router();

// POST /api/export/prepare — generate all export files from submitted ASCII data
router.post('/prepare', prepareExport);

// GET /api/export/:exportSessionId/:filename — download a specific export file
router.get('/:exportSessionId/:filename', downloadExportFile);

module.exports = router;
