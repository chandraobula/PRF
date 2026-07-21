-- Life-admin modules: Subscriptions & bill radar, Important-dates vault, Notes / inbox.
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/003_life_admin.sql --yes

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  previous_amount_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  cadence TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  next_renewal_on TEXT,
  reminder_days_before INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  merchant_key TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS important_dates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('passport', 'license', 'visa', 'warranty', 'insurance', 'registration', 'birthday', 'anniversary', 'subscription', 'tax', 'medical', 'other')),
  person TEXT,
  due_on TEXT NOT NULL,
  recurs TEXT NOT NULL DEFAULT 'none' CHECK (recurs IN ('none', 'annual', 'monthly')),
  reminder_days_before INTEGER NOT NULL DEFAULT 14,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'idea', 'question', 'follow_up')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions (user_id, status, next_renewal_on);
CREATE INDEX IF NOT EXISTS idx_important_dates_user ON important_dates (user_id, status, due_on);
CREATE INDEX IF NOT EXISTS idx_notes_user_status ON notes (user_id, status, created_at DESC);
