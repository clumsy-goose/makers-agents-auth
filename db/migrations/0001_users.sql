-- ============================================================================
-- 0001_users.sql  ·  EdgeOne Pages Agent · 鉴权方案一(Neon Postgres)
-- ----------------------------------------------------------------------------
-- 在 Neon 控制台 SQL Editor 直接粘贴执行,或通过 psql:
--   psql "$DATABASE_URL" -f db/migrations/0001_users.sql
--
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- 用于 gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,       
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uniq
  ON users (LOWER(username));

CREATE INDEX IF NOT EXISTS users_created_at_idx
  ON users (created_at DESC);
