-- AI Dev Planner — project context + prompt library (admin-only).
-- Adds project-level engineering context (repo, tech stack, architecture, standards)
-- and a reusable prompt-template library, backing the Projects and Project Detail screens.
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/006_planner_projects_prompts.sql --yes
-- Apply to production with:
--   npx wrangler d1 execute DB --remote --file=db/migrations/006_planner_projects_prompts.sql

ALTER TABLE planner_projects ADD COLUMN code TEXT;
ALTER TABLE planner_projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE planner_projects ADD COLUMN repo_url TEXT;
ALTER TABLE planner_projects ADD COLUMN tech_stack_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE planner_projects ADD COLUMN architecture TEXT;
ALTER TABLE planner_projects ADD COLUMN coding_standards TEXT;
ALTER TABLE planner_projects ADD COLUMN folder_structure TEXT;

-- Reusable prompt templates, optionally scoped to a project (Prompt Library tab).
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
