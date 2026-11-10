import { FALLEN_EMPIRE } from "../content/acts";
import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { GHORROCK_COLD } from "../content/ghorrock";
import { getMap } from "../content/maps";
import { TROPHIES } from "../content/trophies";
import { emptyStats } from "../content/types";
import {
    GHORROCK_BRAZIERS,
    GHORROCK_PILLARS,
    GHORROCK_POOLS,
    GHORROCK_RECIPE,
    GHORROCK_VENTS,
    ghorrockWorld,
} from "../scaperune/maps/ghorrock";
import { HeroOptions, Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import { usePortableMath } from "./fmath";
import { syncHash } from "./lockstep";
import { ColdRule } from "./rules/ColdRule";
import { EffectMask, MASK_ICE } from "./world/EffectMask";
import { makeGrid } from "./world/testGrid";

// Ghorrock in a run: the cold (ColdRule), its braziers, embers, vents and ice, what it does to a
// player, and the Snow ranger. The map's own grid needs the cache, so these play on an open field
// laid where the yard is (its braziers and vents are in world tiles); the rule only reads the grid
// it's given and its def.

const FIELD = 128;
// The field's south-west corner: the yard's grid tile 64, 64
const BASE = ghorrockWorld({ x: 64, y: 64 });

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

// A spot of the yard (grid tiles) away from every brazier, vent and pool, where it's only cold
const OPEN = ghorrockWorld({ x: 140, y: 100 }, true);

function createSim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), BASE.x, BASE.y),
        mapId: "ghorrock",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: OPEN.x,
        spawnY: OPEN.y,
        ...options,
    });
}

function coldOf(sim: Sim): ColdRule {
    return sim.cold!;
}

function steps(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
    for (let i = 0; i < Math.round(seconds * TICKS_PER_SECOND); i++) {
        sim.step(moveX, moveY);
    }
}

// Nobody hurt or killing, so only the rule moves things
function quiet(sim: Sim): void {
    for (const h of sim.heroes) {
        h.weapons = [];
        h.player.maxHp = h.player.hp = 100000;
    }
}

function standAt(sim: Sim, at: { x: number; y: number }): void {
    sim.player.x = sim.player.prevX = at.x;
    sim.player.y = sim.player.prevY = at.y;
}

