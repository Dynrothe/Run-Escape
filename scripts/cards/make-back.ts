// Makes the card back, and the game's pictures of it, from the footprints back
// (src/media/run-escape-card-back-footprints.png):
//
//   bun run tsx scripts/cards/make-back.ts
//
// It writes src/media/run-escape-card-back-footprints-clean.png (the generator's back) and
// src/game/ui/cards/card-back-*.webp. Two things change on the way:
// - The card is fitted to the fronts' plate (run-escape-card-front-frame.png): stretched the few
//   pixels to its size and cut to its shape, so a card face down has the outline of one face up,
//   and the game's pictures are the fronts' sizes.
// - The cloth is filled in under the old lettering. The outlined wordmark is then drawn onto
//   each finished plate, so the game's paper-grain filter never touches the letters.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const media = path.join(root, "src/media");
const ui = path.join(root, "src/game/ui/cards");
const DEBUG = process.env.DEBUG ? path.resolve(process.env.DEBUG) : undefined;

const W = 1073;
const H = 1466;
// The banner's lettering on the footprints back, with room round it
const WORDS = { left: 330, top: 795, width: 350, height: 100 };
// The game's pictures: the fronts' sizes (card-front-*.webp)
const SIZES = [
    { name: "card-back-large.webp", width: 720, height: 984 },
    { name: "card-back-small.webp", width: 400, height: 547 },
];

type Box = { left: number; top: number; width: number; height: number };

// The card inside a picture's clear margin
function cardBox(data: Buffer): Box {
    let x0 = W;
    let x1 = 0;
    let y0 = H;
    let y1 = 0;
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * 4 + 3] < 128) continue;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function dilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
    const rows = new Uint8Array(mask.length);
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            for (let d = -r; d <= r; d++) {
                const xx = x + d;
                if (xx >= 0 && xx < width && mask[y * width + xx]) rows[y * width + x] = 1;
            }
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            for (let d = -r; d <= r; d++) {
                const yy = y + d;
                if (yy >= 0 && yy < height && rows[yy * width + x]) out[y * width + x] = 1;
            }
    return out;
}

// Recover the cloth beneath the painted lettering before placing the new wordmark.
async function bareRibbon(source: Buffer): Promise<Buffer> {
    const { width, height } = WORDS;
    const patch = Buffer.alloc(width * height * 4);
    const letters = new Uint8Array(width * height);
    let inked = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const s = ((WORDS.top + y) * W + WORDS.left + x) * 4;
            const p = y * width + x;
            source.copy(patch, p * 4, s, s + 4);
            const [r, g, b] = [source[s], source[s + 1], source[s + 2]];
            // The letters are cream, on cloth that's red-brown
            if (r > 112 && r - b > 44 && g / r > 0.64) {
                letters[p] = 1;
                inked++;
            }
        }
    if (inked < 2000) throw new Error("The banner's lettering wasn't found");

    // The cloth painted in under the letters and their dark edges, from the cloth round them
    const hole = dilate(letters, width, height, 4);
    const todo = Uint8Array.from(hole);
    for (let left = 1; left > 0; ) {
        left = 0;
        const filled: number[] = [];
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const p = y * width + x;
                if (!todo[p]) continue;
                const sum = [0, 0, 0];
                let n = 0;
                for (let dy = -2; dy <= 2; dy++)
                    for (let dx = -2; dx <= 2; dx++) {
                        const xx = x + dx;
                        const yy = y + dy;
                        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
                        const q = yy * width + xx;
                        if (todo[q]) continue;
                        for (let c = 0; c < 3; c++) sum[c] += patch[q * 4 + c];
                        n++;
                    }
                if (n < 3) {
                    left++;
                    continue;
                }
                for (let c = 0; c < 3; c++) patch[p * 4 + c] = Math.round(sum[c] / n);
                filled.push(p);
            }
        for (const p of filled) todo[p] = 0;
        if (!filled.length) break;
    }
    // ...and smoothed where it was painted in, so no step shows at the hole's edge
    const cloth = await sharp(patch, { raw: { width, height, channels: 4 } })
        .blur(2.2)
        .raw()
        .toBuffer();
    for (let p = 0; p < width * height; p++)
        if (hole[p]) for (let c = 0; c < 3; c++) patch[p * 4 + c] = cloth[p * 4 + c];

    return sharp(patch, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer();
}

