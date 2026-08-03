-- AI Dev Planner — WorkOS extension (admin-only).
-- Adds a MOM/meeting + deliverables layer above tasks, task-to-task dependencies,
-- task provenance/confidence/priority, and weekly time-blocking (scheduled_minute).
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/005_planner_workos.sql --yes
-- Apply to production with:
--   npx wrangler d1 execute DB --remote --file=db/migrations/005_planner_workos.sql

-- A parsed Minutes-of-Meeting: the single source that deliverables and tasks trace back to.
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

-- A deliverable groups several tasks and sits between a meeting and its tasks.
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

-- Directed "task depends on task" edges (blocks / relates / subtask).
CREATE TABLE IF NOT EXISTS planner_task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'relates', 'subtask')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (task_id, depends_on_task_id)
);

-- Extend planner_tasks with provenance, priority, validation state and time-blocking.
ALTER TABLE planner_tasks ADD COLUMN meeting_id TEXT REFERENCES planner_meetings(id) ON DELETE SET NULL;
ALTER TABLE planner_tasks ADD COLUMN deliverable_id TEXT REFERENCES planner_deliverables(id) ON DELETE SET NULL;
ALTER TABLE planner_tasks ADD COLUMN confidence REAL;
ALTER TABLE planner_tasks ADD COLUMN source_excerpt TEXT;
ALTER TABLE planner_tasks ADD COLUMN category TEXT;
ALTER TABLE planner_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE planner_tasks ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE planner_tasks ADD COLUMN scheduled_minute INTEGER;

CREATE INDEX IF NOT EXISTS idx_planner_meetings_owner ON planner_meetings (created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_planner_meetings_project ON planner_meetings (project_id);
CREATE INDEX IF NOT EXISTS idx_planner_deliverables_meeting ON planner_deliverables (meeting_id, order_index);
CREATE INDEX IF NOT EXISTS idx_planner_deliverables_project ON planner_deliverables (project_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_meeting ON planner_tasks (meeting_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_deliverable ON planner_tasks (deliverable_id);
CREATE INDEX IF NOT EXISTS idx_planner_task_deps_task ON planner_task_dependencies (task_id);
CREATE INDEX IF NOT EXISTS idx_planner_task_deps_depends ON planner_task_dependencies (depends_on_task_id);
