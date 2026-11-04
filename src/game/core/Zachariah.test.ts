import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import { BossAttackDef, emptyStats } from "../content/types";
import {
    OWLS_COURT_FEATURES,
    ZACHARIAH_HITPOINTS,
    ZACHARIAH_START_DISTANCE,
    ZACHARIAH_STRIKE_LEVEL,
    ZACHARIAH_STRIKE_REACH,
} from "../content/zachariah";
import { getCollisionFlags } from "../scaperune/collision";
import { MAP_SQUARE_SIZE, createTileGrid, writeLocs, writeTerrain } from "../scaperune/format";
import {
    OWLS_COURT,
    OWLS_COURT_RECIPE,
    SOLID_LOCS,
    WALK_THROUGH,
    buildOwlsCourt,
} from "../scaperune/maps/owlsCourt";
import { BuildContext } from "../scaperune/recipe";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { behindPillar } from "./arena";
import { Enemy } from "./entities";
import { createSave } from "./save";
import { SOLID_FLAGS } from "./world/ArenaGrid";
import { makeGrid } from "./world/testGrid";

// Justiciar Zachariah in the Owl's Court: the map, his fight, and each of his attacks landing and
// being dodged as the design says (docs/design/justiciar-zachariah.md). On the real court, built
// without the cache as its own test builds it, so the pillars, the rims and the bridge are where
// they are in the game.

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

