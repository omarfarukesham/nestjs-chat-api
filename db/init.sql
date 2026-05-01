-- Schema for anonymous_chat. Loaded automatically by the postgres image
-- on first container start (executed once per fresh data volume).

CREATE TABLE IF NOT EXISTS users (
  id         text   PRIMARY KEY,
  username   text   NOT NULL UNIQUE,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id         text   PRIMARY KEY,
  name       text   NOT NULL UNIQUE,
  created_by text   NOT NULL,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         text   PRIMARY KEY,
  room_id    text   NOT NULL,
  username   text   NOT NULL,
  content    text   NOT NULL,
  created_at bigint NOT NULL
);

-- Composite index supports cursor pagination ordering
-- (created_at DESC, id DESC) used by GET /api/v1/rooms/:id/messages.
CREATE INDEX IF NOT EXISTS messages_room_created_idx
  ON messages (room_id, created_at DESC, id DESC);
