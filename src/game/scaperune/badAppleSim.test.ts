import { describe, expect, it } from "vitest";

import { makeGrid } from "../core/world/testGrid";
import {
    BAD_APPLE_FPS,
    BAD_APPLE_HEIGHT,
    BAD_APPLE_WIDTH,
    BadAppleController,
    getBadApplePlayer,
} from "./badApple";

describe("Bad Apple dynamic arena integration", () => {
    it("simulates real-time map transitions over multiple game ticks", async () => {
        const player = await getBadApplePlayer();
        const row = ".".repeat(128);
        const rows = Array.from({ length: 128 }, () => row);
        const grid = makeGrid(rows, 0, 0);

        const rect = {
            x0: 16,
            y0: 28,
            x1: 16 + BAD_APPLE_WIDTH - 1,
            y1: 28 + BAD_APPLE_HEIGHT - 1,
        };
        const controller = new BadAppleController(player, rect);

        // Tick 0: Frame 0 (intro black screen) -> All tiles in the screen drop
        controller.step(0, grid);
        expect(grid.isDropped(rect.x0 + 10, rect.y0 + 10)).toBe(true);

        // Tick 70 (~1.4s, video frame ~42): Apple silhouette starts opening
        const tick42 = Math.round((42 * 50) / BAD_APPLE_FPS);
        const diff42 = controller.step(tick42, grid);
        expect(diff42.rose.length).toBeGreaterThan(0);

        // Tick 100: More shapes opening up
        const tick60 = Math.round((60 * 50) / BAD_APPLE_FPS);
        controller.step(tick60, grid);

        let openInsideScreen = 0;
        for (let y = rect.y0; y <= rect.y1; y++) {
            for (let x = rect.x0; x <= rect.x1; x++) {
                if (!grid.isDropped(x, y)) {
                    openInsideScreen++;
                }
            }
        }
        // At frame 60, thousands of tiles are playable white floor
        expect(openInsideScreen).toBeGreaterThan(1000);
    });

    it("syncs video frames directly to audio playback time when available", async () => {
        const player = await getBadApplePlayer();
        const row = ".".repeat(128);
        const rows = Array.from({ length: 128 }, () => row);
        const grid = makeGrid(rows, 0, 0);

        const rect = {
            x0: 16,
            y0: 28,
            x1: 16 + BAD_APPLE_WIDTH - 1,
            y1: 28 + BAD_APPLE_HEIGHT - 1,
        };
        const controller = new BadAppleController(player, rect);

        // Frame 0 at 0.0s
        controller.musicSeconds = 0;
        controller.step(0, grid);
        expect(controller.currentFrameIndex).toBe(0);

        // At 2.0s, frame should be 2.0 * 30 = 60
        controller.musicSeconds = 2.0;
        controller.step(0, grid);
        expect(controller.currentFrameIndex).toBe(60);
    });

    it("ensures player does not take damage when the floor drops or moves", async () => {
        const { Sim } = await import("../core/Sim");
        const { setGeneratedMap } = await import("../content/maps");
        const { BAD_APPLE_MAP, BAD_APPLE_SCREEN_WORLD_RECT } = await import("./maps/badApple");
        setGeneratedMap(BAD_APPLE_MAP);
        const player = await getBadApplePlayer();
        const rows = Array.from({ length: 128 }, () => ".".repeat(128));
        const grid = makeGrid(rows, 0, 0);
        const badApple = new BadAppleController(player, BAD_APPLE_SCREEN_WORLD_RECT);

        const sim = new Sim({
            grid,
            mapId: "scaperune_bad_apple",
            badApple,
            characterId: "warrior",
            metaStats: {
                might: 0,
                armor: 0,
                maxHp: 0,
                regen: 0,
                cooldown: 0,
                area: 0,
                speed: 0,
                duration: 0,
                amount: 0,
                moveSpeed: 0,
                magnet: 0,
                luck: 0,
                growth: 0,
                greed: 0,
                revival: 0,
                reroll: 0,
                banish: 0,
                thorns: 0,
                healChance: 0,
                meleeMight: 0,
                rangedMight: 0,
                magicMight: 0,
                auraArea: 0,
                bossMight: 0,
                levelMight: 0,
                meleeKnockback: 0,
                weaponSlots: 0,
                passiveSlots: 0,
                powerUpRate: 0,
            },
            seed: 12345,
            spawnX: BAD_APPLE_SCREEN_WORLD_RECT.x0 + 48,
            spawnY: BAD_APPLE_SCREEN_WORLD_RECT.y0 + 36,
        });

        const initialHp = sim.player.hp;
        // Step for 150 ticks across frame transitions
        for (let t = 0; t < 150; t++) {
            sim.step(0, 0);
            const events = sim.takeEvents();
            for (const e of events) {
                if (e.type === "playerHit") {
                    console.log(`[TEST HIT] at tick ${t}:`, e);
                }
            }
        }
        expect(sim.player.hp).toBe(initialHp);
    });
});
