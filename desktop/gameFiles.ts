import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";

// A chunk of the slim cache, in caches/chunks/ (src/rs/cache/ChunkedCache.ts): its name is the
// first 32 hex digits of its sha256
export type ManifestChunk = { file: string; size: number };

// lite and chunks are the game zip split in two: the zip without caches/chunks/, and the chunks
// as their own release assets, so an update downloads only the chunks that changed. Launchers
// from before them ignore both and download the whole zip.
export type GameManifest = {
    version: string;
    sha256: string;
    minLauncher: string;
    lite?: { sha256: string; size: number };
    chunks?: ManifestChunk[];
};

export const CHUNK_FILE_PATTERN = /^[0-9a-f]{32}\.bin$/;

// The name a chunk with these bytes has
export const chunkName = (data: Uint8Array) =>
    createHash("sha256").update(data).digest("hex").slice(0, 32) + ".bin";

// Where a game folder keeps its chunks
export const chunkPath = (folder: string, file: string) =>
    path.join(folder, "caches", "chunks", file);

export const isSize = (size: unknown): size is number =>
    typeof size === "number" && Number.isSafeInteger(size) && size >= 0;
export const isSha256 = (sha256: unknown): sha256 is string =>
    typeof sha256 === "string" && /^[0-9a-f]{64}$/.test(sha256);

// A set of game files: the ones bundled with the launcher, or an update in the user data folder.
// The bundled ones have no minLauncher, as they came with this launcher. fromSite is the website's
// build (siteUpdate.ts) rather than a release.
export type GameFolder = {
    version: string;
    path: string;
    minLauncher?: string;
    fromSite?: boolean;
};

// Whether this launcher can run a folder's files. The bundled ones came with it.
export const canRun = (folder: GameFolder, launcherVersion: string) =>
    !folder.minLauncher || compareVersions(folder.minLauncher, launcherVersion) <= 0;

// Whether a file in dist/ is part of the game. Source maps are for debugging a hosted build, and
// they're as big as the game's code, and .htaccess is the web server's.
export const isShipped = (file: string) =>
    !file.endsWith(".map") && path.basename(file) !== ".htaccess";

// Every file in a folder, by its path inside it with forward slashes, as a zip entry or a URL has
// it (this runs on Windows)
export function listFiles(root: string, dir = root): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return listFiles(root, file);
        }
        return [path.relative(root, file).split(path.sep).join("/")];
    });
}

export function isVersion(version: unknown): version is string {
    return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version);
}

// Below 0 when a is older than b, above 0 when it's newer. Numeric, so 0.10.0 is after 0.9.0.
export function compareVersions(a: string, b: string): number {
    const [partsA, partsB] = [a, b].map((version) => {
        if (!isVersion(version)) {
            throw new Error(`Not a version: ${version}`);
        }
        return version.split(".").map(Number);
    });
    return partsA[0] - partsB[0] || partsA[1] - partsB[1] || partsA[2] - partsB[2];
}

export function parseManifest(text: string): GameManifest {
    const { version, sha256, minLauncher, lite, chunks } = JSON.parse(text) ?? {};
    if (!isVersion(version) || !isVersion(minLauncher)) {
        throw new Error("The manifest's versions aren't valid");
    }
    if (!isSha256(sha256)) {
        throw new Error("The manifest's sha256 isn't valid");
    }
    const manifest: GameManifest = { version, sha256, minLauncher };
    if (lite === undefined && chunks === undefined) {
        return manifest;
    }
    if (!isSha256(lite?.sha256) || !isSize(lite?.size)) {
        throw new Error("The manifest's lite zip isn't valid");
    }
    const files = new Set<string>();
    const valid =
        Array.isArray(chunks) &&
        chunks.every(
            (chunk) =>
                typeof chunk?.file === "string" &&
                CHUNK_FILE_PATTERN.test(chunk.file) &&
                !files.has(chunk.file) &&
                files.add(chunk.file) &&
                isSize(chunk.size),
        );
    if (!valid) {
        throw new Error("The manifest's chunks aren't valid");
    }
    manifest.lite = { sha256: lite.sha256, size: lite.size };
    manifest.chunks = chunks.map(({ file, size }: ManifestChunk) => ({ file, size }));
    return manifest;
}

// The newest game files this launcher can run. A folder needing a newer launcher is left out: a
// player can unzip an older launcher over the same user data. Bundled files win a tie, and when
// they're newer, which they are after unzipping a newer launcher, except against the website's
// build: on the same version, that's the one the website was last seen on.
export function pickGameFolder(
    bundled: GameFolder,
    installed: GameFolder[],
    launcherVersion: string,
): GameFolder {
    let best = bundled;
    for (const folder of installed) {
        const order = compareVersions(folder.version, best.version);
        const newer = order > 0 || (order === 0 && folder.fromSite && !best.fromSite);
        if (canRun(folder, launcherVersion) && newer) {
            best = folder;
        }
    }
    return best;
}

// Where a zip entry goes inside target. Throws if the name could put it anywhere else, by being
// absolute or by climbing out. Windows drops trailing dots and spaces from a name, so ".. " is
// "..", and a colon is either a drive or an alternate data stream.
export function zipEntryPath(target: string, name: string, paths = path): string {
    const segments = name.replace(/\\/g, "/").split("/");
    const safe =
        !name.includes("\0") &&
        !name.includes(":") &&
        segments[0] !== "" &&
        segments.every((segment, i) => {
            const isFolderEnd = i === segments.length - 1 && segment === "";
            return isFolderEnd || (segment !== "" && !/[. ]$/.test(segment));
        });
    const resolved = paths.resolve(target, ...segments);
    if (!safe || !resolved.startsWith(paths.resolve(target) + paths.sep)) {
        throw new Error(`Unsafe path in the zip: ${JSON.stringify(name)}`);
    }
    return resolved;
}

// A version's section of CHANGELOG.md, without its heading
export function changelogSection(changelog: string, version: string): string {
    const lines = changelog.split(/\r?\n/);
    const start = lines.findIndex(
        (line) => line === `## ${version}` || line.startsWith(`## ${version} `),
    );
    if (start === -1) {
        throw new Error(`CHANGELOG.md has no section for ${version}`);
    }
    const length = lines.slice(start + 1).findIndex((line) => line.startsWith("## "));
    const section = lines.slice(start + 1, length === -1 ? undefined : start + 1 + length);
    return section.join("\n").trim();
}
