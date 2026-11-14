import { DAMAGE_KINDS } from "../content/damageKinds";
import { getEnemy } from "../content/enemies";
import { emptyStats } from "../content/types";
import { RECENT_HITS_KEPT, Sim, TICKS_PER_SECOND } from "../core/Sim";
import { makeGrid } from "../core/world/testGrid";
import {
    getCombatView,
    getDamageKindViews,
    getKillViews,
    getPlayerResultViews,
} from "./RunStatsViews";

function createSim(party?: string[]): Sim {
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

    test("keeps the last hits taken, and nothing more", () => {
        const sim = createSim();
        const damagePlayer = (sim as unknown as { damagePlayer: Sim["damageEnemy"] }).damagePlayer;
        for (let i = 0; i < RECENT_HITS_KEPT + 5; i++) {
            sim.player.hp = sim.player.maxHp;
            sim.player.invulnerable = 0;
            (damagePlayer as unknown as (...args: unknown[]) => number).call(
                sim,
                3,
                "goblin",
                false,
                undefined,
                false,
                false,
            );
        }
        const hits = sim.heroes[0].recentHitsTaken;
        expect(hits).toHaveLength(RECENT_HITS_KEPT);
        expect(hits.every((hit) => hit.enemyId === "goblin" && hit.amount > 0)).toBe(true);
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
