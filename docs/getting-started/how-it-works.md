# How It Works

A deep dive into what happens under the hood when you create phones, run tasks, and stream results.

---

## The Display Pipeline

Each virtual phone needs to render its Android screen to a browser. This requires a chain of four processes:

```mermaid
graph LR
    EMU[Android Emulator] -->|renders to| XVFB[Xvfb Virtual Display]
    XVFB -->|captured by| VNC[x11vnc]
    VNC -->|proxied by| WS[websockify]
    WS -->|displayed in| BROWSER[Browser noVNC]

    style EMU fill:#4a5568,stroke:#a0aec0,color:#fff
    style XVFB fill:#553c9a,stroke:#9f7aea,color:#fff
    style VNC fill:#2b6cb0,stroke:#63b3ed,color:#fff
    style WS fill:#276749,stroke:#68d391,color:#fff
    style BROWSER fill:#9b2c2c,stroke:#fc8181,color:#fff
```

### Why four processes?

| Process | Role | Why it's needed |
|---------|------|----------------|
| **Xvfb** | Virtual framebuffer | The emulator needs an X11 display to render to, but there's no physical monitor. Xvfb creates a fake display in memory. |
| **Android Emulator** | Runs Android | Renders the phone's GUI to the Xvfb display. Runs headless with `-no-audio -no-boot-anim`. |
| **x11vnc** | Screen capture | Reads pixels from the Xvfb display and serves them over the VNC protocol. |
| **websockify** | Protocol bridge | Bridges VNC (TCP) to WebSocket so the browser can connect. Also serves the noVNC HTML client. |

### Port allocation per phone

Each phone gets a unique slot (0-5) that determines all its ports:

```mermaid
graph TD
    SLOT[Slot N] --> DISPLAY[":11 + N"]
    SLOT --> ADB["5556 + N×2"]
    SLOT --> VNC_PORT["5901 + N"]
    SLOT --> NOVNC["6081 + N"]

    DISPLAY --> XVFB_PROC["Xvfb :11+N -screen 0 1080x2424x24"]
    ADB --> EMU_PROC["emulator -port 5556+N×2"]
    VNC_PORT --> VNC_PROC["x11vnc -rfbport 5901+N"]
    NOVNC --> WS_PROC["websockify 6081+N → 5901+N"]

    style SLOT fill:#8BB888,stroke:#6a9966,color:#111
```

> [!NOTE]
> Maximum 6 concurrent phones. When a phone is deleted, its slot is freed and reused by the next phone created.

---

## Phone Boot Sequence

When you call `POST /phones`, here's the full sequence:

```mermaid
sequenceDiagram
    participant Client
    participant NestJS as NestJS Backend
    participant FS as Filesystem
    participant XVFB as Xvfb
    participant EMU as Emulator
    participant ADB as ADB
    participant X11VNC as x11vnc
    participant WS as websockify

    Client->>NestJS: POST /phones
    NestJS->>NestJS: allocateSlot() — pick free slot 0-5
    NestJS->>FS: cp -r base.avd → phone-N.avd
    NestJS->>FS: Create phone-N.ini with updated paths
    NestJS-->>Client: { id, status: "booting" }

    Note over NestJS: Async boot starts

    NestJS->>XVFB: spawn Xvfb :N -screen 0 1080x2424x24
    XVFB-->>NestJS: display ready

    NestJS->>EMU: spawn emulator -avd phone-N -port P
    Note over EMU: Android kernel loading...

    NestJS->>NestJS: xdotool — resize emulator window to fit display

    NestJS->>X11VNC: spawn x11vnc -display :N -rfbport V
    NestJS->>WS: spawn websockify W → localhost:V

    loop Poll every 2s
        NestJS->>ADB: adb -s emulator-P shell getprop sys.boot_completed
        ADB-->>NestJS: "" (still booting)
    end

    ADB-->>NestJS: "1" (boot complete!)
    NestJS->>NestJS: status = "ready"
    Note over Client: Next GET /phones/:id returns status: "ready"
```

