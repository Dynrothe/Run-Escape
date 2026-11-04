-- One anonymous row per solo/party run. UUID retries don't fire the insert trigger again.
-- WITHOUT ROWID: D1 bills every index entry written, and a rowid table keeps its primary key
-- as a second index.
CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    -- UTC day the collector received it, not the client's clock
    day TEXT NOT NULL,
    ended_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    version TEXT NOT NULL,
    build TEXT NOT NULL,
    play_type TEXT NOT NULL CHECK (play_type IN ('singleplayer', 'multiplayer')),
    relay TEXT NOT NULL CHECK (relay IN ('none', 'node', 'cloudflare')),
    map_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 4),
    -- The starting party's adventurer ids, sorted and comma-separated
    characters TEXT NOT NULL,
    endless INTEGER NOT NULL CHECK (endless IN (0, 1)),
    outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'abandoned', 'disconnected')),
    duration_seconds REAL NOT NULL,
    round INTEGER NOT NULL,
    level INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    coins INTEGER NOT NULL,
    damage_dealt REAL NOT NULL,
    dps REAL NOT NULL,
    damage_taken REAL NOT NULL,
    healed REAL NOT NULL,
    highest_hit REAL NOT NULL,
    caskets INTEGER NOT NULL,
    players_left INTEGER NOT NULL,
    eligible INTEGER NOT NULL CHECK (eligible IN (0, 1)),
    leaderboard_score REAL NOT NULL
) WITHOUT ROWID;

CREATE INDEX runs_day ON runs(day);
-- Every leading field is required by the leaderboard API. LIMIT reads only the top N,
-- with no sorting or scan of other days, maps, versions, modes or party sizes.
CREATE INDEX runs_leaderboard ON runs(
    day, map_id, play_type, mode, party_size, endless, version,
    leaderboard_score DESC, run_id
) WHERE eligible = 1;

-- Raw rows expire (RAW_RETENTION_DAYS); these totals stay (DAILY_RETENTION_DAYS). A new
-- dimension here means a new table, so party composition stays in the raw rows.
CREATE TABLE daily_stats (
    day TEXT NOT NULL,
    play_type TEXT NOT NULL,
    relay TEXT NOT NULL,
    map_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    endless INTEGER NOT NULL,
    version TEXT NOT NULL,
    outcome TEXT NOT NULL,
    runs INTEGER NOT NULL,
    duration_seconds REAL NOT NULL,
    kills INTEGER NOT NULL,
    coins INTEGER NOT NULL,
    damage_dealt REAL NOT NULL,
    damage_taken REAL NOT NULL,
    healed REAL NOT NULL,
    highest_hit REAL NOT NULL,
    caskets INTEGER NOT NULL,
    PRIMARY KEY (day, play_type, relay, map_id, mode, party_size, endless, version, outcome)
) WITHOUT ROWID;

-- Runs accepted each day, so the collector can stop at MAX_RUNS_PER_DAY with one row read
CREATE TABLE daily_intake (
    day TEXT PRIMARY KEY,
    runs INTEGER NOT NULL
) WITHOUT ROWID;

-- Atomic with the run insert. A retry, concurrent duplicate, or failed transaction cannot
-- increment the daily totals without inserting exactly one new run.
CREATE TRIGGER runs_daily_insert AFTER INSERT ON runs BEGIN
    INSERT INTO daily_stats (
        day, play_type, relay, map_id, mode, party_size, endless, version, outcome,
        runs, duration_seconds, kills, coins, damage_dealt, damage_taken, healed, highest_hit, caskets
    ) VALUES (
        NEW.day, NEW.play_type, NEW.relay, NEW.map_id, NEW.mode, NEW.party_size, NEW.endless, NEW.version, NEW.outcome,
        1, NEW.duration_seconds, NEW.kills, NEW.coins, NEW.damage_dealt, NEW.damage_taken, NEW.healed, NEW.highest_hit, NEW.caskets
    ) ON CONFLICT (day, play_type, relay, map_id, mode, party_size, endless, version, outcome) DO UPDATE SET
        runs = daily_stats.runs + 1,
        duration_seconds = daily_stats.duration_seconds + excluded.duration_seconds,
        kills = daily_stats.kills + excluded.kills,
        coins = daily_stats.coins + excluded.coins,
        damage_dealt = daily_stats.damage_dealt + excluded.damage_dealt,
        damage_taken = daily_stats.damage_taken + excluded.damage_taken,
        healed = daily_stats.healed + excluded.healed,
        highest_hit = MAX(daily_stats.highest_hit, excluded.highest_hit),
        caskets = daily_stats.caskets + excluded.caskets;
    INSERT INTO daily_intake (day, runs) VALUES (NEW.day, 1)
        ON CONFLICT (day) DO UPDATE SET runs = daily_intake.runs + 1;
END;
