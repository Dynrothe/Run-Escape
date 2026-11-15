import { FALLEN_EMPIRE, getActFightIds, isActEnded } from "../content/acts";
import { getEnemy } from "../content/enemies";
import { AWAKENED_LEVIATHAN_ID, LEVIATHAN_LIGHTING, LEVIATHAN_SHADOW } from "../content/leviathan";
import { getMap } from "../content/maps";
import { PET_BY_ID } from "../content/pets";
import { TROPHY_BY_ID } from "../content/trophies";
import { emptyStats } from "../content/types";
import { SCAR_RECIPE } from "../scaperune/maps/scar";
import { Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import type { Enemy } from "./entities";
import { createSave, migrateSave, takeActEnding } from "./save";
import { makeGrid } from "./world/testGrid";

// The Awakened Leviathan (content/leviathan.ts), Lil'viathan, the fourth fighting pet (PetDef.power
// bubble), and the act's ending (ActDef.ending, SaveData.actEndings). The Scar's grid needs the
// cache, so the fight plays on an open field round its pool; the fight reads only the grid it's
// given (its wreck is the map's features).

const MAP = getMap("awakened_leviathan");
const SIZE = 80;
const BASE_X = Math.floor(MAP.spawn.x) - SIZE / 2;
const BASE_Y = Math.floor(MAP.spawn.y) - SIZE / 2 + 10;

function field(): string[] {
    const rows: string[] = [];
    for (let row = 0; row < SIZE; row++) {
        const y = SIZE - 1 - row;
        let line = "";
        for (let x = 0; x < SIZE; x++) {
            line += x < 3 || y < 3 || x >= SIZE - 3 || y >= SIZE - 3 ? "^" : ".";
        }
        rows.push(line);
    }
    return rows;
}

function createSim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), BASE_X, BASE_Y),
        mapId: MAP.id,
        characterId: "lantern_bearer",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        ...options,
    });
}

function leviathan(sim: Sim): Enemy | undefined {
    return sim.enemies.find((e) => e.def.id === AWAKENED_LEVIATHAN_ID && !e.dead);
}

// Steps on, the hero kept whole and its attacks held back, so only what's tested happens
function steps(sim: Sim, seconds: number): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND && sim.state === "playing"; i++) {
        sim.player.hp = sim.player.maxHp;
        const boss = leviathan(sim);
        if (boss?.bossState) {
            boss.attackCooldown = Math.max(boss.attackCooldown, 10);
        }
        sim.step(0, 0);
    }
}

// Past its rising, with no weapons
function ready(): { sim: Sim; boss: Enemy } {
    const sim = createSim();
    steps(sim, 8);
    for (const hero of sim.heroes) {
        hero.weapons = [];
    }
    return { sim, boss: leviathan(sim)! };
}

function startAttack(sim: Sim, boss: Enemy, name: string): void {
    const attack = boss.def.boss!.attacks.find((a) => a.name === name)!;
    (sim as unknown as { startBossAttack(e: Enemy, a: unknown): void }).startBossAttack(
        boss,
        attack,
    );
}

// Steps on with the player held where they stand
function holdFor(sim: Sim, seconds: number): void {
    const { x, y } = sim.player;
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
        sim.player.x = x;
        sim.player.y = y;
        sim.step(0, 0);
    }
}

// Into its second phase (its glow out), held back: a phase changes as it's hit past its threshold
function intoDark(sim: Sim, boss: Enemy): void {
    boss.hp = Math.round(boss.maxHp * 0.66);
    sim.damageEnemy(boss, boss.maxHp * 0.03, 0, boss.x, boss.y - 5);
    steps(sim, 4);
    expect(boss.bossState?.phase?.index).toBe(1);
}

