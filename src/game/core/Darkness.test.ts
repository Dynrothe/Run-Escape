import { getEnemy } from "../content/enemies";
import { ALL_MAPS, MAP_BY_ID, getMap } from "../content/maps";
import { LANTERN_ID, POWER_UPS, getPowerUp } from "../content/powerups";
import { DarknessDef, EnemyDef, MapDef, emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

// The dark (MapDef.darkness): lights in the sim, weapons only aiming at what's lit, lanterns,
// lights carried and left by enemies, and every other map left as it was

const SPAWN = { x: 1036.5, y: 1036.5 };
const FIRE = { x: 1036.5, y: 1050.5, radius: 3 };

const DARKNESS: DarknessDef = {
    ambient: 0.16,
    playerLight: 5,
    fires: [FIRE],
    lanterns: [{ x: SPAWN.x + 20, y: SPAWN.y - 20 }],
};

// Lumbridge, dark, as a map of its own for these tests
const DARK_MAP: MapDef = { ...getMap("lumbridge"), id: "test_dark", darkness: DARKNESS };
MAP_BY_ID.set(DARK_MAP.id, DARK_MAP);

function openField(): string[] {
    const size = 72;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
        const edge = y === 0 || y === size - 1;
        rows.push(edge ? "#".repeat(size) : "#" + ".".repeat(size - 2) + "#");
    }
    return rows;
}

function createSim(mapId = DARK_MAP.id, seed = 1, characterId = "wizard"): Sim {
    return new Sim({
        grid: makeGrid(openField(), 1000, 1000),
        mapId,
        characterId,
        metaStats: emptyStats(),
        seed,
        spawnX: SPAWN.x,
        spawnY: SPAWN.y,
    });
}

type Hooks = {
    nearestEnemies(x: number, y: number, range: number, count: number): Enemy[];
    rollPowerUpId(): string;
};

function hooks(sim: Sim): Hooks {
    return sim as unknown as Hooks;
}

// A goblin that stays where it's put, hard to kill
function goblin(sim: Sim, x: number, y: number, def: EnemyDef = getEnemy("goblin")): Enemy {
    const enemy = sim.spawnEnemy(def, "normal", { x, y })!;
    enemy.frozen = 100000;
    return enemy;
}

// Steps with the player standing still and kept alive, enemies other than those given kept off
function run(sim: Sim, seconds: number, keep: Enemy[] = []): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
        sim.player.hp = sim.player.maxHp;
        sim.step(0, 0);
        sim.enemies = sim.enemies.filter((e) => keep.includes(e) || e.boss);
    }
}

