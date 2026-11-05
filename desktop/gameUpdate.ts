import JSZip from "jszip";
import { createHash } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ReadableStream as WebReadableStream } from "node:stream/web";

import {
    CHUNK_FILE_PATTERN,
    GameFolder,
    GameManifest,
    ManifestChunk,
    chunkPath,
    compareVersions,
    isVersion,
    parseManifest,
    zipEntryPath,
} from "./gameFiles";
import { ReleaseSource } from "./releaseSource";

export const MANIFEST_NAME = "game-manifest.json";
const MARKER_NAME = "verified.json";
const CHECK_TIMEOUT_MS = 5000;
const STALL_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;

export const gameZipName = (version: string) => `game-${version}.zip`;
// The game zip without its cache's chunks, which are assets of their own
export const liteZipName = (version: string) => `game-${version}-lite.zip`;
export const chunkAssetName = (file: string) => `cache-${file}`;

// Where the lite zip and each chunk can be downloaded from, when the release has them
export type SplitUpdate = { liteUrl: string; chunkUrls: Record<string, string> };

export type UpdateCheck =
    | { kind: "none" }
    | { kind: "update"; manifest: GameManifest; zipUrl: string; split?: SplitUpdate }
    // A newer game that this launcher can't run
    | { kind: "launcher"; version: string; releasePage?: string };

type Release = {
    tag_name?: string;
    html_url?: string;
    assets?: { name: string; browser_download_url: string }[];
};

// fetch with every redirect checked before following it. Electron's net.fetch can't do this: with
// redirect "manual" it fails rather than handing back the redirect.
async function fetchAsset(
    url: string,
    source: ReleaseSource,
    signal: AbortSignal,
): Promise<Response> {
    let current = url;
    if (!source.isAssetUrl(current)) {
        throw new Error(`Won't download from ${current}`);
    }
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        const response = await fetch(current, { redirect: "manual", signal });
        const location = response.headers.get("Location");
        if (response.status < 300 || response.status >= 400 || !location) {
            if (!response.ok) {
                throw new Error(`${current} answered ${response.status}`);
            }
            return response;
        }
        current = new URL(location, current).href;
        if (!source.isRedirectUrl(current)) {
            throw new Error(`Won't follow a redirect to ${current}`);
        }
    }
    throw new Error(`Too many redirects from ${url}`);
}

// What the latest published release means for this install. Throws on anything unexpected: the
// caller starts the game regardless.
export async function checkForUpdate(
    source: ReleaseSource,
    installedVersion: string,
    launcherVersion: string,
    cancel: AbortSignal,
    timeoutMs = CHECK_TIMEOUT_MS,
): Promise<UpdateCheck> {
    const signal = AbortSignal.any([cancel, AbortSignal.timeout(timeoutMs)]);
    const response = await fetch(source.latestReleaseUrl, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Run-Escape-launcher" },
        signal,
    });
    // 404 is a repository with no published release yet
    if (response.status === 404) {
        return { kind: "none" };
    }
    if (!response.ok) {
        throw new Error(`The release check answered ${response.status}`);
    }
    const release = (await response.json()) as Release;
    const assetUrl = (name: string) =>
        release.assets?.find((asset) => asset.name === name)?.browser_download_url;

    const manifestUrl = assetUrl(MANIFEST_NAME);
    if (!manifestUrl) {
        return { kind: "none" };
    }
    const manifestResponse = await fetchAsset(manifestUrl, source, signal);
    const manifest = parseManifest(await manifestResponse.text());
    if (release.tag_name !== `v${manifest.version}`) {
        throw new Error(`Manifest ${manifest.version} is on release ${release.tag_name}`);
    }
    if (compareVersions(manifest.version, installedVersion) <= 0) {
        return { kind: "none" };
    }
    if (compareVersions(manifest.minLauncher, launcherVersion) > 0) {
        const page = release.html_url;
        return {
            kind: "launcher",
            version: manifest.version,
            releasePage: page && source.isReleasePage(page) ? page : undefined,
        };
    }
    const zipUrl = assetUrl(gameZipName(manifest.version));
    if (!zipUrl) {
        throw new Error(`Release ${release.tag_name} has no game zip`);
    }
    return { kind: "update", manifest, zipUrl, split: findSplitUpdate(manifest, assetUrl) };
}

function findSplitUpdate(
    manifest: GameManifest,
    assetUrl: (name: string) => string | undefined,
): SplitUpdate | undefined {
    const liteUrl = assetUrl(liteZipName(manifest.version));
    if (!manifest.lite || !manifest.chunks || !liteUrl) {
        return undefined;
    }
    const chunkUrls: Record<string, string> = {};
    for (const { file } of manifest.chunks) {
        const url = assetUrl(chunkAssetName(file));
        if (!url) {
            return undefined;
        }
        chunkUrls[file] = url;
    }
    return { liteUrl, chunkUrls };
}

