# Architecture

## System Overview

```mermaid
graph TD
    Browser["Browser :5173"] -->|"REST + SSE"| NestJS["NestJS Backend :3000"]
    NestJS -->|"HTTP + SSE proxy"| FastAPI["FastAPI Python :8001"]
    FastAPI -->|"DroidRun SDK"| Agent["AI Agent"]
    Agent -->|"ADB commands"| Emulator["Android Emulator"]
    NestJS -->|"spawn + manage"| XVFB["Xvfb + x11vnc + websockify"]
    NestJS -->|"spawn ffmpeg"| Recording["Screen Recording"]
    NestJS -->|"atomic read/write"| DB["db.json"]
    Browser -->|"WebSocket"| XVFB

    style Browser fill:#9b2c2c,stroke:#fc8181,color:#fff
    style NestJS fill:#276749,stroke:#68d391,color:#fff
    style FastAPI fill:#2b6cb0,stroke:#63b3ed,color:#fff
    style Agent fill:#553c9a,stroke:#9f7aea,color:#fff
    style Emulator fill:#4a5568,stroke:#a0aec0,color:#fff
```

### Request flow

```mermaid
graph LR
    subgraph "Frontend :5173"
        DASHBOARD[Dashboard]
        WORKSPACE[Phone Workspace]
    end

    subgraph "Backend :3000"
        API[REST API]
        SSE_PROXY[SSE Proxy]
        EMU_SVC[EmulatorService]
        REC_SVC[RecordingService]
        DB_SVC[DbService]
    end

    subgraph "Python :8001"
        FASTAPI_SVC[FastAPI]
        AGENT_THREAD[Agent Thread]
    end

    DASHBOARD -->|"GET /phones"| API
    WORKSPACE -->|"POST /agent/run"| SSE_PROXY
    SSE_PROXY -->|"POST /run"| FASTAPI_SVC
    FASTAPI_SVC --> AGENT_THREAD
    API --> EMU_SVC
    API --> DB_SVC
    SSE_PROXY --> REC_SVC
```

---

## Components

### NestJS Backend (`:3000`)

The main API server, organized into modules:

```mermaid
graph TD
    subgraph "NestJS Modules"
        APP[AppModule]
        APP --> AUTH[AuthModule]
        APP --> EMU[EmulatorModule]
        APP --> DROID[DroidrunModule]
        APP --> PY[PythonModule]
        APP --> REC[RecordingModule]
        APP --> DB_MOD[DbModule]
    end

    AUTH -->|"JWT + API keys"| DB_MOD
    EMU -->|"phone CRUD"| DB_MOD
    DROID -->|"agent proxy"| PY
    DROID -->|"start/stop"| REC
    REC -->|"recording CRUD"| DB_MOD
```

| Module | Responsibility |
|--------|---------------|
| **AuthModule** | JWT tokens, API keys, bcrypt hashing, global guard |
| **EmulatorModule** | Phone lifecycle — AVD cloning, 4 child processes, port allocation |
| **DroidrunModule** | SSE proxy to FastAPI, event buffering, reconnection |
| **PythonModule** | Spawns + monitors FastAPI process, health checks |
| **RecordingModule** | ffmpeg screen capture, video serving, orphan cleanup |
| **DbModule** | In-memory state + atomic file persistence |

### FastAPI Python Service (`:8001`)

Spawned by NestJS on startup. Wraps the DroidRun SDK:

```mermaid
graph TD
    FASTAPI[FastAPI Server] --> ENDPOINT["/run endpoint"]
    ENDPOINT --> THREAD["New Thread"]
    THREAD --> LOOP["New Event Loop"]
    LOOP --> AGENT["DroidAgent.run()"]
    AGENT --> LOG_CAPTURE["LogCapture Handler"]
    LOG_CAPTURE --> PARSE["parse_log_line()"]
    PARSE --> QUEUE["Thread-safe Queue"]
    QUEUE --> SSE_GEN["SSE Generator"]
    SSE_GEN --> RESPONSE["StreamingResponse"]

    style THREAD fill:#553c9a,stroke:#9f7aea,color:#fff
    style QUEUE fill:#8BB888,stroke:#6a9966,color:#111
```

Key design: the agent runs in a **separate thread** with its own `asyncio` event loop. This avoids blocking FastAPI's ASGI loop. Communication happens via a thread-safe `queue.Queue`.

### Frontend (`:5173`)

React + Vite + Tailwind + shadcn/ui:

- **Dashboard** — phone grid with live noVNC previews, playback gallery
- **Phone workspace** — 3-column layout (phone screen | task list | chat)
- **Auth** — login/register, API key management

### Docsify Docs (`:3001`)

This documentation site — static HTML served via Python's built-in HTTP server.

---

## Data Flow

### Creating a phone

