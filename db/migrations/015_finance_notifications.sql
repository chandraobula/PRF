-- Timezone-aware finance reminders with independent in-app, PWA push and
-- optional email delivery. Email remains disabled until the Cloudflare Email
-- binding and a verified sender/destination are configured.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_start_minute INTEGER NOT NULL DEFAULT 1200 CHECK (window_start_minute BETWEEN 0 AND 1439),
  window_end_minute INTEGER NOT NULL DEFAULT 1320 CHECK (window_end_minute BETWEEN 1 AND 1440),
  max_daily_reminders INTEGER NOT NULL DEFAULT 1 CHECK (max_daily_reminders BETWEEN 1 AND 3),
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  push_enabled INTEGER NOT NULL DEFAULT 0,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  expense_reminders INTEGER NOT NULL DEFAULT 1,
  bill_reminders INTEGER NOT NULL DEFAULT 1,
  budget_alerts INTEGER NOT NULL DEFAULT 1,
  friendly_reminders INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  local_date TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_url TEXT NOT NULL DEFAULT '/finance',
  payload_json TEXT NOT NULL DEFAULT '{}',
  channels_json TEXT NOT NULL DEFAULT '["in_app"]',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'partial', 'failed', 'dismissed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'push', 'email')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  provider_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (job_id, channel)
);

CREATE TABLE IF NOT EXISTS app_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES notification_jobs(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'finance',
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_url TEXT NOT NULL DEFAULT '/finance',
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  last_success_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_due
  ON notification_jobs (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_user_date
  ON notification_jobs (user_id, local_date, status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_job
  ON notification_deliveries (job_id, status);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_status
  ON app_notifications (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_status
  ON push_subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_recurring_user_due
  ON finance_recurring_rules (user_id, is_active, type, next_due_on);
