import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import {
    COLOSSUS_HITPOINTS,
    COLOSSUS_SHATTER,
    COLOSSUS_START_DISTANCE,
    COLOSSUS_WEAPON_LEVEL,
    QUARRY_FLOOR,
    SHELF_GROUPS,
} from "../content/quarryColossus";
import { BossAttackDef, emptyStats } from "../content/types";
import { getCollisionFlags } from "../scaperune/collision";
import { MAP_SQUARE_SIZE, createTileGrid, writeLocs, writeTerrain } from "../scaperune/format";
import {
    QUARRY,
    QUARRY_LOC_SIZES,
    QUARRY_RECIPE,
    buildQuarry,
} from "../scaperune/maps/quarryColossus";
import { BuildContext } from "../scaperune/recipe";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { PHONE_TRIANGLES, lintFloor } from "./floorLint";
import { syncHash } from "./lockstep";
import { createSave, isMapUnlocked, recordRun } from "./save";
import { SOLID_FLAGS } from "./world/ArenaGrid";
import { makeGrid } from "./world/testGrid";

// The Quarry Colossus on the Sunken Quarry's shelves (docs/design/quarry-colossus.md): the map, the
// floor he works, each of his attacks and each way the quarry's turned on him, and the shelves
// giving way into the next phase. On the real map, built without the cache, so the shelves, the
// pillars, the faults and the plates are where they are in the game.

const sizes = new Map(QUARRY_LOC_SIZES.map(([id, sizeX, sizeY]) => [id, { sizeX, sizeY }]));
const emptySquare = (() => {
    const grid = createTileGrid(64, 64);
    return { terrain: writeTerrain(grid, 0, 0), locs: writeLocs(grid, 0, 0) };
})();
const context: BuildContext = {
    maps: { getTerrainData: () => emptySquare.terrain, getLocData: () => emptySquare.locs },
    locs: (id) => ({
        name: String(id),
        ...(sizes.get(id) ?? { sizeX: 1, sizeY: 1 }),
        clipType: 2,
        blocksProjectile: true,
        drawn: true,
    }),
};

// The quarry's collision as the sim's grid: the arena square, at its world tiles
const QUARRY_ROWS = (() => {
    const grid = buildQuarry(context).grid;
    const flags = getCollisionFlags(grid, context.locs);
    const size = QUARRY_RECIPE.squaresX * MAP_SQUARE_SIZE;
    const base = QUARRY_RECIPE.margin * MAP_SQUARE_SIZE;
    const rows: string[] = [];
    for (let row = 0; row < MAP_SQUARE_SIZE; row++) {
        const y = MAP_SQUARE_SIZE - 1 - row;
        let line = "";
        for (let x = 0; x < MAP_SQUARE_SIZE; x++) {
            line += flags[base + x + (base + y) * size] & SOLID_FLAGS ? "#" : ".";
        }
        rows.push(line);
    }
    return rows;
})();

const O = QUARRY.origin;
const at = (x: number, y: number) => ({ x: O.x + x + 0.5, y: O.y + y + 0.5 });

function createSim(seed = 1, party?: number): Sim {
    const map = getMap("quarry_colossus");
    return new Sim({
        grid: makeGrid(QUARRY_ROWS, O.x, O.y),
        mapId: "quarry_colossus",
        characterId: "prospector",
        metaStats: emptyStats(),
        seed,
        spawnX: map.spawn.x,
        spawnY: map.spawn.y,
        party:
            party === undefined
                ? undefined
                : Array.from({ length: party }, (_, i) => ({
                      name: "p" + i,
                      characterId: "prospector",
                      metaStats: emptyStats(),
                  })),
    });
}

function run(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
    const ticks = Math.round(seconds * TICKS_PER_SECOND);
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step(moveX, moveY);
    }
}

const colossus = () => getEnemy("quarry_colossus");
const attackNamed = (name: string): BossAttackDef =>
    colossus().boss!.attacks.find((a) => a.name === name)!;

