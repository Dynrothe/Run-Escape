// The website's build, for a launcher that follows it rather than GitHub's releases. Co-op only
// takes players on the host's build, so an app on the website's build can always play with the
// website's players.
//
// Each build writes game-files.json beside index.html (vite.config.ts): every file but the slim
// cache's, with its sha256, and the addresses it was built with. The cache's chunks are named
// after their sha256 and listed in caches.json, which bun run slim-cache writes afterwards.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
    CHUNK_FILE_PATTERN,
    ManifestChunk,
    compareVersions,
    isShipped,
    isVersion,
    zipEntryPath,
} from "./gameFiles";

export const SITE_FILES_NAME = "game-files.json";

export type SiteFile = { path: string; sha256: string; size: number };

// The relay, run collector and cloud saves the build reaches (its VITE_ variables), "" for none
export type SiteAddresses = { coopUrl: string; runAnalyticsUrl: string; cloudSaveUrl: string };

export type SiteFiles = SiteAddresses & {
    build: string;
    version: string;
    minLauncher: string;
    files: SiteFile[];
};

// What __BUILD_ID__ is (vite.config.ts): the version, and the commit or the time it was built
const BUILD_PATTERN = /^(\d+\.\d+\.\d+)-[0-9a-z]{1,16}$/;

export const isBuildId = (build: unknown): build is string =>
    typeof build === "string" && BUILD_PATTERN.test(build);

const isSize = (size: unknown): size is number =>
    typeof size === "number" && Number.isSafeInteger(size) && size >= 0;
const isSha256 = (sha256: unknown): sha256 is string =>
    typeof sha256 === "string" && /^[0-9a-f]{64}$/.test(sha256);

// A listed file's path is somewhere inside the game's folder, and isn't one the launcher writes
// itself: the cache (from caches.json) and the marker of a finished install
export function isSiteFilePath(file: unknown): file is string {
    if (typeof file !== "string" || file.includes("\\") || file.startsWith("caches/")) {
        return false;
    }
    if (file === "verified.json" || file === SITE_FILES_NAME) {
        return false;
    }
    try {
        zipEntryPath(path.resolve("/game"), file);
        return !file.endsWith("/");
    } catch {
        return false;
    }
}

export function parseSiteFiles(text: string): SiteFiles {
    const data = JSON.parse(text) ?? {};
    const { build, version, minLauncher, files } = data;
    if (!isBuildId(build) || build.split("-")[0] !== version || !isVersion(minLauncher)) {
        throw new Error(`${SITE_FILES_NAME}'s build or versions aren't valid`);
    }
    const addresses = ["coopUrl", "runAnalyticsUrl", "cloudSaveUrl"] as const;
    if (!addresses.every((key) => typeof data[key] === "string")) {
        throw new Error(`${SITE_FILES_NAME}'s addresses aren't valid`);
    }
    const seen = new Set<string>();
    const valid =
        Array.isArray(files) &&
        files.every(
            (file) =>
                isSiteFilePath(file?.path) &&
                !seen.has(file.path.toLowerCase()) &&
                seen.add(file.path.toLowerCase()) &&
                isSha256(file.sha256) &&
                isSize(file.size),
        );
    if (!valid || !seen.has("index.html")) {
        throw new Error(`${SITE_FILES_NAME}'s files aren't valid`);
    }
    return {
        build,
        version,
        minLauncher,
        coopUrl: data.coopUrl,
        runAnalyticsUrl: data.runAnalyticsUrl,
        cloudSaveUrl: data.cloudSaveUrl,
        files: files.map(({ path, sha256, size }: SiteFile) => ({ path, sha256, size })),
    };
}

// The slim cache's chunks, from the website's caches.json, which has to be made for the same build
export function parseSiteCaches(text: string, build: string): ManifestChunk[] {
    const caches = JSON.parse(text);
    const cache = Array.isArray(caches) && caches.length === 1 ? caches[0] : undefined;
    if (!cache?.slimOf || !Array.isArray(cache.chunks)) {
        throw new Error("The website's caches.json isn't a slim cache");
    }
    if (cache.build !== build) {
        throw new Error(`The website's cache is for ${cache.build}, not ${build}`);
    }
    const seen = new Set<string>();
    for (const chunk of cache.chunks) {
        const file = chunk?.file;
        if (typeof file !== "string" || !CHUNK_FILE_PATTERN.test(file) || seen.has(file)) {
            throw new Error(`The website's caches.json lists a chunk called ${file}`);
        }
        if (!isSize(chunk.size)) {
            throw new Error(`The website's caches.json has no size for ${file}`);
        }
        seen.add(file);
    }
    return cache.chunks.map(({ file, size }: ManifestChunk) => ({ file, size }));
}

// Why this launcher shouldn't play the website's build, or undefined if it can. The app only lets
// out the addresses it was built with, so a build reaching others would lose co-op or saves.
export function whyNotFollow(
    site: SiteFiles,
    launcherVersion: string,
    launcher: SiteAddresses,
): string | undefined {
    if (compareVersions(site.minLauncher, launcherVersion) > 0) {
        return `${site.build} needs launcher ${site.minLauncher}`;
    }
    for (const key of ["coopUrl", "runAnalyticsUrl", "cloudSaveUrl"] as const) {
        if (site[key] !== launcher[key]) {
            return `${site.build} was built with ${key} ${JSON.stringify(site[key])}, not ${JSON.stringify(launcher[key])}`;
        }
    }
    return undefined;
}

// The website's address, from the launcher's build: https, with nothing but a path, and ending in
// a slash so the game's files resolve inside it. Undefined when it's not set or not valid.
export function siteBaseUrl(raw: string | undefined): string | undefined {
    if (!raw) {
        return undefined;
    }
    try {
        const url = new URL(raw);
        const plain = url.protocol === "https:" && !url.username && !url.password;
        if (!plain || url.search || url.hash) {
            return undefined;
        }
        if (!url.pathname.endsWith("/")) {
            url.pathname += "/";
        }
        return url.href;
    } catch {
        return undefined;
    }
}

// Where a listed file is on the website. Each segment's encoded, so a name can't become a query.
export const siteFileUrl = (base: string, file: string) =>
    new URL(file.split("/").map(encodeURIComponent).join("/"), base).href;

// What a game zip has (desktop/release-files.ts), but the cache, which has its own list
const isListed = (relative: string) =>
    isShipped(relative) && !relative.startsWith("caches/") && relative !== SITE_FILES_NAME;

function listFiles(dir: string, root = dir): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return listFiles(file, root);
        }
        return [path.relative(root, file).split(path.sep).join("/")];
    });
}

// The list for a build in dist: everything in it but what isListed leaves out
export function makeSiteFiles(
    dist: string,
    build: string,
    minLauncher: string,
    addresses: SiteAddresses,
): SiteFiles {
    const files = listFiles(dist)
        .filter(isListed)
        .sort()
        .map((file) => {
            const data = readFileSync(path.join(dist, file));
            const sha256 = createHash("sha256").update(data).digest("hex");
            return { path: file, sha256, size: data.byteLength };
        });
    return { build, version: build.split("-")[0], minLauncher, ...addresses, files };
}
