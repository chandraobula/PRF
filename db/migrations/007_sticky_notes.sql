-- Sticky notes for the Work Hub board.
--
-- Kept separate from the general `notes` table: these carry board-specific
-- presentation state (colour, pin rotation, ordering) and are edited inline with
-- autosave rather than through a form, so they have very different write
-- patterns and lifecycle.

CREATE TABLE IF NOT EXISTS sticky_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board TEXT NOT NULL DEFAULT 'work',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  -- Small per-note tilt (degrees) so the board reads as physical paper.
  rotation REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sticky_notes_user_board
  ON sticky_notes (user_id, board, status, sort_order);
