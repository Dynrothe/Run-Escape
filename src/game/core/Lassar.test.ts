import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { LASSAR_REALM, LOST_SOUL_ID } from "../content/lassar";
import { getMap } from "../content/maps";
import { emptyStats } from "../content/types";
import { HeroOptions, Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import { usePortableMath } from "./fmath";
import { syncHash } from "./lockstep";
import { RealmRule } from "./rules/RealmRule";
import { isTaskDone } from "./save";
import { makeGrid } from "./world/testGrid";

// The Lassar Undercity in a run: its city and Shadow Realm (RealmRule), the party turning between
// them, sanity, the lost souls and the portal, and its two adventurers' traits. The map's own grid
// needs the cache, so these play on an open field; the rule only reads the grid it's given.

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
        mapId: "lassar_undercity",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        ...options,
    });
}

function realmOf(sim: Sim): RealmRule {
    return sim.realm!;
}

function steps(sim: Sim, seconds: number): void {
    for (let i = 0; i < Math.round(seconds * TICKS_PER_SECOND); i++) {
        sim.step(0, 0);
    }
}

// Nobody hurt or killing, so only the rule moves things
function quiet(sim: Sim): void {
    for (const h of sim.heroes) {
        h.weapons = [];
        h.player.maxHp = h.player.hp = 100000;
    }
}

// The puddle opened right under the first hero, and walked into
function intoPuddle(sim: Sim): void {
    const realm = realmOf(sim);
    const { x, y } = sim.heroes[0].player;
    realm.puddle = { x, y, openTick: sim.tick, closeTick: sim.tick + 15 * TICKS_PER_SECOND };
    steps(sim, LASSAR_REALM.puddles.pull + 0.2);
}

