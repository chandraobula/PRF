PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user', 'suspended')),
  -- Set to 1 at successful account creation. Once true, onboarding is never shown again.
  -- Defaults to 1 so existing users (who implicitly completed it) aren't shown it on next login.
  has_completed_onboarding INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  secondary_currency TEXT NOT NULL DEFAULT 'INR',
  enabled_currencies_json TEXT NOT NULL DEFAULT '["USD","INR"]',
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  month_start_day INTEGER NOT NULL DEFAULT 1 CHECK (month_start_day BETWEEN 1 AND 28),
  default_account_id TEXT,
  dashboard_widgets_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES finance_categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  color TEXT NOT NULL DEFAULT '#0058be',
  icon TEXT NOT NULL DEFAULT 'Circle',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name, type)
);

CREATE TABLE IF NOT EXISTS finance_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'credit_card', 'wallet', 'loan', 'investment', 'other')),
  currency TEXT NOT NULL DEFAULT 'USD',
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  current_balance_minor INTEGER NOT NULL DEFAULT 0,
  institution TEXT,
  last_four TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
  file_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'metadata_only' CHECK (upload_status IN ('metadata_only', 'pending_upload', 'uploaded', 'extracted', 'failed')),
  extracted_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_recurring_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  amount_minor INTEGER,
  expected_amount_minor INTEGER,
  category_id TEXT REFERENCES finance_categories(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
  merchant TEXT,
  next_due_on TEXT,
  ends_on TEXT,
  reminder_days_before INTEGER NOT NULL DEFAULT 2,
  is_variable INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES finance_categories(id) ON DELETE SET NULL,
  receipt_id TEXT REFERENCES finance_receipts(id) ON DELETE SET NULL,
  recurring_rule_id TEXT REFERENCES finance_recurring_rules(id) ON DELETE SET NULL,
  transfer_group_id TEXT,
  duplicate_of_id TEXT REFERENCES finance_transactions(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'refund')),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'pending', 'deleted')),
  occurred_on TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  merchant TEXT,
  payee TEXT,
  payment_method TEXT,
  notes TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'receipt', 'import', 'recurring', 'ai', 'system')),
  ai_category_confidence REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_transaction_splits (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES finance_categories(id) ON DELETE SET NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES finance_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly', 'yearly', 'custom')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  limit_minor INTEGER NOT NULL CHECK (limit_minor >= 0),
  carry_forward_minor INTEGER NOT NULL DEFAULT 0,
  alert_threshold_percent INTEGER NOT NULL DEFAULT 80,
  is_flexible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_budget_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('emergency_fund', 'vacation', 'vehicle', 'house', 'education', 'wedding', 'gadget', 'custom')),
  target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor >= 0),
  saved_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (saved_amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  target_date TEXT,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  recommendation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_goal_milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES finance_goals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor >= 0),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_ai_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('category', 'duplicate', 'subscription', 'anomaly', 'summary', 'recommendation', 'forecast', 'habit')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'positive', 'warning', 'critical')),
  action_label TEXT,
  action_url TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_type TEXT NOT NULL CHECK (habit_type IN ('daily_check_in', 'weekly_review', 'monthly_review', 'spending_streak', 'savings_streak', 'challenge')),
  name TEXT NOT NULL,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_completed_on TEXT,
  cadence TEXT NOT NULL DEFAULT 'daily',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('monthly', 'annual', 'expense', 'income', 'category', 'goal', 'budget', 'savings')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('recurring_due', 'budget_limit', 'goal_milestone', 'weekly_summary', 'monthly_summary', 'missing_transaction', 'inactivity')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  due_at TEXT,
  channel TEXT NOT NULL DEFAULT 'in_app',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_saved_filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_liabilities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT,
  liability_type TEXT NOT NULL CHECK (liability_type IN ('loan', 'credit_card', 'emi', 'mortgage', 'other')),
  currency TEXT NOT NULL DEFAULT 'USD',
  original_amount_minor INTEGER NOT NULL CHECK (original_amount_minor >= 0),
  paid_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount_minor >= 0),
  apr_percent REAL NOT NULL DEFAULT 0,
  monthly_payment_minor INTEGER NOT NULL DEFAULT 0,
  next_payment_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pantry_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Miscellaneous',
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'item',
  location TEXT,
  low_stock_threshold REAL NOT NULL DEFAULT 1 CHECK (low_stock_threshold >= 0),
  expires_on TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pantry_shopping_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pantry_item_id TEXT REFERENCES pantry_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Miscellaneous',
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'item',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'low_stock', 'recipe', 'system')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'purchased', 'dismissed', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pantry_recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  ingredients_json TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL DEFAULT '[]',
  missing_items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date TEXT NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id TEXT REFERENCES pantry_recipes(id) ON DELETE SET NULL,
  custom_title TEXT,
  servings REAL NOT NULL DEFAULT 1 CHECK (servings >= 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'cooked', 'skipped', 'leftover')),
  leftover_of_id TEXT REFERENCES meal_plan_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  odometer_miles INTEGER NOT NULL DEFAULT 0 CHECK (odometer_miles >= 0),
  battery_percent INTEGER CHECK (battery_percent BETWEEN 0 AND 100),
  range_miles INTEGER CHECK (range_miles >= 0),
  interior_temp_f INTEGER,
  location TEXT,
  purchase_price_minor INTEGER,
  current_value_minor INTEGER,
  insurance_provider TEXT,
  policy_number TEXT,
  insurance_expires_on TEXT,
  registration_expires_on TEXT,
  warranty_expires_on TEXT,
  status TEXT NOT NULL DEFAULT 'parked' CHECK (status IN ('parked', 'driving', 'charging', 'service', 'inactive', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_maintenance_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_mileage INTEGER,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'scheduled', 'done', 'dismissed', 'deleted')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS finance_usage_counters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  limit_count INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, counter_key, period_start)
);

