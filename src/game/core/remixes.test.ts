import { describe, expect, it } from "vitest";

import { getEnemy } from "../content/enemies";
import { getMap, takesInvocations } from "../content/maps";
import {
    REMIX_CROWD_SHARE,
    cleanRemixes,
    getMapRemixes,
    getRemixCoins,
    getRemixToughness,
    isRemixOpen,
    parseRemixKey,
    remixKey,
    remixPrefix,
} from "../content/remixes";
import { emptyStats } from "../content/types";
import { getWeapon } from "../content/weapons";
import { Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import { syncHash } from "./lockstep";
import { RuleSet } from "./rules/RunRule";
import { createSave, getRemixBest, isTaskDone, recordRun } from "./save";
import { makeGrid } from "./world/testGrid";

// Remixes (content/remixes.ts, core/rules/remix.ts): an Act II rule on an older map, all four at
// once. These play on an open field laid where Lumbridge is, with a wall across part of it; the
// rules only read the grid they're given.

const FIELD = 140;
const LUMBRIDGE = getMap("lumbridge");
const BASE = { x: Math.floor(LUMBRIDGE.spawn.x) - 70, y: Math.floor(LUMBRIDGE.spawn.y) - 70 };
const ALL = ["overgrown", "shadow", "frozen", "dark"];

function field(): string[] {
    const rows: string[] = [];
    for (let row = 0; row < FIELD; row++) {
        const y = FIELD - 1 - row;
        let line = "";
        for (let x = 0; x < FIELD; x++) {
            const edge = x < 3 || y < 3 || x >= FIELD - 3 || y >= FIELD - 3;
            // A wood in the north-east: something for the roots to come from
            const wood = x > 100 && y > 100;
            line += edge || wood ? "^" : ".";
        }
        rows.push(line);
    }
    return rows;
}

function createSim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), BASE.x, BASE.y),
        mapId: "lumbridge",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 7,
        spawnX: LUMBRIDGE.spawn.x,
        spawnY: LUMBRIDGE.spawn.y,
        unlockedItems: new Set(),
        ...options,
    });
}

