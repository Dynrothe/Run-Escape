import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import {
    ArenaFeatures,
    BossAttackDef,
    BossDef,
    BossPhasesDef,
    EnemyDef,
    emptyStats,
} from "../content/types";
import { SANCTUARY_BOSS_ARENA } from "../scaperune/maps/sisterhoodSanctuary";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

// The engine's arena fight pieces, each behind a field of its own (a boss that
// fights in the room it's in, not with the Nightmare's totems): phases on its
// hitpoints, a lunge's strip, a square blast, a wave that drags and binds, rows
// of bolts the pillars stop, a checker floor, a boomerang, a gaze to hide from,
// fire on a rhythm. Tried on Phosani's map with a boss of the test's own, on
// an open walled square.

const BASE = 1000;
const SIZE = 64;
const MIDDLE = BASE + SIZE / 2;

function grid(blocked: (x: number, y: number) => boolean = () => false): string[] {
    const rows: string[] = [];
    for (let row = 0; row < SIZE; row++) {
        const y = SIZE - 1 - row;
        let line = "";
        for (let x = 0; x < SIZE; x++) {
            const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
            line += edge || blocked(x, y) ? "#" : ".";
        }
        rows.push(line);
    }
    return rows;
}

function createSim(seed = 1, rows = grid(), party?: number): Sim {
    const sim = new Sim({
        grid: makeGrid(rows, BASE, BASE),
        mapId: "phosani",
        characterId: "inquisitor",
        metaStats: emptyStats(),
        seed,
        spawnX: MIDDLE + 0.5,
        spawnY: BASE + 8.5,
        party:
            party === undefined
                ? undefined
                : Array.from({ length: party }, (_, i) => ({
                      name: "p" + i,
                      characterId: "inquisitor",
                      metaStats: emptyStats(),
                  })),
    });
    // Her square is on the real map, not this test's field
    sim.map.bossArena = undefined;
    // Nothing of the player's own hits it unless a test says so
    for (const hero of sim.heroes) {
        hero.weapons.length = 0;
    }
    return sim;
}

afterEach(() => {
    const map = getMap("phosani");
    map.bossArena = SANCTUARY_BOSS_ARENA;
    map.features = undefined;
    if (map.fight) {
        delete map.fight.strikeReach;
    }
});

function run(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
    const ticks = Math.round(seconds * TICKS_PER_SECOND);
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step(moveX, moveY);
    }
}

function attack(
    fields: Partial<BossAttackDef> & Pick<BossAttackDef, "name" | "kind">,
): BossAttackDef {
    return { damage: 10, windup: 1, cooldown: 0, range: 99, weight: 0, ...fields };
}

const THREE_PHASES: BossPhasesDef = {
    phases: [
        { status: "The trial begins" },
        { status: "The Sepulchre wakes", message: "The court wakes!" },
        { status: "The verdict" },
    ],
    shieldMessage: "",
    blastMessage: "",
};

// Phosani's look and entrance, with the test's own fight
function bossDef(boss: Partial<BossDef>): EnemyDef {
    const phosani = getEnemy("phosanis_nightmare");
    return {
        ...phosani,
        boss: {
            attackInterval: 2,
            attacks: [],
            enrage: { message: "" },
            intro: phosani.boss!.intro,
            ...boss,
        },
    };
}

// Through its entrance, with nothing going: the test starts its attacks itself
function startFight(sim: Sim, def: EnemyDef, hp = 1000): Enemy {
    sim["eventIndex"] = 1;
    sim.startIntro(def, "finalBoss", hp);
    run(sim, def.boss!.intro!.seconds + 0.2);
    const boss = sim.enemies.find((e) => e.finalBoss && !e.dead)!;
    boss.attackCooldown = 1e9;
    const state = boss.bossState!;
    state.windup = undefined;
    state.chain = undefined;
    state.follow = undefined;
    state.channelEnd = 0;
    return boss;
}

// The boss starting one of its attacks, by name, on the player as they are
function use(sim: Sim, boss: Enemy, name: string): BossAttackDef {
    const found = boss.def.boss!.attacks.find((a) => a.name === name)!;
    sim["startBossAttack"](boss, found);
    return found;
}

function place(sim: Sim, x: number, y: number, hero = 0): void {
    const player = sim.heroes[hero].player;
    player.x = player.prevX = x;
    player.y = player.prevY = y;
}

