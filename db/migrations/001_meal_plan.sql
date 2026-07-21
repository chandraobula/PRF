-- Meal Planner (Phase 1): weekly meal plan entries.
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/001_meal_plan.sql --yes

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

CREATE INDEX IF NOT EXISTS idx_meal_plan_user_date ON meal_plan_entries (user_id, plan_date, meal_slot);
