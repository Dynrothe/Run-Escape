import { getEnemy } from "../content/enemies";
import { MAP_BY_ID, getMap } from "../content/maps";
import { LightingDef, MapDef, emptyStats } from "../content/types";
import { Sim } from "../core/Sim";
import { syncHash } from "../core/lockstep";
import { makeGrid } from "../core/world/testGrid";
import { LightBudget } from "./LightBudget";
import { LightTarget, SceneLights } from "./SceneLights";

// The drawn side of lights (MapDef.lighting): what SceneLights gathers from the sim and the map,
// and that drawing them never changes the sim

const SPAWN = { x: 1036.5, y: 1036.5 };
const LIGHTING: LightingDef = {
    ambient: 0.5,
    ambientColor: 0x8080ff,
    locs: { 43475: { radius: 3, color: 0x00ff00 } },
    lights: [{ x: SPAWN.x - 6, y: SPAWN.y, radius: 4, color: 0x0000ff }],
};
const MAP: MapDef = { ...getMap("lumbridge"), id: "test_scene_lights", lighting: LIGHTING };
MAP_BY_ID.set(MAP.id, MAP);

function openField(): string[] {
    const size = 72;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
        const edge = y === 0 || y === size - 1;
        rows.push(edge ? "#".repeat(size) : "#" + ".".repeat(size - 2) + "#");
    }
    return rows;
}

type Drawn = { x: number; y: number; radius: number; r: number; g: number; b: number };

class Target implements LightTarget {
    ambient: number[] = [];
    lights: Drawn[] = [];
    beginLights(): void {
        this.lights = [];
    }
    endLights(): void {}
    setAmbient(level: number, color: number): void {
        this.ambient = [level, color];
    }
    addLight(x: number, y: number, radius: number, r: number, g: number, b: number): void {
        this.lights.push({ x, y, radius, r, g, b });
    }
}

describe("SceneLights", () => {
    test("scenery, the map's own and a fire spell, each its colour; the sim untouched", () => {
        const sim = new Sim({
            grid: makeGrid(openField(), 1000, 1000),
            mapId: MAP.id,
            characterId: "wizard",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: SPAWN.x,
            spawnY: SPAWN.y,
        });
        const goblin = sim.spawnEnemy(getEnemy("goblin"), "normal", {
            x: SPAWN.x + 6,
            y: SPAWN.y,
        })!;
        goblin.frozen = 1e6;
        goblin.hp = goblin.maxHp = 1e6;
        for (let i = 0; i < 400 && sim.projectiles.length === 0; i++) {
            sim.player.hp = sim.player.maxHp;
            sim.step(0, 0);
            sim.enemies = sim.enemies.filter((e) => e === goblin);
        }
        expect(sim.projectiles.map((p) => p.spotAnim)).toContain(100);

        const lights = new SceneLights(new LightBudget(8));
        const target = new Target();
        const glowLocs = new Float32Array([43475, SPAWN.x + 2, SPAWN.y + 9]);
        const before = syncHash(sim);
        // Long enough for everything to have faded in
        for (let i = 0; i < 20; i++) {
            const update = () =>
                lights.update(
                    target,
                    sim,
                    LIGHTING,
                    0,
                    0,
                    undefined,
                    SPAWN.x,
                    SPAWN.y,
                    0.05,
                    glowLocs,
                );
            update();
        }
        expect(syncHash(sim)).toBe(before);
        expect(target.ambient).toEqual([0.5, 0x8080ff]);
        const at = (x: number, y: number) =>
            target.lights.find((l) => Math.abs(l.x - x) < 1.5 && Math.abs(l.y - y) < 1.5);
        // The loc's green, the map's blue, the spell's orange
        expect(at(SPAWN.x + 2, SPAWN.y + 9)).toEqual(expect.objectContaining({ r: 0, g: 1, b: 0 }));
        expect(at(SPAWN.x - 6, SPAWN.y)).toEqual(expect.objectContaining({ r: 0, g: 0, b: 1 }));
        const spell = sim.projectiles.find((p) => p.spotAnim === 100)!;
        const glow = at(spell.x, spell.y)!;
        expect(glow).toBeDefined();
        expect(glow.r).toBeGreaterThan(glow.b);
    });

    test("bosses' windups, marks and exposed cores, and a floor's lava, each where it is", () => {
        const look = (color: number) => ({ radius: 2, color });
        const boss = {
            uid: 7,
            x: 10,
            y: 10,
            prevX: 10,
            prevY: 10,
            dead: false,
            boss: true,
            def: { boss: { look: { exposedLight: look(0xffff00) } } },
            bossState: {
                windup: {
                    attack: { light: look(0xff0000) },
                    startTick: 0,
                    landTick: 10,
                    targets: [{ x: 4, y: 4 }],
                },
            },
        };
        // EFFECT_BURN on one tile, nothing elsewhere
        const floor = {
            x0: 0,
            y0: 0,
            sizeX: 20,
            sizeY: 20,
            effectAt: (x: number, y: number) => (x === 12 && y === 3 ? 1 : 0),
        };
        const sim = {
            tick: 10,
            lights: [],
            projectiles: [],
            enemyProjectiles: [],
            effects: [],
            enemies: [boss],
            bullets: { count: 0 },
            hazards: [
                {
                    uid: 3,
                    x: 15,
                    y: 15,
                    endTick: 99,
                    attack: { ground: { light: look(0x0000ff) } },
                },
            ],
            floor,
            ambientAt: () => 1,
            isExposed: () => true,
        } as unknown as Sim;
        const lights = new SceneLights(new LightBudget(8));
        const target = new Target();
        for (let i = 0; i < 10; i++) {
            lights.update(target, sim, {}, 0, 0, undefined, 10, 10, 0.05, undefined);
        }
        const near = (x: number, y: number) =>
            target.lights.find((l) => Math.abs(l.x - x) < 0.6 && Math.abs(l.y - y) < 0.6);
        expect(near(4, 4)).toEqual(expect.objectContaining({ r: 1, g: 0, b: 0 }));
        expect(near(10, 10)).toEqual(expect.objectContaining({ r: 1, g: 1, b: 0 }));
        expect(near(15, 15)).toEqual(expect.objectContaining({ r: 0, g: 0, b: 1 }));
        // The lava tile's orange, flickering
        const lava = near(12.5, 3.5)!;
        expect(lava.r).toBeGreaterThan(lava.b);
    });
});
