import { readFileSync, readdirSync } from "node:fs";

import { SAVE_VERSION, createSave, exportSave } from "../../src/game/core/save";
import worker, {
    MAX_SAVE_BYTES,
    handle,
    newCode,
    normalizeCode,
    prune,
    readSave,
} from "./worker.mjs";

const origin = "https://game.example";
const now = Date.parse("2026-11-06T12:00:00Z");
const DAY = 86_400_000;
const saveText = (changes: Record<string, unknown> = {}, gameVersion = "0.28.0") =>
    JSON.stringify({ ...JSON.parse(exportSave(createSave(), gameVersion)), ...changes });

it("reads a save's shape and summary, not the game's rules", () => {
    const read = readSave(
        saveText({ runs: 12, victories: 3, totalCoins: 900, mapVictories: { a: 2, b: 0, z: 1 } }),
    );
    expect(read).toEqual({
        version: SAVE_VERSION,
        gameVersion: "0.28.0",
        summary: { gameVersion: "0.28.0", runs: 12, victories: 3, totalCoins: 900, mapsBeaten: 2 },
    });
    // Ids it's never heard of come through untouched, as the text is stored as it is
    expect(readSave(saveText({ unlockedMaps: ["a_map_from_next_year"] }))).toBeDefined();
    for (const bad of [
        "not json",
        "[]",
        "null",
        JSON.stringify({ gameVersion: "0.28.0" }),
        saveText({ version: "11" }),
        saveText({ version: 0 }),
        saveText({ gameVersion: "latest" }),
        saveText({ gameVersion: undefined }),
        saveText({ padding: "x".repeat(MAX_SAVE_BYTES) }),
        42,
    ]) {
        expect(readSave(bad), String(bad).slice(0, 40)).toBeUndefined();
    }
});

it("makes sync codes that read back however they're typed", () => {
    const code = newCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{24}$/);
    expect(new Set(Array.from({ length: 50 }, newCode)).size).toBe(50);
    const typed = code.toLowerCase().match(/.{4}/g)!.join(" - ");
    expect(normalizeCode(typed)).toBe(code);
    expect(normalizeCode("OOOO-IIII-LLLL-0000-1111-2222")).toBe("000011111111000011112222");
    expect(normalizeCode("ABCD")).toBeUndefined();
    expect(normalizeCode("UUUU-UUUU-UUUU-UUUU-UUUU-UUUU")).toBeUndefined();
});

// Wrangler and CI use Node 22+. The rest of the game also runs under Node 20.
const sqlite = process.getBuiltinModule?.("node:sqlite") as
    | typeof import("node:sqlite")
    | undefined;
