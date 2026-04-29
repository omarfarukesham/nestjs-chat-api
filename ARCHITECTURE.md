# Anonymous Chat API Architecture

## 1. Architecture Overview
This backend is a NestJS monolith exposing REST APIs and a Socket.io gateway for anonymous room chat.
Core dependencies are PostgreSQL (durable data), Redis (sessions + realtime state), and Drizzle ORM (typed DB access).
All REST routes are under `/api/v1`, and realtime traffic uses WebSocket namespace `/chat`.

## 2. Component Diagram (ASCII)
```
Clients (HTTP + WS)
        |
        v
+---------------------------+
| NestJS Application        |
|---------------------------|
| Auth Module               |
| Rooms Module              |
| Messages Module           |
| Chat Gateway (/chat)      |
| Common (guard/filter/etc) |
+-------------+-------------+
              |                         +---------------------+
              | Drizzle ORM             | Redis               |
              +-----------------------> | - sessions          |
              |                         | - room presence     |
              |                         | - socket state      |
              |                         | - pub/sub channels  |
              |                         +----------+----------+
              |                                    ^
              v                                    |
        +-------------+                            |
        | PostgreSQL  |----------------------------+
        | - rooms     |    event fan-out / adapter sync
        | - messages  |
        +-------------+
```

## 3. REST Endpoint List
All success responses must use:
```json
{ "success": true, "data": {} }
```

All error responses must use:
```json
{
  "success": false,
  "error": {
    "code": "SNAKE_CASE_ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

Routes:
1. `POST /api/v1/login` (public)
2. `GET /api/v1/rooms` (Bearer token required)
3. `POST /api/v1/rooms` (Bearer token required)
4. `GET /api/v1/rooms/:id` (Bearer token required)
5. `DELETE /api/v1/rooms/:id` (Bearer token required)
6. `GET /api/v1/rooms/:id/messages` (Bearer token required)
7. `POST /api/v1/rooms/:id/messages` (Bearer token required)

## 4. WebSocket Namespace and Events
Namespace: `/chat`

Connection format:
`/chat?token=<sessionToken>&roomId=<roomId>`

Server-to-client events:
1. `room:joined`
2. `room:user_joined`
3. `message:new`
4. `room:user_left`
5. `room:deleted`

Client-to-server event:
1. `room:leave`

## 5. Session Strategy
`POST /login` creates a `sessionToken` with TTL (`SESSION_TTL_SECONDS`) and stores session metadata in Redis.
Every protected REST request validates `Authorization: Bearer <sessionToken>`.
WebSocket connection validates `token` query param and binds socket to session identity.

## 6. Redis Usage
1. Session storage:
   `session:<token> -> { userId, createdAt, ... }` with TTL.
2. Active user tracking per room:
   `room:<roomId>:users` set/hash for user presence.
3. Socket connection state:
   `socket:<socketId> -> { userId, roomId, sessionToken }`.
4. Socket.io scaling via Redis adapter:
   Redis pub/sub channels synchronize room events across app instances.
5. Pub/sub fan-out:
   Internal channels broadcast room/message lifecycle events between modules and nodes.

## 7. Message Broadcast Flow
1. Client posts message (REST) or realtime message input (future extension).
2. Service validates room/session and persists message in PostgreSQL.
3. Service publishes `message:new` through Redis pub/sub.
4. Gateway emits `message:new` to sockets joined to that room.

## 8. Room Deletion Flow
1. Authorized user requests `DELETE /api/v1/rooms/:id`.
2. Room service deletes room metadata and marks message retention policy (hard/soft delete).
3. Redis room presence/state is cleared.
4. Gateway broadcasts `room:deleted` and disconnects or removes room participants.

## 9. Estimated Concurrent User Capacity (One Instance)
For a single mid-size instance (for example 2-4 vCPU, 4-8 GB RAM), a practical baseline is roughly:
- 5,000 to 15,000 concurrent WebSocket connections
- depending on message rate, payload size, and Redis/PostgreSQL latency

This is an estimate and must be validated with load testing.

## 10. Scaling to 10x Load
1. Run multiple NestJS instances behind a load balancer.
2. Use Redis adapter for cross-instance Socket.io room/event synchronization.
3. Move PostgreSQL to managed HA with read replicas and tuned indexes.
4. Introduce message write batching/backpressure and async processing where acceptable.
5. Add caching and query pagination limits for room/message endpoints.
6. Add observability (metrics, tracing, structured logs) and autoscaling policies.

## 11. Known Limitations / Trade-offs
1. Current codebase is scaffold-only; business logic and validation rules are TODO.
2. DTO contracts are placeholders to avoid prematurely locking unknown payload details.
3. Auth guard currently performs placeholder token parsing only.
4. Redis and DB clients are initialized, but operational hardening (retries, circuit breakers) is pending.
5. Final event payload shapes and authorization rules must match assignment contract in implementation phase.
