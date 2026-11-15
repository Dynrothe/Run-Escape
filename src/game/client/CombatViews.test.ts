import { DAMAGE_KINDS } from "../content/damageKinds";
import { getEnemy } from "../content/enemies";
import { emptyStats } from "../content/types";
import { Sim, SimOptions, TICKS_PER_SECOND } from "../core/Sim";
import { makeGrid } from "../core/world/testGrid";
import {
    getCombatView,
    getDamageKindViews,
    getKillViews,
    getPlayerResultViews,
} from "./RunStatsViews";

function createSim(party?: string[], options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(Array(72).fill(".".repeat(72)), 1000, 1000),
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 7,
        spawnX: 1036.5,
        spawnY: 1036.5,
        ...(party && {
            party: party.map((name) => ({ name, characterId: "warrior", metaStats: emptyStats() })),
            focus: 0,
        }),
        ...options,
    });
}

const sum = (values: Record<string, number | undefined>) =>
    Object.values(values).reduce((total: number, value) => total + (value ?? 0), 0);

describe("damage by type and kills by monster", () => {
    test("a run's damage by type adds up to its damage by source, and its kills by monster to its kills", () => {
        const sim = createSim();
        for (let i = 0; i < 40 * TICKS_PER_SECOND && sim.state === "playing"; i++) {
            sim.player.hp = sim.player.maxHp;
            sim.step();
        }
        const stats = sim.getRunStats();
        const bySource = stats.sources.reduce((total, source) => total + source.damage, 0);
        expect(bySource).toBeGreaterThan(0);
        expect(sum(stats.damageByKind)).toBe(bySource);
        // The warrior's scimitar is melee
        expect(stats.damageByKind.melee).toBeGreaterThan(0);
        expect(sum(stats.killsByEnemy)).toBe(sim.kills);
        const view = getCombatView(sim);
        expect(view.kinds.every((kind) => kind.damage > 0)).toBe(true);
        expect(view.kills.reduce((total, kill) => total + kill.kills, 0)).toBe(sim.kills);
    });

    test("venom is poison, and each player's kills are their own", () => {
        const sim = createSim(["Alice", "Bob"]);
        for (const hero of sim.heroes) {
            sim.as(hero.index, () => {
                for (let i = 0; i <= hero.index; i++) {
                    const goblin = sim.spawnEnemy(getEnemy("goblin"), "normal")!;
                    sim.damageEnemy(goblin, 1000, 0, goblin.x, goblin.y);
                }
                const rat = sim.spawnEnemy(getEnemy("giant_rat"), "normal")!;
                sim.damageEnemy(rat, 1, 0, rat.x, rat.y, 1, true);
            });
        }
        const [alice, bob] = getPlayerResultViews(sim);
        expect(alice.killsByEnemy).toEqual([{ enemyId: "goblin", kills: 1, boss: false }]);
        expect(bob.killsByEnemy).toEqual([{ enemyId: "goblin", kills: 2, boss: false }]);
        for (const player of [alice, bob]) {
            expect(player.kinds.map((kind) => kind.kind)).toContain("poison");
            expect(player.kinds.find((kind) => kind.kind === "poison")!.damage).toBeGreaterThan(0);
        }
    });

    test("leaves out kinds that did nothing, most first; kills most first", () => {
        const stats = {
            ...createSim().getRunStats(),
            damageByKind: { magic: 5, melee: 50, recoil: 0 },
            killsByEnemy: { goblin: 3, giant_rat: 9, not_an_enemy: 4 },
        };
        expect(getDamageKindViews(stats)).toEqual([
            { kind: "melee", damage: 50 },
            { kind: "magic", damage: 5 },
        ]);
        expect(getKillViews(stats).map((kill) => kill.enemyId)).toEqual(["giant_rat", "goblin"]);
        expect(DAMAGE_KINDS).toContain("other");
    });

    test("the Combat view lists only the invocations active on this map", () => {
        const invoked = createSim(undefined, {
            mapId: "desert",
            invocations: ["run_glass_cannon", "run_ancient_haste"],
        });
        const view = getCombatView(invoked);
        expect(view.invocations.map((invocation) => invocation.id)).toEqual([
            "run_glass_cannon",
            "run_ancient_haste",
        ]);
        expect(view.invocationTotal).toBe(30);
        expect(view.tombsInvocations).toBe(false);

        const inactive = createSim(undefined, {
            mapId: "lumbridge",
            invocations: ["run_glass_cannon"],
        });
        expect(getCombatView(inactive).invocations).toEqual([]);
    });
});

describe("the Combat tab's weapon tooltips", () => {
    test("a weapon's row says what it is and where it stands; other sources have none", () => {
        const sim = createSim();
        for (let i = 0; i < 20 * TICKS_PER_SECOND && sim.state === "playing"; i++) {
            sim.player.hp = sim.player.maxHp;
            sim.step();
        }
        const view = getCombatView(sim);
        const weapon = view.sources.find((row) => row.about);
        expect(weapon?.about?.examine).toBeTruthy();
        expect(weapon?.about?.form).toBeDefined();
        expect(weapon?.about?.level).toBe(sim.weapons[0].level);
        // The results' rows go without
        expect(getPlayerResultViews(sim)[0].damage.every((row) => !row.about)).toBe(true);
    });
});
