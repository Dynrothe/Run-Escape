import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import type { Server as HttpServer } from "node:http";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { parseRange } from "./desktop/gameServer";
import { createRelay, isMetricsOn, isMultiplayerOn } from "./server/coop-relay.mjs";

const CACHES_ROOT = resolve(process.cwd(), "caches");

// Shown on the title screen, beside CHANGELOG.md
const { version } = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

// Which build this is, for co-op: copies of a run from different builds fall
// out of step, so a room only takes players on the host's. The slim cache is
// made for one too (build.json). The commit, or when the server started
// without one.
function buildId(): string {
    try {
        const commit = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return `${version}-${commit}`;
    } catch {
        return `${version}-${Date.now().toString(36)}`;
    }
}

// Worked out once, so build.json and the game can't disagree
const BUILD_ID = buildId();

// Writes build.json beside index.html, for scripts/cache/slim-cache.ts: a slim
// cache is made for one build, and the game checks that it's the one it's on
function buildIdFilePlugin(): Plugin {
    return {
        name: "build-id-file",
        apply: "build",
        generateBundle() {
            this.emitFile({
                type: "asset",
                fileName: "build.json",
                source: JSON.stringify({ build: BUILD_ID }),
            });
        },
    };
}

const MIME_TYPES: Record<string, string> = {
    ".dat": "application/octet-stream",
    ".dat2": "application/octet-stream",
    ".json": "application/json",
    ".png": "image/png",
    ".wasm": "application/wasm",
    ".zip": "application/zip",
};

function mimeFor(filePath: string): string {
    const dot = filePath.lastIndexOf(".");
    if (dot === -1) {
        return "application/octet-stream";
    }
    return MIME_TYPES[filePath.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

// Replicates ts-shader-loader: resolves `#include "./path";` directives in
// .glsl files and returns the resulting source as a string module.
function glslIncludesPlugin(): Plugin {
    const includeRegex = /^[ \t]*#include\s+"([^"]+)"\s*;?[ \t]*$/gm;

    return {
        name: "glsl-includes",
        enforce: "pre",
        load(id) {
            if (!/\.glsl($|\?)/.test(id)) {
                return null;
            }
            const filePath = id.replace(/\?.*$/, "");

            const resolveIncludes = (file: string, source: string): string =>
                source.replace(includeRegex, (_match, relPath: string) => {
                    const incPath = resolve(dirname(file), relPath);
                    this.addWatchFile(incPath);
                    return resolveIncludes(incPath, readFileSync(incPath, "utf8"));
                });

            const resolved = resolveIncludes(filePath, readFileSync(filePath, "utf8"));
            return `export default ${JSON.stringify(resolved)};`;
        },
    };
}

// Serves the gitignored `caches/` directory at `/caches` during dev and
// `vite preview`, matching the previous craco devServer express.static middleware.
// `vite preview` serves the build's slim cache instead once `bun run slim-cache`
// has written one to dist/caches.
function serveCachesPlugin(): Plugin {
    const serveCaches = (middlewares: Connect.Server, root: string) => {
        middlewares.use("/caches", (req, res, next) => {
            // The game asks for caches.json?build=<its build>
            let reqUrl: string;
            try {
                reqUrl = decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0]);
            } catch {
                res.statusCode = 400;
                res.end();
                return;
            }
            const filePath = normalize(join(root, reqUrl));
            const rel = relative(root, filePath);
            if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
                res.statusCode = 403;
                res.end();
                return;
            }
            const notFound = () => {
                res.statusCode = 404;
                res.end();
            };
            try {
                const stat = statSync(filePath);
                if (stat.isDirectory()) {
                    notFound();
                    return;
                }
                const lastModified = stat.mtime.toUTCString();
                res.setHeader("Content-Type", mimeFor(filePath));
                res.setHeader("Cache-Control", "no-cache");
                res.setHeader("Accept-Ranges", "bytes");
                res.setHeader("Last-Modified", lastModified);
                // A download that was cut off (a phone on a tunnel) resumes from where it got to:
                // CacheFiles asks for bytes=<offset>-<MAX_SAFE_INTEGER>, and without this got the
                // whole file again, back to 0% each time. Parsed as the desktop app's server does
                // (parseRange). CacheFiles sends the Last-Modified its parts came with as If-Range,
                // so a file that's changed since is sent whole.
                const ifRange = req.headers["if-range"];
                const range =
                    ifRange === undefined || ifRange === lastModified
                        ? parseRange(req.headers.range ?? null, stat.size)
                        : undefined;
                if (range === "unsatisfiable") {
                    res.statusCode = 416;
                    res.setHeader("Content-Range", `bytes */${stat.size}`);
                    res.end();
                    return;
                }
                const { start, end } = range ?? { start: 0, end: stat.size - 1 };
                if (range) {
                    res.statusCode = 206;
                    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
                }
                res.setHeader("Content-Length", Math.max(0, end - start + 1));
                if (req.method === "HEAD" || end < start) {
                    res.end();
                    return;
                }
                // pipeline, not pipe: the file's closed with the reply (a phone that drops it),
                // and a read that fails cuts the reply off rather than leaving it short. It's
                // already destroyed by then, so there's nothing left to answer with.
                pipeline(createReadStream(filePath, { start, end }), res, () => {});
            } catch {
                notFound();
            }
        });
    };

    return {
        name: "serve-caches",
        configureServer(server) {
            serveCaches(server.middlewares, CACHES_ROOT);
        },
        // Without this, `vite preview` answers /caches/* with the SPA's index.html.
        configurePreviewServer(server) {
            const { root, build } = server.config;
            const slimRoot = resolve(root, build.outDir, "caches");
            serveCaches(server.middlewares, existsSync(slimRoot) ? slimRoot : CACHES_ROOT);
        },
    };
}

