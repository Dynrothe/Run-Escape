import { DAY_MS, dailyQuery, leaderboardQuery, utcDay, validateRun } from "./schema.mjs";

const MAX_BODY_BYTES = 4096;
const isOn = (value) => value === true || value === "true";

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

async function authorized(request, env) {
    if (typeof env.ANALYTICS_READ_TOKEN !== "string" || env.ANALYTICS_READ_TOKEN.length < 32)
        return false;
    const supplied = request.headers.get("Authorization") ?? "";
    if (supplied.length > 512) return false;
    // Compare fixed-length hashes; never send the read token to the game build.
    const digest = async (text) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    const [a, b] = await Promise.all([
        digest(supplied),
        digest(`Bearer ${env.ANALYTICS_READ_TOKEN}`),
    ]);
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

export async function collect(request, env) {
    const url = new URL(request.url);
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
    if (!ingest && !publicBoard && !(await authorized(request, env))) {
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
        const run = validateRun(value);
        if (!run) return respond({ error: "Invalid run" }, 400);
        const fields = Object.keys(run);
        await env.DB.prepare(
            `INSERT INTO runs (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})
            ON CONFLICT(run_id) DO NOTHING`,
        )
            .bind(...Object.values(run))
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

const retentionDays = (value, fallback) => {
    const n = Number(value ?? fallback);
    return Number.isInteger(n) && n >= 2 && n <= 3650 ? n : fallback;
};

export async function prune(env, now = Date.now()) {
    if (!env.DB) return;
    // Bounded hourly work; retaining summaries doesn't require retaining raw runs.
    const raw = utcDay(now - retentionDays(env.RAW_RETENTION_DAYS, 30) * DAY_MS);
    const daily = utcDay(now - retentionDays(env.DAILY_RETENTION_DAYS, 365) * DAY_MS);
    await env.DB.batch([
        env.DB.prepare(
            "DELETE FROM runs WHERE run_id IN (SELECT run_id FROM runs WHERE day < ? ORDER BY day LIMIT 1000)",
        ).bind(raw),
        env.DB.prepare(
            "DELETE FROM daily_stats WHERE rowid IN (SELECT rowid FROM daily_stats WHERE day < ? ORDER BY day LIMIT 1000)",
        ).bind(daily),
    ]);
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