describe("Ghorrock", () => {
    afterEach(() => usePortableMath(false));

    test("is an Act II map played by the cold, its yard's braziers, vents and pools", () => {
        const map = getMap("ghorrock");
        expect(map.rule).toBe(GHORROCK_COLD);
        expect(map.act?.requires).toBe("inferno");
        expect(FALLEN_EMPIRE.slots.find((slot) => slot.name === "Ghorrock")?.mapId).toBe(
            "ghorrock",
        );
        expect(GHORROCK_COLD.braziers.at).toHaveLength(GHORROCK_BRAZIERS.length);
        expect(GHORROCK_COLD.vents.at).toHaveLength(GHORROCK_VENTS.length);
        expect(map.features?.pillars).toHaveLength(GHORROCK_PILLARS.length);
        // His square is in front of the prison, the party held in it
        const box = map.bossArena!;
        const rise = map.features!.rise!;
        expect(rise.x).toBeGreaterThan(box.baseX);
        expect(rise.x).toBeLessThan(box.baseX + box.size);
        expect(rise.y).toBeLessThan(box.baseY + box.size);
        expect(map.music).toBe("Prison Break");
        expect(map.bossMusic).toBe("Eye See You");
        const sim = createSim();
        expect(sim.cold).toBe(sim.rule);
        expect(sim.realm).toBeUndefined();
    });

    test("the ice is an effect mask from the pools' ellipses, about a seventh of the yard", () => {
        const sim = createSim();
        const arena = getMap("ghorrock").arena;
        const mask = new EffectMask(arena.baseX, arena.baseY, arena.sizeX, arena.sizeY);
        for (const pool of GHORROCK_COLD.ice.pools) {
            mask.paintEllipse(pool, MASK_ICE);
        }
        // The yard's open part is up to the cliff
        const yard = arena.sizeX * (229 - 64);
        expect(mask.count / yard).toBeGreaterThan(0.12);
        expect(mask.count / yard).toBeLessThan(0.18);
        const pool = ghorrockWorld(GHORROCK_POOLS[0]);
        expect(coldOf(sim).iceAt(pool.x, pool.y)).toBe(true);
        expect(coldOf(sim).iceAt(OPEN.x, OPEN.y)).toBe(false);
        const small = new EffectMask(0, 0, 10, 10);
        small.paintEllipse({ x: 5, y: 5, rx: 2, ry: 1 }, MASK_ICE);
        expect(small.at(5, 5)).toBe(MASK_ICE);
        expect(small.at(5, 7)).toBe(0);
        expect(small.at(-1, 5)).toBe(0);
    });

    test("cold rises 2 a second in the open, faster on ice, and falls by a lit brazier", () => {
        const sim = createSim();
        quiet(sim);
        const cold = coldOf(sim);
        steps(sim, 10);
        expect(cold.coldOf(0)).toBeCloseTo(20, 0);
        const pool = ghorrockWorld(GHORROCK_POOLS[0], true);
        standAt(sim, pool);
        steps(sim, 2);
        expect(cold.coldOf(0)).toBeCloseTo(30, 0);
        const brazier = cold.braziers[0];
        expect(cold.isLit(brazier, sim.tick)).toBe(true);
        standAt(sim, { x: brazier.midX - 2, y: brazier.midY });
        steps(sim, 1);
        expect(cold.coldOf(0)).toBeCloseTo(15, 0);
    });

    test("at 50 you're slower, at 80 your weapons too, and at 100 you're frozen solid", () => {
        const sim = createSim();
        quiet(sim);
        const cold = coldOf(sim);
        const walk = (level: number) => {
            cold.setCold(0, level);
            standAt(sim, OPEN);
            sim.step(1, 0);
            return sim.player.x - OPEN.x;
        };
        const warm = walk(0);
        expect(walk(55) / warm).toBeCloseTo(0.85, 2);
        expect(walk(85) / warm).toBeCloseTo(0.7, 2);
        const hp = sim.player.hp;
        cold.setCold(0, 99.99);
        standAt(sim, OPEN);
        sim.step(0, 0);
        expect(sim.player.frozen).toBeGreaterThan(TICKS_PER_SECOND);
        expect(sim.heroes[0].frozenSolid).toBeGreaterThan(sim.tick);
        expect(cold.coldOf(0)).toBeCloseTo(GHORROCK_COLD.cold.freeze.after, 0);
        expect(hp - sim.player.hp).toBe(Math.round(sim.player.maxHp * 0.1));
        // Frozen, they can't walk
        const x = sim.player.x;
        steps(sim, 0.5, 1, 0);
        expect(sim.player.x).toBe(x);
    });

    test("on ice you slide; the Snow ranger never does, and her cold rises slower", () => {
        const pool = ghorrockWorld(GHORROCK_POOLS[0], true);
        const glide = (characterId: string) => {
            const sim = createSim({ characterId });
            quiet(sim);
            standAt(sim, pool);
            steps(sim, 1, 1, 0);
            // Let go: on ice they carry on
            const x = sim.player.x;
            steps(sim, 0.3, 0, 0);
            return { moved: sim.player.x - x, cold: sim.cold!.coldOf(0) };
        };
        const warrior = glide("warrior");
        const ranger = glide("snow_ranger");
        expect(warrior.moved).toBeGreaterThan(0.1);
        expect(ranger.moved).toBe(0);
        expect(ranger.cold / warrior.cold).toBeCloseTo(0.6, 1);
    });

    test("braziers burn down and go out, and standing by one lights it again", () => {
        const sim = createSim();
        quiet(sim);
        const cold = coldOf(sim);
        const brazier = cold.braziers[5];
        steps(sim, GHORROCK_COLD.braziers.burn + 1);
        expect(cold.isLit(brazier, sim.tick)).toBe(false);
        standAt(sim, { x: brazier.midX + 2, y: brazier.midY });
        steps(sim, GHORROCK_COLD.braziers.relight.seconds - 0.3);
        expect(cold.isLit(brazier, sim.tick)).toBe(false);
        steps(sim, 0.5);
        expect(cold.isLit(brazier, sim.tick)).toBe(true);
    });

    test("a fire elite's death leaves embers and relights the braziers near it", () => {
        const sim = createSim();
        quiet(sim);
        const cold = coldOf(sim);
        const brazier = cold.braziers[0];
        brazier.litUntil = -1;
        const fiend = sim.spawnEnemy(getEnemy("ghorrock_pyrefiend"), "elite", {
            x: brazier.midX + 3,
            y: brazier.midY,
        })!;
        sim.damageEnemy(fiend, 1e6, 0, fiend.x, fiend.y);
        expect(cold.isLit(brazier, sim.tick)).toBe(true);
        expect(cold.embers).toHaveLength(1);
        expect(cold.warmthAt(fiend.x + 1, fiend.y, sim.tick)).toBe(GHORROCK_COLD.embers.warm);
        steps(sim, GHORROCK_COLD.embers.seconds + 0.5);
        expect(cold.embers).toHaveLength(0);
    });

    test("a fire weapon's hits warm you, and an icefiend's chill you", () => {
        const sim = createSim();
        quiet(sim);
        const cold = coldOf(sim);
        const giant = sim.spawnEnemy(getEnemy("ghorrock_ice_giant"), "normal", {
            x: sim.player.x + 4,
            y: sim.player.y,
        })!;
        cold.setCold(0, 50);
        const internal = sim as unknown as { damageSource: string };
        internal.damageSource = "weapon:fire_spells";
        sim.damageEnemy(giant, 1, 0, giant.x, giant.y);
        expect(cold.coldOf(0)).toBeCloseTo(50 - GHORROCK_COLD.fire.perHit, 5);
        internal.damageSource = "weapon:shortbow";
        sim.damageEnemy(giant, 1, 0, giant.x, giant.y);
        expect(cold.coldOf(0)).toBeCloseTo(50 - GHORROCK_COLD.fire.perHit, 5);
        expect(getEnemy("ghorrock_icefiend").chills).toBe(5);
    });

    test("the vents puff in turn, a boss's gas makes the nearest one puff, and the gas hurts", () => {
        const sim = createSim();
        quiet(sim);
        const cold = coldOf(sim);
        // Out of step: never all at once
        let most = 0;
        for (let t = 0; t < GHORROCK_COLD.vents.every * TICKS_PER_SECOND; t += 5) {
            most = Math.max(most, cold.vents.filter((v) => cold.ventState(v, t) === "puff").length);
        }
        expect(most).toBeLessThan(cold.vents.length / 2);
        const vent = cold.vents[3];
        const near = cold.puffNearest(vent.x + 1, vent.y + 1, sim.tick);
        expect(near).toBe(vent);
        expect(cold.gasAt(vent.x, vent.y, sim.tick)).toBe(true);
        standAt(sim, vent);
        const hp = sim.player.hp;
        cold.setCold(0, 10);
        sim.step(0, 0);
        expect(hp - sim.player.hp).toBe(Math.round(sim.player.maxHp * GHORROCK_COLD.vents.share));
        // In the gas the cold rises fast
        expect(cold.coldOf(0)).toBeCloseTo(10 + GHORROCK_COLD.cold.fast / TICKS_PER_SECOND, 3);
    });

    test("Ketla snuffs the braziers she passes, and every one goes out as the Duke wakes", () => {
        const sim = createSim();
        quiet(sim);
        const cold = coldOf(sim);
        const brazier = cold.braziers[0];
        expect(getEnemy("ketla").plants).toBeGreaterThan(0);
        cold.plant(brazier.midX + 2, brazier.midY, getEnemy("ketla").plants!);
        expect(cold.isLit(brazier, sim.tick)).toBe(false);
        expect(cold.isLit(cold.braziers[3], sim.tick)).toBe(true);
        sim.startIntro(getEnemy("duke_sucellus"), "finalBoss", 28000);
        steps(sim, 5);
        expect(cold.braziers.every((b) => !cold.isLit(b, sim.tick))).toBe(true);
    });

    test("the Duke never moves, and his gaze is hidden from behind the yard's statues", () => {
        const duke = getEnemy("duke_sucellus");
        expect(duke.stationary).toBe(true);
        const gaze = duke.boss!.attacks.find((a) => a.name === "Freezing gaze")!;
        expect(gaze.cover).toBe(true);
        expect(duke.boss!.attacks.some((a) => a.rule?.vent)).toBe(true);
        // From anywhere in his square a statue's near
        const map = getMap("ghorrock");
        const box = map.bossArena!;
        const pillars = map.features!.pillars!;
        for (let y = box.baseY + 1; y < box.baseY + box.size - 8; y += 2) {
            for (let x = box.baseX + 1; x < box.baseX + box.size - 1; x += 2) {
                const near = Math.min(...pillars.map((p) => Math.hypot(p.x + 1 - x, p.y + 1 - y)));
                expect(near).toBeLessThan(9.5);
            }
        }
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

describe("Ghorrock's adventurer", () => {
    test("the Snow ranger joins for beating Ghorrock, and her Shatter chills and shatters", () => {
        const ranger = getCharacter("snow_ranger");
        expect(ranger.unlock).toEqual({ kind: "beatMap", mapId: "ghorrock" });
        expect(ranger.startingWeapon).toBe("shortbow");
        const trait = ranger.trait!;
        expect(trait.kind).toBe("shatter");
        const sim = createSim({ characterId: "snow_ranger" });
        quiet(sim);
        const at = { x: sim.player.x + 4, y: sim.player.y };
        const target = sim.spawnEnemy(getEnemy("ghorrock_ice_giant"), "normal", at)!;
        const near = sim.spawnEnemy(getEnemy("ghorrock_ice_giant"), "normal", {
            x: at.x + 1.5,
            y: at.y,
        })!;
        // Into the enemies' hash, as a tick puts them
        sim.step(0, 0);
        const internal = sim as unknown as { damageSource: string };
        internal.damageSource = "weapon:shortbow";
        for (let i = 0; i < 3; i++) {
            sim.damageEnemy(target, 1, 0, at.x, at.y);
        }
        expect(target.chilled ?? -1).toBeLessThan(sim.tick);
        sim.damageEnemy(target, 1, 0, at.x, at.y);
        expect(target.chilled).toBeGreaterThan(sim.tick);
        const before = near.hp;
        sim.damageEnemy(target, 1e6, 0, at.x, at.y);
        expect(target.dead).toBe(true);
        // A quarter of its hitpoints, give or take what the hit's rounded by
        expect(Math.abs(before - near.hp - target.maxHp * 0.25)).toBeLessThanOrEqual(2);
    });

    test("the Eye of the Duke is his, the first time", () => {
        const eye = TROPHIES.find((t) => t.id === "eye_of_the_duke")!;
        expect(eye.objId).toBe(28321);
        expect(eye.from).toEqual({
            kind: "boss",
            enemyId: "duke_sucellus",
            mapId: "ghorrock",
            chance: 1,
        });
        expect(GHORROCK_RECIPE.id).toBe("ghorrock");
    });
});
