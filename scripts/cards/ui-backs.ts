// Makes the game's card backs (src/game/ui/cards/card-back-*.webp) from the generator's full-size
// back, src/media/run-escape-card-back-vampire.png:
//
//   bun run tsx scripts/cards/ui-backs.ts
//
// The UI's backs are taller for their width than the printed card, so two plain bands of its
// background (above the compass and below the play button) are stretched to make up the height,
// and the frame, medallion, banner and corners keep their shape. The print's paper grain is
// smoothed first: shrunk to a few hundred pixels, it only shows as noise.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(root, "src/media/run-escape-card-back-vampire.png");
const out = path.join(root, "src/game/ui/cards");

// The card inside the PNG's transparent margin
const CARD = { left: 27, top: 19, width: 1018, height: 1410 };
// Rows of plain background (in the PNG's own pixels) that can stretch without showing it
const BANDS: [number, number][] = [
    [225, 350],
    [1075, 1300],
];
const SIZES = [
    { name: "card-back-large.webp", width: 399, height: 600 },
    { name: "card-back-small.webp", width: 226, height: 340 },
];

async function stretchToAspect(png: Buffer, aspect: number): Promise<Buffer> {
    const height = Math.round(CARD.width / aspect);
    const extra = height - CARD.height;
    const bandTotal = BANDS.reduce((sum, [a, b]) => sum + b - a, 0);
    // Strips top to bottom: the fixed rows between bands as they are, each band stretched by its share
    const strips: { top: number; height: number; to: number }[] = [];
    let y = CARD.top;
    let given = 0;
    BANDS.forEach(([a, b], i) => {
        strips.push({ top: y, height: a - y, to: a - y });
        const share =
            i === BANDS.length - 1 ? extra - given : Math.round((extra * (b - a)) / bandTotal);
        given += share;
        strips.push({ top: a, height: b - a, to: b - a + share });
        y = b;
    });
    strips.push({ top: y, height: CARD.top + CARD.height - y, to: CARD.top + CARD.height - y });

    const parts = await Promise.all(
        strips.map(({ top, height: h, to }) =>
            sharp(png)
                .extract({ left: CARD.left, top, width: CARD.width, height: h })
                .resize(CARD.width, to, { fit: "fill", kernel: "lanczos3" })
                .png()
                .toBuffer(),
        ),
    );
    let at = 0;
    return sharp({
        create: { width: CARD.width, height, channels: 4, background: "#00000000" },
    })
        .composite(
            parts.map((input, i) => {
                const layer = { input, left: 0, top: at };
                at += strips[i].to;
                return layer;
            }),
        )
        .png()
        .toBuffer();
}

async function main(): Promise<void> {
    // A light median takes the grain out of the paper and leaves the edges and lettering sharp
    const smooth = await sharp(source).median(5).png().toBuffer();
    for (const { name, width, height } of SIZES) {
        const card = await stretchToAspect(smooth, width / height);
        await sharp(card)
            .resize(width, height, { fit: "fill", kernel: "lanczos3" })
            // Shrinking softens the banner's lettering; a little sharpening brings it back
            .sharpen({ sigma: width < 300 ? 0.6 : 0.8 })
            .webp({ quality: 90, alphaQuality: 100, effort: 6 })
            .toFile(path.join(out, name));
        console.log(`${name}: ${width} × ${height}`);
    }
}

await main();
