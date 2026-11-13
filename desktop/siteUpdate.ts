// Keeps the app on the website's build (see siteFiles.ts). The website's files are downloaded into
// the user data folder and served from GAME_ORIGIN like any other game folder, so saves, settings
// and the game's copy of the cache stay where they are.
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { GameFolder, ManifestChunk, chunkPath, zipEntryPath } from "./gameFiles";
import {
    DownloadSource,
    MARKER_NAME,
    STALL_TIMEOUT_MS,
    findChunk,
    installFolder,
    progressFetcher,
    runFewAtOnce,
} from "./gameUpdate";
import {
    SITE_FILES_NAME,
    SiteFiles,
    isBuildId,
    parseSiteCaches,
    parseSiteFiles,
    siteFileUrl,
} from "./siteFiles";

const CHECK_TIMEOUT_MS = 5000;
// Files downloaded at once: most are small, and they're all from the one server
const DOWNLOADS = 6;

export type SiteBuild = { files: SiteFiles; caches: string; chunks: ManifestChunk[] };

const sitesDir = (dataDir: string) => path.join(dataDir, "site");
const updateDir = (dataDir: string) => path.join(dataDir, "site-update");
// The website's build the last time the app followed it (noteSiteBuild)
const lastFollowedFile = (dataDir: string) => path.join(dataDir, "site-build.json");

// Downloads stay on the website: no redirects anywhere, as download() follows none that
// isRedirectUrl refuses
const siteSource = (base: string): DownloadSource => ({
    isAssetUrl: (url) => url.startsWith(base),
    isRedirectUrl: () => false,
});

// What's done before the game opens: the website's build when followSite can follow it, or else
// the latest release. The release check starts alongside the website's, so a website that doesn't
// answer only costs its own time limit. Gives back the website's build, or undefined to play the
// newest game there is. Once cancel's aborted (the player closed the splash), nothing else is
// started: a skipped download of the website's build doesn't become a download of the release.
export async function updateForLaunch<Check>(
    cancel: AbortSignal,
    checkRelease: () => Promise<Check>,
    takeRelease: (check: Check) => Promise<void>,
    followSite?: () => Promise<GameFolder | undefined>,
): Promise<GameFolder | undefined> {
    const release = checkRelease();
    // Caught here too, as it isn't awaited when the website's followed
    release.catch(() => {});
    const siteGame = await followSite?.();
    if (siteGame) {
        return siteGame;
    }
    if (!cancel.aborted) {
        await takeRelease(await release);
    }
    return undefined;
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
    const response = await fetch(url, { redirect: "error", cache: "no-store", signal });
    if (!response.ok) {
        throw new Error(`${url} answered ${response.status}`);
    }
    return response.text();
}

// The build the website's on, with its files and its cache's chunks. Throws on anything
// unexpected, a website without game-files.json included: the caller goes on without it.
export async function checkSite(
    base: string,
    cancel: AbortSignal,
    timeoutMs = CHECK_TIMEOUT_MS,
): Promise<SiteBuild> {
    const signal = AbortSignal.any([cancel, AbortSignal.timeout(timeoutMs)]);
    const files = parseSiteFiles(await fetchText(siteFileUrl(base, SITE_FILES_NAME), signal));
    const caches = await fetchText(siteFileUrl(base, "caches/caches.json"), signal);
    return { files, caches, chunks: parseSiteCaches(caches, files.build) };
}

// The build a file like build.json names, if it's there and names one
async function readBuildFile(file: string): Promise<string | undefined> {
    try {
        const { build } = JSON.parse(await readFile(file, "utf8"));
        return isBuildId(build) ? build : undefined;
    } catch {
        return undefined;
    }
}

// The build a game folder's files are, from the build.json every build has
export const readBuild = (folder: string) => readBuildFile(path.join(folder, "build.json"));

// The first of the folders that's this build already, so it needn't be downloaded
export async function findBuild(
    folders: GameFolder[],
    build: string,
): Promise<GameFolder | undefined> {
    for (const folder of folders) {
        if ((await readBuild(folder.path)) === build) {
            return folder;
        }
    }
    return undefined;
}

// Notes the build the website's on, once the app's playing it, so that offline the app plays it
// rather than another build of the same version left behind (one whose removal failed, say)
export async function noteSiteBuild(dataDir: string, build: string): Promise<void> {
    await writeFile(lastFollowedFile(dataDir), JSON.stringify({ build }));
}

