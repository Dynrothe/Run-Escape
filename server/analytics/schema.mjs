// What the collector accepts. It checks shape and range only: which maps are endless, where
// expert exists and so on are the game's rules, so new content reaches the collector without a
// deploy. Ids are bounded by their format, and MAX_RUNS_PER_DAY bounds what anyone can add.
export const ID = /^[a-z0-9_]{1,40}$/;
export const PLAY_TYPES = new Set(["singleplayer", "multiplayer"]);
export const OUTCOMES = new Set(["completed", "failed", "abandoned", "disconnected"]);
export const RELAYS = new Set(["none", "node", "cloudflare"]);
export const DAY_MS = 86_400_000;
export const utcDay = (time) => new Date(time).toISOString().slice(0, 10);
export const isId = (v) => typeof v === "string" && ID.test(v);
export const validVersion = (v) => typeof v === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v);
export const validDay = (v) =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    utcDay(Date.parse(v)) === v;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function number(value, max, integer = false) {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= max &&
        (!integer || Number.isInteger(value))
    );
}

// schemaVersion 1, as RunAnalytics.ts sends it. Only these fields enter the database: names,
// addresses, room codes and arbitrary JSON don't.
function readV1(value, now) {
    if (
        typeof value.runId !== "string" ||
        !UUID.test(value.runId) ||
        !validVersion(value.version) ||
        typeof value.build !== "string" ||
        !/^[a-zA-Z0-9._-]{1,80}$/.test(value.build) ||
        !isId(value.mapId) ||
        !isId(value.mode) ||
        !PLAY_TYPES.has(value.playType) ||
        !OUTCOMES.has(value.outcome) ||
        !RELAYS.has(value.relay) ||
        (value.playType === "singleplayer") !== (value.relay === "none") ||
        typeof value.endless !== "boolean" ||
        !number(value.partySize, 4, true) ||
        value.partySize < 1 ||
        (value.playType === "singleplayer" && value.partySize !== 1) ||
        !Array.isArray(value.characters) ||
        value.characters.length !== value.partySize ||
        !value.characters.every(isId) ||
        // Old enough to be a replay, or a clock that's a day out
        !Number.isSafeInteger(value.endedAt) ||
        Math.abs(value.endedAt - now) > DAY_MS ||
        !number(value.durationSeconds, 7 * 86400) ||
        (value.durationSeconds > 0 && value.durationSeconds < 0.02) ||
        !number(value.round, 100_000, true) ||
        value.round < 1 ||
        !number(value.level, 1_000_000, true) ||
        !number(value.kills, 1_000_000_000, true) ||
        !number(value.coins, 1_000_000_000_000, true) ||
        !number(value.damageDealt, 1e15) ||
        !number(value.damageTaken, 1e15) ||
        !number(value.healed, 1e15) ||
        !number(value.highestHit, 1e15) ||
        !number(value.caskets, 1_000_000_000, true) ||
        !number(value.playersLeft, value.partySize, true)
    ) {
        return undefined;
    }
    const eligible =
        value.playersLeft === 0 &&
        value.durationSeconds > 0 &&
        (value.endless
            ? ["failed", "abandoned"].includes(value.outcome)
            : value.outcome === "completed");
    return {
        run_id: value.runId.toLowerCase(),
        // The collector's day, so a client's clock can't pick its leaderboard
        day: utcDay(now),
        ended_at: value.endedAt,
        received_at: now,
        version: value.version,
        build: value.build,
        play_type: value.playType,
        relay: value.relay,
        map_id: value.mapId,
        mode: value.mode,
        party_size: value.partySize,
        characters: [...value.characters].sort().join(","),
        endless: Number(value.endless),
        outcome: value.outcome,
        duration_seconds: value.durationSeconds,
        round: value.round,
        level: value.level,
        kills: value.kills,
        coins: value.coins,
        damage_dealt: value.damageDealt,
        dps: value.durationSeconds > 0 ? value.damageDealt / value.durationSeconds : 0,
        damage_taken: value.damageTaken,
        healed: value.healed,
        highest_hit: value.highestHit,
        caskets: value.caskets,
        players_left: value.playersLeft,
        eligible: Number(eligible),
        leaderboard_score: value.endless ? value.durationSeconds : -value.durationSeconds,
    };
}

// Each report shape the collector still reads, by schemaVersion. When the game sends a new one,
// add its reader here and keep the old one while older games are still played: each maps its
// report onto the same columns.
const READERS = new Map([[1, readV1]]);

export function validateRun(value, now = Date.now()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    return READERS.get(value.schemaVersion)?.(value, now);
}

// What a co-op relay's run checks find (server/coop-checks.mjs's RUN_CHECKS), and the kinds a
// host can be caught by
export const CHECK_KINDS = ["ahead", "move", "action", "auto", "desync"];
const CAUGHT_BY = new Set(CHECK_KINDS.filter((kind) => kind !== "desync"));
const CHECK_RELAYS = new Set(["node", "cloudflare"]);

