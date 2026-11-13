import { FALLEN_EMPIRE } from "../content/acts";
import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import { LANTERN_ID } from "../content/powerups";
import {
    ABYSSAL_LEECH_ID,
    FALSE_LANTERN_ID,
    LEECHED,
    LEVIATHAN_ID,
    LIGHT_LEECH_ID,
    PATHFINDER_ID,
    SCAR_LIGHTING,
    SCAR_PLAYER_LIGHT,
    SNUFFED,
} from "../content/scar";
import { TROPHIES } from "../content/trophies";
import { emptyStats } from "../content/types";
import { SCAR_FIRES, SCAR_RECIPE, SCAR_START, scarWorld } from "../scaperune/maps/scar";
import { HeroOptions, Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { usePortableMath } from "./fmath";
import { syncHash } from "./lockstep";
import { makeGrid } from "./world/testGrid";

// The Scar in a run: the dark (MapDef.lighting), its fires and lanterns, what the leeches and the
// bosses do to a player's light, the Leviathan's debris and his pathfinder, and the
// Lantern-bearer. The map's own grid needs the cache, so these play on an open field laid where
// the Scar is (its fires are in world tiles).

const FIELD = 128;
// The field's south-west corner: the Scar's grid tile 64, 64 (a tile's corner, not its middle)
const BASE = (({ x, y }) => ({ x: x - 0.5, y: y - 0.5 }))(scarWorld({ x: 64, y: 64 }));

function field(): string[] {
    const rows: string[] = [];
    for (let row = 0; row < FIELD; row++) {
        const y = FIELD - 1 - row;
        let line = "";
        for (let x = 0; x < FIELD; x++) {
            line += x < 3 || y < 3 || x >= FIELD - 3 || y >= FIELD - 3 ? "^" : ".";
        }
        rows.push(line);
    }
    return rows;
}

function hero(characterId: string): HeroOptions {
    return { name: characterId, characterId, metaStats: emptyStats() };
}

// Away from every fire and from the lanterns by the start
const START = scarWorld({ x: SCAR_START.x, y: SCAR_START.y - 25 });

function createSim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), BASE.x, BASE.y),
        mapId: "scar",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: START.x,
        spawnY: START.y,
        ...options,
    });
}

function steps(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
    for (let i = 0; i < Math.round(seconds * TICKS_PER_SECOND); i++) {
        sim.step(moveX, moveY);
    }
}

// Nobody hurt or killing, so only the dark moves things
function quiet(sim: Sim): void {
    for (const h of sim.heroes) {
        h.weapons = [];
        h.player.maxHp = h.player.hp = 100000;
    }
}

function ownLight(sim: Sim, index = 0): number {
    return sim.lights.find((l) => l.kind === "player" && l.id === index)?.radius ?? 0;
}

function spawn(sim: Sim, id: string, dx: number, dy: number): Enemy {
    return sim.spawnEnemy(getEnemy(id), "normal", {
        x: sim.player.x + dx,
        y: sim.player.y + dy,
    })!;
}