// The website's builds that finished installing. Their marker's their game-files.json. When the
// build last followed (noteSiteBuild) is among them, it's the only one: the others were left from
// before it, and pickGameFolder would take one of the same version by the order of their names.
export async function readSiteGames(dataDir: string): Promise<GameFolder[]> {
    const names = await readdir(sitesDir(dataDir)).catch(() => [] as string[]);
    const folders: GameFolder[] = [];
    for (const name of names.filter(isBuildId)) {
        const folder = path.join(sitesDir(dataDir), name);
        try {
            const marker = parseSiteFiles(await readFile(path.join(folder, MARKER_NAME), "utf8"));
            await access(path.join(folder, "index.html"), constants.R_OK);
            if (marker.build === name) {
                folders.push({
                    version: marker.version,
                    path: folder,
                    minLauncher: marker.minLauncher,
                    fromSite: true,
                });
            }
        } catch {
            // Not a finished install
        }
    }
    const lastFollowed = await readBuildFile(lastFollowedFile(dataDir));
    const last = folders.filter((folder) => path.basename(folder.path) === lastFollowed);
    return last.length > 0 ? last : folders;
}

const sha256Of = async (file: string) => {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) {
        hash.update(chunk as Buffer);
    }
    return hash.digest("hex");
};

// The files in the folders that have one of these sizes, by their sha256. Only those are hashed:
// a file of another size can't be one that's wanted. The cache's chunks are found by name.
async function indexBySha256(folders: string[], sizes: Set<number>): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const walk = async (dir: string, isRoot = false): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!(isRoot && entry.name === "caches")) {
                    await walk(file);
                }
            } else if (entry.isFile() && sizes.has((await stat(file)).size)) {
                found.set(await sha256Of(file), file);
            }
        }
    };
    for (const folder of folders) {
        await walk(folder, true);
    }
    return found;
}

// Downloads the website's build and installs it, and returns its folder. Files the folders in
// reuseFrom already have (the game being played) are copied rather than downloaded. Every file's
// checked against its sha256, and nothing's played until it's all there: until the rename, a
// failure or a cancel leaves things as they were.
export async function installSiteBuild(
    site: SiteBuild,
    base: string,
    dataDir: string,
    signal: AbortSignal,
    onProgress: (fraction: number) => void,
    reuseFrom: string[] = [],
    stallMs = STALL_TIMEOUT_MS,
): Promise<GameFolder> {
    const { files } = site;
    const source = siteSource(base);
    const workDir = updateDir(dataDir);
    await rm(workDir, { recursive: true, force: true });
    await mkdir(sitesDir(dataDir), { recursive: true });
    try {
        const extracted = path.join(workDir, "extracted");
        await mkdir(path.dirname(chunkPath(extracted, "x")), { recursive: true });

        // What to download: the files and chunks the game doesn't have
        type Job = { url: string; target: string; size: number; check: (sha: string) => boolean };
        const jobs: Job[] = [];
        const have = await indexBySha256(reuseFrom, new Set(files.files.map((file) => file.size)));
        for (const file of files.files) {
            const target = zipEntryPath(extracted, file.path);
            await mkdir(path.dirname(target), { recursive: true });
            const local = have.get(file.sha256);
            if (local) {
                await copyFile(local, target);
            } else {
                const url = siteFileUrl(base, file.path);
                jobs.push({ url, target, size: file.size, check: (sha) => sha === file.sha256 });
            }
        }
        for (const { file, size } of site.chunks) {
            const target = chunkPath(extracted, file);
            const local = await findChunk(file, reuseFrom);
            if (local) {
                await copyFile(local, target);
            } else {
                const url = siteFileUrl(base, `caches/chunks/${file}`);
                const check = (sha: string) => sha.slice(0, 32) + ".bin" === file;
                jobs.push({ url, target, size, check });
            }
        }
        await writeFile(path.join(extracted, "caches", "caches.json"), site.caches);

        const total = jobs.reduce((sum, job) => sum + job.size, 0);
        const fetchFile = progressFetcher(source, signal, stallMs, total, onProgress);
        await runFewAtOnce(jobs, DOWNLOADS, async (job) => {
            const sha = await fetchFile(job.url, job.target, job.size);
            if (!job.check(sha)) {
                throw new Error(`${job.url} downloaded as ${sha}`);
            }
        });

        // A folder already there never finished, or is a build left from before the last one
        // followed (readSiteGames), as findBuild would have found any other
        const folder = path.join(sitesDir(dataDir), files.build);
        await installFolder(extracted, folder, files, signal);
        return {
            version: files.version,
            path: folder,
            minLauncher: files.minLauncher,
            fromSite: true,
        };
    } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

// Clears the website's builds but the one being played, and whatever an interrupted download
// left. Best effort: if a file's held open it's tried again next launch.
export async function removeOldSiteGames(dataDir: string, inUse: GameFolder): Promise<void> {
    await rm(updateDir(dataDir), { recursive: true, force: true }).catch(() => {});
    const names = await readdir(sitesDir(dataDir)).catch(() => [] as string[]);
    for (const name of names) {
        const folder = path.join(sitesDir(dataDir), name);
        if (path.resolve(folder) !== path.resolve(inUse.path)) {
            await rm(folder, { recursive: true, force: true }).catch(() => {});
        }
    }
}
