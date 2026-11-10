import { FALLEN_EMPIRE, getActStep } from "../content/acts";
import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { MAPS, getMap } from "../content/maps";
import { STRANGLEWOOD_ROOTS } from "../content/stranglewood";
import { emptyStats } from "../content/types";
import { HeroOptions, Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import { usePortableMath } from "./fmath";
import { syncHash } from "./lockstep";
import { CELL_ROOTED, RootRule } from "./rules/RootRule";
import { makeGrid } from "./world/testGrid";

// The Stranglewood in a run: the rule the map's played by (core/rules), Act II's steps and the
// Forester's trait. The map's own grid needs the cache, so these play on an open field with a
// wood round it; the rule only reads the grid it's given.

function field(): string[] {
    const size = 72;
    const rows: string[] = [];
    for (let row = 0; row < size; row++) {
        const y = size - 1 - row;
        let line = "";
        for (let x = 0; x < size; x++) {
            line += x < 3 || y < 3 || x >= size - 3 || y >= size - 3 ? "^" : ".";
        }
        rows.push(line);
    }
    return rows;
}

function hero(characterId: string): HeroOptions {
    return { name: characterId, characterId, metaStats: emptyStats() };
}

function createSim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), 1000, 1000),
        mapId: "stranglewood",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        ...options,
    });
}

// Roots taken at once under x, y (the cell's sprout skipped)
function rootAt(sim: Sim, x: number, y: number): void {
    const rule = sim.rule as RootRule;
    const i = rule.cellAt(x, y);
    rule.state[i] = CELL_ROOTED;
    rule.changedAt[i] = sim.tick;
    rule.rootedCount++;
}

describe("the Stranglewood", () => {
    afterEach(() => usePortableMath(false));

    test("is played by its roots, and nothing else is", () => {
        expect(createSim().rule?.def).toBe(STRANGLEWOOD_ROOTS);
        // Awakened Vardorvis's clearing has its own (Vardorvis.test.ts)
        for (const map of MAPS.filter(
            (m) => !["stranglewood", "awakened_vardorvis"].includes(m.id),
        )) {
            expect(createSim({ mapId: map.id }).rule).toBeUndefined();
        }
    });

    test("roots slow a player and wear them down after a moment on them", () => {
        const sim = createSim();
        for (const h of sim.heroes) {
            h.weapons = [];
        }
        const { player } = sim;
        // Walking east on open ground, then on roots
        const from = player.x;
        sim.step(1, 0);
        const open = player.x - from;
        rootAt(sim, player.x + 1, player.y);
        rootAt(sim, player.x + 3, player.y);
        player.x += 1;
        const before = player.x;
        sim.step(1, 0);
        expect(player.x - before).toBeCloseTo(open * (1 - STRANGLEWOOD_ROOTS.slow), 5);
        // Stood on them: nothing for half a second, then a share of their hitpoints every half
        player.invulnerable = 0;
        const hp = player.hp;
        const grace = STRANGLEWOOD_ROOTS.hurt.grace * TICKS_PER_SECOND;
        for (let i = 0; i < grace - 2; i++) {
            sim.step(0, 0);
        }
        expect(player.hp).toBe(hp);
        for (let i = 0; i < 4; i++) {
            sim.step(0, 0);
        }
        expect(player.hp).toBeLessThan(hp);
    });

    test("enemies on roots are quicker", () => {
        const sim = createSim();
        const rule = sim.rule!;
        rootAt(sim, 1050.5, 1050.5);
        expect(rule.enemyPace(1050.5, 1050.5)).toBeCloseTo(1 + STRANGLEWOOD_ROOTS.haste);
        expect(rule.enemyPace(1060.5, 1060.5)).toBe(1);
    });

    test("a hit on an enemy standing on roots cuts them, and a kill there more", () => {
        const sim = createSim();
        const rule = sim.rule as RootRule;
        rootAt(sim, 1050.5, 1050.5);
        rootAt(sim, 1052.5, 1050.5);
        const enemy = sim.spawnEnemy(getEnemy("strangled"), "normal", { x: 1050.5, y: 1050.5 })!;
        // A weapon's, as the hit's the player's (another enemy's or the ground's cut nothing)
        sim["damageSource"] = "weapon:scimitar";
        sim.damageEnemy(enemy, 1, 0, enemy.x, enemy.y);
        expect(rule.isRooted(1050.5, 1050.5)).toBe(false);
        expect(rule.cutAt[rule.cellAt(1050.5, 1050.5)]).toBe(sim.tick);
    });

    test("in co-op the roots are the party's and the hurt is each player's own", () => {
        usePortableMath(true);
        const sim = createSim({ party: [hero("warrior"), hero("wizard")], focus: 0 });
        const [a, b] = sim.heroes;
        for (const h of sim.heroes) {
            h.weapons = [];
            h.player.invulnerable = 0;
        }
        b.player.x = a.player.x + 10;
        rootAt(sim, b.player.x, b.player.y);
        const hpA = a.player.hp;
        const hpB = b.player.hp;
        for (let i = 0; i < TICKS_PER_SECOND * 2; i++) {
            sim.step(0, 0);
        }
        expect(a.player.hp).toBe(hpA);
        expect(b.player.hp).toBeLessThan(hpB);
    });

    test("two copies of a co-op run grow the same roots, tick for tick", () => {
        usePortableMath(true);
        const party = [hero("warrior"), hero("ranger")];
        const one = createSim({ party, focus: 0, seed: 11 });
        const two = createSim({ party, focus: 1, seed: 11 });
        for (let i = 0; i < 150 * TICKS_PER_SECOND; i++) {
            for (const sim of [one, two]) {
                for (const h of sim.heroes) {
                    if (h.pendingLevelUps > 0) {
                        sim.as(h.index, () => sim.choose(0));
                    }
                    h.player.hp = h.player.maxHp;
                }
                sim.step();
                sim.takeEvents();
            }
            if (i % 500 === 0) {
                expect(syncHash(two)).toBe(syncHash(one));
            }
        }
        expect((one.rule as RootRule).rootedCount).toBeGreaterThan(0);
        expect([...(two.rule as RootRule).state]).toEqual([...(one.rule as RootRule).state]);
    });
});

