import { afterAll, describe, expect, it } from "vitest";

import { getEnemy } from "../content/enemies";
import { MAP_BY_ID, RAID_MAPS, getMap } from "../content/maps";
import { EXPERT_NYLOCAS_KEEP, getRoomPoints } from "../content/raids";
import { TROPHIES, TROPHY_BY_ID } from "../content/trophies";
import { BossAttackDef, MapDef, RaidRoomDef, emptyStats } from "../content/types";
import { describeUnlockTask } from "../content/unlocks";
import { getWeapon } from "../content/weapons";
import { yawFromVector } from "./PlayerMovement";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { fm } from "./fmath";
import {
    createSave,
    getEarnedUnlocks,
    getRaidPortals,
    isEndlessUnlocked,
    isExpertUnlocked,
    isHardUnlocked,
    migrateSave,
    recordRun,
} from "./save";
import { makeGrid } from "./world/testGrid";

// A field split down the middle by a wall: a room each side, the top of each standing in for its
// boss room
function field(): string[] {
    const size = 72;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
        let row = "";
        for (let x = 0; x < size; x++) {
            const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
            row += edge || x === 36 ? "#" : ".";
        }
        rows.push(row);
    }
    return rows;
}

const lumbridge = getMap("lumbridge");

// A room at x, its hall at the bottom of the field and its boss room at the top
function room(x: number, boss: string, at: number): RaidRoomDef {
    return {
        name: boss,
        par: 40,
        start: { x: x + 0.5, y: 1010.5 },
        arrive: { x: x + 0.5, y: 1050.5 },
        bossAt: { x: x + 4.5, y: 1056.5 },
        chamber: { minX: x - 10, minY: 1045, maxX: x + 10, maxY: 1065 },
        teleporter: { x: x + 6, y: 1010.5 },
        at,
        waves: lumbridge.waves.slice(0, 2),
        events: [],
        boss,
        bossHp: 100,
    };
}

const TEST_RAID: MapDef = {
    ...lumbridge,
    id: "test_raid",
    events: [],
    raid: { rooms: [room(1018, "giant_rat", 30), room(1054, "giant_rat", 80)], minWaveSeconds: 0 },
};
MAP_BY_ID.set(TEST_RAID.id, TEST_RAID);
afterAll(() => {
    MAP_BY_ID.delete(TEST_RAID.id);
});

// raidTeleports: with a teleporter in every hall, as if each boss had been killed before
function raid(expert = false, raidTeleports = 0, raidPortals?: boolean[]): Sim {
    const sim = new Sim({
        grid: makeGrid(field(), 1000, 1000),
        mapId: TEST_RAID.id,
        expert,
        raidTeleports,
        raidPortals: raidPortals ?? TEST_RAID.raid!.rooms.map(() => raidTeleports > 0),
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1018.5,
        spawnY: 1010.5,
    });
    sim.heroes[0].weapons = [];
    sim.player.invulnerable = 1e6;
    return sim;
}