// Streams a download to a file and gives back its sha256. Gives up if nothing arrives for a while,
// rather than leaving the player at a progress bar.
async function download(
    url: string,
    source: ReleaseSource,
    file: string,
    cancel: AbortSignal,
    onProgress: (fraction: number | undefined) => void,
    stallMs: number,
): Promise<string> {
    const stall = new AbortController();
    let timer = setTimeout(() => stall.abort(new Error("The download stalled")), stallMs);
    const noteActivity = () => {
        clearTimeout(timer);
        timer = setTimeout(() => stall.abort(new Error("The download stalled")), stallMs);
    };
    const signal = AbortSignal.any([cancel, stall.signal]);
    try {
        const response = await fetchAsset(url, source, signal);
        const total = Number(response.headers.get("Content-Length")) || undefined;
        const hash = createHash("sha256");
        let received = 0;
        await pipeline(
            Readable.fromWeb(response.body as WebReadableStream),
            async function* (chunks: AsyncIterable<Uint8Array>) {
                for await (const chunk of chunks) {
                    noteActivity();
                    hash.update(chunk);
                    received += chunk.byteLength;
                    onProgress(total ? received / total : undefined);
                    yield chunk;
                }
            },
            createWriteStream(file),
        );
        return hash.digest("hex");
    } finally {
        clearTimeout(timer);
    }
}

// Every entry's checked before anything's written, so a bad zip leaves nothing behind. Entries are
// only ever written as plain files, so a symlink in the zip can't redirect a later one.
async function extractZip(zipFile: string, target: string, signal: AbortSignal): Promise<void> {
    const zip = await JSZip.loadAsync(await readFile(zipFile));
    // JSZip tidies names as it reads them, which would hide a "../" from the check
    const entries = Object.values(zip.files).map((entry) => {
        const original = entry.unsafeOriginalName ?? entry.name;
        return { entry, file: zipEntryPath(target, original) };
    });
    for (const { entry, file } of entries) {
        signal.throwIfAborted();
        if (entry.dir) {
            await mkdir(file, { recursive: true });
        } else {
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, await entry.async("nodebuffer"));
        }
    }
}

// An antivirus scanner holding a new file makes a rename fail on Windows, for a moment
async function renameWithRetries(from: string, to: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await rename(from, to);
        } catch (e) {
            const busy = ["EPERM", "EACCES", "EBUSY"].includes((e as NodeJS.ErrnoException).code!);
            if (!busy || attempt >= 8) {
                throw e;
            }
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }
}

const updateDir = (dataDir: string) => path.join(dataDir, "game-update");
const gamesDir = (dataDir: string) => path.join(dataDir, "game");

// The game folders in the user data folder that finished installing. The marker's written into a
// folder before it's renamed into place, so one without it was never installed by this code.
export async function readInstalledGames(dataDir: string): Promise<GameFolder[]> {
    const names = await readdir(gamesDir(dataDir)).catch(() => [] as string[]);
    const folders: GameFolder[] = [];
    for (const name of names.filter(isVersion)) {
        const folder = path.join(gamesDir(dataDir), name);
        try {
            const marker = parseManifest(await readFile(path.join(folder, MARKER_NAME), "utf8"));
            await access(path.join(folder, "index.html"), constants.R_OK);
            if (marker.version === name) {
                folders.push({ version: name, path: folder, minLauncher: marker.minLauncher });
            }
        } catch {
            // Not a finished install
        }
    }
    return folders;
}

const chunkName = (data: Buffer) =>
    createHash("sha256").update(data).digest("hex").slice(0, 32) + ".bin";

// The chunk from one of the folders, if one has it as it should be
async function findChunk(file: string, folders: string[]): Promise<Buffer | undefined> {
    for (const folder of folders) {
        const data = await readFile(chunkPath(folder, file)).catch(() => undefined);
        if (data && chunkName(data) === file) {
            return data;
        }
    }
    return undefined;
}

// Downloads one file of a split update and checks it, adding to the update's progress
type Fetcher = (url: string, file: string, size: number) => Promise<string>;

