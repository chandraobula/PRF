-- Real, DB-backed storage for the Settings page (notifications, appearance,
-- language/region) and the Connect Services page (per-user integration
-- connection state). Both screens previously rendered hardcoded/sample data
-- with no persistence — every toggle and connect/disconnect button now reads
-- and writes here.
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/010_user_settings.sql --yes
-- Apply to production with:
--   npx wrangler d1 execute DB --remote --file=db/migrations/010_user_settings.sql

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  reduce_motion INTEGER NOT NULL DEFAULT 0,
  text_size TEXT NOT NULL DEFAULT 'medium' CHECK (text_size IN ('small', 'medium', 'large')),
  language TEXT NOT NULL DEFAULT 'en',
  region TEXT NOT NULL DEFAULT 'IN',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  notify_daily_briefing INTEGER NOT NULL DEFAULT 1,
  notify_bills INTEGER NOT NULL DEFAULT 1,
  notify_focus_sessions INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per (user, service) once a user has touched that integration's
-- connect/disconnect state. Rows are created lazily on first PATCH; a
-- missing row means the default catalog status (disconnected) applies.
CREATE TABLE IF NOT EXISTS user_integrations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  connected_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, service)
);
