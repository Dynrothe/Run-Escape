import { getEnemy } from "../content/enemies";
import { emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { hasBadNumber } from "../core/lockstep";
import { makeGrid } from "../core/world/testGrid";
import { PLAYER_COLORS, getPlayerResultViews } from "./RunStatsViews";

function createParty(focus = 1): Sim {
    return new Sim({
        grid: makeGrid(Array(72).fill(".".repeat(72)), 1000, 1000),
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 5,
        spawnX: 1036.5,
        spawnY: 1036.5,
        party: ["Alice", "Bob", "Charlie"].map((name) => ({
            name,
            characterId: "warrior",
            metaStats: emptyStats(),
        })),
        focus,
    });
}

describe("player result views", () => {
    test("credits kills, damage and caskets to each player while preserving shared rewards", () => {
        const sim = createParty();
        const damage = [0, 0, 0];
        for (const hero of sim.heroes) {
            sim.as(hero.index, () => {
                for (let i = 0; i <= hero.index; i++) {
                    const enemy = sim.spawnEnemy(getEnemy("goblin"), "normal")!;
                    damage[hero.index] += sim.damageEnemy(enemy, 1000, 0, enemy.x, enemy.y);
                    sim.openCasket("easy");
                }
                sim.player.hp = 10;
                sim.heal(5 + hero.index);
            });
        }
        sim.heroes[0].down = true;
        sim.leave(2);
        const shared = sim.getResult();
        const views = getPlayerResultViews(sim);
        expect(views.map((view) => view.kills)).toEqual([1, 2, 3]);
        expect(views.map((view) => view.caskets)).toEqual([1, 2, 3]);
        expect(views.map((view) => view.damageDealt)).toEqual(damage);
        expect(views.map((view) => view.healed)).toEqual([5, 6, 7]);
        expect(views.map((view) => view.isLocal)).toEqual([false, true, false]);
        expect(views[0].down).toBe(true);
        expect(views[2].left).toBe(true);
        expect(views.reduce((total, view) => total + view.kills, 0)).toBe(shared.kills);
        expect(views.reduce((total, view) => total + view.caskets, 0)).toBe(shared.caskets);
        expect(sim.player).toBe(sim.heroes[sim.focus].player);
        expect(sim.getResult()).toEqual(shared);
    });

    test("uses each player's own weapon tier, even with the same adventurer and weapon", () => {
        const sim = createParty();
        sim.tick = 10 * TICKS_PER_SECOND;
        sim.heroes[0].weapons[0].level = 1;
        sim.heroes[1].weapons[0].level = 3;
        sim.heroes[0].damageBySource["weapon:scimitar"] = 100;
        sim.heroes[1].damageBySource["weapon:scimitar"] = 250;
        const views = getPlayerResultViews(sim);
        for (const hero of sim.heroes.slice(0, 2)) {
            const weapon = hero.weapons[0];
            expect(views[hero.index].damage[0]).toMatchObject({
                name: weapon.def.levels[weapon.level - 1].name,
                iconObjId: weapon.def.levels[weapon.level - 1].objId,
            });
        }
        expect(views[0].damage[0].perSecond).toBe(10);
        expect(views[1].damage[0].perSecond).toBe(25);
        expect(views[2].damage[0].damage).toBe(0);
        expect(views[2].kills).toBe(0);
        // Results stay readable after the live simulation changes or is discarded.
        sim.heroes[0].damageBySource["weapon:scimitar"] = 999;
        sim.heroes[0].weapons[0].level = 2;
        expect(views[0].damage[0].damage).toBe(100);
    });

    test("a weapon's time stops when its player goes down or leaves", () => {
        const sim = createParty();
        for (const hero of sim.heroes) {
            hero.revivesLeft = 0;
            hero.damageBySource["weapon:scimitar"] = 100;
        }
        sim.tick = 10 * TICKS_PER_SECOND;
        sim.as(0, () => sim["damagePlayer"](99999, "goblin", false));
        sim.leave(2);
        sim.tick = 40 * TICKS_PER_SECOND;
        const views = getPlayerResultViews(sim);
        expect(views[0].down).toBe(true);
        expect(views[2].left).toBe(true);
        expect(views.map((view) => view.damage[0].perSecond)).toEqual([10, 2.5, 10]);
    });

    test("carries each player's revives, falls, boss damage, time up, place and colour", () => {
        const sim = createParty();
        for (const hero of sim.heroes) {
            hero.revivesLeft = 0;
        }
        sim.tick = 5 * TICKS_PER_SECOND;
        sim.as(1, () => sim["damagePlayer"](99999, "goblin", false));
        sim.tick = 8 * TICKS_PER_SECOND;
        sim["reviveHero"](sim.heroes[1], sim.heroes[0]);
        sim.tick = 20 * TICKS_PER_SECOND;
        sim.as(2, () =>
            sim.damageEnemy(sim.spawnEnemy(getEnemy("kalphite_queen"), "boss")!, 30, 0, 0, 0),
        );
        sim.leave(2);
        sim.tick = 40 * TICKS_PER_SECOND;
        const views = getPlayerResultViews(sim);
        expect(views.map((view) => view.revivesGiven)).toEqual([1, 0, 0]);
        expect(views.map((view) => view.timesDowned)).toEqual([0, 1, 0]);
        expect(views[2].bossDamage).toBeGreaterThan(0);
        expect(views[0].bossDamage + views[1].bossDamage).toBe(0);
        // Three seconds down are not counted; the leaver's time stops when they go
        expect(views.map((view) => view.aliveSeconds)).toEqual([40, 37, 20]);
        expect(views.map((view) => view.index)).toEqual([0, 1, 2]);
        expect(new Set(views.map((view) => view.color)).size).toBe(3);
        expect(views.map((view) => view.color)).toEqual(PLAYER_COLORS.slice(0, 3));
        expect(views.some(hasBadNumber)).toBe(false);
        // The same colours every time
        expect(getPlayerResultViews(sim).map((view) => view.color)).toEqual(
            views.map((view) => view.color),
        );
    });

    test("a run on your own has its numbers too", () => {
        const sim = new Sim({
            grid: makeGrid(Array(72).fill(".".repeat(72)), 1000, 1000),
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 5,
            spawnX: 1036.5,
            spawnY: 1036.5,
        });
        sim.tick = 12 * TICKS_PER_SECOND;
        const [view] = getPlayerResultViews(sim);
        expect(view).toMatchObject({
            revivesGiven: 0,
            timesDowned: 0,
            bossDamage: 0,
            aliveSeconds: 12,
            index: 0,
        });
    });
});
