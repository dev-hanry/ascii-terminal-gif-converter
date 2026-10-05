# ASCII Terminal GIF Converter

> Convert any GIF into terminal-style ASCII animation — preview in-browser, export for real terminal playback.

![ASCII Terminal GIF Converter](https://img.shields.io/badge/version-1.0.0-00ff41?style=flat-square&labelColor=000000)
![Node.js](https://img.shields.io/badge/Node.js-16%2B-00ff41?style=flat-square&labelColor=000000)
![License](https://img.shields.io/badge/license-MIT-00ff41?style=flat-square&labelColor=000000)

```
  ╔═══════════════════════════════════════════╗
  ║   @@@@@  @@@@   @@@@  @  @  @@@@@        ║
  ║   @      @     @      @  @    @          ║
  ║   @@@@@  @@@@  @      @@@@    @          ║
  ║       @  @     @      @  @    @          ║
  ║   @@@@@  @@@@   @@@@  @  @    @          ║
  ╚═══════════════════════════════════════════╝
```

## Overview

**ASCII Terminal GIF Converter** is a full-stack web application that decodes any animated GIF, converts every frame to ASCII art using configurable density mappings, and lets you preview the animation inside a simulated terminal — then export it as a self-contained bash script, plain-text file, or JSON data package.

Built for developer portfolios and command-line enthusiasts. Every export is immediately runnable in Linux, macOS, or WSL.

---

## Features

| Feature | Description |
|---|---|
| **GIF Upload** | Drag-and-drop or browse. Client-side + server-side validation (magic bytes, MIME, size). |
| **ASCII Conversion** | gifuct-js decodes frames client-side. Configurable density presets, resolution, aspect-ratio correction. |
| **Terminal Preview** | Phosphor-green terminal UI with CRT effects. requestAnimationFrame renderer. Play / Pause / Restart. |
| **Render Modes** | Grayscale, Inverted, Colored (HSL-based per-character colorization). |
| **Density Presets** | Standard, Detailed, Blocks, Simple, Binary, Minimal — or define your own. |
| **Resolution Scaling** | Low (40), Medium (80), High (120), or Custom column width with automatic aspect-ratio correction. |
| **FPS Control** | Override or use native GIF frame timing. FPS slider (1–60). |
| **Loop Modes** | Loop, Once, Bounce. |
| **Export — TXT** | All frames as a plain-text file with separators. |
| **Export — JSON** | Structured frame data with metadata. Re-importable. |
| **Export — Bash** | Self-contained `play_ascii.sh` script. Runs offline. |
| **Copy Command** | One-click clipboard copy of the terminal play command. |
| **Server Export** | Server-side export session with stable download links. |
| **Webcam ASCII** | Live camera feed converted to ASCII in real time (BETA). |

---

## Installation

### Prerequisites

- **Node.js** ≥ 16.0.0
- **npm** ≥ 7.0.0

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/yourname/ascii-terminal-gif-converter.git
cd ascii-terminal-gif-converter

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

The application will be available at **http://localhost:3000**.

For development with auto-restart on file changes:

```bash
npm run dev   # requires nodemon (included in devDependencies)
```

---

## Usage Workflow

```
Upload GIF ──→ Configure Settings ──→ Convert ──→ Preview ──→ Export
```

### Step-by-step

1. **Upload a GIF**
   - Drag and drop a `.gif` file onto the upload zone
   - Or click "browse files" and select from your filesystem
   - The GIF is validated client-side (magic bytes, MIME, size limit) and uploaded to the server

2. **Configure Conversion Settings** (right panel)
   - Choose **Resolution**: Low (40 cols), Medium (80), High (120), or Custom
   - Choose **Density Preset**: affects which ASCII characters are used
   - Choose **Render Mode**: Grayscale, Inverted, or Colored

3. **Convert**
   - Click **CONVERT GIF** — a progress bar tracks frame-by-frame processing
   - Frames are decoded and converted entirely in the browser (no server round-trip for conversion)

4. **Preview**
   - The ASCII animation plays automatically in the terminal preview window
   - Use **PLAY / PAUSE / RESTART** buttons, or keyboard shortcuts:
     - `Space` — Toggle play/pause
     - `R` — Restart

5. **Adjust in real time**
   - Drag the **FPS** slider to speed up/slow down
   - Drag the **FONT** slider to change character size
   - Toggle **Override FPS** to ignore native GIF timing
   - Switch **Loop Mode**: Loop / Once / Bounce

6. **Export**
   - `TXT` — Download all frames as a plain-text animation file
   - `JSON` — Download structured JSON frame data
   - `.SH` — Download a self-contained bash playback script
   - `Copy CMD` — Copy `chmod +x play_ascii.sh && ./play_ascii.sh` to clipboard
   - **Prepare Server Export** — Generate stable server-side download links

---

## Running the Bash Export

After exporting `play_ascii.sh`:

```bash
chmod +x play_ascii.sh
./play_ascii.sh               # default speed
./play_ascii.sh 20            # 20 FPS override
./play_ascii.sh 15 3          # 15 FPS, loop 3 times then stop
```

Compatible with:
- **Linux** (bash 3.2+)
- **macOS** (bash 3.2+ or zsh)
- **WSL** (Windows Subsystem for Linux)

Requirements: `bash`, `bc`, `sleep` (all present by default on macOS/Linux/WSL)

---

## Project Structure

```
ascii-terminal-gif-converter/
│
├── server.js                    # Express entry point, middleware, cleanup job
│
├── src/
│   ├── routes/
│   │   ├── uploadRoutes.js      # POST /api/upload, GET /api/upload/:id/source.gif
│   │   └── exportRoutes.js      # POST /api/export/prepare, GET /api/export/:id/:file
│   │
│   ├── controllers/
│   │   ├── uploadController.js  # File validation, session creation, file serving
│   │   └── exportController.js  # Export generation, download serving
│   │
│   ├── services/
│   │   └── exportService.js     # TXT, JSON, Bash export content generators
│   │
│   └── utils/
│       ├── fileUtils.js         # Magic bytes validation, session dir helpers
│       └── scriptGenerator.js   # Bash script template engine
│
├── public/
│   ├── index.html               # Single-page app shell
│   ├── css/
│   │   └── style.css            # Terminal hacker theme, responsive layout
│   └── js/
│       ├── app.js               # Main orchestrator (ES module)
│       ├── converter.js         # GIF decode + ASCII conversion engine
│       ├── renderer.js          # requestAnimationFrame terminal renderer
│       ├── uploader.js          # Drag-drop, XHR upload with progress
│       ├── controls.js          # UI controls binding and state
│       ├── exporter.js          # Client-side export generators
│       └── webcam.js            # Live webcam ASCII (BETA)
│
├── uploads/                     # Temporary session storage (auto-cleaned every 30min)
│
├── package.json
├── .gitignore
├── README.md
└── BACKEND_DOCS.md
```

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.2 | HTTP server and routing |
| `multer` | ^1.4.5-lts.1 | Multipart file upload handling |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing headers |
| `uuid` | ^9.0.0 | Session ID generation |

### Frontend (CDN)

| Library | Version | Purpose |
|---|---|---|
| `gifuct-js` | 2.1.2 | Client-side GIF frame decoding and decompression |
| Google Fonts | — | JetBrains Mono + Share Tech Mono |

### Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `nodemon` | ^3.0.1 | Auto-restart server during development |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | — | Set to `production` to disable request logging |

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a GIF (multipart/form-data, field: `gif`) |
| `GET` | `/api/upload/:sessionId/source.gif` | Retrieve the uploaded GIF |
| `DELETE` | `/api/upload/:sessionId` | Delete a session |
| `POST` | `/api/export/prepare` | Submit ASCII frames, receive download links |
| `GET` | `/api/export/:exportSessionId/:filename` | Download export file |
| `GET` | `/api/health` | Server health check |

---

## Configuration

You can tune the following constants directly in the source:

| File | Constant | Default | Description |
|---|---|---|---|
| `server.js` | `UPLOAD_TTL_MS` | 30 min | Session expiry time |
| `server.js` | `CLEANUP_INTERVAL_MS` | 10 min | How often cleanup runs |
| `uploadController.js` | `MAX_FILE_SIZE` | 15 MB | Max upload size |
| `converter.js` | `CHAR_ASPECT_RATIO` | 0.45 | Height compression for terminal fonts |
| `converter.js` | `ASCII_PRESETS` | — | Add or modify density presets |

---

## Example ASCII Output

```
@@@@@@@@@@@@%%%%####****++++====----::::....    
@@@@@@@@%%%%####****++++====----::::....        
@@@@%%%%####****++++====----::::....            
%%%%####****++++====----::::....    @@@@@@@@@@  
####****++++====----::::....    @@@@@@@@@@@@@@  
****++++====----::::....    @@@@@@@@@@@@@@@@@@  
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Contributing

Pull requests welcome. For major changes, open an issue first to discuss.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request