// A relay's row for a run its checks found anything in (coop-checks.mjs's checkReport)
export function validateRunCheck(value, now = Date.now()) {
    const counts = value?.counts;
    if (
        !value ||
        typeof value !== "object" ||
        value.schemaVersion !== 1 ||
        typeof value.checkId !== "string" ||
        !UUID.test(value.checkId) ||
        !CHECK_RELAYS.has(value.relay) ||
        typeof value.build !== "string" ||
        !/^[a-zA-Z0-9._-]{1,80}$/.test(value.build) ||
        !isId(value.mapId) ||
        !isId(value.mode) ||
        typeof value.endless !== "boolean" ||
        !number(value.partySize, 4, true) ||
        value.partySize < 1 ||
        !Array.isArray(value.characters) ||
        value.characters.length !== value.partySize ||
        !value.characters.every(isId) ||
        !number(value.runSeconds, 7 * 86400) ||
        !counts ||
        typeof counts !== "object" ||
        Array.isArray(counts) ||
        !Object.entries(counts).every(
            ([kind, n]) => CHECK_KINDS.includes(kind) && number(n, 1_000_000_000, true),
        ) ||
        !(value.caught === null || CAUGHT_BY.has(value.caught)) ||
        typeof value.ended !== "boolean"
    ) {
        return undefined;
    }
    return {
        day: utcDay(now),
        check_id: value.checkId.toLowerCase(),
        received_at: now,
        relay: value.relay,
        build: value.build,
        map_id: value.mapId,
        mode: value.mode,
        endless: Number(value.endless),
        characters: [...value.characters].sort().join(","),
        party_size: value.partySize,
        run_seconds: value.runSeconds,
        ...Object.fromEntries(CHECK_KINDS.map((kind) => [kind, counts[kind] ?? 0])),
        caught: value.caught,
        ended: Number(value.ended),
    };
}

export function leaderboardQuery(params, now = Date.now()) {
    if (
        !knownFilters(params, [
            "day",
            "map",
            "play",
            "mode",
            "party_size",
            "endless",
            "version",
            "limit",
        ])
    ) {
        return undefined;
    }
    const day = params.get("day") ?? utcDay(now);
    const map = params.get("map");
    const play = params.get("play") ?? "singleplayer";
    const mode = params.get("mode") ?? "normal";
    const party = Number(params.get("party_size") ?? (play === "singleplayer" ? "1" : "2"));
    const endless = params.get("endless") ?? "false";
    const version = params.get("version");
    const limit = Number(params.get("limit") ?? 20);
    if (
        !validDay(day) ||
        !isId(map) ||
        !PLAY_TYPES.has(play) ||
        !isId(mode) ||
        !number(party, 4, true) ||
        party < 1 ||
        (play === "singleplayer" && party !== 1) ||
        !["true", "false"].includes(endless) ||
        !validVersion(version) ||
        !number(limit, 100, true) ||
        limit < 1
    ) {
        return undefined;
    }
    return {
        sql: `SELECT run_id, day, ended_at, version, build, play_type, relay, map_id, mode, party_size,
            characters, endless, outcome, duration_seconds, round, level, kills, coins, damage_dealt,
            dps, damage_taken, healed, highest_hit, caskets FROM runs
            WHERE eligible = 1 AND day = ? AND map_id = ? AND play_type = ? AND mode = ?
                AND party_size = ? AND endless = ? AND version = ?
            ORDER BY leaderboard_score DESC, run_id LIMIT ?`,
        values: [day, map, play, mode, party, Number(endless === "true"), version, limit],
    };
}

export function dailyQuery(params, now = Date.now()) {
    if (
        !knownFilters(params, [
            "from",
            "to",
            "map",
            "play",
            "relay",
            "mode",
            "outcome",
            "party_size",
            "endless",
            "version",
        ])
    ) {
        return undefined;
    }
    const from = params.get("from") ?? utcDay(now);
    const to = params.get("to") ?? from;
    if (
        !validDay(from) ||
        !validDay(to) ||
        to < from ||
        Date.parse(to) - Date.parse(from) >= 31 * DAY_MS
    ) {
        return undefined;
    }
    const where = ["day >= ?", "day <= ?"];
    const values = [from, to];
    for (const [parameter, column, allowed] of [
        ["map", "map_id", isId],
        ["play", "play_type", (v) => PLAY_TYPES.has(v)],
        ["relay", "relay", (v) => RELAYS.has(v)],
        ["mode", "mode", isId],
        ["outcome", "outcome", (v) => OUTCOMES.has(v)],
        ["party_size", "party_size", (v) => ["1", "2", "3", "4"].includes(v)],
        ["endless", "endless", (v) => v === "true" || v === "false"],
        ["version", "version", validVersion],
    ]) {
        const value = params.get(parameter);
        if (value === null) {
            continue;
        }
        if (!allowed(value)) {
            return undefined;
        }
        where.push(`${column} = ?`);
        values.push(
            parameter === "endless"
                ? Number(value === "true")
                : parameter === "party_size"
                  ? Number(value)
                  : value,
        );
    }
    return {
        sql: `SELECT *, duration_seconds / runs AS average_duration_seconds,
            CASE WHEN duration_seconds > 0 THEN damage_dealt / duration_seconds ELSE 0 END AS dps
            FROM daily_stats WHERE ${where.join(" AND ")}
            ORDER BY day, play_type, relay, map_id, mode, party_size, endless, version, outcome LIMIT 1001`,
        values,
    };
}

function knownFilters(params, supported) {
    return [...params.keys()].every(
        (key) => supported.includes(key) && params.getAll(key).length === 1,
    );
}
