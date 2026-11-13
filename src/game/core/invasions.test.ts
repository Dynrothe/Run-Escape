import { describe, expect, it } from "vitest";

import { getEnemy } from "../content/enemies";
import { INVADERS } from "../content/invaders";
import {
    INVASION,
    getInvaderHp,
    isInvasionOpen,
    rollInvasion,
    takesInvasions,
} from "../content/invasions";
import { ACT_MAPS, CAMPAIGN_MAPS, getMap } from "../content/maps";
import { emptyStats } from "../content/types";
import {
    VAULT_MAPS,
    VAULT_WEEKS_KEPT,
    getVault,
    isBetterVault,
    isoWeek,
    parseWeekKey,
    vaultSeed,
    weekKey,
    weekStart,
} from "../content/vault";
import { AWAKENED, Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import type { Enemy } from "./entities";
import { syncHash } from "./lockstep";
import { ColdRule } from "./rules/ColdRule";
import { RealmRule } from "./rules/RealmRule";
import { RootRule } from "./rules/RootRule";
import { canAwaken, createSave, recordGauntlet, recordRun, recordVault } from "./save";
import { makeGrid } from "./world/testGrid";

// Act II's extras that aren't items (act-2-fallen-empire.md 8.6): Awakened invasions, Awakener's
// orbs and the weekly Vault. The sims play on an open field laid where the Desert is.

const FIELD = 140;
const DESERT = getMap("desert");
const BASE = { x: Math.floor(DESERT.spawn.x) - 70, y: Math.floor(DESERT.spawn.y) - 70 };

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

function createSim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), BASE.x, BASE.y),
        mapId: "desert",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 7,
        spawnX: DESERT.spawn.x,
        spawnY: DESERT.spawn.y,
        unlockedItems: new Set(),
        ...options,
    });
}

// Steps it, the player kept up and walking a slow square, until done says so (or seconds pass)
function play(sim: Sim, seconds: number, done: () => boolean = () => false): void {
    sim.player.invulnerable = 1e9;
    for (let t = 0; t < seconds * TICKS_PER_SECOND && !done(); t++) {
        if (sim.state === "levelUp") {
            sim.choose(0);
        }
        if (sim.state === "chest") {
            sim.resolveChest("alch");
        }
        const move = Math.floor(t / 60) % 4;
        sim.step(move === 0 ? 1 : move === 2 ? -1 : 0, move === 1 ? 1 : move === 3 ? -1 : 0);
    }
}

// Hit after hit (a boss's guard and the like take some of each) till it's down
function kill(sim: Sim, enemy: Enemy): void {
    for (let i = 0; i < 200 && !enemy.dead; i++) {
        sim.damageEnemy(enemy, enemy.maxHp, 0, enemy.x, enemy.y, 0);
    }
}

const invader = (sim: Sim) => sim.enemies.find((e) => !e.dead && e.def.id.startsWith("invading_"));

