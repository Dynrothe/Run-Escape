import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { getLocBase, getLocOverride } from "../../../rs/config/loctype/LocOverrides";
import { GAME_CACHE_NAME } from "../../cache";
import { getEnemy } from "../../content/enemies";
import { getMap, getMapCharacter, isPeaceful } from "../../content/maps";
import { VARROCK_EVENTS, VARROCK_WAVES } from "../../content/varrockHordes";
import { PHONE_TRIANGLES, lintFloor } from "../../core/floorLint";
import { MAP_SQUARE_SIZE } from "../format";
import { getRecipeArena } from "../recipe";
import {
    BATTLE_FOR_VARROCK,
    BATTLE_FOR_VARROCK_RECIPE,
    BLAZE,
    BURNING_TIMBER,
    FIRES,
    FLAMES,
    PALACE_FLOOR_ASCII,
    PALACE_FLOOR_RECT_REAL,
} from "./battleForVarrock";

// The Battle for Varrock: the map's def against its recipe, its palace floor (the floor
// system's), and, with the game's cache, the map itself: walked from the gate, and nothing
// placed z-fighting. grid-hash.ts pins what it writes.

const MAP = getMap("battle_for_varrock");
const hasCache = existsSync(`caches/${GAME_CACHE_NAME}`);

describe("the Battle for Varrock", () => {
    it("plays on its recipe's squares, from just outside the south gate", () => {
        expect(MAP.arena).toEqual(getRecipeArena(BATTLE_FOR_VARROCK_RECIPE));
        const { mapX, mapY, spawn } = BATTLE_FOR_VARROCK_RECIPE;
        expect(MAP.spawn).toEqual({
            x: mapX * MAP_SQUARE_SIZE + spawn.x + 0.5,
            y: mapY * MAP_SQUARE_SIZE + spawn.y + 0.5,
        });
        // The real world's 3211, 3377: the road in, south of the gap in the wall
        expect(spawn).toEqual({ x: 3211 - 48 * 64, y: 3377 - 51 * 64 });
    });

    it("is a run with no clock: Yama's hordes, no bosses but its lairs', everyone Zachariah", () => {
        expect(MAP.waves).toBe(VARROCK_WAVES);
        expect(MAP.events).toBe(VARROCK_EVENTS);
        expect(isPeaceful(MAP)).toBe(false);
        expect(MAP.fun?.explore).toBe(true);
        expect(MAP.fun?.bosses.pool).toEqual([]);
        expect(getMapCharacter(MAP)).toBe("justiciar_zachariah");
        expect(MAP.scaperune).toBe(true);
    });

    it("has Yama's generals in their ruins, either first, and Yama after both", () => {
        const lairs = MAP.lairs!;
        expect(lairs.map((lair) => lair.id)).toEqual(["xarth", "kril", "yama"]);
        const inside = (lair: (typeof lairs)[number], { x, y }: { x: number; y: number }) => {
            const area = lair.area!;
            const [tx, ty] = [Math.floor(x), Math.floor(y)];
            const row = area.rows?.[area.y1 - ty];
            return (
                tx >= area.x0 &&
                tx <= area.x1 &&
                ty >= area.y0 &&
                ty <= area.y1 &&
                (row === undefined || row[tx - area.x0] === "#")
            );
        };
        for (const lair of lairs.slice(0, 2)) {
            expect(lair.requires).toBeUndefined();
            expect(inside(lair, lair.at)).toBe(true);
            expect(inside(lair, lair.start)).toBe(true);
            // Each grows stronger for the other's death
            expect(lair.empowered!.by).toEqual(
                lairs.filter((l) => l !== lair && !l.final).map((l) => l.id),
            );
            // and stands there from the start, a prop of its own
            expect(MAP.props!.some((prop) => prop.lair === lair.id)).toBe(true);
        }
        // Xarth's pillars, whole, on his pad and clear of him, and his dead getting up on it
        const xarth = lairs[0];
        const radius = getEnemy(xarth.enemyId).radius;
        for (const { x, y } of xarth.pillars!.at) {
            const size = xarth.pillars!.size;
            expect(inside(xarth, { x, y })).toBe(true);
            expect(inside(xarth, { x: x + size - 1, y: y + size - 1 })).toBe(true);
            const middle = { x: x + size / 2, y: y + size / 2 };
            expect(Math.hypot(middle.x - xarth.at.x, middle.y - xarth.at.y)).toBeGreaterThan(
                radius + size,
            );
        }
        const reanimate = getEnemy(xarth.enemyId).boss!.attacks.find((a) => a.summon?.walkTo)!;
        const out = reanimate.summon!.walkTo!.distance;
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const spot = {
                x: xarth.at.x + Math.cos(angle) * out,
                y: xarth.at.y + Math.sin(angle) * out,
            };
            expect(inside(xarth, spot)).toBe(true);
        }
        const yama = lairs[2];
        expect(yama.requires!.lairs).toEqual(["xarth", "kril"]);
        expect(yama.final).toBe(true);
    });

    it("lays the palace's floor over its rooms, in one piece, still, in a phone's budget", () => {
        const floor = MAP.floor!;
        const { x0, y0, x1, y1 } = PALACE_FLOOR_RECT_REAL;
        expect(PALACE_FLOOR_ASCII).toHaveLength(y1 - y0 + 1);
        for (const row of PALACE_FLOOR_ASCII) {
            expect(row).toHaveLength(x1 - x0 + 1);
        }
        expect(floor.rect).toEqual(BATTLE_FOR_VARROCK.palaceFloor);
        // Slabs that rise only under Yama's attacks: nothing on its own clock
        expect(floor.script).toEqual([]);
        expect(floor.tiles?.[0]).not.toHaveProperty("type");
        // From the top of the palace's front steps
        const lint = lintFloor(floor, { x: 12, y: 0 });
        expect(lint.warnings).toEqual([]);
        expect(lint.triangles.busy).toBeLessThanOrEqual(PHONE_TRIANGLES);
    });

    it("burns with the cache's flames, not campfires: every fire lit, blocking nothing, burning", () => {
        const lit = Object.keys(MAP.lighting!.locs!).map(Number);
        // A campfire in its ring of stones, on crossed logs, and the campfire's flame
        for (const campfire of [4265, 4266, 5249, 5499]) {
            expect(lit).not.toContain(campfire);
            expect(FIRES).not.toContain(campfire);
        }
        for (const fire of FIRES) {
            expect(lit).toContain(fire);
        }
        // The flames on their own, the big fire's and the burning timber, as copies that block
        // nothing
        expect(getLocBase(FLAMES)).toBe(25156);
        expect(getLocBase(BLAZE)).toBe(25155);
        expect(getLocBase(BURNING_TIMBER)).toBe(31722);
        for (const fire of [FLAMES, BLAZE, BURNING_TIMBER]) {
            expect(getLocOverride(fire)?.walkable).toBe(true);
        }
        // and every fire burns whoever walks into it
        expect(MAP.burns?.locs).toBe(FIRES);
    });
});