### Phone states

```mermaid
graph LR
    START(( )) --> booting
    booting -->|boot complete| ready
    booting -->|timeout or crash| error
    ready -->|DELETE| stopping
    error -->|DELETE| stopping
    stopping -->|cleanup done| END(( ))

    style START fill:#8BB888,stroke:#6a9966
    style END fill:#4a5568,stroke:#a0aec0
    style booting fill:#553c9a,stroke:#9f7aea,color:#fff
    style ready fill:#276749,stroke:#68d391,color:#fff
    style error fill:#9b2c2c,stroke:#fc8181,color:#fff
    style stopping fill:#4a5568,stroke:#a0aec0,color:#fff
```

---

## The AI Agent Pipeline

When you send a prompt, it flows through three services before reaching the phone:

```mermaid
sequenceDiagram
    participant Client
    participant NestJS as NestJS (DroidrunService)
    participant FastAPI as FastAPI (Python)
    participant Agent as DroidAgent
    participant LLM as Claude Sonnet
    participant Phone as Android Phone

    Client->>NestJS: POST /phones/:id/agent/run<br/>{ prompt: "Open Chrome" }
    NestJS->>NestJS: Check phone is ready
    NestJS->>NestJS: Start ffmpeg recording
    NestJS->>FastAPI: POST /run { device, prompt }

    Note over FastAPI: Spawns agent in new thread<br/>with its own event loop

    FastAPI->>Agent: DroidAgent(goal, config, llms)
    Agent->>Agent: agent.run()

    loop Agent reasoning loop (max 50 steps)
        Agent->>Phone: ADB: take screenshot
        Phone-->>Agent: screenshot.png
        Agent->>LLM: "Here's the screen. Goal: Open Chrome.<br/>What should I do next?"
        LLM-->>Agent: "I see the home screen.<br/>I'll tap the Chrome icon at (540, 1200)"
        Agent->>Phone: ADB: tap 540 1200
        Note over FastAPI: Log captured → parsed → queued
        FastAPI-->>NestJS: SSE: { type: "step", message: "Tapped Chrome icon" }
        NestJS-->>Client: SSE: { type: "step", message: "Tapped Chrome icon" }
    end

    Agent->>LLM: "Chrome is now open. Task complete."
    FastAPI-->>NestJS: SSE: { type: "done", message: "Opened Chrome successfully" }
    NestJS-->>Client: SSE: { type: "done", message: "Opened Chrome successfully" }
    NestJS->>NestJS: Stop ffmpeg recording
    NestJS->>NestJS: Save task + recording to db.json
```

### How the agent "sees" and "acts"

The DroidRun agent operates in a **ReAct loop** (Reason → Act → Observe):

```mermaid
graph TD
    START([Start]) --> SCREENSHOT[Take screenshot via ADB]
    SCREENSHOT --> SEND_LLM[Send screenshot + goal to Claude]
    SEND_LLM --> THINK[LLM reasons about what to do]
    THINK --> ACTION{Choose action}

    ACTION -->|tap| TAP[ADB: input tap x y]
    ACTION -->|type| TYPE[ADB: input text '...']
    ACTION -->|swipe| SWIPE[ADB: input swipe x1 y1 x2 y2]
    ACTION -->|press| PRESS[ADB: input keyevent BACK/HOME]
    ACTION -->|complete| DONE([Report result])

    TAP --> WAIT[Wait for UI to settle]
    TYPE --> WAIT
    SWIPE --> WAIT
    PRESS --> WAIT
    WAIT --> SCREENSHOT

    style START fill:#8BB888,stroke:#6a9966,color:#111
    style DONE fill:#8BB888,stroke:#6a9966,color:#111
    style THINK fill:#2b6cb0,stroke:#63b3ed,color:#fff
```

The agent's configuration:

| Setting | Value | Why |
|---------|-------|-----|
| `max_steps` | 50 | Prevent infinite loops |
| `vision` | true | Agent can see screenshots |
| `after_sleep_action` | 4.0s | Wait for animations to finish |
| `wait_for_stable_ui` | 2.0s | Wait for UI to stop changing |

---

## SSE Streaming Architecture

The streaming system has three layers, with reconnection support:

```mermaid
sequenceDiagram
    participant Browser as Browser (React)
    participant NestJS as NestJS Backend
    participant FastAPI as FastAPI Python
    participant Agent as Agent Thread

    Note over Agent: Agent running in separate<br/>thread + event loop

    Agent->>Agent: Logs "Opened Settings"
    Agent->>FastAPI: LogCapture handler catches log
    FastAPI->>FastAPI: parse_log_line() → friendly message
    FastAPI->>FastAPI: log_queue.put(event)
    FastAPI-->>NestJS: SSE: data: {"type":"step","message":"Opened Settings"}
    NestJS->>NestJS: Buffer event in memory (per phone)
    NestJS-->>Browser: SSE: data: {"type":"step","message":"Opened Settings"}
    Browser->>Browser: Render step in chat panel

    Note over Browser: User refreshes page!
    Browser->>NestJS: GET /phones/:id/agent/stream
    NestJS->>NestJS: Replay all buffered events
    NestJS-->>Browser: SSE: [all previous events]
    NestJS-->>Browser: SSE: [continue live stream]
```

### Event buffering

```mermaid
graph LR
    subgraph NestJS Memory
        BUF[Event Buffer<br/>per phone ID]
    end

    FASTAPI[FastAPI SSE] -->|events arrive| BUF
    BUF -->|live stream| CLIENT1[Client 1]
    BUF -->|live stream| CLIENT2[Client 2]
    BUF -->|reconnect replay| CLIENT3[Reconnecting Client]

    Note1[Buffer kept 60s<br/>after task completes] -.-> BUF

    style BUF fill:#8BB888,stroke:#6a9966,color:#111
```

---

## Screen Recording

Every agent task is automatically recorded using ffmpeg:

```mermaid
sequenceDiagram
    participant NestJS as NestJS
    participant FFMPEG as ffmpeg
    participant XVFB as Xvfb Display
    participant DB as db.json

    NestJS->>NestJS: Agent task starts
    NestJS->>DB: Create recording entry (status: "recording")
    NestJS->>FFMPEG: spawn ffmpeg -f x11grab<br/>-video_size 1080x2424<br/>-i :N -c:v libx264<br/>data/recordings/rec-X.mp4
    FFMPEG->>XVFB: Capture display pixels

    Note over FFMPEG: Recording in progress...<br/>Capturing at display framerate

    NestJS->>NestJS: Agent task completes
    NestJS->>FFMPEG: SIGINT (graceful stop)
    FFMPEG->>FFMPEG: Finalize MP4 container
    FFMPEG-->>NestJS: Process exits
    NestJS->>DB: Update recording (status: "done", durationSecs)
```

### Recording lifecycle

```mermaid
graph LR
    START(( )) -->|agent starts| recording
    recording -->|agent completes| done
    recording -->|ffmpeg crashes| error
    done -->|delete recording| END1(( ))
    done -->|delete task cascade| END2(( ))
    done -->|delete phone cascade| END3(( ))

    style START fill:#8BB888,stroke:#6a9966
    style recording fill:#553c9a,stroke:#9f7aea,color:#fff
    style done fill:#276749,stroke:#68d391,color:#fff
    style error fill:#9b2c2c,stroke:#fc8181,color:#fff
```

---

## Data Persistence

All state lives in a single `data/db.json` file. The DbService holds everything in memory and writes atomically on every mutation:

```mermaid
graph TD
    subgraph "In Memory"
        DATA[Full database state]
    end

    subgraph "On Disk"
        TMP["db.json.tmp"]
        REAL["db.json"]
    end

    MUTATION[Any create/update/delete] --> DATA
    DATA -->|writeFileSync| TMP
    TMP -->|renameSync atomic| REAL

    style DATA fill:#8BB888,stroke:#6a9966,color:#111
    style REAL fill:#2b6cb0,stroke:#63b3ed,color:#fff
```

