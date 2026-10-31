// Everything a release carries besides the launcher's zip, written to release/:
// game-<version>.zip, game-manifest.json and notes.md. Stops if dist/ isn't ready to ship.
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { GameManifest, changelogSection } from "./gameFiles";
import { MANIFEST_NAME, gameZipName } from "./gameUpdate";
import { LAUNCHER_VERSION } from "./version";

const DIST = "dist";
const OUT = "release";

// Source maps are for debugging a hosted build, and they're as big as the game's code
const isShipped = (file: string) => !file.endsWith(".map") && path.basename(file) !== ".htaccess";

function listFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(file) : [file];
    });
}

// The game can't start without a cache, and caches/ is 227 MB where the slim one's 26
function checkDist(): void {
    let caches: { slimOf?: string }[];
    try {
        caches = JSON.parse(readFileSync(path.join(DIST, "caches", "caches.json"), "utf8"));
    } catch {
        throw new Error("No dist/caches: run npm run build, then npm run slim-cache");
    }
    if (caches.length === 0 || caches.some((cache) => !cache.slimOf)) {
        throw new Error("dist/caches isn't only the slim cache: run npm run slim-cache");
    }
}

async function main(): Promise<void> {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    checkDist();
    mkdirSync(OUT, { recursive: true });

    const zip = new JSZip();
    for (const file of listFiles(DIST).filter(isShipped)) {
        // Zip entries always use forward slashes, and this runs on Windows
        const name = path.relative(DIST, file).split(path.sep).join("/");
        zip.file(name, readFileSync(file));
    }
    const zipBytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    writeFileSync(path.join(OUT, gameZipName(version)), zipBytes);

    const manifest: GameManifest = {
        version,
        sha256: createHash("sha256").update(zipBytes).digest("hex"),
        minLauncher: LAUNCHER_VERSION,
    };
    writeFileSync(path.join(OUT, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");

    const notes = changelogSection(readFileSync("CHANGELOG.md", "utf8"), version);
    writeFileSync(path.join(OUT, "notes.md"), notes + "\n");

    console.log(`${gameZipName(version)}: ${(zipBytes.byteLength / 1e6).toFixed(1)} MB`);
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