describe("The Awakened Leviathan", () => {
    test("is opened by the Scar, on its ground, as the Lantern-bearer with Shadow; drops Lil'viathan", () => {
        expect(MAP.fight).toMatchObject({
            requires: "scar",
            character: "lantern_bearer",
            ability: LEVIATHAN_SHADOW,
        });
        expect(SCAR_RECIPE.fights).toContain(MAP.id);
        expect(MAP.lighting).toBe(LEVIATHAN_LIGHTING);
        expect(getEnemy(AWAKENED_LEVIATHAN_ID).stationary).toBe(true);
        expect(TROPHY_BY_ID.get("lilviathan")?.from).toMatchObject({
            enemyId: AWAKENED_LEVIATHAN_ID,
            mapId: MAP.id,
            chance: 1,
        });
        expect(PET_BY_ID.get("lilviathan")?.power?.kind).toBe("bubble");
    });

    test("the wreck stands from the start, and never goes", () => {
        const { sim } = ready();
        const wreck = sim.debris.filter((d) => d.wreck);
        expect(wreck.length).toBe(MAP.features!.wreckage!.length);
        steps(sim, 30);
        expect(sim.debris.filter((d) => d.wreck).length).toBe(wreck.length);
    });

    test("its glow lights it in its first phase, and is out from its second", () => {
        const { sim, boss } = ready();
        // Far out, past her own light
        sim.player.x = boss.x;
        sim.player.y = boss.y - 13;
        steps(sim, 0.2);
        expect(sim.isEnemyLit(boss)).toBe(true);
        intoDark(sim, boss);
        sim.player.x = boss.x;
        sim.player.y = boss.y - 13;
        steps(sim, 0.2);
        expect(sim.isEnemyLit(boss)).toBe(false);
        // Brought her light to it, it's lit again
        sim.player.x = boss.x;
        sim.player.y = boss.y - 7;
        steps(sim, 0.2);
        expect(sim.isEnemyLit(boss)).toBe(true);
    });

    test("Shadow stuns it from close by, its guard down; not again straight after", () => {
        const { sim, boss } = ready();
        sim.player.x = boss.x;
        sim.player.y = boss.y - 10;
        expect(sim.useAbility()).toBe(false);
        sim.player.y = boss.y - 5.5;
        expect(sim.useAbility()).toBe(true);
        expect(sim.isStunned(boss)).toBe(true);
        expect(sim.isExposed(boss)).toBe(true);
        // Within its stun grace another only drops its guard
        holdFor(sim, LEVIATHAN_SHADOW.stun! + 0.5);
        expect(sim.isStunned(boss)).toBe(false);
        sim.heroes[0].abilityReadyTick = 0;
        expect(sim.useAbility()).toBe(true);
        expect(sim.isStunned(boss)).toBe(false);
        expect(sim.isExposed(boss)).toBe(true);
    });

    test("its torrent finds you in the open; behind debris it misses, and smashes the debris", () => {
        const { sim, boss } = ready();
        intoDark(sim, boss);
        sim.player.x = boss.x + 3;
        sim.player.y = boss.y - 9;
        startAttack(sim, boss, "Torrent");
        const hp = sim.player.hp;
        holdFor(sim, 2.6);
        expect(sim.player.hp).toBeLessThan(hp);

        const hidden = ready();
        intoDark(hidden.sim, hidden.boss);
        // A piece of debris down south of it, and the player straight behind it
        const { boss: b } = hidden;
        hidden.sim.debris.push({ x: b.x, y: b.y - 8, locId: 49343, from: 0, until: 1e9 });
        hidden.sim.player.x = b.x;
        hidden.sim.player.y = b.y - 9.4;
        startAttack(hidden.sim, b, "Torrent");
        const before = hidden.sim.player.hp;
        holdFor(hidden.sim, 2.6);
        expect(hidden.sim.player.hp).toBe(before);
        expect(hidden.sim.isExposed(b)).toBe(true);
        expect(hidden.sim.debris.some((d) => !d.wreck && d.y === b.y - 8)).toBe(false);
    });

    test("the wreck hides you too, and isn't smashed", () => {
        const { sim, boss } = ready();
        intoDark(sim, boss);
        const wreck = sim.debris.find((d) => d.wreck)!;
        const dx = wreck.x - boss.x;
        const dy = wreck.y - boss.y;
        const length = Math.hypot(dx, dy);
        sim.player.x = wreck.x + (dx / length) * 1.3;
        sim.player.y = wreck.y + (dy / length) * 1.3;
        startAttack(sim, boss, "Torrent");
        const hp = sim.player.hp;
        holdFor(sim, 2.6);
        expect(sim.player.hp).toBe(hp);
        expect(sim.debris).toContain(wreck);
    });

    test("in its last phase the pathfinder's the only light", () => {
        const { sim, boss } = ready();
        boss.hp = Math.round(boss.maxHp * 0.28);
        steps(sim, 4);
        const only = sim.onlyLightEnemy();
        expect(only).toBeDefined();
        expect(sim.lights.length).toBe(1);
    });
});