// On to a second of the room, through what that second brings
function toRoomSecond(sim: Sim, seconds: number): void {
    const target = sim.raidRoomStartTick + Math.round(seconds * TICKS_PER_SECOND);
    // Level ups, caskets and random events pause the run: they're skipped here
    for (let steps = 0; sim.tick < target && !sim.runOver; steps++) {
        expect(steps).toBeLessThan(100_000);
        sim.player.invulnerable = 1e6;
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

function killBosses(sim: Sim): void {
    for (const enemy of sim.enemies) {
        if (enemy.boss && !enemy.dead) {
            for (let hit = 0; hit < 20 && !enemy.dead; hit++) {
                sim.damageEnemy(enemy, 1e9, 0, sim.player.x, sim.player.y);
            }
            expect(enemy.dead).toBe(true);
        }
    }
    sim.step();
}

describe("raids", () => {
    it("brings what's left on the hall's floor to the boss, but not caskets", () => {
        const sim = raid();
        toRoomSecond(sim, 20);
        const { x, y } = sim.player;
        sim.dropPickup("bones", x + 12, y, 40);
        sim.dropPickup("coins", x - 12, y, 7);
        sim.dropPickup("casket", x, y + 12, 1);
        const xp = sim.xp;
        const coins = sim.coins;
        toRoomSecond(sim, 31);
        expect(sim.raidStage).toBe("boss");
        expect(sim.xp).toBeGreaterThan(xp);
        expect(sim.coins).toBeGreaterThan(coins);
        expect(sim.pickups.some((p) => p.kind === "bones" || p.kind === "coins")).toBe(false);
        expect(sim.pickups.some((p) => p.kind === "casket")).toBe(true);
    });

    it("has its waves in the first room, then takes the party into the boss's room", () => {
        const sim = raid();
        toRoomSecond(sim, 20);
        expect(sim.raidStage).toBe("waves");
        expect(sim.enemies.some((enemy) => !enemy.dead && !enemy.boss)).toBe(true);
        expect(sim.timeLeftForBoss).toBeCloseTo(10, 0);

        toRoomSecond(sim, 31);
        expect(sim.raidStage).toBe("boss");
        expect(sim.player.x).toBeCloseTo(1018.5);
        expect(sim.player.y).toBeCloseTo(1050.5);
        const alive = sim.enemies.filter((enemy) => !enemy.dead);
        expect(alive.map((enemy) => enemy.def.id)).toEqual(["giant_rat"]);
        expect(alive[0].finalBoss).toBe(false);
        // Where the room's boss turns up, give or take its first steps
        expect(Math.hypot(alive[0].x - 1022.5, alive[0].y - 1056.5)).toBeLessThan(3);
    });

    it("moves on to the next room once the boss is dead, and wins with the last boss", () => {
        const sim = raid();
        toRoomSecond(sim, 31);
        sim.takeEvents();
        killBosses(sim);
        expect(sim.raidStage).toBe("cleared");
        expect(sim.takeEvents().some((event) => event.type === "notice")).toBe(true);

        toRoomSecond(sim, 38);
        expect(sim.raidRoom).toBe(1);
        expect(sim.raidStage).toBe("waves");
        expect(sim.player.x).toBeCloseTo(1054.5);
        expect(sim.player.y).toBeCloseTo(1010.5);
        expect(sim.timeLeftForBoss).toBeGreaterThan(28);

        // Its boss is due 50 seconds into the room (the gap between the rooms' `at`)
        toRoomSecond(sim, 51);
        expect(sim.raidStage).toBe("boss");
        const boss = sim.enemies.find((enemy) => enemy.boss && !enemy.dead)!;
        expect(boss.def.id).toBe("giant_rat");
        expect(boss.finalBoss).toBe(true);
        sim.takeEvents();
        killBosses(sim);
        expect(sim.state).toBe("victory");
        // The last room's paid for too, and then there's the chest
        expect(sim.heroes[0].raidPointsEarned).toBe(400);
        const notices = sim.takeEvents().filter((event) => event.type === "notice");
        expect(notices.some((n) => n.type === "notice" && n.message.includes("chest"))).toBe(true);
        // And it's on the result, for the result screen
        const chest = sim.getResult().raidChest!;
        expect(chest.points).toBe(400);
        expect(chest.chance).toBeGreaterThan(0);
    });

    it("rolls the Theatre's uniques from its chest, more often with more points", () => {
        const sim = raid();
        Object.assign(sim, { map: getMap("theatre_of_blood") });
        const tob = TROPHIES.filter((t) => t.from.kind === "raid");
        sim.heroes[0].raidPointsEarned = 0;
        let few = 0;
        for (let i = 0; i < 200; i++) {
            sim.trophies.clear();
            sim["openRaidChest"]();
            few += sim.trophies.size;
        }
        sim.heroes[0].raidPointsEarned = 5000;
        let many = 0;
        for (let i = 0; i < 200; i++) {
            sim.trophies.clear();
            sim["openRaidChest"]();
            many += sim.trophies.size;
            for (const id of sim.trophies) {
                const trophy = tob.find((t) => t.id === id)!;
                // Hard mode's own only on hard mode
                expect(trophy.from.kind === "raid" && trophy.from.hard).toBeFalsy();
            }
        }
        // 5% and 65%
        expect(few).toBeGreaterThan(2);
        expect(few).toBeLessThan(25);
        expect(many).toBeGreaterThan(100);
    });

    it("keeps a raid's wins, normal and hard, when the save's loaded again", () => {
        const save = createSave();
        save.mapVictories.theatre_of_blood = 1;
        save.hardVictories.theatre_of_blood = 2;
        const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
        expect(loaded.mapVictories.theatre_of_blood).toBe(1);
        expect(loaded.hardVictories.theatre_of_blood).toBe(2);
    });

    it("opens hard mode once a raid's beaten, and never endless", () => {
        const save = createSave();
        expect(isHardUnlocked(save, "theatre_of_blood")).toBe(false);
        save.mapVictories.theatre_of_blood = 1;
        expect(isHardUnlocked(save, "theatre_of_blood")).toBe(true);
        expect(isEndlessUnlocked(save, "theatre_of_blood")).toBe(false);
    });

    it("unlocks the Ghrazi rapier and the Holy scythe from the chest, not for a win", () => {
        const earned = (save: ReturnType<typeof createSave>) =>
            getEarnedUnlocks(save).items.map((item) => item.id);
        const save = createSave();
        save.mapVictories.theatre_of_blood = 1;
        save.hardVictories.theatre_of_blood = 1;
        save.expertVictories.theatre_of_blood = 1;
        expect(earned(save)).not.toContain("ghrazi_rapier");
        expect(earned(save)).not.toContain("holy_scythe_of_vitur");
        save.trophies.push("ghrazi_rapier");
        expect(earned(save)).toContain("ghrazi_rapier");
        expect(earned(save)).not.toContain("holy_scythe_of_vitur");
        save.trophies.push("holy_scythe_of_vitur_uncharged");
        expect(earned(save)).toContain("holy_scythe_of_vitur");
    });

    it("has every raid boss call in the raid's Nylocas, which shoot", () => {
        const tob = MAP_BY_ID.get("theatre_of_blood")!;
        const bosses = new Set(tob.raid!.rooms.map((r) => r.boss));
        for (const id of [...bosses]) {
            const rises = getEnemy(id).boss?.rises?.into;
            if (rises) {
                bosses.add(rises);
            }
        }
        for (const id of bosses) {
            const boss = getEnemy(id).boss!;
            const called = [
                ...(boss.summonsAt ?? []).map((s) => s.enemyId),
                ...boss.attacks.flatMap((a) => (a.summon ? [a.summon.enemyId] : [])),
            ];
            for (const enemyId of called.filter((e) => /toxobolos|hagios/.test(e))) {
                expect(getEnemy(enemyId).shot, `${id}: ${enemyId}`).toBeDefined();
            }
        }
    });

    it("has the rapier in every mode's chest, and the Holy scythe on hard and expert's only", () => {
        const rapier = TROPHY_BY_ID.get("ghrazi_rapier")!.from;
        const scythe = TROPHY_BY_ID.get("holy_scythe_of_vitur_uncharged")!.from;
        expect(rapier.kind === "raid" && !rapier.hard && !rapier.expert).toBe(true);
        expect(scythe.kind === "raid" && scythe.hard && !scythe.expert).toBe(true);
        expect(describeUnlockTask(getWeapon("ghrazi_rapier").unlock!)).toBe(
            "Find a Ghrazi rapier in the Theatre of Blood chest",
        );
        expect(describeUnlockTask(getWeapon("holy_scythe_of_vitur").unlock!)).toBe(
            "Find a Holy Scythe of Vitur (uncharged) in the Theatre of Blood chest on hard or expert",
        );
    });

    it("scores a room on how fast its boss went down and how little you were hurt", () => {
        expect(getRoomPoints(10, 0, 100, 40)).toBe(200);
        expect(getRoomPoints(120, 100, 100, 40)).toBe(50);
        expect(getRoomPoints(70, 50, 100, 40)).toBe(125);
        expect(getRoomPoints(300, 500, 100, 40)).toBe(50);
        // A room's par is what it takes for all the speed points: a longer fight's par is longer
        expect(getRoomPoints(150, 0, 100, 150)).toBe(200);
        expect(getRoomPoints(150, 0, 100, 40)).toBe(100);
    });

    it("opens the supply chest once a room's cleared, paid for in raid points", () => {
        const sim = raid();
        toRoomSecond(sim, 31);
        killBosses(sim);
        expect(sim.state).toBe("event");
        expect(sim.offer?.def.id).toBe("raid_supplies");
        // Down at once, and nothing taken
        expect(sim.raidPoints).toBe(200);

        const options = sim.offer!.options;
        const shark = options.findIndex((o) => o.kind === "supply" && o.supplyId === "shark");
        sim.player.hp = 1;
        expect(sim.chooseEventOption(shark)).toBe(true);
        expect(sim.raidPoints).toBe(170);
        expect(sim.player.hp).toBeGreaterThan(1);
        // Once each, and not past what's left
        expect(sim.chooseEventOption(shark)).toBe(false);
        const brew = options.findIndex(
            (o) => o.kind === "supply" && o.supplyId === "saradomin_brew",
        );
        const stamina = options.findIndex(
            (o) => o.kind === "supply" && o.supplyId === "stamina_potion",
        );
        expect(sim.chooseEventOption(brew)).toBe(true);
        expect(sim.chooseEventOption(stamina)).toBe(true);
        expect(sim.raidPoints).toBe(60);
        expect(sim.buffs.some((buff) => buff.look?.name === "Stamina potion")).toBe(true);
        const divine = options.findIndex(
            (o) => o.kind === "supply" && o.supplyId === "divine_super_combat",
        );
        expect(sim.chooseEventOption(divine)).toBe(false);
        // 200 points' worth: 4 coins each
        expect(sim.coins).toBe(800);

        sim.leaveEvent();
        expect(sim.state).toBe("playing");
        expect(sim.raidStage).toBe("cleared");
    });

    it("leaves nothing on the ground in a room the party's left", () => {
        const sim = raid();
        toRoomSecond(sim, 20);
        sim.dropPickup("coins", 1030.5, 1020.5, 5);
        toRoomSecond(sim, 31);
        for (const pickup of sim.pickups.filter((p) => p.value >= 0)) {
            expect(Math.hypot(pickup.x - 1018.5, pickup.y - 1050.5)).toBeLessThan(5);
        }
    });

    it("lists its raids' rooms in order, each with a boss", () => {
        for (const map of RAID_MAPS) {
            const rooms = map.raid!.rooms;
            expect(rooms.length).toBeGreaterThan(1);
            const bossEvents = map.events.filter(
                (e) => e.kind === "boss" || e.kind === "finalBoss",
            );
            expect(bossEvents.map((e) => e.enemyId)).toEqual(rooms.map((r) => r.boss));
            expect(bossEvents.at(-1)!.kind).toBe("finalBoss");
        }
    });
});

// Every boss the Theatre has, each form of each
const TEST_BOSS_IDS = [
    "maiden_of_sugadinti",
    "tob_pestilent_bloat",
    "nylocas_vasilias",
    "nylocas_vasilias_ranged",
    "nylocas_vasilias_magic",
    "tob_sotetseg",
    "xarpus",
    "tob_verzik_vitur",
    "tob_verzik_vitur_risen",
    "tob_verzik_vitur_spider",
];

describe("the Theatre's bullet shapes", () => {
    // One volley of a boss's attack, from its own spot
    // bulletScale: hard mode's bullets (MapDef.hard bullets)
    function volley(attackName: string, bossId: string, bulletScale = 1) {
        const sim = raid();
        Object.assign(sim, { bulletScale });
        const def = getEnemy(bossId);
        const attack = def.boss!.attacks.find((a) => a.name === attackName) as BossAttackDef;
        const boss = sim.spawnEnemy(def, "boss", { x: 1018.5, y: 1040.5 })!;
        sim.player.x = sim.player.prevX = 1018.5;
        sim.player.y = sim.player.prevY = 1030.5;
        const emitter = {
            enemyUid: boss.uid,
            attack,
            source: 0,
            nextTick: 0,
            volleysLeft: 1,
            angle: -Math.PI / 2,
            aim: -Math.PI / 2,
            damage: 1,
        };
        sim["fireVolley"](emitter, boss);
        const bullets = sim["bullets"];
        const shot = [];
        for (let i = 0; i < bullets.count; i++) {
            const slot = bullets.order[i];
            shot.push({
                x: bullets.x[slot],
                y: bullets.y[slot],
                vx: bullets.vx[slot],
                vy: bullets.vy[slot],
            });
        }
        return { attack, shot };
    }

    it("a wall is a line across, all going one way, with its gap left out", () => {
        const { attack, shot } = volley("The maze", "tob_sotetseg");
        const pattern = attack.pattern!;
        expect(shot).toHaveLength(pattern.count - pattern.gap!);
        // Across the way it's going (south, at the player), side by side, through the boss
        for (const bullet of shot) {
            expect(bullet.y).toBeCloseTo(1040.5);
            expect(bullet.vx).toBeCloseTo(0);
            expect(bullet.vy).toBeLessThan(0);
        }
        const xs = shot.map((b) => b.x).sort((a, b) => a - b);
        const steps = xs.slice(1).map((x, i) => Math.round((x - xs[i]) / pattern.spacing!));
        // One step's the gap's, the rest are next to each other
        expect(steps.filter((step) => step !== 1)).toEqual([pattern.gap! + 1]);
    });

    it("a spread starts at the boss's middle", () => {
        const { attack, shot } = volley("Blood throw", "maiden_of_sugadinti");
        expect(shot).toHaveLength(attack.pattern!.count);
        for (const bullet of shot) {
            expect(Math.hypot(bullet.x - 1018.5, bullet.y - 1040.5)).toBeCloseTo(0);
            expect(Math.hypot(bullet.vx, bullet.vy)).toBeGreaterThan(0);
        }
    });

    it("leaves no safe spot on a raid boss: everything it fires from itself starts at its middle", () => {
        const bosses = TEST_BOSS_IDS.map((id) => getEnemy(id));
        for (const boss of bosses) {
            for (const attack of boss.boss!.attacks) {
                expect(attack.pattern?.from ?? 0, `${boss.id}: ${attack.name}`).toBe(0);
            }
        }
    });

    it("makes standing on a raid boss cost: about half its attacks up close hit all round it", () => {
        for (const id of TEST_BOSS_IDS) {
            // What it can pick with the player right by it
            const attacks = getEnemy(id).boss!.attacks.filter(
                (a) => !a.enraged && !a.expert && (a.minRange ?? 0) <= 1,
            );
            // Hits everywhere within reach of the boss's middle: a swing round it, or a mark under it
            const reach = (a: BossAttackDef) =>
                a.kind === "swing" && a.cone === undefined
                    ? (a.radius ?? 2)
                    : a.ground?.spots.some((spot) => spot.shape === "under") && !a.ground.safe
                      ? a.ground.radius
                      : 0;
            const close = attacks.filter((a) => reach(a) >= 2.5 && a.range < 5);
            expect(close.length, id).toBeGreaterThan(0);
            const weight = (list: BossAttackDef[]) => list.reduce((sum, a) => sum + a.weight, 0);
            expect(weight(close) / weight(attacks), id).toBeGreaterThanOrEqual(0.4);
        }
    });

    it("leaves no ring round a still boss that melee reaches and its slam doesn't", () => {
        // The scythe's reach, from the boss's middle, with a boss's radius of 0.5
        const longestReach = 4.35;
        for (const id of ["maiden_of_sugadinti", "xarpus", "tob_verzik_vitur"]) {
            const slam = getEnemy(id).boss!.attacks.find((a) =>
                a.ground?.spots.some((spot) => spot.shape === "under"),
            )!;
            expect(slam.range, id).toBeGreaterThanOrEqual(longestReach);
            expect(slam.ground!.radius, id).toBeGreaterThanOrEqual(longestReach - 0.35);
        }
    });

    it("hard mode fires half as many bullets again, with as wide a way through", () => {
        expect(getMap("theatre_of_blood").hard?.bullets).toBe(1.5);
        // A spread: more bullets, fanned out wider, as far apart
        const fan = volley("Blood throw", "maiden_of_sugadinti");
        const hardFan = volley("Blood throw", "maiden_of_sugadinti", 1.5);
        const more = hardFan.shot.length / fan.shot.length;
        expect(more).toBeGreaterThan(1.4);
        expect(more).toBeLessThan(1.7);
        const apart = (shot: { vx: number; vy: number }[]) => {
            const angles = shot.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
            return Math.min(...angles.slice(1).map((a, i) => a - angles[i]));
        };
        expect(apart(hardFan.shot)).toBeCloseTo(apart(fan.shot), 3);
        // A wall: as long, closer together, and its gap as many tiles across
        const wall = volley("The maze", "tob_sotetseg");
        const hardWall = volley("The maze", "tob_sotetseg", 1.5);
        const pattern = wall.attack.pattern!;
        expect(wall.shot).toHaveLength(pattern.count - pattern.gap!);
        expect(hardWall.shot).toHaveLength(
            Math.round(pattern.count * 1.5) - Math.round((pattern.gap! + 1) * 1.5 - 1),
        );
        const xs = (shot: { x: number }[]) => shot.map((b) => b.x).sort((a, b) => a - b);
        const across = (shot: { x: number }[]) => xs(shot)[xs(shot).length - 1] - xs(shot)[0];
        expect(across(hardWall.shot)).toBeLessThanOrEqual(across(wall.shot) + 1);
        // The way through, bullet middle to middle, at least as wide
        const widest = (shot: { x: number }[]) =>
            Math.max(
                ...xs(shot)
                    .slice(1)
                    .map((x, i) => x - xs(shot)[i]),
            );
        expect(widest(hardWall.shot)).toBeGreaterThanOrEqual(widest(wall.shot) - 1e-6);
    });

    it("a closing ring forms round the player and comes in on them, with its gap", () => {
        const { attack, shot } = volley("Blood tide", "maiden_of_sugadinti");
        const pattern = attack.pattern!;
        expect(shot).toHaveLength(pattern.count - pattern.gap!);
        for (const bullet of shot) {
            const dx = bullet.x - 1018.5;
            const dy = bullet.y - 1030.5;
            expect(Math.hypot(dx, dy)).toBeCloseTo(pattern.distance!);
            // Heading for the middle
            expect(dx * bullet.vx + dy * bullet.vy).toBeLessThan(0);
        }
    });
});

describe("the Theatre's bosses", () => {
    it("pray against missiles and magic, taking less from those weapons", () => {
        const sim = raid();
        const def = getEnemy("maiden_of_sugadinti");
        const hit = (weaponId: string) => {
            const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
            sim["damageSource"] = `weapon:${weaponId}`;
            const hp = boss.hp;
            let dealt = 0;
            for (let i = 0; i < 40; i++) {
                dealt += sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y);
            }
            boss.dead = true;
            expect(hp - boss.hp).toBe(dealt);
            return dealt;
        };
        const melee = hit("scythe_of_vitur");
        const ranged = hit("twisted_bow");
        const magic = hit("sanguinesti_staff");
        expect(ranged / melee).toBeCloseTo(0.15, 1);
        expect(magic / melee).toBeCloseTo(0.15, 1);
        // Everything else, as it was
        expect(getEnemy("sotetseg").protects).toBeUndefined();
        expect(getEnemy("tob_sotetseg").protects?.styles).toEqual(["ranged", "magic"]);
    });

    it("armour takes at most half of a boss's hit, and all of anyone else's", () => {
        const sim = raid();
        sim.player.hp = sim.player.maxHp = 1000;
        sim.stats.armor = 20;
        const attack = getEnemy("maiden_of_sugadinti").boss!.attacks[0];
        const taken = (enemyId: string) => {
            const hp = sim.player.hp;
            sim.player.invulnerable = 0;
            sim["bossHit"](enemyId, undefined, attack, 12);
            return hp - sim.player.hp;
        };
        // A raid boss's 12 loses no more than 6 to the 20 armour
        expect(taken("maiden_of_sugadinti")).toBe(6);
        expect(taken("tob_sotetseg")).toBe(6);
        // Morytania's Sotetseg, as it was: down to 1
        expect(taken("sotetseg")).toBe(1);
    });

    it("the Bloat takes little while he walks, all of it when he's down, and stomps getting up", () => {
        const sim = raid();
        const def = getEnemy("tob_pestilent_bloat");
        const naps = def.boss!.naps!;
        const bloat = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
        sim["damageSource"] = "weapon:scythe_of_vitur";
        const hit = () => {
            const hp = bloat.hp;
            for (let i = 0; i < 20; i++) {
                sim.damageEnemy(bloat, 100, 0, sim.player.x, sim.player.y);
            }
            return hp - bloat.hp;
        };
        const awake = hit();
        bloat.bossState!.nextNap = sim.tick;
        expect(sim["stepNap"](bloat, naps)).toBe(true);
        expect(sim["isNapping"](bloat)).toBe(true);
        const down = hit();
        // Hits vary by 15% either way
        expect(awake / down).toBeGreaterThan(naps.awakeDamage * 0.7);
        expect(awake / down).toBeLessThan(naps.awakeDamage * 1.4);
        sim.tick = bloat.bossState!.napEnd!;
        sim["stepNap"](bloat, naps);
        expect(sim["isNapping"](bloat)).toBe(false);
        expect(bloat.bossState!.windup?.attack.name).toBe(naps.wake);
    });

    it("drop nothing off their adds, and have no visitors, in their rooms", () => {
        const sim = raid();
        toRoomSecond(sim, 31);
        expect(sim.raidStage).toBe("boss");
        const add = sim.spawnEnemy(getEnemy("goblin"), "normal", { x: 1020.5, y: 1052.5 })!;
        const pickups = sim.pickups.length;
        sim.damageEnemy(add, 1e9, 0, sim.player.x, sim.player.y);
        expect(add.dead).toBe(true);
        expect(sim.pickups.length).toBe(pickups);
        sim["nextRandomEventSeconds"] = 0;
        sim["stepRandomEvents"]();
        expect(sim.visitor).toBeUndefined();
    });

    it("caps what armour takes off a raid boss's hits however they land, its boss gone or not", () => {
        const sim = raid();
        const def = getEnemy("xarpus");
        const cap = def.boss!.armorCap!;
        // Enough to take every hit here and stand
        sim.player.maxHp = sim.player.hp = 1000;
        sim.stats.armor = 1000;
        // Straight to the player, as a stomp or a stare's are
        sim.player.invulnerable = 0;
        expect(sim["damagePlayer"](40, def.id, false)).toBeGreaterThanOrEqual(
            Math.round(40 * (1 - cap)),
        );
        // A pool whose boss is gone: as much as it does with no armour, less the cap at most
        const attack = def.boss!.attacks.find((a) => a.name === "Acid")!;
        const pool = (armor: number) => {
            // A tick on, past the last hit's grace
            sim.tick += 40;
            sim.stats.armor = armor;
            sim.player.invulnerable = 0;
            sim.player.hp = sim.player.maxHp;
            sim.hazards = [
                {
                    uid: 998,
                    enemyUid: -1,
                    enemyId: def.id,
                    attack,
                    x: sim.player.x,
                    y: sim.player.y,
                    radius: attack.ground!.radius,
                    damage: 40,
                    startTick: sim.tick,
                    landTick: sim.tick,
                    endTick: sim.tick,
                    armed: false,
                    fuseTick: -1,
                    grabEnd: 0,
                    hit: [],
                    lingerEnd: -1,
                    nextHurt: -1,
                },
            ];
            sim["stepHazards"]();
            return sim.player.maxHp - sim.player.hp;
        };
        const bare = pool(0);
        expect(bare).toBeGreaterThan(1);
        expect(pool(1000)).toBeGreaterThanOrEqual(Math.floor(bare * (1 - cap)));
    });

    it("brings all the Maiden's healers on, however close to a wall she stands", () => {
        const sim = raid();
        const def = getEnemy("maiden_of_sugadinti");
        const summon = def.boss!.summonsAt!.find((s) => s.enemyId === "nylocas_matomenos_healer")!;
        // In a corner of the room: most of the ring her healers come on in is in its walls
        const boss = sim.spawnEnemy(def, "boss", { x: 1069.5, y: 1069.5 })!;
        sim.player.x = sim.player.prevX = 1064.5;
        sim.player.y = sim.player.prevY = 1064.5;
        sim.step();
        boss.hp = Math.floor(boss.maxHp * summon.hp);
        const before = sim.enemies.filter((e) => e.def.id === summon.enemyId && !e.dead).length;
        sim["callSummons"](boss, false);
        const healers = sim.enemies.filter((e) => e.def.id === summon.enemyId && !e.dead);
        expect(healers.length - before).toBe(summon.count);
        for (const healer of healers) {
            expect(healer.x).toBeLessThan(1071);
            expect(healer.y).toBeLessThan(1071);
        }
    });

    it("leave blood and acid on the floor that hurts for as long as you stand in it", () => {
        const sim = raid();
        const def = getEnemy("xarpus");
        const attack = def.boss!.attacks.find((a) => a.name === "Acid")!;
        const lingers = attack.ground!.lingers!;
        const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1045.5 })!;
        sim.player.invulnerable = 0;
        const x = sim.player.x;
        const y = sim.player.y;
        sim.hazards.push({
            uid: 999,
            enemyUid: boss.uid,
            enemyId: boss.def.id,
            attack,
            x,
            y,
            radius: attack.ground!.radius,
            damage: 10,
            startTick: sim.tick,
            landTick: sim.tick,
            endTick: sim.tick,
            armed: false,
            fuseTick: -1,
            grabEnd: 0,
            hit: [],
            lingerEnd: -1,
            nextHurt: -1,
        });
        sim["stepHazards"]();
        const hazard = sim.hazards.find((h) => h.uid === 999)!;
        expect(hazard.lingerEnd).toBe(sim.tick + Math.round(lingers.seconds * TICKS_PER_SECOND));
        // Hurt again a while later, standing in it
        sim.player.invulnerable = 0;
        sim.player.x = x;
        sim.player.y = y;
        const hp = sim.player.hp;
        sim.tick = hazard.nextHurt;
        sim["stepHazards"]();
        expect(sim.player.hp).toBeLessThan(hp);
        // And gone once its time's up
        sim.tick = hazard.lingerEnd;
        sim["stepHazards"]();
        expect(sim.hazards.some((h) => h.uid === 999)).toBe(false);
    });
});

