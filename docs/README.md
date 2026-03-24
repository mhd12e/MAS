<div class="mas-hero">
  <div class="mas-hero-icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
  </div>
  <h1>Mobile Agent Studio</h1>
  <div class="mas-hero-tagline">AI-powered Android phone automation platform</div>
  <ul class="mas-hero-features">
    <li>Create virtual Android phones on demand</li>
    <li>Control them with natural language via Claude AI</li>
    <li>Live screen streaming, real-time chain-of-thought</li>
    <li>Full REST API with streaming SSE & sync endpoints</li>
    <li>Automatic screen recording for every task</li>
  </ul>
  <div class="mas-hero-buttons">
    <a href="#/getting-started/installation" class="primary">Get Started</a>
    <a href="#/api/phones">API Reference</a>
    <a href="https://github.com/mhd12e/MAS" target="_blank">GitHub</a>
  </div>
</div>

## Getting Started

```bash
./start.sh
```

This starts the backend, frontend, and docs in a single tmux session. Open `http://localhost:5173` to use the dashboard, or use the API directly:

```
http://localhost:3000/api/v1
```

## Authentication

Every request needs one of:

| Method | Header | Use case |
|--------|--------|----------|
| JWT Token | `Authorization: Bearer <token>` | Browser sessions |
| API Key | `X-API-Key: mas_...` | Scripts & integrations |

---

## Two ways to run tasks

| | Streaming | Synchronous |
|---|---|---|
| **Endpoint** | `POST /phones/:id/agent/run` | `POST /phones/:id/agent/run-sync` |
| **Response** | SSE event stream | Single JSON object |
| **Real-time** | Yes | No — waits until done |
| **Best for** | UIs, dashboards | Scripts, CI/CD, batch jobs |

---

## Quick Example

All examples below follow the same flow: **create phone → wait for boot → run task → cleanup**.

<!-- tabs:start -->

#### **Python (sync)**

```python
import requests, time

API = "http://localhost:3000/api/v1"
H = {"X-API-Key": "mas_your_key", "Content-Type": "application/json"}

# 1. Create a phone
phone = requests.post(f"{API}/phones", headers=H).json()
phone_id = phone["id"]

# 2. Wait for boot
while requests.get(f"{API}/phones/{phone_id}", headers=H).json()["status"] != "ready":
    time.sleep(3)

# 3. Run task (blocks until done)
result = requests.post(
    f"{API}/phones/{phone_id}/agent/run-sync",
    headers=H,
    json={"prompt": "What Android version is this?"},
).json()

print(result["result"])  # "The Android version is 16."

# 4. Cleanup
requests.delete(f"{API}/phones/{phone_id}", headers=H)
```

#### **Python (streaming)**

```python
import requests, json, time

API = "http://localhost:3000/api/v1"
H = {"X-API-Key": "mas_your_key", "Content-Type": "application/json"}

# 1. Create a phone
phone = requests.post(f"{API}/phones", headers=H).json()
phone_id = phone["id"]

# 2. Wait for boot
while requests.get(f"{API}/phones/{phone_id}", headers=H).json()["status"] != "ready":
    time.sleep(3)

# 3. Run task (streaming — see each step live)
resp = requests.post(
    f"{API}/phones/{phone_id}/agent/run",
    headers=H,
    json={"prompt": "What Android version is this?"},
    stream=True,
)

for line in resp.iter_lines():
    line = line.decode()
    if line.startswith("data: "):
        event = json.loads(line[6:])
        print(f"[{event['type']}] {event['message']}")

# 4. Cleanup
requests.delete(f"{API}/phones/{phone_id}", headers=H)
```

#### **JavaScript (sync)**