function hpOf(sim: Sim, hero = 0): number {
    return sim.heroes[hero].player.hp;
}

describe("phases without totems", () => {
    test("go by its hitpoints: no totems, no shield, hits come off its hitpoints", () => {
        const sim = createSim();
        const boss = startFight(sim, bossDef({ phases: THREE_PHASES }), 900);
        const phase = boss.bossState!.phase!;
        expect(phase.stage).toBe("hp");
        expect(phase.totems).toEqual([]);
        expect(sim.enemies.filter((e) => e.totemOf)).toEqual([]);
        sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0);
        expect(boss.hp).toBeLessThan(900);
        expect(boss.hp).toBeGreaterThan(800);
        expect(phase.index).toBe(0);
    });

    test("an even split when until's unset, and the last phase ends in its death", () => {
        const sim = createSim();
        const boss = startFight(sim, bossDef({ phases: THREE_PHASES }), 900);
        const phase = boss.bossState!.phase!;
        boss.hp = 601;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        expect(phase.index).toBe(1);
        expect(boss.hp).toBe(600);
        boss.hp = 301;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        expect(phase.index).toBe(2);
        expect(boss.hp).toBe(300);
        boss.hp = 3;
        sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0);
        expect(boss.dead).toBe(true);
    });

    test("until sets the shares, and a big hit can't skip a phase or kill it early", () => {
        const sim = createSim();
        const phases: BossPhasesDef = {
            ...THREE_PHASES,
            phases: [
                { ...THREE_PHASES.phases[0], until: 0.7 },
                { ...THREE_PHASES.phases[1], until: 0.35 },
                THREE_PHASES.phases[2],
            ],
        };
        const boss = startFight(sim, bossDef({ phases }), 1000);
        const phase = boss.bossState!.phase!;
        sim.damageEnemy(boss, 5000, 0, boss.x, boss.y, 0);
        expect(boss.dead).toBe(false);
        expect(phase.index).toBe(1);
        expect(boss.hp).toBe(700);
        sim.damageEnemy(boss, 5000, 0, boss.x, boss.y, 0);
        expect(phase.index).toBe(2);
        expect(boss.hp).toBe(350);
    });

    test("each threshold's a kneel and a rise: untouchable, doing nothing, its shout and message", () => {
        const sim = createSim();
        const slash = attack({ name: "Slash", kind: "swing", radius: 3, weight: 1 });
        const def = bossDef({
            attacks: [slash],
            phases: {
                ...THREE_PHASES,
                threshold: {
                    seconds: 2,
                    seq: 7965,
                    riseSeq: 7962,
                    riseSeconds: 0.5,
                    shout: "Rise!",
                },
            },
        });
        const boss = startFight(sim, def, 900);
        sim.takeEvents();
        boss.hp = 601;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        const phase = boss.bossState!.phase!;
        expect(phase.index).toBe(1);
        const events = sim.takeEvents();
        expect(events).toContainEqual(
            expect.objectContaining({ type: "bossShout", text: "Rise!" }),
        );
        expect(events).toContainEqual(
            expect.objectContaining({
                type: "bossStage",
                phase: 2,
                stage: "hp",
                message: "The court wakes!",
            }),
        );
        expect(boss.attackSeq).toBe(7965);
        // Nothing gets through, and it attacks nothing, however ready it is
        boss.attackCooldown = 0;
        const { x, y } = boss;
        run(sim, 1.4);
        expect(boss.bossState!.windup).toBeUndefined();
        expect(sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0)).toBe(0);
        expect(boss.hp).toBe(600);
        expect([boss.x, boss.y]).toEqual([x, y]);
        // Up it gets for the last of it, then it's back to work
        run(sim, 0.2);
        expect(boss.attackSeq).toBe(7962);
        run(sim, 0.6);
        expect(phase.pauseEnd).toBeUndefined();
        run(sim, 0.2);
        expect(boss.bossState!.windup?.attack.name).toBe("Slash");
        expect(sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0)).toBeGreaterThan(0);
    });

    test("the Nightmare's phases still have their totems and shield", () => {
        const sim = createSim();
        const boss = startFight(sim, getEnemy("phosanis_nightmare"), 6000);
        const phase = boss.bossState!.phase!;
        expect(phase.stage).toBe("shield");
        expect(phase.totems).toHaveLength(4);
        expect(sim.confinedToArena).toBe(false);
        sim.map.bossArena = { baseX: BASE, baseY: BASE, size: SIZE };
        expect(sim.confinedToArena).toBe(true);
    });

    test("confine: false lets the player out of the bossArena", () => {
        const sim = createSim();
        startFight(sim, bossDef({ phases: { ...THREE_PHASES, confine: false } }));
        sim.map.bossArena = { baseX: BASE + 20, baseY: BASE + 20, size: 20 };
        expect(sim.confinedToArena).toBe(false);
        place(sim, BASE + 30, BASE + 21);
        run(sim, 1, 0, -1);
        expect(sim.player.y).toBeLessThan(BASE + 19);
    });
});