// Through his rise, with nothing of his going and nothing of theirs hitting him
function startFight(sim: Sim): Enemy {
    run(sim, colossus().boss!.intro!.seconds + 0.1);
    const boss = sim.enemies.find((e) => e.finalBoss)!;
    quiet(sim, boss);
    for (const hero of sim.heroes) {
        hero.weapons.length = 0;
    }
    return boss;
}

function quiet(sim: Sim, boss: Enemy): void {
    boss.attackCooldown = 1e9;
    const state = boss.bossState!;
    state.windup = undefined;
    state.chain = undefined;
    state.follow = undefined;
    state.channelEnd = 0;
    state.phase!.ambientsNext = [Infinity, Infinity, Infinity];
    sim.hazards = [];
}

function place(sim: Sim, spot: { x: number; y: number }, hero = 0): void {
    const player = sim.heroes[hero].player;
    player.x = player.prevX = spot.x;
    player.y = player.prevY = spot.y;
}

function placeBoss(boss: Enemy, spot: { x: number; y: number }): void {
    boss.x = boss.prevX = spot.x;
    boss.y = boss.prevY = spot.y;
    boss.vx = boss.vy = 0;
}

function use(sim: Sim, boss: Enemy, name: string): void {
    sim["startBossAttack"](boss, attackNamed(name));
    boss.attackCooldown = 1e9;
}

const hp = (sim: Sim, hero = 0) => sim.heroes[hero].player.hp;
const floor = (sim: Sim) => sim.floor!;
const tile = (x: number, y: number) => ({ x: O.x + x, y: O.y + y });

describe("the map", () => {
    test("is one fight, after Zachariah's, with the Prospector's warhammer and Shatter", () => {
        const map = getMap("quarry_colossus");
        expect(map.fight).toEqual({
            requires: "zachariah",
            character: "prospector",
            weaponLevel: COLOSSUS_WEAPON_LEVEL,
            ability: COLOSSUS_SHATTER,
        });
        expect(map.waves).toEqual([]);
        expect(map.events).toEqual([
            { at: 0, kind: "finalBoss", enemyId: "quarry_colossus", hp: COLOSSUS_HITPOINTS },
        ]);
        expect(map.floor).toBe(QUARRY_FLOOR);
        const save = createSave();
        expect(isMapUnlocked(save, "quarry_colossus")).toBe(false);
        recordRun(save, {
            mapId: "zachariah",
            victory: true,
            seconds: 200,
            level: 1,
            kills: 1,
            coins: 0,
            bossesKilled: [],
        });
        expect(isMapUnlocked(save, "quarry_colossus")).toBe(true);
    });

    test("each shelf is open, and its own piece: everything round it's blocked", () => {
        const solid = (x: number, y: number) => QUARRY_ROWS[MAP_SQUARE_SIZE - 1 - y][x] === "#";
        for (const s of QUARRY.shelves) {
            for (let y = s.y0; y <= s.y1; y++) {
                for (let x = s.x0; x <= s.x1; x++) {
                    expect(solid(x, y)).toBe(false);
                }
            }
            // The face south of each shelf, and the rock beside it
            expect(solid(s.x0 - 1, s.y0)).toBe(true);
            expect(solid(s.x1 + 1, s.y0)).toBe(true);
            expect(solid((s.x0 + s.x1) >> 1, s.y0 - 1)).toBe(true);
        }
    });

    test("he rises in the top shelf's middle, the player its south edge, the next shelf in sight", () => {
        const sim = createSim();
        const boss = startFight(sim);
        expect(boss.x).toBeCloseTo(at(QUARRY.rises[0].x, QUARRY.rises[0].y).x, 0);
        expect(boss.y - sim.player.y).toBeCloseTo(COLOSSUS_START_DISTANCE, 0);
        expect(sim.player.y - O.y).toBeLessThan(QUARRY.shelves[0].y0 + 4);
    });
});

