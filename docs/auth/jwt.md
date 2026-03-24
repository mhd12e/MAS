# JWT Tokens

JWT tokens are used for browser sessions and interactive API use.

## Register

> [!WARNING]
> Registration only works when no account exists. After the first user registers, this endpoint returns `403 Forbidden`.

<!-- tabs:start -->

#### **Python**

```python
import requests

API = "http://localhost:3000/api/v1"

response = requests.post(f"{API}/auth/register", json={
    "email": "admin@example.com",
    "password": "my-secure-password"
})

data = response.json()
token = data["token"]
print(f"Token: {token[:20]}...")
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";

const response = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@example.com",
    password: "my-secure-password",
  }),
});

const { token } = await response.json();
console.log(`Token: ${token.slice(0, 20)}...`);
```

#### **curl**

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "my-secure-password"}'
```

<!-- tabs:end -->

**Response:**

```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

## Login

<!-- tabs:start -->

#### **Python**

```python
import requests

API = "http://localhost:3000/api/v1"

response = requests.post(f"{API}/auth/login", json={
    "email": "admin@example.com",
    "password": "my-secure-password"
})
token = response.json()["token"]
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";

const { token } = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@example.com", password: "my-secure-password" }),
}).then(r => r.json());
```

#### **curl**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "my-secure-password"}'
```

<!-- tabs:end -->

## Using the token

Include the token in the `Authorization` header of every request:

<!-- tabs:start -->

#### **Python**

```python
import requests

API = "http://localhost:3000/api/v1"
token = "eyJhbGciOiJIUzI1NiIs..."  # from login response

headers = {"Authorization": f"Bearer {token}"}
phones = requests.get(f"{API}/phones", headers=headers).json()
```

#### **JavaScript**

```javascript
const API = "http://localhost:3000/api/v1";
const token = "eyJhbGciOiJIUzI1NiIs..."; // from login response

const phones = await fetch(`${API}/phones`, {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());
```

#### **curl**

```bash
curl http://localhost:3000/api/v1/phones \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

<!-- tabs:end -->

## Token details

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Expiry | 7 days |
| Payload | `{ sub: userId, email: userEmail }` |

> [!NOTE]
> If the JWT secret is not set via `JWT_SECRET` in `.env`, a random secret is generated on each backend restart. This means all existing tokens become invalid after a restart. Set `JWT_SECRET` in production for persistent tokens.