// The lite zip, and the chunks: the ones the game has already are copied, the rest downloaded
async function installSplit(
    manifest: GameManifest & Required<Pick<GameManifest, "lite" | "chunks">>,
    split: SplitUpdate,
    missing: ManifestChunk[],
    have: Map<string, Buffer>,
    workDir: string,
    extracted: string,
    signal: AbortSignal,
    fetchFile: Fetcher,
): Promise<void> {
    const liteFile = path.join(workDir, liteZipName(manifest.version));
    const sha256 = await fetchFile(split.liteUrl, liteFile, manifest.lite.size);
    if (sha256 !== manifest.lite.sha256) {
        throw new Error(`The lite zip's sha256 is ${sha256}, not ${manifest.lite.sha256}`);
    }
    await extractZip(liteFile, extracted, signal);
    await mkdir(path.dirname(chunkPath(extracted, "x")), { recursive: true });
    for (const [file, data] of have) {
        await writeFile(chunkPath(extracted, file), data);
    }
    for (const { file, size } of missing) {
        const target = chunkPath(extracted, file);
        const hash = await fetchFile(split.chunkUrls[file], target, size);
        if (hash.slice(0, 32) + ".bin" !== file) {
            throw new Error(`Chunk ${file} downloaded as ${hash}`);
        }
    }
}

// Every chunk caches.json lists is in the folder: a game that's missing one stops partway through
// loading
async function checkChunks(folder: string): Promise<void> {
    const caches: unknown = JSON.parse(
        await readFile(path.join(folder, "caches", "caches.json"), "utf8"),
    );
    if (!Array.isArray(caches)) {
        throw new Error("caches.json isn't a list");
    }
    for (const cache of caches) {
        for (const chunk of cache?.chunks ?? []) {
            if (!CHUNK_FILE_PATTERN.test(chunk?.file)) {
                throw new Error(`caches.json lists a chunk called ${chunk?.file}`);
            }
            await access(chunkPath(folder, chunk.file), constants.R_OK);
        }
    }
}

// Downloads, verifies and installs a game update, and returns its folder. The game folder only
// changes at the rename, so until then a failure or a cancel leaves it as it was.
//
// With a split update, the chunks already in reuseFrom's folders (the game being played) are
// copied, and only the rest are downloaded. With none to copy, the whole zip is one download
// rather than one per chunk.
export async function installUpdate(
    manifest: GameManifest,
    zipUrl: string,
    source: ReleaseSource,
    dataDir: string,
    signal: AbortSignal,
    onProgress: (fraction: number | undefined) => void,
    stallMs = STALL_TIMEOUT_MS,
    split?: SplitUpdate,
    reuseFrom: string[] = [],
): Promise<GameFolder> {
    const workDir = updateDir(dataDir);
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
    await mkdir(gamesDir(dataDir), { recursive: true });
    try {
        const extracted = path.join(workDir, "extracted");
        const { lite, chunks } = manifest;
        const have = new Map<string, Buffer>();
        for (const { file } of split && lite && chunks ? chunks : []) {
            const data = await findChunk(file, reuseFrom);
            if (data) {
                have.set(file, data);
            }
        }
        if (split && lite && chunks && have.size > 0) {
            const missing = chunks.filter((chunk) => !have.has(chunk.file));
            const total = lite.size + missing.reduce((sum, chunk) => sum + chunk.size, 0);
            let done = 0;
            const fetchFile: Fetcher = async (url, file, size) => {
                const hash = await download(
                    url,
                    source,
                    file,
                    signal,
                    (fraction) => onProgress(total ? (done + (fraction ?? 0) * size) / total : 1),
                    stallMs,
                );
                done += size;
                return hash;
            };
            const required = { ...manifest, lite, chunks };
            await installSplit(
                required,
                split,
                missing,
                have,
                workDir,
                extracted,
                signal,
                fetchFile,
            );
        } else {
            const zipFile = path.join(workDir, gameZipName(manifest.version));
            const sha256 = await download(zipUrl, source, zipFile, signal, onProgress, stallMs);
            if (sha256 !== manifest.sha256) {
                throw new Error(`The download's sha256 is ${sha256}, not ${manifest.sha256}`);
            }
            await extractZip(zipFile, extracted, signal);
        }
        await access(path.join(extracted, "index.html"), constants.R_OK);
        await checkChunks(extracted);
        await writeFile(path.join(extracted, MARKER_NAME), JSON.stringify(manifest));

        signal.throwIfAborted();
        const folder = path.join(gamesDir(dataDir), manifest.version);
        // Only a folder that never finished can be here: this version's newer than what's installed
        await rm(folder, { recursive: true, force: true });
        await renameWithRetries(extracted, folder);
        return { version: manifest.version, path: folder, minLauncher: manifest.minLauncher };
    } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

// Clears what's been replaced, and whatever an interrupted update left. Best effort: if a file's
// held open it's tried again next launch.
export async function removeOldGames(dataDir: string, inUse: GameFolder): Promise<void> {
    await rm(updateDir(dataDir), { recursive: true, force: true }).catch(() => {});
    const names = await readdir(gamesDir(dataDir)).catch(() => [] as string[]);
    for (const name of names) {
        if (!isVersion(name) || compareVersions(name, inUse.version) < 0) {
            const folder = path.join(gamesDir(dataDir), name);
            await rm(folder, { recursive: true, force: true }).catch(() => {});
        }
    }
}
