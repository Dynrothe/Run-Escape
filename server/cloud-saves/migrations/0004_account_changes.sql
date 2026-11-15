-- Deletes, restores and new codes made each UTC day, for MAX_ACCOUNT_CHANGES_PER_DAY: each writes
-- a code's row, so they're capped like saves and new codes. Only a column is added, with a default.
ALTER TABLE daily_intake ADD COLUMN changes INTEGER NOT NULL DEFAULT 0;