// Runs the co-op relay (server/coop-relay.mjs) at /coop on the dev server and
// `vite preview`, unless multiplayer's turned off (bun run start:singleplayer,
// or MULTIPLAYER=off). Off, the game hides co-op.
function coopRelayPlugin(): Plugin {
    const start = (httpServer: HttpServer | null, middlewares: Connect.Server) => {
        if (!httpServer || !isMultiplayerOn()) {
            return;
        }
        // Metrics only when asked for (MULTIPLAYER_METRICS=on): a dev server's
        // not scraped, and two checkouts would fight over the port
        const relay = createRelay({ metrics: isMetricsOn(process.env, false) });
        relay.attach(httpServer);
        middlewares.use((req, res, next) => {
            if (!relay.handleRequest(req, res)) {
                next();
            }
        });
    };
    return {
        name: "coop-relay",
        configureServer(server) {
            start(server.httpServer as HttpServer | null, server.middlewares);
        },
        configurePreviewServer(server) {
            start(server.httpServer as HttpServer, server.middlewares);
        },
    };
}

// Routes bare `.wasm` imports (e.g. the Emscripten `require("./module.wasm")`
// hack inside @foxglove/wasm-bz2) through Vite's `?url` asset handling so they
// resolve to an asset URL string, matching webpack's behaviour. Imports that
// already carry a query (e.g. `*.wasm?url`) are left untouched.
function wasmAssetUrlPlugin(): Plugin {
    return {
        name: "wasm-asset-url",
        enforce: "pre",
        async resolveId(source, importer, options) {
            if (!source.endsWith(".wasm") || source.includes("?")) {
                return null;
            }
            const resolution = await this.resolve(source, importer, {
                ...options,
                skipSelf: true,
            });
            if (!resolution) {
                return null;
            }
            return { ...resolution, id: `${resolution.id}?url` };
        },
    };
}

// wasm-gzip's script ends with a `sourceMappingURL` comment for a map the
// package doesn't ship, so the dev server warns about it. Serves the script
// without the comment (Vite only looks for a source map when no plugin loads it).
function wasmGzipNoSourceMapPlugin(): Plugin {
    return {
        name: "wasm-gzip-no-source-map",
        apply: "serve",
        load(id) {
            if (!/[\\/]wasm-gzip[\\/]wasm_gzip\.js($|\?)/.test(id)) {
                return null;
            }
            const source = readFileSync(id.replace(/\?.*$/, ""), "utf8");
            return source.replace(/\r?\n\/\/# sourceMappingURL=\S+\s*$/, "\n");
        },
    };
}

// The dev server has ScapeRune's dev maps and map generator. A build swaps both
// for empty stand-ins, so only what shipped maps use goes out to players.
function leaveOutDevMapsPlugin(): Plugin {
    const standIns: [RegExp, string][] = [
        [/\/devMaps$/, "src/game/scaperune/maps/devMaps.build.ts"],
        [/\/MapGeneratorScreen$/, "src/game/scaperune/MapGeneratorScreen.build.tsx"],
    ];
    return {
        name: "leave-out-dev-maps",
        apply: "build",
        enforce: "pre",
        resolveId(source) {
            const standIn = standIns.find(([pattern]) => pattern.test(source));
            return standIn ? resolve(process.cwd(), standIn[1]) : null;
        },
    };
}

export default defineConfig({
    // Relative asset URLs, so a build works wherever it's put (a site's root
    // or a folder like https://example.com/game/)
    base: "./",
    plugins: [
        react(),
        glslIncludesPlugin(),
        serveCachesPlugin(),
        coopRelayPlugin(),
        wasmAssetUrlPlugin(),
        wasmGzipNoSourceMapPlugin(),
        leaveOutDevMapsPlugin(),
        buildIdFilePlugin(),
    ],
    define: {
        __APP_VERSION__: JSON.stringify(version),
        __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    resolve: {
        // ".web.*" takes precedence so browser-specific variants (e.g. Gzip.web.ts)
        // resolve the same way they did under CRA's webpack config.
        extensions: [
            ".web.ts",
            ".web.tsx",
            ".web.js",
            ".mjs",
            ".js",
            ".ts",
            ".jsx",
            ".tsx",
            ".json",
        ],
    },
    optimizeDeps: {
        // wasm-gzip finds its .wasm via `new URL(..., import.meta.url)`, which
        // breaks once the dep optimizer moves it into node_modules/.vite.
        exclude: ["wasm-gzip"],
    },
    server: {
        // Required for SharedArrayBuffer / multi-threaded workers.
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
    },
    worker: {
        // The render data worker is spawned with `{ type: "module" }` and its
        // bundle code-splits (Bzip2 dynamically imports @foxglove/wasm-bz2),
        // which the default "iife" format can't express.
        format: "es",
        // User plugins are not applied to worker bundles by default; the wasm
        // URL handling is needed there too (the worker imports @foxglove/wasm-bz2).
        plugins: () => [wasmAssetUrlPlugin(), leaveOutDevMapsPlugin()],
    },
    build: {
        target: "es2020",
        sourcemap: true,
    },
    test: {
        // The Cloudflare relay's tests run its rooms under Node
        alias: { "cloudflare:workers": resolve("server/cloudflare/test/durable-object.mjs") },
        // Game logic tests need no DOM; UI tests can opt in with
        // `// @vitest-environment jsdom`.
        environment: "node",
        globals: true,
        setupFiles: ["src/setupTests.ts"],
        passWithNoTests: true,
    },
});
