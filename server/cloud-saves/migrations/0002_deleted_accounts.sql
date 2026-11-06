-- Deleting a sync code only marks it, with when (Unix ms). Its saves stay, and the code can
-- restore them, until the hourly job removes them after DELETED_RETENTION_DAYS: a code that's
-- leaked can't wipe every version at once.
ALTER TABLE accounts ADD COLUMN deleted_at INTEGER;

-- Only deleted codes are in it, so it costs nothing to write the rest
CREATE INDEX accounts_deleted ON accounts(deleted_at) WHERE deleted_at IS NOT NULL;
