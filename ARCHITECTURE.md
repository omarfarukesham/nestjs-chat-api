# Architecture

A real-time, room-based anonymous chat backend built on **NestJS**, **PostgreSQL** (via **Drizzle ORM**), **Redis**, and **Socket.io**. REST handles persistent state and command-style operations; WebSocket delivers events in real time. Redis is the synchronisation point that lets the app scale horizontally to multiple instances behind a load balancer.

---

## 1. Overview

### High-level component diagram

```
                       ┌─────────────────────────┐
   HTTPS / WSS         │   Load balancer / nginx │
   ───────────────────▶│   (terminates TLS)       │
                       └────────────┬─────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       ┌────────────┐        ┌────────────┐        ┌────────────┐
       │ NestJS  #1 │        │ NestJS  #2 │  ...   │ NestJS  #N │
       │  (api)     │        │  (api)     │        │  (api)     │
       │  port 3000 │        │  port 3000 │        │  port 3000 │
       └─────┬──────┘        └─────┬──────┘        └─────┬──────┘
             │  Drizzle ORM        │                     │
             ▼                     ▼                     ▼
       ┌──────────────────────────────────────────────────────┐
       │                    PostgreSQL                         │
       │  users · rooms · messages   (durable persistence)     │
       └──────────────────────────────────────────────────────┘

             │  redis (commands)         │  socket.io adapter
             │  redis (pub/sub)          │  (cross-instance broadcast)
             ▼                            ▼
       ┌──────────────────────────────────────────────────────┐
       │                       Redis                           │
       │  session:{token}   →  userId  (TTL = 24h)             │
       │  room:{id}:users   →  SET<username>                   │
       │  channel  room:message:{id}   (REST → WS bridge)      │
       │  channel  room:deleted:{id}   (REST → WS bridge)      │
       │  socket.io adapter pub/sub channels                   │
       └──────────────────────────────────────────────────────┘
```

### Module layout (key files)

| Concern                 | Files                                                      |
| ----------------------- | ---------------------------------------------------------- |
| HTTP API                | `src/auth/*`, `src/rooms/*`, `src/messages/*`              |
| WebSocket gateway       | `src/chat/chat.gateway.ts`                                 |
| Cross-process pub/sub   | `src/chat/chat-pubsub.service.ts`                          |
| Socket.io Redis adapter | `src/config/socket-io.ts`, wired in `src/main.ts`          |
| Sessions / users        | `src/services/user.service.ts`                             |
| Auth guard              | `src/common/guards/auth.guard.ts`                          |
| Response envelope       | `src/common/interceptors/response-envelope.interceptor.ts` |
| Error envelope          | `src/common/filters/http-exception.filter.ts`              |
| DB schema               | `src/database/schema.ts`                                   |
| Tables auto-seed        | `db/init.sql` (mounted into the postgres container)        |

### Request lifecycle

**Successful REST call**

```
client → ValidationPipe → AuthGuard → controller → service → Drizzle / Redis
                                                                    │
              ResponseEnvelopeInterceptor wraps result {success, data}
                                                                    ▼
                                                                 client
```

**Error path (any throw)**

```
service → throw AppException / NestException → HttpExceptionFilter
       → {success: false, error: {code, message}}    [proper status code]
```

---

## 2. Session strategy

Anonymous, username-only auth. There are no passwords; identity is asserted by holding a fresh **session token** issued at login.

| Step                 | Where                                | What happens                                                                                                                                |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                | `POST /api/v1/login`                 | `getOrCreateUser(username)` returns existing user or creates with prefixed id (`usr_<nanoid>`).                                             |
| Token generation     | `UserService.generateSessionToken`   | `crypto.randomBytes(32).toString('hex')` → 64-char opaque token.                                                                            |
| Token storage        | Redis                                | `SET session:<token> <userId> EX 86400` (24-hour TTL). Redis evicts expired tokens automatically.                                           |
| REST validation      | `AuthGuard` on every protected route | Reads `Authorization: Bearer <token>`, calls `UserService.getUserFromToken`, attaches `{userId, username, sessionToken}` to `request.user`. |
| WebSocket validation | `ChatGateway.handleConnection`       | Same `getUserFromToken` flow on the handshake `?token=` query param. Invalid → emit `error` with `code: UNAUTHORIZED`, force-disconnect.    |

