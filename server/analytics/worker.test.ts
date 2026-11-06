import { readFileSync, readdirSync } from "node:fs";

import { CHARACTERS } from "../../src/game/content/characters";
import { ALL_MAPS } from "../../src/game/content/maps";
import { RUN_CHECKS, checkReport, runOf } from "../coop-checks.mjs";
import {
    CHECK_KINDS,
    DAY_MS,
    ID,
    dailyQuery,
    leaderboardQuery,
    utcDay,
    validateRun,
    validateRunCheck,
} from "./schema.mjs";
import worker, { collect, prune } from "./worker.mjs";

const origin = "https://game.example";
const token = "a-private-read-token-only-for-these-tests";
const access = { Authorization: `Bearer ${token}` };
const now = Date.now();
const day = utcDay(now);
const payload = (changes = {}) => ({
    schemaVersion: 1,
    runId: crypto.randomUUID(),
    endedAt: now,
    version: "0.25.0",
    build: "0.25.0-abc123",
    playType: "singleplayer",
    relay: "none",
    mapId: "lumbridge",
    mode: "normal",
    partySize: 1,
    characters: ["warrior"],
    endless: false,
    outcome: "completed",
    durationSeconds: 600,
    round: 1,
    level: 10,
    kills: 140,
    coins: 25,
    damageDealt: 12000,
    damageTaken: 15,
    healed: 5,
    highestHit: 100,
    caskets: 1,
    playersLeft: 0,
    ...changes,
});
const checksToken = "a-private-relay-token-only-for-these-tests";
// A relay's row, as coop-checks.mjs makes it from a run's summary
const check = (changes = {}, summary = {}) => ({
    ...checkReport(
        {
            build: "0.25.0-abc123",
            ...runOf({ mapId: "barrows", hard: true, heroes: [{ characterId: "wizard" }, {}] }),
            party: 2,
            runSeconds: 312.4,
            counts: { move: 3, desync: 1 },
            caught: "move",
            ...summary,
        },
        "cloudflare",
        false,
    ),
    ...changes,
});
const postCheck = (value: unknown, headers: Record<string, string> = {}) =>
    new Request("https://collector.example/v1/run-checks", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${checksToken}`,
            ...headers,
        },
        body: JSON.stringify(value),
    });
const post = (value: unknown, headers = {}) =>
    new Request("https://collector.example/v1/runs", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json", ...headers },
        body: JSON.stringify(value),
    });
const read = (path: string, headers = {}) =>
    new Request(`https://collector.example/v1/${path}`, { headers });
const board = `leaderboard?day=${day}&map=lumbridge&version=0.25.0`;

// The collector has no list of maps or adventurers, so content added later reaches it without a
// deploy. What it does need is that every id the game sends fits its format.
it("accepts every map, mode and adventurer the game has, and maps it doesn't know yet", () => {
    for (const map of ALL_MAPS) {
        expect(map.id).toMatch(ID);
    }
    for (const character of CHARACTERS) {
        expect(character.id).toMatch(ID);
    }
    expect(
        validateRun(payload({ mapId: "falador", endless: true, outcome: "failed", round: 3 }), now),
    ).toBeDefined();
    expect(validateRun(payload({ mapId: "theatre_of_blood", mode: "expert" }), now)?.mode).toBe(
        "expert",
    );
    // A raid added after this collector was deployed, with expert in co-op
    const later = validateRun(
        payload({
            mapId: "chambers_of_xeric",
            mode: "expert",
            playType: "multiplayer",
            relay: "cloudflare",
            partySize: 2,
            characters: ["wizard", "ranger"],
        }),
        now,
    );
    expect(later).toMatchObject({ map_id: "chambers_of_xeric", characters: "ranger,wizard" });
});

it("files a report under the day it arrived, whatever the game's clock says", () => {
    const late = now - 1000 * 60 * 60 * 20;
    expect(validateRun(payload({ endedAt: late }), now)).toMatchObject({
        day: utcDay(now),
        ended_at: late,
    });
    expect(validateRun(payload({ endedAt: now + 1000 * 60 * 60 }), now)).toBeDefined();
});

it("reads only the report versions it knows", () => {
    for (const schemaVersion of [undefined, 0, 2, "1", "constructor", "__proto__"]) {
        expect(validateRun(payload({ schemaVersion }), now), String(schemaVersion)).toBeUndefined();
    }
    expect(validateRun([payload()], now)).toBeUndefined();
});

it("rejects invalid dimensions, numbers and old replays", () => {
    for (const change of [
        { mapId: "arbitrary-label" },
        { mapId: "x".repeat(41) },
        { mode: undefined },
        { mode: "Hard Mode" },
        { runId: "not-a-uuid" },
        { kills: -1 },
        { damageDealt: NaN },
        { durationSeconds: 1e-300 },
        { partySize: 3 },
        { characters: [] },
        { characters: ["warrior", "wizard"] },
        { characters: ["<b>"] },
        { characters: "warrior" },
        { relay: "cloudflare" },
        { round: 0 },
        { playersLeft: 3 },
        { endedAt: now - DAY_MS - 1 },
        { endedAt: now + DAY_MS + 1 },
        { version: "unbounded version" },
        { version: "0.25.0-anything" },
    ]) {
        expect(validateRun(payload(change), now), JSON.stringify(change)).toBeUndefined();
    }
});

it("takes the relays' rows in the shape they send, whatever the host's game said", () => {
    expect(CHECK_KINDS).toEqual(RUN_CHECKS);
    expect(validateRunCheck(check(), now)).toMatchObject({
        day,
        relay: "cloudflare",
        map_id: "barrows",
        mode: "hard",
        characters: "unknown,wizard",
        party_size: 2,
        move: 3,
        desync: 1,
        ahead: 0,
        caught: "move",
        ended: 0,
    });
    // A host can't keep its run's row out with a start no game would send
    const odd = check(
        {},
        {
            build: "<b>",
            ...runOf({ mapId: "Not A Map", hard: "yes", heroes: [{ characterId: 7 }] }),
            party: 1,
        },
    );
    expect(validateRunCheck(odd, now)).toMatchObject({
        build: "unknown",
        map_id: "unknown",
        mode: "normal",
        characters: "unknown",
    });
    expect(validateRunCheck(check({}, { characters: undefined }), now)?.characters).toBe(
        "unknown,unknown",
    );
    for (const change of [
        { schemaVersion: 2 },
        { checkId: "not-a-uuid" },
        { relay: "none" },
        { partySize: 3 },
        { counts: { move: -1 } },
        { counts: { speed: 1 } },
        { counts: [] },
        { caught: "desync" },
        { ended: "no" },
        { runSeconds: NaN },
    ]) {
        expect(validateRunCheck(check(change), now), JSON.stringify(change)).toBeUndefined();
    }
});

// Wrangler and CI use Node 22+. The rest of the game also runs under Node 20.
const sqlite = process.getBuiltinModule?.("node:sqlite") as
    | typeof import("node:sqlite")
    | undefined;
describe.skipIf(!sqlite)("analytics Worker with the production SQLite migration", () => {
    let db: import("node:sqlite").DatabaseSync;
    let env: any;
    beforeEach(() => {
        db = new sqlite!.DatabaseSync(":memory:");
        const migrations = new URL("./migrations/", import.meta.url);
        for (const name of readdirSync(migrations).sort()) {
            db.exec(readFileSync(new URL(name, migrations), "utf8"));
        }
        const allow = { limit: async () => ({ success: true }) };
        env = {
            ALLOWED_ORIGINS: origin,
            ANALYTICS_READ_TOKEN: token,
            RUN_CHECKS_TOKEN: checksToken,
            PUBLIC_LEADERBOARD: "false",
            INGEST_LIMITER: allow,
            QUERY_LIMITER: allow,
            DB: {
                prepare(sql: string) {
                    const stmt = db.prepare(sql);
                    return {
                        bind: (...args: any[]) => ({
                            all: () => ({ results: stmt.all(...args) }),
                            run: () => ({ meta: { changes: stmt.run(...args).changes } }),
                        }),
                    };
                },
                batch: (statements: any[]) => statements.map((s) => s.run()),
            },
        };
    });
    afterEach(() => db.close());
    const send = (value: any, at = now) => collect(post(value), env, at);
    const count = (table: string) =>
        db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n as number;
    const rows = async (path: string) =>
        (await (await worker.fetch(read(path, access), env)).json()).rows;

    it("deduplicates concurrent retries and keeps separate party totals", async () => {
        const run = payload({
            playType: "multiplayer",
            relay: "node",
            partySize: 4,
            characters: ["warrior", "wizard", "warrior", "ranger"],
            outcome: "failed",
        });
        const responses = await Promise.all([send(run), send(run), send({ ...run, coins: 999 })]);
        expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
        await send({ ...run, runId: crypto.randomUUID(), relay: "cloudflare" });
        await send({ ...run, runId: crypto.randomUUID(), outcome: "abandoned" });
        const result = await rows(
            `daily?from=${day}&play=multiplayer&relay=node&party_size=4&outcome=failed`,
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            day,
            runs: 1,
            damage_dealt: 12000,
            coins: 25,
            dps: 20,
        });
        await send({ ...run, runId: crypto.randomUUID(), damageDealt: 18000, highestHit: 200 });
        expect((await rows(`daily?from=${day}&relay=node&outcome=failed`))[0]).toMatchObject({
            runs: 2,
            damage_dealt: 30000,
            coins: 50,
            highest_hit: 200,
            dps: 25,
        });
    });

    it("rolls back the raw row if its daily update fails", async () => {
        db.exec(
            "CREATE TRIGGER fail_test BEFORE INSERT ON daily_stats BEGIN SELECT RAISE(ABORT, 'full'); END",
        );
        const run = payload();
        // The Worker's own catch, as Cloudflare would answer
        expect((await worker.fetch(post(run), env)).status).toBe(503);
        expect(db.prepare("SELECT COUNT(*) AS n FROM runs").get()!.n).toBe(0);
        db.exec("DROP TRIGGER fail_test");
        expect((await send(run)).status).toBe(200);
        expect((await rows(`daily?from=${day}`))[0].runs).toBe(1);
    });

    it("ranks fastest wins and longest endless survival in separate indexed partitions", async () => {
        for (const fields of [
            { durationSeconds: 500 },
            { durationSeconds: 600 },
            { durationSeconds: 400, outcome: "failed" },
            { durationSeconds: 350, mode: "hard" },
            { durationSeconds: 350, version: "0.24.1" },
            { durationSeconds: 900, endless: true, outcome: "failed" },
            { durationSeconds: 1200, endless: true, outcome: "abandoned" },
            { durationSeconds: 2000, endless: true, outcome: "disconnected" },
            {
                durationSeconds: 300,
                playType: "multiplayer",
                relay: "node",
                partySize: 3,
                characters: ["warrior", "warrior", "wizard"],
                playersLeft: 1,
            },
        ]) {
            expect((await send(payload(fields))).status).toBe(200);
        }
        expect((await rows(`${board}&limit=1`)).map((r: any) => r.duration_seconds)).toEqual([500]);
        expect((await rows(`${board}&endless=true`)).map((r: any) => r.duration_seconds)).toEqual([
            1200, 900,
        ]);
        expect(await rows(`${board}&play=multiplayer&party_size=3`)).toEqual([]);
        for (const query of [
            leaderboardQuery(new URLSearchParams(board.split("?")[1])),
            dailyQuery(new URLSearchParams({ from: day })),
        ]) {
            const plan = db
                .prepare(`EXPLAIN QUERY PLAN ${query!.sql}`)
                .all(...query!.values)
                .map((r) => r.detail)
                .join("\n");
            expect(plan).toMatch(
                /SEARCH (runs USING INDEX runs_leaderboard|daily_stats USING PRIMARY KEY)/,
            );
            expect(plan).not.toMatch(/SCAN |TEMP B-TREE/);
        }
    });

    it("keeps reads private by default; only the leaderboard can be opened", async () => {
        for (const flag of [undefined, false, "false", "1"]) {
            env.PUBLIC_LEADERBOARD = flag;
            expect((await worker.fetch(read(board), env)).status).toBe(401);
            expect((await worker.fetch(read(board, access), env)).status).toBe(200);
        }
        env.ANALYTICS_READ_TOKEN = "";
        expect((await worker.fetch(read(board, { Authorization: "Bearer " }), env)).status).toBe(
            401,
        );
        env.PUBLIC_LEADERBOARD = "true";
        expect((await worker.fetch(read(board), env)).status).toBe(200);
        expect((await worker.fetch(read("daily"), env)).status).toBe(401);
    });

    it("limits payloads, checks origin and rate limit before writing, and bounds queries", async () => {
        expect(
            (await worker.fetch(post(payload(), { Origin: "https://elsewhere.example" }), env))
                .status,
        ).toBe(403);
        expect(
            (await worker.fetch(post(payload(), { "Content-Type": "text/plain" }), env)).status,
        ).toBe(415);
        expect((await worker.fetch(post({ padding: "x".repeat(5000) }), env)).status).toBe(413);
        expect((await send(payload({ highestHit: -1 }))).status).toBe(400);
        env.INGEST_LIMITER = { limit: () => ({ success: false }) };
        expect((await send(payload())).status).toBe(429);
        expect(db.prepare("SELECT COUNT(*) AS n FROM runs").get()!.n).toBe(0);
        for (const path of [
            `${board}&limit=101`,
            "daily?from=2026-02-30",
            "daily?from=2026-01-01&to=2026-02-01",
            "daily?group_by=anything",
        ]) {
            expect((await worker.fetch(read(path, access), env)).status).toBe(400);
        }
        const preflight = new Request("https://collector.example/v1/runs", {
            method: "OPTIONS",
            headers: { Origin: origin },
        });
        const answer = await worker.fetch(preflight, env);
        expect(answer.status).toBe(204);
        expect(answer.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    });

    it("stops storing runs at the day's cap, and starts again the next day", async () => {
        env.MAX_RUNS_PER_DAY = "2";
        for (let i = 0; i < 3; i++) {
            expect((await send(payload())).status).toBe(200);
        }
        expect(count("runs")).toBe(2);
        expect((await rows(`daily?from=${day}`))[0].runs).toBe(2);
        const tomorrow = now + DAY_MS;
        expect((await send(payload({ endedAt: tomorrow }), tomorrow)).status).toBe(200);
        expect(count("runs")).toBe(3);
    });

    it("clears a backlog bigger than one delete in a single prune", async () => {
        const old = now - 40 * DAY_MS;
        await send(payload({ endedAt: old }), old);
        const columns = db
            .prepare("SELECT name FROM pragma_table_info('runs') WHERE name != 'run_id'")
            .all()
            .map((row) => row.name)
            .join(", ");
        db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2500)
            INSERT INTO runs (run_id, ${columns})
            SELECT printf('%08x-0000-4000-8000-000000000000', i), ${columns} FROM n, runs`);
        expect(count("runs")).toBe(2501);
        await prune(env, now);
        expect(count("runs")).toBe(0);
        expect(count("daily_stats")).toBe(1);
    });

    it("expires raw rows and rankings while retaining daily summaries independently", async () => {
        await send(payload());
        await prune(env, now + 32 * DAY_MS);
        expect(await rows(board)).toEqual([]);
        expect((await rows(`daily?from=${day}`))[0].runs).toBe(1);
        await prune(env, now + 367 * DAY_MS);
        expect(await rows(`daily?from=${day}`)).toEqual([]);
    });
    it("stores the relays' rows only with their token, up to the day's cap", async () => {
        const sendCheck = (value: unknown, headers = {}, at = now) =>
            collect(postCheck(value, headers), env, at);
        expect((await sendCheck(check(), { Authorization: `Bearer ${token}` })).status).toBe(401);
        expect((await sendCheck(check(), { Authorization: "" })).status).toBe(401);
        expect((await collect(read("run-checks", access), env)).status).toBe(405);
        expect((await sendCheck({ ...check(), counts: { speed: 1 } })).status).toBe(400);
        env.MAX_CHECKS_PER_DAY = "2";
        const first = check();
        expect((await sendCheck(first)).status).toBe(200);
        expect((await sendCheck(first)).status).toBe(200);
        expect(count("run_checks")).toBe(1);
        for (let i = 0; i < 2; i++) {
            expect((await sendCheck(check())).status).toBe(200);
        }
        expect(count("run_checks")).toBe(2);
        // A game's run reports don't count against it, nor it against them
        expect((await send(payload())).status).toBe(200);
        expect(count("runs")).toBe(1);
        expect(db.prepare("SELECT caught, ended, move FROM run_checks").all()[0]).toEqual({
            caught: "move",
            ended: 0,
            move: 3,
        });
        // A token that's too short is no token
        env.RUN_CHECKS_TOKEN = "short";
        expect((await sendCheck(check(), { Authorization: "Bearer short" })).status).toBe(401);
    });

    it("expires the relays' rows with the raw runs", async () => {
        const old = now - 40 * DAY_MS;
        await collect(postCheck(check()), env, old);
        await collect(postCheck(check()), env, now);
        expect(count("run_checks")).toBe(2);
        await prune(env, now);
        expect(count("run_checks")).toBe(1);
        expect(count("daily_check_intake")).toBe(2);
        await prune(env, now + 400 * DAY_MS);
        expect(count("run_checks")).toBe(0);
        expect(count("daily_check_intake")).toBe(0);
    });
});
