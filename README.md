# Mobile Agent Studio

AI-powered phone automation. Create virtual Android phones and control them with natural language.

## Prerequisites

- Android SDK with emulator (`~/Android/Sdk`)
- A base AVD created in Android Studio (default: `Pixel_9_Pro_XL`)
- Node.js 18+ and pnpm
- Python 3.11-3.13 with venv
- System packages:
  ```bash
  sudo dnf install -y xorg-x11-server-Xvfb x11vnc novnc python3-websockify xdotool
  ```

## Setup

```bash
# Backend
cd backend && pnpm install
cd python && python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../..

# Frontend
cd frontend && pnpm install
cd ..

# Configure
cp backend/.env.example backend/.env
# Edit backend/.env — set OPENAI_API_KEY and verify SDK paths
```

## Run

```bash
# Terminal 1
cd backend && pnpm start:dev

# Terminal 2
cd frontend && pnpm dev
```

Open **http://localhost:5173**

## Architecture

```
Frontend (Vite :5173)
  └── Phone Cards: noVNC iframe + AI activity panel

Backend (NestJS :3000)
  ├── EmulatorService: AVD cloning, Xvfb + emulator + x11vnc + websockify
  ├── PythonService: manages FastAPI lifecycle
  └── DroidRunService: proxies prompts to FastAPI

FastAPI (Python :8001, internal)
  └── DroidRun SDK: agent execution with log-based chain-of-thought streaming
```

## Features

- Create/remove virtual phones with one click
- Live phone screen via noVNC
- AI agent control via natural language prompts
- Real-time activity feed with chain-of-thought
- Process supervision with auto-restart (3 attempts)
- View-only mode during agent execution
- Per-phone logging in `logs/{phone-id}/`
- Phone rename support
- Prompt history and suggestions
