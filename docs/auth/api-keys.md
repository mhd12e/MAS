# API Keys

API keys are for scripts, CI/CD pipelines, and external integrations. They don't expire.

## Create a key

Requires JWT authentication. You can also create keys from the dashboard UI (key icon in the top-right corner).

<!-- tabs:start -->

#### **Python**

```python
import requests

API = "http://localhost:3000/api/v1"
JWT = "eyJhbGciOiJIUzI1NiIs..."

response = requests.post(
    f"{API}/auth/keys",
    headers={"Authorization": f"Bearer {JWT}", "Content-Type": "application/json"},
    json={"name": "CI Pipeline"}
)

data = response.json()
print(f"API Key: {data['key']}")
print(f"Prefix:  {data['prefix']}")

# SAVE THIS KEY NOW — it will never be shown again
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";
const JWT = "eyJhbGciOiJIUzI1NiIs...";

const response = await fetch(`${API}/auth/keys`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${JWT}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "CI Pipeline" }),
});

const data = await response.json();
console.log(`API Key: ${data.key}`);   // Save this!
console.log(`Prefix: ${data.prefix}`); // e.g., "mas_a1b2c3d4..."
```

#### **curl**

```bash
curl -X POST http://localhost:3000/api/v1/auth/keys \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"name": "CI Pipeline"}'
```

<!-- tabs:end -->

**Response:**

```json
{
  "key": "mas_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "id": "key-1711234567890-abc",
  "name": "CI Pipeline",
  "prefix": "mas_a1b2c3d4...",
  "createdAt": "2026-03-23T10:00:00.000Z"
}
```

> [!IMPORTANT]
> The `key` field contains the raw API key. It is shown **once** in this response and never stored. If you lose it, delete the key and create a new one.

## Using API keys

Include the key in the `X-API-Key` header:

<!-- tabs:start -->

#### **Python**

```python
import requests

API = "http://localhost:3000/api/v1"
H = {"X-API-Key": "mas_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"}

phones = requests.get(f"{API}/phones", headers=H).json()
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";
const H = { "X-API-Key": "mas_a1b2c3d4e5f6..." };

const phones = await fetch(`${API}/phones`, { headers: H }).then(r => r.json());
```

#### **curl**

```bash
curl http://localhost:3000/api/v1/phones \
  -H "X-API-Key: mas_a1b2c3d4e5f6..."
```

<!-- tabs:end -->

## List keys

Returns all keys with their prefix and metadata. The raw key is never returned.

```bash
curl http://localhost:3000/api/v1/auth/keys \
  -H "Authorization: Bearer eyJ..."
```

```json
[
  {
    "id": "key-1711234567890-abc",
    "name": "CI Pipeline",
    "prefix": "mas_a1b2c3d4...",
    "createdAt": "2026-03-23T10:00:00.000Z",
    "lastUsedAt": "2026-03-23T14:30:00.000Z"
  }
]
```

## Delete a key

```bash
curl -X DELETE http://localhost:3000/api/v1/auth/keys/key-1711234567890-abc \
  -H "Authorization: Bearer eyJ..."
```

> [!TIP]
> The `lastUsedAt` field updates every time the key is used. Use this to identify unused keys for cleanup.
