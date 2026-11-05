// Interface sprite tools. Sprites have no names in the cache, so finding one
// means drawing a range of ids and looking at them.
//
//   npx tsx scripts/cache/sprites.ts png out 1420 940-950   write sprites to out/<id>.png, 4x size
//   npx tsx scripts/cache/sprites.ts check                  every passive's iconSpriteId is in the cache
import fs from "fs";
import path from "path";

import {
    PRAYER_HEADICON_FRAME_IDS,
    PRAYER_HEADICON_SPRITE,
} from "../../src/game/client/GameAssets";
import { PASSIVES } from "../../src/game/content/passives";
import { SpriteImage, decodeSpriteImage } from "../../src/mapviewer/worker/SpriteDataLoader";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { IndexType } from "../../src/rs/cache/IndexType";
import { encodePng } from "../scaperune/png";
import { loadGameCache } from "./scene-util";

const SCALE = 4;
// What shows through: about the colour of the game's panels
const BACKDROP = [0x3e, 0x35, 0x29];

const [command, ...args] = process.argv.slice(2);

const loaded = loadGameCache();
const cacheSystem = CacheSystem.fromFiles(loaded.type, loaded.files);
const spriteIndex = cacheSystem.getIndex(IndexType.DAT2.sprites);

// Empty when the cache hasn't got it
function loadSprite(id: number): SpriteImage {
    try {
        return decodeSpriteImage(spriteIndex, id);
    } catch {
        return { id, width: 0, height: 0, pixels: new Int32Array(0) };
    }
}

function describe(sprite: SpriteImage): string {
    const drawn = sprite.pixels.filter((argb) => argb >>> 24 !== 0).length;
    return sprite.width > 0
        ? `${sprite.id}: ${sprite.width}x${sprite.height}, ${drawn} pixels drawn`
        : `${sprite.id}: missing`;
}

function writePng(file: string, sprite: SpriteImage): void {
    const width = sprite.width * SCALE;
    const height = sprite.height * SCALE;
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const argb =
                sprite.pixels[Math.floor(x / SCALE) + Math.floor(y / SCALE) * sprite.width];
            const alpha = (argb >>> 24) / 255;
            const colour = [(argb >> 16) & 0xff, (argb >> 8) & 0xff, argb & 0xff];
            for (let c = 0; c < 3; c++) {
                rgb[(x + y * width) * 3 + c] = Math.round(
                    colour[c] * alpha + BACKDROP[c] * (1 - alpha),
                );
            }
        }
    }
    fs.writeFileSync(file, encodePng(width, height, rgb));
}

// "1420" or "940-950"
function parseIds(list: string[]): number[] {
    return list.flatMap((arg) => {
        const [from, to = from] = arg.split("-").map((n) => parseInt(n));
        return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    });
}

switch (command) {
    case "png": {
        const [outDir, ...ids] = args;
        fs.mkdirSync(outDir, { recursive: true });
        for (const id of parseIds(ids)) {
            const sprite = loadSprite(id);
            if (sprite.width > 0) {
                writePng(path.join(outDir, `${id}.png`), sprite);
            }
            console.log(describe(sprite));
        }
        break;
    }
    case "check": {
        let missing = 0;
        for (const passive of PASSIVES) {
            if (passive.iconSpriteId === undefined) {
                continue;
            }
            const sprite = loadSprite(passive.iconSpriteId);
            const drawn = sprite.pixels.some((argb) => argb >>> 24 !== 0);
            console.log(`${passive.id}: ${describe(sprite)}`);
            if (!drawn) {
                missing++;
            }
        }
        // The overhead prayers' frames, drawn over bosses that pray
        for (const frame of PRAYER_HEADICON_FRAME_IDS) {
            const sprite = decodeSpriteImage(spriteIndex, PRAYER_HEADICON_SPRITE, frame);
            const drawn = sprite.pixels.some((argb) => argb >>> 24 !== 0);
            console.log(`overhead prayer frame ${frame}: ${describe(sprite)}`);
            if (!drawn) {
                missing++;
            }
        }
        if (missing > 0) {
            console.log(`${missing} sprites are missing or blank`);
            process.exitCode = 1;
        } else {
            console.log("Every passive's sprite and overhead prayer is in the cache");
        }
        break;
    }
    default:
        console.log("usage: sprites.ts png <dir> <id or from-to...> | check");
}
