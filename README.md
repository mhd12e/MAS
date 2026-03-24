# Mobile Agent Studio

AI-powered phone automation. Create virtual Android phones and control them with natural language.

## Prerequisites

You need all of the following installed before setup:

### Android Studio + SDK

Download from [developer.android.com/studio](https://developer.android.com/studio). During installation, make sure to include:
- Android SDK
- Android Emulator
- Android SDK Platform-Tools

After installation, the SDK is typically at:
- **Linux:** `~/Android/Sdk`
- **macOS:** `~/Library/Android/sdk`

Verify with:
```bash
ls ~/Android/Sdk/emulator/emulator   # should exist
adb --version                         # should print a version
```

### Base AVD (Virtual Device)

Open Android Studio → Device Manager → **Create Virtual Device**:
1. Pick any phone profile (e.g. Pixel 9 Pro XL)
2. Download and select a system image (e.g. API 35)
3. Name it `Pixel_9_Pro_XL` (or whatever you set in `.env`)
4. Finish — don't need to start it

Your AVD files will be at:
- **Linux (standard):** `~/.android/avd/`
- **Linux (Android Studio flatpak):** `~/.var/app/com.google.AndroidStudio/config/.android/avd/`
- **macOS:** `~/.android/avd/`

### Node.js 18+ and pnpm

```bash
# Install Node.js via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc   # or ~/.zshrc
nvm install --lts

# Enable pnpm via corepack
corepack enable pnpm
```

### Python 3.11-3.13

```bash
# Fedora
sudo dnf install -y python3.13 python3.13-venv

# Ubuntu / Debian
sudo apt install -y python3 python3-venv
```

### System packages

```bash
# Fedora
sudo dnf install -y xorg-x11-server-Xvfb x11vnc novnc python3-websockify xdotool ffmpeg tmux

# Ubuntu / Debian
sudo apt install -y xvfb x11vnc novnc websockify xdotool ffmpeg tmux
```

### Anthropic API Key

Get one at [console.anthropic.com](https://console.anthropic.com/). The agent uses Claude Sonnet for reasoning.

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
```

### Configure `.env`

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your values:

```env
# Required — get from https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Path to Android SDK — find with: echo $ANDROID_HOME or check ~/Android/Sdk
ANDROID_SDK_ROOT=/home/you/Android/Sdk

# Path to AVD directory — find with: ls ~/.android/avd/ or check Android Studio settings
ANDROID_AVD_HOME=/home/you/.android/avd

# Name of the base AVD to clone — must match exactly what you created in Android Studio
BASE_AVD_NAME=Pixel_9_Pro_XL
```

**How to find your paths:**

| Variable | How to find it |
|----------|---------------|
| `ANDROID_SDK_ROOT` | Run `echo $ANDROID_HOME` or `echo $ANDROID_SDK_ROOT`, or check `~/Android/Sdk` |
| `ANDROID_AVD_HOME` | Run `ls ~/.android/avd/` — you should see `YourAVD.avd/` and `YourAVD.ini` |
| `BASE_AVD_NAME` | The folder name without `.avd` — e.g. if you see `Pixel_9_Pro_XL.avd/`, use `Pixel_9_Pro_XL` |

> **Flatpak Android Studio?** Your AVD path is likely `~/.var/app/com.google.AndroidStudio/config/.android/avd/`

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
