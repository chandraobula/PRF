-- LifeOS Admin Architecture Migration
-- Adds role-based access control, audit logging, platform config,
-- feature limits, and announcements.

-- 1. Add role column to users table
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('owner', 'admin', 'user', 'suspended'));

-- 2. Audit log for all critical admin actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Platform-level configuration (key-value store)
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Feature limits per role
CREATE TABLE IF NOT EXISTS admin_feature_limits (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user',
  feature_key TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, feature_key)
);

-- 5. Announcements from admin to all users
CREATE TABLE IF NOT EXISTS admin_announcements (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  is_active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_announcements_active ON admin_announcements(is_active, starts_at);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Default platform configuration
INSERT OR IGNORE INTO admin_config (key, value) VALUES ('registration_open', 'true');
INSERT OR IGNORE INTO admin_config (key, value) VALUES ('max_users', '0');
INSERT OR IGNORE INTO admin_config (key, value) VALUES ('default_currency', 'USD');
INSERT OR IGNORE INTO admin_config (key, value) VALUES ('app_name', 'LifeOS');