describe("Awakened invasions", () => {
    it("come to campaign maps from the Desert on, once all four Act II maps are beaten", () => {
        const desert = CAMPAIGN_MAPS.findIndex((m) => m.id === "desert");
        for (const [i, map] of CAMPAIGN_MAPS.entries()) {
            expect(takesInvasions(map), map.id).toBe(i >= desert);
        }
        for (const map of ACT_MAPS) {
            expect(takesInvasions(map)).toBe(false);
        }
        const wins: Record<string, number> = {};
        expect(isInvasionOpen(wins)).toBe(false);
        for (const map of ACT_MAPS.slice(0, -1)) {
            wins[map.id] = 1;
        }
        expect(isInvasionOpen(wins)).toBe(false);
        wins[ACT_MAPS[ACT_MAPS.length - 1].id] = 1;
        expect(isInvasionOpen(wins)).toBe(true);
    });

    it("are rolled by the seed: 1 in 4, 1 in 2 on hard, between 6:00 and 12:00", () => {
        let normal = 0;
        let hard = 0;
        const who = new Set<string>();
        for (let seed = 1; seed <= 2000; seed++) {
            const a = rollInvasion(DESERT, seed, false);
            expect(rollInvasion(DESERT, seed, false)).toEqual(a);
            if (a) {
                normal++;
                who.add(a.invader.id);
                expect(a.at).toBeGreaterThanOrEqual(INVASION.from);
                expect(a.at).toBeLessThanOrEqual(INVASION.to);
                expect(a.hp).toBe(getInvaderHp(DESERT));
            }
            if (rollInvasion(DESERT, seed, true)) {
                hard++;
            }
        }
        expect(normal / 2000).toBeGreaterThan(0.22);
        expect(normal / 2000).toBeLessThan(0.28);
        expect(hard / 2000).toBeGreaterThan(0.46);
        expect(hard / 2000).toBeLessThan(0.54);
        expect(who.size).toBe(INVADERS.length);
        expect(rollInvasion(getMap("lumbridge"), 1, true)).toBeUndefined();
    });

    it("never bring a pocket of a rule a remix has on already", () => {
        for (let seed = 1; seed <= 400; seed++) {
            expect(rollInvasion(DESERT, seed, true, ["overgrown"])?.invader.pocket).not.toBe(
                "roots",
            );
        }
        for (let seed = 1; seed <= 50; seed++) {
            expect(
                rollInvasion(DESERT, seed, true, ["overgrown", "shadow", "frozen", "dark"]),
            ).toBeUndefined();
        }
    });

    // 2 s alone, over 5 in the full suite
    it("leave a run without them as it was, and roll nothing when not open", () => {
        const plain = createSim();
        const closed = createSim({ invasions: false });
        play(plain, 30);
        play(closed, 30);
        expect(syncHash(closed)).toBe(syncHash(plain));
        expect(plain.invasion).toBeUndefined();
        expect(plain.getResult().invasion).toBeUndefined();
        // Endless runs never have one
        let endless = 0;
        for (let seed = 1; seed <= 40; seed++) {
            endless += createSim({ seed, invasions: true, endless: true }).invasion ? 1 : 0;
        }
        expect(endless).toBe(0);
    }, 30000);

    for (const def of INVADERS) {
        it(`bring ${def.id}'s pocket while it lives, and pay when it falls`, () => {
            const sim = createSim({
                invasions: true,
                testing: { invasion: { invader: def.id, at: 5 } },
            });
            play(sim, 30, () => invader(sim) !== undefined);
            const boss = invader(sim)!;
            expect(boss, "it came").toBeDefined();
            expect(boss.pocket).toBeDefined();
            const pocket = sim.pocket!;
            expect(pocket.kind).toBe(def.pocket);
            expect(pocket.place.radius).toBe(INVASION.size / 2);
            const kinds = {
                roots: sim.roots instanceof RootRule,
                realm: sim.realm instanceof RealmRule,
                cold: sim.cold instanceof ColdRule,
                dark: sim.darkPocket !== undefined && sim.litTargetsOnly,
            };
            expect(kinds[def.pocket]).toBe(true);
            expect(Object.values(kinds).filter(Boolean)).toHaveLength(1);
            // A master casket's its own drop
            expect(boss.def.caskets).toEqual(["master"]);
            // Its pocket's rule does its work: the cold rises in it and thaws out of it
            if (def.pocket === "cold") {
                sim.player.x = pocket.place.x;
                sim.player.y = pocket.place.y;
                play(sim, 2);
                expect(sim.cold!.coldOf(0)).toBeGreaterThan(0);
            }
            // It keeps to its pocket
            play(sim, 10);
            const d = Math.hypot(boss.x - pocket.place.x, boss.y - pocket.place.y);
            expect(d).toBeLessThanOrEqual(pocket.place.radius + 0.01);
            // Down it goes (the Whisperer only in her realm)
            if (def.pocket === "realm") {
                sim.realm!.turn(
                    (sim as unknown as { ruleHost: Parameters<RealmRule["turn"]>[0] }).ruleHost,
                    1,
                );
            }
            const coinsBefore = sim.pickups.filter((p) => p.kind === "coins").length;
            kill(sim, boss);
            expect(boss.dead).toBe(true);
            expect(sim.pocket!.over).toBe(true);
            expect(sim.roots).toBeUndefined();
            expect(sim.realm).toBeUndefined();
            expect(sim.cold).toBeUndefined();
            expect(sim.litTargetsOnly).toBe(false);
            expect(sim.layer).toBe(0);
            expect(sim.pickups.some((p) => p.kind === "casket" && p.tier === "master")).toBe(true);
            expect(sim.pickups.filter((p) => p.kind === "coins").length).toBeGreaterThan(
                coinsBefore,
            );
            expect(sim.getResult().invasion).toEqual({ id: def.id, came: true, killed: true });
        });
    }

    it("play the same from the same seed", () => {
        const a = createSim({
            invasions: true,
            testing: { invasion: { invader: INVADERS[0].id, at: 5 } },
        });
        const b = createSim({
            invasions: true,
            testing: { invasion: { invader: INVADERS[0].id, at: 5 } },
        });
        play(a, 40);
        play(b, 40);
        expect(syncHash(a)).toBe(syncHash(b));
        expect(a.rule!.hash()).toBe(b.rule!.hash());
    });

    it("count each kill for the Collection log", () => {
        const save = createSave();
        const run = {
            mapId: "desert",
            victory: false,
            seconds: 600,
            level: 30,
            kills: 900,
            coins: 100,
            bossesKilled: [],
            invasion: { id: "invading_duke", came: true, killed: true },
        };
        recordRun(save, run);
        recordRun(save, run);
        recordRun(save, { ...run, invasion: { id: "invading_duke", came: true, killed: false } });
        expect(save.invasions).toEqual({ invading_duke: 2 });
    });
});

