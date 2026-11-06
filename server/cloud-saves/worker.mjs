// Cloud saves: a save kept against a sync code, so it can be carried to another device. The
// Worker checks a save's shape and size only, never the game's rules, so a release with new
// maps or items needs no redeploy (README, What it accepts).

// A save's text, as the game exports it. A full one is about 22 KB.
export const MAX_SAVE_BYTES = 65_536;
// The request around it: the save as a JSON string, escaped, plus a few fields
const MAX_BODY_BYTES = 196_608;
export const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
// A sync code: 120 random bits as 24 characters of Crockford's base32 (no I, L, O or U)
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE = /^[0-9A-HJKMNP-TV-Z]{24}$/;
const DAY_MS = 86_400_000;
const utcDay = (time) => new Date(time).toISOString().slice(0, 10);

// An environment variable that's a whole number in range, or the fallback
const setting = (value, fallback, min, max) => {
    const n = Number(value ?? fallback);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
// The newest save and its backups
const DEFAULT_KEEP_VERSIONS = 6;
// Caps on what's stored a day, whoever sends it, so a flood can't run through D1's daily write
// allowance, which the run collector shares if it's on the same account (README, Budget)
const DEFAULT_MAX_SAVES_PER_DAY = 5000;
const DEFAULT_MAX_ACCOUNTS_PER_DAY = 500;
// A deleted code's saves are kept this long, for the code to restore
const DEFAULT_DELETED_RETENTION_DAYS = 7;
const retention = (env) =>
    setting(env.DELETED_RETENTION_DAYS, DEFAULT_DELETED_RETENTION_DAYS, 1, 90) * DAY_MS;

// Below 0 when a is older than b, above 0 when it's newer, as the game compares them
// (compareGameVersions in src/game/core/save.ts)
export function compareGameVersions(a, b) {
    const [partsA, partsB] = [a, b].map((v) => v.split(".").map((part) => parseInt(part) || 0));
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

// Reads a sync code as a player might type it: any case, with or without dashes and spaces,
// and with O, I and L for 0, 1 and 1
export function normalizeCode(text) {
    if (typeof text !== "string" || text.length > 64) return undefined;
    const code = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    return CODE.test(code) ? code : undefined;
}

export function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    let code = "";
    let bits = 0;
    let value = 0;
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            code += ALPHABET[(value >> bits) & 31];
        }
    }
    return code;
}

// As it's shown to the player: K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC
export const formatCode = (code) => code.match(/.{4}/g).join("-");

async function sha256(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A save as the game sends it: its shape, and what the game shows of it. Undefined when it
// isn't one.
export function readSave(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) {
        return undefined;
    }
    let save;
    try {
        save = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!save || typeof save !== "object" || Array.isArray(save)) return undefined;
    const { version, gameVersion } = save;
    if (!Number.isInteger(version) || version < 1 || version > 10_000) return undefined;
    if (typeof gameVersion !== "string" || !VERSION.test(gameVersion)) return undefined;
    const count = (n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
    const victories =
        save.mapVictories && typeof save.mapVictories === "object" ? save.mapVictories : {};
    return {
        version,
        gameVersion,
        summary: {
            gameVersion,
            runs: count(save.runs),
            victories: count(save.victories),
            totalCoins: count(save.totalCoins),
            mapsBeaten: Object.values(victories).filter((n) => count(n) > 0).length,
        },
    };
}

// An ArrayBuffer, which D1 stores as a BLOB
async function gzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
}

async function gunzip(body) {
    // D1 gives a BLOB back as an array of numbers
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
}

function allowedOrigin(request, env) {
    const origin = request.headers.get("Origin");
    return origin &&
        (env.ALLOWED_ORIGINS ?? "")
            .split(",")
            .map((s) => s.trim())
            .includes(origin)
        ? origin
        : undefined;
}

function json(value, status, origin) {
    return Response.json(value, {
        status,
        headers: {
            "Cache-Control": "no-store",
            Vary: "Origin",
            ...(origin && { "Access-Control-Allow-Origin": origin }),
        },
    });
}

async function readBody(request) {
    if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new Error("large");
    const reader = request.body?.getReader();
    if (!reader) return undefined;
    const chunks = [];
    let size = 0;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new Error("large");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
}

