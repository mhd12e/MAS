# Automation Scripts

Complete examples for common automation workflows.

### Automation workflow overview

```mermaid
graph LR
    CREATE["1. Create Phone"] --> BOOT["2. Wait for Boot"]
    BOOT --> RUN["3. Run Task(s)"]
    RUN --> CLEANUP["4. Delete Phone"]

    style CREATE fill:#4a5568,stroke:#a0aec0,color:#fff
    style BOOT fill:#553c9a,stroke:#9f7aea,color:#fff
    style RUN fill:#2b6cb0,stroke:#63b3ed,color:#fff
    style CLEANUP fill:#9b2c2c,stroke:#fc8181,color:#fff
```

---

## Full workflow: create → run → cleanup

<!-- tabs:start -->

#### **Python (sync)**

```python
import requests, time

API = "http://localhost:3000/api/v1"
H = {"X-API-Key": "mas_your_key", "Content-Type": "application/json"}

# 1. Create phone
phone = requests.post(f"{API}/phones", headers=H).json()

# 2. Wait for boot
while requests.get(f"{API}/phones/{phone['id']}", headers=H).json()["status"] != "ready":
    time.sleep(3)

# 3. Run task (blocks until done)
result = requests.post(
    f"{API}/phones/{phone['id']}/agent/run-sync",
    headers=H,
    json={"prompt": "What Android version is this?"},
).json()

if result["success"]:
    print(f"Answer: {result['result']}")
else:
    print(f"Error: {result['error']}")

# 4. Cleanup
requests.delete(f"{API}/phones/{phone['id']}", headers=H)
```

#### **Python (streaming)**

```python
import requests, json, time

API = "http://localhost:3000/api/v1"
H = {"X-API-Key": "mas_your_key", "Content-Type": "application/json"}

# 1. Create phone
phone = requests.post(f"{API}/phones", headers=H).json()

# 2. Wait for boot
while requests.get(f"{API}/phones/{phone['id']}", headers=H).json()["status"] != "ready":
    time.sleep(3)

# 3. Run task (streaming)
resp = requests.post(
    f"{API}/phones/{phone['id']}/agent/run",
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
requests.delete(f"{API}/phones/{phone['id']}", headers=H)
```

#### **JavaScript (sync)**

```javascript
const API = "http://localhost:3000/api/v1";
const H = { "X-API-Key": "mas_your_key", "Content-Type": "application/json" };

// 1. Create phone
const phone = await fetch(`${API}/phones`, { method: "POST", headers: H }).then(r => r.json());

// 2. Wait for boot
while (true) {
  const p = await fetch(`${API}/phones/${phone.id}`, { headers: H }).then(r => r.json());
  if (p.status === "ready") break;
  await new Promise(r => setTimeout(r, 3000));
}

// 3. Run task (sync)
const result = await fetch(`${API}/phones/${phone.id}/agent/run-sync`, {
  method: "POST", headers: H,
  body: JSON.stringify({ prompt: "What Android version is this?" }),
}).then(r => r.json());

console.log(result.success ? result.result : result.error);

// 4. Cleanup
await fetch(`${API}/phones/${phone.id}`, { method: "DELETE", headers: H });
```

#### **JavaScript (streaming)**

```javascript
const API = "http://localhost:3000/api/v1";
const H = { "X-API-Key": "mas_your_key", "Content-Type": "application/json" };

// 1. Create phone
const phone = await fetch(`${API}/phones`, { method: "POST", headers: H }).then(r => r.json());

// 2. Wait for boot
while (true) {
  const p = await fetch(`${API}/phones/${phone.id}`, { headers: H }).then(r => r.json());
  if (p.status === "ready") break;
  await new Promise(r => setTimeout(r, 3000));
}

// 3. Run task (streaming)
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

# 1. Create phone
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

## Batch tasks on one phone

Run multiple tasks sequentially:

<!-- tabs:start -->

#### **Python**

```python
import requests, time

API = "http://localhost:3000/api/v1"
H = {"X-API-Key": "mas_your_key", "Content-Type": "application/json"}

# Create phone and wait for boot
phone = requests.post(f"{API}/phones", headers=H).json()
phone_id = phone["id"]
while requests.get(f"{API}/phones/{phone_id}", headers=H).json()["status"] != "ready":
    time.sleep(3)

tasks = [
    "Open Settings and check the Android version",
    "Open Chrome and go to google.com",
    "Check the battery level",
]

for i, prompt in enumerate(tasks):
    print(f"\n--- Task {i+1}/{len(tasks)} ---")
    r = requests.post(
        f"{API}/phones/{phone_id}/agent/run-sync",
        headers=H, json={"prompt": prompt},
    ).json()
    print(f"{'OK' if r['success'] else 'FAIL'} {r['result'] or r['error']}")

