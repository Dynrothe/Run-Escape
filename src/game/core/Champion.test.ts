import { describe, expect, test } from "vitest";

import { getEnemy } from "../content/enemies";
import { BossAttackDef, emptyStats } from "../content/types";
import { BENEATH_CURSED_SANDS } from "../scaperune/maps/tombsOfAmascut";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

// The Champion of Scabaras (Beneath Cursed Sands' third part, content/cursedSands.ts): his
// trail of marks on where the player has just been (GroundPatternDef spots "trail"), solo and
// in co-op, and his nests (BossDef.exhumes with an opener), on open ground where the quest's
// square is.

const MAP = BENEATH_CURSED_SANDS;
const SQUARE = MAP.bossArena!;
const MARGIN = 10;
const ROWS = Array.from({ length: SQUARE.size + MARGIN * 2 }, () =>
    ".".repeat(SQUARE.size + MARGIN * 2),
);
const MIDDLE = { x: SQUARE.baseX + SQUARE.size / 2, y: SQUARE.baseY + SQUARE.size / 2 };
const CHAMPION = getEnemy("champion_of_scabaras");
const TRAIL = CHAMPION.boss!.attacks.find((a) => a.name === "Your shadow betrays you")!;

function createSim(party?: number): Sim {
    const sim = new Sim({
        grid: makeGrid(ROWS, SQUARE.baseX - MARGIN, SQUARE.baseY - MARGIN),
        mapId: MAP.id,
        characterId: "sands_delver",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        stage: 2,
        party:
            party === undefined
                ? undefined
                : Array.from({ length: party }, (_, i) => ({
                      name: "p" + i,
                      characterId: "sands_delver",
                      metaStats: emptyStats(),
                  })),
    });
    for (const hero of sim.heroes) {
        hero.weapons.length = 0;
    }
    return sim;
}

function run(sim: Sim, seconds: number): void {
    const ticks = Math.round(seconds * TICKS_PER_SECOND);
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step();
    }
}

function place(
    entity: { x: number; y: number; prevX: number; prevY: number },
    x: number,
    y: number,
) {
    entity.x = entity.prevX = x;
    entity.y = entity.prevY = y;
}

// Him up after his rise, quiet, at the middle's north; everyone untouchable and still
function risen(party?: number): { sim: Sim; boss: Enemy } {
    const sim = createSim(party);
    run(sim, CHAMPION.boss!.intro!.seconds + 0.1);
    const boss = sim.enemies.find((e) => e.def.id === CHAMPION.id && !e.dead)!;
    boss.attackCooldown = 1e9;
    boss.speed = 0;
    const state = boss.bossState!;
    state.windup = undefined;
    state.chain = undefined;
    state.follow = undefined;
    state.phase!.ambientsNext = [Infinity];
    place(boss, MIDDLE.x, MIDDLE.y + 6);
    sim.hazards = [];
    for (const hero of sim.heroes) {
        hero.player.invulnerable = 1e9;
        hero.moveX = hero.moveY = 0;
    }
    return { sim, boss };
}

// Each hero's place after every tick, by the tick it was in
function walk(sim: Sim, seconds: number, log: Map<number, { x: number; y: number }>[]): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
        const tick = sim.tick;
        sim.step();
        sim.heroes.forEach((hero, h) => log[h].set(tick, { x: hero.player.x, y: hero.player.y }));
    }
}

// The trail's marks, by how long ago each is from
function trailMarks(sim: Sim, boss: Enemy, attack: BossAttackDef, heroIndex = 0) {
    sim.hazards = [];
    sim.as(heroIndex, () => sim["startBossAttack"](boss, attack));
    return sim.hazards.filter((h) => h.attack === attack);
}

function expectNear(a: { x: number; y: number }, b: { x: number; y: number }) {
    // A tick's step either way
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.12);
}