describe("Act II", () => {
    test("opens once the Inferno's beaten, its maps in any order", () => {
        const act = MAPS.filter((map) => map.act);
        expect(act.map((map) => map.id)).toEqual(["stranglewood"]);
        expect(act.every((map) => map.act!.requires === FALLEN_EMPIRE.requires)).toBe(true);
        expect(getMap(FALLEN_EMPIRE.requires).act).toBeUndefined();
    });

    test("each map is a step harder for each other one beaten, the last always the hardest", () => {
        const act = {
            ...FALLEN_EMPIRE,
            slots: ["a", "b", "c", "d"].map((mapId) => ({ ...FALLEN_EMPIRE.slots[0], mapId })),
        };
        const map = { ...getMap("stranglewood"), id: "a" };
        expect(getActStep(map, {}, act)).toBe(0);
        // Its own wins don't count
        expect(getActStep(map, { a: 3 }, act)).toBe(0);
        expect(getActStep(map, { b: 1 }, act)).toBe(1);
        expect(getActStep(map, { b: 1, d: 2 }, act)).toBe(2);
        expect(getActStep(map, { a: 1, b: 1, c: 1, d: 1 }, act)).toBe(3);
        // Off an act, there's no step
        expect(getActStep(getMap("inferno"), { a: 1, b: 1 }, undefined)).toBe(0);
    });

    test("a step's enemies are tougher and its coins worth more", () => {
        const first = createSim({ actStep: 0 });
        const last = createSim({ actStep: 3 });
        expect(first.difficulty).toEqual({ hp: 4.2, damage: 2.9 });
        expect(last.difficulty).toEqual({ hp: 4.65, damage: 3.2 });
        expect(first.coinScale).toBe(1);
        expect(last.coinScale).toBeCloseTo(1.3);
        const goblin = (sim: Sim) => sim.spawnEnemy(getEnemy("strangled"), "normal")!.maxHp;
        expect(goblin(last)).toBeGreaterThan(goblin(first));
        // A boss's own hitpoints too
        const boss = (sim: Sim) =>
            sim.spawnEnemy(getEnemy("kasonde"), "boss", undefined, 3600)!.maxHp;
        expect(boss(last) / boss(first)).toBeCloseTo(4.65 / 4.2, 2);
        expect(last.getResult().actStep).toBe(3);
    });

    test("the step does nothing off an act's map", () => {
        const sim = createSim({ mapId: "inferno", actStep: 3 });
        expect(sim.actStep).toBe(0);
        expect(sim.difficulty).toBe(getMap("inferno").difficulty);
        expect(sim.getResult().actStep).toBeUndefined();
    });
});

describe("the Forester", () => {
    test("fells a tree every so many kills, and cuts roots further out", () => {
        const sim = createSim({ characterId: "forester" });
        const trait = getCharacter("forester").trait!;
        expect(sim.weapons.map((w) => w.def.id)).toEqual(["two_handed_sword"]);
        sim.heroes[0].traitKills = trait.every - 1;
        const victim = sim.spawnEnemy(getEnemy("strangled"), "normal", {
            x: sim.player.x + 1,
            y: sim.player.y,
        })!;
        sim.damageEnemy(victim, 1e6, 0, victim.x, victim.y);
        expect(sim.heroes[0].traitReady).toBe(true);
        // A crowd in a line ahead, out past a swing's reach
        const line = [2, 4, 6].map(
            (d) =>
                sim.spawnEnemy(getEnemy("strangled"), "normal", {
                    x: sim.player.x + d,
                    y: sim.player.y,
                })!,
        );
        const hp = line.map((e) => e.hp);
        let felled = false;
        for (let i = 0; i < 4 * TICKS_PER_SECOND && !felled; i++) {
            sim.step(0, 0);
            felled = sim.takeEvents().some((e) => e.type === "treeFall");
        }
        expect(felled).toBe(true);
        expect(sim.heroes[0].traitReady).toBe(false);
        expect(line.every((e, i) => e.dead || e.hp < hp[i])).toBe(true);
    });
});
