-- What each code has done: its uploads on its last day of uploading (days since 1970, UTC), for
-- its own daily cap, and the last day it was used at all, so codes nobody uses go
-- (INACTIVE_DAYS). NULL is the day it was made. Only columns are added, with defaults.
ALTER TABLE accounts ADD COLUMN uploads_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN uploads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN used_day INTEGER;

-- In the same transaction as the upload, so only a save that went in counts
CREATE TRIGGER saves_uploads AFTER INSERT ON saves
BEGIN
    UPDATE accounts SET
        uploads = CASE WHEN uploads_day = NEW.created_at / 86400000 THEN uploads + 1 ELSE 1 END,
        uploads_day = NEW.created_at / 86400000,
        used_day = NEW.created_at / 86400000
    WHERE id = NEW.account_id;
END;