describe("your shadow betrays you (a ground trail)", () => {
    test("marks where the player stood that long ago, not where they are", () => {
        const { sim, boss } = risen();
        const log = [new Map<number, { x: number; y: number }>()];
        place(sim.player, MIDDLE.x - 6, MIDDLE.y - 2);
        sim.setInput(0, 1, 0);
        walk(sim, 3, log);
        const ago = (TRAIL.ground!.spots[0] as { ago: number[] }).ago;
        const marks = trailMarks(sim, boss, TRAIL);
        expect(marks.length).toBe(ago.length);
        marks.forEach((mark, i) => {
            const then = log[0].get(sim.tick - Math.round(ago[i] * TICKS_PER_SECOND))!;
            expectNear(mark, then);
            // Behind them, along the way they came
            expect(mark.x).toBeLessThan(sim.player.x - 1);
            expect(mark.y).toBeCloseTo(MIDDLE.y - 2, 5);
        });
        // Further back, further behind
        for (let i = 1; i < marks.length; i++) {
            expect(marks[i].x).toBeLessThan(marks[i - 1].x);
        }
    });

    test("standing still, it's all on them; before it's kept, on them too", () => {
        const { sim, boss } = risen();
        run(sim, 3);
        for (const mark of trailMarks(sim, boss, TRAIL)) {
            expectNear(mark, sim.player);
        }
        const far: BossAttackDef = {
            ...TRAIL,
            ground: { ...TRAIL.ground!, spots: [{ shape: "trail", ago: [60] }] },
        };
        place(sim.player, MIDDLE.x + 3, MIDDLE.y);
        const [mark] = trailMarks(sim, boss, far);
        expectNear(mark, sim.player);
    });

    test("co-op: each player's own path, for whoever it's after", () => {
        const { sim, boss } = risen(2);
        const log = [new Map(), new Map()] as Map<number, { x: number; y: number }>[];
        place(sim.heroes[0].player, MIDDLE.x - 6, MIDDLE.y - 4);
        place(sim.heroes[1].player, MIDDLE.x + 4, MIDDLE.y - 6);
        sim.setInput(0, 1, 0);
        sim.setInput(1, 0, 1);
        walk(sim, 3, log);
        const ago = (TRAIL.ground!.spots[0] as { ago: number[] }).ago;
        for (const index of [0, 1]) {
            const marks = trailMarks(sim, boss, TRAIL, index);
            marks.forEach((mark, i) => {
                expectNear(mark, log[index].get(sim.tick - Math.round(ago[i] * TICKS_PER_SECOND))!);
            });
        }
        // East along a row, and north up a column
        expect(
            trailMarks(sim, boss, TRAIL, 0).every((m) => Math.abs(m.y - (MIDDLE.y - 4)) < 1e-6),
        ).toBe(true);
        expect(
            trailMarks(sim, boss, TRAIL, 1).every((m) => Math.abs(m.x - (MIDDLE.x + 4)) < 1e-6),
        ).toBe(true);
    });
});

describe("scarab nests (exhumes with an opener)", () => {
    const exhumes = CHAMPION.boss!.exhumes!;
    const nests = (sim: Sim) =>
        sim.hazards.filter((h) => h.attack.ground?.smother && h.endTick !== -1);

    // Through phase 2's threshold, and down to the nests' share
    function sunk(): { sim: Sim; boss: Enemy } {
        const { sim, boss } = risen();
        boss.attackCooldown = 0;
        place(sim.player, MIDDLE.x, MIDDLE.y - 4);
        sim.damageEnemy(boss, boss.maxHp * 0.4, 0, boss.x, boss.y, 0);
        run(sim, 2.1);
        sim.hazards = [];
        sim.damageEnemy(boss, boss.hp - boss.maxHp * exhumes.at[0] + 1, 0, boss.x, boss.y, 0);
        run(sim, 1.5);
        return { sim, boss };
    }

    test("all of them laid at once as he sinks, and he can't be hurt", () => {
        const { sim, boss } = sunk();
        expect(boss.bossState!.ordeal).toBeDefined();
        expect(nests(sim).length).toBe(exhumes.count);
        const hp = boss.hp;
        sim.damageEnemy(boss, 500, 0, boss.x, boss.y, 0);
        expect(boss.hp).toBe(hp);
        // Laid once: no more come while he's down
        run(sim, 6);
        expect(sim.hazards.filter((h) => h.attack.ground?.smother).length).toBe(exhumes.count);
    });

    test("smother them all and he rises at once, unhealed", () => {
        const { sim, boss } = sunk();
        const hp = boss.hp;
        for (const nest of nests(sim)) {
            place(sim.player, nest.x, nest.y);
            run(sim, 1.6);
        }
        run(sim, 0.1);
        expect(boss.bossState!.ordeal).toBeUndefined();
        expect(boss.hp).toBe(hp);
    });

    test("left alone, each still up heals him as he rises", () => {
        const { sim, boss } = sunk();
        place(sim.player, MIDDLE.x - 9, MIDDLE.y - 9);
        const hp = boss.hp;
        run(sim, exhumes.seconds);
        expect(boss.bossState!.ordeal).toBeUndefined();
        expect(boss.hp).toBe(hp + Math.round(boss.maxHp * exhumes.leftHeal * exhumes.count));
    });
});