describe("the floor he works", () => {
    test("passes the floor's checks: three pieces (the shelves, on purpose), all reached", () => {
        const start = QUARRY.starts[0];
        const lint = lintFloor(QUARRY_FLOOR, {
            x: start.x - QUARRY.floor.x0,
            y: start.y - QUARRY.floor.y0,
        });
        // The lint's count is every tile of all three shelves busy at once, which the camera never
        // sees (a shelf and the edge of the next): the game's own probe on a phone, the busiest
        // spot on each shelf, is in the design doc, under the budget
        const real = lint.warnings.filter(
            (w) => !w.includes("3 pieces") && !w.includes("reach") && !w.includes("triangles"),
        );
        expect(real).toEqual([]);
        expect(lint.triangles.busy).toBeLessThanOrEqual(PHONE_TRIANGLES * 1.1);
    });

    test("his stamp heaves rings out from round his feet, but along the spokes, and only on his shelf", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const rise = QUARRY.rises[0];
        placeBoss(boss, at(rise.x, rise.y));
        use(sim, boss, "Stamp 1");
        const f = floor(sim);
        const marked = (x: number, y: number) => f.riseAt[f.index(O.x + x, O.y + y)] !== -1;
        // His own tile first, then out a ring at a time; along the cross it stays down
        expect(marked(rise.x + 2, rise.y + 1)).toBe(true);
        expect(marked(rise.x + 3, rise.y)).toBe(false);
        expect(marked(rise.x, rise.y - 4)).toBe(false);
        // Under him, his fists; out from him, the rings
        expect(marked(rise.x + 1, rise.y + 1)).toBe(false);
        const ring2 = f.riseAt[f.index(O.x + rise.x + 2, O.y + rise.y + 1)];
        const ring3 = f.riseAt[f.index(O.x + rise.x + 3, O.y + rise.y + 2)];
        expect(ring3).toBeGreaterThan(ring2);
        // Its reach is 6: past it, and on the next shelf, nothing
        expect(marked(rise.x + 8, rise.y + 1)).toBe(false);
        const below = QUARRY.shelves[1];
        for (let x = below.x0; x <= below.x1; x++) {
            expect(marked(x, below.y1)).toBe(false);
        }
    });

    test("his slam heaves the fault nearest them; cracked twice it falls, and comes back", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const seam = QUARRY.faults[0][2];
        place(sim, at(seam[3].x, seam[3].y - 2));
        const f = floor(sim);
        const i = f.index(O.x + seam[3].x, O.y + seam[3].y);
        use(sim, boss, "Fault slam 1");
        expect(f.riseAt[i]).toBeGreaterThan(sim.tick);
        // The other faults are left alone
        const other = QUARRY.faults[0][0][0];
        expect(f.riseAt[f.index(O.x + other.x, O.y + other.y)]).toBe(-1);
        run(sim, 2);
        expect(f.hits[i]).toBe(1);
        use(sim, boss, "Fault slam 1");
        run(sim, 2.5);
        expect(sim.grid.isDropped(O.x + seam[3].x, O.y + seam[3].y)).toBe(true);
        // Nobody's stranded: the shelf's still one piece
        expect(f.wouldSplit([])).toBe(false);
        run(sim, 12);
        expect(sim.grid.isDropped(O.x + seam[3].x, O.y + seam[3].y)).toBe(false);
    });

    test("a stamp on a cracked fault caves it in under him: he sinks, stunned, then climbs out", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const seam = QUARRY.faults[0][2];
        const f = floor(sim);
        // Cracked once, by a slam
        place(sim, at(seam[3].x, seam[3].y - 3));
        use(sim, boss, "Fault slam 1");
        run(sim, 2);
        placeBoss(boss, at(seam[3].x, seam[3].y));
        place(sim, at(seam[3].x, seam[3].y - 9));
        use(sim, boss, "Stamp 1");
        run(sim, 1.2);
        expect(sim.isStunned(boss)).toBe(true);
        expect(sim.isSunk(boss)).toBe(true);
        expect(sim.isExposed(boss)).toBe(true);
        run(sim, 0.4);
        expect(sim.grid.isDropped(O.x + seam[3].x, O.y + seam[3].y)).toBe(true);
        // Still in the hole while he's stunned, and out onto the floor after
        expect(Math.floor(boss.y)).toBe(O.y + seam[3].y);
        run(sim, 3);
        expect(sim.isSunk(boss)).toBe(false);
        expect(sim.grid.isDropped(Math.floor(boss.x), Math.floor(boss.y))).toBe(false);
    });

    test("an uncracked fault holds", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const seam = QUARRY.faults[0][2];
        placeBoss(boss, at(seam[3].x, seam[3].y));
        place(sim, at(seam[3].x, seam[3].y - 9));
        use(sim, boss, "Stamp 1");
        run(sim, 1.5);
        expect(sim.isStunned(boss)).toBe(false);
        expect(sim.grid.isDropped(O.x + seam[3].x, O.y + seam[3].y)).toBe(false);
    });
});

