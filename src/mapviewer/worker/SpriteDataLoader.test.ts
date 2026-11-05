import { SpriteDataLoader } from "./SpriteDataLoader";

// A one-sprite cache file the way the client stores them: pixel data, then the
// palette, then the sizes and offsets, then the sprite count
function spriteFile(flags: number, pixels: number[], alphas: number[] = []): Int8Array {
    const bytes: number[] = [];
    const short = (v: number) => bytes.push((v >> 8) & 0xff, v & 0xff);
    bytes.push(flags, ...pixels, ...alphas);
    // Palette entries 1 and 2: red and green
    bytes.push(0xff, 0, 0, 0, 0xff, 0);
    // Full size 3x2, palette of 3 (stored less one)
    short(3);
    short(2);
    bytes.push(2);
    // x offset 1, y offset 0, a 2x2 sprite
    short(1);
    short(0);
    short(2);
    short(2);
    // One sprite
    short(1);
    return Int8Array.from(bytes, (b) => (b > 127 ? b - 256 : b));
}

// Two 1x1 frames on a 1x1 canvas: red, then green
function twoFrames(): Int8Array {
    const bytes = [0, 1, 0, 2, 0xff, 0, 0, 0, 0xff, 0];
    const short = (v: number) => bytes.push((v >> 8) & 0xff, v & 0xff);
    short(1);
    short(1);
    bytes.push(2);
    // x and y offsets, widths and heights, two of each
    [0, 0, 0, 0, 1, 1, 1, 1].forEach(short);
    short(2);
    return Int8Array.from(bytes, (b) => (b > 127 ? b - 256 : b));
}

// Through the worker's loader: these frames of sprite 1359, and how often its file was read
async function loadFrames(data: Int8Array, frames: number[]) {
    let reads = 0;
    const getFile = () => {
        reads++;
        return { data };
    };
    const state = { cacheSystem: { getIndex: () => ({ getFile }) } } as any;
    const result = await new SpriteDataLoader().load(state, {
        spriteIds: frames.map(() => 1359),
        frames,
    });
    return { images: result.data, reads };
}

async function load(data: Int8Array, frame = 0) {
    return (await loadFrames(data, [frame])).images[0];
}

describe("sprites", () => {
    test("row by row, palette index 0 see-through", async () => {
        const sprite = await load(spriteFile(0, [1, 0, 2, 1]));
        expect([sprite.width, sprite.height]).toEqual([3, 2]);
        expect(Array.from(sprite.pixels, (p) => p >>> 0)).toEqual([
            0, 0xffff0000, 0, 0, 0xff00ff00, 0xffff0000,
        ]);
    });

    test("any frame of a sprite, and nothing for one it hasn't got", async () => {
        expect((await load(twoFrames())).pixels[0] >>> 0).toBe(0xffff0000);
        expect((await load(twoFrames(), 1)).pixels[0] >>> 0).toBe(0xff00ff00);
        expect((await load(twoFrames(), 2)).width).toBe(0);
    });

    test("several frames of one sprite from one read of its file, each with its frame", async () => {
        const { images, reads } = await loadFrames(twoFrames(), [1, 0]);
        expect(reads).toBe(1);
        expect(images.map((image) => [image.frame, image.pixels[0] >>> 0])).toEqual([
            [1, 0xff00ff00],
            [0, 0xffff0000],
        ]);
    });

    test("column by column, with an alpha channel", async () => {
        // Columns: (1, 2) then (0, 1); alphas the same way
        const sprite = await load(spriteFile(3, [1, 2, 0, 1], [255, 128, 0, 64]));
        expect(Array.from(sprite.pixels, (p) => p >>> 0)).toEqual([
            0, 0xffff0000, 0, 0, 0x8000ff00, 0x40ff0000,
        ]);
    });
});
