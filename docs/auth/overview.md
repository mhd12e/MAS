# Authentication Overview

Mobile Agent Studio uses two authentication methods:

| Method | Use Case | Lifetime | Header |
|--------|----------|----------|--------|
| **JWT Token** | Browser sessions, interactive use | 7 days | `Authorization: Bearer <token>` |
| **API Key** | Scripts, CI/CD, external integrations | Permanent (until deleted) | `X-API-Key: mas_...` |

## How it works

1. **First visit** — no account exists. The registration form appears.
2. **Register** — create email + password. Registration closes permanently after the first account.
3. **Login** — returns a JWT token valid for 7 days.
4. **API Keys** — created from the dashboard (key icon in top-right). The raw key is shown once and never stored — only its SHA-256 hash is persisted.

## Auth flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant DB

    Client->>API: GET /auth/status
    API->>DB: hasAnyUser()
    API-->>Client: { registrationOpen: true/false }

    alt No account exists
        Client->>API: POST /auth/register { email, password }
        API->>DB: hash password, store user
        API-->>Client: { token: "eyJ..." }
    else Account exists
        Client->>API: POST /auth/login { email, password }
        API->>DB: verify password
        API-->>Client: { token: "eyJ..." }
    end

    Client->>API: GET /phones (with Bearer token)
    API-->>Client: [{ id, name, status }]
```

## Public endpoints

These endpoints do **not** require authentication:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/auth/status` | Check if registration is open |
| `POST /api/v1/auth/register` | Create first account |
| `POST /api/v1/auth/login` | Login |

All other endpoints require either a JWT token or an API key.

## Security details

```mermaid
graph TD
    subgraph "Password Storage"
        PW["Plain password"] -->|"bcrypt (12 rounds)"| HASH["passwordHash in db.json"]
    end

    subgraph "JWT Tokens"
        LOGIN["Login"] -->|"sign with HMAC-SHA256"| TOKEN["JWT (7 day expiry)"]
        TOKEN -->|"verify on each request"| ACCESS["API Access"]
    end

    subgraph "API Keys"
        CREATE["Create key"] --> RAW["Raw key (shown once)"]
        RAW -->|"SHA-256 hash"| STORED["keyHash in db.json"]
        RAW -->|"first 12 chars"| PREFIX["prefix for display"]
    end

    style RAW fill:#9b2c2c,stroke:#fc8181,color:#fff
    style HASH fill:#276749,stroke:#68d391,color:#fff
    style STORED fill:#276749,stroke:#68d391,color:#fff
```

- Passwords are hashed with **bcrypt** (12 rounds)
- JWT tokens are signed with HMAC-SHA256
- API keys are stored as **SHA-256 hashes** — the raw key exists only in the creation response
- API key prefix (`mas_a1b2c3d4...`) is stored for display purposes
- Registration is permanently closed after the first user — no multi-user support