async function main(): Promise<void> {
    const read = (name: string) =>
        sharp(path.join(media, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const [back, front] = await Promise.all([
        read("run-escape-card-back-footprints.png"),
        read("run-escape-card-front-frame.png"),
    ]);
    for (const { info } of [back, front])
        if (info.width !== W || info.height !== H) throw new Error(`A plate isn't ${W} x ${H}`);

    const cloth = await bareRibbon(back.data);
    const cleaned = await sharp(back.data, { raw: { width: W, height: H, channels: 4 } })
        .composite([{ input: cloth, left: WORDS.left, top: WORDS.top }])
        .png()
        .toBuffer();

    // Onto the fronts' plate: its card stretched to theirs, then cut to their shape. Its edge
    // colour is spread under it first, so no clear pixel is left inside that shape.
    const from = cardBox(back.data);
    const to = cardBox(front.data);
    const card = await sharp(cleaned)
        .extract(from)
        .resize(to.width, to.height, { fit: "fill", kernel: "lanczos3" })
        .png()
        .toBuffer();
    const under = await sharp(card).blur(6).flatten({ background: "#3b2e27" }).png().toBuffer();
    const fitted = await sharp({
        create: { width: W, height: H, channels: 4, background: "#3b2e27" },
    })
        .composite([
            { input: under, left: to.left, top: to.top },
            { input: card, left: to.left, top: to.top },
        ])
        .raw()
        .toBuffer();
    const raw = { width: W, height: H, channels: 4 as const };
    const wordmarkPath = fileURLToPath(new URL("./banner-words.svg", import.meta.url));
    async function wordmark(width: number, height: number) {
        const scaleX = width / W;
        const scaleY = height / H;
        const fitX = to.width / from.width;
        const fitY = to.height / from.height;
        const left = Math.round((to.left + (WORDS.left - from.left) * fitX) * scaleX);
        const top = Math.round((to.top + (WORDS.top - from.top) * fitY) * scaleY);
        const input = await sharp(wordmarkPath, { density: 288 })
            .resize(
                Math.round(WORDS.width * fitX * scaleX),
                Math.round(WORDS.height * fitY * scaleY),
                {
                    fit: "fill",
                },
            )
            .png()
            .toBuffer();
        return { input, left, top };
    }
    const fullWords = await wordmark(W, H);
    if (DEBUG) await sharp(fullWords.input).toFile(path.join(DEBUG, "words.png"));
    const printed = await sharp(fitted, { raw }).composite([fullWords]).raw().toBuffer();
    for (let a = 3; a < fitted.length; a += 4) {
        printed[a] = front.data[a];
        fitted[a] = front.data[a];
    }
    const file = path.join(media, "run-escape-card-back-footprints-clean.png");
    await sharp(printed, { raw }).png({ compressionLevel: 9 }).toFile(file);
    console.log(path.relative(root, file));

    // The game's: the paper's grain smoothed first, as shrunk it only shows as noise
    const smooth = await sharp(fitted, { raw }).median(3).png().toBuffer();
    for (const { name, width, height } of SIZES) {
        await sharp(smooth)
            .resize(width, height, { fit: "fill", kernel: "lanczos3" })
            .sharpen({ sigma: 0.6 })
            .composite([await wordmark(width, height)])
            .webp({ quality: 90, alphaQuality: 100, effort: 6 })
            .toFile(path.join(ui, name));
        console.log(`${name}: ${width} x ${height}`);
    }
}

await main();
