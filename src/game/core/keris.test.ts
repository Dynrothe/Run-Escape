import { describe, expect, test } from "vitest";

import { getEnemy } from "../content/enemies";
import { DIVINE_RUNE_POUCH, getPassive } from "../content/passives";
import { TROPHY_BY_ID } from "../content/trophies";
import { CombatStyle, emptyStats } from "../content/types";
import { WEAPONS, getWeapon, getWeaponStyle } from "../content/weapons";
import { Rng } from "./Rng";
import { Sim } from "./Sim";
import { MAX_WEAPONS, fitsWithPouch, rollChoices } from "./Upgrades";
import { Enemy, PassiveState, WeaponState } from "./entities";
import { getEarnedUnlocks } from "./save";
import { makeGrid } from "./world/testGrid";

// The Tombs of Amascut's rewards: the keris partisans its jewels bring in, and the Divine rune
// pouch its Thread does

function openField(): string[] {
    return Array.from({ length: 72 }, (_, y) =>
        Array.from({ length: 72 }, (_, x) =>
            x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".",
        ).join(""),
    );
}

function armed(weaponId: string, seed = 3): Sim {
    const sim = new Sim({
        grid: makeGrid(openField(), 1000, 1000),
        characterId: "warrior",
        metaStats: emptyStats(),
        seed,
        spawnX: 1036.5,
        spawnY: 1036.5,
    });
    sim.weapons = [];
    sim.addWeapon(weaponId);
    return sim;
}

// One that won't die, at (dx, 0) from the player
function dummy(sim: Sim, enemyId: string, dx = 1.5): Enemy {
    const enemy = sim.spawnEnemy(getEnemy(enemyId), "normal", {
        x: sim.player.x + dx,
        y: sim.player.y,
    })!;
    enemy.hp = enemy.maxHp = 1e6;
    enemy.frozen = 1e6;
    return enemy;
}

// Stabs once, standing still; the damage each enemy took
function stab(sim: Sim, ...enemies: Enemy[]): number[] {
    // Back in reach: each stab knocks it back a little
    for (const enemy of enemies) {
        enemy.x = sim.player.x + 1.5;
        enemy.y = sim.player.y;
    }
    sim.weapons[0].cooldown = 0;
    sim.player.invulnerable = 100;
    sim.step(0, 0);
    const events = sim.takeEvents();
    return enemies.map((enemy) =>
        events
            .filter((e) => e.type === "damage" && e.enemyUid === enemy.uid)
            .reduce((sum, e) => sum + (e.type === "damage" ? e.amount : 0), 0),
    );
}

describe("the keris partisans", () => {
    test("hit kalphites and scarabs, Kephri too, a third harder", () => {
        for (const id of ["kalphite_worker", "scarab_swarm", "kephri", "scarab_mage"]) {
            expect(getEnemy(id).tags, id).toContain("kalphite");
        }
        const sim = armed("keris_partisan");
        const [kalphite] = stab(sim, dummy(sim, "kalphite_soldier"));
        const other = armed("keris_partisan");
        const [goblin] = stab(other, dummy(other, "goblin"));
        expect(goblin).toBeGreaterThan(0);
        expect(kalphite / goblin).toBeCloseTo(1.33, 1);
    });

    test("are one a run, and each comes from its own find", () => {
        const keris = WEAPONS.filter((w) => w.family === "keris");
        expect(keris.map((w) => w.id).sort()).toEqual(
            [
                "keris_partisan",
                "keris_partisan_of_amascut",
                "keris_partisan_of_breaching",
                "keris_partisan_of_corruption",
                "keris_partisan_of_the_sun",
            ].sort(),
        );
        for (const weapon of keris) {
            expect(weapon.style).toBe("melee");
            const unlock = weapon.unlock!;
            if (unlock.kind === "raidChest") {
                const trophy = TROPHY_BY_ID.get(unlock.trophyId)!;
                expect(trophy.from.kind, weapon.id).toBe("tombs");
                expect(trophy.how, weapon.id).toContain(weapon.name);
            } else {
                expect(unlock).toEqual({
                    kind: "killBoss",
                    mapId: "desert",
                    enemyId: "kalphite_queen_risen",
                });
            }
        }
    });

    test("a Breach of the Scarab in the chest brings in the breaching one", () => {
        const save = {
            trophies: [] as string[],
            unlockedItems: [] as string[],
            unlockedCharacters: [] as string[],
            mapVictories: {},
            hardVictories: {},
        } as unknown as Parameters<typeof getEarnedUnlocks>[0];
        const earned = () => getEarnedUnlocks(save).items.map((i) => i.id);
        expect(earned()).not.toContain("keris_partisan_of_breaching");
        save.trophies.push("breach_of_the_scarab", "thread_of_elidinis");
        expect(earned()).toContain("keris_partisan_of_breaching");
        expect(earned()).toContain(DIVINE_RUNE_POUCH);
        expect(earned()).not.toContain("keris_partisan_of_the_sun");
    });

    test("breaching finds gaps in the shell for triple damage, far more often in kalphites", () => {
        const breaches = (enemyId: string) => {
            const sim = armed("keris_partisan_of_breaching", 7);
            const target = dummy(sim, enemyId);
            const dealt = Array.from({ length: 400 }, () => stab(sim, target)[0]);
            // A breach is three times a stab
            const plain = Math.min(...dealt);
            expect(plain).toBeGreaterThan(0);
            return dealt.filter((d) => d > plain * 2.5).length / dealt.length;
        };
        const goblins = breaches("goblin");
        const kalphites = breaches("kalphite_worker");
        expect(goblins).toBeGreaterThan(0.02);
        expect(goblins).toBeLessThan(0.12);
        expect(kalphites).toBeGreaterThan(0.2);
        expect(kalphites).toBeLessThan(0.4);
    });

    test("Wrath of Amascut leaves what it hits taking a quarter more", () => {
        const sim = armed("keris_partisan_of_corruption");
        const target = dummy(sim, "goblin");
        const every = getWeapon("keris_partisan_of_corruption").special!.every;
        const hits = Array.from({ length: every + 1 }, () => stab(sim, target)[0]);
        // The sixth is the Wrath, half as hard again; the one after it lands drained
        expect(hits[every - 1] / hits[0]).toBeCloseTo(1.5, 1);
        expect(hits[every] / hits[0]).toBeCloseTo(1.25, 1);
        expect(target.drainEnd).toBeGreaterThan(sim.tick);
    });

    test("the sun's heals on each kill, hits harder low, and Tumeken's Light makes you whole", () => {
        const sim = armed("keris_partisan_of_the_sun");
        sim.player.hp = sim.player.maxHp / 2;
        const before = sim.player.hp;
        const goblin = sim.spawnEnemy(getEnemy("goblin"), "normal", {
            x: sim.player.x + 1.5,
            y: sim.player.y,
        })!;
        goblin.hp = 1;
        stab(sim, goblin);
        expect(goblin.dead).toBe(true);
        expect(sim.player.hp).toBeGreaterThan(before);

        const full = armed("keris_partisan_of_the_sun");
        const [high] = stab(full, dummy(full, "goblin"));
        const low = armed("keris_partisan_of_the_sun");
        low.player.hp = low.player.maxHp * 0.2;
        const [weak] = stab(low, dummy(low, "goblin"));
        expect(weak / high).toBeCloseTo(1.25, 1);

        const light = armed("keris_partisan_of_the_sun");
        const target = dummy(light, "goblin");
        const every = getWeapon("keris_partisan_of_the_sun").special!.every;
        for (let i = 0; i < every - 1; i++) {
            stab(light, target);
        }
        // A drain on max hitpoints, gone with the Light, and healed past
        light.debuffs = [
            {
                id: "test_drain",
                name: "Drain",
                iconObjId: 0,
                stats: { maxHp: -0.5 },
                startTick: light.tick,
                endTick: light.tick + 1e6,
            },
        ];
        light.updateStats();
        const drained = light.player.maxHp;
        light.player.hp = 3;
        light.player.poisonEnd = light.tick + 1000;
        light.player.poisonDamage = 2;
        stab(light, target);
        expect(light.player.maxHp).toBeGreaterThan(drained);
        expect(light.player.hp).toBe(light.player.maxHp);
        expect(light.player.poisonEnd).toBe(-1);
    });
});