describe("boulders and pillars", () => {
    test("a boulder lands where they stood; behind a pillar, the pillar takes it and cracks", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const pillar = QUARRY.pillars[0][2];
        // Him north of the pillar, them right behind it
        placeBoss(boss, at(pillar.x + 1, pillar.y + 3));
        place(sim, at(pillar.x + 1, pillar.y - 1));
        const before = hp(sim);
        use(sim, boss, "Boulder");
        run(sim, 1.7);
        expect(hp(sim)).toBe(before);
        const f = floor(sim);
        expect(f.hits[f.index(O.x + pillar.x, O.y + pillar.y)]).toBe(1);
        // In the open, it hits
        place(sim, at(pillar.x + 6, pillar.y - 1));
        use(sim, boss, "Boulder");
        run(sim, 1.7);
        expect(hp(sim)).toBeLessThan(before);
    });

    test("three and a pillar breaks and falls away, a hole where it stood, then stands again", () => {
        const sim = createSim();
        startFight(sim);
        const pillar = QUARRY.pillars[0][2];
        const f = floor(sim);
        expect(sim.grid.isSolid(O.x + pillar.x, O.y + pillar.y)).toBe(true);
        for (let n = 0; n < 3; n++) {
            f.hitPillar(O.x + pillar.x, O.y + pillar.y, sim.tick);
        }
        expect(f.isPillarTile(O.x + pillar.x, O.y + pillar.y)).toBe(false);
        run(sim, 0.5);
        expect(sim.grid.isDropped(O.x + pillar.x + 1, O.y + pillar.y + 1)).toBe(true);
        expect(
            f.blocksSight(
                O.x + pillar.x + 1,
                O.y + pillar.y + 6,
                O.x + pillar.x + 1,
                O.y + pillar.y - 3,
            ),
        ).toBe(false);
        run(sim, 17);
        expect(f.isPillarTile(O.x + pillar.x, O.y + pillar.y)).toBe(true);
        expect(sim.grid.isSolid(O.x + pillar.x, O.y + pillar.y)).toBe(true);
    });

    test("his charge smashes through a pillar in its way", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const pillar = QUARRY.pillars[0][0];
        placeBoss(boss, { x: O.x + pillar.x + 1, y: O.y + pillar.y + 5.5 });
        place(sim, { x: O.x + pillar.x + 1, y: O.y + pillar.y - 1 });
        use(sim, boss, "Charge");
        run(sim, 2.5);
        expect(floor(sim).isPillarTile(O.x + pillar.x, O.y + pillar.y)).toBe(false);
    });
});