# Cleanup
requests.delete(f"{API}/phones/{phone_id}", headers=H)
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";
const H = { "X-API-Key": "mas_your_key", "Content-Type": "application/json" };

// Create phone and wait for boot
const phone = await fetch(`${API}/phones`, { method: "POST", headers: H }).then(r => r.json());
while (true) {
  const p = await fetch(`${API}/phones/${phone.id}`, { headers: H }).then(r => r.json());
  if (p.status === "ready") break;
  await new Promise(r => setTimeout(r, 3000));
}

const tasks = [
  "Open Settings and check the Android version",
  "Open Chrome and go to google.com",
  "Check the battery level",
];

for (const prompt of tasks) {
  const r = await fetch(`${API}/phones/${phone.id}/agent/run-sync`, {
    method: "POST", headers: H,
    body: JSON.stringify({ prompt }),
  }).then(r => r.json());
  console.log(`${r.success ? "OK" : "FAIL"} ${r.result || r.error}`);
}

// Cleanup
await fetch(`${API}/phones/${phone.id}`, { method: "DELETE", headers: H });
```

#### **curl**

```bash
# Create phone and wait for boot
PHONE=$(curl -s -X POST http://localhost:3000/api/v1/phones \
  -H "X-API-Key: mas_your_key" | jq -r .id)

while [ "$(curl -s http://localhost:3000/api/v1/phones/$PHONE \
  -H "X-API-Key: mas_your_key" | jq -r .status)" != "ready" ]; do
  sleep 3
done

for PROMPT in "Check Android version" "Open Chrome" "Check battery"; do
  echo "--- $PROMPT ---"
  curl -s -X POST http://localhost:3000/api/v1/phones/$PHONE/agent/run-sync \
    -H "X-API-Key: mas_your_key" \
    -H "Content-Type: application/json" \
    -d "{\"prompt\": \"$PROMPT\"}"
  echo ""
done

# Cleanup
curl -X DELETE http://localhost:3000/api/v1/phones/$PHONE \
  -H "X-API-Key: mas_your_key"
```

<!-- tabs:end -->

---

## Download all recordings

<!-- tabs:start -->

#### **Python**

```python
import requests

API = "http://localhost:3000/api/v1"
H = {"X-API-Key": "mas_your_key", "Content-Type": "application/json"}

recordings = requests.get(f"{API}/recordings", headers=H).json()
for rec in recordings:
    print(f"Downloading: {rec['taskTitle']} ({rec['durationSecs']}s)")
    resp = requests.get(f"{API}/recordings/{rec['id']}/video", headers=H, stream=True)
    with open(f"{rec['id']}.mp4", "wb") as f:
        for chunk in resp.iter_content(8192):
            f.write(chunk)
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";
const H = { "X-API-Key": "mas_your_key", "Content-Type": "application/json" };

const recordings = await fetch(`${API}/recordings`, { headers: H }).then(r => r.json());
for (const rec of recordings) {
  const resp = await fetch(`${API}/recordings/${rec.id}/video`, { headers: H });
  const blob = await resp.blob();
  // Save blob to file (Node.js: use fs.writeFileSync)
  console.log(`Downloaded: ${rec.taskTitle} (${rec.durationSecs}s)`);
}
```

#### **curl**

```bash
# List recordings and download each
curl -s http://localhost:3000/api/v1/recordings \
  -H "X-API-Key: mas_your_key" | \
  jq -r '.[].id' | while read ID; do
    curl -s http://localhost:3000/api/v1/recordings/$ID/video \
      -H "X-API-Key: mas_your_key" -o "$ID.mp4"
    echo "Downloaded: $ID.mp4"
  done
```

<!-- tabs:end -->

---

## Helper class

```python
import requests

class MobileAgent:
    def __init__(self, api_url, api_key):
        self.api = api_url
        self.h = {"X-API-Key": api_key, "Content-Type": "application/json"}

    def create_phone(self, wait=True):
        phone = requests.post(f"{self.api}/phones", headers=self.h).json()
        if wait:
            import time
            while requests.get(f"{self.api}/phones/{phone['id']}", headers=self.h).json()["status"] != "ready":
                time.sleep(3)
        return phone["id"]

    def run(self, phone_id, prompt):
        return requests.post(
            f"{self.api}/phones/{phone_id}/agent/run-sync",
            headers=self.h, json={"prompt": prompt},
        ).json()

    def delete_phone(self, phone_id):
        requests.delete(f"{self.api}/phones/{phone_id}", headers=self.h)

# Usage
agent = MobileAgent("http://localhost:3000/api/v1", "mas_your_key")
phone = agent.create_phone()
result = agent.run(phone, "What Android version is this?")
print(result["result"])
agent.delete_phone(phone)
```
