#!/usr/bin/env python3
"""
DroidRun FastAPI microservice.
Runs on localhost:8001. NestJS proxies all DroidRun calls through here.
"""

import asyncio
import io
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="DroidRun Agent Service")


class RunTaskRequest(BaseModel):
    task: str
    device_serial: str


def make_event(event_type: str, message: str) -> str:
    payload = {
        "type": event_type,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return f"data: {json.dumps(payload)}\n\n"


def friendly_error(e: Exception | str) -> str:
    msg = str(e).lower()
    if "device not found" in msg or "no devices" in msg:
        return "Could not connect to the phone. It may still be booting."
    if "401" in msg or "api key" in msg or "authentication" in msg or "unauthorized" in msg or "api_key" in msg:
        return "AI service authentication failed. Check your Anthropic API key in backend/.env"
    if "timeout" in msg:
        return "The task timed out. Try a simpler instruction."
    if "rate limit" in msg or "429" in msg:
        return "AI rate limit reached. Wait a moment and try again."
    if "can't verify" in msg or "ui state" in msg:
        return "The agent couldn't verify its actions. Try again — the phone may have been slow to respond."
    if "not provided" in msg and "api" in msg:
        return "AI service authentication failed. Check your Anthropic API key in backend/.env"
    return "Something went wrong while running the task."


def is_infrastructure_error(msg: str) -> bool:
    """Check if an error message is an infrastructure/auth issue rather than a task failure."""
    lower = msg.lower()
    return any(kw in lower for kw in [
        "401", "403", "api key", "authentication", "unauthorized",
        "rate limit", "429", "timeout", "connection refused",
        "device not found", "no devices", "import", "module",
    ])


def friendly_reason(reason: str) -> str:
    """Clean up the agent's final reason/error message for user display."""
    if not reason:
        return reason
    # Strip XML
    clean = re.split(r"</?function_calls|</?invoke|</?parameter", reason)[0]
    clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean)
    clean = re.sub(r"\n+", " ", clean).strip()
    clean = clean.strip('"')
    if len(clean) > 200:
        sentences = re.split(r"(?<=[.!?])\s+", clean)
        clean = sentences[0]
    return clean


# ── Patterns to filter from log output ─────────────────────────────────────────

SKIP_PATTERNS = [
    re.compile(r"^Attempt \d+ failed"),
    re.compile(r"^Error during task execution"),
    re.compile(r"AuthenticationError"),
    re.compile(r"Error code: 4\d\d"),
    re.compile(r"You are controlling an Android"),
    re.compile(r"The user wants you to:"),
    re.compile(r"Rules:\s*-"),
    re.compile(r"- (Complete the task|If an app|If you encounter|CRITICAL:|If something|Before marking|If you set|If unsure)"),
    re.compile(r"behalf of a user"),
    re.compile(r"Never assume an action succeeded"),
    re.compile(r"double-check the displayed value"),
    re.compile(r"take a screenshot and analyze"),
    re.compile(r"read the screen to confirm"),
    re.compile(r"^</?function_calls"),
    re.compile(r"^</?invoke"),
    re.compile(r"^</?parameter"),
    re.compile(r"^</?function_results"),
    re.compile(r"^</?result>"),
    re.compile(r"^</?name>"),
    re.compile(r"^</?output>"),
    re.compile(r"^```"),
    re.compile(r"^Could not get usage"),
    re.compile(r"^FastAgent response:$"),
    re.compile(r"^💡 Tool results"),
    re.compile(r"^📱 AppOpener"),
    re.compile(r"^✨ Try DroidRun"),
    re.compile(r"^👁️\s+Vision"),
    re.compile(r"^🤖 Agent mode"),
    re.compile(r"^Accessibility service enabled$"),
    re.compile(r"^\d+\.\d+%\s"),
    re.compile(r"^verify pushed apk"),
    re.compile(r"^Found Portal APK"),
    re.compile(r"^Installing Portal APK"),
    re.compile(r"Coordinates:\s*\(\d+"),
    re.compile(r"NoneType.*object"),
    re.compile(r"^Failed to parse tool call"),
    re.compile(r"^Skipping tool call"),
    re.compile(r"I can't verify"),
    re.compile(r"I can't proceed"),
    re.compile(r"I don't have the updated"),
    re.compile(r"I don't have an updated"),
    re.compile(r"Please share the current UI"),
    re.compile(r"updated screen/UI state"),
    re.compile(r"no updated UI state"),
    re.compile(r"was not provided"),
]

