-- Daily Compass: a personal course-correction system for routines, focus,
-- lightweight daily check-ins, resets, and reflection.
--
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/014_daily_compass.sql --yes
-- Apply to production with:
--   npx wrangler d1 execute DB --remote --file=db/migrations/014_daily_compass.sql --yes

CREATE TABLE IF NOT EXISTS compass_focus_themes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  starts_on TEXT,
  ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compass_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My daily rhythm',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  focus_theme_id TEXT REFERENCES compass_focus_themes(id) ON DELETE SET NULL,
  default_grace_minutes INTEGER NOT NULL DEFAULT 20 CHECK (default_grace_minutes BETWEEN 0 AND 180),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compass_blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES compass_plans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wake', 'exercise', 'prepare', 'deep_work', 'reset', 'recovery', 'learning', 'reflection', 'wind_down', 'custom')),
  title TEXT NOT NULL,
  instruction TEXT,
  days_mask INTEGER NOT NULL DEFAULT 127 CHECK (days_mask BETWEEN 1 AND 127),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 720),
  grace_minutes INTEGER CHECK (grace_minutes BETWEEN 0 AND 180),
  action_type TEXT,
  action_target_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compass_days (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  important_thing TEXT,
  capture_text TEXT,
  learn_text TEXT,
  tomorrow_text TEXT,
  reset_count INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, local_date)
);

CREATE TABLE IF NOT EXISTS compass_block_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  block_id TEXT NOT NULL REFERENCES compass_blocks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'released')),
  started_at TEXT,
  completed_at TEXT,
  actual_minutes INTEGER CHECK (actual_minutes IS NULL OR actual_minutes >= 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, local_date, block_id)
);

CREATE TABLE IF NOT EXISTS compass_daily_checks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  check_key TEXT NOT NULL CHECK (check_key IN ('sleep', 'exercise', 'deep_work', 'learn_build', 'reflection')),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, local_date, check_key)
);

CREATE TABLE IF NOT EXISTS compass_reset_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resume_block_id TEXT REFERENCES compass_blocks(id) ON DELETE SET NULL,
  reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compass_plans_one_active
  ON compass_plans (user_id) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_compass_blocks_active_schedule
  ON compass_blocks (user_id, plan_id, is_enabled, start_minute);
CREATE INDEX IF NOT EXISTS idx_compass_days_user_date
  ON compass_days (user_id, local_date);
CREATE INDEX IF NOT EXISTS idx_compass_events_user_date
  ON compass_block_events (user_id, local_date, block_id);
CREATE INDEX IF NOT EXISTS idx_compass_resets_user_date
  ON compass_reset_events (user_id, local_date, occurred_at);
CREATE INDEX IF NOT EXISTS idx_compass_themes_user_status
  ON compass_focus_themes (user_id, status, starts_on);
