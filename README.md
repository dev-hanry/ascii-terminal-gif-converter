# ASCII Terminal GIF Converter

> Convert animated GIFs into terminal-style ASCII animations, preview them in the browser, and export them for real terminal playback.

![Version 1.0.0](https://img.shields.io/badge/version-1.0.0-00ff41?style=flat-square&labelColor=000000)
![Node.js 16+](https://img.shields.io/badge/Node.js-16%2B-00ff41?style=flat-square&labelColor=000000)
![License MIT](https://img.shields.io/badge/license-MIT-00ff41?style=flat-square&labelColor=000000)

```text
  ╔═══════════════════════════════════════════╗
  ║   @@@@@  @@@@   @@@@  @  @  @@@@@        ║
  ║   @      @     @      @  @    @          ║
  ║   @@@@@  @@@@  @      @@@@    @          ║
  ║       @  @     @      @  @    @          ║
  ║   @@@@@  @@@@   @@@@  @  @    @          ║
  ╚═══════════════════════════════════════════╝
```

## Project status

**Finished for now — v1.0.0**

The current feature set is complete for the project's first release. The repository is kept as a finished project and may receive future improvements or fixes.

## What it does

ASCII Terminal GIF Converter is a full-stack web application that takes an animated GIF, decodes its frames in the browser, converts the frames into configurable ASCII art, and displays the result in a simulated terminal interface.

The converted animation can then be exported as:

- Plain text (`.txt`)
- Structured JSON (`.json`)
- A self-contained Bash playback script (`.sh`)

The backend uses Express for upload handling and server-side export preparation. Uploaded files are stored temporarily in session directories and automatically cleaned up after their TTL expires.

## Highlights

| Feature | Description |
|---|---|
| **GIF Upload** | Drag-and-drop or file picker with client/server validation, including GIF magic-byte checks and a 15 MB limit. |
| **Client-side Conversion** | GIF frames are decoded and converted to ASCII in the browser using `gifuct-js`. |
| **Terminal Preview** | CRT-inspired terminal UI with play, pause, restart, font sizing and animation controls. |
| **Render Modes** | Grayscale, inverted and colored output. |
| **ASCII Presets** | Standard, Detailed, Blocks, Simple, Binary and Minimal density mappings. |
| **Resolution Control** | Low, Medium, High and custom ASCII widths with terminal aspect-ratio correction. |
| **FPS Control** | Use native GIF timing or override playback speed. |
| **Loop Modes** | Loop, Once and Bounce. |
| **TXT Export** | Export all generated frames as plain text. |
| **JSON Export** | Export frame data and conversion metadata as structured JSON. |
| **Bash Export** | Generate a self-contained `play_ascii.sh` terminal player. |
| **Server Export** | Prepare server-side downloadable export files with temporary session URLs. |
| **Webcam ASCII** | Live webcam-to-ASCII conversion as a beta feature. |

## How it works

```text
             ┌──────────────┐
             │   GIF File   │
             └──────┬───────┘
                    │ upload
                    ▼
             ┌──────────────┐
             │    Express   │
             │    Backend   │
             └──────┬───────┘
                    │ session / source GIF
                    ▼
             ┌──────────────┐
             │    Browser   │
             │   gifuct-js  │
             └──────┬───────┘
                    │ decode + composite + scale
                    ▼
             ┌──────────────┐
             │ ASCII Engine │
             └──────┬───────┘
                    │
             ┌──────┴───────┐
             ▼              ▼
      ┌────────────┐  ┌─────────────┐
      │  Terminal  │  │   Exports   │
      │  Preview   │  │ TXT/JSON/SH │
      └────────────┘  └─────────────┘
```

### Conversion pipeline

1. The browser uploads the selected GIF to the Express backend.
2. The server validates the file and creates a temporary UUID-based session.
3. The browser retrieves the GIF and decodes its frames with `gifuct-js`.
4. GIF frame patches are composited onto a full-frame canvas, including disposal handling.
5. Each frame is scaled to the selected ASCII width and terminal character aspect ratio.
6. Pixel brightness is mapped to a selected ASCII density preset.
7. The renderer plays the generated frames in the terminal-style UI.
8. Client-side or server-side exporters generate downloadable output.

## Installation

### Prerequisites

- **Node.js** 16 or newer
- **npm** 7 or newer

### Run locally

```bash
git clone https://github.com/dev-hanry/ascii-terminal-gif-converter.git
cd ascii-terminal-gif-converter
npm install
npm start
```

Open **http://localhost:3000** in your browser.

For development with automatic server restarts:

```bash
npm run dev
```

### Configuration

The application currently uses these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | — | Set to `production` to disable development request logging. |

No environment file is required for the default local setup.

## Usage

### 1. Upload a GIF

Drop a GIF onto the upload area or use the file picker. The server accepts GIF files up to 15 MB and performs MIME, extension and magic-byte validation.

### 2. Configure conversion

Choose:

- ASCII resolution
- Density preset
- Render mode
- FPS behavior
- Loop mode
- Terminal font size

### 3. Convert and preview

Press **CONVERT GIF** to decode and render the animation. Playback can be controlled with the UI or keyboard shortcuts:

- `Space` — play/pause
- `R` — restart

### 4. Export

Available export formats include:

- **TXT** — plain-text frames
- **JSON** — frame data plus metadata
- **SH** — self-contained Bash playback script
- **Copy CMD** — copies the command used to make the Bash script executable and run it
- **Server Export** — creates temporary server-side download links

## Bash export

A generated `play_ascii.sh` file can be played directly from a compatible terminal:

```bash
chmod +x play_ascii.sh
./play_ascii.sh
./play_ascii.sh 20
./play_ascii.sh 15 3
```

The generated script is designed for Bash environments such as Linux, macOS and WSL. It uses `bash`, `bc` and `sleep` for playback timing.

## Project structure

```text
ascii-terminal-gif-converter/
│
├── server.js
│
├── src/
│   ├── routes/
│   │   ├── uploadRoutes.js
│   │   └── exportRoutes.js
│   ├── controllers/
│   │   ├── uploadController.js
│   │   └── exportController.js
│   ├── services/
│   │   └── exportService.js
│   └── utils/
│       ├── fileUtils.js
│       └── scriptGenerator.js
│
├── public/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── controls.js
│       ├── converter.js
│       ├── exporter.js
│       ├── renderer.js
│       ├── uploader.js
│       └── webcam.js
│
├── uploads/
│   └── .gitkeep
│
├── BACKEND_DOCS.md
├── package.json
├── .gitignore
├── LICENSE
└── README.md
```

## Dependencies

### Runtime

| Package | Purpose |
|---|---|
| `express` | HTTP server, middleware and static frontend serving |
| `multer` | Multipart GIF upload handling and file-size limits |
| `cors` | CORS middleware |
| `uuid` | UUID-based temporary session IDs |

### Frontend CDN

| Library | Purpose |
|---|---|
| `gifuct-js` 2.1.2 | Client-side GIF parsing and frame decompression |
| Google Fonts | JetBrains Mono and Share Tech Mono terminal typography |

### Development

| Package | Purpose |
|---|---|
| `nodemon` | Automatic server restart during development |

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/upload` | Upload and validate a GIF |
| `GET` | `/api/upload/:sessionId/source.gif` | Retrieve a temporary uploaded GIF |
| `DELETE` | `/api/upload/:sessionId` | Delete an upload session |
| `POST` | `/api/export/prepare` | Generate server-side TXT, JSON and Bash exports |
| `GET` | `/api/export/:exportSessionId/:filename` | Download a generated export |
| `GET` | `/api/health` | Server health check |

For request/response details, module behavior, session lifecycle and backend security notes, see **[BACKEND_DOCS.md](BACKEND_DOCS.md)**.

## Temporary storage and cleanup

Uploaded GIFs and server-generated exports are stored under `uploads/` in temporary UUID-based session directories.

- Upload sessions expire after approximately 30 minutes.
- Cleanup runs periodically in the server process.
- `uploads/` is ignored by Git except for `.gitkeep`.
- The repository therefore contains no user-uploaded GIFs or generated session artifacts.

## Security considerations

The backend includes several basic defensive measures:

- GIF MIME-type and extension allow-listing
- GIF magic-byte validation (`GIF87a` / `GIF89a`)
- 15 MB upload limit
- UUID validation for session paths
- Filename allow-listing for export downloads
- Temporary session cleanup
- Frame-count validation for server export requests

This is a portfolio project, not a hardened production file-processing service. Additional rate limiting, authentication, resource quotas and stronger isolation would be appropriate before exposing it to untrusted high-volume traffic.

## Known scope / limitations

- There is currently **no hosted demo**.
- Conversion happens primarily in the browser, so very large or complex GIFs can still consume significant client CPU/memory.
- Server-side export sessions are temporary.
- Webcam ASCII mode is still marked **BETA**.
- The project does not currently include automated tests or a CI workflow.

## Documentation

- **[Backend Documentation](BACKEND_DOCS.md)** — architecture, routes, modules, session management, security model and debugging reference.

## Contributing

The current release is considered finished for now. Suggestions, bug reports and pull requests are still welcome.

## License

MIT License — see [LICENSE](LICENSE).

Copyright © 2026 **Laxmikant Patidar**.

## Author

**Dev-Hanry** — Laxmikant Patidar