describe("Awakener's orbs", () => {
    const fightWin = {
        mapId: "awakened_vardorvis",
        victory: true,
        seconds: 120,
        level: 1,
        kills: 1,
        coins: 0,
        bossesKilled: [],
    };

    it("come one an Awakened win, and two a gauntlet's first clear on each mode", () => {
        const save = createSave();
        recordRun(save, fightWin);
        recordRun(save, fightWin);
        expect(save.awakenerOrbs).toBe(2);
        recordRun(save, { ...fightWin, victory: false });
        expect(save.awakenerOrbs).toBe(2);
        // The gauntlet's fights are recordGauntlet's, never recordRun's: its first clear's two
        recordGauntlet(save, {
            hard: false,
            order: [
                "awakened_vardorvis",
                "awakened_whisperer",
                "awakened_duke",
                "awakened_leviathan",
            ],
            seconds: 400,
            retries: 0,
        });
        expect(save.awakenerOrbs).toBe(4);
    });

    it("are spent on a campaign final boss once it comes, and mark the card on a win", () => {
        const save = createSave();
        save.awakenerOrbs = 2;
        expect(canAwaken(save, "karamja")).toBe(true);
        expect(canAwaken(save, "awakened_vardorvis")).toBe(false);
        expect(canAwaken(save, "stranglewood")).toBe(false);
        const run = {
            mapId: "karamja",
            victory: false,
            seconds: 300,
            level: 20,
            kills: 400,
            coins: 50,
            bossesKilled: [],
        };
        // Quit before the boss: kept
        recordRun(save, { ...run, awakened: { seen: false } });
        expect(save.awakenerOrbs).toBe(2);
        recordRun(save, { ...run, seconds: 900, awakened: { seen: true } });
        expect(save.awakenerOrbs).toBe(1);
        expect(save.awakenedWins).toBeUndefined();
        recordRun(save, { ...run, seconds: 950, victory: true, awakened: { seen: true } });
        expect(save.awakenerOrbs).toBeUndefined();
        expect(save.awakenedWins).toEqual({ karamja: 1 });
        expect(canAwaken(save, "karamja")).toBe(false);
    });

    it("awaken the final boss: 1.6 times its hitpoints, 20% quicker, enraged from 75%", () => {
        const plain = createSim();
        const awake = createSim({ awakened: true });
        expect(awake.awakened).toBe(true);
        expect(createSim({ awakened: true, endless: true }).awakened).toBe(false);
        const event = DESERT.events.find((e) => e.kind === "finalBoss") as {
            enemyId: string;
            hp?: number;
        };
        const a = plain.spawnEnemy(getEnemy(event.enemyId), "finalBoss", undefined, event.hp);
        const b = awake.spawnEnemy(getEnemy(event.enemyId), "finalBoss", undefined, event.hp);
        expect(a && b).toBeTruthy();
        expect(b!.maxHp).toBe(Math.round(a!.maxHp * AWAKENED.hp));
        expect(b!.speed).toBeCloseTo(a!.speed * AWAKENED.tempo);
        expect(b!.awakened).toBe(true);
        expect(b!.tint).not.toBe(a!.tint);
        b!.hp = Math.floor(b!.maxHp * 0.74);
        play(awake, 1);
        expect(b!.bossState!.enraged).toBe(true);
        a!.hp = Math.floor(a!.maxHp * 0.74);
        play(plain, 1);
        expect(a!.bossState!.enraged).toBe(false);
        expect(awake.getResult().awakened?.seen).toBe(true);
        expect(createSim({ awakened: true }).getResult().awakened).toEqual({ seen: false });
    });

    it("open a master casket when the awakened boss falls", () => {
        const awake = createSim({ awakened: true });
        // (Vorkath: the Kalphite Queen rises again)
        const boss = awake.spawnEnemy(getEnemy("vorkath"), "finalBoss", undefined, 14000)!;
        const before = awake.coins;
        kill(awake, boss);
        const coins = awake.getResult().awakened?.casketCoins ?? 0;
        expect(coins).toBeGreaterThanOrEqual(120);
        expect(awake.coins - before).toBeGreaterThanOrEqual(coins);
    });
});

