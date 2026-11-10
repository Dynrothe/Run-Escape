// Cloud saves: a save kept against a sync code, so it can be carried to another device. The
// Worker checks a save's shape and size only, never the game's rules, so a release with new
// maps or items needs no redeploy (README, What it accepts).
import {
    MAX_STORED_BYTES,
    compareGameVersions,
    formatCode,
    newCode,
    normalizeCode,
    readSave,
} from "./schema.mjs";

// The request around a save (MAX_SAVE_BYTES): the save as a JSON string, escaped, plus a few
// fields
const MAX_BODY_BYTES = 196_608;
const DAY_MS = 86_400_000;
const utcDay = (time) => new Date(time).toISOString().slice(0, 10);

// An environment variable that's a whole number in range, or the fallback
const setting = (value, fallback, min, max) => {
    const n = Number(value ?? fallback);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
// The newest save and its backups
const DEFAULT_KEEP_VERSIONS = 6;
// And each of the last few UTC days' last version, however many uploads came after it: a flood
// of uploads (from a leaked code, say) can push out the newest few, but not yesterday's
const DEFAULT_KEEP_DAYS = 7;
// Caps on what's stored a day, whoever sends it, so a flood can't run through D1's daily write
// allowance, which the run collector shares if it's on the same account (README, Budget)
const DEFAULT_MAX_SAVES_PER_DAY = 5000;
const DEFAULT_MAX_ACCOUNTS_PER_DAY = 2000;
// Deletes, restores and new codes for old ones: each writes the code's row, so taking turns at
// deleting and restoring could otherwise run through the day's writes too
const DEFAULT_MAX_ACCOUNT_CHANGES_PER_DAY = 2000;
// Each code's own uploads a day, so no one code uses up MAX_SAVES_PER_DAY
const DEFAULT_MAX_UPLOADS_PER_CODE_PER_DAY = 300;
// A code nobody's used for this long goes, with its saves
const DEFAULT_INACTIVE_DAYS = 25;
// A code that never got a save goes after this long
const UNUSED_CODE_MS = 7 * DAY_MS;
const dayOf = (time) => Math.floor(time / DAY_MS);
// A deleted code's saves are kept this long, for the code to restore
const DEFAULT_DELETED_RETENTION_DAYS = 7;
const retention = (env) =>
    setting(env.DELETED_RETENTION_DAYS, DEFAULT_DELETED_RETENTION_DAYS, 1, 90) * DAY_MS;

async function sha256(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

// The account a request's sync code belongs to: { id, deleted_at, created_at, used_day }
async function account(request, env) {
    const header = request.headers.get("Authorization") ?? "";
    const code = header.startsWith("Bearer ") ? normalizeCode(header.slice(7)) : undefined;
    if (!code) return undefined;
    const { results } = await env.DB.prepare(
        "SELECT id, deleted_at, created_at, used_day FROM accounts WHERE code_hash = ?",
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

// A change to a code (a delete, a restore, a new code), counted in the day's, and false once
// there have been MAX_ACCOUNT_CHANGES_PER_DAY. Read first, so one past the cap writes nothing.
async function changeAccount(env, now, statement) {
    const cap = setting(
        env.MAX_ACCOUNT_CHANGES_PER_DAY,
        DEFAULT_MAX_ACCOUNT_CHANGES_PER_DAY,
        1,
        10_000_000,
    );
    const day = utcDay(now);
    const { results } = await env.DB.prepare("SELECT changes FROM daily_intake WHERE day = ?")
        .bind(day)
        .all();
    if ((results[0]?.changes ?? 0) >= cap) return false;
    await env.DB.batch([
        statement,
        env.DB.prepare(
            `INSERT INTO daily_intake (day, changes) VALUES (?, 1)
            ON CONFLICT(day) DO UPDATE SET changes = changes + 1`,
        ).bind(day),
    ]);
    return true;
}

const NO_MORE_CHANGES = { error: "No more changes to cloud saves today" };

// A new code for the same saves, and the old one stops working: what to do when a code's
// leaked. Deleting wouldn't do, as whoever has the code could restore it.
async function rotateCode(env, accountId, now, respond) {
    const code = newCode();
    const update = env.DB.prepare("UPDATE accounts SET code_hash = ? WHERE id = ?").bind(
        await sha256(code),
        accountId,
    );
    if (!(await changeAccount(env, now, update))) return respond(NO_MORE_CHANGES, 503);
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
    const body = await gzip(value.save);
    if (body.byteLength > MAX_STORED_BYTES) return respond({ error: "Save too large" }, 413);
    const today = dayOf(now);
    const perCode = setting(
        env.MAX_UPLOADS_PER_CODE_PER_DAY,
        DEFAULT_MAX_UPLOADS_PER_CODE_PER_DAY,
        1,
        100_000,
    );
    const keep = setting(env.KEEP_VERSIONS, DEFAULT_KEEP_VERSIONS, 1, 50);
    // The first UTC day (in days since 1970) whose last version is kept
    const firstDay =
        Math.floor(now / DAY_MS) - setting(env.KEEP_DAYS, DEFAULT_KEEP_DAYS, 0, 90) + 1;
    const cap = setting(env.MAX_SAVES_PER_DAY, DEFAULT_MAX_SAVES_PER_DAY, 1, 100_000_000);
    // One transaction. The insert only goes in on top of the revision it was based on, so a
    // device far behind can't write a revision that was pruned and look as if it synced.
    const [insert] = await env.DB.batch([
        env.DB.prepare(
            `INSERT INTO saves
            (account_id, revision, body, save_version, game_version, summary, created_at)
            SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE COALESCE((SELECT MAX(revision) FROM saves WHERE account_id = ?), 0) = ?
            AND COALESCE((SELECT saves FROM daily_intake WHERE day = ?), 0) < ?
            AND (SELECT CASE WHEN uploads_day = ? THEN uploads ELSE 0 END
                FROM accounts WHERE id = ?) < ?`,
        ).bind(
            accountId,
            base + 1,
            body,
            save.version,
            save.gameVersion,
            JSON.stringify(save.summary),
            now,
            accountId,
            base,
            utcDay(now),
            cap,
            today,
            accountId,
            perCode,
        ),
        env.DB.prepare(
            `DELETE FROM saves WHERE account_id = ?
            AND revision <= (SELECT MAX(revision) FROM saves WHERE account_id = ?) - ?
            AND revision NOT IN (SELECT MAX(revision) FROM saves
                WHERE account_id = ? AND created_at / ${DAY_MS} >= ?
                GROUP BY created_at / ${DAY_MS})`,
        ).bind(accountId, accountId, keep, accountId, firstDay),
    ]);
    if (!insert.meta?.changes) {
        const after = await latestSave(env, accountId);
        if ((after?.revision ?? 0) !== base) {
            return respond({ reason: "stale", ...meta(after) }, 409);
        }
        const { results } = await env.DB.prepare(
            "SELECT uploads_day, uploads FROM accounts WHERE id = ?",
        )
            .bind(accountId)
            .all();
        const usage = results[0];
        if (usage && usage.uploads_day === today && usage.uploads >= perCode) {
            return respond({ error: "No more uploads for this code today" }, 429);
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
        "/v1/account/code": ["POST"],
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
        // Keeps other websites' pages from making codes in a visitor's browser. It isn't a lock:
        // anything but a browser can send any Origin, and Android's is every app's that uses
        // WebViewAssetLoader. The rate limits and caps are what bound a stranger.
        if (!origin) return respond({ error: "Origin required" }, 403);
        if (!(await limit(env.ACCOUNT_LIMITER, ip))) {
            return respond({ error: "Too many requests" }, 429);
        }
        return createAccount(env, now, respond);
    }
    const found = await account(request, env);
    if (!found) return respond({ error: "Unknown sync code" }, 401);
    const accountId = found.id;
    // Deletes, restores and new codes, per address as new codes are, so no one address can use
    // up the day's changes for everyone
    const changeLimit = async () => limit(env.ACCOUNT_LIMITER, ip);
    // Deleted: the saves are kept, untouched, until the daily job removes them. Restoring is the
    // only thing the code can do meanwhile.
    if (found.deleted_at !== null && found.deleted_at !== undefined) {
        if (pathname === "/v1/account/restore") {
            if (!(await changeLimit())) return respond({ error: "Too many requests" }, 429);
            const restore = env.DB.prepare(
                "UPDATE accounts SET deleted_at = NULL WHERE id = ?",
            ).bind(accountId);
            if (!(await changeAccount(env, now, restore))) return respond(NO_MORE_CHANGES, 503);
            return respond({ restored: true });
        }
        return respond(
            { error: "Deleted", restorableUntil: found.deleted_at + retention(env) },
            410,
        );
    }
    if (pathname === "/v1/account/restore") return respond({ restored: false });
    // The last day a code was used, for INACTIVE_DAYS: written at most once a day (an upload's
    // trigger writes it too)
    const lastUsed = found.used_day ?? dayOf(found.created_at);
    if (lastUsed < dayOf(now) && request.method !== "PUT") {
        await env.DB.prepare("UPDATE accounts SET used_day = ? WHERE id = ?")
            .bind(dayOf(now), accountId)
            .run();
    }
    if (pathname === "/v1/account/code") {
        if (!(await changeLimit())) return respond({ error: "Too many requests" }, 429);
        return rotateCode(env, accountId, now, respond);
    }
    if (pathname === "/v1/account") {
        if (!(await changeLimit())) return respond({ error: "Too many requests" }, 429);
        const remove = env.DB.prepare("UPDATE accounts SET deleted_at = ? WHERE id = ?").bind(
            now,
            accountId,
        );
        if (!(await changeAccount(env, now, remove))) return respond(NO_MORE_CHANGES, 503);
        return respond({ deleted: true, restorableUntil: now + retention(env) });
    }
    if (pathname === "/v1/save/meta") return respond(meta(await latestSave(env, accountId)));
    if (request.method === "GET") {
        const latest = await latestSave(env, accountId);
        return respond(latest ? { ...meta(latest), save: await gunzip(latest.body) } : meta());
    }
    // Per code, and per address whatever the code, so one address can't use up the day's saves
    if (
        !(await limit(env.UPLOAD_LIMITER, accountId)) ||
        !(await limit(env.UPLOAD_IP_LIMITER, ip))
    ) {
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
    // Codes nobody's used for INACTIVE_DAYS, with their saves, and codes that never got a save
    const idle = dayOf(now) - setting(env.INACTIVE_DAYS, DEFAULT_INACTIVE_DAYS, 7, 3650);
    const lastUsed = `COALESCE(used_day, created_at / ${DAY_MS})`;
    await env.DB.batch([
        env.DB.prepare(
            `DELETE FROM saves WHERE account_id IN
            (SELECT id FROM accounts WHERE ${lastUsed} < ?)`,
        ).bind(idle),
        env.DB.prepare(`DELETE FROM accounts WHERE ${lastUsed} < ?`).bind(idle),
        env.DB.prepare(
            `DELETE FROM accounts WHERE created_at < ?
            AND NOT EXISTS (SELECT 1 FROM saves WHERE saves.account_id = accounts.id)`,
        ).bind(now - UNUSED_CODE_MS),
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
