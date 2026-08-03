#!/bin/bash

# Run all pending migrations against production D1 database
# Usage: ./scripts/run-migrations.sh [env]
# Default env: production (lifeos-prod)

ENV="${1:-production}"

if [ "$ENV" = "production" ]; then
  DB_NAME="lifeos-prod"
elif [ "$ENV" = "preview" ]; then
  DB_NAME="lifeos-prod"
else
  echo "Unknown environment: $ENV"
  echo "Usage: $0 [production|preview]"
  exit 1
fi

echo "Running migrations against $DB_NAME..."
echo ""

MIGRATIONS=(
  "db/migrations/004_dev_planner.sql"
  "db/migrations/005_planner_workos.sql"
  "db/migrations/006_planner_projects_prompts.sql"
  "db/migrations/007_sticky_notes.sql"
  "db/migrations/008_sticky_notes_font.sql"
  "db/migrations/009_onboarding_flag.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [ -f "$migration" ]; then
    echo "→ Running $migration..."
    wrangler d1 execute "$DB_NAME" --file "$migration"
    if [ $? -eq 0 ]; then
      echo "  ✓ Success"
    else
      echo "  ✗ Failed"
      exit 1
    fi
    echo ""
  else
    echo "✗ Migration file not found: $migration"
    exit 1
  fi
done

echo "✓ All migrations completed successfully!"