```javascript
const API = "http://localhost:3000/api/v1";
const H = { "X-API-Key": "mas_your_key", "Content-Type": "application/json" };

// 1. Create a phone
const phone = await fetch(`${API}/phones`, { method: "POST", headers: H }).then(r => r.json());

// 2. Wait for boot
while (true) {
  const p = await fetch(`${API}/phones/${phone.id}`, { headers: H }).then(r => r.json());
  if (p.status === "ready") break;
  await new Promise(r => setTimeout(r, 3000));
}

// 3. Run task (sync — blocks until done)
const result = await fetch(`${API}/phones/${phone.id}/agent/run-sync`, {
  method: "POST", headers: H,
  body: JSON.stringify({ prompt: "What Android version is this?" }),
}).then(r => r.json());

console.log(result.result); // "The Android version is 16."

// 4. Cleanup
await fetch(`${API}/phones/${phone.id}`, { method: "DELETE", headers: H });
```

#### **JavaScript (streaming)**

```javascript
const API = "http://localhost:3000/api/v1";
const H = { "X-API-Key": "mas_your_key", "Content-Type": "application/json" };

// 1. Create a phone
const phone = await fetch(`${API}/phones`, { method: "POST", headers: H }).then(r => r.json());

// 2. Wait for boot
while (true) {
  const p = await fetch(`${API}/phones/${phone.id}`, { headers: H }).then(r => r.json());
  if (p.status === "ready") break;
  await new Promise(r => setTimeout(r, 3000));
}

// 3. Run task (streaming — see each step live)
const resp = await fetch(`${API}/phones/${phone.id}/agent/run`, {
  method: "POST", headers: H,
  body: JSON.stringify({ prompt: "What Android version is this?" }),
});

const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const event = JSON.parse(line.slice(6));
    console.log(`[${event.type}] ${event.message}`);
  }
}

// 4. Cleanup
await fetch(`${API}/phones/${phone.id}`, { method: "DELETE", headers: H });
```

#### **curl**

```bash
# Uses API key header throughout

# 1. Create a phone
PHONE=$(curl -s -X POST http://localhost:3000/api/v1/phones \
  -H "X-API-Key: mas_your_key" | jq -r .id)

# 2. Wait for boot
while [ "$(curl -s http://localhost:3000/api/v1/phones/$PHONE \
  -H "X-API-Key: mas_your_key" | jq -r .status)" != "ready" ]; do
  sleep 3
done

# 3. Run task (sync)
curl -X POST http://localhost:3000/api/v1/phones/$PHONE/agent/run-sync \
  -H "X-API-Key: mas_your_key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What Android version is this?"}'

# 4. Cleanup
curl -X DELETE http://localhost:3000/api/v1/phones/$PHONE \
  -H "X-API-Key: mas_your_key"
```

<!-- tabs:end -->

---

## All Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/phones` | Create a phone |
| `GET` | `/phones` | List all phones |
| `GET` | `/phones/:id` | Get a phone |
| `PATCH` | `/phones/:id` | Rename a phone |
| `DELETE` | `/phones/:id` | Delete a phone |
| `GET` | `/phones/:id/health` | Health check |
| `POST` | `/phones/:id/agent/run` | Run task (streaming) |
| `POST` | `/phones/:id/agent/run-sync` | Run task (synchronous) |
| `GET` | `/phones/:id/agent/stream` | Reconnect to active run |
| `GET` | `/phones/:id/agent/status` | Check if agent is running |
| `GET` | `/tasks` | List all tasks |
| `POST` | `/tasks` | Create a task |
| `GET` | `/tasks/:id` | Get a task |
| `PATCH` | `/tasks/:id` | Update a task |
| `DELETE` | `/tasks/:id` | Delete a task |
| `GET` | `/recordings` | List recordings |
| `GET` | `/recordings/:id/video` | Stream video file |
| `DELETE` | `/recordings/:id` | Delete recording |
| `GET` | `/auth/status` | Auth status (public) |
| `POST` | `/auth/register` | Register (public) |
| `POST` | `/auth/login` | Login (public) |
| `GET` | `/auth/keys` | List API keys |
| `POST` | `/auth/keys` | Create API key |
| `DELETE` | `/auth/keys/:id` | Delete API key |
