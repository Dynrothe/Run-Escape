// Keep the public collector's dimensions bounded. Tests compare these with the game's maps.
export const MAPS = new Set([
    "lumbridge",
    "barrows",
    "wilderness",
    "desert",
    "fremennik",
    "karamja",
    "kourend",
    "varlamore",
    "morytania",
    "god_wars",
    "prifddinas",
    "inferno",
    "halloween",
    "phosani",
    "theatre_of_blood",
    "grand_exchange",
    "east_varrock",
    "falador",
    "last_man_standing",
    "castle_wars",
    "pest_control",
]);
export const MODES = new Set(["normal", "hard", "expert", "default"]);
export const PLAY_TYPES = new Set(["singleplayer", "multiplayer"]);
export const OUTCOMES = new Set(["completed", "failed", "abandoned", "disconnected"]);
const RELAYS = new Set(["none", "node", "cloudflare"]);
const ENDLESS_ONLY = new Set([
    "grand_exchange",
    "east_varrock",
    "falador",
    "last_man_standing",
    "castle_wars",
    "pest_control",
]);
export const DAY_MS = 86_400_000;
export const utcDay = (time) => new Date(time).toISOString().slice(0, 10);
export const validVersion = (v) =>
    typeof v === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-zA-Z0-9.-]{1,24})?$/.test(v);
export const validDay = (v) =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    utcDay(Date.parse(v)) === v;

function number(value, max, integer = false) {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= max &&
        (!integer || Number.isInteger(value))
    );
}

// Only these fields enter the database. Names, addresses, room codes and arbitrary JSON don't.
export function validateRun(value, now = Date.now()) {
    if (
        !value ||
        typeof value !== "object" ||
        value.schemaVersion !== 1 ||
        typeof value.runId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value.runId,
        ) ||
        !validVersion(value.version) ||
        typeof value.build !== "string" ||
        !/^[a-zA-Z0-9._-]{1,80}$/.test(value.build) ||
        !MAPS.has(value.mapId) ||
        !MODES.has(value.mode ?? "default") ||
        !PLAY_TYPES.has(value.playType) ||
        !OUTCOMES.has(value.outcome) ||
        !RELAYS.has(value.relay) ||
        (value.playType === "singleplayer") !== (value.relay === "none") ||
        typeof value.endless !== "boolean" ||
        !number(value.partySize, 4, true) ||
        value.partySize < 1 ||
        (value.playType === "singleplayer" && value.partySize !== 1) ||
        !Number.isSafeInteger(value.endedAt) ||
        value.endedAt < now - DAY_MS ||
        value.endedAt > now + 300_000 ||
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
        !number(value.playersLeft, value.partySize, true) ||
        (value.endless && value.outcome === "completed") ||
        (!value.endless && (ENDLESS_ONLY.has(value.mapId) || value.round !== 1)) ||
        (value.endless && ["theatre_of_blood", "phosani"].includes(value.mapId)) ||
        (value.mode === "expert" &&
            (value.mapId !== "theatre_of_blood" || value.playType !== "singleplayer"))
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
        day: utcDay(value.endedAt),
        ended_at: value.endedAt,
        received_at: now,
        version: value.version,
        build: value.build,
        play_type: value.playType,
        relay: value.relay,
        map_id: value.mapId,
        mode: value.mode ?? "default",
        party_size: value.partySize,
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
    )
        return undefined;
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
        !MAPS.has(map) ||
        !PLAY_TYPES.has(play) ||
        !MODES.has(mode) ||
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
            endless, outcome, duration_seconds, round, level, kills, coins, damage_dealt, dps,
            damage_taken, healed, highest_hit, caskets FROM runs
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
    )
        return undefined;
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
        ["map", "map_id", MAPS],
        ["play", "play_type", PLAY_TYPES],
        ["relay", "relay", RELAYS],
        ["mode", "mode", MODES],
        ["outcome", "outcome", OUTCOMES],
        ["party_size", "party_size", new Set(["1", "2", "3", "4"])],
        ["endless", "endless", new Set(["true", "false"])],
    ]) {
        const value = params.get(parameter);
        if (value === null) continue;
        if (!allowed.has(value)) return undefined;
        where.push(`${column} = ?`);
        values.push(parameter === "endless" ? Number(value === "true") : value);
    }
    if (params.has("version")) {
        if (!validVersion(params.get("version"))) return undefined;
        where.push("version = ?");
        values.push(params.get("version"));
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
