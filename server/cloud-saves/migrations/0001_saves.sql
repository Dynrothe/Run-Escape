-- An account is a sync code, kept only as its hash. No names, emails or addresses.
-- WITHOUT ROWID: D1 bills every index entry written, and a rowid table keeps its primary key
-- as a second index.
CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    -- SHA-256 of the sync code, as hex
    code_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- The newest few versions of each account's save. The highest revision is the save; the rest
-- are backups. A save is stored as the game sent it (gzipped), never migrated.
CREATE TABLE saves (
    account_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    body BLOB NOT NULL,
    -- The save's own version and the game's (x.y.z), for the newer-game rule
    save_version INTEGER NOT NULL,
    game_version TEXT NOT NULL,
    -- JSON: what the game shows when asking which save to keep
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, revision)
) WITHOUT ROWID;

-- Saves and accounts stored each UTC day, for the daily caps. Old days are pruned daily.
CREATE TABLE daily_intake (
    day TEXT PRIMARY KEY,
    saves INTEGER NOT NULL DEFAULT 0,
    accounts INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE TRIGGER saves_intake AFTER INSERT ON saves
BEGIN
    INSERT INTO daily_intake (day, saves) VALUES (strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch'), 1)
    ON CONFLICT(day) DO UPDATE SET saves = saves + 1;
END;

CREATE TRIGGER accounts_intake AFTER INSERT ON accounts
BEGIN
    INSERT INTO daily_intake (day, accounts) VALUES (strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch'), 1)
    ON CONFLICT(day) DO UPDATE SET accounts = accounts + 1;
END;