**Why session tokens in Redis (not JWT):**

- Server-side revocation works for free (delete the key).
- TTL is enforced by Redis without us writing expiry logic.
- Token payload is one Redis lookup vs. signature verification per request — comparable latency for a single key, but with the win of central control.

**Trade-off:** every protected request makes one Redis round-trip. At scale this becomes the dominant per-request cost, but Redis serves it sub-millisecond.

---

## 3. Real-time scaling: Redis pub/sub fan-out

The core problem: a `POST /rooms/:id/messages` arriving on instance A must reach a WebSocket client connected to instance B. Two distinct mechanisms cooperate:

### A. Socket.io Redis adapter (`@socket.io/redis-adapter`)

Wired in [src/config/socket-io.ts](src/config/socket-io.ts) and installed in [src/main.ts](src/main.ts):

```ts
const ioAdapter = new RedisIoAdapter(app, redisService.client);
await ioAdapter.connectToRedis();
app.useWebSocketAdapter(ioAdapter);
```

The adapter automatically replicates broadcasts done with `socket.to(room).emit(...)` across every NestJS instance via Redis pub/sub. This is what makes `room:user_joined` reach a peer connected to a different process — no custom code needed.

### B. REST → WebSocket bridge via per-room channels

Outbound events triggered by the REST layer (`message:new`, `room:deleted`) cannot use the adapter directly because the REST controller is not a socket. Instead, they round-trip through Redis pub/sub:

```
POST /rooms/:id/messages on instance A
        │
        ▼
MessagesService.createMessage
   ├─ INSERT INTO messages …                  (PostgreSQL)
   └─ ChatPubSubService.publishMessage(roomId, msg)
        │ PUBLISH room:message:{roomId}  <JSON payload>
        ▼
Redis
        │
        ▼ (pSubscribe 'room:message:*')
ChatPubSubService on every instance  →  ChatGateway.afterInit handler
        │
        ▼
this.server.local.to(roomId).emit('message:new', payload)
```

Two non-obvious decisions:

1. **`pSubscribe` with patterns `room:message:*` and `room:deleted:*`** — instead of subscribing/unsubscribing per room as users join/leave, every instance pattern-subscribes once. This avoids per-room subscription bookkeeping and trades a small bandwidth cost (events for empty local rooms are no-ops) for much simpler code.

2. **`server.local.to(...)` not `server.to(...)`** — both forms broadcast to the room, but `server.to(...)` goes through the Socket.io adapter, which would replicate again across instances. Since every instance already receives the Redis pub/sub event independently, using the adapter would multiply broadcasts (a 3-instance cluster would send each `message:new` 3 times to every client). `server.local.*` keeps the broadcast local to whichever instance is emitting, so each client receives exactly one copy.

### Active-user tracking

`room:{roomId}:users` is a Redis SET of usernames. Connect adds, disconnect removes. The REST layer reads counts via `SCARD` (returned as a number in `GET /rooms`); the WebSocket layer reads memberships via `SMEMBERS` (returned as an array in `room:joined` / `room:user_joined` / `room:user_left`).

---

## 4. Estimated capacity (single instance)

A NestJS process running socket.io with the Redis adapter has these dominant costs per WebSocket connection:

| Resource                                            | Per-connection rough cost        |
| --------------------------------------------------- | -------------------------------- |
| Heap (socket object, room membership maps, buffers) | ~25-40 KB                        |
| File descriptors                                    | 1                                |
| TCP send/receive buffer                             | ~16-64 KB (kernel, configurable) |

For a **2 vCPU / 2 GB RAM** instance running this app in Docker (modest production VM):

