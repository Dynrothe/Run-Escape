import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { GAME_CACHE_NAME } from "../../cache";
import { SOLID_FLAGS } from "../../core/world/ArenaGrid";
import { isStamped } from "../Ground";
import { findLoneKitPieces } from "../catalogue";
import { findReachable, getCollisionFlags } from "../collision";
import { MAP_SQUARE_SIZE, createTileGrid, writeLocs, writeTerrain } from "../format";
import { LOC_FLOOR_DECORATION } from "../mapBuild";
import { BuildContext, getRecipeArena } from "../recipe";
import {
    AISLE,
    OWLS_COURT,
    OWLS_COURT_BOSS_ARENA,
    OWLS_COURT_RECIPE,
    SOLID_LOCS,
    WALK_THROUGH,
    buildOwlsCourt,
} from "./owlsCourt";

// The court builds without the cache, as the Sanctuary does: what blocks and how big it is is all
// the build asks, and the recipe's table says. Walls, lips and floor tiles are as the worst could be.
const sizes = new Map(SOLID_LOCS.map(([id, sizeX, sizeY]) => [id, { sizeX, sizeY }]));
sizes.set(38427, { sizeX: 1, sizeY: 3 });
const walkThrough = new Set(WALK_THROUGH);
const emptySquare = (() => {
    const grid = createTileGrid(64, 64);
    return { terrain: writeTerrain(grid, 0, 0), locs: writeLocs(grid, 0, 0) };
})();
const context: BuildContext = {
    maps: { getTerrainData: () => emptySquare.terrain, getLocData: () => emptySquare.locs },
    locs: (id) => ({
        name: String(id),
        ...(sizes.get(id) ?? { sizeX: 1, sizeY: 1 }),
        clipType: walkThrough.has(id) ? 0 : 2,
        blocksProjectile: !walkThrough.has(id),
        drawn: true,
    }),
};

// The gold and blue runner's tiles, which make the checker's rugs
const RUG = new Set([38244, 38245, 38246, 38247, 38251]);