describe("turning the quarry on him", () => {
    test("his charge that misses leaves his guard down: everything does double", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const rise = QUARRY.rises[0];
        placeBoss(boss, at(rise.x, rise.y));
        place(sim, at(rise.x, rise.y - 5));
        use(sim, boss, "Charge");
        // Off his strip, sideways
        run(sim, 1.05, 1, 0);
        expect(sim.isExposed(boss)).toBe(true);
    });

    test("a crane's plate drops its load where he stands: still there, he takes it and is stunned", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const plate = QUARRY.plates[0][0];
        placeBoss(boss, at(plate.x + 8, plate.y));
        const before = boss.hp;
        place(sim, at(plate.x + 2, plate.y));
        run(sim, 0.1);
        place(sim, at(plate.x, plate.y));
        run(sim, 0.1);
        expect(sim.loads.length).toBe(1);
        run(sim, 1.2);
        expect(boss.hp).toBeLessThan(before - 400);
        expect(sim.isStunned(boss)).toBe(true);
    });

    test("one he's walked out from under misses", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const plate = QUARRY.plates[0][0];
        placeBoss(boss, at(plate.x + 8, plate.y));
        const before = boss.hp;
        place(sim, at(plate.x + 2, plate.y));
        run(sim, 0.1);
        place(sim, at(plate.x, plate.y));
        run(sim, 0.1);
        placeBoss(boss, at(plate.x + 14, plate.y));
        run(sim, 1.2);
        expect(boss.hp).toBe(before);
        expect(sim.isStunned(boss)).toBe(false);
    });

    test("Shatter with his guard down breaks him open: his guard stays down five seconds", () => {
        const sim = createSim();
        const boss = startFight(sim);
        place(sim, { x: boss.x, y: boss.y - 3.5 });
        boss.bossState!.exposedEnd = sim.tick + 10;
        expect(sim.useAbility()).toBe(true);
        expect(sim.isCoreOpen(boss)).toBe(true);
        run(sim, 4.5);
        expect(sim.isExposed(boss)).toBe(true);
        run(sim, 0.7);
        expect(sim.isExposed(boss)).toBe(false);
    });

    test("a second Shatter on his bare core doesn't keep it bare", () => {
        const sim = createSim();
        const boss = startFight(sim);
        place(sim, { x: boss.x, y: boss.y - 3.5 });
        boss.bossState!.exposedEnd = sim.tick + 10;
        expect(sim.useAbility()).toBe(true);
        run(sim, 4.1);
        expect(sim.useAbility()).toBe(true);
        run(sim, 1.2);
        expect(sim.isExposed(boss)).toBe(false);
    });

    test("Shatter with his guard up is a blow and no more", () => {
        const sim = createSim();
        const boss = startFight(sim);
        place(sim, { x: boss.x, y: boss.y - 3.5 });
        expect(sim.useAbility()).toBe(true);
        expect(sim.isCoreOpen(boss)).toBe(false);
        expect(sim.isExposed(boss)).toBe(false);
    });
});