### Why atomic writes?

If the process crashes mid-write, `db.json` could be corrupted (partially written). The `writeFileSync → renameSync` pattern ensures:

1. Data is fully written to `db.json.tmp` first
2. `renameSync` is an **atomic** operation on Linux — it either fully replaces the file or doesn't
3. If a crash happens during step 1, only the `.tmp` file is corrupted — `db.json` remains intact

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
        datetime createdAt
    }

    API_KEY {
        string id
        string name
        string keyHash
        string prefix
        datetime lastUsedAt
    }

    PHONE {
        string id
        string name
        datetime createdAt
    }

    TASK {
        string id
        string phoneId
        string title
        boolean pinned
        datetime createdAt
    }

    MESSAGE {
        string id
        string role
        string content
        datetime timestamp
    }

    STEP {
        string type
        string step
        datetime timestamp
    }

    RECORDING {
        string id
        string taskId
        string phoneId
        string filename
        number durationSecs
        string status
    }
```

---

## Process Supervision

Each child process (Xvfb, emulator, x11vnc, websockify) is wrapped in a supervisor:

```mermaid
graph TD
    SUPERVISOR[ManagedProcess Supervisor] --> SPAWN[Spawn child process]
    SPAWN --> RUNNING{Process running?}
    RUNNING -->|yes| RUNNING
    RUNNING -->|exit/crash| CHECK{Restart count < 3?}
    CHECK -->|yes| WAIT[Wait 1s] --> SPAWN
    CHECK -->|no| ERROR[Mark phone as 'error']

    style SUPERVISOR fill:#8BB888,stroke:#6a9966,color:#111
    style ERROR fill:#9b2c2c,stroke:#fc8181,color:#fff
```

### Cleanup on shutdown

When the backend stops (Ctrl+C or crash), `onApplicationShutdown()` runs:

```mermaid
graph TD
    SHUTDOWN[Backend shutting down] --> EACH[For each phone]
    EACH --> KILL_FFMPEG[Kill ffmpeg if recording]
    KILL_FFMPEG --> KILL_WS[Kill websockify]
    KILL_WS --> KILL_VNC[Kill x11vnc]
    KILL_VNC --> KILL_EMU[Kill emulator]
    KILL_EMU --> KILL_XVFB[Kill Xvfb]
    KILL_XVFB --> CLOSE_LOGS[Close log file handles]
    CLOSE_LOGS --> CLEANUP[Delete AVD copy + X11 sockets]
    CLEANUP --> DONE([All clean])

    style SHUTDOWN fill:#9b2c2c,stroke:#fc8181,color:#fff
    style DONE fill:#8BB888,stroke:#6a9966,color:#111
```

---

## Startup Sequence

When you run `./start.sh`, the backend performs several initialization steps:

```mermaid
sequenceDiagram
    participant TMUX as tmux
    participant NEST as NestJS
    participant PY as PythonService
    participant EMU as EmulatorService
    participant REC as RecordingService
    participant DB as DbService

    TMUX->>NEST: pnpm start:dev
    NEST->>DB: Load db.json from disk
    DB-->>NEST: In-memory state ready

    NEST->>PY: Spawn FastAPI python process
    PY->>PY: Kill any stale process on :8001

    loop Health check (up to 30 retries)
        NEST->>PY: GET /health
    end
    PY-->>NEST: { status: "ok" }

    NEST->>EMU: onModuleInit()
    EMU->>EMU: Clean stale X11 sockets (:11-:20)
    EMU->>EMU: Clean orphaned AVDs not in db.json

    NEST->>REC: onModuleInit()
    REC->>REC: Clean orphaned recordings not matching any phone

    Note over NEST: Backend ready on :3000
    TMUX->>TMUX: Start frontend on :5173
    TMUX->>TMUX: Start docs on :3001
```