describe("a lunge's strip and a square blast", () => {
    const lunge = attack({ name: "Lunge", kind: "swing", line: { width: 2, length: 7 } });
    const ice = attack({
        name: "Ice",
        kind: "blast",
        square: 3,
        impactSpotAnim: 369,
        effect: { kind: "freeze", seconds: 1.5 },
    });

    function fight(): { sim: Sim; boss: Enemy } {
        const sim = createSim();
        const boss = startFight(sim, bossDef({ attacks: [lunge, ice] }));
        boss.x = boss.prevX = MIDDLE;
        boss.y = boss.prevY = MIDDLE;
        return { sim, boss };
    }

    test("a lunge hits down its strip, the way it faced as it began, and nowhere else", () => {
        for (const [dx, dy, hit] of [
            [0, 6.5, true], // down the strip, near its end
            [0.9, 3, true], // just in its width
            [1.6, 3, false], // beside it
            [0, -1.2, false], // behind him
            [0, 8, false], // past its end
            [2.5, 0, false], // beside him
        ] as const) {
            const { sim, boss } = fight();
            place(sim, MIDDLE, MIDDLE + 5);
            use(sim, boss, "Lunge");
            // It's aimed as it begins: stepping off now is too late only if it lands
            place(sim, MIDDLE + dx, MIDDLE + dy);
            const hp = hpOf(sim);
            run(sim, lunge.windup + 0.05);
            expect([dx, dy, hpOf(sim) < hp]).toEqual([dx, dy, hit]);
        }
    });

    test("the square lands on the tile they stood on, all of it, and freezes them", () => {
        const { sim, boss } = fight();
        place(sim, MIDDLE + 5.2, MIDDLE + 5.9);
        use(sim, boss, "Ice");
        const windup = boss.bossState!.windup!;
        expect(windup.targets[0]).toEqual({ x: MIDDLE + 5.5, y: MIDDLE + 5.5 });
        // A corner of the square, not of its circle
        place(sim, MIDDLE + 6.9, MIDDLE + 6.9);
        const hp = hpOf(sim);
        sim.takeEvents();
        run(sim, ice.windup + 0.05);
        expect(hpOf(sim)).toBeLessThan(hp);
        expect(sim.player.frozen).toBeGreaterThan(0);
        // Ice on every one of its nine tiles
        const ices = sim.effects.filter((e) => e.spotAnim === 369 && e.x !== sim.player.x);
        expect(ices.length).toBeGreaterThanOrEqual(9);
    });

    test("a step clear of the square's edge is clear of it", () => {
        const { sim, boss } = fight();
        place(sim, MIDDLE + 5.5, MIDDLE + 5.5);
        use(sim, boss, "Ice");
        place(sim, MIDDLE + 7 + sim.player.radius + 0.05, MIDDLE + 5.5);
        const hp = hpOf(sim);
        run(sim, ice.windup + 0.05);
        expect(hpOf(sim)).toBe(hp);
        expect(sim.player.frozen).toBe(0);
    });
});

