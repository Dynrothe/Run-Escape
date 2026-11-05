// Offline viewer for run analytics exports: charts, tables and a SQL console on localhost, over
// `wrangler d1 export` dumps loaded into SQLite with Node's built-in node:sqlite.
//
//   node server/analytics/viewer/serve.mjs [dump.sql | folder ...] [--port 8790]
//
// With no files it loads server/analytics/exports/. Files can also be dropped on the page.
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDatabase } from "./load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let port = 8790;
const inputs = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port") {
        port = Number(args[++i]);
    } else {
        inputs.push(args[i]);
    }
}
const exportsFolder = join(here, "..", "exports");
if (inputs.length === 0 && existsSync(exportsFolder)) {
    inputs.push(exportsFolder);
}

const sources = inputs.flatMap((input) => {
    const path = resolve(input);
    const files = statSync(path).isDirectory()
        ? readdirSync(path)
              .filter((name) => name.endsWith(".sql"))
              .sort()
              .map((name) => join(path, name))
        : [path];
    return files.map((file) => ({ name: basename(file), sql: readFileSync(file, "utf8") }));
});

// Rebuilt into a new file each time, so a dump that fails to load leaves the last good one
let db;
let dbPath;
let builds = 0;
function rebuild(next) {
    const path = join(tmpdir(), `run-escape-viewer-${process.pid}-${++builds}.db`);
    let built;
    try {
        built = buildDatabase(next, path);
    } catch (error) {
        rmSync(path, { force: true });
        throw error;
    }
    db?.close();
    if (dbPath) {
        rmSync(dbPath, { force: true });
    }
    db = built;
    dbPath = path;
    sources.splice(0, sources.length, ...next);
}
process.on("exit", () => {
    db?.close();
    if (dbPath) {
        rmSync(dbPath, { force: true });
    }
});
process.on("SIGINT", () => process.exit());

try {
    rebuild(sources.slice());
} catch (error) {
    console.error(`Couldn't load the exports: ${error.message}`);
    rebuild([]);
}

const tables = () =>
    db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map(({ name }) => ({
            name,
            rows: db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n,
            columns: db
                .prepare(`PRAGMA table_info("${name}")`)
                .all()
                .map((c) => c.name),
        }));
const MAX_ROWS = 5000;

function query(sql, params = []) {
    const started = performance.now();
    const statement = db.prepare(sql);
    const rows = [];
    for (const row of statement.iterate(...params)) {
        if (rows.length === MAX_ROWS) {
            return {
                columns: Object.keys(rows[0]),
                rows,
                truncated: true,
                ms: performance.now() - started,
            };
        }
        rows.push(row);
    }
    const columns = rows.length ? Object.keys(rows[0]) : statement.columns().map((c) => c.name);
    return { columns, rows, truncated: false, ms: performance.now() - started };
}

function send(response, status, body, type = "application/json") {
    response.writeHead(status, {
        "content-type": type,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
    });
    response.end(type === "application/json" ? JSON.stringify(body) : body);
}

function readJson(request, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error("Too large"));
                request.destroy();
            } else {
                chunks.push(chunk);
            }
        });
        request.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (error) {
                reject(error);
            }
        });
    });
}

const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);

createServer(async (request, response) => {
    // Another site in the browser, or one rebinding its name to 127.0.0.1, can't use the server:
    // it would arrive under another Host, or as a cross-site POST that JSON can't be without CORS.
    const host = request.headers.host ?? "";
    const origin = request.headers.origin;
    if (!hosts.has(host) || (origin && origin !== `http://${host}`)) {
        return send(response, 403, { error: "Forbidden" });
    }
    const url = new URL(request.url, `http://${host}`);
    if (request.method === "GET" && url.pathname === "/") {
        return send(
            response,
            200,
            readFileSync(join(here, "index.html")),
            "text/html; charset=utf-8",
        );
    }
    if (request.method === "GET" && url.pathname === "/api/meta") {
        return send(response, 200, { files: sources.map((s) => s.name), tables: tables() });
    }
    if (request.method !== "POST" || request.headers["content-type"] !== "application/json") {
        return send(response, 404, { error: "Not found" });
    }
    try {
        if (url.pathname === "/api/query") {
            const { sql, params } = await readJson(request, 1 << 20);
            return send(response, 200, query(sql, params));
        }
        if (url.pathname === "/api/load") {
            const { files } = await readJson(request, 512 << 20);
            rebuild([
                ...sources,
                ...files.map((f) => ({ name: String(f.name), sql: String(f.sql) })),
            ]);
            return send(response, 200, { ok: true });
        }
        if (url.pathname === "/api/clear") {
            rebuild([]);
            return send(response, 200, { ok: true });
        }
        send(response, 404, { error: "Not found" });
    } catch (error) {
        send(response, 400, { error: error.message });
    }
}).listen(port, "127.0.0.1", () => {
    const counts = tables()
        .filter((t) => t.name !== "d1_migrations" && !t.name.startsWith("_cf"))
        .map((t) => `${t.name} ${t.rows}`)
        .join(", ");
    console.log(
        sources.length
            ? `Loaded ${sources.map((s) => s.name).join(", ")} (${counts})`
            : "No exports loaded yet",
    );
    console.log(`Run analytics viewer: http://localhost:${port}`);
});