// The court's collision as the sim's grid: the arena square, at its world tiles
const COURT_ROWS = (() => {
    const { grid } = buildOwlsCourt(context).map;
    const flags = getCollisionFlags(grid, context.locs);
    const size = OWLS_COURT_RECIPE.squaresX * MAP_SQUARE_SIZE;
    const base = OWLS_COURT_RECIPE.margin * MAP_SQUARE_SIZE;
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

const O = OWLS_COURT.origin;
// A tile's middle, in world tiles, from the court's own
const at = (x: number, y: number) => ({ x: O.x + x + 0.5, y: O.y + y + 0.5 });

function createSim(seed = 1, party?: number): Sim {
    const map = getMap("zachariah");
    return new Sim({
        grid: makeGrid(COURT_ROWS, O.x, O.y),
        mapId: "zachariah",
        characterId: "saradominist",
        metaStats: emptyStats(),
        seed,
        spawnX: map.spawn.x,
        spawnY: map.spawn.y,
        party:
            party === undefined
                ? undefined
                : Array.from({ length: party }, (_, i) => ({
                      name: "p" + i,
                      characterId: "saradominist",
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

function zachariah() {
    return getEnemy("justiciar_zachariah");
}

function attackNamed(name: string): BossAttackDef {
    return zachariah().boss!.attacks.find((a) => a.name === name)!;
}

// Through his descent, with nothing of his going, nothing of theirs hitting him, and nothing
// on a timer: each test starts the attack it's about itself
function startFight(sim: Sim, party = false): Enemy {
    run(sim, zachariah().boss!.intro!.seconds + 0.1);
    const boss = sim.enemies.find((e) => e.finalBoss)!;
    quiet(sim, boss);
    if (!party) {
        sim.weapons.length = 0;
    } else {
        for (const hero of sim.heroes) {
            hero.weapons.length = 0;
        }
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
    sim.bullets.clear();
    sim["emitters"] = [];
    sim.enemyProjectiles = [];
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

describe("the map", () => {
    test("is one fight, after Phosani's, with the Saradominist and their strike at its level", () => {
        const map = getMap("zachariah");
        expect(map.fight).toEqual({
            requires: "phosani",
            character: "saradominist",
            weaponLevel: ZACHARIAH_STRIKE_LEVEL,
            strikeReach: ZACHARIAH_STRIKE_REACH,
        });
        expect(map.waves).toEqual([]);
        expect(map.events).toEqual([
            { at: 0, kind: "finalBoss", enemyId: "justiciar_zachariah", hp: ZACHARIAH_HITPOINTS },
        ]);
        expect(map.music).toBe("Blade of Forgotten Justice");
        expect(map.victoryText).toContain("Justiciar Zachariah");
        expect(map.spawn).toEqual(at(OWLS_COURT.start.x, OWLS_COURT.start.y));
        const character = getCharacter("saradominist");
        expect(character.only).toBe("zachariah");
        expect(character.unlock).toBeUndefined();
        expect(createSave().unlockedCharacters).not.toContain("saradominist");
        const sim = createSim();
        expect(sim.weapons.map((w) => [w.def.id, w.level])).toEqual([
            ["saradomin_strike", ZACHARIAH_STRIKE_LEVEL],
        ]);
        expect(sim.player.maxHp).toBe(30);
    });

    test("its features are the court's, in world tiles: a bolt row for every crossbowman", () => {
        const f = OWLS_COURT_FEATURES;
        expect(f.checker).toEqual({ ...OWLS_COURT.checker, x0: O.x + 18, y0: O.y + 20 });
        expect(f.pillars).toHaveLength(4);
        expect(f.bolts).toHaveLength(OWLS_COURT.bolts.length * 3);
        for (const row of f.bolts!) {
            expect(row.statues).toHaveLength(1);
            expect(row.statues[0].y).toBe(row.y);
            expect(row.statues[0].x).toBe(row.fromX - row.dir);
        }
        expect(f.knights).toHaveLength(2);
        expect(f.fires).toHaveLength(4);
        expect(f.rise).toEqual(at(OWLS_COURT.rise.x, OWLS_COURT.rise.y));
    });
});

describe("his fight", () => {
    test("he comes down at the head of the bridge, the player held at its foot", () => {
        const sim = createSim();
        const intro = zachariah().boss!.intro!;
        expect(intro.distance).toBe(ZACHARIAH_START_DISTANCE);
        run(sim, intro.riseAt + 0.1);
        const boss = sim.enemies.find((e) => e.finalBoss)!;
        expect([boss.x, boss.y]).toEqual([
            OWLS_COURT_FEATURES.rise!.x,
            OWLS_COURT_FEATURES.rise!.y,
        ]);
        expect(boss.attackSeq).toBe(intro.seq);
        expect(sim.player.x).toBeCloseTo(boss.x);
        expect(boss.y - sim.player.y).toBeCloseTo(ZACHARIAH_START_DISTANCE);
        const { x, y } = sim.player;
        run(sim, 1, 0, 1);
        expect([sim.player.x, sim.player.y]).toEqual([x, y]);
        // His look is his own: gold and blue, no edge round the court and no dim
        expect(zachariah().boss!.look).toMatchObject({ edge: null, vignette: null });
    });

    test("three phases on his hitpoints, each with its line, a kneel between", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const phase = boss.bossState!.phase!;
        expect(phase.stage).toBe("hp");
        const phases = zachariah().boss!.phases!;
        expect(phases.phases.map((p) => p.status)).toEqual([
            "The trial begins",
            "The Sepulchre wakes",
            "The verdict",
        ]);
        boss.hp = Math.round(boss.maxHp * 0.7) + 1;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        expect(phase.index).toBe(1);
        expect(boss.attackSeq).toBe(phases.threshold!.seq);
        expect(sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0)).toBe(0);
        run(sim, phases.threshold!.seconds + 0.1);
        // Up again and straight into the second phase's opener
        expect(boss.bossState!.windup?.attack.name).toBe("Lightning");
        boss.hp = Math.round(boss.maxHp * 0.35) + 1;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        expect(phase.index).toBe(2);
        boss.hp = 1;
        run(sim, phases.threshold!.seconds + 0.1);
        sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0);
        expect(boss.dead).toBe(true);
    });

    test("each phase wakes more of the court: the bolts from the start, the fire from the second", () => {
        const sim = createSim();
        run(sim, zachariah().boss!.intro!.seconds + 0.1);
        const boss = sim.enemies.find((e) => e.finalBoss)!;
        boss.attackCooldown = 1e9;
        run(sim, 3);
        expect(sim.bulletEmitters.some((e) => e.attack.name === "Crossbow rows")).toBe(true);
        expect(boss.bossState!.cycles).toBeUndefined();
        boss.hp = Math.round(boss.maxHp * 0.7);
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        run(sim, 0.1);
        expect(boss.bossState!.cycles?.map((c) => c.attack.name)).toEqual(["Bridge fire"]);
    });

    test("Saradomin Strike only reaches him from close by", () => {
        for (const [distance, hits] of [
            [ZACHARIAH_STRIKE_REACH + 1, false],
            [ZACHARIAH_STRIKE_REACH - 2, true],
        ] as const) {
            const sim = createSim();
            run(sim, zachariah().boss!.intro!.seconds + 0.1);
            const boss = sim.enemies.find((e) => e.finalBoss)!;
            quiet(sim, boss);
            boss.speed = 0;
            placeBoss(boss, at(31, 25));
            place(sim, { x: boss.x, y: boss.y + distance });
            const before = boss.hp;
            run(sim, 7);
            expect([distance, boss.hp < before]).toEqual([distance, hits]);
        }
    });

    test("too far off, on the terrace, and he leaps to them", () => {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, at(31, 44));
        place(sim, at(31, 11));
        run(sim, 0.1);
        expect(boss.bossState!.leap).toBeDefined();
        run(sim, 2);
        expect(Math.hypot(boss.x - sim.player.x, boss.y - sim.player.y)).toBeLessThan(8);
    });
});

describe("his attacks, each landing and each dodged", () => {
    function fight(): { sim: Sim; boss: Enemy } {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, at(31, 33));
        return { sim, boss };
    }

    test("the lunge: his strip, and a step off it", () => {
        for (const [dx, hit] of [
            [0, true],
            [1.9, false],
        ] as const) {
            const { sim, boss } = fight();
            place(sim, at(31, 29));
            use(sim, boss, "Lunge");
            place(sim, { x: sim.player.x + dx, y: sim.player.y });
            const before = hp(sim);
            run(sim, 1.15);
            expect([dx, hp(sim) < before]).toEqual([dx, hit]);
            expect(hp(sim)).toBeGreaterThan(before - 15);
        }
    });

    test("the shock wave: dragged in, bound, the flurry, half their hitpoints in all", () => {
        const { sim, boss } = fight();
        place(sim, at(31, 25));
        use(sim, boss, "Shock wave");
        const before = hp(sim);
        run(sim, 1.3);
        while (hp(sim) === before) {
            run(sim, 0.02);
        }
        run(sim, 0.35);
        expect(Math.hypot(sim.player.x - boss.x, sim.player.y - boss.y)).toBeLessThan(2.6);
        expect(sim.player.frozen).toBeGreaterThan(0);
        run(sim, 1.6);
        const taken = before - hp(sim);
        expect(taken).toBeGreaterThanOrEqual(12);
        expect(taken).toBeLessThanOrEqual(17);
        expect(sim.damageByAttack["Flurry"]).toBeGreaterThan(0);
    });

    test("the shock wave: a sidestep and it's gone by", () => {
        const { sim, boss } = fight();
        place(sim, at(31, 25));
        use(sim, boss, "Shock wave");
        run(sim, 0.5);
        run(sim, 0.4, 1, 0);
        const before = hp(sim);
        run(sim, 2.5);
        expect(hp(sim)).toBe(before);
        expect(sim.player.frozen).toBe(0);
    });

    test("the ice: a square on their tile, frozen; out of it in half a second", () => {
        for (const [move, hit] of [
            [0, true],
            [1, false],
        ] as const) {
            const { sim, boss } = fight();
            place(sim, at(31, 27));
            use(sim, boss, "Ice barrage");
            run(sim, 0.55, move, 0);
            const before = hp(sim);
            run(sim, 0.8);
            expect([move, hp(sim) < before, sim.player.frozen > 0]).toEqual([move, hit, hit]);
        }
    });

    test("the lightning: one colour of the floor, then the other, and always a cell to step to", () => {
        const { sim, boss } = fight();
        place(sim, at(22.5, 22.5));
        use(sim, boss, "Lightning");
        const cells = sim.hazards.length;
        expect(cells).toBe(81);
        const first = sim.hazards.filter((h) => h.startTick === sim.tick);
        // On a first-colour cell's middle: half a second takes them into the next cell over
        const cell = first.find(
            (h) => Math.abs(h.x - sim.player.x) < 3 && Math.abs(h.y - sim.player.y) < 3,
        )!;
        place(sim, { x: cell.x, y: cell.y });
        const before = hp(sim);
        run(sim, 0.5, 1, 0);
        run(sim, 1.15);
        expect(hp(sim)).toBe(before);
        // And back onto the struck colour before the other lands
        run(sim, 0.5, -1, 0);
        run(sim, 1.2);
        expect(hp(sim)).toBe(before);
    });

    test("the knight's sword: out from a knight at where they stood and back, hitting each way", () => {
        const { sim, boss } = fight();
        place(sim, at(31, 21.5));
        use(sim, boss, "Knight's sword");
        const knight = boss.bossState!.windup!.from![0];
        expect(OWLS_COURT_FEATURES.knights).toContainEqual(knight);
        const before = hp(sim);
        run(sim, 1.4 + 2);
        const once = hp(sim);
        expect(once).toBeLessThan(before);
        run(sim, 4);
        expect(hp(sim)).toBeLessThan(once);
        expect(sim.enemyProjectiles).toEqual([]);
    });

    test("the knight's sword: off its line, and it's gone by both ways", () => {
        const { sim, boss } = fight();
        place(sim, at(31, 21.5));
        use(sim, boss, "Knight's sword");
        run(sim, 0.9, 0, 1);
        const before = hp(sim);
        run(sim, 7);
        expect(hp(sim)).toBe(before);
    });

    test("the gaze: from the middle, all it sees; behind a pillar, nothing", () => {
        for (const hide of [false, true]) {
            const { sim, boss } = fight();
            place(sim, at(31, 27));
            use(sim, boss, "The Owl's gaze");
            // He's leapt to the court's middle
            const pillars = OWLS_COURT_FEATURES.pillars!;
            const spot = hide ? at(24, 23) : at(31, 27);
            place(sim, spot);
            run(sim, 0.1);
            const middle = {
                x: boss.bossState!.leap?.toX ?? boss.x,
                y: boss.bossState!.leap?.toY ?? boss.y,
            };
            expect(behindPillar(pillars, middle.x, middle.y, spot.x, spot.y)).toBe(hide);
            const before = hp(sim);
            run(sim, 4.5);
            expect([hide, hp(sim) < before]).toEqual([hide, !hide]);
        }
    });

    test("the bolts: down their rows, stopped by the pillars", () => {
        for (const [spot, hit] of [
            [at(30, 23), true], // in a lane, in the open
            [at(30, 24), false], // the next row, behind the west pillar from the west statues
            [at(30, 27), false], // a quiet lane
        ] as const) {
            const { sim, boss } = fight();
            // The first set is lanes 0 and 3: the west statues' rows 23 to 25, which a pillar's in
            place(sim, spot);
            sim["startPattern"](
                boss,
                attackNamed("Crossbow rows"),
                boss.bossState!.windup ?? {
                    attack: attackNamed("Crossbow rows"),
                    startTick: sim.tick,
                    landTick: sim.tick,
                    targets: [],
                    dirX: 0,
                    dirY: -1,
                },
                false,
            );
            const before = hp(sim);
            run(sim, 4.5);
            expect([spot.x - O.x, spot.y - O.y, hp(sim) < before]).toEqual([
                spot.x - O.x,
                spot.y - O.y,
                hit,
            ]);
        }
    });

    test("the bridge's fire: it burns on the bridge, and there's a beat when every row's out", () => {
        const { sim, boss } = fight();
        boss.hp = Math.round(boss.maxHp * 0.7);
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        run(sim, 0.1);
        quiet(sim, boss);
        boss.bossState!.phase!.pauseEnd = undefined;
        const cycle = boss.bossState!.cycles![0];
        const def = cycle.attack.cycle!;
        // Every row's out together, from the last row's burn to the first's next, for longer than
        // walking the bridge takes
        const clear = def.period - def.burn - def.stagger * 3;
        expect(clear).toBeGreaterThan(1.2);
        place(sim, at(31, 17));
        const before = hp(sim);
        run(sim, def.period);
        expect(hp(sim)).toBeLessThan(before);
    });
});

describe("in co-op", () => {
    test("the wave drags only whoever it reaches, and the gaze spares whoever hides", () => {
        const sim = createSim(1, 2);
        const boss = startFight(sim, true);
        placeBoss(boss, at(31, 33));
        place(sim, at(31, 27), 0);
        place(sim, at(36, 30), 1);
        sim["use"](sim.heroes[0]);
        use(sim, boss, "Shock wave");
        run(sim, 2.5);
        expect(sim.heroes[0].player.hp).toBeLessThan(sim.heroes[0].player.maxHp);
        expect(sim.heroes[1].player.hp).toBe(sim.heroes[1].player.maxHp);
        run(sim, 3);
        quiet(sim, boss);
        for (const hero of sim.heroes) {
            hero.player.hp = hero.player.maxHp;
            hero.player.frozen = 0;
        }
        place(sim, at(24, 23), 0);
        place(sim, at(31, 27), 1);
        use(sim, boss, "The Owl's gaze");
        run(sim, 4.5);
        expect(sim.heroes[0].player.hp).toBe(sim.heroes[0].player.maxHp);
        expect(sim.heroes[1].player.hp).toBeLessThan(sim.heroes[1].player.maxHp);
    });
});