describe("a shock wave that drags and binds", () => {
    const flurry = attack({
        name: "Flurry",
        kind: "swing",
        radius: 2.5,
        damage: 4,
        windup: 0.3,
        chain: { times: 2, windup: 0.3 },
    });
    const wave = attack({
        name: "Shock wave",
        kind: "projectile",
        speed: 6.5,
        radius: 0.75,
        damage: 3,
        windup: 0.5,
        wave: { reach: 12 },
        onHit: { pull: 1.5, pullSeconds: 0.3, bind: 1.5, attack: "Flurry" },
    });

    function fight(party?: number): { sim: Sim; boss: Enemy } {
        const sim = createSim(1, grid(), party);
        const boss = startFight(sim, bossDef({ attacks: [wave, flurry] }));
        boss.x = boss.prevX = MIDDLE;
        boss.y = boss.prevY = MIDDLE;
        return { sim, boss };
    }

    test("it runs along the ground through everyone in its line, each once, as far as its reach", () => {
        const { sim, boss } = fight(3);
        place(sim, MIDDLE, MIDDLE + 4, 0);
        place(sim, MIDDLE, MIDDLE + 8, 1);
        place(sim, MIDDLE, MIDDLE + 14, 2);
        sim["use"](sim.heroes[0]);
        use(sim, boss, "Shock wave");
        // Bound where they're hit, so nobody wanders into it twice
        const hp = sim.heroes.map((h) => h.player.hp);
        run(sim, wave.windup + 0.05);
        expect(sim.enemyProjectiles[0].hit).toEqual([]);
        run(sim, 2);
        expect(sim.heroes[0].player.hp).toBeLessThan(hp[0]);
        expect(sim.heroes[1].player.hp).toBeLessThan(hp[1]);
        expect(sim.heroes[2].player.hp).toBe(hp[2]);
        expect(sim.enemyProjectiles).toEqual([]);
    });

    test("a step to the side is clear of it", () => {
        const { sim, boss } = fight();
        place(sim, MIDDLE, MIDDLE + 6);
        use(sim, boss, "Shock wave");
        place(sim, MIDDLE + 1.5, MIDDLE + 6);
        const hp = hpOf(sim);
        run(sim, 2.5);
        expect(hpOf(sim)).toBe(hp);
        expect(sim.player.frozen).toBe(0);
    });

    test("whoever it hits is dragged to its feet, held, and given the flurry", () => {
        const { sim, boss } = fight();
        place(sim, MIDDLE, MIDDLE + 6);
        use(sim, boss, "Shock wave");
        run(sim, wave.windup + 0.05);
        const hp = hpOf(sim);
        // Until it reaches them
        while (hpOf(sim) === hp) {
            run(sim, 0.02);
        }
        const hit = sim.tick;
        expect(sim.heroes[0].drag).toBeDefined();
        run(sim, 0.32, 1, 0);
        // At its feet, wherever it's walked to meanwhile
        const pull = Math.max(1.5, boss.radius + sim.player.radius);
        expect(Math.hypot(sim.player.x - boss.x, sim.player.y - boss.y)).toBeCloseTo(pull, 1);
        expect(boss.bossState!.windup?.attack.name).toBe("Flurry");
        // Held there: the stick does nothing
        const at = sim.player.x;
        run(sim, 1, 1, 0);
        expect(sim.player.x).toBeCloseTo(at, 5);
        // Three hits of the flurry while they're held, then they're free
        const flurry = sim.damageByAttack["Flurry"] ?? 0;
        expect(flurry).toBeGreaterThan(0);
        expect(flurry % 3).toBe(0);
        expect(boss.bossState!.chain).toBeUndefined();
        run(sim, 1.5 - (sim.tick - hit) / TICKS_PER_SECOND + 0.6);
        expect(sim.player.frozen).toBe(0);
        expect(sim.heroes[0].drag).toBeUndefined();
        run(sim, 0.5, 1, 0);
        expect(sim.player.x).toBeGreaterThan(at + 0.5);
    });
});

