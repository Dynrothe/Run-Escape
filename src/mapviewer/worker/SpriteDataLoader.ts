import { CacheIndex } from "../../rs/cache/CacheIndex";
import { IndexType } from "../../rs/cache/IndexType";
import { IndexedSprite } from "../../rs/sprite/IndexedSprite";
import { SpriteLoader } from "../../rs/sprite/SpriteLoader";
import { RenderDataLoader, RenderDataResult } from "./RenderDataLoader";
import { WorkerState } from "./RenderDataWorker";

// Interface sprites from the cache (hitsplats and the like) as ARGB images, the
// first frame of each sprite id unless another's asked for (a flag of the world
// list's).

export type SpriteImage = {
    id: number;
    frame: number;
    width: number;
    height: number;
    // ARGB, width x height; empty when the sprite isn't in the cache
    pixels: Int32Array;
};

// frames: the frame of each sprite id, in the same order (the first, without)
export type SpriteDataInput = { spriteIds: number[]; frames?: number[] };

// A sprite's frame from the sprites' index, for scripts
export function decodeSpriteImage(
    spriteIndex: CacheIndex,
    id: number,
    frame: number = 0,
): SpriteImage {
    return toImage(id, frame, SpriteLoader.loadIntoIndexedSprite(spriteIndex, id, frame));
}

function toImage(id: number, frame: number, sprite: IndexedSprite | undefined): SpriteImage {
    const empty = { id, frame, width: 0, height: 0, pixels: new Int32Array(0) };
    if (!sprite || sprite.width <= 0 || sprite.height <= 0) {
        return empty;
    }
    const { width, height, subWidth, subHeight, xOffset, yOffset, palette, alphas } = sprite;
    const pixels = new Int32Array(width * height);
    for (let y = 0; y < subHeight; y++) {
        for (let x = 0; x < subWidth; x++) {
            const i = x + y * subWidth;
            const index = sprite.pixels[i];
            if (index === 0) {
                continue;
            }
            const alpha = alphas ? alphas[i] : 0xff;
            pixels[x + xOffset + (y + yOffset) * width] =
                (alpha << 24) | (palette[index] & 0xffffff);
        }
    }
    return { id, frame, width, height, pixels };
}

export class SpriteDataLoader implements RenderDataLoader<SpriteDataInput, SpriteImage[]> {
    __type = "spriteDataLoader" as const;

    init(): void {}

    async load(
        state: WorkerState,
        input: SpriteDataInput,
    ): Promise<RenderDataResult<SpriteImage[]>> {
        const spriteIndex = state.cacheSystem.getIndex(IndexType.DAT2.sprites);
        // Each sprite's archive decoded once, however many of its frames are asked for
        const decoded = new Map<number, (IndexedSprite | undefined)[] | undefined>();
        const sprites = input.spriteIds.map((id, i) => {
            const frame = input.frames?.[i] ?? 0;
            try {
                if (!decoded.has(id)) {
                    decoded.set(id, SpriteLoader.loadIntoIndexedSprites(spriteIndex, id));
                }
                return toImage(id, frame, decoded.get(id)?.[frame]);
            } catch (e) {
                // Once: its other frames don't read it again
                decoded.set(id, undefined);
                console.error("Failed loading sprite", id, e);
                return { id, frame, width: 0, height: 0, pixels: new Int32Array(0) };
            }
        });
        return { data: sprites, transferables: sprites.map((sprite) => sprite.pixels.buffer) };
    }

    reset(): void {}
}