describe("the Owl's Court", () => {
    const { map, placer, drawn } = buildOwlsCourt(context);
    const { grid } = map;
    const size = OWLS_COURT_RECIPE.squaresX * MAP_SQUARE_SIZE;
    const base = OWLS_COURT_RECIPE.margin * MAP_SQUARE_SIZE;
    const flags = getCollisionFlags(grid, context.locs);
    const solid = (x: number, y: number) => {
        return (flags[base + x + (base + y) * size] & SOLID_FLAGS) !== 0;
    };
    const locsAt = (x: number, y: number) =>
        grid.locs.filter((loc) => loc.x === base + x && loc.y === base + y);
    const { checker, bossArena, pillars, bolts, fires, knights, dais, rise, start } = OWLS_COURT;
    const onPillar = (x: number, y: number) =>
        pillars.some((p) => x >= p.x && x < p.x + p.size && y >= p.y && y < p.y + p.size);
    const inArena = (x: number, y: number) =>
        x >= bossArena.x &&
        y >= bossArena.y &&
        x < bossArena.x + bossArena.size &&
        y < bossArena.y + bossArena.size;
    // Everything the player can walk to from where he rises
    const reached = findReachable(
        flags,
        size,
        size,
        { x0: 0, y0: 0, x1: size - 1, y1: size - 1 },
        base + rise.x,
        base + rise.y,
    );
    const reachable = (x: number, y: number) => reached[base + x + (base + y) * size] === 1;

    it("has a checker of whole cells over the court, open but for the pillars", () => {
        expect(checker.cell).toBe(3);
        expect(checker.x0).toBe(bossArena.x);
        expect(checker.y0).toBe(bossArena.y);
        expect(checker.cols * checker.cell).toBe(bossArena.size);
        expect(checker.rows * checker.cell).toBe(bossArena.size);
        for (let y = bossArena.y; y < bossArena.y + bossArena.size; y++) {
            for (let x = bossArena.x; x < bossArena.x + bossArena.size; x++) {
                expect(solid(x, y), `${x},${y}`).toBe(onPillar(x, y));
                expect(reachable(x, y), `${x},${y}`).toBe(!onPillar(x, y));
            }
        }
    });

    it("paints no checker: stone, and the runner up the aisle alone", () => {
        for (let y = bossArena.y; y < bossArena.y + bossArena.size; y++) {
            for (let x = bossArena.x; x < bossArena.x + bossArena.size; x++) {
                const floor = locsAt(x, y).filter((l) => l.type === LOC_FLOOR_DECORATION);
                expect(floor.length, `${x},${y}`).toBe(1);
                const aisle = x >= AISLE.x0 && x <= AISLE.x1 && y >= AISLE.y0 && y <= AISLE.y1;
                expect(RUG.has(floor[0].id), `${x},${y}`).toBe(aisle);
            }
        }
    });

    it("stands the four pillars on stone cells, solid", () => {
        expect(pillars).toHaveLength(4);
        for (const pillar of pillars) {
            const cx = Math.floor((pillar.x - checker.x0) / checker.cell);
            const cy = Math.floor((pillar.y - checker.y0) / checker.cell);
            expect((cx + cy) % 2).toBe(1);
            // Within its cell
            expect(Math.floor((pillar.x + 1 - checker.x0) / checker.cell)).toBe(cx);
            expect(Math.floor((pillar.y + 1 - checker.y0) / checker.cell)).toBe(cy);
            expect(locsAt(pillar.x, pillar.y).some((l) => l.id === 38502)).toBe(true);
            for (let y = pillar.y; y < pillar.y + 2; y++) {
                for (let x = pillar.x; x < pillar.x + 2; x++) {
                    expect(solid(x, y)).toBe(true);
                }
            }
        }
    });

    it("has a crossbowman for every row of each lane, and the lanes open across the court", () => {
        expect(bolts.length).toBeGreaterThanOrEqual(6);
        const rows = new Set<number>();
        for (const bolt of bolts) {
            expect(bolt.y0).toBe(bolt.y - 1);
            expect(bolt.y1).toBe(bolt.y + 1);
            expect(Math.sign(bolt.toX - bolt.fromX)).toBe(bolt.dir);
            expect(inArena(bolt.fromX, bolt.y) && inArena(bolt.toX, bolt.y)).toBe(true);
            expect(bolt.statues.map(({ y }) => y)).toEqual([bolt.y0, bolt.y, bolt.y1]);
            for (const statue of bolt.statues) {
                // Beside the court, on the side it fires from, and solid
                expect(statue.x).toBe(bolt.fromX - bolt.dir);
                // Drawn by the fight, which plays their aim and fire: not in the map
                expect(locsAt(statue.x, statue.y).some((l) => l.id === 38445)).toBe(false);
                expect(drawn).toContainEqual({ id: 38445, ...statue });
                expect(statue.rotation).toBe(bolt.dir === 1 ? 3 : 1);
                expect(solid(statue.x, statue.y)).toBe(true);
                rows.add(statue.y);
                for (let x = bolt.fromX; x !== bolt.toX + bolt.dir; x += bolt.dir) {
                    expect(solid(x, statue.y), `${x},${statue.y}`).toBe(onPillar(x, statue.y));
                }
            }
        }
        // No row is two lanes'
        expect(rows.size).toBe(bolts.length * 3);
    });

    it("has the knights at the court's south corners and the dais north of it", () => {
        expect(knights).toHaveLength(2);
        for (const knight of knights) {
            expect(knight.y).toBe(bossArena.y);
            expect(inArena(knight.x + 1, knight.y + 1)).toBe(false);
            expect(locsAt(knight.x, knight.y).some((l) => l.id === 38432)).toBe(false);
            const { size: _size, ...at } = knight;
            expect(drawn).toContainEqual({ id: 38432, ...at });
            for (let y = knight.y; y < knight.y + 3; y++) {
                for (let x = knight.x; x < knight.x + 3; x++) {
                    expect(solid(x, y)).toBe(true);
                }
            }
        }
        expect(dais.y).toBe(bossArena.y + bossArena.size);
        const onDais = (id: number) =>
            grid.locs.some(
                (l) =>
                    l.id === id &&
                    l.x - base >= dais.x &&
                    l.x - base < dais.x + dais.w &&
                    l.y - base >= dais.y &&
                    l.y - base < dais.y + dais.h,
            );
        // The Owl Justiciar and the Saradomin star
        expect(onDais(38546)).toBe(true);
        expect(onDais(38770)).toBe(true);
    });

    it("lays a fire across each row of the bridge, with wizard statues either side", () => {
        expect(fires).toHaveLength(4);
        for (const fire of fires) {
            expect(fire.x1 - fire.x0).toBe(2);
            expect(fire.y).toBeLessThan(bossArena.y);
            expect(fire.y).toBeGreaterThan(start.y);
            // The fight draws it, on its rhythm
            expect(locsAt(fire.x0, fire.y).some((l) => l.id === 38427)).toBe(false);
            expect(drawn).toContainEqual({
                id: 38427,
                x: fire.x0,
                y: fire.y,
                rotation: fire.rotation,
            });
            for (let x = fire.x0; x <= fire.x1; x++) {
                expect(reachable(x, fire.y), `${x},${fire.y}`).toBe(true);
            }
            // The statues' columns, solid either side of the lane
            expect(solid(fire.x0 - 1, fire.y) && solid(fire.x1 + 1, fire.y)).toBe(true);
        }
    });

    it("starts the player on the terrace, six tiles south of where he rises", () => {
        expect(reachable(rise.x, rise.y)).toBe(true);
        expect(reachable(start.x, start.y)).toBe(true);
        expect(inArena(rise.x, rise.y)).toBe(true);
        expect(inArena(start.x, start.y)).toBe(false);
        expect(start.x).toBe(rise.x);
        expect(rise.y - start.y).toBeGreaterThan(0);
        expect(rise.y - start.y).toBeLessThanOrEqual(6);
        expect(OWLS_COURT_RECIPE.spawn).toEqual({ x: base + start.x, y: base + start.y });
    });

    it("seals everything but the court, the bridge's lane and the terrace", () => {
        let open = 0;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (!solid(x - base, y - base)) {
                    open++;
                    expect(reachable(x - base, y - base), `${x - base},${y - base}`).toBe(true);
                }
            }
        }
        // The court but its pillars, 4 rows of the lane, and the terrace less what stands on it
        expect(open).toBeGreaterThan(27 * 27 - 16 + 12 + 50);
        expect(open).toBeLessThan(27 * 27 - 16 + 12 + 11 * 7);
    });

    it("puts down everything it asks for, each kit piece with its set, the same every time", () => {
        expect(placer.describeShortfalls()).toEqual([]);
        // The wizard statues' fire is the fight's, so they're taken as whole
        expect(findLoneKitPieces(grid, isStamped)).toEqual([]);
        expect(
            findLoneKitPieces(grid).every((piece) => [38416, 38417, 38418].includes(piece.loc.id)),
        ).toBe(true);
        const again = OWLS_COURT_RECIPE.build(context);
        expect(writeLocs(again, 0, 0)).toEqual(writeLocs(grid, 0, 0));
        expect(writeTerrain(again, 0, 0)).toEqual(writeTerrain(grid, 0, 0));
    });

    it("stands where the map says, its boss arena the court", () => {
        const arena = getRecipeArena(OWLS_COURT_RECIPE);
        expect(arena).toEqual({ baseX: 83 * 64, baseY: 77 * 64, sizeX: 64, sizeY: 64 });
        expect(OWLS_COURT.origin).toEqual({ x: arena.baseX, y: arena.baseY });
        expect(OWLS_COURT_BOSS_ARENA).toEqual({
            baseX: arena.baseX + bossArena.x,
            baseY: arena.baseY + bossArena.y,
            size: bossArena.size,
        });
    });
});

// The table the tests above build from, held to the cache, as the Sanctuary's is
describe.skipIf(!existsSync(`caches/${GAME_CACHE_NAME}`))("the Owl's Court's loc table", () => {
    it("matches the cache", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/scaperune/check-solid-locs.ts"],
            { encoding: "utf8", timeout: 120000 },
        );
        expect(stdout).toContain("The Owl's Court's loc table matches the cache");
    }, 130000);
});