describe("the Divine rune pouch", () => {
    const weapon = (id: string): WeaponState => ({
        def: getWeapon(id),
        level: 1,
        cooldown: 0,
        bonus: 0,
        uses: 0,
    });
    const pouch: PassiveState = {
        id: DIVINE_RUNE_POUCH,
        level: 1,
        value: getPassive(DIVINE_RUNE_POUCH).perLevel,
    };
    const offered = (
        style: CombatStyle,
        weapons: WeaponState[],
        passives: PassiveState[],
        maxWeapons: number,
    ) => {
        const rng = new Rng(11);
        const ids = new Set<string>();
        for (let i = 0; i < 2000; i++) {
            for (const choice of rollChoices(
                rng,
                weapons,
                passives,
                0,
                style,
                undefined,
                false,
                maxWeapons,
            )) {
                if (choice.kind === "newWeapon") {
                    ids.add(choice.weaponId);
                }
            }
        }
        return [...ids].map(getWeapon);
    };
    const melee = ["osmumtens_fang", "dragon_warhammer", "keris_partisan"].map(weapon);

    test("offers a melee adventurer magic weapons, of any class, for its slot", () => {
        const without = offered("melee", melee, [], MAX_WEAPONS);
        expect(without.some((w) => w.style === "magic")).toBe(false);
        const withPouch = offered("melee", melee, [pouch], MAX_WEAPONS + 1);
        expect(withPouch.some((w) => w.style === "magic")).toBe(true);
        expect(withPouch.some((w) => w.style === "ranged")).toBe(false);
    });

    test("keeps its slot for a magic weapon", () => {
        // Four held, none magic: only magic fits now
        const four = [...melee, weapon("ghrazi_rapier")];
        const offers = offered("melee", four, [pouch], MAX_WEAPONS + 1);
        expect(offers.length).toBeGreaterThan(0);
        for (const def of offers) {
            expect(getWeaponStyle(def), def.id).toBe("magic");
        }
        // One magic weapon of another class at most
        const magic = WEAPONS.filter((w) => w.style === "magic" && !w.evolved);
        const staff = magic[0];
        const other = magic.find((w) => w.id !== staff.id)!;
        expect(other).toBeDefined();
        expect(fitsWithPouch(other, [...melee, weapon(staff.id)], "melee", MAX_WEAPONS + 1)).toBe(
            false,
        );
    });

    test("is one level, in endless too", () => {
        const rng = new Rng(4);
        for (let i = 0; i < 500; i++) {
            const choices = rollChoices(rng, melee, [pouch], 0, "melee", undefined, true, 5);
            expect(
                choices.some((c) => c.kind === "passiveLevel" && c.passiveId === DIVINE_RUNE_POUCH),
            ).toBe(false);
        }
    });

    test("is a passive slot taken for one more weapon slot", () => {
        const sim = armed("osmumtens_fang");
        const max = sim.maxWeapons;
        sim.passives.push({ ...pouch });
        expect(sim.maxWeapons).toBe(max + 1);
    });
});