// The account a request's sync code belongs to: { id, deleted_at }
async function account(request, env) {
    const header = request.headers.get("Authorization") ?? "";
    const code = header.startsWith("Bearer ") ? normalizeCode(header.slice(7)) : undefined;
    if (!code) return undefined;
    const { results } = await env.DB.prepare(
        "SELECT id, deleted_at FROM accounts WHERE code_hash = ?",
    )
        .bind(await sha256(code))
        .all();
    return results[0];
}

async function latestSave(env, accountId) {
    const { results } = await env.DB.prepare(
        `SELECT revision, save_version, game_version, summary, created_at, body FROM saves
        WHERE account_id = ? ORDER BY revision DESC LIMIT 1`,
    )
        .bind(accountId)
        .all();
    return results[0];
}

// What the game is told about the cloud's save: none is revision 0
const meta = (row) =>
    row
        ? { revision: row.revision, summary: JSON.parse(row.summary), updatedAt: row.created_at }
        : { revision: 0 };

async function createAccount(env, now, respond) {
    const code = newCode();
    const cap = setting(env.MAX_ACCOUNTS_PER_DAY, DEFAULT_MAX_ACCOUNTS_PER_DAY, 1, 10_000_000);
    const { meta: result } = await env.DB.prepare(
        `INSERT INTO accounts (id, code_hash, created_at) SELECT ?, ?, ?
        WHERE COALESCE((SELECT accounts FROM daily_intake WHERE day = ?), 0) < ?`,
    )
        .bind(crypto.randomUUID(), await sha256(code), now, utcDay(now), cap)
        .run();
    if (!result?.changes) return respond({ error: "No new cloud saves today" }, 503);
    return respond({ code: formatCode(code) });
}

async function putSave(request, env, accountId, now, respond) {
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
        return respond({ error: "Expected application/json" }, 415);
    }
    let value;
    try {
        value = await readBody(request);
    } catch (error) {
        return respond({ error: "Invalid request body" }, error.message === "large" ? 413 : 400);
    }
    const base = value?.baseRevision;
    if (!Number.isInteger(base) || base < 0) return respond({ error: "Invalid revision" }, 400);
    const save = readSave(value.save);
    if (!save) return respond({ error: "Not a save" }, 400);
    const latest = await latestSave(env, accountId);
    const current = latest?.revision ?? 0;
    // Another device got there first: the game asks the player which to keep
    if (base !== current) return respond({ reason: "stale", ...meta(latest) }, 409);
    // Never over a newer game's save unless the player's said so: an older game has dropped the
    // ids it doesn't know (newerGame in src/game/core/save.ts)
    if (
        latest &&
        value.force !== true &&
        (save.version < latest.save_version ||
            compareGameVersions(save.gameVersion, latest.game_version) < 0)
    ) {
        return respond({ reason: "newer", ...meta(latest) }, 409);
    }
    const keep = setting(env.KEEP_VERSIONS, DEFAULT_KEEP_VERSIONS, 1, 50);
    const cap = setting(env.MAX_SAVES_PER_DAY, DEFAULT_MAX_SAVES_PER_DAY, 1, 100_000_000);
    // One transaction. The insert only goes in on top of the revision it was based on, so a
    // device far behind can't write a revision that was pruned and look as if it synced.
    const [insert] = await env.DB.batch([
        env.DB.prepare(
            `INSERT INTO saves
            (account_id, revision, body, save_version, game_version, summary, created_at)
            SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE COALESCE((SELECT MAX(revision) FROM saves WHERE account_id = ?), 0) = ?
            AND COALESCE((SELECT saves FROM daily_intake WHERE day = ?), 0) < ?`,
        ).bind(
            accountId,
            base + 1,
            await gzip(value.save),
            save.version,
            save.gameVersion,
            JSON.stringify(save.summary),
            now,
            accountId,
            base,
            utcDay(now),
            cap,
        ),
        env.DB.prepare(
            `DELETE FROM saves WHERE account_id = ?
            AND revision <= (SELECT MAX(revision) FROM saves WHERE account_id = ?) - ?`,
        ).bind(accountId, accountId, keep),
    ]);
    if (!insert.meta?.changes) {
        const after = await latestSave(env, accountId);
        if ((after?.revision ?? 0) !== base) {
            return respond({ reason: "stale", ...meta(after) }, 409);
        }
        return respond({ error: "No more cloud saves today" }, 503);
    }
    return respond({ revision: base + 1, updatedAt: now });
}

