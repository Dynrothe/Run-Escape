import {
    DAY_MS,
    dailyQuery,
    leaderboardQuery,
    utcDay,
    validateRun,
    validateRunCheck,
} from "./schema.mjs";

const MAX_BODY_BYTES = 4096;
const isOn = (value) => value === true || value === "true";
// An environment variable that's a whole number in range, or the fallback
const setting = (value, fallback, min, max) => {
    const n = Number(value ?? fallback);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
// Runs stored a day at most, whoever sends them: a flood can't run through D1's daily write
// allowance (see README, Free-tier budget)
const DEFAULT_MAX_RUNS_PER_DAY = 10_000;
// A relay sends a row only for a run its checks found anything in
const DEFAULT_MAX_CHECKS_PER_DAY = 1000;

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
            "Cross-Origin-Resource-Policy": "cross-origin",
            ...(origin && { "Access-Control-Allow-Origin": origin }),
        },
    });
}

// token: the secret the request has to carry, at least 32 characters
async function authorized(request, token) {
    if (typeof token !== "string" || token.length < 32) return false;
    const supplied = request.headers.get("Authorization") ?? "";
    if (supplied.length > 512) return false;
    // Compare fixed-length hashes; never send the read token to the game build.
    const digest = async (text) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    const [a, b] = await Promise.all([digest(supplied), digest(`Bearer ${token}`)]);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    return difference === 0;
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

// A co-op relay's row for a run its checks found anything in. Only a relay with RUN_CHECKS_TOKEN
// sends these, never a game, so there's no origin to allow.
async function collectCheck(request, env, now) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!(await authorized(request, env.RUN_CHECKS_TOKEN))) {
        return json({ error: "Unauthorized" }, 401);
    }
    if (!env.DB) return json({ error: "Analytics is not configured" }, 503);
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
        return json({ error: "Expected application/json" }, 415);
    }
    let value;
    try {
        value = await readBody(request);
    } catch (error) {
        return json({ error: "Invalid request body" }, error.message === "large" ? 413 : 400);
    }
    const row = validateRunCheck(value, now);
    if (!row) return json({ error: "Invalid run check" }, 400);
    const fields = Object.keys(row);
    const cap = setting(env.MAX_CHECKS_PER_DAY, DEFAULT_MAX_CHECKS_PER_DAY, 1, 1_000_000);
    await env.DB.prepare(
        `INSERT INTO run_checks (${fields.join(",")}) SELECT ${fields.map(() => "?").join(",")}
        WHERE COALESCE((SELECT checks FROM daily_check_intake WHERE day = ?), 0) < ?
        ON CONFLICT(day, check_id) DO NOTHING`,
    )
        .bind(...Object.values(row), row.day, cap)
        .run();
    return json({ accepted: true });
}

