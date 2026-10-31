// Serves a build (npm run build, then npm run slim-cache for its slim cache)
// with everything it needs, co-op's relay included, from one Node process
// with no packages:
//
//   npm run serve                          # single player, on port 8080 (or PORT)
//   npm run serve:multiplayer              # with co-op too (or MULTIPLAYER=on)
//
// Without a slim cache in the build it serves the full one from caches/, like
// `vite preview` does.
//
// It sends the headers the game can't load without (see Hosting in
// docs/DEVELOPMENT.md). Players need HTTPS (or localhost), so on a server put
// something that does it in front, like Caddy.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { RELAY_PATH, createRelay, isMultiplayerOn } from "./coop-relay.mjs";

const REPO = resolve(fileURLToPath(import.meta.url), "../..");
const ROOT = resolve(process.env.DIST ?? join(REPO, "dist"));
// The build's slim cache, or the full one
const CACHES = existsSync(join(ROOT, "caches")) ? join(ROOT, "caches") : join(REPO, "caches");
const PORT = parseInt(process.env.PORT ?? "8080");
const HOST = process.env.HOST ?? "0.0.0.0";
const MULTIPLAYER = isMultiplayerOn();

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".map": "application/json",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".ogg": "audio/ogg",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

// The game shares the cache with its workers in a SharedArrayBuffer, which
// browsers only allow on a cross-origin isolated page
const ISOLATION = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
};

// Where a request goes on disk, or undefined for one outside the build (and
// the cache)
function findFile(urlPath) {
    let path;
    try {
        path = decodeURIComponent(urlPath);
    } catch {
        return undefined;
    }
    const inCaches = path.startsWith("/caches/");
    const root = inCaches ? CACHES : ROOT;
    const file = normalize(join(root, inCaches ? path.slice("/caches/".length) : path));
    const rel = relative(root, file);
    if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
        return undefined;
    }
    try {
        const stat = statSync(file);
        if (stat.isDirectory()) {
            const index = join(file, "index.html");
            return { file: index, size: statSync(index).size };
        }
        return { file, size: stat.size };
    } catch {
        return undefined;
    }
}

// Built files and the slim cache are named after what's in them, so they
// keep; the page and the notice (edited on the server) are checked each time
function cacheControl(urlPath) {
    return urlPath.startsWith("/assets/") || /^\/caches\/[^/]+\//.test(urlPath)
        ? "public, max-age=31536000, immutable"
        : "no-cache";
}

const relay = MULTIPLAYER ? createRelay() : undefined;

const server = createServer((req, res) => {
    if (relay?.handleRequest(req, res)) {
        return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
    }
    const urlPath = new URL(req.url ?? "/", "http://localhost").pathname;
    const found = findFile(urlPath);
    if (!found) {
        res.writeHead(404, { "Content-Type": "text/plain", ...ISOLATION });
        res.end("Not found\n");
        return;
    }
    res.writeHead(200, {
        "Content-Type": MIME_TYPES[extname(found.file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": found.size,
        "Cache-Control": cacheControl(urlPath),
        ...ISOLATION,
    });
    if (req.method === "HEAD") {
        res.end();
        return;
    }
    createReadStream(found.file)
        .on("error", () => res.destroy())
        .pipe(res);
});

relay?.attach(server);

if (!existsSync(join(ROOT, "index.html"))) {
    console.error(`No build in ${ROOT}. Run npm run build first.`);
    process.exit(1);
}
if (!existsSync(join(CACHES, "caches.json"))) {
    console.error(`No cache in ${CACHES}. Run npm run download-caches (or npm run slim-cache).`);
    process.exit(1);
}

server.listen(PORT, HOST, () => {
    console.log(`Run Escape on http://localhost:${PORT} (serving ${ROOT})`);
    console.log(`Cache from ${CACHES}`);
    console.log(
        MULTIPLAYER
            ? `Multiplayer on: co-op relay at ${RELAY_PATH}`
            : "Multiplayer off (npm run serve:multiplayer, or MULTIPLAYER=on, turns it on)",
    );
});
