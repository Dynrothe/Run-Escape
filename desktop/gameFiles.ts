import path from "node:path";

export type GameManifest = { version: string; sha256: string; minLauncher: string };

// A set of game files: the ones bundled with the launcher, or an update in the user data folder.
// The bundled ones have no minLauncher, as they came with this launcher.
export type GameFolder = { version: string; path: string; minLauncher?: string };

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
    const { version, sha256, minLauncher } = JSON.parse(text) ?? {};
    if (!isVersion(version) || !isVersion(minLauncher)) {
        throw new Error("The manifest's versions aren't valid");
    }
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
        throw new Error("The manifest's sha256 isn't valid");
    }
    return { version, sha256, minLauncher };
}

// The newest game files this launcher can run. A folder needing a newer launcher is left out: a
// player can unzip an older launcher over the same user data. Bundled files win a tie, and when
// they're newer, which they are after unzipping a newer launcher.
export function pickGameFolder(
    bundled: GameFolder,
    installed: GameFolder[],
    launcherVersion: string,
): GameFolder {
    let best = bundled;
    for (const folder of installed) {
        const runnable =
            !folder.minLauncher || compareVersions(folder.minLauncher, launcherVersion) <= 0;
        if (runnable && compareVersions(folder.version, best.version) > 0) {
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
