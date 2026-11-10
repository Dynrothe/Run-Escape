// Writes the English language files that are generated from the game's content: one
// extractor per namespace in scripts/i18n/extractors/<ns>.ts, each exporting
//
//   export default function extract(): Record<string, string>
//
// and the result goes to src/game/i18n/locales/en/<ns>.json (keys in the order given, 2 spaces
// of indent). A namespace with no extractor is hand-written (ui.json) or not made yet, and
// its file is left as it is.
//
//   bun run tsx scripts/i18n/extract.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTORS_DIR = path.join(here, "extractors");
const EN_DIR = path.resolve(here, "../../src/game/i18n/locales/en");

function findExtractors(): string[] {
    if (!fs.existsSync(EXTRACTORS_DIR)) {
        return [];
    }
    return fs
        .readdirSync(EXTRACTORS_DIR)
        .filter((file) => /\.ts$/.test(file) && !/\.test\.ts$/.test(file))
        .sort();
}

async function main() {
    const files = findExtractors();
    if (files.length === 0) {
        console.log("No extractors in scripts/i18n/extractors/, nothing to write");
        return;
    }
    fs.mkdirSync(EN_DIR, { recursive: true });
    for (const file of files) {
        const namespace = file.replace(/\.ts$/, "");
        const module = await import(pathToFileURL(path.join(EXTRACTORS_DIR, file)).href);
        if (typeof module.default !== "function") {
            throw new Error(`${file} has no default export function`);
        }
        const messages: Record<string, string> = module.default();
        const target = path.join(EN_DIR, `${namespace}.json`);
        fs.writeFileSync(target, JSON.stringify(messages, null, 2) + "\n");
        console.log(`${namespace}.json: ${Object.keys(messages).length} keys`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