export async function handle(request, env, now = Date.now()) {
    const { pathname } = new URL(request.url);
    const routes = {
        "/v1/health": ["GET"],
        "/v1/account": ["POST", "DELETE"],
        "/v1/account/restore": ["POST"],
        "/v1/save/meta": ["GET"],
        "/v1/save": ["GET", "PUT"],
    };
    const origin = allowedOrigin(request, env);
    const respond = (body, status = 200) => json(body, status, origin);
    const methods = routes[pathname];
    if (!methods) return respond({ error: "Not found" }, 404);
    if (request.headers.has("Origin") && !origin) {
        return respond({ error: "Origin not allowed" }, 403);
    }
    if (request.method === "OPTIONS") {
        if (!origin) return respond({ error: "Origin required" }, 403);
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": origin,
                Vary: "Origin",
                "Access-Control-Allow-Methods": methods.join(", "),
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Max-Age": "3600",
            },
        });
    }
    if (!methods.includes(request.method)) return respond({ error: "Method not allowed" }, 405);
    // The game checks this before it offers cloud saves: an app that doesn't let requests out
    // to here answers with something else
    if (pathname === "/v1/health") return respond({ service: "run-escape-cloud-saves" });
    if (!env.DB) return respond({ error: "Cloud saves are not configured" }, 503);
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const limit = async (limiter, key) => {
        if (!limiter) throw new Error("Rate limiter is not configured");
        return (await limiter.limit({ key })).success;
    };
    if (!(await limit(env.REQUEST_LIMITER, ip))) {
        return respond({ error: "Too many requests" }, 429);
    }
    if (pathname === "/v1/account" && request.method === "POST") {
        if (!origin) return respond({ error: "Origin required" }, 403);
        if (!(await limit(env.ACCOUNT_LIMITER, ip))) {
            return respond({ error: "Too many requests" }, 429);
        }
        return createAccount(env, now, respond);
    }
    const found = await account(request, env);
    if (!found) return respond({ error: "Unknown sync code" }, 401);
    const accountId = found.id;
    // Deleted: the saves are kept, untouched, until the hourly job removes them. Restoring is the
    // only thing the code can do meanwhile.
    if (found.deleted_at !== null && found.deleted_at !== undefined) {
        if (pathname === "/v1/account/restore") {
            await env.DB.prepare("UPDATE accounts SET deleted_at = NULL WHERE id = ?")
                .bind(accountId)
                .run();
            return respond({ restored: true });
        }
        return respond(
            { error: "Deleted", restorableUntil: found.deleted_at + retention(env) },
            410,
        );
    }
    if (pathname === "/v1/account/restore") return respond({ restored: false });
    if (pathname === "/v1/account") {
        await env.DB.prepare("UPDATE accounts SET deleted_at = ? WHERE id = ?")
            .bind(now, accountId)
            .run();
        return respond({ deleted: true, restorableUntil: now + retention(env) });
    }
    if (pathname === "/v1/save/meta") return respond(meta(await latestSave(env, accountId)));
    if (request.method === "GET") {
        const latest = await latestSave(env, accountId);
        return respond(latest ? { ...meta(latest), save: await gunzip(latest.body) } : meta());
    }
    if (!(await limit(env.UPLOAD_LIMITER, accountId))) {
        return respond({ error: "Too many requests" }, 429);
    }
    return putSave(request, env, accountId, now, respond);
}

export async function prune(env, now = Date.now()) {
    if (!env.DB) return;
    // Codes deleted longer ago than the retention, with every version of their saves
    const gone = now - retention(env);
    await env.DB.batch([
        env.DB.prepare(
            `DELETE FROM saves WHERE account_id IN
            (SELECT id FROM accounts WHERE deleted_at IS NOT NULL AND deleted_at < ?)`,
        ).bind(gone),
        env.DB.prepare("DELETE FROM accounts WHERE deleted_at IS NOT NULL AND deleted_at < ?").bind(
            gone,
        ),
    ]);
    await env.DB.prepare("DELETE FROM daily_intake WHERE day < ?")
        .bind(utcDay(now - 2 * DAY_MS))
        .run();
}

export default {
    async fetch(request, env) {
        try {
            return await handle(request, env);
        } catch {
            return json(
                { error: "Cloud saves temporarily unavailable" },
                503,
                allowedOrigin(request, env),
            );
        }
    },
    async scheduled(_event, env) {
        await prune(env);
    },
};
