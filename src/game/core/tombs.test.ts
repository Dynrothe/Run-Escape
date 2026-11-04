import { afterAll, describe, expect, it } from "vitest";

import { getEnemy } from "../content/enemies";
import {
    INVOCATIONS,
    INVOCATION_GROUPS,
    TOMBS_UNIQUES,
    cleanInvocations,
    getRaidBand,
    getRaidLevel,
    getRaidLevelScale,
    toggleInvocation,
} from "../content/invocations";
import { MAP_BY_ID, getMap } from "../content/maps";
import { APMEKEN, APMEKEN_WAVES, TOMBS_BOSSES } from "../content/tombs";
import { MapDef, emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { createSave, migrateSave } from "./save";
import { makeGrid } from "./world/testGrid";

function field(): string[] {
    return Array.from({ length: 72 }, (_, y) =>
        Array.from({ length: 72 }, (_, x) =>
            x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".",
        ).join(""),
    );
}

const lumbridge = getMap("lumbridge");

// A Nexus in an open field, with a door 6 tiles east of where the party starts
const TEST_TOMBS: MapDef = {
    ...lumbridge,
    id: "test_tombs",
    waves: [],
    events: [],
    tombs: {
        nexus: { x: 1036.5, y: 1036.5 },
        paths: [
            { id: "het", name: "Path of Het", door: { x: 1042.5, y: 1036.5 } },
            {
                id: "apmeken",
                name: "Path of Apmeken",
                door: { x: 1030.5, y: 1036.5 },
                room: {
                    arrive: { x: 1036.5, y: 1060.5 },
                    puzzle: "apmeken",
                    spots: [
                        { kind: "pillar", x: 1030.5, y: 1066.5, reach: 2.7 },
                        { kind: "vent", x: 1042.5, y: 1066.5, reach: 1.7 },
                    ],
                    boss: {
                        enemyId: "ba_ba",
                        arrive: { x: 1036.5, y: 1020.5 },
                        at: { x: 1036.5, y: 1040.5 },
                        line: { y: 1026 },
                        boulders: {
                            altar: { x: 1036.5, y: 1046.5 },
                            start: { x: 1031.5, y: 1028.5 },
                            pit: { x0: 1035, x1: 1038, y0: 1020, y1: 1026.9 },
                        },
                    },
                },
            },
        ],
    },
};
MAP_BY_ID.set(TEST_TOMBS.id, TEST_TOMBS);
afterAll(() => {
    MAP_BY_ID.delete(TEST_TOMBS.id);
});

function tombs(invocations: string[], hard = false): Sim {
    return new Sim({
        grid: makeGrid(field(), 1000, 1000),
        mapId: TEST_TOMBS.id,
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        invocations,
        hard,
    });
}

describe("invocations", () => {
    it("are each in a group, with a raid level, and named once", () => {
        const groups = new Set(INVOCATION_GROUPS.map((group) => group.id));
        for (const invocation of INVOCATIONS) {
            expect(groups.has(invocation.group), invocation.id).toBe(true);
            expect(invocation.level, invocation.id).toBeGreaterThan(0);
        }
        expect(new Set(INVOCATIONS.map((i) => i.id)).size).toBe(INVOCATIONS.length);
    });

    it("allow one of a group that says so, the last picked, and stack the rest", () => {
        expect(cleanInvocations(["try_again", "hardcore_run"])).toEqual(["hardcore_run"]);
        expect(toggleInvocation(["try_again", "on_a_diet"], "persistence")).toEqual([
            "on_a_diet",
            "persistence",
        ]);
        expect(toggleInvocation(["on_a_diet", "dehydration"], "on_a_diet")).toEqual([
            "dehydration",
        ]);
        expect(cleanInvocations(["on_a_diet", "not_one", 4, "on_a_diet"])).toEqual(["on_a_diet"]);
    });

    it("add up to a raid level, in OSRS's bands", () => {
        expect(getRaidLevel([])).toBe(0);
        expect(getRaidLevel(["hardcore_run", "on_a_diet", "boulderdash"])).toBe(50);
        // Only the one attempts invocation counts
        expect(getRaidLevel(["try_again", "hardcore_run"])).toBe(25);
        expect([getRaidBand(0), getRaidBand(149), getRaidBand(150), getRaidBand(300)]).toEqual([
            "Entry",
            "Entry",
            "Normal",
            "Expert",
        ]);
    });

    it("make enemies 2% tougher every 5 levels, their damage to 150% more", () => {
        expect(getRaidLevelScale(0)).toEqual({ hp: 1, damage: 1 });
        expect(getRaidLevelScale(9).hp).toBeCloseTo(1.02);
        expect(getRaidLevelScale(150).hp).toBeCloseTo(1.6);
        expect(getRaidLevelScale(500).hp).toBeCloseTo(3);
        expect(getRaidLevelScale(500).damage).toBeCloseTo(2.5);
    });

    it("show each unique from its raid level, as OSRS's chest has them", () => {
        const at = (level: number) =>
            TOMBS_UNIQUES.filter((unique) => level >= unique.minLevel).map((unique) => unique.name);
        expect(at(0)).not.toContain("Osmumten's fang");
        expect(at(0)).toContain("Tumeken's guardian");
        expect(at(50)).toEqual(expect.arrayContaining(["Osmumten's fang", "Lightbearer"]));
        expect(at(149)).not.toContain("Tumeken's shadow (uncharged)");
        expect(at(150)).toHaveLength(TOMBS_UNIQUES.length);
    });

    it("are kept in the save, as only what this game knows", () => {
        const save = createSave();
        expect(
            migrateSave({ ...save, invocations: ["hardcore_run", "nope", "try_again"] }),
        ).toMatchObject({ invocations: ["try_again"] });
        expect(migrateSave(save).invocations).toBeUndefined();
    });
});

describe("the Tombs of Amascut", () => {
    it("go by the raid level in place of hard mode", () => {
        const plain = tombs([], true);
        expect(plain.hard).toBe(false);
        expect(plain.raidLevel).toBe(0);
        const tough = tombs(["hardcore_run", "pathmaster", "dehydration"]);
        expect(tough.raidLevel).toBe(105);
        const goblin = getEnemy("goblin");
        const easy = plain.spawnEnemy(goblin, "normal")!;
        const hard = tough.spawnEnemy(goblin, "normal")!;
        expect(hard.maxHp / easy.maxHp).toBeCloseTo(getRaidLevelScale(105).hp, 1);
        expect(hard.damageScale).toBeGreaterThan(easy.damageScale);
    });

    it("ignore invocations anywhere else", () => {
        const sim = new Sim({
            grid: makeGrid(field(), 1000, 1000),
            mapId: "lumbridge",
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: 1036.5,
            spawnY: 1036.5,
            invocations: ["hardcore_run"],
        });
        expect(sim.invocations).toEqual([]);
        expect(sim.raidLevel).toBe(0);
    });

    it("stop the run's clock in the Nexus, and start it again in a path's room", () => {
        const sim = tombs([]);
        sim.weapons = [];
        seconds(sim, 3);
        expect(sim.seconds).toBe(0);
        sim.player.x = sim.player.prevX = 1031;
        sim.step();
        expect(sim.tombsPath).toBe("apmeken");
        seconds(sim, 2, { x: 1036.5, y: 1060.5 });
        expect(sim.seconds).toBeCloseTo(2, 1);
    });

    it("take the party into a path's room through its door", () => {
        const sim = tombs([]);
        sim.weapons = [];
        sim.dropPickup("coins", 1040.5, 1030.5, 5);
        sim.player.x = sim.player.prevX = 1031;
        sim.step();
        expect(sim.tombsPath).toBe("apmeken");
        expect(sim.player.x).toBeCloseTo(1036.5);
        expect(sim.player.y).toBeCloseTo(1060.5);
        expect(
            sim.takeEvents().some((e) => e.type === "notice" && e.message.includes("Apmeken")),
        ).toBe(true);
    });

    it("say a path's door isn't open yet, once as you come up to it", () => {
        const sim = tombs([]);
        sim.weapons = [];
        const notices = () =>
            sim
                .takeEvents()
                .filter((e) => e.type === "notice" && e.message.includes("Path of Het"));
        sim.step();
        expect(notices()).toHaveLength(0);
        sim.player.x = sim.player.prevX = 1041;
        sim.step();
        expect(notices()).toHaveLength(1);
        sim.step();
        sim.step();
        expect(notices()).toHaveLength(0);
        // Away and back: it says so again
        sim.player.x = sim.player.prevX = 1036.5;
        sim.step();
        sim.player.x = sim.player.prevX = 1041;
        sim.step();
        expect(notices()).toHaveLength(1);
    });
});

// Into the Apmeken room, with nothing of the player's own fighting
function apmeken(invocations: string[] = []): Sim {
    const sim = tombs(invocations);
    sim.weapons = [];
    sim.player.x = sim.player.prevX = 1031;
    sim.step();
    expect(sim.tombsPath).toBe("apmeken");
    return sim;
}

// A second at a time, through what pauses a run, the player kept alive
function seconds(sim: Sim, count: number, at?: { x: number; y: number }): void {
    for (let i = 0; i < count * TICKS_PER_SECOND && !sim.runOver; i++) {
        sim.player.invulnerable = 0;
        sim.player.hp = sim.player.maxHp;
        if (at) {
            sim.player.x = sim.player.prevX = at.x;
            sim.player.y = sim.player.prevY = at.y;
        }
        if (sim.state === "levelUp") {
            sim.choose(0);
        }
        if (sim.state === "chest") {
            sim.resolveChest("take");
        }
        if (sim.state === "event") {
            sim.leaveEvent();
        }
        sim.step();
    }
}

// Out of the walls one at a time: on until the whole wave's out
function allOut(sim: Sim): void {
    for (let i = 0; i < 40 && sim.apmeken!.pending.length > 0; i++) {
        seconds(sim, APMEKEN.stagger, { x: sim.player.x, y: sim.player.y });
    }
    expect(sim.apmeken!.pending).toHaveLength(0);
}

function killGroup(sim: Sim): void {
    allOut(sim);
    const group = new Set(sim.apmeken!.group);
    for (const enemy of sim.enemies) {
        if (group.has(enemy.uid) && !enemy.dead) {
            sim.damageEnemy(enemy, 1e9, 0, enemy.x, enemy.y);
        }
    }
}

describe("the Apmeken room", () => {
    it("sends its first wave as the party comes in, out of the walls one at a time", () => {
        const sim = apmeken();
        expect(sim.apmeken!.wave).toBe(0);
        expect(sim.apmeken!.group).toHaveLength(1);
        expect(sim.apmeken!.pending).toHaveLength(APMEKEN_WAVES[0].length - 1);
        allOut(sim);
        const group = sim.enemies.filter((e) => sim.apmeken!.group.includes(e.uid));
        expect(group.map((e) => e.def.id).sort()).toEqual([...APMEKEN_WAVES[0]].sort());
    });

    it("sends the next wave once one's beaten, with a casket for it", () => {
        const sim = apmeken();
        killGroup(sim);
        sim.step();
        expect(sim.apmeken!.wave).toBe(1);
        expect(sim.pickups.some((p) => p.kind === "casket")).toBe(true);
    });

    it("sends the next anyway once a wave's been about too long", () => {
        const sim = apmeken();
        seconds(sim, APMEKEN.waveSeconds + 1, { x: 1036.5, y: 1060.5 });
        expect(sim.apmeken!.wave).toBeGreaterThanOrEqual(1);
    });

    it("has an issue come up, fixed by standing at it", () => {
        const sim = apmeken();
        seconds(sim, APMEKEN.issueEvery + 0.5, { x: 1036.5, y: 1060.5 });
        const issue = sim.tombsIssue!;
        expect(issue).toBeDefined();
        seconds(sim, APMEKEN.fixSeconds[issue.kind] + 0.2, { x: issue.x, y: issue.y - 1 });
        expect(sim.tombsIssue).toBeUndefined();
        expect(sim.apmeken!.missed).toBe(0);
    });

    it("hurts everyone for an issue left too long, and more for the next", () => {
        const sim = apmeken();
        seconds(sim, APMEKEN.issueEvery + 0.5, { x: 1036.5, y: 1060.5 });
        expect(sim.tombsIssue).toBeDefined();
        const taken = sim.damageTaken;
        seconds(sim, APMEKEN.deadline + 0.5, { x: 1036.5, y: 1060.5 });
        expect(sim.tombsIssue).toBeUndefined();
        expect(sim.apmeken!.missed).toBe(1);
        expect(sim.damageTaken).toBeGreaterThan(taken);
    });

    it("is done after its eighth wave, back to the Nexus, its door done", () => {
        const sim = apmeken();
        for (let wave = 0; wave < APMEKEN_WAVES.length; wave++) {
            killGroup(sim);
            sim.step();
        }
        expect(sim.apmeken!.doneTick).toBeDefined();
        // On to Ba-Ba: she rises once someone's walked in, and the path's done once she's dead
        seconds(sim, 3.5, { x: 1036.5, y: 1020.5 });
        expect(sim.apmeken!.boss).toEqual({ uid: -1, beatenTick: undefined });
        seconds(sim, 0.2, { x: 1036.5, y: 1028.5 });
        const baba = sim.enemies.find((e) => e.def.id === "ba_ba" && !e.dead)!;
        expect(baba).toBeDefined();
        sim.damageEnemy(baba, 1e9, 0, baba.x, baba.y);
        // Its death plays out, then back to the Nexus (nothing holding the player meanwhile)
        for (let i = 0; i < 400 && sim.tombsPath !== undefined; i++) {
            sim.player.invulnerable = 1e6;
            if (sim.state === "levelUp") {
                sim.choose(0);
            }
            if (sim.state === "chest") {
                sim.resolveChest("take");
            }
            sim.step();
        }
        expect(sim.tombsPath).toBeUndefined();
        expect(sim.tombsPathsDone).toEqual(["apmeken"]);
        expect(sim.player.x).toBeCloseTo(1036.5);
        expect(sim.player.y).toBeCloseTo(1036.5);
        // Its level ups answered, then up to its door: it's done
        seconds(sim, 0.2, { x: 1036.5, y: 1036.5 });
        sim.takeEvents();
        seconds(sim, 0.1, { x: 1031, y: 1036.5 });
        expect(sim.tombsPath).toBeUndefined();
        expect(
            sim.takeEvents().some((e) => e.type === "notice" && e.message.includes("done")),
        ).toBe(true);
    });

    it("is quicker and bigger at a path level, and with the paths done before it", () => {
        expect(apmeken().tombsPathLevel).toBe(0);
        const master = apmeken(["pathmaster"]);
        expect(master.tombsPathLevel).toBe(3);
        const room = master.apmeken!;
        expect(room.group.length + room.pending.length).toBe(APMEKEN_WAVES[0].length + 3);
    });
});

describe("the Tombs' invocations", () => {
    it("drop no food on a diet", () => {
        const plain = apmeken();
        const diet = apmeken(["on_a_diet"]);
        for (const sim of [plain, diet]) {
            for (let i = 0; i < 400; i++) {
                const enemy = sim.spawnEnemy(getEnemy("baboon_thrall"), "normal")!;
                sim.damageEnemy(enemy, 1e9, 0, enemy.x, enemy.y);
            }
        }
        expect(plain.pickups.some((p) => p.kind === "food")).toBe(true);
        expect(diet.pickups.some((p) => p.kind === "food")).toBe(false);
    });

    it("let armour stop less with Quiet Prayers, and a second hit land harder with Deadly", () => {
        const hit = (invocations: string[], twice: boolean) => {
            const sim = tombs(invocations);
            sim.stats.armor = 4;
            const taken = sim.damageTaken;
            sim["damagePlayer"](20, "test", false);
            if (twice) {
                sim.player.invulnerable = 0;
                sim["damagePlayer"](20, "test", false);
            }
            return sim.damageTaken - taken;
        };
        expect(hit([], false)).toBe(16);
        expect(hit(["quiet_prayers"], false)).toBe(Math.round(20 - 4 * 0.9));
        expect(hit([], true)).toBe(32);
        expect(hit(["deadly_prayers"], true)).toBe(16 + Math.round(20 * 1.2 - 4));
    });
});

describe("a death in the Tombs", () => {
    // Down, and back in the safe corridor if the raid isn't over: the test map's room has no
    // barrier, so it starts again on the next step
    function die(sim: Sim): void {
        sim.revivesLeft = 0;
        sim.player.invulnerable = 0;
        sim["damagePlayer"](1e6, "test", false, undefined, true);
        if (!sim.runOver) {
            expect(sim.apmeken!.started).toBe(false);
            sim.step();
        }
    }

    it("waits in the safe corridor until someone's through the barrier, then holds it", () => {
        const room = TEST_TOMBS.tombs!.paths.find((p) => p.id === "apmeken")!.room!;
        room.gate = { x: 1030, locId: 45135, tiles: [] };
        try {
            const sim = apmeken();
            expect(sim.apmeken!.started).toBe(false);
            seconds(sim, 3, { x: 1036.5, y: 1060.5 });
            expect(sim.apmeken!.started).toBe(false);
            expect(sim.enemies.filter((e) => !e.dead)).toHaveLength(0);
            expect(sim.tombsGateShut).toBe(false);
            seconds(sim, 0.2, { x: 1028.5, y: 1060.5 });
            expect(sim.apmeken!.started).toBe(true);
            expect(sim.apmeken!.wave).toBe(0);
            expect(sim.tombsGateShut).toBe(true);
            // Shut: back east is a wall
            sim.player.x = sim.player.prevX = 1035;
            sim.step();
            expect(sim.player.x).toBeLessThanOrEqual(1030);
            // A death: back in the corridor, the room waiting again
            sim.revivesLeft = 0;
            sim.player.invulnerable = 0;
            sim["damagePlayer"](1e6, "test", false, undefined, true);
            expect(sim.runOver).toBe(false);
            expect(sim.apmeken!.started).toBe(false);
            expect(sim.tombsGateShut).toBe(false);
            expect(sim.player.x).toBeCloseTo(1036.5);
            expect(sim.player.hp).toBe(sim.player.maxHp);
        } finally {
            delete room.gate;
        }
    });

    it("in co-op, fails the room only once everyone's down", () => {
        const sim = new Sim({
            grid: makeGrid(field(), 1000, 1000),
            mapId: TEST_TOMBS.id,
            characterId: "",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: 1036.5,
            spawnY: 1036.5,
            party: ["warrior", "wizard"].map((characterId) => ({
                name: characterId,
                characterId,
                metaStats: emptyStats(),
            })),
        });
        for (const hero of sim.heroes) {
            sim.as(hero.index, () => {
                sim.weapons = [];
            });
        }
        sim.player.x = sim.player.prevX = 1031;
        sim.step();
        expect(sim.tombsPath).toBe("apmeken");
        const [a, b] = sim.heroes;
        const down = (hero: typeof a) =>
            sim.as(hero.index, () => {
                sim.revivesLeft = 0;
                sim.player.invulnerable = 0;
                sim["damagePlayer"](1e6, "test", false, undefined, true);
            });
        down(a);
        expect(a.down).toBe(true);
        expect(sim.state).toBe("playing");
        down(b);
        // Both down: back in the corridor, both up
        expect(sim.runOver).toBe(false);
        expect(a.down || b.down).toBe(false);
        expect(sim.tombsDeaths).toBe(1);
    });

    it("starts the room over instead of ending the run, everyone up on full hitpoints", () => {
        const sim = apmeken();
        killGroup(sim);
        sim.step();
        killGroup(sim);
        sim.step();
        expect(sim.apmeken!.wave).toBe(2);
        die(sim);
        expect(sim.runOver).toBe(false);
        expect(sim.tombsDeaths).toBe(1);
        expect(sim.player.hp).toBe(sim.player.maxHp);
        expect(sim.player.y).toBeCloseTo(1060.5);
        expect(sim.apmeken!.wave).toBe(0);
        expect(sim.apmeken!.beaten).toBe(1);
    });

    it("gives nothing for the waves beaten before, then as usual past them", () => {
        const sim = apmeken();
        killGroup(sim);
        sim.step();
        die(sim);
        expect(sim.tombsReplaying).toBe(true);
        const group = sim.enemies.filter((e) => sim.apmeken!.group.includes(e.uid));
        expect(group.every((e) => e.xp === 0)).toBe(true);
        const caskets = () => sim.pickups.filter((p) => p.kind === "casket").length;
        const before = caskets();
        killGroup(sim);
        sim.step();
        // Wave 1 again: no casket
        expect(caskets()).toBe(before);
        expect(sim.tombsReplaying).toBe(false);
        killGroup(sim);
        sim.step();
        expect(caskets()).toBe(before + 1);
    });

    it("has no limit, unless an Attempts invocation sets one", () => {
        expect(apmeken().tombsDeathsAllowed).toBe(Infinity);
        expect(apmeken(["try_again"]).tombsDeathsAllowed).toBe(10);
        const hardcore = apmeken(["hardcore_run"]);
        die(hardcore);
        expect(hardcore.runOver).toBe(true);
        const softcore = apmeken(["softcore_run"]);
        for (let i = 0; i < 3; i++) {
            die(softcore);
            expect(softcore.runOver).toBe(false);
        }
        die(softcore);
        expect(softcore.runOver).toBe(true);
    });
});

describe("Ba-Ba", () => {
    function atBaba(invocations: string[] = []): Sim {
        const sim = apmeken(invocations);
        expect(sim.devSkipToTombsBoss()).toBe(true);
        seconds(sim, 0.2, { x: 1036.5, y: 1028.5 });
        return sim;
    }
    const baba = (sim: Sim) => sim.enemies.find((e) => e.def.id === "ba_ba" && !e.dead)!;

    it("is skipped to from her room on the dev server, rising once someone walks in", () => {
        const sim = apmeken();
        expect(sim.devSkipToTombsBoss()).toBe(true);
        expect(sim.devSkipToTombsBoss()).toBe(false);
        seconds(sim, 1, { x: 1036.5, y: 1020.5 });
        expect(sim.enemies.some((e) => e.def.id === "ba_ba")).toBe(false);
        seconds(sim, 0.2, { x: 1036.5, y: 1028.5 });
        expect(baba(sim)).toBeDefined();
        // Up, the entrance is behind a line nobody goes back over
        sim.player.y = sim.player.prevY = 1020.5;
        sim.step();
        expect(sim.player.y).toBeGreaterThanOrEqual(1026);
    });

    it("starts over when the party dies to her, back at the arena's start", () => {
        const sim = atBaba();
        sim.revivesLeft = 0;
        sim.player.invulnerable = 0;
        sim["damagePlayer"](1e6, "test", false, undefined, true);
        expect(sim.runOver).toBe(false);
        expect(sim.player.y).toBeCloseTo(1020.5);
        expect(sim.apmeken!.boss!.uid).toBe(-1);
        seconds(sim, 0.2, { x: 1036.5, y: 1028.5 });
        const again = baba(sim);
        expect(again.hp).toBe(again.maxHp);
    });

    it("rolls her stones at two thirds: she can't be hurt, and only rolls boulders", () => {
        const sim = atBaba();
        const boss = baba(sim);
        boss.hp = Math.floor(boss.maxHp * 0.65);
        seconds(sim, 0.5, { x: 1036.5, y: 1028.5 });
        expect(boss.bossState!.ordeal).toBeDefined();
        expect(boss.bossState!.ordeal!.during.attacks).toEqual(["Rolling boulders"]);
        expect(boss.shieldEnd).toBeGreaterThan(sim.tick);
    });

    it("rolls her boulders twice as fast with Boulderdash, and a wider shockwave shaking things up", () => {
        const attack = (sim: Sim, name: string) =>
            sim["invokedAttack"](baba(sim).def.boss!.attacks.find((a) => a.name === name)!);
        const plain = atBaba();
        const dash = atBaba(["boulderdash", "shaking_things_up"]);
        expect(attack(dash, "Rolling boulders").pattern!.speed).toBe(
            attack(plain, "Rolling boulders").pattern!.speed * 2,
        );
        expect(attack(dash, "Shockwave").ground!.radius).toBeCloseTo(
            attack(plain, "Shockwave").ground!.radius * 1.4,
        );
        // The same copy each time
        expect(attack(dash, "Rolling boulders")).toBe(attack(dash, "Rolling boulders"));
    });

    it("breaks her boulder into shards where it lands", () => {
        const sim = atBaba();
        const boss = baba(sim);
        const boulder = boss.def.boss!.attacks.find((a) => a.name === "Boulder")!;
        const at = { x: sim.player.x, y: sim.player.y };
        sim["startBossAttack"](boss, boulder);
        const before = sim.bullets.count;
        seconds(sim, boulder.windup + 0.1, { x: at.x - 4, y: at.y });
        expect(sim.bullets.count).toBeGreaterThanOrEqual(before + boulder.shards!.count);
    });

    it("can't hurt the player in god mode, on the dev server", () => {
        const sim = atBaba();
        sim.devGod = true;
        sim.player.invulnerable = 0;
        const hp = sim.player.hp;
        expect(sim["damagePlayer"](50, "test", false)).toBe(0);
        expect(sim.player.hp).toBe(hp);
    });

    it("hands over a corrupted twisted bow from the dev skip, to do some damage with", () => {
        const sim = atBaba();
        expect(sim.weapons.some((w) => w.def.id === "corrupted_twisted_bow")).toBe(true);
    });

    // Down to her first boulders' share, and a couple of ticks for them to start
    function rolling(invocations: string[] = []): { sim: Sim; boss: ReturnType<typeof baba> } {
        const sim = atBaba(invocations);
        const boss = baba(sim);
        boss.hp = Math.floor(boss.maxHp * 0.66) - 1;
        sim.step();
        sim.step();
        expect(boss.bossState!.ordeal).toBeDefined();
        return { sim, boss };
    }

    it("goes up to her altar for her boulders, the party put at the arena's foot", () => {
        const { sim, boss } = rolling();
        expect(boss.x).toBeCloseTo(1036.5);
        expect(boss.y).toBeCloseTo(1046.5);
        expect(sim.player.x).toBeCloseTo(1031.5);
        expect(sim.player.y).toBeCloseTo(1028.5);
        // and stays there
        for (let i = 0; i < 2 * TICKS_PER_SECOND; i++) {
            sim.player.invulnerable = 0;
            sim.player.hp = sim.player.maxHp;
            sim.step();
        }
        expect(boss.y).toBeCloseTo(1046.5);
    });

    it("rolls her boulders straight down the arena, knocking whoever they hit back", () => {
        const { sim } = rolling();
        for (let i = 0; i < 3 * TICKS_PER_SECOND && sim.bullets.count === 0; i++) {
            sim.step();
        }
        const bullets = sim.bullets;
        expect(bullets.count).toBeGreaterThan(0);
        const slot = bullets.order[0];
        expect(bullets.vy[slot]).toBeLessThan(0);
        expect(Math.abs(bullets.vx[slot])).toBeLessThan(1e-6);
        // In its way
        sim.player.invulnerable = 0;
        sim.player.hp = sim.player.maxHp;
        sim.player.x = sim.player.prevX = bullets.x[slot];
        sim.player.y = sim.player.prevY = bullets.y[slot] - 0.5;
        const before = sim.player.y;
        sim.step();
        expect(sim.player.y).toBeLessThan(before - 3);
    });

    it("stops her boulders once someone gets back up to her", () => {
        const { sim, boss } = rolling();
        sim.player.x = sim.player.prevX = 1036.5;
        sim.player.y = sim.player.prevY = 1046.5 - 2.5;
        sim.step();
        sim.step();
        expect(boss.bossState!.ordeal).toBeUndefined();
    });

    it("opens the gap at the arena's foot with Mind the Gap, which kills", () => {
        expect(atBaba().tombsPit).toBeUndefined();
        const sim = atBaba(["mind_the_gap"]);
        expect(sim.tombsPit).toBeDefined();
        // Walking in over it, before she's up, is fine
        expect(sim.tombsDeaths).toBe(0);
        const deaths = sim.tombsDeaths;
        sim.player.invulnerable = 0;
        sim.player.x = sim.player.prevX = 1036.5;
        sim.player.y = sim.player.prevY = 1026.4;
        sim.step();
        expect(sim.tombsDeaths).toBe(deaths + 1);
    });

    it("puts the player back at the foot from the gap in god mode", () => {
        const sim = atBaba(["mind_the_gap"]);
        sim.devGod = true;
        sim.player.x = sim.player.prevX = 1036.5;
        sim.player.y = sim.player.prevY = 1026.4;
        sim.step();
        expect(sim.player.x).toBeCloseTo(1031.5, 0);
        expect(sim.player.y).toBeCloseTo(1028.5, 0);
    });

    it("leaves a banana peel where a baboon dies with Jungle Japes, which roots whoever steps on it", () => {
        const plain = atBaba();
        const one = plain.spawnEnemy(getEnemy("baboon_brawler"), "normal", {
            x: 1030.5,
            y: 1034.5,
        })!;
        plain["killEnemy"](one);
        expect(plain.tombsPeels).toHaveLength(0);
        const sim = atBaba(["jungle_japes"]);
        const baboon = sim.spawnEnemy(getEnemy("baboon_brawler"), "normal", {
            x: 1030.5,
            y: 1034.5,
        })!;
        sim["killEnemy"](baboon);
        expect(sim.tombsPeels).toHaveLength(1);
        const peel = sim.tombsPeels[0];
        sim.player.x = sim.player.prevX = peel.x;
        sim.player.y = sim.player.prevY = peel.y;
        sim.step();
        expect(sim.tombsPeels).toHaveLength(0);
        expect(sim.player.frozen).toBeGreaterThan(0);
    });

    it("rolls her boulders no further than the arena's foot", () => {
        const boulders = baba(atBaba()).def.boss!.attacks.find(
            (a) => a.name === "Rolling boulders",
        )!;
        // From her altar to her arena's foot, on the real map
        expect(boulders.pattern!.range).toBeLessThanOrEqual(22);
    });

    it("is tougher with each path level", () => {
        const first = baba(atBaba()).maxHp;
        // (and its raid level, which scales it too)
        expect(baba(atBaba(["pathfinder"])).maxHp).toBeGreaterThanOrEqual(
            Math.floor(first * (1 + 2 * TOMBS_BOSSES.levelHp)),
        );
    });
});