FRIENDLY_TRANSFORMS = [
    (re.compile(r"^🔄 Step (\d+)/(\d+)"), lambda m: f"Step {m.group(1)} of {m.group(2)}"),
    (re.compile(r"^🎉 Goal achieved:\s*(.*)"), lambda m: m.group(1)),
    (re.compile(r"^❌ Goal failed:\s*(.*)"), lambda m: m.group(1)),
    (re.compile(r"^🚀 Starting:"), lambda m: "Starting task..."),
    (re.compile(r"^🚀 Running DroidAgent"), lambda m: "Starting task..."),
    (re.compile(r"Portal not installed"), lambda m: "Setting up phone tools..."),
    (re.compile(r"Portal APK installed"), lambda m: "Phone tools ready"),
    (re.compile(r"Starting app ([\w.]+)"), lambda m: f"Opening {m.group(1).split('.')[-1]}..."),
    (re.compile(r"Clicked on Text: '([^']+)'"), lambda m: f'Tapped "{m.group(1)}"'),
    (re.compile(r"Text typed successfully"), lambda m: "Typed text"),
    (re.compile(r"Pressed (\w+) button"), lambda m: f"Pressed {m.group(1)}"),
    (re.compile(r"Waited for [\d.]+ seconds"), lambda m: None),  # skip
    (re.compile(r"^App started:"), lambda m: None),  # skip, already shown
]


def parse_log_line(line: str) -> str | None:
    """Parse a DroidRun log line into a clean message, or None to skip."""
    clean = line.strip()
    clean = re.sub(r"\x1b\[[0-9;]*m", "", clean)  # strip ANSI
    clean = re.sub(r"^\d{2}:\d{2}:\d{2}\s*", "", clean)  # strip timestamp

    # Cut off everything after XML tool calls (they leak into reasoning text)
    clean = re.split(r"</?function_calls|</?invoke|</?parameter|</?result|</?output|</?name", clean)[0]

    # Strip markdown bold
    clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean)

    # Strip newlines — flatten to single line
    clean = re.sub(r"\n+", " ", clean)

    clean = clean.strip()

    if not clean or len(clean) < 3:
        return None

    # Skip noise
    for pat in SKIP_PATTERNS:
        if pat.search(clean):
            return None

    # Skip XML fragments
    if clean.startswith("<") or (clean.startswith("{") and len(clean) < 50):
        return None

    # Apply transforms
    for pat, transform in FRIENDLY_TRANSFORMS:
        m = pat.search(clean)
        if m:
            return transform(m)

    # Skip filler
    if re.match(r"^Let's (proceed|try|perform|reopen|type|scroll|open)", clean):
        return None

    # Extract just the first meaningful sentence for long reasoning blocks
    if len(clean) > 160:
        # Split on sentence boundaries and take the first 1-2 sentences
        sentences = re.split(r"(?<=[.!?])\s+", clean)
        short = sentences[0]
        if len(sentences) > 1 and len(short) < 80:
            short += " " + sentences[1]
        if len(short) > 160:
            short = short[:157] + "..."
        clean = short

    return clean


# ── Core streaming generator ───────────────────────────────────────────────────