describe("the dark", () => {
    test("only a dev map is dark, and everywhere else is lit everywhere", () => {
        for (const map of ALL_MAPS) {
            expect(map.darkness === undefined || map.dev === true).toBe(true);
        }
        const sim = createSim("lumbridge");
        expect(sim.darkness).toBeUndefined();
        run(sim, 1);
        expect(sim.lights).toEqual([]);
        expect(sim.isLit(sim.player.x + 40, sim.player.y + 40)).toBe(true);
    });

    test("a lantern never comes up off a dark map", () => {
        expect(getPowerUp(LANTERN_ID).weight).toBe(0);
        // Last, so the rolls on every other map come out as they did
        expect(POWER_UPS[POWER_UPS.length - 1].id).toBe(LANTERN_ID);
        const sim = createSim("lumbridge");
        for (let i = 0; i < 400; i++) {
            expect(hooks(sim).rollPowerUpId()).not.toBe(LANTERN_ID);
        }
    });

    test("a dark map's lantern comes up at its weight", () => {
        MAP_BY_ID.set("test_dark_lanterns", {
            ...DARK_MAP,
            id: "test_dark_lanterns",
            darkness: { ...DARKNESS, lanternWeight: 1000 },
        });
        const sim = createSim("test_dark_lanterns");
        const rolled = Array.from({ length: 20 }, () => hooks(sim).rollPowerUpId());
        expect(rolled.filter((id) => id === LANTERN_ID).length).toBeGreaterThan(15);
    });

    test("the player's light and the fires, where they are, every tick", () => {
        const sim = createSim();
        expect(sim.lights).toEqual([
            expect.objectContaining({ kind: "player", x: SPAWN.x, y: SPAWN.y, radius: 5, hero: 0 }),
            expect.objectContaining({ kind: "fire", x: FIRE.x, y: FIRE.y, radius: 3 }),
        ]);
        for (let i = 0; i < 20; i++) {
            sim.player.hp = sim.player.maxHp;
            sim.step(1, 0);
        }
        const own = sim.lights[0];
        expect(own.x).toBe(sim.player.x);
        expect(own.y).toBe(sim.player.y);
        expect(sim.player.x).toBeGreaterThan(SPAWN.x + 1);
    });

    test("lit: within half a tile of a light's edge", () => {
        const sim = createSim();
        expect(sim.isLit(SPAWN.x + 5.4, SPAWN.y)).toBe(true);
        expect(sim.isLit(SPAWN.x + 5.6, SPAWN.y)).toBe(false);
        expect(sim.isLit(FIRE.x + 3.4, FIRE.y)).toBe(true);
        expect(sim.isLit(FIRE.x, FIRE.y + 3.6)).toBe(false);
    });

    test("weapons only pick what's lit", () => {
        const sim = createSim();
        const near = goblin(sim, SPAWN.x + 3, SPAWN.y);
        const edge = goblin(sim, SPAWN.x - 5.4, SPAWN.y);
        const dark = goblin(sim, SPAWN.x, SPAWN.y - 8);
        // Lit by the fire, though it's well out of the player's light
        const byFire = goblin(sim, FIRE.x + 2, FIRE.y);
        run(sim, 0.1, [near, edge, dark, byFire]);
        const picked = hooks(sim).nearestEnemies(sim.player.x, sim.player.y, 20, 10);
        expect(picked).toEqual([near, edge, byFire]);
        // Off a dark map, everything in range
        const lit = createSim("lumbridge");
        const all = [
            goblin(lit, SPAWN.x + 3, SPAWN.y),
            goblin(lit, SPAWN.x, SPAWN.y - 8),
            goblin(lit, FIRE.x + 2, FIRE.y),
        ];
        run(lit, 0.1, all);
        expect(hooks(lit).nearestEnemies(lit.player.x, lit.player.y, 20, 10)).toEqual(all);
    });

    test("a wizard's spells go for the lit and leave the dark alone", () => {
        const sim = createSim();
        const near = goblin(sim, SPAWN.x + 3, SPAWN.y);
        const dark = goblin(sim, SPAWN.x - 9, SPAWN.y);
        near.hp = near.maxHp = 1e6;
        dark.hp = dark.maxHp = 1e6;
        run(sim, 6, [near, dark]);
        expect(near.hp).toBeLessThan(near.maxHp);
        expect(dark.hp).toBe(dark.maxHp);
    });

    test("a shot at something lit hits what it meets in the dark on the way", () => {
        const sim = createSim();
        // In the fire's light, with an unlit one in the dark between it and the player
        const far = goblin(sim, FIRE.x, FIRE.y - 1);
        const between = goblin(sim, SPAWN.x, SPAWN.y + 8);
        far.hp = far.maxHp = 1e6;
        between.hp = between.maxHp = 1e6;
        expect(sim.isEnemyLit(far)).toBe(true);
        expect(sim.isEnemyLit(between)).toBe(false);
        run(sim, 6, [far, between]);
        expect(between.hp).toBeLessThan(between.maxHp);
    });

    test("a lantern: 4 tiles more for 30 seconds, shrinking back over the last 5", () => {
        const sim = createSim();
        const lantern = sim.pickups.find((p) => p.powerUp === LANTERN_ID)!;
        expect(lantern).toBeDefined();
        sim.usePowerUp(getPowerUp(LANTERN_ID));
        run(sim, 0.1);
        expect(sim.lights[0].radius).toBe(9);
        run(sim, 24.8);
        expect(sim.lights[0].radius).toBe(9);
        run(sim, 2.6);
        expect(sim.lights[0].radius).toBeGreaterThan(5.5);
        expect(sim.lights[0].radius).toBeLessThan(8.5);
        run(sim, 3);
        expect(sim.lights[0].radius).toBe(5);
        expect(sim.powerUps).toEqual([]);
    });

    test("an enemy's own light, and the one it leaves where it dies", () => {
        const sim = createSim();
        const leech: EnemyDef = {
            ...getEnemy("goblin"),
            light: { radius: 2.5, left: { radius: 4, seconds: 20 } },
        };
        const carrier = goblin(sim, SPAWN.x + 15, SPAWN.y, leech);
        const beside = goblin(sim, SPAWN.x + 16.5, SPAWN.y);
        beside.hp = beside.maxHp = 1e6;
        run(sim, 0.1, [carrier, beside]);
        expect(sim.lights).toContainEqual(
            expect.objectContaining({ kind: "enemy", x: carrier.x, radius: 2.5 }),
        );
        expect(sim.isEnemyLit(beside)).toBe(true);
        carrier.hp = 1;
        sim.damageEnemy(carrier, 10, 0, sim.player.x, sim.player.y);
        expect(carrier.dead).toBe(true);
        run(sim, 1, [beside]);
        expect(sim.lights).toContainEqual(
            expect.objectContaining({ kind: "left", x: carrier.x, radius: 4 }),
        );
        expect(sim.isEnemyLit(beside)).toBe(true);
        run(sim, 20, [beside]);
        expect(sim.lights.some((light) => light.kind === "left")).toBe(false);
        expect(sim.isEnemyLit(beside)).toBe(false);
    });

    test("co-op: a light for each player, in the party's order", () => {
        const sim = new Sim({
            grid: makeGrid(openField(), 1000, 1000),
            mapId: DARK_MAP.id,
            characterId: "",
            metaStats: emptyStats(),
            seed: 2,
            spawnX: SPAWN.x,
            spawnY: SPAWN.y,
            party: ["wizard", "ranger"].map((characterId) => ({
                name: characterId,
                characterId,
                metaStats: emptyStats(),
            })),
        });
        const players = sim.lights.filter((light) => light.kind === "player");
        expect(players.map((light) => light.hero)).toEqual([0, 1]);
        expect(players[1].x).toBe(sim.heroes[1].player.x);
    });

    test("the same seed plays the same in the dark", () => {
        const play = () => {
            const sim = createSim(DARK_MAP.id, 7, "ranger");
            const seen: number[] = [];
            for (let i = 0; i < 90 * TICKS_PER_SECOND && !sim.runOver; i++) {
                if (sim.pendingLevelUps > 0) {
                    sim.choose(0);
                }
                if (sim.chests.length > 0) {
                    sim.resolveChest("take");
                }
                const angle = (sim.tick / TICKS_PER_SECOND) * 0.4;
                sim.player.hp = sim.player.maxHp;
                sim.step(Math.cos(angle), Math.sin(angle));
                if (sim.tick % 50 === 0) {
                    seen.push(sim.kills, sim.enemies.length, sim.player.x, sim.lights.length);
                }
            }
            return seen;
        };
        const first = play();
        expect(first.some((value, i) => i % 4 === 0 && value > 0)).toBe(true);
        expect(play()).toEqual(first);
    }, 30000);
});