export async function collect(request, env, now = Date.now()) {
    const url = new URL(request.url);
    if (url.pathname === "/v1/run-checks") return collectCheck(request, env, now);
    const ingest = url.pathname === "/v1/runs";
    const leaderboard = url.pathname === "/v1/leaderboard";
    const daily = url.pathname === "/v1/daily";
    const publicBoard = leaderboard && isOn(env.PUBLIC_LEADERBOARD);
    const origin = publicBoard ? "*" : allowedOrigin(request, env);
    const respond = (body, status = 200) => json(body, status, origin);
    if (!ingest && !leaderboard && !daily) return respond({ error: "Not found" }, 404);
    if (request.headers.has("Origin") && !origin)
        return respond({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") {
        if (!origin) return respond({ error: "Origin required" }, 403);
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": origin,
                Vary: "Origin",
                "Access-Control-Allow-Methods": ingest ? "POST" : "GET",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Max-Age": "3600",
            },
        });
    }
    if (request.method !== (ingest ? "POST" : "GET"))
        return respond({ error: "Method not allowed" }, 405);
    if (ingest && !origin) return respond({ error: "Origin required" }, 403);
    // Check this on every request, before touching storage or any cached data.
    if (!ingest && !publicBoard && !(await authorized(request, env.ANALYTICS_READ_TOKEN))) {
        return respond({ error: "Unauthorized" }, 401);
    }
    if (!env.DB) return respond({ error: "Analytics is not configured" }, 503);
    const limiter = ingest ? env.INGEST_LIMITER : env.QUERY_LIMITER;
    if (!limiter) return respond({ error: "Rate limiter is not configured" }, 503);
    const { success } = await limiter.limit({
        key: request.headers.get("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return respond({ error: "Too many requests" }, 429);
    if (ingest) {
        if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
            return respond({ error: "Expected application/json" }, 415);
        }
        let value;
        try {
            value = await readBody(request);
        } catch (error) {
            return respond(
                { error: "Invalid request body" },
                error.message === "large" ? 413 : 400,
            );
        }
        const run = validateRun(value, now);
        if (!run) return respond({ error: "Invalid run" }, 400);
        const fields = Object.keys(run);
        const cap = setting(env.MAX_RUNS_PER_DAY, DEFAULT_MAX_RUNS_PER_DAY, 1, 100_000_000);
        // One statement: the day's count is read in the same transaction as the insert. A run
        // past the cap is dropped like a duplicate, so the game doesn't send it again.
        await env.DB.prepare(
            `INSERT INTO runs (${fields.join(",")}) SELECT ${fields.map(() => "?").join(",")}
            WHERE COALESCE((SELECT runs FROM daily_intake WHERE day = ?), 0) < ?
            ON CONFLICT(run_id) DO NOTHING`,
        )
            .bind(...Object.values(run), run.day, cap)
            .run();
        return respond({ accepted: true });
    }
    const query = leaderboard ? leaderboardQuery(url.searchParams) : dailyQuery(url.searchParams);
    if (!query) return respond({ error: "Invalid filters" }, 400);
    const { results } = await env.DB.prepare(query.sql)
        .bind(...query.values)
        .all();
    return respond({
        rows: results.slice(0, 1000),
        ...(daily && { truncated: results.length > 1000 }),
        trust: "client-reported",
        timezone: "UTC",
    });
}

// Each statement stays short, and an hour's run deletes up to PRUNE_BATCH * PRUNE_BATCHES raw
// rows: well past MAX_RUNS_PER_DAY, so a backlog clears instead of growing.
const PRUNE_BATCH = 1000;
const PRUNE_BATCHES = 50;

// Runs a delete until it has nothing left to do, or PRUNE_BATCHES times
async function drain(statement, done) {
    for (let i = 0; i < PRUNE_BATCHES; i++) {
        const { meta } = await statement.run();
        if (done(meta?.changes ?? 0)) {
            return;
        }
    }
}

export async function prune(env, now = Date.now()) {
    if (!env.DB) {
        return;
    }
    // Retention is at least 2 days: run_id dedupe has to outlast the day a report may arrive late
    const raw = utcDay(now - setting(env.RAW_RETENTION_DAYS, 30, 2, 3650) * DAY_MS);
    const daily = utcDay(now - setting(env.DAILY_RETENTION_DAYS, 365, 2, 3650) * DAY_MS);
    await drain(
        env.DB.prepare(
            `DELETE FROM runs WHERE run_id IN (SELECT run_id FROM runs WHERE day < ? LIMIT ${PRUNE_BATCH})`,
        ).bind(raw),
        (changes) => changes < PRUNE_BATCH,
    );
    // A day of totals at a time; MAX_RUNS_PER_DAY bounds how many rows a day has
    await drain(
        env.DB.prepare(
            "DELETE FROM daily_stats WHERE day = (SELECT MIN(day) FROM daily_stats WHERE day < ?)",
        ).bind(daily),
        (changes) => changes === 0,
    );
    await drain(
        env.DB.prepare(
            `DELETE FROM run_checks WHERE (day, check_id) IN
            (SELECT day, check_id FROM run_checks WHERE day < ? LIMIT ${PRUNE_BATCH})`,
        ).bind(raw),
        (changes) => changes < PRUNE_BATCH,
    );
    await env.DB.prepare("DELETE FROM daily_intake WHERE day < ?").bind(daily).run();
    await env.DB.prepare("DELETE FROM daily_check_intake WHERE day < ?").bind(daily).run();
}

export default {
    async fetch(request, env) {
        try {
            return await collect(request, env);
        } catch {
            return json(
                { error: "Analytics temporarily unavailable" },
                503,
                allowedOrigin(request, env),
            );
        }
    },
    async scheduled(_event, env) {
        await prune(env);
    },
};
