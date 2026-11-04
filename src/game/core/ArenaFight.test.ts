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