describe("Lil'viathan", () => {
    function scar(pet?: string): Sim {
        const map = getMap("scar");
        return new Sim({
            grid: makeGrid(
                field(),
                Math.floor(map.spawn.x) - SIZE / 2,
                Math.floor(map.spawn.y) - SIZE / 2,
            ),
            mapId: "scar",
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 3,
            spawnX: map.spawn.x,
            spawnY: map.spawn.y,
            pet,
        });
    }

    test("blows a bubble every 20 s that takes a hit, up to a quarter, and pops", () => {
        const sim = scar("lilviathan");
        for (const hero of sim.heroes) {
            hero.weapons = [];
        }
        for (let i = 0; i < 20 * TICKS_PER_SECOND + 1; i++) {
            sim.player.hp = sim.player.maxHp;
            sim.player.invulnerable = 1e9;
            sim.step(0, 0);
        }
        expect(sim.heroes[0].petBubble).toBe(true);
        sim.player.invulnerable = 0;
        const imp = sim.spawnEnemy(getEnemy("scarred_imp"), "normal", {
            x: sim.player.x + 1,
            y: sim.player.y,
        })!;
        // Into the sim's reckoning of who's where
        sim.player.invulnerable = 1e9;
        sim.step(0, 0);
        sim.player.invulnerable = 0;
        imp.vx = imp.vy = 0;
        const hit = (
            sim as unknown as { damagePlayer(d: number, id: string, e: boolean): number }
        ).damagePlayer.bind(sim);
        const full = sim.player.hp;
        expect(hit(5, "scarred_imp", false)).toBe(0);
        expect(sim.player.hp).toBe(full);
        expect(sim.heroes[0].petBubble).toBe(false);
        // Knocked back from the player
        expect(imp.vx).toBeGreaterThan(0);
        // A hit bigger than a quarter gets through, less the quarter
        const quarter = Math.round(sim.player.maxHp * 0.25);
        sim.player.invulnerable = 0;
        sim.player.hp = sim.player.maxHp;
        const bare = hit(quarter + 4, "scarred_imp", false);
        sim.heroes[0].petBubble = true;
        sim.player.invulnerable = 0;
        sim.player.hp = sim.player.maxHp;
        expect(hit(quarter + 4, "scarred_imp", false)).toBe(bare - quarter);
    });

    test("not in a boss fight, and a run without it plays as before", () => {
        const fight = createSim({ pet: "lilviathan" });
        steps(fight, 25);
        expect(fight.heroes[0].petBubble).toBeFalsy();

        const a = scar();
        const b = scar("little_nightmare");
        for (let i = 0; i < 20 * TICKS_PER_SECOND; i++) {
            a.step(1, 0);
            b.step(1, 0);
        }
        expect(a.player.x).toBe(b.player.x);
        expect(a.enemies.length).toBe(b.enemies.length);
    });
});

describe("The act's ending", () => {
    const fights = getActFightIds(FALLEN_EMPIRE);

    test("each of the act's maps has its Awakened fight", () => {
        expect(fights).toEqual([
            "awakened_vardorvis",
            "awakened_whisperer",
            "awakened_duke",
            "awakened_leviathan",
        ]);
        for (const id of fights) {
            expect(getMap(id).fight).toBeDefined();
        }
        expect(FALLEN_EMPIRE.ending?.lines.length).toBeGreaterThan(0);
    });

    test("is told once, when the fourth Awakened falls, whichever is fourth", () => {
        const save = createSave();
        for (const id of fights.slice(1)) {
            save.mapVictories[id] = 1;
        }
        expect(isActEnded(FALLEN_EMPIRE, save.mapVictories)).toBe(false);
        expect(takeActEnding(save)).toBeUndefined();
        save.mapVictories[fights[0]] = 1;
        expect(isActEnded(FALLEN_EMPIRE, save.mapVictories)).toBe(true);
        expect(takeActEnding(save)).toBe(FALLEN_EMPIRE.id);
        expect(takeActEnding(save)).toBeUndefined();
        expect(save.actEndings).toEqual([FALLEN_EMPIRE.id]);
    });

    test("the save keeps that it's been told", () => {
        const save = createSave();
        save.actEndings = [FALLEN_EMPIRE.id];
        const back = migrateSave(
            JSON.parse(JSON.stringify({ ...save, actEndings: [FALLEN_EMPIRE.id, "nope"] })),
        );
        expect(back.actEndings).toEqual([FALLEN_EMPIRE.id]);
    });
});