describe("remixes", () => {
    it("pay +30% for one and +25% for each more", () => {
        expect(getRemixCoins(0)).toBe(0);
        expect(getRemixCoins(1)).toBeCloseTo(0.3);
        expect(getRemixCoins(4)).toBeCloseTo(1.05);
        expect(createSim({ remixes: ["dark"] }).coinScale).toBeCloseTo(1.3);
        expect(createSim({ remixes: ALL }).coinScale).toBeCloseTo(2.05);
    });

    it("key their records by the map and the set, in order", () => {
        expect(remixKey("lumbridge", ["frozen", "dark"])).toBe("lumbridge:dark+frozen");
        expect(parseRemixKey("lumbridge:dark+frozen")).toEqual({
            mapId: "lumbridge",
            remixes: ["frozen", "dark"],
        });
        expect(parseRemixKey("lumbridge:dark+nonsense")).toBeUndefined();
        expect(cleanRemixes(["dark", "dark", "x", "overgrown"])).toEqual(["overgrown", "dark"]);
        expect(remixPrefix(["dark", "frozen"])).toBe("Frozen Dark");
        expect(remixPrefix(cleanRemixes(ALL))).toBe("Fallen");
    });

    it("open on the first campaign with their Act II map, and on Act II's once all four are beaten", () => {
        const wins: Record<string, number> = { stranglewood: 1 };
        expect(isRemixOpen(wins, LUMBRIDGE, "overgrown")).toBe(true);
        expect(isRemixOpen(wins, LUMBRIDGE, "dark")).toBe(false);
        const lassar = getMap("lassar_undercity");
        expect(isRemixOpen(wins, lassar, "overgrown")).toBe(false);
        const all = { stranglewood: 1, lassar_undercity: 1, ghorrock: 1, scar: 1 };
        expect(isRemixOpen(all, lassar, "overgrown")).toBe(true);
        // Its own rule's isn't on it
        expect(isRemixOpen(all, lassar, "shadow")).toBe(false);
        expect(getMapRemixes(lassar)).not.toContain("shadow");
        // Not on boss fights, raids or the like
        expect(getMapRemixes(getMap("zachariah"))).toEqual([]);
        expect(getRemixToughness(LUMBRIDGE)).toBeCloseTo(0.7);
        expect(getRemixToughness(getMap("inferno"))).toBeCloseTo(1);
    });

    it("take invocations on every first-campaign map once remixed", () => {
        expect(takesInvocations(LUMBRIDGE)).toBe(false);
        expect(takesInvocations(LUMBRIDGE, true)).toBe(true);
    });

    it("put nothing on a run without them", () => {
        const sim = createSim();
        expect(sim.rule).toBeUndefined();
        expect(sim.lighting).toBeUndefined();
        expect(sim.remixRun).toBeUndefined();
        // Nor what a map doesn't take
        const fight = createSim({ mapId: "zachariah", remixes: ALL });
        expect(fight.remixes).toEqual([]);
    });

    it("stack all four: roots, the realm, the cold and the dark on one run", () => {
        const sim = createSim({ remixes: ALL });
        expect(sim.rule).toBeInstanceOf(RuleSet);
        expect(sim.roots).toBeDefined();
        expect(sim.realm).toBeDefined();
        expect(sim.cold).toBeDefined();
        expect(sim.lighting?.litTargetsOnly).toBe(true);
        // Six braziers twenty tiles apart on open ground, ice, fires, two lanterns by the start
        const braziers = sim.cold!.braziers;
        expect(braziers.length).toBe(6);
        for (const a of braziers) {
            for (const b of braziers) {
                if (a !== b) {
                    expect(Math.hypot(a.midX - b.midX, a.midY - b.midY)).toBeGreaterThanOrEqual(10);
                }
            }
            expect(sim.grid.isSolid(Math.floor(a.midX), Math.floor(a.midY))).toBe(false);
        }
        expect(sim.cold!.mask.count).toBeGreaterThan(0);
        expect(sim.remixRun!.fires.length).toBeGreaterThan(0);
        expect(sim.remixRun!.lighting!.lanterns!.length).toBe(2);
        // The easiest map's are gentler: the light bigger, the cold slower
        expect(sim.lighting!.player!.radius).toBeGreaterThan(5);
        expect(sim.cold!.def.cold.rise).toBeLessThan(2);
    });

    it("share one remix's share of the crowd between them", () => {
        const one = createSim({ remixes: ["overgrown"] });
        const all = createSim({ remixes: ALL });
        for (const sim of [one, all]) {
            const waves = sim.remixRun!.waves;
            for (let i = 0; i < waves.length; i++) {
                const own = LUMBRIDGE.waves[i].enemies.reduce((sum, e) => sum + e.weight, 0);
                const total = waves[i].enemies.reduce((sum, e) => sum + e.weight, 0);
                expect((total - own) / total).toBeCloseTo(REMIX_CROWD_SHARE);
                expect(waves[i].maxAlive).toBe(LUMBRIDGE.waves[i].maxAlive);
            }
        }
        // Their elites come in with the map's, in order
        const events = all.remixRun!.events;
        expect(events.some((e) => e.enemyId === "ghorrock_pyrefiend")).toBe(true);
        expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort((a, b) => a - b));
    });

    it("keep roots off ice when Overgrown and Frozen are on together", () => {
        const sim = createSim({ remixes: ["overgrown", "frozen"] });
        const roots = sim.roots!;
        const cold = sim.cold!;
        let iced = 0;
        for (let i = 0; i < roots.open.length; i++) {
            const { x, y } = roots.cellMiddle(i);
            if (cold.iceAt(x, y)) {
                iced++;
                expect(roots.open[i]).toBe(0);
            }
        }
        expect(iced).toBeGreaterThan(0);
    });

    it("play the same from the same seed, all four on", () => {
        const a = createSim({ remixes: ALL });
        const b = createSim({ remixes: ALL });
        for (const sim of [a, b]) {
            sim.player.invulnerable = 1e9;
        }
        for (let t = 0; t < 120 * TICKS_PER_SECOND; t++) {
            const move = Math.floor(t / 40) % 4;
            for (const sim of [a, b]) {
                if (sim.state === "levelUp") {
                    sim.choose(0);
                }
                sim.step(
                    move === 0 ? 1 : move === 2 ? -1 : 0,
                    move === 1 ? 1 : move === 3 ? -1 : 0,
                );
            }
        }
        expect(syncHash(a)).toBe(syncHash(b));
        expect(a.rule!.hash()).toBe(b.rule!.hash());
    });

    it("set their own records, relic-free, not the map's hard ones", () => {
        const save = createSave();
        const run = {
            mapId: "lumbridge",
            victory: true,
            seconds: 900,
            level: 40,
            kills: 1000,
            coins: 100,
            bossesKilled: [],
            hard: true,
            remixes: ["frozen", "dark"],
        };
        recordRun(save, run);
        expect(save.mapVictories.lumbridge).toBe(1);
        expect(save.hardVictories.lumbridge ?? 0).toBe(0);
        expect(save.remixVictories?.["lumbridge:dark+frozen"]).toEqual({
            wins: 1,
            seconds: 900,
            hard: 1,
        });
        recordRun(save, { ...run, seconds: 880, hard: false });
        expect(save.remixVictories?.["lumbridge:dark+frozen"]).toEqual({
            wins: 2,
            seconds: 880,
            hard: 1,
        });
        // A relic on: a win, but no record
        recordRun(save, { ...run, remixes: ALL, relics: ["specialist"] });
        expect(save.mapVictories.lumbridge).toBe(3);
        expect(save.remixVictories?.["lumbridge:dark+frozen+overgrown+shadow"]).toBeUndefined();
        expect(getRemixBest(save, "lumbridge")).toBe(2);
    });
});