describe("the weekly Vault", () => {
    const at = (iso: string) => Date.parse(iso);

    it("goes by the ISO week, in UTC", () => {
        expect(weekKey(isoWeek(at("2026-11-11T12:00:00Z")))).toBe("2026-W46");
        // A year's first week is the one with its first Thursday
        expect(weekKey(isoWeek(at("2026-01-01T00:00:00Z")))).toBe("2026-W01");
        expect(weekKey(isoWeek(at("2024-12-30T00:00:00Z")))).toBe("2025-W01");
        expect(weekKey(isoWeek(at("2021-01-03T23:59:59Z")))).toBe("2020-W53");
        expect(weekKey(isoWeek(at("2027-01-01T00:00:00Z")))).toBe("2026-W53");
        expect(weekKey(isoWeek(at("2027-01-04T00:00:00Z")))).toBe("2027-W01");
        // It turns on Monday at midnight UTC, not before
        expect(weekKey(isoWeek(at("2026-11-15T23:59:59.999Z")))).toBe("2026-W46");
        expect(weekKey(isoWeek(at("2026-11-16T00:00:00Z")))).toBe("2026-W47");
        // Whatever the local clock says: Sunday night in New York is Monday in UTC
        expect(weekKey(isoWeek(at("2026-11-15T20:00:00-05:00")))).toBe("2026-W47");
        expect(weekStart({ year: 2026, week: 47 })).toBe(at("2026-11-16T00:00:00Z"));
        expect(weekStart({ year: 2020, week: 53 })).toBe(at("2020-12-28T00:00:00Z"));
        for (let day = 0; day < 800; day++) {
            const time = at("2024-06-01T00:00:00Z") + day * 86400000;
            const week = isoWeek(time);
            expect(time - weekStart(week)).toBeGreaterThanOrEqual(0);
            expect(time - weekStart(week)).toBeLessThan(7 * 86400000);
        }
    });

    it("knows the weeks that exist", () => {
        expect(parseWeekKey("2026-W53")).toEqual({ year: 2026, week: 53 });
        expect(parseWeekKey("2025-W53")).toBeUndefined();
        expect(parseWeekKey("2025-W00")).toBeUndefined();
        expect(parseWeekKey("2025-W1")).toBeUndefined();
    });

    it("is the same run for everyone in a week, and another the next", () => {
        expect(getVault("2026-W46")).toEqual(getVault("2026-W46"));
        expect(vaultSeed("2026-W46")).not.toBe(vaultSeed("2026-W47"));
        const maps = new Set<string>();
        for (let week = 1; week <= 52; week++) {
            const vault = getVault(weekKey({ year: 2026, week }));
            maps.add(vault.mapId);
            expect(VAULT_MAPS).toContain(vault.mapId);
            expect(vault.remixes.length).toBeGreaterThanOrEqual(1);
            expect(vault.remixes.length).toBeLessThanOrEqual(2);
            expect(vault.invocations).toHaveLength(3);
            expect(vault.seed).toBe(vaultSeed(vault.key));
            expect(Number.isSafeInteger(vault.seed)).toBe(true);
        }
        expect(maps.size).toBeGreaterThan(4);
    });

    it("keeps the week's best: a win, the quicker win, the longer fall, then kills", () => {
        const save = createSave();
        const fall = { seconds: 500, kills: 900, victory: false };
        expect(recordVault(save, "2026-W46", fall)).toBe(true);
        expect(recordVault(save, "2026-W46", { ...fall, seconds: 400 })).toBe(false);
        expect(recordVault(save, "2026-W46", { ...fall, kills: 1000 })).toBe(true);
        expect(recordVault(save, "2026-W46", { seconds: 905, kills: 10, victory: true })).toBe(
            true,
        );
        expect(
            isBetterVault({ seconds: 950, kills: 5000, victory: true }, save.vault!["2026-W46"]),
        ).toBe(false);
        expect(save.vault!["2026-W46"]).toEqual({
            seconds: 905,
            kills: 10,
            victory: true,
            runs: 4,
        });
        expect(recordVault(save, "not a week", fall)).toBe(false);
        for (let week = 1; week <= 20; week++) {
            recordVault(save, weekKey({ year: 2026, week }), fall);
        }
        expect(Object.keys(save.vault!)).toHaveLength(VAULT_WEEKS_KEPT);
        expect(save.vault!["2026-W46"]).toBeDefined();
        // Kept by recordRun too, with the run's own records
        const other = createSave();
        recordRun(other, {
            mapId: "desert",
            victory: false,
            seconds: 300,
            level: 10,
            kills: 200,
            coins: 10,
            bossesKilled: [],
            vault: "2026-W46",
        });
        expect(other.vault?.["2026-W46"]?.kills).toBe(200);
    });
});