describe("the Lassar Undercity", () => {
    afterEach(() => usePortableMath(false));

    test("is played by its city and realm, with the realm drawn as its twin", () => {
        const sim = createSim();
        expect(sim.rule?.def).toBe(LASSAR_REALM);
        expect(sim.realm).toBe(sim.rule);
        expect(getMap("lassar_undercity").twin).toBeDefined();
        expect(getMap("lassar_undercity").act?.requires).toBe("inferno");
    });

    test("a puddle opens near the party from 1:30, and closes if nobody walks in", () => {
        const sim = createSim();
        quiet(sim);
        const realm = realmOf(sim);
        steps(sim, LASSAR_REALM.puddles.from - 1);
        expect(realm.puddle).toBeUndefined();
        steps(sim, 1.5);
        const puddle = realm.puddle!;
        const { x, y } = sim.player;
        const away = Math.hypot(puddle.x - x, puddle.y - y);
        expect(away).toBeGreaterThanOrEqual(LASSAR_REALM.puddles.distance[0] - 1);
        expect(away).toBeLessThanOrEqual(LASSAR_REALM.puddles.distance[1] + 1);
        steps(sim, LASSAR_REALM.puddles.open + 0.5);
        expect(realm.puddle).toBeUndefined();
        expect(realm.layer).toBe(0);
    });

    test("walking into one pulls the party in a moment later, and the city waits as it was", () => {
        const sim = createSim();
        quiet(sim);
        const hand = sim.spawnEnemy(getEnemy("lassar_hand"), "normal", {
            x: sim.player.x + 6,
            y: sim.player.y,
        })!;
        intoPuddle(sim);
        expect(realmOf(sim).layer).toBe(1);
        const at = { x: hand.x, y: hand.y };
        // The city's crowd is kept aside, not in the run, until the party's back
        expect(sim.enemies.includes(hand)).toBe(false);
        steps(sim, 2);
        expect({ x: hand.x, y: hand.y }).toEqual(at);
        // In the realm: its own waves, and its lost souls to catch
        expect(sim.enemies.filter((e) => e.def.id === LOST_SOUL_ID)).toHaveLength(
            LASSAR_REALM.souls.count,
        );
    });

    test("catching every soul opens the portal, and stepping in takes the party back", () => {
        const sim = createSim();
        quiet(sim);
        intoPuddle(sim);
        const realm = realmOf(sim);
        for (const soul of sim.enemies.filter((e) => e.def.id === LOST_SOUL_ID)) {
            soul.x = sim.player.x;
            soul.y = sim.player.y;
            sim.step(0, 0);
        }
        expect(realm.caught).toBe(LASSAR_REALM.souls.count);
        expect(realm.portal).toBeDefined();
        expect(realm.layer).toBe(1);
        steps(sim, 1.2);
        expect(realm.layer).toBe(0);
        // The realm's souls don't wait for next time
        expect(sim.enemies.some((e) => e.def.id === LOST_SOUL_ID)).toBe(false);
    });

    test("sanity drains in the realm, and at none the party's thrown back hurt", () => {
        const sim = createSim();
        quiet(sim);
        const realm = realmOf(sim);
        intoPuddle(sim);
        // The souls kept away
        for (const soul of sim.enemies.filter((e) => e.def.caught)) {
            soul.x = sim.player.x + 30;
        }
        const before = sim.player.hp;
        steps(sim, 5);
        expect(realm.sanityOf(0)).toBeLessThanOrEqual(100 - 5 * LASSAR_REALM.sanity.drain);
        expect(realm.sanityOf(0)).toBeGreaterThan(100 - 6 * LASSAR_REALM.sanity.drain);
        steps(sim, LASSAR_REALM.sanity.max / LASSAR_REALM.sanity.drain);
        expect(realm.layer).toBe(0);
        expect(before - sim.player.hp).toBeGreaterThanOrEqual(
            Math.floor(sim.player.maxHp * LASSAR_REALM.sanity.lapse),
        );
        // Back in the city it refills
        steps(sim, 3);
        expect(realm.sanityOf(0)).toBeGreaterThan(25);
    });

    test("from 4:00 each dive brings one of the realm's elites, casket and all", () => {
        const sim = createSim();
        quiet(sim);
        const elites = () => sim.enemies.filter((e) => e.elite && e.def.id === "shadow_keeper");
        intoPuddle(sim);
        expect(elites()).toHaveLength(0);
        sim.realm!.turn(
            (sim as unknown as { ruleHost: Parameters<RealmRule["turn"]>[0] }).ruleHost,
            0,
        );
        steps(sim, LASSAR_REALM.elite!.from);
        intoPuddle(sim);
        expect(elites()).toHaveLength(1);
    });

    test("the realm's drops are richer", () => {
        const sim = createSim();
        quiet(sim);
        const xp = (dive: boolean) => {
            if (dive) {
                intoPuddle(sim);
            }
            const hand = sim.spawnEnemy(getEnemy("lassar_hand"), "normal", {
                x: sim.player.x + 20,
                y: sim.player.y,
            })!;
            sim.damageEnemy(hand, 1e6, 0, hand.x, hand.y);
            sim.step(0, 0);
            const bones = sim.pickups.filter((p) => p.kind === "bones");
            return bones[bones.length - 1].value;
        };
        const city = xp(false);
        expect(xp(true)).toBe(city * LASSAR_REALM.drops.bones);
    });

    test("in co-op the whole party goes, and each player's sanity is their own", () => {
        usePortableMath(true);
        const sim = createSim({ party: [hero("warrior"), hero("wizard")], focus: 0 });
        quiet(sim);
        const [, b] = sim.heroes;
        b.player.x = sim.heroes[0].player.x + 15;
        intoPuddle(sim);
        const realm = realmOf(sim);
        expect(realm.layer).toBe(1);
        // A hit on one takes sanity from them alone
        realm.onHurt(1);
        expect(realm.sanityOf(1)).toBeLessThan(realm.sanityOf(0));
    });

    test("two copies of a co-op run turn between the worlds alike, tick for tick", () => {
        usePortableMath(true);
        const party = [hero("warrior"), hero("ranger")];
        const one = createSim({ party, focus: 0, seed: 7 });
        const two = createSim({ party, focus: 1, seed: 7 });
        for (let i = 0; i < 200 * TICKS_PER_SECOND; i++) {
            for (const sim of [one, two]) {
                // Both walk to the puddle when there's one
                const puddle = sim.realm!.puddle;
                const p = sim.heroes[0].player;
                const move = puddle ? { x: puddle.x - p.x, y: puddle.y - p.y } : { x: 0, y: 0 };
                const length = Math.hypot(move.x, move.y) || 1;
                sim.setInput(0, move.x / length, move.y / length);
                sim.setInput(1, 0, 0);
                sim.step();
            }
            if (i % TICKS_PER_SECOND === 0) {
                expect(syncHash(one)).toBe(syncHash(two));
            }
        }
        expect(syncHash(one)).toBe(syncHash(two));
    });

    test("the Shadow Keeper drags the party in, and the Whisperer goes with it", () => {
        const sim = createSim();
        quiet(sim);
        const keeper = sim.spawnEnemy(getEnemy("shadow_keeper_boss"), "boss", {
            x: sim.player.x + 4,
            y: sim.player.y,
        })!;
        realmOf(sim).turn(
            (sim as unknown as { ruleHost: Parameters<RealmRule["turn"]>[0] }).ruleHost,
            1,
        );
        expect(sim.enemies.includes(keeper)).toBe(true);
        const whisperer = getEnemy("whisperer");
        expect(whisperer.realm).toBe("both");
        expect(getEnemy("shadow_keeper_boss").realm).toBe("drags");
        expect(whisperer.boss?.summonsAt?.every((s) => s.realm)).toBe(true);
    });
});

