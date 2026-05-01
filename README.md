# Anonymous Chat API

Real-time, room-based anonymous chat backend. Users identify with a username only — no passwords, no registration. Rooms are created on demand; messages are persisted to PostgreSQL and delivered live via WebSocket. Designed to scale horizontally across multiple instances using a Redis pub/sub adapter.

![Anonymous chat — live multi-user demo](https://i.ibb.co.com/wrR4nnBB/chat28.png)

**Stack:** NestJS · TypeScript · PostgreSQL · Drizzle ORM · Redis · Socket.io

> Full design notes — session strategy, scaling reasoning, trade-offs — are in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Quick start with Docker (recommended)

The fastest path. Brings up Postgres, Redis, and the API in one command. Tables are auto-created on first start via [db/init.sql](./db/init.sql).

**Prerequisites:** Docker + Docker Compose v2.

```bash
git clone <this-repo-url>
cd nestjs-chat-api
docker compose up -d --build
```

Wait ~30 seconds for the postgres + redis healthchecks to pass and the api to start. Verify:

```bash
docker compose ps
```

All three containers should show `Up ... (healthy)`. The API is now serving on `http://localhost:3000`.

Quick smoke test:

```bash
curl -X POST http://localhost:3000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ali_123"}'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "sessionToken": "<64-char hex>",
    "user": {
      "id": "usr_…",
      "username": "ali_123",
      "createdAt": "2026-05-01T…"
    }
  }
}
```

To stop and remove all containers + volumes:
```bash
docker compose down -v
```

---

## Local development (without Docker)

If you want hot reload while iterating on the source.

**Prerequisites:** Node.js 22+, npm, a running PostgreSQL 16, a running Redis 7.

```bash
git clone <this-repo-url>
cd nestjs-chat-api
npm install
```

Create `.env` in the project root:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://chat:chat@localhost:5432/anonymous_chat
REDIS_URL=redis://localhost:6379
SESSION_TTL_SECONDS=86400
CORS_ORIGIN=*
```

Create the schema in your Postgres database:
```bash
psql "$DATABASE_URL" -f db/init.sql
```

Start the API in watch mode:
```bash
npm run start:dev
```

The API is now serving on `http://localhost:3000`.

---

## Configuration

All config is read from environment variables. The api process never reads from disk for config.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Standard Node env name |
| `PORT` | no | `3000` | Port the HTTP + WebSocket server binds to |
| `DATABASE_URL` | **yes** | — | Postgres connection string, e.g. `postgres://user:pass@host:5432/dbname` |
| `REDIS_URL` | **yes** | — | Redis connection string, e.g. `redis://host:6379` (or `rediss://` for TLS) |
| `SESSION_TTL_SECONDS` | no | `86400` | How long a session token is valid (seconds) |
| `CORS_ORIGIN` | no | `*` | Comma-separated list of allowed origins, or `*` to reflect any |

`docker-compose.yml` exposes two extra knobs for the host-side mapping:

| Variable | Default | Description |
|---|---|---|
| `API_PORT` | `3000` | Host port mapped to the api container's port 3000 |
| `CORS_ORIGIN` | `*` | Forwarded into the api container |

So `API_PORT=4000 CORS_ORIGIN=https://my-frontend.com docker compose up -d` would publish on host port 4000 with CORS limited to that origin.

---

## API summary

Base path `/api/v1`. All requests/responses are JSON. All routes except `/login` require `Authorization: Bearer <sessionToken>`.

Every response is wrapped in an envelope:

- Success → `{ "success": true, "data": { … } }`
- Error → `{ "success": false, "error": { "code": "MACHINE_CODE", "message": "…" } }`

### REST endpoints

| Method | Path | Body / query | Auth | Notes |
|---|---|---|---|---|
| POST | `/api/v1/login` | `{ username }` (2-24 chars, `[A-Za-z0-9_]`) | – | Idempotent by username; returns fresh token each call |
| GET | `/api/v1/rooms` | – | Bearer | `activeUsers` is a live count from Redis |
| POST | `/api/v1/rooms` | `{ name }` (3-32 chars, `[A-Za-z0-9-]`, unique) | Bearer | 409 `ROOM_NAME_TAKEN` on duplicate |
| GET | `/api/v1/rooms/:id` | – | Bearer | 404 `ROOM_NOT_FOUND` |
| DELETE | `/api/v1/rooms/:id` | – | Bearer | Creator only (403 `FORBIDDEN`); cascades message deletion |
| GET | `/api/v1/rooms/:id/messages` | `?limit=50&before=<msgId>` | Bearer | Cursor pagination, newest first |
| POST | `/api/v1/rooms/:id/messages` | `{ content }` (1-1000 chars, trimmed) | Bearer | 422 `INVALID_CONTENT` / `MESSAGE_TOO_LONG` |

Common error codes: `VALIDATION_ERROR` (400) · `UNAUTHORIZED` (401) · `FORBIDDEN` (403) · `ROOM_NOT_FOUND` (404) · `ROOM_NAME_TAKEN` (409) · `INVALID_CONTENT` / `MESSAGE_TOO_LONG` (422).

### WebSocket

Connect to namespace `/chat` with two query params:

```
ws://localhost:3000/chat?token=<sessionToken>&roomId=<roomId>
```

Server → client events:
- `room:joined` — `{ activeUsers: string[] }` (sender only, on connect)
- `room:user_joined` — `{ username, activeUsers }` (broadcast to others)
- `message:new` — `{ id, username, content, createdAt }` (broadcast to all in room)
- `room:user_left` — `{ username, activeUsers }`
- `room:deleted` — `{ roomId }` (broadcast then disconnect)
- `error` — `{ code, status, message }` followed by disconnect (on auth/room failure)

Client → server events:
- `room:leave` (no payload) — graceful leave; server cleans up and emits `room:user_left` to others.

`message:new` is **always** triggered by `POST /messages`, never by a client emit. The REST controller publishes to a Redis channel, which all gateway instances pick up via pattern subscription and broadcast to their local sockets.

---

## Project layout

```
src/
  main.ts                              bootstrap (CORS, validation, filters, WebSocket adapter)
  app.module.ts                        root module
  auth/                                POST /login + AuthService (issues tokens)
  rooms/                               rooms CRUD
  messages/                            messages list / create with cursor pagination
  chat/
    chat.gateway.ts                    Socket.io gateway for /chat namespace
    chat-pubsub.service.ts             Redis pub/sub for REST → WS bridge (per-room channels)
  services/
    user.service.ts                    getOrCreateUser, generateSessionToken, getUserFromToken
    user.module.ts
  database/
    schema.ts                          Drizzle table definitions
    database.service.ts                Drizzle client + connection
  redis/
    redis.service.ts                   Redis client (validates connection on init)
  config/
    socket-io.ts                       Custom IoAdapter wiring @socket.io/redis-adapter
    env.validation.ts                  Zod-based env schema
  common/
    guards/auth.guard.ts               Validates Bearer token, attaches user to request
    filters/http-exception.filter.ts   Wraps exceptions in {success, error: {code, message}}
    interceptors/response-envelope.interceptor.ts   Wraps responses in {success, data}
    decorators/current-user.decorator.ts
    types/request-user.type.ts
    exceptions/app.exception.ts        Typed exception with code + message + status
db/
  init.sql                             Auto-loaded on first postgres container start
docker-compose.yml                     postgres + redis + api
Dockerfile                             Multi-stage build for the api image
```

---

## Testing the deployed API end-to-end

A two-browser test against any reachable instance — local or deployed:

1. **Login as user A** in browser 1, **user B** in browser 2 (different usernames).
2. From either, `POST /api/v1/rooms` with `{"name":"general"}`.
3. Open `ws://<host>/chat?token=<A's token>&roomId=<id>` in browser 1 (Postman's Socket.IO request type works for this).
4. Open the same with user B's token in browser 2.
5. Each should see `room:joined` (own activeUsers) and `room:user_joined` (the other user appearing).
6. Fire `POST /api/v1/rooms/:id/messages` from either browser via REST. Both browsers receive `message:new` over WebSocket.
7. Disconnect browser 2 → browser 1 receives `room:user_left`.
8. `DELETE /api/v1/rooms/:id` from the room creator → both browsers receive `room:deleted` and the connections close.

To verify multi-instance scaling, start two API containers on different ports against the same Postgres + Redis, and connect clients to different ports — messages should still fan out across both.

---

## Useful npm scripts

```bash
npm run start:dev       # ts-node + watch mode
npm run start:prod      # node dist/main (after `npm run build`)
npm run build           # nest build → dist/
npm run lint            # eslint --fix
npm run test            # jest unit tests
npm run test:e2e        # jest e2e tests
```

---

## Deploying

Any Docker-friendly host works. The included `Dockerfile` is multi-stage and produces a small runtime image (`node:22-alpine` base, only production dependencies + compiled `dist/`).

For a production deploy:
- Set `CORS_ORIGIN` to your real frontend origin (don't ship with `*`).
- Use a managed Postgres (RDS, Cloud SQL, Neon) and managed Redis (ElastiCache, Upstash, Redis Cloud). Set `DATABASE_URL` and `REDIS_URL` accordingly.
- Run two or more api instances behind a WebSocket-aware load balancer; the Redis adapter handles cross-instance broadcast.
- Apply `db/init.sql` once against the managed database (or run the equivalent statements via `drizzle-kit push`).

See [ARCHITECTURE.md §3-5](./ARCHITECTURE.md) for the multi-instance scaling reasoning and [§6](./ARCHITECTURE.md) for known limitations.

---

## License

UNLICENSED — submitted as an interview/assignment artefact.