describe("expert mode", () => {
    // Hits from one weapon, 20 of them, and what they did
    function hits(sim: Sim, enemyId: string, weaponId: string): number {
        const enemy = sim.spawnEnemy(getEnemy(enemyId), "boss", { x: 1030.5, y: 1030.5 })!;
        sim["damageSource"] = `weapon:${weaponId}`;
        let dealt = 0;
        for (let i = 0; i < 20 && !enemy.dead; i++) {
            dealt += sim.damageEnemy(enemy, 1, 0, sim.player.x, sim.player.y);
        }
        enemy.dead = true;
        return dealt;
    }

    it("is hard mode, and only a raid's", () => {
        expect(raid(true).hard).toBe(true);
        expect(raid(false).expert).toBe(false);
    });

    it("lets each colour of Nylocas take only its own style, and only on expert", () => {
        const expert = raid(true);
        expect(hits(expert, "nylocas_ischyros", "twisted_bow")).toBe(0);
        expect(hits(expert, "nylocas_ischyros", "scythe_of_vitur")).toBeGreaterThan(0);
        expect(hits(expert, "nylocas_toxobolos", "scythe_of_vitur")).toBe(0);
        expect(hits(expert, "nylocas_toxobolos", "twisted_bow")).toBeGreaterThan(0);
        expect(hits(expert, "nylocas_hagios", "twisted_bow")).toBe(0);
        expect(hits(expert, "nylocas_hagios", "sanguinesti_staff")).toBeGreaterThan(0);
        // Anywhere else, any style will do
        expect(hits(raid(false), "nylocas_ischyros", "twisted_bow")).toBeGreaterThan(0);
    });

    it("has an expert Nylocas that shoots come in where auras reach it, not to bite", () => {
        // How near a blue one gets, from 8 tiles off, with the player standing still
        const nearest = (expert: boolean) => {
            const sim = raid(expert);
            const { x, y } = sim.player;
            const enemy = sim.spawnEnemy(getEnemy("tob_nylocas_hagios"), "normal", {
                x: x + 8,
                y,
            })!;
            let near = Infinity;
            for (let i = 0; i < 6 * TICKS_PER_SECOND; i++) {
                sim.player.x = sim.player.prevX = x;
                sim.player.y = sim.player.prevY = y;
                sim.step();
                near = Math.min(near, fm.hypot(enemy.x - x, enemy.y - y));
            }
            return near;
        };
        // Inside Ice Barrage's reach, but not up against you
        const iceBarrage = getWeapon("ice_barrage").levels[0].area;
        expect(nearest(true)).toBeLessThan(iceBarrage);
        expect(nearest(true)).toBeGreaterThan(EXPERT_NYLOCAS_KEEP - 0.5);
        // Elsewhere it still hangs back to shoot
        expect(nearest(false)).toBeGreaterThan(4.5);
    });

    it("has the Maiden slam half as often as the other slams, so melee can stay in", () => {
        const slam = (id: string, name: string) =>
            getEnemy(id).boss!.attacks.find((a) => a.name === name)!;
        const other = slam("xarpus", "Acid burst").cooldown;
        expect(slam("maiden_of_sugadinti", "Blood burst").cooldown).toBe(2 * other);
    });

    it("warns of a fan with a line for each bullet it fires, as wide, on hard too", () => {
        // The test raid, with the Theatre's own hard mode (its bullets)
        const map: MapDef = {
            ...TEST_RAID,
            id: "test_raid_hard",
            hard: getMap("theatre_of_blood").hard,
        };
        MAP_BY_ID.set(map.id, map);
        for (const expert of [false, true]) {
            const sim = new Sim({
                grid: makeGrid(field(), 1000, 1000),
                mapId: map.id,
                expert,
                characterId: "warrior",
                metaStats: emptyStats(),
                seed: 1,
                spawnX: 1018.5,
                spawnY: 1010.5,
            });
            sim.heroes[0].weapons = [];
            sim.player.invulnerable = 1e9;
            const boss = sim.spawnEnemy(getEnemy("maiden_of_sugadinti"), "boss", {
                x: sim.player.x,
                y: sim.player.y + 10,
            })!;
            const attack = boss.def.boss!.attacks.find((a) => a.name === "Blood throw")!;
            sim["startBossAttack"](boss, attack);
            const windup = boss.bossState!.windup!;
            // The lines its warning draws
            const lines = sim
                .volleyHeadings(attack.pattern!, Math.atan2(windup.dirY, windup.dirX))
                .map((angle) => angle.toFixed(2));
            // Its first volley, then away from it all, so it isn't aimed anew
            for (let i = 0; i < 2 * TICKS_PER_SECOND && sim.bullets.count < lines.length; i++) {
                sim.player.x = sim.player.prevX = sim.player.x + 0.2;
                sim.step();
            }
            const headings = Array.from({ length: sim.bullets.count }, (_, k) => {
                const slot = sim.bullets.order[k];
                return Math.atan2(sim.bullets.vy[slot], sim.bullets.vx[slot]).toFixed(2);
            }).sort();
            expect(headings).toEqual([...lines].sort());
            // Hard mode's more of them
            expect(lines.length > attack.pattern!.count).toBe(expert);
        }
        MAP_BY_ID.delete(map.id);
    });

    it("has Nylocas Vasilias change colour, keeping its hitpoints", () => {
        const sim = raid(true);
        const boss = sim.spawnEnemy(getEnemy("nylocas_vasilias"), "boss", {
            x: 1030.5,
            y: 1030.5,
        })!;
        boss.hp -= 100;
        const hp = boss.hp;
        const every = getEnemy("nylocas_vasilias").boss!.colours!.every;
        sim["stepColours"](boss);
        sim.tick += Math.round(every * TICKS_PER_SECOND);
        sim["stepColours"](boss);
        expect(boss.def.id).toBe("nylocas_vasilias_ranged");
        expect(boss.def.onlyStyle).toBe("ranged");
        expect(boss.hp).toBe(hp);
        // On normal too (BossDef.colours.offStyle)
        const calm = raid(false);
        const grey = calm.spawnEnemy(getEnemy("nylocas_vasilias"), "boss", {
            x: 1030.5,
            y: 1030.5,
        })!;
        calm["stepColours"](grey);
        calm.tick += Math.round(every * TICKS_PER_SECOND);
        calm["stepColours"](grey);
        expect(grey.def.id).toBe("nylocas_vasilias_ranged");
    });

    it("has each colour of Nylocas Vasilias take its own style in full on normal, others less", () => {
        const sim = raid(false);
        const dealt = (form: string, weaponId: string) => {
            const boss = sim.spawnEnemy(getEnemy(form), "boss", { x: 1030.5, y: 1030.5 })!;
            sim["damageSource"] = `weapon:${weaponId}`;
            let total = 0;
            for (let i = 0; i < 40; i++) {
                total += sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y);
            }
            boss.dead = true;
            return total;
        };
        const share = getEnemy("nylocas_vasilias").boss!.colours!.offStyle!;
        const prayer = getEnemy("nylocas_vasilias").protects!.damage;
        // Grey: melee in full; missiles and magic the colour's share, and the prayer on top
        const melee = dealt("nylocas_vasilias", "scythe_of_vitur");
        expect(dealt("nylocas_vasilias", "twisted_bow") / melee).toBeCloseTo(share * prayer, 2);
        expect(dealt("nylocas_vasilias", "sanguinesti_staff") / melee).toBeCloseTo(
            share * prayer,
            2,
        );
        // Green: missiles through its prayer for ownStyle, more than melee's share; magic both
        const own = getEnemy("nylocas_vasilias").boss!.colours!.ownStyle!;
        expect(own).toBeGreaterThan(share);
        const green = "nylocas_vasilias_ranged";
        expect(dealt(green, "twisted_bow") / melee).toBeCloseTo(own, 1);
        expect(dealt(green, "scythe_of_vitur") / melee).toBeCloseTo(share, 1);
        expect(dealt(green, "sanguinesti_staff") / melee).toBeCloseTo(share * prayer, 2);
        // Blue: magic the same
        const blue = "nylocas_vasilias_magic";
        expect(dealt(blue, "sanguinesti_staff") / melee).toBeCloseTo(own, 1);
        expect(dealt(blue, "scythe_of_vitur") / melee).toBeCloseTo(share, 1);
    });

    it("never picks an attack kept for its boss's shadow realm, exhumes or yellows otherwise", () => {
        const sim = raid();
        const def = getEnemy("xarpus");
        const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
        // Out of his pool for good, with every attack ready
        boss.bossState!.ordealsDone = def.boss!.exhumes!.at.length;
        const picked = () => boss.bossState!.windup?.attack;
        let picks = 0;
        for (let i = 0; i < 300; i++) {
            boss.bossState!.windup = undefined;
            boss.bossState!.cooldowns.fill(0);
            boss.attackCooldown = 0;
            sim.tick++;
            sim["stepBoss"](boss, 2);
            const attack = picked();
            if (attack) {
                picks++;
                expect(attack.ordeal, attack.name).not.toBe(true);
            }
        }
        expect(picks).toBeGreaterThan(50);
    });

    it("has Sotetseg drag you into his shadow realm, where he can't be hurt and only mazes", () => {
        const sim = raid();
        const def = getEnemy("tob_sotetseg");
        const realm = def.boss!.shadowRealm!;
        const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
        sim["damageSource"] = "weapon:scythe_of_vitur";
        boss.hp = Math.floor(boss.maxHp * realm.at[0]);
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeDefined();
        expect(sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y)).toBe(0);
        expect(sim["keepsTo"](boss)?.attacks).toEqual(realm.attacks);
        // Out again once its time's up, and hurt as ever
        sim.tick += Math.round(realm.seconds * TICKS_PER_SECOND);
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeUndefined();
        expect(sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y)).toBeGreaterThan(0);
        // And not again until the next share
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeUndefined();
        boss.hp = Math.floor(boss.maxHp * realm.at[1]);
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeDefined();
    });

    it("has Xarpus rise only once his exhumeds are smothered, those left healing him", () => {
        const sim = raid();
        const def = getEnemy("xarpus");
        const exhumes = def.boss!.exhumes!;
        const attack = def.boss!.attacks.find((a) => a.ground?.smother)!;
        const smother = attack.ground!.smother!;
        const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
        sim["damageSource"] = "weapon:scythe_of_vitur";
        // Down to his first exhumes: he sinks into his pool, out of reach
        boss.hp = Math.floor(boss.maxHp * exhumes.at[0]);
        sim["stepOrdeal"](boss);
        expect(sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y)).toBe(0);
        expect(boss.bossState!.ordeal!.left).toBe(exhumes.count);
        const exhumed = (x: number, y: number) => {
            const hazard = {
                uid: 900 + sim.hazards.length,
                enemyUid: boss.uid,
                enemyId: boss.def.id,
                attack,
                x,
                y,
                radius: attack.ground!.radius,
                damage: 0,
                startTick: sim.tick,
                landTick: sim.tick,
                endTick: sim.tick + 1000,
                armed: false,
                fuseTick: -1,
                grabEnd: 0,
                hit: [],
                lingerEnd:
                    sim.tick + Math.round(attack.ground!.lingers!.seconds * TICKS_PER_SECOND),
                nextHurt: sim.tick + 1000,
            };
            sim.hazards.push(hazard);
            return hazard;
        };
        // One left alone heals him as it goes
        boss.hp = boss.maxHp - 10000;
        const left = exhumed(sim.player.x + 6, sim.player.y);
        sim.tick = left.lingerEnd;
        sim["stepHazards"]();
        expect(boss.hp).toBe(boss.maxHp - 10000 + Math.round(boss.maxHp * smother.heal));
        expect(sim.hazards).not.toContain(left);
        expect(boss.bossState!.ordeal!.left).toBe(exhumes.count);
        // Each one stood on is smothered, and once they all are he rises
        for (let i = 0; i < exhumes.count; i++) {
            const one = exhumed(sim.player.x, sim.player.y);
            for (let t = 0; t <= Math.round(smother.seconds * TICKS_PER_SECOND); t++) {
                sim["stepHazards"]();
            }
            expect(sim.hazards).not.toContain(one);
        }
        expect(boss.bossState!.ordeal!.left).toBe(0);
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeUndefined();
        expect(sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y)).toBeGreaterThan(0);
        // Never raised outside his exhumes
        expect(attack.ordeal).toBe(true);
        expect(sim["keepsTo"](boss)).toBeUndefined();
    });

    it("has Xarpus rise after a while anyway, healed for each exhumed left", () => {
        const sim = raid();
        const def = getEnemy("xarpus");
        const exhumes = def.boss!.exhumes!;
        const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
        boss.hp = Math.floor(boss.maxHp * exhumes.at[0]);
        sim["stepOrdeal"](boss);
        boss.hp = boss.maxHp / 2;
        sim.tick += Math.round(exhumes.seconds * TICKS_PER_SECOND);
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeUndefined();
        expect(boss.hp).toBe(
            boss.maxHp / 2 + Math.round(boss.maxHp * exhumes.leftHeal * exhumes.count),
        );
    });

    it("has Verzik's spider throw her yellows, where only a pool keeps you safe", () => {
        const sim = raid();
        const def = getEnemy("tob_verzik_vitur_spider");
        const yellows = def.boss!.yellows!;
        const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
        sim["damageSource"] = "weapon:scythe_of_vitur";
        boss.hp = Math.floor(boss.maxHp * yellows.at[0]);
        sim["stepOrdeal"](boss);
        expect(sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y)).toBe(0);
        expect(sim["keepsTo"](boss)?.attacks).toEqual(yellows.attacks);
        const ball = def.boss!.attacks.find((a) => a.name === "Yellows")!;
        expect(ball.ordeal).toBe(true);
        expect(ball.expert).toBeUndefined();
        expect(ball.ground?.safe).toBe(true);
        sim.tick += Math.round(yellows.seconds * TICKS_PER_SECOND);
        sim["stepOrdeal"](boss);
        expect(sim.damageEnemy(boss, 100, 0, sim.player.x, sim.player.y)).toBeGreaterThan(0);
    });

    it("starts a risen form's shadow realm, exhumes or yellows over", () => {
        const sim = raid();
        const boss = sim.spawnEnemy(getEnemy("tob_verzik_vitur_risen"), "boss", {
            x: 1030.5,
            y: 1030.5,
        })!;
        boss.bossState!.ordealsDone = 2;
        boss.hp = 0;
        sim["riseAgain"](boss);
        expect(boss.def.id).toBe("tob_verzik_vitur_spider");
        expect(boss.bossState!.ordealsDone).toBe(0);
    });

    it("has the Maiden call Nylocas that crawl to her and feed her, on normal too", () => {
        const summons = getEnemy("maiden_of_sugadinti").boss!.summonsAt!;
        const feeders = summons.filter((s) => getEnemy(s.enemyId).heals);
        expect(feeders.length).toBeGreaterThanOrEqual(3);
        for (const s of feeders) {
            expect(getEnemy(s.enemyId).heals!.targets).toContain("maiden_of_sugadinti");
        }
    });

    it("pays twice the coins, and gives one of Lil' Zik's looks each clear", () => {
        const sim = raid(true);
        toRoomSecond(sim, 31);
        killBosses(sim);
        // 200 points' worth at 4 coins, twice over
        expect(sim.coins).toBe(1600);
        Object.assign(sim, { map: getMap("theatre_of_blood") });
        sim.trophies.clear();
        sim["openRaidChest"]();
        const looks = TROPHIES.filter((t) => t.from.kind === "raid" && t.from.expert).map(
            (t) => t.id,
        );
        expect([...sim.trophies].some((id) => looks.includes(id))).toBe(true);
    });

    it("sends the Maiden's Matomenos to heal her", () => {
        const expert = raid(true).spawnEnemy(getEnemy("nylocas_matomenos"), "normal", {
            x: 1030.5,
            y: 1030.5,
        })!;
        expect(expert.def.id).toBe("nylocas_matomenos_healer");
        expect(expert.def.heals?.targets).toEqual(["maiden_of_sugadinti"]);
        const normal = raid(false).spawnEnemy(getEnemy("nylocas_matomenos"), "normal", {
            x: 1030.5,
            y: 1030.5,
        })!;
        expect(normal.def.id).toBe("nylocas_matomenos");
    });

    it("has Xarpus turn hits from in front of his stare back on you", () => {
        const sim = raid(true);
        const xarpus = sim.spawnEnemy(getEnemy("xarpus"), "boss", { x: 1030.5, y: 1030.5 })!;
        xarpus.bossState!.enraged = true;
        sim["stepStare"](xarpus);
        // Staring east
        xarpus.bossState!.stareAngle = 0;
        sim["damageSource"] = "weapon:scythe_of_vitur";
        sim.player.invulnerable = 0;
        sim.player.x = sim.player.prevX = 1033.5;
        sim.player.y = sim.player.prevY = 1030.5;
        const hp = sim.player.hp;
        expect(sim.damageEnemy(xarpus, 100, 0, sim.player.x, sim.player.y)).toBe(0);
        expect(sim.player.hp).toBeLessThan(hp);
        // From behind him, it lands
        sim.player.x = sim.player.prevX = 1027.5;
        expect(sim.damageEnemy(xarpus, 100, 0, sim.player.x, sim.player.y)).toBeGreaterThan(0);
    });

    it("has Xarpus's stare hurt as his hits do, armour and all, and say so before he turns", () => {
        const sim = raid(true);
        const xarpus = sim.spawnEnemy(getEnemy("xarpus"), "boss", { x: 1030.5, y: 1030.5 })!;
        const state = xarpus.bossState!;
        state.enraged = true;
        sim["stepStare"](xarpus);
        // Said, but not turned yet: he faces where he'll stare, and the notice names the side
        expect(state.stareNext).toBeDefined();
        expect(state.stareAngle).toBeUndefined();
        const next = state.stareNext!;
        const side = ["east", "north", "west", "south"][
            ((Math.round(next / (Math.PI / 2)) % 4) + 4) % 4
        ];
        expect(sim.takeEvents().some((e) => e.type === "notice" && e.message.includes(side))).toBe(
            true,
        );
        expect(xarpus.yaw).toBe(yawFromVector(fm.cos(next), fm.sin(next)));
        sim.tick = state.nextStare!;
        sim["stepStare"](xarpus);
        expect(state.stareAngle).toBeDefined();
        expect(state.stareNext).toBeUndefined();
        // Hitting it from in front with lots of armour still hurts: armour takes at most half
        const angle = state.stareAngle!;
        sim.player.x = sim.player.prevX = xarpus.x + Math.cos(angle) * 3;
        sim.player.y = sim.player.prevY = xarpus.y + Math.sin(angle) * 3;
        sim.stats.armor = 1000;
        sim.player.invulnerable = 0;
        sim["damageSource"] = "weapon:scythe_of_vitur";
        const hp = sim.player.hp;
        expect(sim.damageEnemy(xarpus, 100, 0, sim.player.x, sim.player.y)).toBe(0);
        const stare = getEnemy("xarpus").boss!.stare!;
        expect(hp - sim.player.hp).toBeGreaterThanOrEqual(
            Math.floor(stare.damage * xarpus.damageScale * 0.5),
        );
    });

    it("leaves a Nylocas a weapon can't hurt alone: no aiming at it, and no venom", () => {
        const sim = raid(true);
        const grey = sim.spawnEnemy(getEnemy("nylocas_ischyros"), "normal", {
            x: sim.player.x + 2,
            y: sim.player.y,
        })!;
        sim["damageSource"] = "weapon:toxic_blowpipe";
        const near = (style?: string) =>
            sim["nearestEnemies"](sim.player.x, sim.player.y, 10, 5, style as never);
        expect(near("ranged")).not.toContain(grey);
        sim["envenom"](grey, 50, 100);
        expect(grey.venom).toBe(0);
        // Its own style aims at it as ever
        expect(near("melee")).toContain(grey);
        // and what isn't a weapon (thralls, the cannon, power-ups) hurts any, so aims at any,
        // whatever weapon fired last
        expect(near()).toContain(grey);
    });

    it("aims each weapon by its own style, not whichever fired last", () => {
        const sim = raid(true);
        sim.weapons = [];
        sim.addWeapon("twisted_bow");
        sim.addWeapon("scythe_of_vitur");
        const grey = sim.spawnEnemy(getEnemy("nylocas_ischyros"), "normal", {
            x: sim.player.x + 1,
            y: sim.player.y,
        })!;
        // A tick for it to be where weapons look, with them held back meanwhile
        for (const weapon of sim.weapons) {
            weapon.cooldown = 1000;
        }
        sim.step();
        for (const weapon of sim.weapons) {
            weapon.cooldown = 0;
        }
        // The bow's left as the source, as it would be after it fires
        sim["damageSource"] = "weapon:twisted_bow";
        const hp = grey.hp;
        sim["stepWeapons"]();
        // The scythe swung (rather than waiting, with nothing it thought it could reach), and hit
        const scythe = sim.weapons.find((w) => w.def.id === "scythe_of_vitur")!;
        expect(scythe.cooldown).toBeGreaterThan(10);
        expect(grey.hp).toBeLessThan(hp);
    });

    it("stops a weapon's venom once the enemy's colour is one it can't hurt", () => {
        const sim = raid(true);
        const grey = sim.spawnEnemy(getEnemy("nylocas_ischyros"), "normal", {
            x: sim.player.x + 6,
            y: sim.player.y,
        })!;
        // Put on while it could be hurt (as on green Vasilias, before it turned)
        Object.assign(grey, {
            venom: 5,
            venomEnd: sim.tick + 100,
            venomNext: sim.tick,
            venomSource: "weapon:toxic_blowpipe",
        });
        const hp = grey.hp;
        sim.step();
        expect(grey.hp).toBe(hp);
        expect(grey.venomEnd).toBeLessThan(sim.tick);
    });

    it("keeps Verzik's Nylocas to their own style on expert: a party needs all three", () => {
        for (const id of ["tob_verzik_vitur_risen", "tob_verzik_vitur_spider"]) {
            const boss = getEnemy(id).boss!;
            const called = [
                ...(boss.summonsAt ?? []).map((s) => s.enemyId),
                ...boss.attacks.flatMap((a) => (a.summon ? [a.summon.enemyId] : [])),
            ];
            expect(called.length, id).toBeGreaterThan(0);
            for (const enemyId of called) {
                expect(getEnemy(enemyId).onlyStyle, `${id}: ${enemyId}`).toBeDefined();
            }
        }
    });

    it("has Nylocas Vasilias's colour still pray for its own style's share on expert", () => {
        const sim = raid(true);
        const own = getEnemy("nylocas_vasilias").boss!.colours!.ownStyle!;
        // Big hits, so rounding to whole numbers doesn't hide the share
        const dealt = (id: string, weaponId: string) => {
            const enemy = sim.spawnEnemy(getEnemy(id), "boss", { x: 1030.5, y: 1030.5 })!;
            // Never down, so every hit counts in full
            enemy.hp = enemy.maxHp = 1e9;
            sim["damageSource"] = `weapon:${weaponId}`;
            let total = 0;
            for (let i = 0; i < 40; i++) {
                total += sim.damageEnemy(enemy, 100, 0, sim.player.x, sim.player.y);
            }
            enemy.dead = true;
            return total;
        };
        // One weapon on its colour and on a Nylocas of the same style with no prayer, so neither
        // weapon's balance comes into it
        const prayed = dealt("nylocas_vasilias_ranged", "twisted_bow");
        const unprayed = dealt("tob_nylocas_toxobolos", "twisted_bow");
        expect(prayed / unprayed).toBeCloseTo(own, 1);
        expect(hits(sim, "nylocas_vasilias_ranged", "scythe_of_vitur")).toBe(0);
    });

    it("feeds the Maiden more on expert", () => {
        const normal = raid(false).spawnEnemy(getEnemy("nylocas_matomenos_healer"), "normal", {
            x: 1030.5,
            y: 1030.5,
        })!;
        const expert = raid(true).spawnEnemy(getEnemy("nylocas_matomenos_healer"), "normal", {
            x: 1030.5,
            y: 1030.5,
        })!;
        expect(expert.def.heals!.fraction).toBeGreaterThan(normal.def.heals!.fraction);
        expect(expert.def.heals!.targets).toEqual(normal.def.heals!.targets);
    });

    it("holds Verzik's yellows until her doom ball's landed", () => {
        const sim = raid(true);
        const def = getEnemy("tob_verzik_vitur_spider");
        const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
        const ball = def.boss!.attacks.find((a) => a.expert)!;
        boss.hp = Math.floor(boss.maxHp * def.boss!.yellows!.at[0]);
        sim.enemyProjectiles.push({ enemyUid: boss.uid, attack: ball } as never);
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeUndefined();
        // and she can't be hurt meanwhile, so the wait can't take her past the next one too
        const hp = boss.hp;
        sim["damageSource"] = "weapon:scythe_of_vitur";
        expect(sim.damageEnemy(boss, boss.maxHp, 0, sim.player.x, sim.player.y)).toBe(0);
        expect(boss.hp).toBe(hp);
        sim.enemyProjectiles = [];
        sim["stepOrdeal"](boss);
        expect(boss.bossState!.ordeal).toBeDefined();
    });

    it("has Verzik throw no more doom balls while her yellows wait for one", () => {
        const doomBalls = (hpShare: number) => {
            const sim = raid(true);
            const def = getEnemy("tob_verzik_vitur_spider");
            const boss = sim.spawnEnemy(def, "boss", { x: 1030.5, y: 1030.5 })!;
            const ball = def.boss!.attacks.find((a) => a.expert)!;
            boss.hp = Math.floor(boss.maxHp * hpShare);
            sim.enemyProjectiles.push({ enemyUid: boss.uid, attack: ball } as never);
            const picked = () => boss.bossState!.windup?.attack;
            let thrown = 0;
            for (let i = 0; i < 300; i++) {
                boss.bossState!.windup = undefined;
                boss.bossState!.cooldowns.fill(0);
                boss.attackCooldown = 0;
                sim.tick++;
                sim["stepBoss"](boss, 10);
                thrown += picked() === ball ? 1 : 0;
            }
            expect(boss.bossState!.ordeal).toBeUndefined();
            return thrown;
        };
        // With no yellows due she throws them as ever, so the count below can fail
        expect(doomBalls(0.9)).toBeGreaterThan(10);
        expect(doomBalls(getEnemy("tob_verzik_vitur_spider").boss!.yellows!.at[0])).toBe(0);
    });

    it("has Verzik's green ball spare only whoever's in its circle", () => {
        const sim = raid(true);
        const spider = getEnemy("tob_verzik_vitur_spider");
        const ball = spider.boss!.attacks.find((a) => a.name === "Doom ball")!;
        expect(ball.expert).toBe(true);
        const verzik = sim.spawnEnemy(spider, "boss", { x: 1030.5, y: 1040.5 })!;
        sim["markGround"](verzik, ball, sim.tick);
        const circle = sim.hazards.find((h) => h.attack === ball)!;
        expect(circle.damage).toBe(0);
        // Away from her
        expect(Math.hypot(circle.x - verzik.x, circle.y - verzik.y)).toBeGreaterThanOrEqual(
            ball.ground!.spots[0].shape === "scatter" ? ball.ground!.spots[0].awayFrom! : 0,
        );
        sim.player.x = circle.x;
        sim.player.y = circle.y;
        expect(sim["inSafeMark"](ball)).toBe(true);
        sim.player.x = circle.x + circle.radius + 1;
        expect(sim["inSafeMark"](ball)).toBe(false);
    });

    it("opens once the raid's been beaten on hard, and keeps its wins", () => {
        const save = createSave();
        expect(isExpertUnlocked(save, "theatre_of_blood")).toBe(false);
        save.hardVictories.theatre_of_blood = 1;
        expect(isExpertUnlocked(save, "theatre_of_blood")).toBe(true);
        expect(isExpertUnlocked(save, "lumbridge")).toBe(false);
        recordRun(save, {
            mapId: "theatre_of_blood",
            hard: true,
            expert: true,
            victory: true,
            seconds: 1800,
            level: 50,
            kills: 1000,
            coins: 0,
            bossesKilled: [],
        });
        expect(save.expertVictories.theatre_of_blood).toBe(1);
        expect(save.hardVictories.theatre_of_blood).toBe(2);
        const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
        expect(loaded.expertVictories.theatre_of_blood).toBe(1);
    });
});

