-- AI Dev Planner & Comprehension Tool (admin-only, Stage-0 MVP).
-- Standup notes -> structured tasks -> prompts -> estimates -> status -> comprehension summary -> standup digest.
-- Tables are prefixed planner_ so they never collide with the personal LifeOS modules.
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/004_dev_planner.sql --yes
-- Apply to production with:
--   npx wrangler d1 execute DB --remote --file=db/migrations/004_dev_planner.sql

-- Projects let a developer separate work across multiple SaaS codebases (FRD D4, NFR multi-project).
CREATE TABLE IF NOT EXISTS planner_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_planner_tasks_owner_date ON planner_tasks (created_by, plan_date);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_project ON planner_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_status ON planner_tasks (status, plan_date);
CREATE INDEX IF NOT EXISTS idx_planner_projects_created_by ON planner_projects (created_by);
