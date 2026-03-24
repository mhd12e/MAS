# Auth Endpoints

Authentication and API key management.

---

## Check Auth Status

```
GET /auth/status
```

**No authentication required.** Returns whether registration is open.

**Response:**

```json
{ "hasAccount": true, "registrationOpen": false }
```

---

## Register

```
POST /auth/register
```

**No authentication required.** Creates the first account. Returns `403` if an account already exists.

**Request body:**

```json
{ "email": "you@example.com", "password": "min-8-chars" }
```

**Response:**

```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

---

## Login

```
POST /auth/login
```

**No authentication required.**

**Request body:**

```json
{ "email": "you@example.com", "password": "your-password" }
```

**Response:**

```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

<!-- tabs:start -->

#### **Python**

```python
import requests

API = "http://localhost:3000/api/v1"

token = requests.post(f"{API}/auth/login", json={
    "email": "you@example.com",
    "password": "your-password",
}).json()["token"]

# Use token in subsequent requests
H = {"Authorization": f"Bearer {token}"}
phones = requests.get(f"{API}/phones", headers=H).json()
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";

const { token } = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "you@example.com", password: "your-password" }),
}).then(r => r.json());

const phones = await fetch(`${API}/phones`, {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());
```

#### **curl**

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}' | jq -r .token)

# Use token
curl http://localhost:3000/api/v1/phones \
  -H "Authorization: Bearer $TOKEN"
```

<!-- tabs:end -->

---

## List API Keys

```
GET /auth/keys
```

**Response:**

```json
[
  {
    "id": "key-123",
    "name": "CI Pipeline",
    "prefix": "mas_a1b2c3d4...",
    "createdAt": "2026-03-23T10:00:00.000Z",
    "lastUsedAt": "2026-03-23T14:30:00.000Z"
  }
]
```

---

## Create API Key

```
POST /auth/keys
```

**Request body:**

```json
{ "name": "My Script" }
```

**Response:**

```json
{
  "key": "mas_a1b2c3d4e5f6g7h8...",
  "id": "key-123",
  "name": "My Script",
  "prefix": "mas_a1b2c3d4...",
  "createdAt": "2026-03-23T10:00:00.000Z"
}
```

> [!IMPORTANT]
> The `key` field is shown **once**. Copy it immediately. Only the SHA-256 hash is stored.

---

## Delete API Key

```
DELETE /auth/keys/:id
```

**Response:**

```json
{ "ok": true }
```