- Of the 2 GB total, allocate ~1.4 GB to Node (rest for OS + Postgres client + Redis client + headroom).
- At ~40 KB / socket conservatively, that's ~35,000 idle connections by memory alone.
- CPU becomes the bottleneck before that. With Node single-threaded, sustaining ~5,000–10,000 concurrent **active** WebSocket clients (each sending/receiving a few messages per minute) is a realistic target. Past that, event loop latency starts climbing.

**Practical baseline: 5,000–10,000 concurrent users per instance**, validated through the lens of message rate (low rate → higher cap, high rate → lower).

The bigger limit at our concurrency is usually:

- **Postgres write throughput** for `messages` inserts (mitigated by indexed inserts and connection pooling at 5 connections per instance via `postgres-js`).
- **Redis command rate** for the per-connect/disconnect SET operations (a single Redis instance comfortably handles 100k+ ops/sec).

These numbers are estimates; production capacity must be confirmed with load testing using a tool like `k6` or `artillery`.

---

## 5. Scaling to 10× load (~50,000–100,000 concurrent users)

The architecture is designed so this scales horizontally without rewrites:

1. **Add NestJS instances horizontally.** Behind any L4/L7 load balancer that supports sticky sessions or full WebSocket-aware routing (nginx, AWS ALB, Cloudflare). The Redis adapter makes the pool effectively stateless — a client can be on any instance.
2. **Promote Postgres** to a managed HA setup (RDS, Cloud SQL, Neon Pro). Add a read replica and route `GET /rooms` and `GET /messages` queries to it. Tune the existing `messages_room_created_idx` and consider partitioning `messages` by `room_id` once any single room gets very large.
3. **Promote Redis to a clustered or sentinel-backed deployment.** A single Redis node still handles huge throughput, but for HA + headroom move to ElastiCache / Upstash / Redis Cloud cluster mode. The Socket.io Redis adapter supports cluster mode without code changes.
4. **Move messages off the request path.** For sustained high write rates, `POST /messages` could `PUBLISH` immediately and persist asynchronously via a worker consuming from Redis (or move to a streams-style queue: Kafka, NATS JetStream, Redis Streams). This decouples write durability from request latency.
5. **CDN + edge for static and read-heavy paths.** `GET /rooms` cache for short TTLs (5-10 s) at the edge, since `activeUsers` is the only fast-changing field and clients can refresh it via WebSocket events anyway.
6. **Observability** — add OpenTelemetry traces (NestJS has first-class support), Prometheus metrics for connection counts / message throughput, and structured JSON logs. Without these, you cannot tune at scale.
7. **Autoscaling policy** based on event loop lag (libuv) + CPU utilisation. WebSocket-heavy services should never be autoscaled on CPU alone.

---

## 6. Known limitations and trade-offs

- **Multi-tab presence quirk** — `room:{id}:users` is a SET keyed by username, so a user with two open tabs counts once but disconnecting one tab removes them from the SET while the other tab is still connected. Fixing it cleanly needs per-(user, room) socket counting.
- **No FK from `messages.room_id` to `rooms.id`** — room deletion is enforced transactionally in `RoomsService.deleteRoom` instead. Keeps the schema simple, but a stray write could orphan messages.
- **Bearer token in WebSocket query string** — visible in proxy access logs. The `auth: { token }` socket.io option is cleaner; the query-string form was kept to match the assignment contract.
- **No rate limiting** on `POST /messages` or `POST /login` — would add `@nestjs/throttler` (or nginx limits) for production.
- **No message retention policy** — `messages` grows unbounded. Production would prune by age or partition by month.
- **`CORS_ORIGIN: '*'`** is the docker-compose default. Tighten to the real frontend origin in production.
- **Single Redis node** — outage takes down sessions, presence, and the pub/sub bridge together. HA via sentinel/cluster is the production move.
- **Timestamps stored as `bigint` ms-epoch, returned as ISO 8601 strings** — chosen because cursor pagination's `(created_at, id) < cursor` tie-breaker is trivial with integers; `timestamptz` would be more ergonomic for ad-hoc DB queries.