// The Soulreaper axe (act-2-fallen-empire.md, 8.2): souls from kills near you, and Harvest
describe("the Soulreaper axe", () => {
    function axeSim(): Sim {
        const sim = createSim();
        sim.addWeapon("soulreaper_axe");
        return sim;
    }

    function kill(sim: Sim, dx: number): void {
        const enemy = sim.spawnEnemy(getEnemy("goblin"), "normal", {
            x: sim.player.x + dx,
            y: sim.player.y,
        })!;
        sim["killEnemy"](enemy);
    }

    it("is a melee weapon made of the four final bosses' pieces", () => {
        const axe = getWeapon("soulreaper_axe");
        expect(axe.style).toBe("melee");
        expect(axe.unlock).toEqual({
            kind: "pieces",
            mapId: "scar",
            trophyIds: [
                "executioners_axe_head",
                "sirens_staff",
                "eye_of_the_duke",
                "leviathans_lure",
            ],
        });
        const save = createSave();
        save.trophies.push("executioners_axe_head", "sirens_staff", "eye_of_the_duke");
        expect(isTaskDone(save, axe.unlock!)).toBe(false);
        save.trophies.push("leviathans_lure");
        expect(isTaskDone(save, axe.unlock!)).toBe(true);
    });

    it("takes a soul from each kill within 4 tiles, up to 5", () => {
        const sim = axeSim();
        kill(sim, 6);
        expect(sim.heroes[0].souls).toBe(0);
        for (let i = 0; i < 7; i++) {
            kill(sim, 2);
        }
        expect(sim.heroes[0].souls).toBe(5);
    });

    it("harvests at 5 souls: a spin all round for hitpoints, never below 1, not while low", () => {
        const sim = axeSim();
        const behind = sim.spawnEnemy(getEnemy("cow"), "normal", {
            x: sim.player.x - 2,
            y: sim.player.y + 1,
        })!;
        // Into the enemies' spatial hash
        sim.step(0, 0);
        sim.heroes[0].souls = 5;
        const before = sim.player.hp;
        const axe = getWeapon("soulreaper_axe");
        sim["fireSweep"](axe, axe.levels[0]);
        // Spent (what the spin itself kills can give one back)
        expect(sim.heroes[0].souls).toBeLessThanOrEqual(1);
        expect(behind.hp).toBeLessThan(behind.maxHp);
        expect(sim.player.hp).toBe(before - Math.max(1, Math.round(sim.player.maxHp * 0.08)));
        // Low: no Harvest, souls kept
        sim.heroes[0].souls = 5;
        sim.player.hp = Math.floor(sim.player.maxHp * 0.1);
        sim["fireSweep"](axe, axe.levels[0]);
        expect(sim.heroes[0].souls).toBe(5);
    });
});