describe("a raid room's pace", () => {
    it("scales its enemies and caskets by where it'd be with no boss time before it", () => {
        const rooms = TEST_RAID.raid!.rooms;
        const fresh = raid();
        fresh["beginRaidRoom"](1);
        const late = raid();
        // As if the bosses before it took five minutes
        late.tick += 300 * TICKS_PER_SECOND;
        late["beginRaidRoom"](1);
        const expected = rooms[1].at - late["raidWaveLength"](1);
        expect(late["paceSeconds"]).toBeCloseTo(expected);
        expect(late["paceSeconds"]).toBeCloseTo(fresh["paceSeconds"]);
        expect(late["enemyHpScale"]()).toBeCloseTo(fresh["enemyHpScale"]());
        expect(late["casketSeconds"]).toBeCloseTo(fresh["casketSeconds"]);
        // and runs on with the room's own clock
        late.tick += 10 * TICKS_PER_SECOND;
        expect(late["paceSeconds"]).toBeCloseTo(expected + 10);
    });
});

describe("raid teleporters", () => {
    const room = () => TEST_RAID.raid!.rooms[0];
    function walkUp(sim: Sim): void {
        sim.player.x = room().teleporter!.x + 1;
        sim.player.y = room().teleporter!.y;
        sim["stepTeleporter"](room());
    }

    it("ask before taking you to the room's boss, saying how many are left", () => {
        const sim = raid(false, 2);
        walkUp(sim);
        expect(sim.state).toBe("event");
        expect(sim.offer?.def.speech).toContain(room().name);
        expect(sim.offer?.def.speech).toContain("2 more teleports");
        expect(sim.chooseEventOption(0)).toBe(true);
        expect(sim.raidStage).toBe("boss");
        expect(sim.raidTeleportsLeft).toBe(1);
        // The room's boss timer is cancelled
        expect(sim.raidBossDueTick).toBeLessThanOrEqual(sim.tick);
        expect(sim.timeLeftForBoss).toBe(0);
    });

    it("leave the next room its full waves, not the time saved as well", () => {
        const sim = raid(false, 2);
        toRoomSecond(sim, 5);
        walkUp(sim);
        sim.chooseEventOption(0);
        killBosses(sim);
        expect(sim.raidStage).toBe("cleared");
        toRoomSecond(sim, 8);
        expect(sim.raidRoom).toBe(1);
        // 50 seconds of waves, as it'd have had without the teleport
        expect(sim.timeLeftForBoss).toBeGreaterThan(49);
        expect(sim.timeLeftForBoss).toBeLessThanOrEqual(50);
        toRoomSecond(sim, 49);
        expect(sim.raidStage).toBe("waves");
        toRoomSecond(sim, 51);
        expect(sim.raidStage).toBe("boss");
    });

    it("can be turned down, and ask again only once you've stepped away", () => {
        const sim = raid(false, 2);
        walkUp(sim);
        sim.leaveEvent();
        expect(sim.state).toBe("playing");
        walkUp(sim);
        expect(sim.state).toBe("playing");
        sim.player.x = room().teleporter!.x - 10;
        sim["stepTeleporter"](room());
        walkUp(sim);
        expect(sim.state).toBe("event");
        expect(sim.raidTeleportsLeft).toBe(2);
    });

    it("are only in the halls of bosses killed before, any of their forms counting", () => {
        const save = createSave();
        expect(getRaidPortals(save, "theatre_of_blood")).toEqual([
            false,
            false,
            false,
            false,
            false,
            false,
        ]);
        save.enemyKills.maiden_of_sugadinti = 1;
        // Expert's blue Vasilias, and Verzik's last form
        save.enemyKills.nylocas_vasilias_magic = 1;
        save.enemyKills.tob_verzik_vitur_spider = 2;
        expect(getRaidPortals(save, "theatre_of_blood")).toEqual([
            true,
            false,
            true,
            false,
            false,
            true,
        ]);
        // Morytania's Verzik isn't the raid's
        expect(
            getRaidPortals({ ...save, enemyKills: { verzik_vitur: 5 } }, "theatre_of_blood")[5],
        ).toBe(false);
        const sim = raid(false, 2, [false, true]);
        expect(sim.raidTeleporter).toBeUndefined();
        walkUp(sim);
        expect(sim.state).toBe("playing");
    });

    it("aren't there before any boss is killed", () => {
        const sim = raid(false, 2, []);
        expect(sim.raidTeleporter).toBeUndefined();
        sim.takeEvents();
        walkUp(sim);
        expect(sim.state).toBe("playing");
        expect(sim.takeEvents().some((e) => e.type === "notice")).toBe(false);
    });

    it("stand in the hall while its waves are on, and go once the boss is up", () => {
        const sim = raid(false, 2);
        expect(sim.raidTeleporter).toEqual(room().teleporter);
        walkUp(sim);
        sim.chooseEventOption(0);
        expect(sim.raidTeleporter).toBeUndefined();
    });

    it("say so once they're used up", () => {
        const sim = raid(false, 2);
        sim.raidTeleportsLeft = 0;
        sim.takeEvents();
        walkUp(sim);
        expect(sim.state).toBe("playing");
        expect(
            sim
                .takeEvents()
                .some((e) => e.type === "notice" && e.message.includes("used all your teleports")),
        ).toBe(true);
    });
});