describe("the knights' sword: out and back", () => {
    const sword = attack({
        name: "Knight's sword",
        kind: "projectile",
        speed: 10,
        radius: 1.5,
        damage: 5,
        windup: 1,
        from: "knights",
        boomerang: { reach: 30, catchSeq: 8668, catchSound: 4442 },
        statues: { locId: 38432, windupSeq: 8667 },
    });
    const KNIGHTS: ArenaFeatures = {
        knights: [
            { x: BASE + 10, y: BASE + 10, size: 3 },
            { x: BASE + 51, y: BASE + 10, size: 3 },
        ],
    };

    function fight(count = 1): { sim: Sim; boss: Enemy } {
        const sim = createSim();
        sim.map.features = KNIGHTS;
        const boss = startFight(sim, bossDef({ attacks: [{ ...sword, count }] }));
        boss.x = boss.prevX = MIDDLE;
        boss.y = boss.prevY = BASE + 50;
        return { sim, boss };
    }

    test("a knight throws it at where they stood, out its reach and back, hitting each way", () => {
        const { sim, boss } = fight();
        // Level with both knights' middles, so it's the same line either way
        place(sim, MIDDLE, BASE + 11.5);
        sim.takeEvents();
        use(sim, boss, "Knight's sword");
        const windup = boss.bossState!.windup!;
        expect(windup.from).toHaveLength(1);
        const knight = windup.from![0];
        expect(sim.takeEvents()).toContainEqual({
            type: "statueSeq",
            locId: 38432,
            x: knight.x,
            y: knight.y,
            seq: 8667,
        });
        run(sim, sword.windup + 0.05);
        const thrown = sim.enemyProjectiles[0];
        expect(thrown.boomerang?.fromX).toBe(knight.x + 1.5);
        expect(thrown.boomerang?.fromY).toBe(knight.y + 1.5);
        const hp = hpOf(sim);
        run(sim, 2.1);
        const once = hpOf(sim);
        expect(once).toBeLessThan(hp);
        // Its reach, then back the way it came, through them again
        run(sim, 2.2);
        expect(hpOf(sim)).toBeLessThan(once);
        expect(sim.enemyProjectiles).toHaveLength(1);
        run(sim, 2);
        expect(sim.enemyProjectiles).toEqual([]);
        const events = sim.takeEvents();
        expect(events).toContainEqual(expect.objectContaining({ type: "statueSeq", seq: 8668 }));
        expect(events).toContainEqual(expect.objectContaining({ type: "bossAttack", sound: 4442 }));
        expect(sim.damageByAttack["Knight's sword"]).toBe(hp - hpOf(sim));
    });

    test("count of them throw, each its own knight", () => {
        const { sim, boss } = fight(2);
        place(sim, MIDDLE, BASE + 30);
        use(sim, boss, "Knight's sword");
        const from = boss.bossState!.windup!.from!;
        expect(new Set(from.map((k) => k.x))).toEqual(new Set([BASE + 10, BASE + 51]));
        run(sim, sword.windup + 0.05);
        expect(sim.enemyProjectiles).toHaveLength(2);
    });
});

describe("rows of bolts, stopped by pillars", () => {
    const bolts = attack({
        name: "Bolts",
        kind: "pattern",
        damage: 2,
        windup: 0,
        spotAnim: 27,
        statues: { locId: 38445, windupSeq: 8682, seq: 8684 },
        pattern: {
            shape: "rows",
            count: 1,
            volleys: 3,
            interval: 0.4,
            speed: 10,
            range: 60,
            radius: 0.3,
            delay: 1,
            pillars: true,
            rows: { sets: [[0, 2], [1]] },
        },
    });
    const row = (y: number, dir: 1 | -1) => ({
        y: BASE + y,
        fromX: dir === 1 ? BASE + 5 : BASE + 58,
        toX: dir === 1 ? BASE + 58 : BASE + 5,
        dir,
        statues: [{ x: dir === 1 ? BASE + 3 : BASE + 60, y: BASE + y }],
    });
    const FEATURES: ArenaFeatures = {
        bolts: [row(20, 1), row(24, -1), row(28, 1)],
        pillars: [{ x: BASE + 30, y: BASE + 27, size: 2 }],
    };

    function fight(pillars = true): { sim: Sim; boss: Enemy } {
        const sim = createSim();
        sim.map.features = FEATURES;
        const phases: BossPhasesDef = {
            ...THREE_PHASES,
            phases: [{ ambients: [{ attack: "Bolts", interval: 6 }] }],
        };
        const def = bossDef({
            attacks: [{ ...bolts, pattern: { ...bolts.pattern!, pillars } }],
            phases,
        });
        sim["eventIndex"] = 1;
        sim.startIntro(def, "finalBoss", 1000);
        run(sim, def.boss!.intro!.seconds - 0.1);
        const boss = sim.enemies.find((e) => e.finalBoss)!;
        boss.x = boss.prevX = MIDDLE;
        boss.y = boss.prevY = BASE + 50;
        sim.takeEvents();
        return { sim, boss };
    }

    test("each time, the next set of rows: their statues draw, then fire down them", () => {
        const { sim } = fight();
        place(sim, BASE + 40.5, BASE + 40.5);
        run(sim, 0.2);
        const emitter = sim["emitters"][0];
        expect(emitter.rows).toEqual([0, 2]);
        const events = sim.takeEvents();
        const seqs = (seq: number) =>
            events
                .filter((e) => e.type === "statueSeq" && e.seq === seq)
                .map((e) => e.type === "statueSeq" && e.x);
        expect(seqs(8682)).toEqual([BASE + 3, BASE + 3]);
        // Nothing till they've drawn
        expect(sim.bullets.count).toBe(0);
        run(sim, 1);
        expect(sim.bullets.count).toBe(2);
        expect(sim.takeEvents()).toContainEqual(
            expect.objectContaining({ type: "statueSeq", seq: 8684 }),
        );
        run(sim, 5);
        expect(sim["emitters"][0].rows).toEqual([1]);
    });

    test("a bolt hits whoever's in its row, and a quiet row's quiet", () => {
        const { sim } = fight();
        place(sim, BASE + 40.5, BASE + 20.5);
        sim.heroes[0].player.radius = 0.35;
        const hp = hpOf(sim);
        run(sim, 5);
        expect(hpOf(sim)).toBeLessThan(hp);
        const quiet = fight().sim;
        place(quiet, BASE + 40.5, BASE + 22.5);
        const before = hpOf(quiet);
        run(quiet, 5);
        expect(hpOf(quiet)).toBe(before);
    });

    test("the pillar takes the bolt for whoever's behind it, and only with pillars set", () => {
        for (const [pillars, x, hit] of [
            [true, 36.5, false], // behind the pillar
            [true, 25.5, true], // in front of it
            [false, 36.5, true], // a bolt that doesn't stop
        ] as const) {
            const { sim } = fight(pillars);
            place(sim, BASE + x, BASE + 28.5);
            const hp = hpOf(sim);
            run(sim, 5);
            expect([pillars, x, hpOf(sim) < hp]).toEqual([pillars, x, hit]);
        }
    });
});