describe.skipIf(!sqlite)("cloud-save Worker with the production SQLite migration", () => {
    let db: import("node:sqlite").DatabaseSync;
    let env: any;
    beforeEach(() => {
        db = new sqlite!.DatabaseSync(":memory:");
        const migrations = new URL("./migrations/", import.meta.url);
        for (const name of readdirSync(migrations).sort()) {
            db.exec(readFileSync(new URL(name, migrations), "utf8"));
        }
        const allow = { limit: async () => ({ success: true }) };
        // D1 takes a BLOB as an ArrayBuffer and gives it back as an array of numbers
        const bindable = (v: unknown) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v);
        const asD1 = (row: any) =>
            Object.fromEntries(
                Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? [...v] : v]),
            );
        env = {
            ALLOWED_ORIGINS: origin,
            KEEP_VERSIONS: "3",
            REQUEST_LIMITER: allow,
            ACCOUNT_LIMITER: allow,
            UPLOAD_LIMITER: allow,
            DB: {
                prepare(sql: string) {
                    const stmt = db.prepare(sql);
                    return {
                        bind: (...args: any[]) => ({
                            all: () => ({ results: stmt.all(...args.map(bindable)).map(asD1) }),
                            run: () => ({
                                meta: { changes: Number(stmt.run(...args.map(bindable)).changes) },
                            }),
                        }),
                    };
                },
                batch: (statements: any[]) => {
                    db.exec("BEGIN");
                    try {
                        const results = statements.map((s) => s.run());
                        db.exec("COMMIT");
                        return results;
                    } catch (e) {
                        db.exec("ROLLBACK");
                        throw e;
                    }
                },
            },
        };
    });
    afterEach(() => db.close());

    const request = (method: string, path: string, code?: string, body?: unknown) =>
        handle(
            new Request(`https://saves.example/v1/${path}`, {
                method,
                headers: {
                    Origin: origin,
                    ...(code && { Authorization: `Bearer ${code}` }),
                    ...(body !== undefined && { "Content-Type": "application/json" }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            }),
            env,
            now,
        );
    const newAccount = async () => (await (await request("POST", "account")).json()).code;
    const put = (code: string, baseRevision: number, save = saveText(), force?: boolean) =>
        request("PUT", "save", code, { baseRevision, save, force });
    const count = (table: string) =>
        db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n as number;

    it("keeps a save against a code, and gives it back as it was sent", async () => {
        const code = await newAccount();
        expect(code).toMatch(/^(\w{4}-){5}\w{4}$/);
        expect(await (await request("GET", "save/meta", code)).json()).toEqual({ revision: 0 });
        const text = saveText({ runs: 4, futureField: { kept: true } });
        const stored = await put(code, 0, text);
        expect(stored.status).toBe(200);
        expect(await stored.json()).toEqual({ revision: 1, updatedAt: now });
        const got = await (await request("GET", "save", code.toLowerCase())).json();
        expect(got).toMatchObject({ revision: 1, updatedAt: now, summary: { runs: 4 } });
        expect(got.save).toBe(text);
        // Stored gzipped, and nothing about the code but its hash
        expect(JSON.stringify(db.prepare("SELECT * FROM accounts").all())).not.toContain(
            code.replace(/-/g, ""),
        );
    });

    it("refuses an upload based on a revision another device has moved past", async () => {
        const code = await newAccount();
        await put(code, 0);
        await put(code, 1);
        const stale = await put(code, 1, saveText({ runs: 99 }));
        expect(stale.status).toBe(409);
        expect(await stale.json()).toMatchObject({ reason: "stale", revision: 2 });
        const ahead = await put(code, 7);
        expect(ahead.status).toBe(409);
    });

    it("keeps the newest few versions, and a device far behind can't write a pruned one", async () => {
        const code = await newAccount();
        for (let base = 0; base < 5; base++) {
            expect((await put(code, base)).status).toBe(200);
        }
        const revisions = db.prepare("SELECT revision FROM saves ORDER BY revision").all();
        expect(revisions.map((r) => r.revision)).toEqual([3, 4, 5]);
        // Revision 1 was based on 0, and 1 and 2 are gone: it mustn't go back in
        const behind = await put(code, 1);
        expect(behind.status).toBe(409);
        expect(count("saves")).toBe(3);
    });

    it("never writes an older game's save over a newer one's unless told to", async () => {
        const code = await newAccount();
        await put(code, 0, saveText({}, "0.29.0"));
        const older = await put(code, 1, saveText({}, "0.28.0"));
        expect(older.status).toBe(409);
        expect(await older.json()).toMatchObject({
            reason: "newer",
            revision: 1,
            summary: { gameVersion: "0.29.0" },
        });
        const format = await put(code, 1, saveText({ version: 1 }, "0.30.0"));
        expect((await format.json()).reason).toBe("newer");
        // 0.10.0 is after 0.9.0
        expect((await put(code, 1, saveText({}, "0.100.0"))).status).toBe(200);
        expect((await put(code, 2, saveText({}, "0.28.0"), true)).status).toBe(200);
    });

    it("checks codes, origins, methods and sizes", async () => {
        const code = await newAccount();
        expect((await request("GET", "save", "0000-0000-0000-0000-0000-0000")).status).toBe(401);
        expect((await request("GET", "save")).status).toBe(401);
        expect((await request("POST", "save", code)).status).toBe(405);
        expect((await request("GET", "nope", code)).status).toBe(404);
        expect((await put(code, 0, "{}")).status).toBe(400);
        expect((await put(code, -1)).status).toBe(400);
        const big = await put(code, 0, saveText({ padding: "\\".repeat(MAX_SAVE_BYTES) }));
        expect(big.status).toBe(413);
        const elsewhere = await handle(
            new Request("https://saves.example/v1/account", {
                method: "POST",
                headers: { Origin: "https://elsewhere.example" },
            }),
            env,
            now,
        );
        expect(elsewhere.status).toBe(403);
        const preflight = await handle(
            new Request("https://saves.example/v1/save", {
                method: "OPTIONS",
                headers: { Origin: origin },
            }),
            env,
            now,
        );
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, PUT");
        const health = await worker.fetch(
            new Request("https://saves.example/v1/health", { headers: { Origin: origin } }),
            { ALLOWED_ORIGINS: origin },
        );
        expect(await health.json()).toEqual({ service: "run-escape-cloud-saves" });
        expect(health.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    });

    it("rate limits, and caps what's stored a day", async () => {
        const code = await newAccount();
        env.UPLOAD_LIMITER = { limit: async () => ({ success: false }) };
        expect((await put(code, 0)).status).toBe(429);
        env.UPLOAD_LIMITER = { limit: async () => ({ success: true }) };
        env.MAX_SAVES_PER_DAY = "1";
        expect((await put(code, 0)).status).toBe(200);
        expect((await put(code, 1)).status).toBe(503);
        env.MAX_ACCOUNTS_PER_DAY = "1";
        expect((await request("POST", "account")).status).toBe(503);
        expect(count("accounts")).toBe(1);
        // The days before yesterday go
        await prune(env, now + 3 * 86_400_000);
        expect(count("daily_intake")).toBe(0);
    });

    it("keeps a deleted code's saves for a week, for the code to restore, then removes them", async () => {
        const code = await newAccount();
        const other = await newAccount();
        await put(code, 0);
        await put(code, 1);
        await put(other, 0);
        const deleted = await request("DELETE", "account", code);
        expect(await deleted.json()).toEqual({ deleted: true, restorableUntil: now + 7 * DAY });
        // Nothing but restoring works meanwhile, and nothing's gone
        for (const [method, path] of [
            ["GET", "save"],
            ["GET", "save/meta"],
            ["DELETE", "account"],
        ]) {
            const refused = await request(method, path, code);
            expect(refused.status, `${method} ${path}`).toBe(410);
            expect(await refused.json()).toMatchObject({ restorableUntil: now + 7 * DAY });
        }
        expect((await put(code, 2)).status).toBe(410);
        expect(count("saves")).toBe(3);
        expect(await (await request("POST", "account/restore", code)).json()).toEqual({
            restored: true,
        });
        expect(await (await request("GET", "save/meta", code)).json()).toMatchObject({
            revision: 2,
        });
        expect(await (await request("POST", "account/restore", other)).json()).toEqual({
            restored: false,
        });

        // Deleted again, and a week on: only then are they gone
        await request("DELETE", "account", code);
        await prune(env, now + 7 * DAY - 1);
        expect(count("saves")).toBe(3);
        await prune(env, now + 7 * DAY + 1);
        expect(count("saves")).toBe(1);
        expect(count("accounts")).toBe(1);
        expect((await request("GET", "save", code)).status).toBe(401);
        expect((await request("POST", "account/restore", code)).status).toBe(401);
        expect((await request("GET", "save", other)).status).toBe(200);
    });
});