CREATE VIRTUAL TABLE IF NOT EXISTS finance_transactions_fts USING fts5(
  merchant,
  notes,
  tags,
  content='finance_transactions',
  content_rowid='rowid'
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_user_date ON finance_transactions (user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_user_type ON finance_transactions (user_id, type);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_user_currency ON finance_transactions (user_id, currency);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_user_category ON finance_transactions (user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_user_period ON finance_budgets (user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_finance_goals_user_status ON finance_goals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_insights_user_created ON finance_ai_insights (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_notifications_user_status ON finance_notifications (user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions (session_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_status ON pantry_items (user_id, status, category);
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_expiry ON pantry_items (user_id, expires_on);
CREATE INDEX IF NOT EXISTS idx_pantry_shopping_user_status ON pantry_shopping_items (user_id, status);
CREATE INDEX IF NOT EXISTS idx_meal_plan_user_date ON meal_plan_entries (user_id, plan_date, meal_slot);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions (user_id, status, next_renewal_on);
CREATE INDEX IF NOT EXISTS idx_important_dates_user ON important_dates (user_id, status, due_on);
CREATE INDEX IF NOT EXISTS idx_notes_user_status ON notes (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_user_status ON vehicles (user_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_user_status ON vehicle_maintenance_items (user_id, status, due_date);

-- ── Admin Tables ─────────────────────────────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_feature_limits (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user',
  feature_key TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, feature_key)
);

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

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_announcements_active ON admin_announcements(is_active, starts_at);

-- ---------------------------------------------------------------------------
-- AI Dev Planner & Comprehension Tool (admin-only)
-- ---------------------------------------------------------------------------

-- Projects let a developer separate work across multiple SaaS codebases (FRD D4, NFR multi-project).
CREATE TABLE IF NOT EXISTS planner_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  repo_url TEXT,
  tech_stack_json TEXT NOT NULL DEFAULT '[]',
  architecture TEXT,
  coding_standards TEXT,
  folder_structure TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_prompt_templates (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES planner_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_planner_prompt_templates_project ON planner_prompt_templates (project_id, category);

-- The single core entity (maps FRD section 9 Task). Drafts from note-parsing are held
-- in the browser and only inserted here on "Accept", so there is no staging table.
CREATE TABLE IF NOT EXISTS planner_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES planner_projects(id) ON DELETE SET NULL,
  project_tag TEXT,
  plan_date TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'done', 'blocked')),
  estimate_label TEXT,
  estimated_minutes INTEGER,
  estimate_source TEXT NOT NULL DEFAULT 'ai' CHECK (estimate_source IN ('ai', 'manual')),
  actual_minutes INTEGER,
  generated_prompt TEXT,
  prompt_used TEXT,
  comprehension_input TEXT,
  comprehension_summary TEXT,
  user_annotation TEXT,
  comprehension_question TEXT,
  user_answer TEXT,
  summary_feedback TEXT CHECK (summary_feedback IN ('up', 'down')),
  meeting_id TEXT REFERENCES planner_meetings(id) ON DELETE SET NULL,
  deliverable_id TEXT REFERENCES planner_deliverables(id) ON DELETE SET NULL,
  confidence REAL,
  source_excerpt TEXT,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  validation_status TEXT NOT NULL DEFAULT 'pending',
  scheduled_minute INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_meetings (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES planner_projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  meeting_date TEXT,
  source_type TEXT NOT NULL DEFAULT 'paste' CHECK (source_type IN ('paste', 'upload')),
  raw_text TEXT NOT NULL DEFAULT '',
  summary TEXT,
  objectives_json TEXT NOT NULL DEFAULT '[]',
  participants_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('pending', 'processed', 'failed')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_deliverables (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES planner_meetings(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES planner_projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  note TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'relates', 'subtask')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_planner_tasks_owner_date ON planner_tasks (created_by, plan_date);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_project ON planner_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_status ON planner_tasks (status, plan_date);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_meeting ON planner_tasks (meeting_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_deliverable ON planner_tasks (deliverable_id);
CREATE INDEX IF NOT EXISTS idx_planner_projects_created_by ON planner_projects (created_by);
CREATE INDEX IF NOT EXISTS idx_planner_meetings_owner ON planner_meetings (created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_planner_deliverables_meeting ON planner_deliverables (meeting_id, order_index);
CREATE INDEX IF NOT EXISTS idx_planner_task_deps_task ON planner_task_dependencies (task_id);
CREATE INDEX IF NOT EXISTS idx_planner_task_deps_depends ON planner_task_dependencies (depends_on_task_id);

-- Sticky notes for the Work Hub board. Mirrors db/migrations/007_sticky_notes.sql
-- so a fresh setup and an existing database end up with the same table.
CREATE TABLE IF NOT EXISTS sticky_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board TEXT NOT NULL DEFAULT 'work',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  -- 'hand' = Caveat, 'print' = Patrick Hand, 'clean' = Inter.
  font TEXT NOT NULL DEFAULT 'hand',
  rotation REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sticky_notes_user_board
  ON sticky_notes (user_id, board, status, sort_order);
