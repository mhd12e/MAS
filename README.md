# Mobile Agent Studio

AI-powered phone automation. Create virtual Android phones and control them with natural language.

## Prerequisites

- Android SDK with emulator (`~/Android/Sdk`)
- A base AVD created in Android Studio (default: `Pixel_9_Pro_XL`)
- Node.js 18+ and pnpm
- Python 3.11-3.13 with venv
- System packages:
  ```bash
  # Fedora
  sudo dnf install -y xorg-x11-server-Xvfb x11vnc novnc python3-websockify xdotool ffmpeg

  # Ubuntu / Debian
  sudo apt install -y xvfb x11vnc novnc websockify xdotool ffmpeg
  ```

## Setup

```bash
git clone https://github.com/mhd12e/MAS.git agent-mobiles
cd agent-mobiles

# Backend
cd backend && pnpm install
cd python && python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../..

# Frontend
cd frontend && pnpm install
cd ..

# Configure
cp backend/.env.example backend/.env
# Edit backend/.env — set ANTHROPIC_API_KEY and verify SDK paths
```

## Run

```bash
./start.sh
```

That's it. This starts everything in a single tmux session:

| Pane | Service | URL |
|------|---------|-----|
| Left | Backend (NestJS + FastAPI) | `http://localhost:3000` |
| Top-right | Frontend (Vite) | `http://localhost:5173` |
| Bottom-right | Docs (Docsify) | `http://localhost:3001` |

Open **http://localhost:5173** to get started.

> **tmux tips:** `Ctrl+B` then arrow keys to switch panes. `Ctrl+B` then `Z` to zoom a pane. Closing any pane kills everything.

## Architecture

```
Frontend (Vite :5173)
  └── Dashboard + Phone Workspace: noVNC live screen + AI chat

Backend (NestJS :3000)
  ├── EmulatorService: AVD cloning, Xvfb + emulator + x11vnc + websockify
  ├── PythonService: manages FastAPI lifecycle
  ├── DroidRunService: SSE proxy to FastAPI, event buffering
  ├── RecordingService: ffmpeg screen capture per agent task
  ├── AuthService: JWT + API key authentication
  └── DbService: in-memory state + atomic db.json persistence

FastAPI (Python :8001, internal)
  └── DroidRun SDK: agent execution with Claude Sonnet, log-based streaming
```

## Features

- Create/remove virtual phones with one click
- Live phone screen via noVNC
- AI agent control via natural language prompts
- Real-time chain-of-thought streaming (SSE)
- Synchronous API for scripts and batch jobs
- Automatic screen recording per task
- JWT + API key authentication
- Process supervision with auto-restart
- View-only mode during agent execution
- Full REST API with Swagger docs at `/api/v1`
- Comprehensive documentation with mermaid diagrams

## API

Full docs at `http://localhost:3001` after running `./start.sh`, or see the `docs/` directory.

## License

MIT