describe("the checker floor", () => {
    const lightning = attack({
        name: "Lightning",
        kind: "ground",
        damage: 6,
        windup: 1.6,
        impactSpotAnim: 1796,
        ground: { spots: [{ shape: "checker", then: 1.6 }], radius: 1.5 },
    });
    const CHECKER: ArenaFeatures = {
        checker: { x0: BASE + 20, y0: BASE + 20, cell: 3, cols: 4, rows: 4 },
    };

    function fight(cross?: number): { sim: Sim; boss: Enemy } {
        const sim = createSim();
        sim.map.features = CHECKER;
        const ground = {
            ...lightning.ground!,
            spots: [{ shape: "checker" as const, then: 1.6, cross }],
        };
        const boss = startFight(sim, bossDef({ attacks: [{ ...lightning, ground }] }));
        boss.x = boss.prevX = MIDDLE;
        boss.y = boss.prevY = BASE + 50;
        sim.hazards = [];
        return { sim, boss };
    }

    // The middle of the cell cx, cy
    const cell = (cx: number, cy: number) => ({
        x: BASE + 20 + cx * 3 + 1.5,
        y: BASE + 20 + cy * 3 + 1.5,
    });

    test("one colour's cells first, each a square of its own, then the other's", () => {
        const { sim, boss } = fight();
        place(sim, cell(1, 1).x, cell(1, 1).y);
        use(sim, boss, "Lightning");
        expect(sim.hazards).toHaveLength(16);
        const now = sim.hazards.filter((h) => h.startTick === sim.tick);
        const later = sim.hazards.filter((h) => h.startTick !== sim.tick);
        expect(now).toHaveLength(8);
        expect(later).toHaveLength(8);
        for (const h of sim.hazards) {
            expect(h.half).toBe(1.5);
        }
        // The colours alternate, as a checker's do
        const colour = (h: { x: number; y: number }) =>
            (Math.floor((h.x - BASE - 20) / 3) + Math.floor((h.y - BASE - 20) / 3)) % 2;
        expect(new Set(now.map(colour)).size).toBe(1);
        expect(new Set(later.map(colour)).size).toBe(1);
        expect(colour(now[0])).not.toBe(colour(later[0]));
        expect(later[0].startTick).toBe(now[0].landTick);
        expect(later[0].landTick - now[0].landTick).toBe(1.6 * TICKS_PER_SECOND);
    });

    test("stand on the other colour, then cross back once the first has struck", () => {
        const { sim, boss } = fight();
        place(sim, cell(1, 1).x, cell(1, 1).y);
        use(sim, boss, "Lightning");
        const first = sim.hazards.find((h) => h.startTick === sim.tick)!;
        const second = sim.hazards.find((h) => h.startTick !== sim.tick)!;
        // On the second colour, near the edge of its cell, but in it
        place(sim, second.x + 1.4 - sim.player.radius, second.y);
        const hp = hpOf(sim);
        run(sim, 1.65);
        expect(hpOf(sim)).toBe(hp);
        // Over to the first colour's cell, struck already
        place(sim, first.x, first.y);
        run(sim, 1.7);
        expect(hpOf(sim)).toBe(hp);
        expect(sim.hazards).toEqual([]);
    });

    test("whoever stays put on a cell when it strikes is hit, at its corner too", () => {
        const { sim, boss } = fight();
        place(sim, cell(1, 1).x, cell(1, 1).y);
        use(sim, boss, "Lightning");
        const first = sim.hazards.find((h) => h.startTick === sim.tick)!;
        place(sim, first.x + 1.45, first.y + 1.45);
        const hp = hpOf(sim);
        run(sim, 1.65);
        expect(hpOf(sim)).toBeLessThan(hp);
    });

    test("the cross: only the cells along their row and column, cross cells out", () => {
        const { sim, boss } = fight(1);
        place(sim, cell(1, 2).x, cell(1, 2).y);
        use(sim, boss, "Lightning");
        const cells = sim.hazards.map((h) => [(h.x - BASE - 21.5) / 3, (h.y - BASE - 21.5) / 3]);
        expect(cells.sort()).toEqual(
            [
                [0, 2],
                [1, 1],
                [1, 2],
                [1, 3],
                [2, 2],
            ].sort(),
        );
    });

    test("with no checker on the map it marks nothing", () => {
        const { sim, boss } = fight();
        sim.map.features = undefined;
        use(sim, boss, "Lightning");
        expect(sim.hazards).toEqual([]);
    });
});

