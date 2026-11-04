import { readFileSync } from "node:fs";

import { ALL_MAPS } from "../../src/game/content/maps";
import { DAY_MS, MAPS, dailyQuery, leaderboardQuery, utcDay, validateRun } from "./schema.mjs";
import worker, { prune } from "./worker.mjs";

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
const post = (value: unknown, headers = {}) =>
    new Request("https://collector.example/v1/runs", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json", ...headers },
        body: JSON.stringify(value),
    });
const read = (path: string, headers = {}) =>
    new Request(`https://collector.example/v1/${path}`, { headers });
const board = `leaderboard?day=${day}&map=lumbridge&version=0.25.0`;

it("recognizes every shipped map including endless-only maps", () => {
    expect([...MAPS].sort()).toEqual(
        ALL_MAPS.filter((map) => !map.dev)
            .map((map) => map.id)
            .sort(),
    );
    expect(
        validateRun(payload({ mapId: "falador", endless: true, outcome: "failed", round: 3 }), now),
    ).toBeDefined();
    expect(validateRun(payload({ mapId: "theatre_of_blood", mode: "expert" }), now)?.mode).toBe(
        "expert",
    );
    expect(validateRun(payload({ mode: undefined }), now)?.mode).toBe("default");
});

it("rejects invalid dimensions, impossible modes, numbers and old replays", () => {
    for (const change of [
        { mapId: "arbitrary-label" },
        { runId: "not-a-uuid" },
        { kills: -1 },
        { damageDealt: NaN },
        { durationSeconds: 1e-300 },
        { partySize: 3 },
        { relay: "cloudflare" },
        { mode: "expert" },
        { endless: true },
        { mapId: "falador" },
        { round: 2 },
        { playersLeft: 3 },
        { endedAt: now - DAY_MS - 1 },
        { endedAt: now + DAY_MS },
        { version: "unbounded version" },
    ]) {
        expect(validateRun(payload(change), now), JSON.stringify(change)).toBeUndefined();
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
        db.exec(readFileSync(new URL("./migrations/0001_runs.sql", import.meta.url), "utf8"));
        const allow = { limit: async () => ({ success: true }) };
        env = {
            ALLOWED_ORIGINS: origin,
            ANALYTICS_READ_TOKEN: token,
            PUBLIC_LEADERBOARD: "false",
            INGEST_LIMITER: allow,
            QUERY_LIMITER: allow,
            DB: {
                prepare(sql: string) {
                    const stmt = db.prepare(sql);
                    return {
                        bind: (...args: any[]) => ({
                            all: () => ({ results: stmt.all(...args) }),
                            run: () => stmt.run(...args),
                        }),
                    };
                },
                batch: (statements: any[]) => statements.map((s) => s.run()),
            },
        };
    });
    afterEach(() => db.close());
    const send = (value: any) => worker.fetch(post(value), env);
    const rows = async (path: string) =>
        (await (await worker.fetch(read(path, access), env)).json()).rows;

    it("deduplicates concurrent retries, uses the UTC end day and keeps separate party totals", async () => {
        const yesterday = new Date(now - 1000 * 60 * 60 * 23);
        const run = payload({
            endedAt: +yesterday,
            playType: "multiplayer",
            relay: "node",
            partySize: 4,
            outcome: "failed",
        });
        const responses = await Promise.all([send(run), send(run), send({ ...run, coins: 999 })]);
        expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
        await send({ ...run, runId: crypto.randomUUID(), relay: "cloudflare" });
        await send({ ...run, runId: crypto.randomUUID(), outcome: "abandoned" });
        const result = await rows(
            `daily?from=${utcDay(+yesterday)}&play=multiplayer&relay=node&party_size=4&outcome=failed`,
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            day: utcDay(+yesterday),
            runs: 1,
            damage_dealt: 12000,
            coins: 25,
            dps: 20,
        });
        await send({ ...run, runId: crypto.randomUUID(), damageDealt: 18000, highestHit: 200 });
        expect(
            (await rows(`daily?from=${utcDay(+yesterday)}&relay=node&outcome=failed`))[0],
        ).toMatchObject({ runs: 2, damage_dealt: 30000, coins: 50, highest_hit: 200, dps: 25 });
    });

    it("rolls back the raw row if its daily update fails", async () => {
        db.exec(
            "CREATE TRIGGER fail_test BEFORE INSERT ON daily_stats BEGIN SELECT RAISE(ABORT, 'full'); END",
        );
        const run = payload();
        expect((await send(run)).status).toBe(503);
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
                /SEARCH (runs USING INDEX runs_leaderboard|daily_stats USING INDEX)/,
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

    it("expires raw rows and rankings while retaining daily summaries independently", async () => {
        await send(payload());
        await prune(env, now + 32 * DAY_MS);
        expect(await rows(board)).toEqual([]);
        expect((await rows(`daily?from=${day}`))[0].runs).toBe(1);
        await prune(env, now + 367 * DAY_MS);
        expect(await rows(`daily?from=${day}`)).toEqual([]);
    });
});