describe.skipIf(!hasCache)("the Battle for Varrock, built", () => {
    // check-maps.ts builds it (the recipe throws if the gate, the square, the palace's court or
    // the throne can't be walked to) and holds it to every rule a map cut from the real world is
    it("passes check-maps: everything open reaches the gate", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/scaperune/check-maps.ts"],
            {
                encoding: "utf8",
                timeout: 240000,
                env: { ...process.env, ONLY: "battle_for_varrock$" },
            },
        );
        expect(stdout).toMatch(/battle_for_varrock: \d+ open, 0 stranded/);
        expect(stdout).toContain("All open tiles reach the spawn");
    }, 250000);

    it("places nothing that z-fights", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/scaperune/check-coplanar.ts", "battle_for_varrock"],
            { encoding: "utf8", timeout: 240000, env: { ...process.env, CHECK: "1" } },
        );
        expect(stdout).toMatch(
            /battle_for_varrock: \d+ models, \d+ pairs in one plane \((\d+) as cut\)/,
        );
        const [, pairs, cut] = /(\d+) pairs in one plane \((\d+) as cut\)/.exec(stdout)!;
        expect(pairs).toBe(cut);
    }, 250000);

    // Wide bosses: K'ril stuck before the altar among the pews, and Xarth pushed off his counter
    // by a skeleton the dressing laid on it
    it("has room for each lair's boss where it rises, and for K'ril down his nave", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/game/check-lairs.ts", "battle_for_varrock"],
            { encoding: "utf8", timeout: 240000 },
        );
        expect(stdout).toContain("Every lair's boss has room");
    }, 250000);
});