describe("the gaze, and hiding from it", () => {
    const gaze = attack({
        name: "Gaze",
        kind: "swing",
        radius: 40,
        damage: 15,
        windup: 2.5,
        cover: {},
    });
    const PILLARS: ArenaFeatures = {
        pillars: [
            { x: BASE + 26, y: BASE + 40, size: 2 },
            { x: BASE + 36, y: BASE + 40, size: 2 },
        ],
    };

    function fight(party?: number): { sim: Sim; boss: Enemy } {
        const rows = grid(
            (x, y) => (x === 26 || x === 27 || x === 36 || x === 37) && (y === 40 || y === 41),
        );
        const sim = createSim(1, rows, party);
        sim.map.features = PILLARS;
        const boss = startFight(sim, bossDef({ attacks: [gaze] }));
        boss.x = boss.prevX = MIDDLE;
        boss.y = boss.prevY = BASE + 50;
        return { sim, boss };
    }

    test("it hits everyone it can see, and spares whoever's behind a pillar", () => {
        const { sim, boss } = fight(3);
        // Behind the west pillar from it; out in the open; behind the east one
        place(sim, BASE + 25, BASE + 36, 0);
        place(sim, MIDDLE, BASE + 36, 1);
        place(sim, BASE + 38.5, BASE + 37, 2);
        sim["use"](sim.heroes[1]);
        use(sim, boss, "Gaze");
        const hp = sim.heroes.map((h) => h.player.hp);
        run(sim, gaze.windup + 0.05);
        expect(sim.heroes.map((h, i) => h.player.hp < hp[i])).toEqual([false, true, false]);
    });

    test("only a pillar the line goes through: beside one, it sees them", () => {
        const { sim, boss } = fight();
        place(sim, BASE + 24, BASE + 44);
        use(sim, boss, "Gaze");
        const hp = hpOf(sim);
        run(sim, gaze.windup + 0.05);
        expect(hpOf(sim)).toBeLessThan(hp);
    });

    test("without cover, a pillar's no help", () => {
        const { sim, boss } = fight();
        boss.def.boss!.attacks[0] = { ...gaze, cover: undefined };
        place(sim, BASE + 25, BASE + 36);
        use(sim, boss, "Gaze");
        const hp = hpOf(sim);
        run(sim, gaze.windup + 0.05);
        expect(hpOf(sim)).toBeLessThan(hp);
    });
});