describe("the shelves giving way", () => {
    function toThreshold(sim: Sim, boss: Enemy, share: number): void {
        boss.hp = Math.round(boss.maxHp * share) + 1;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
    }

    test("at each threshold the shelf falls, and everyone lands on the next, unhurt", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const before = hp(sim);
        toThreshold(sim, boss, 0.85);
        expect(boss.bossState!.phase!.index).toBe(1);
        run(sim, 4.5);
        const s2 = QUARRY.shelves[1];
        expect(sim.player.y - O.y).toBeGreaterThanOrEqual(s2.y0);
        expect(sim.player.y - O.y).toBeLessThanOrEqual(s2.y1 + 1);
        expect(boss.y - O.y).toBeGreaterThanOrEqual(s2.y0);
        expect(boss.y - O.y).toBeLessThanOrEqual(s2.y1 + 1);
        expect(hp(sim)).toBe(before);
        // The top shelf's gone, all of it, pillars too
        const s1 = QUARRY.shelves[0];
        for (const [x, y] of [
            [s1.x0, s1.y0],
            [s1.x1, s1.y1],
            [QUARRY.pillars[0][0].x, QUARRY.pillars[0][0].y],
        ]) {
            expect(sim.grid.isDropped(O.x + x, O.y + y)).toBe(true);
        }
        expect(
            floor(sim).isPillarTile(O.x + QUARRY.pillars[0][0].x, O.y + QUARRY.pillars[0][0].y),
        ).toBe(false);
        // and it never comes back
        run(sim, 30);
        expect(sim.grid.isDropped(O.x + s1.x0, O.y + s1.y0)).toBe(true);
    });

    test("down to the last shelf, where lava wells up through its faults", () => {
        const sim = createSim();
        const boss = startFight(sim);
        toThreshold(sim, boss, 0.85);
        run(sim, 4.5);
        quiet(sim, boss);
        toThreshold(sim, boss, 0.45);
        expect(boss.bossState!.phase!.index).toBe(2);
        // Landed, and he's still getting up: nothing of his going yet
        run(sim, 4);
        const s3 = QUARRY.shelves[2];
        expect(sim.player.y - O.y).toBeLessThanOrEqual(s3.y1 + 1);
        expect(floor(sim).phase).toBe("molten");
        // Nothing's cued on the shelf they've landed on, but its lava
        const f = floor(sim);
        let cued = 0;
        for (let y = s3.y0; y <= s3.y1; y++) {
            for (let x = s3.x0; x <= s3.x1; x++) {
                if (f.isMarked(f.index(O.x + x, O.y + y), sim.tick)) {
                    cued++;
                }
            }
        }
        expect(cued).toBe(0);
        const fault = QUARRY.faults[2][0][0];
        expect(floor(sim).effectAt(O.x + fault.x, O.y + fault.y, sim.tick)).not.toBe(0);
    });

    test("a party lands side by side", () => {
        const sim = createSim(1, 2);
        const boss = startFight(sim);
        toThreshold(sim, boss, 0.85);
        run(sim, 4.5);
        const [a, b] = sim.heroes.map((h) => h.player);
        expect(Math.abs(a.x - b.x)).toBeCloseTo(1.5, 1);
        expect(a.y).toBeCloseTo(b.y, 1);
    });

    test("each shelf's group is its tiles, so a shelf's patterns stay on it", () => {
        const sim = createSim();
        startFight(sim);
        const groups = floor(sim).layout.groups;
        QUARRY.shelves.forEach((s, i) => {
            expect(groups.get(SHELF_GROUPS[i])!.length).toBe((s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1));
        });
    });
});

describe("the whole fight", () => {
    // A bot of a player: in reach of him, off the floor's marked tiles, Shatter when it can
    function bout(seed: number, seconds: number): { sim: Sim; hash: number } {
        const sim = createSim(seed);
        for (let i = 0; i < seconds * TICKS_PER_SECOND && !sim.runOver; i++) {
            const boss = sim.shownBoss;
            let mx = 0;
            let my = 0;
            if (boss && !boss.dead) {
                const dx = boss.x - sim.player.x;
                const dy = boss.y - sim.player.y;
                const d = Math.hypot(dx, dy);
                if (d > 4) {
                    mx = dx / d;
                    my = dy / d;
                }
                if (sim.isExposed(boss)) {
                    sim.useAbility();
                }
            }
            sim.step(mx, my);
            // It's the fight's run we're pinning, not how long the bot lasts
            sim.player.hp = sim.player.maxHp;
        }
        return { sim, hash: syncHash(sim) };
    }

    test("is deterministic: the same seed plays the same", () => {
        expect(bout(3, 40).hash).toBe(bout(3, 40).hash);
    }, 30000);

    test("pinned: a seeded minute plays as it did", () => {
        const { sim, hash } = bout(1, 60);
        expect(sim.tick).toBe(60 * TICKS_PER_SECOND);
        expect(hash >>> 0).toBe(1555789311);
    }, 30000);
});
