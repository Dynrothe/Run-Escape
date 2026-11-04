// Draws a range of the cache's sprites side by side, each over its id, to find one by eye: the
// cache's sprites have no names. Each cell is the first frame, shrunk to fit if it's big.
//
//   npx tsx scripts/cache/sprite-sheet.ts out.png 5000 5199
import fs from "fs";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { IndexType } from "../../src/rs/cache/IndexType";
import { SpriteLoader } from "../../src/rs/sprite/SpriteLoader";
import { encodePng } from "../scaperune/png";
import { loadCache, loadCacheInfos } from "./load-util";

const [out, fromArg, toArg] = process.argv.slice(2);
if (!out || !fromArg || !toArg) {
    throw new Error("usage: sprite-sheet.ts out.png firstId lastId");
}
const from = Number(fromArg);
const to = Number(toArg);

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const sprites = CacheSystem.fromFiles(loaded.type, loaded.files).getIndex(IndexType.DAT2.sprites);

const CELL = 48;
const LABEL = 9;
const COLUMNS = 20;
const count = to - from + 1;
const rows = Math.ceil(count / COLUMNS);
const width = COLUMNS * CELL;
const height = rows * (CELL + LABEL);
const rgb = new Uint8Array(width * height * 3).fill(40);

// A 3 by 5 digit font, for the ids
const DIGITS = [
    "111101101101111",
    "010110010010111",
    "111001111100111",
    "111001111001111",
    "101101111001001",
    "111100111001111",
    "111100111101111",
    "111001001001001",
    "111101111101111",
    "111101111001111",
];

function put(x: number, y: number, r: number, g: number, b: number): void {
    if (x < 0 || y < 0 || x >= width || y >= height) {
        return;
    }
    const i = (y * width + x) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
}

function label(text: string, x: number, y: number): void {
    [...text].forEach((ch, n) => {
        const glyph = DIGITS[Number(ch)];
        for (let i = 0; i < 15; i++) {
            if (glyph[i] === "1") {
                put(x + n * 4 + (i % 3), y + Math.floor(i / 3), 255, 220, 0);
            }
        }
    });
}

for (let id = from; id <= to; id++) {
    const n = id - from;
    const cx = (n % COLUMNS) * CELL;
    const cy = Math.floor(n / COLUMNS) * (CELL + LABEL);
    label(String(id), cx + 2, cy + 2);
    const sprite = SpriteLoader.loadIntoIndexedSprite(sprites, id);
    if (!sprite) {
        continue;
    }
    const w = sprite.subWidth;
    const h = sprite.subHeight;
    const scale = Math.max(1, Math.ceil(Math.max(w, h) / (CELL - 2)));
    for (let y = 0; y < h; y += scale) {
        for (let x = 0; x < w; x += scale) {
            const p = sprite.pixels[y * w + x];
            if (p === 0 && !sprite.alphas) {
                continue;
            }
            if (sprite.alphas && sprite.alphas[y * w + x] < 128) {
                continue;
            }
            const c = sprite.palette[p];
            put(
                cx + 1 + x / scale,
                cy + LABEL + y / scale,
                (c >> 16) & 255,
                (c >> 8) & 255,
                c & 255,
            );
        }
    }
}

fs.writeFileSync(out, encodePng(width, height, rgb));
console.log(`Wrote ${out}: sprites ${from} to ${to}`);
