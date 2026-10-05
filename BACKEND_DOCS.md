# Backend Documentation

**ASCII Terminal GIF Converter — Backend Reference**

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Route Reference](#route-reference)
4. [Module Reference](#module-reference)
5. [Session Management](#session-management)
6. [Security Model](#security-model)
7. [Debugging Guide](#debugging-guide)
8. [Common Errors](#common-errors)
9. [Performance Tips](#performance-tips)
10. [Future Scalability](#future-scalability)

---

## Architecture Overview

The backend is a minimal, stateless Express.js server. Its primary responsibilities are:

1. **Serve** the static frontend (HTML/CSS/JS)
2. **Receive and validate** uploaded GIF files
3. **Store** uploaded files in temporary session directories
4. **Generate** export artifacts (TXT, JSON, bash script) from client-submitted ASCII frame data
5. **Serve** export files for download
6. **Clean up** expired sessions automatically

The application follows a strict layered architecture:

```
HTTP Request
     │
     ▼
┌─────────────────────┐
│   Middleware Layer  │  cors, json, urlencoded, static, logger
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│   Routes Layer      │  uploadRoutes.js, exportRoutes.js
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│  Controllers Layer  │  uploadController.js, exportController.js
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│   Services Layer    │  exportService.js
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│    Utils Layer      │  fileUtils.js, scriptGenerator.js
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│   File System       │  ./uploads/{sessionId}/
└─────────────────────┘
```

---

## Data Flow Diagrams

### Upload Flow

```
Client                          Server
  │                               │
  ├──── POST /api/upload ─────────►│
  │     multipart/form-data        │
  │     field: gif                 │
  │                               ├─ multer: stage to OS temp dir
  │                               ├─ Validate MIME type
  │                               ├─ Validate file extension
  │                               ├─ Validate file size
  │                               ├─ Validate magic bytes (GIF87a/GIF89a)
  │                               ├─ Generate UUID sessionId
  │                               ├─ Create ./uploads/{sessionId}/
  │                               ├─ Move file → source.gif
  │                               ├─ Write meta.json
  │                               │
  │◄─── 201 { sessionId, fileUrl }─┤
  │                               │
  ├──── GET /api/upload/{id}/source.gif ─►│
  │                               ├─ Validate sessionId format
  │                               ├─ Check file exists
  │                               │
  │◄─── 200 image/gif ────────────┤
```

### Conversion Flow (Client-Side)

```
Browser
  │
  ├─ Receive GIF ArrayBuffer from upload step (or from in-memory)
  ├─ gifuct-js.parseGIF(buffer)
  ├─ gifuct-js.decompressFrames(gif, true)
  ├─ For each frame:
  │   ├─ Apply GIF disposal method
  │   ├─ Composite patch onto full-size canvas
  │   ├─ Scale canvas to target ASCII dimensions
  │   ├─ Read pixel data via getImageData()
  │   └─ Map brightness → density char
  └─ Store: asciiFrames[] = [{ ascii, coloredHtml, delay }]
```

### Export Flow

```
Client                          Server
  │                               │
  ├──── POST /api/export/prepare ─►│
  │     { frames[], meta{} }       │
  │                               ├─ Validate frames array
  │                               ├─ Generate UUID exportSessionId
  │                               ├─ Create ./uploads/{exportSessionId}/
  │                               ├─ exportService.generateTXTExport()
  │                               ├─ exportService.generateJSONExport()
  │                               ├─ exportService.generateBashScript()
  │                               ├─ Write animation.txt, animation.json, play_ascii.sh
  │                               │
  │◄─── 201 { files: { txt, json, sh } } ─┤
  │                               │
  ├──── GET /api/export/{id}/animation.txt ─►│
  │◄─── 200 text/plain ───────────┤
```

### Cleanup Flow

```
Interval (every 10 min)
  │
  ├─ Read all entries in ./uploads/
  ├─ For each entry:
  │   └─ If mtime > 30 min ago → fs.rmSync(recursive)
  └─ Log removed count
```

---

## Route Reference

### Upload Routes

**`POST /api/upload`**

Upload a GIF file.

- **Content-Type**: `multipart/form-data`
- **Field name**: `gif`
- **Max file size**: 15 MB (enforced by multer + controller)
- **Validation**: MIME type, extension, size, magic bytes

Request:
```
POST /api/upload
Content-Type: multipart/form-data; boundary=----FormBoundary

------FormBoundary
Content-Disposition: form-data; name="gif"; filename="cat.gif"
Content-Type: image/gif

<binary GIF data>
------FormBoundary--
```

Success Response `201`:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "fileUrl": "/api/upload/550e8400.../source.gif",
  "originalName": "cat.gif",
  "size": 1048576,
  "sizeFormatted": "1.00 MB"
}
```

Error Responses:
- `400` — No file received
- `413` — File too large
- `422` — Invalid file type / magic bytes

---

**`GET /api/upload/:sessionId/source.gif`**

Retrieve a previously uploaded GIF.

- **Params**: `sessionId` — UUID v4
- **Headers**: `Content-Type: image/gif`, `Cache-Control: private, max-age=1800`

Success: `200 image/gif`

Errors:
- `400` — Invalid sessionId format (not UUID)
- `404` — Session not found / expired

---

**`DELETE /api/upload/:sessionId`**

Explicitly delete a session and all its files.

Success Response `200`:
```json
{ "success": true, "sessionId": "..." }
```

---

### Export Routes

**`POST /api/export/prepare`**

Submit ASCII frames and metadata; returns download URLs.

Request Body:
```json
{
  "frames": [
    { "ascii": "@@##..", "delay": 100 },
    { "ascii": "##@@..", "delay": 100 }
  ],
  "meta": {
    "gifName": "cat.gif",
    "asciiWidth": 80,
    "asciiHeight": 30,
    "densityPreset": "standard",
    "mode": "grayscale",
    "fps": 12
  }
}
```

Success Response `201`:
```json
{
  "exportSessionId": "...",
  "playbackCommand": "chmod +x play_ascii.sh && ./play_ascii.sh",
  "files": {
    "txt":  "/api/export/.../animation.txt",
    "json": "/api/export/.../animation.json",
    "sh":   "/api/export/.../play_ascii.sh"
  }
}
```

Validation errors:
- `400` — No frames / too many frames (> 500) / invalid frame structure

---

**`GET /api/export/:exportSessionId/:filename`**

Download a specific export file.

- **filename**: one of `animation.txt`, `animation.json`, `play_ascii.sh`
- Response includes `Content-Disposition: attachment` header

Errors:
- `400` — Invalid session ID or disallowed filename
- `404` — Export file not found / session expired

---

### System Routes

**`GET /api/health`**

Server health check.

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

## Module Reference

### `server.js`

Entry point. Initializes Express, wires middleware and routes, starts the cleanup interval, and calls `listen()`.

**Key constants:**
- `UPLOAD_TTL_MS = 30 * 60 * 1000` — Session lifetime
- `CLEANUP_INTERVAL_MS = 10 * 60 * 1000` — Cleanup frequency
- `UPLOADS_DIR = ./uploads` — Storage root

---

### `src/routes/uploadRoutes.js`

Configures multer with:
- `dest: os.tmpdir()` — Initial staging in OS temp (avoids filling uploads dir with invalid files)
- `limits.fileSize` — Hard limit before touching disk
- `fileFilter` — MIME check before disk write

Routes:
- `POST /` → `handleUpload`
- `GET /:sessionId/source.gif` → `serveUploadedGIF`
- `DELETE /:sessionId` → `deleteSession`

---

### `src/routes/exportRoutes.js`

Routes:
- `POST /prepare` → `prepareExport`
- `GET /:exportSessionId/:filename` → `downloadExportFile`

---

### `src/controllers/uploadController.js`

**`handleUpload(req, res, next)`**

1. Check `req.file` exists
2. Validate MIME type (allow-list)
3. Validate file extension
4. Validate file size
5. Read first 6 bytes and check magic bytes (GIF87a / GIF89a)
6. Generate UUID sessionId
7. Create session directory
8. `fs.renameSync` temp file → `source.gif`
9. Write `meta.json`
10. Return `201` with session info

**`serveUploadedGIF(req, res, next)`**

Validates UUID format to prevent path traversal, then `res.sendFile`.

**`deleteSession(req, res, next)`**

Validates UUID, calls `deleteSession` utility, returns `200`.

---

### `src/controllers/exportController.js`

**`prepareExport(req, res, next)`**

1. Validate `frames` array (non-empty, max 500, sample structure check)
2. Generate UUID exportSessionId
3. Create session directory
4. Call three service functions to generate content
5. Write all three files
6. Return `201` with file URLs

**`downloadExportFile(req, res, next)`**

Whitelists `filename` against allowed names to prevent traversal.
Sets appropriate `Content-Type` and `Content-Disposition` headers.

---

### `src/services/exportService.js`

Pure functions that take `frames[]` and `meta{}` and return string content:

| Function | Returns |
|---|---|
| `generateTXTExport(frames, meta)` | Plain-text animation file with frame separators |
| `generateJSONExport(frames, meta)` | Stringified JSON with version, meta, frames |
| `generateFrameFiles(frames)` | Array of `{ filename, content }` for zip use |
| `generateBashScript(frames, meta)` | Full self-contained bash script |
| `generatePlaybackCommand(scriptName)` | One-liner clipboard command |

---

### `src/utils/fileUtils.js`

| Function | Description |
|---|---|
| `validateGIFMagicBytes(filePath)` | Opens file, reads 6 bytes, checks GIF87a/GIF89a |
| `createSessionDir(uploadsDir, id)` | `mkdirSync` + returns path |
| `writeSessionMeta(sessionDir, meta)` | JSON.stringify to `meta.json` |
| `readSessionMeta(uploadsDir, id)` | Returns parsed meta or null |
| `deleteSession(uploadsDir, id)` | `fs.rmSync` recursive |
| `sessionFilePath(uploadsDir, id, name)` | Builds absolute path |
| `formatFileSize(bytes)` | Human-readable size string |

---

### `src/utils/scriptGenerator.js`

**`generatePlaybackScript(frames, options)`**

Generates a self-contained bash script with frames embedded as bash variables using `$'...'` ANSI-C quoting. Supports:
- `[fps]` argument to override speed
- `[loops]` argument to limit loop count
- Proper cleanup on Ctrl+C (trap handler)
- Cursor hiding/restoring
- Color output with `\033[32m` (green)
- Dependency check for `bc`

---

## Session Management

Sessions are UUID v4 directories under `./uploads/`:

```
uploads/
├── 550e8400-e29b-41d4-a716-446655440000/
│   ├── meta.json
│   └── source.gif
└── 7c9e6679-7425-40de-944b-e07fc1f90ae7/
    ├── meta.json
    ├── animation.txt
    ├── animation.json
    └── play_ascii.sh
```

**Lifecycle:**

1. Created on POST /api/upload or POST /api/export/prepare
2. Served on demand via GET routes
3. Expired automatically by cleanup job (30-minute TTL based on mtime)
4. Optionally deleted explicitly via DELETE /api/upload/:id

**Why file system over in-memory?**

- No memory pressure from large GIF files
- Survives process restarts (uploads persist across `nodemon` reloads)
- Download links remain valid within the TTL window
- Easy to inspect for debugging

---

## Security Model

| Threat | Mitigation |
|---|---|
| Malicious file with .gif extension | Magic bytes validation (reads first 6 bytes) |
| Path traversal via sessionId | Regex validation `^[0-9a-f-]{36}$` before any path join |
| Path traversal via filename | Strict allowlist: only 3 filenames accepted |
| Oversized upload | multer `limits.fileSize` + controller double-check |
| Upload field spoofing | multer `fileFilter` rejects non-GIF MIME types |
| Disk exhaustion | 30-min session TTL + cleanup job |
| Large frame payloads | 500-frame limit on export requests |
| Unexpected multer fields | Returns 400 via global error handler |

---

## Debugging Guide

### Enable Verbose Logging

Request logging is active when `NODE_ENV !== 'production'`. To see all requests:

```bash
node server.js          # logging enabled
NODE_ENV=production node server.js  # logging disabled
```

### Inspect Sessions

```bash
ls -la uploads/
cat uploads/<sessionId>/meta.json
```

### Test Upload Endpoint Manually

```bash
curl -F "gif=@/path/to/test.gif" http://localhost:3000/api/upload
```

### Test Export Endpoint

```bash
curl -X POST http://localhost:3000/api/export/prepare \
  -H "Content-Type: application/json" \
  -d '{"frames":[{"ascii":"hello world","delay":100}],"meta":{"gifName":"test.gif","asciiWidth":11}}'
```

### Common Debug Commands

```bash
# Check if server is running
curl http://localhost:3000/api/health

# Watch uploads directory in real time
watch -n 1 'ls -la uploads/'

# Check process memory usage
node -e "setInterval(() => console.log(process.memoryUsage()), 5000)" &
```

### Diagnose gifuct-js Errors

If the browser console shows gifuct-js errors:
1. Open DevTools → Console
2. Check for `gifuct is not defined` → CDN load failure (check network)
3. Check for `No frames found` → GIF has no animation (try a different file)
4. Check for `magic bytes mismatch` → file is not actually a GIF

---

## Common Errors

### `Error: ENOENT: no such file or directory, open './uploads/...'`

**Cause:** The `uploads/` directory was deleted manually.

**Fix:** 
```bash
mkdir -p uploads
# Or restart the server (it auto-creates the directory on startup)
```

---

### `Error: LIMIT_FILE_SIZE`

**Cause:** Uploaded file exceeds 15 MB limit.

**Fix:** Either reduce the file size or increase `MAX_FILE_SIZE` in both `uploadRoutes.js` (multer limit) and `uploadController.js` (validation check). Also increase `express.json({ limit: ... })` if exporting large frame sets.

---

### `Error: gifuct-js library not loaded`

**Cause:** Browser can't load the gifuct-js CDN script.

**Fix:** Bundle the library locally:
```bash
npm install gifuct-js
cp node_modules/gifuct-js/dist/gifuct-js.js public/js/vendor/
```
Then update the `<script src>` in `index.html`.

---

### `Error: No frames found in GIF`

**Cause:** Static (non-animated) GIF, or corrupted file.

**Fix:** Try a different GIF. Verify the file is animated.

---

### `413 Request Entity Too Large` on export

**Cause:** Large ASCII frame payload exceeds Express JSON body limit.

**Fix:** Increase the limit in `server.js`:
```js
app.use(express.json({ limit: '100mb' }));
```

---

### Upload hangs at 100% (server not responding)

**Cause:** Usually the magic-bytes validation reading a corrupted file.

**Fix:** Add a timeout to the validation. Check the console for error stack traces.

---

## Performance Tips

### Frame Count Limits

Very long GIFs (100+ frames at high resolution) create large payloads:
- A 100-frame, 120-col GIF generates ~100KB of ASCII text
- A 500-frame export sends ~500KB JSON to the server

For users experiencing slowness, recommend Medium (80 col) resolution.

### Conversion Speed

The conversion runs in the browser on the main thread (with `setTimeout` yields every 5 frames). For very long GIFs, consider:
- Moving conversion to a Web Worker (see Future Scalability)
- Adding a frame count warning UI

### Upload Performance

Files are staged in `os.tmpdir()` first, then `fs.renameSync()` to the session dir. On the same filesystem this is atomic and near-instant. On some configurations (Docker volumes, cross-device mounts) `rename` may fail — fall back to `fs.copyFileSync` + `fs.unlinkSync`.

### Server Export Payload

The export POST sends the full ASCII frame data. For 120-col GIFs with many frames, this can be several hundred KB. The server processes this synchronously. For high-concurrency scenarios, move generation to a worker thread.

### File Cleanup

The default 30-min TTL is conservative. In production, reduce to 10–15 minutes if disk space is limited. The cleanup job uses `stat.mtimeMs` which reflects the last modification time — freshly created sessions start the clock immediately.

---

## Future Scalability

### Web Worker Conversion

Move `converter.js` to a Web Worker to eliminate main-thread blocking:

```js
// worker.js
import { GIFConverter } from './converter.js';
self.onmessage = async (e) => {
  const { buffer, options } = e.data;
  const conv = new GIFConverter();
  conv.loadFromBuffer(buffer);
  const frames = await conv.convertToASCII({
    ...options,
    onProgress: (f) => self.postMessage({ type: 'progress', value: f }),
  });
  self.postMessage({ type: 'done', frames });
};
```

### Database-backed Sessions

Replace the file-system session model with a database (SQLite, PostgreSQL) for:
- Faster session lookup
- Cross-process session sharing (multiple server instances)
- Better monitoring and analytics

### S3/Object Storage

Replace `./uploads/` with S3 (or compatible) storage:
- No local disk dependency
- Works behind load balancers
- Built-in TTL via S3 lifecycle policies
- CDN-accelerated file downloads

### Rate Limiting

Add `express-rate-limit` to protect upload and export endpoints:

```js
const rateLimit = require('express-rate-limit');
app.use('/api/upload', rateLimit({ windowMs: 60_000, max: 10 }));
app.use('/api/export', rateLimit({ windowMs: 60_000, max: 20 }));
```

### Authentication

For a multi-user deployment:
- Add JWT or session-cookie authentication
- Scope sessions to authenticated users
- Restrict export access to the session owner

### WebSocket Progress

Replace the polling-based conversion progress (which is client-side only) with WebSocket push:
- Server-side conversion in a worker thread
- Real-time progress over WebSocket
- Better UX for slow devices

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p uploads
EXPOSE 3000
CMD ["node", "server.js"]
```

### Horizontal Scaling

For multiple instances behind a load balancer:
1. Move session storage to S3 or a shared volume
2. Move cleanup job to a dedicated cron service
3. Add sticky sessions or a distributed cache for session metadata
