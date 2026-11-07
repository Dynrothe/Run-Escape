-- What a co-op relay's run checks (server/coop-checks.mjs) found: one row for each run they found
-- anything in, sent by the relay, so a host's game can't leave its row out. Nothing joins it to
-- runs, which the host's game sends, but the same run's rows share their day, build, map, mode,
-- party and adventurers, and arrive within moments of each other.
CREATE TABLE run_checks (
    -- UTC day the collector received it
    day TEXT NOT NULL,
    check_id TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    relay TEXT NOT NULL CHECK (relay IN ('node', 'cloudflare')),
    -- As the host's game said; "unknown" where it said something no game would
    build TEXT NOT NULL,
    -- The room's, as the relay had them
    map_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    endless INTEGER NOT NULL CHECK (endless IN (0, 1)),
    -- As the host's start said, like build
    characters TEXT NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 4),
    -- How far the run had got, by the host's frames
    run_seconds REAL NOT NULL,
    -- How many of each kind the checks found
    ahead INTEGER NOT NULL,
    move INTEGER NOT NULL,
    action INTEGER NOT NULL,
    auto INTEGER NOT NULL,
    desync INTEGER NOT NULL,
    -- The kind the host was caught by, or NULL
    caught TEXT CHECK (caught IN ('ahead', 'move', 'action', 'auto')),
    -- The relay ended the run (MULTIPLAYER_RUN_CHECKS=end)
    ended INTEGER NOT NULL CHECK (ended IN (0, 1)),
    PRIMARY KEY (day, check_id)
) WITHOUT ROWID;

-- Rows accepted each day, so the collector can stop at MAX_CHECKS_PER_DAY with one row read
CREATE TABLE daily_check_intake (
    day TEXT PRIMARY KEY,
    checks INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TRIGGER run_checks_daily_insert AFTER INSERT ON run_checks BEGIN
    INSERT INTO daily_check_intake (day, checks) VALUES (NEW.day, 1)
        ON CONFLICT (day) DO UPDATE SET checks = daily_check_intake.checks + 1;
END;