describe("Lassar's adventurers", () => {
    test("the Shadow walker steps between a big hit, once in a while, into the realm", () => {
        const sim = createSim({ characterId: "shadow_walker" });
        sim.heroes[0].weapons = [];
        const trait = getCharacter("shadow_walker").trait!;
        expect(trait.kind).toBe("step");
        const { player } = sim;
        player.invulnerable = 0;
        const hp = player.hp;
        const from = { x: player.x, y: player.y };
        const big = Math.ceil(player.maxHp * 0.5);
        (
            sim as unknown as { damagePlayer(d: number, e: string, el: boolean): number }
        ).damagePlayer(big, "lassar_hand", false);
        expect(player.hp).toBe(hp);
        expect(Math.hypot(player.x - from.x, player.y - from.y)).toBeGreaterThan(1);
        sim.step(0, 0);
        expect(realmOf(sim).layer).toBe(1);
        // Not ready again for a while
        player.invulnerable = 0;
        (
            sim as unknown as { damagePlayer(d: number, e: string, el: boolean): number }
        ).damagePlayer(big, "lassar_hand", false);
        expect(player.hp).toBeLessThan(hp);
    });

    test("the Treasure hunter's caskets bury themselves, and come up a tier better", () => {
        const sim = createSim({ characterId: "treasure_hunter" });
        quiet(sim);
        sim.pickups.push({
            uid: 99999,
            kind: "casket",
            tier: "easy",
            x: sim.player.x + 20,
            y: sim.player.y,
            prevX: 0,
            prevY: 0,
            value: 1,
            attracted: false,
            speed: 0,
            spawnTick: sim.tick,
            pileUid: 0,
        });
        const casket = sim.pickups[sim.pickups.length - 1];
        steps(sim, 5);
        expect(sim.digState(casket)).toBe("buried");
        steps(sim, 16);
        expect(sim.digState(casket)).toBe("dug");
        expect(casket.tier).toBe("medium");
        steps(sim, 40);
        expect(sim.pickups.includes(casket)).toBe(false);
    });

    test("the Treasure hunter joins for five caskets opened in the realm in one run", () => {
        const task = getCharacter("treasure_hunter").unlock!;
        const run = { mapId: "lassar_undercity", victory: false, seconds: 60, level: 1, kills: 0 };
        const save = { mapVictories: {}, hardVictories: {}, trophies: [] } as never;
        const summary = { ...run, coins: 0, bossesKilled: [] };
        expect(isTaskDone(save, task, { ...summary, realmCaskets: 4 })).toBe(false);
        expect(isTaskDone(save, task, { ...summary, realmCaskets: 5 })).toBe(true);
    });
});