async def run_task_stream(task: str, device_serial: str) -> AsyncGenerator[str, None]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    import queue, threading

    result_q: queue.Queue = queue.Queue()
    log_q: queue.Queue = queue.Queue()

    class ThreadSafeLogCapture(logging.Handler):
        def __init__(self):
            super().__init__()
            self._stream_buffer = ""

        def emit(self, record):
            try:
                msg = self.format(record)
                stream = getattr(record, "stream", False)
                stream_end = getattr(record, "stream_end", False)

                if stream:
                    self._stream_buffer += msg
                    return
                if stream_end:
                    if self._stream_buffer.strip():
                        parsed = parse_log_line(self._stream_buffer.strip())
                        if parsed:
                            log_q.put(parsed)
                    self._stream_buffer = ""
                    return
                if self._stream_buffer.strip():
                    parsed = parse_log_line(self._stream_buffer.strip())
                    if parsed:
                        log_q.put(parsed)
                    self._stream_buffer = ""
                parsed = parse_log_line(msg)
                if parsed:
                    log_q.put(parsed)
            except Exception:
                pass

    def agent_thread():
        """Run ALL DroidRun work in a separate thread with its own event loop.

        Everything — imports, LLM creation, agent creation, execution — happens
        here to avoid event loop conflicts with FastAPI/Starlette.
        """
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        # Set up log capture for chain-of-thought streaming
        log_handler = ThreadSafeLogCapture()
        log_handler.setFormatter(logging.Formatter("%(message)s"))

        droidrun_logger = logging.getLogger("droidrun")
        droidrun_logger.handlers.clear()
        droidrun_logger.addHandler(log_handler)
        droidrun_logger.setLevel(logging.INFO)

        for name in ["llama_index", "httpx", "openai", "urllib3", "httpcore"]:
            logging.getLogger(name).setLevel(logging.CRITICAL)

        try:
            from droidrun import DroidAgent, load_llm
            from droidrun.config_manager import DroidrunConfig, DeviceConfig, AgentConfig, FastAgentConfig

            log_q.put("__status__:Connecting to device...")

            llm = load_llm(provider_name="Anthropic", model="claude-sonnet-4-20250514", api_key=api_key)
            log_q.put("__status__:AI model ready. Starting task...")

            device_config = DeviceConfig(serial=device_serial)
            fast_agent_config = FastAgentConfig(vision=True)
            agent_config = AgentConfig(
                max_steps=50,
                fast_agent=fast_agent_config,
                after_sleep_action=4.0,
                wait_for_stable_ui=2.0,
            )
            config = DroidrunConfig(device=device_config, agent=agent_config)
            agent = DroidAgent(goal=task, config=config, llms=llm)

            log_q.put("__status__:Agent initialized. Executing...")

            # agent.run() calls asyncio.create_task() internally, which needs
            # a RUNNING event loop. Wrapping in an async function ensures the
            # loop is running when create_task() is called.
            async def _run():
                return await agent.run()

            result = loop.run_until_complete(_run())
            result_q.put({"result": result})

        except Exception as e:
            print(f"[AGENT ERROR] {e}", flush=True)
            result_q.put({"error": e})
        finally:
            droidrun_logger.removeHandler(log_handler)
            loop.close()

    yield make_event("info", "Starting agent...")

    t = threading.Thread(target=agent_thread, daemon=True)
    t.start()

    seen_messages: set[str] = set()

    def drain_queue():
        """Yield all pending messages from the queue without blocking."""
        events = []
        while not log_q.empty():
            try:
                msg = log_q.get_nowait()
            except queue.Empty:
                break
            if not msg or msg in seen_messages:
                continue
            seen_messages.add(msg)
            if msg.startswith("__status__:"):
                events.append(make_event("info", msg[len("__status__:"):]))
            else:
                events.append(make_event("step", msg))
        return events

    try:
        while t.is_alive():
            # Non-blocking drain + async sleep — never blocks the event loop
            for event in drain_queue():
                yield event
            await asyncio.sleep(0.3)  # async sleep lets Starlette flush between yields

        # Final drain after thread completes
        for event in drain_queue():
            yield event

        # Get result
        try:
            outcome = result_q.get_nowait()
        except queue.Empty:
            outcome = {}

        if "error" in outcome:
            yield make_event("error", friendly_error(outcome["error"]))
        elif "result" in outcome:
            result = outcome["result"]
            success = getattr(result, "success", False)
            reason = getattr(result, "reason", "")
            if success:
                yield make_event("done", friendly_reason(reason) or "Task completed successfully.")
            else:
                clean = friendly_reason(reason) if reason else ""
                if clean and not is_infrastructure_error(clean):
                    yield make_event("error", clean)
                elif clean:
                    yield make_event("error", friendly_error(reason))
                else:
                    yield make_event("error", "Task could not be completed. Try rephrasing your instruction.")
        else:
            yield make_event("done", "Task completed.")

    except Exception as e:
        print(f"[AGENT EXCEPTION] {e}", flush=True)
        yield make_event("error", friendly_error(e))


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/run")
async def run_task(req: RunTaskRequest):
    return StreamingResponse(
        run_task_stream(req.task, req.device_serial),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/suggestions")
async def get_suggestions():
    return [
        "Open YouTube and search for lo-fi music",
        "Go to Settings and enable dark mode",
        "Open Chrome and go to google.com",
        "Take a screenshot of the home screen",
        "Set a timer for 10 minutes",
        "Open the camera app",
        "Go to Settings and check the Android version",
        "Open the Play Store",
        "Enable airplane mode then disable it",
        "Open the Calculator and calculate 15% of 200",
        "Go to Settings and check available storage",
        "Enable Do Not Disturb mode",
        "Go to Wi-Fi settings",
        "Open the Clock app and set an alarm for 8am",
        "Check the battery percentage in Settings",
        "Open Chrome and search for cute cats",
        "Open Chrome and search for the weather",
        "Change the wallpaper from Settings",
        "Open Chrome and search for today's news",
        "Open the phone dialer",
    ]


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=False, log_level="warning")
