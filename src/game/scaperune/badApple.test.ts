import { describe, expect, it } from "vitest";

import { makeGrid } from "../core/world/testGrid";
import {
    BAD_APPLE_FPS,
    BAD_APPLE_FRAMES,
    BAD_APPLE_HEIGHT,
    BAD_APPLE_WIDTH,
    BadAppleController,
    getBadApplePlayer,
    getVideoPlayer,
} from "./badApple";

describe("BadApplePlayer", () => {
    it("loads badapple.bin and indexes all frames", async () => {
        const player = await getBadApplePlayer();
        expect(player).toBeDefined();
        expect(player.frameOffsets.length).toBe(BAD_APPLE_FRAMES);
        expect(player.raw.length).toBe(1234138);
    });

    it("decodes frame 0 correctly (all black / blocked)", async () => {
        const player = await getBadApplePlayer();
        const frame0 = player.decodeFrame(0);
        expect(frame0.length).toBe(BAD_APPLE_WIDTH * BAD_APPLE_HEIGHT);
        // Frame 0 in Bad Apple intro is all black (bit 1)
        expect(frame0.every((b) => b === 1)).toBe(true);
    });

    it("decodes frame 50 where the apple silhouette appears", async () => {
        const player = await getBadApplePlayer();
        const frame50 = player.decodeFrame(50);
        let white = 0;
        let black = 0;
        for (const pixel of frame50) {
            if (pixel === 0) white++;
            else black++;
        }
        expect(white).toBeGreaterThan(1000);
        expect(black).toBeGreaterThan(1000);
    });

    it("diffs consecutive frames correctly", async () => {
        const player = await getBadApplePlayer();
        const f40 = player.decodeFrame(40);
        const f45 = player.decodeFrame(45);
        const diff = player.diff(f40, f45);
        expect(diff.rose.length).toBeGreaterThan(0);
    });
});

describe("BadAppleController", () => {
    it("drops initial black frame tiles on tick 0 and restores tiles on frame changes", async () => {
        const player = await getBadApplePlayer();
        // Create a 100x80 open grid
        const row = ".".repeat(100);
        const rows = Array.from({ length: 80 }, () => row);
        const grid = makeGrid(rows, 0, 0);

        const rect = { x0: 2, y0: 4, x1: 2 + BAD_APPLE_WIDTH - 1, y1: 4 + BAD_APPLE_HEIGHT - 1 };
        const controller = new BadAppleController(player, rect);

        // Tick 0: Frame 0 (all black) -> all tiles in rect drop
        const diff0 = controller.step(0, grid);
        expect(diff0.fell.length).toBe(BAD_APPLE_WIDTH * BAD_APPLE_HEIGHT);
        expect(diff0.rose.length).toBe(0);

        // Center pixel should now be dropped (solid)
        const sampleGx = rect.x0 + 48;
        const sampleGy = rect.y0 + 36;
        expect(grid.isDropped(sampleGx, sampleGy)).toBe(true);
        expect(grid.isSolid(sampleGx, sampleGy)).toBe(true);

        // Outside rect (perimeter) should NOT be dropped
        expect(grid.isDropped(0, 0)).toBe(false);
        expect(grid.isSolid(0, 0)).toBe(false);

        // Advance to tick corresponding to frame 50 (frame 50 * 50 / 30 = ~84 ticks)
        const tick50 = Math.round((50 * 50) / BAD_APPLE_FPS);
        const diff50 = controller.step(tick50, grid);
        expect(diff50.rose.length).toBeGreaterThan(0);

        // Some tiles are now restored and walkable
        let restoredCount = 0;
        for (let y = rect.y0; y <= rect.y1; y++) {
            for (let x = rect.x0; x <= rect.x1; x++) {
                if (!grid.isDropped(x, y)) {
                    restoredCount++;
                }
            }
        }
        expect(restoredCount).toBeGreaterThan(1000);
    });

    it("loads and plays custom bad_postman.bin video", async () => {
        const player = await getVideoPlayer("bad_postman.bin");
        expect(player).toBeDefined();
        expect(player.totalFrames).toBe(6553);
        expect(player.width).toBe(96);
        expect(player.height).toBe(72);

        // Frame 0 decoding
        const frame0 = player.decodeFrame(0);
        expect(frame0.length).toBe(96 * 72);

        // Frame 300 should have both black and white pixels
        const frame300 = player.decodeFrame(300);
        let white = 0;
        let black = 0;
        for (const px of frame300) {
            if (px === 0) white++;
            else black++;
        }
        expect(white).toBeGreaterThan(100);
        expect(black).toBeGreaterThan(100);
    });
});