```mermaid
sequenceDiagram
    participant C as Client
    participant N as NestJS
    participant FS as Filesystem
    participant ADB as ADB

    C->>N: POST /phones
    N->>N: allocateSlot() — pick free slot 0-5
    N->>FS: cp -r base.avd → phone-N.avd
    N->>FS: Create phone-N.ini
    N-->>C: { id, status: "booting" }

    Note over N: Async boot process
    N->>N: spawn Xvfb :N
    N->>N: spawn emulator -avd phone-N
    N->>N: xdotool — resize window
    N->>N: spawn x11vnc
    N->>N: spawn websockify

    loop Every 2s
        N->>ADB: getprop sys.boot_completed
    end
    ADB-->>N: "1"
    N->>N: status = "ready"
```

### Running an agent task

```mermaid
sequenceDiagram
    participant C as Client
    participant N as NestJS
    participant F as FastAPI
    participant A as Agent
    participant P as Phone

    C->>N: POST /agent/run { prompt }
    N->>N: Start ffmpeg recording
    N->>F: POST /run { device, prompt }
    F->>A: Spawn in new thread

    loop ReAct loop (max 50 steps)
        A->>P: ADB: screenshot
        P-->>A: screenshot.png
        A->>A: Send to Claude → get action
        A->>P: ADB: tap/type/swipe
        F-->>N: SSE event
        N-->>C: SSE event
    end

    A-->>F: Task complete
    F-->>N: SSE: done
    N->>N: Stop recording, save to db
    N-->>C: SSE: done
```

### Persistence

All state lives in `data/db.json`. The `DbService` holds everything in memory and atomically writes to disk on every mutation:

```mermaid
graph LR
    MUTATION["create/update/delete"] --> MEMORY["In-memory state"]
    MEMORY -->|"writeFileSync"| TMP["db.json.tmp"]
    TMP -->|"renameSync (atomic)"| FILE["db.json"]

    style MEMORY fill:#8BB888,stroke:#6a9966,color:#111
    style FILE fill:#2b6cb0,stroke:#63b3ed,color:#fff
```

### Data model

```mermaid
erDiagram
    USER ||--o{ API_KEY : owns
    PHONE ||--o{ TASK : has
    PHONE ||--o{ RECORDING : has
    TASK ||--o{ MESSAGE : contains
    TASK ||--o{ RECORDING : produces
    MESSAGE ||--o{ STEP : contains

    USER {
        string id
        string email
        string passwordHash
    }
    API_KEY {
        string id
        string name
        string keyHash
        string prefix
    }
    PHONE {
        string id
        string name
    }
    TASK {
        string id
        string title
        boolean pinned
    }
    MESSAGE {
        string id
        string role
        string content
    }
    STEP {
        string type
        string step
    }
    RECORDING {
        string id
        string filename
        number durationSecs
        string status
    }
```

---

## Port Allocation

Each phone gets a unique set of ports based on its slot index (0-5):

```mermaid
graph LR
    SLOT["Slot N (0-5)"] --> D[":11+N — Xvfb display"]
    SLOT --> A["5556+N×2 — ADB port"]
    SLOT --> V["5901+N — VNC port"]
    SLOT --> W["6081+N — noVNC port"]
```

| Resource | Formula | Slot 0 | Slot 1 | Slot 2 |
|----------|---------|--------|--------|--------|
| Xvfb display | `:11 + slot` | `:11` | `:12` | `:13` |
| ADB port | `5556 + slot × 2` | `5556` | `5558` | `5560` |
| VNC port | `5901 + slot` | `5901` | `5902` | `5903` |
| noVNC port | `6081 + slot` | `6081` | `6082` | `6083` |

Maximum 6 concurrent phones. Slots are reused when phones are deleted.

---

## Process Tree

Each phone spawns 4 managed child processes, each with a supervisor that auto-restarts up to 3 times:

```mermaid
graph TD
    NEST[NestJS] --> PY_PROC[FastAPI Python :8001]

    NEST --> PHONE1[Phone 1 - Slot 0]
    NEST --> PHONE2[Phone 2 - Slot 1]

    PHONE1 --> XVFB1["Xvfb :11"]
    PHONE1 --> EMU1["emulator -port 5556"]
    PHONE1 --> VNC1["x11vnc -rfbport 5901"]
    PHONE1 --> WS1["websockify 6081"]
    PHONE1 -.->|"during agent run"| FF1["ffmpeg x11grab :11"]

    PHONE2 --> XVFB2["Xvfb :12"]
    PHONE2 --> EMU2["emulator -port 5558"]
    PHONE2 --> VNC2["x11vnc -rfbport 5902"]
    PHONE2 --> WS2["websockify 6082"]

    style NEST fill:#276749,stroke:#68d391,color:#fff
    style PY_PROC fill:#2b6cb0,stroke:#63b3ed,color:#fff
```