describe("raids in co-op", () => {
    function partyRaid(players: number): Sim {
        const sim = new Sim({
            grid: makeGrid(field(), 1000, 1000),
            mapId: TEST_RAID.id,
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: 1018.5,
            spawnY: 1010.5,
            party: Array.from({ length: players }, (_, i) => ({
                name: `p${i}`,
                characterId: "warrior",
                metaStats: emptyStats(),
            })),
        });
        for (const hero of sim.heroes) {
            hero.weapons = [];
            hero.player.invulnerable = 1e6;
        }
        return sim;
    }

    // To the first boss, everyone kept safe and every pause skipped
    function toBoss(sim: Sim): void {
        for (let steps = 0; sim.raidStage === "waves" && steps < 100_000; steps++) {
            for (const hero of sim.heroes) {
                hero.player.invulnerable = 1e6;
            }
            for (const hero of sim.waitingOn) {
                sim.as(hero.index, () => {
                    if (sim.state === "levelUp") sim.choose(0);
                    else if (sim.state === "chest") sim.resolveChest("take");
                    else if (sim.state === "event") sim.leaveEvent();
                });
            }
            sim.step();
        }
    }

    it("gives the supply chest only to who's still in, a turn each", () => {
        const sim = partyRaid(3);
        toBoss(sim);
        sim.leave(1);
        killBosses(sim);
        expect(sim.offer?.hero).toBe(0);
        sim.as(0, () => sim.leaveEvent());
        // Player 2 is next: player 1's gone
        expect(sim.offer?.hero).toBe(2);
        sim.as(2, () => sim.leaveEvent());
        expect(sim.state).toBe("playing");
    });

    it("goes on to the next player's turn if one leaves during theirs", () => {
        const sim = partyRaid(3);
        toBoss(sim);
        killBosses(sim);
        expect(sim.offer?.hero).toBe(0);
        sim.leave(0);
        expect(sim.offer?.hero).toBe(1);
        sim.as(1, () => sim.leaveEvent());
        sim.as(2, () => sim.leaveEvent());
        expect(sim.state).toBe("playing");
        expect(sim["raidShopQueue"]).toEqual([]);
    });
});
