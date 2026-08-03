-- Per-note typeface for the Work Hub sticky board.
-- 'hand' = Caveat, 'print' = Patrick Hand, 'clean' = Inter.
ALTER TABLE sticky_notes ADD COLUMN font TEXT NOT NULL DEFAULT 'hand';