describe("The Scar", () => {
    afterEach(() => usePortableMath(false));

    test("is an Act II map in the dark: a light round you, its fires, lanterns by the start", () => {
        const map = getMap("scar");
        expect(map.lighting).toBe(SCAR_LIGHTING);
        expect(map.lighting!.litTargetsOnly).toBe(true);
        expect(map.act?.requires).toBe("inferno");
        expect(FALLEN_EMPIRE.slots.find((slot) => slot.name === "The Scar")?.mapId).toBe("scar");
        expect(map.lighting!.lights).toHaveLength(SCAR_FIRES.length);
        expect(map.music).toBe("Scar Tissue");
        expect(map.bossMusic).toBe("Colossus of the Deep");
        // His pool's in his square
        const box = map.bossArena!;
        const rise = map.features!.rise!;
        expect(rise.x).toBeGreaterThan(box.baseX);
        expect(rise.x).toBeLessThan(box.baseX + box.size);
        expect(rise.y).toBeGreaterThan(box.baseY);
        expect(rise.y).toBeLessThan(box.baseY + box.size);
        const sim = createSim();
        expect(ownLight(sim)).toBe(SCAR_PLAYER_LIGHT);
        expect(sim.lights.filter((l) => l.kind === "map")).toHaveLength(SCAR_FIRES.length);
        const lanterns = sim.pickups.filter((p) => p.powerUp === LANTERN_ID);
        expect(lanterns).toHaveLength(map.lighting!.lanterns!.length);
        expect(SCAR_RECIPE.id).toBe("scar");
    });

    test("weapons only see what's lit: by you, by a fire, by a light leech", () => {
        const sim = createSim();
        quiet(sim);
        const near = spawn(sim, "scarred_imp", 3, 0);
        const far = spawn(sim, "scarred_imp", 12, 0);
        const leech = spawn(sim, LIGHT_LEECH_ID, -12, 0);
        sim.step(0, 0);
        expect(sim.isEnemyLit(near)).toBe(true);
        expect(sim.isEnemyLit(far)).toBe(false);
        // It carries its own
        expect(sim.isEnemyLit(leech)).toBe(true);
        const fire = sim.lights.find((l) => l.kind === "map")!;
        expect(sim.isLit(fire.x + 2, fire.y)).toBe(true);
    });

    test("a light leech flees you, and its light stays where it dies", () => {
        const leech = getEnemy(LIGHT_LEECH_ID);
        expect(leech.flees).toBeDefined();
        expect(leech.light?.left?.seconds).toBe(20);
        const sim = createSim();
        quiet(sim);
        const at = spawn(sim, LIGHT_LEECH_ID, 6, 0);
        sim.step(0, 0);
        sim.damageEnemy(at, 1e6, 0, at.x, at.y);
        steps(sim, 1);
        const left = sim.lights.find((l) => l.kind === "left");
        expect(left).toBeDefined();
        steps(sim, 21);
        expect(sim.lights.some((l) => l.kind === "left")).toBe(false);
    });

    test("an Abyssal leech's hits dim your light a tile at a time, up to three", () => {
        expect(getEnemy(ABYSSAL_LEECH_ID).touches).toBe(LEECHED);
        const sim = createSim();
        quiet(sim);
        for (let i = 0; i < 5; i++) {
            sim.applyPlayerEffect(LEECHED);
        }
        sim.step(0, 0);
        expect(ownLight(sim)).toBe(SCAR_PLAYER_LIGHT - 3);
        expect(sim.debuffs.find((d) => d.id === "leeched")?.stacks).toBe(3);
        steps(sim, 9);
        expect(ownLight(sim)).toBe(SCAR_PLAYER_LIGHT);
    });

    test("the black demon's roar snuffs your light to 2 tiles, and a lantern can't beat it", () => {
        const demon = getEnemy("scarred_black_demon");
        expect(demon.boss!.attacks.some((a) => a.effect === SNUFFED)).toBe(true);
        const sim = createSim();
        quiet(sim);
        sim.applyPlayerEffect(SNUFFED);
        sim.step(0, 0);
        expect(ownLight(sim)).toBe(2);
        steps(sim, 7);
        expect(ownLight(sim)).toBe(SCAR_PLAYER_LIGHT);
    });

    test("Persten's false lanterns burst as they're walked into", () => {
        const persten = getEnemy("persten");
        const summon = persten.boss!.attacks.find((a) => a.summon)!;
        expect(summon.summon!.enemyId).toBe(FALSE_LANTERN_ID);
        const sim = createSim();
        for (const h of sim.heroes) {
            h.weapons = [];
        }
        const hp = sim.player.hp;
        const lantern = spawn(sim, FALSE_LANTERN_ID, 0.3, 0);
        steps(sim, 0.5);
        expect(lantern.dead || !sim.enemies.includes(lantern)).toBe(true);
        expect(sim.player.hp).toBeLessThan(hp);
    });

    test("the Leviathan's debris breaks his orbs, and his pathfinder's the only light", () => {
        const leviathan = getEnemy(LEVIATHAN_ID);
        expect(leviathan.stationary).toBe(true);
        const debris = leviathan.boss!.attacks.find((a) => a.debris)!;
        expect(debris.weight).toBe(0);
        expect(
            leviathan.boss!.attacks.filter((a) => a.follow?.attack === debris.name),
        ).toHaveLength(3);
        const sim = createSim();
        quiet(sim);
        sim.startIntro(leviathan, "finalBoss", 28000);
        steps(sim, 30);
        expect(sim.debris.length).toBeGreaterThan(0);
        const boss = sim.enemies.find((e) => e.def.id === LEVIATHAN_ID)!;
        // His last third: the pathfinder comes, and it's all there is
        boss.hp = boss.maxHp * 0.3;
        steps(sim, 2);
        const pathfinder = sim.enemies.find((e) => e.def.id === PATHFINDER_ID);
        expect(pathfinder).toBeDefined();
        expect(sim.lights).toHaveLength(1);
        expect(sim.lights[0].enemy).toBe(pathfinder);
        // Round his pool
        const from = { x: pathfinder!.x, y: pathfinder!.y };
        steps(sim, 2);
        expect(Math.hypot(pathfinder!.x - from.x, pathfinder!.y - from.y)).toBeGreaterThan(1);
        expect(Math.hypot(pathfinder!.x - boss.x, pathfinder!.y - boss.y)).toBeCloseTo(
            getEnemy(PATHFINDER_ID).circles!.radius,
            3,
        );
    });

    test("plays the same from the same seed, and hashes alike", () => {
        usePortableMath(true);
        const run = () => {
            const sim = createSim({ seed: 7 });
            steps(sim, 45, 1, 0.3);
            return syncHash(sim);
        };
        expect(run()).toBe(run());
    });
});

describe("The Scar's adventurer", () => {
    test("the Lantern-bearer joins for beating the Scar: twice the light, and a glow that hurts", () => {
        const bearer = getCharacter("lantern_bearer");
        expect(bearer.unlock).toEqual({ kind: "beatMap", mapId: "scar" });
        expect(bearer.startingWeapon).toBe("fire_spells");
        const trait = bearer.trait!;
        expect(trait.kind).toBe("lantern");
        const sim = createSim({ party: [hero("lantern_bearer")] });
        quiet(sim);
        sim.step(0, 0);
        expect(ownLight(sim)).toBe(SCAR_PLAYER_LIGHT * 2);
        const near = spawn(sim, "abyssal_walker", 2, 0);
        const far = spawn(sim, "abyssal_walker", 6, 0);
        near.maxHp = near.hp = far.maxHp = far.hp = 1e6;
        sim.step(0, 0);
        const internal = sim as unknown as { damageSource: string; rng: { range: () => number } };
        internal.damageSource = "weapon:fire_spells";
        internal.rng.range = () => 1;
        sim.damageEnemy(near, 100, 0, near.x, near.y);
        sim.damageEnemy(far, 100, 0, far.x, far.y);
        expect(1e6 - near.hp).toBeGreaterThan((1e6 - far.hp) * 1.15);
    });

    test("the Leviathan's lure is his, the first time", () => {
        const lure = TROPHIES.find((t) => t.id === "leviathans_lure")!;
        expect(lure.objId).toBe(28325);
        expect(lure.from).toEqual({
            kind: "boss",
            enemyId: LEVIATHAN_ID,
            mapId: "scar",
            chance: 1,
        });
    });
});
