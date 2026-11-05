import { describe, expect, test } from "vitest";

import {
    BELL_CHOIR_HITPOINTS,
    BELL_CHOIR_TOLL,
    SUNKEN_CATHEDRAL_FEATURES,
} from "../content/bellchoir";
import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import { PET_BY_ID } from "../content/pets";
import { TROPHY_BY_ID } from "../content/trophies";
import { SongPhraseDef, emptyStats } from "../content/types";
import { SUNKEN_CATHEDRAL } from "../scaperune/maps/sunkenCathedral";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { statueMiddle } from "./arena";
import { Enemy, SongState } from "./entities";
import { applyAction, cleanAction, syncHash } from "./lockstep";
import { createSave } from "./save";
import { inShape } from "./song";
import { makeGrid } from "./world/testGrid";

// The Bell Choir: the Whisperer's song in the sunken cathedral (docs/design/the-bell-choir.md).
// On the nave as the map lays it out (its bells and pews solid), without the cache: the real
// cathedral's walls are a cut from it, so here the nave's box is open and everything round it
// solid. Each attack lands on its beat and is dodged as the design says; Toll is judged on the
// beat; a Grace is for stepping out on the last count.

const O = SUNKEN_CATHEDRAL.origin;
const NAVE = SUNKEN_CATHEDRAL.nave;
const RADIUS = 0.35;

const NAVE_ROWS = (() => {
    const solid = new Set<string>();
    const block = (x: number, y: number, w: number, h: number) => {
        for (let ty = y; ty < y + h; ty++) {
            for (let tx = x; tx < x + w; tx++) {
                solid.add(`${tx},${ty}`);
            }
        }
    };
    for (const bell of [...SUNKEN_CATHEDRAL.bells, SUNKEN_CATHEDRAL.tenor]) {
        block(bell.x, bell.y, bell.size, bell.size);
    }
    const aisle = SUNKEN_CATHEDRAL.aisle;
    for (const pew of SUNKEN_CATHEDRAL.pews) {
        block(pew.x0, pew.y, aisle.x0 - pew.x0, 1);
        block(aisle.x1 + 1, pew.y, pew.x1 - aisle.x1, 1);
    }
    const rows: string[] = [];
    for (let y = 63; y >= 0; y--) {
        let row = "";
        for (let x = 0; x < 64; x++) {
            const open =
                x >= NAVE.x0 &&
                x <= NAVE.x1 &&
                y >= NAVE.y0 &&
                y <= NAVE.y1 &&
                !solid.has(`${x},${y}`);
            row += open ? "." : "#";
        }
        rows.push(row);
    }
    return rows;
})();

// A tile's middle in world tiles, from the arena's own
const at = (x: number, y: number) => ({ x: O.x + x + 0.5, y: O.y + y + 0.5 });

function createSim(seed = 1, party?: number, hard = false): Sim {
    const map = getMap("bellchoir");
    return new Sim({
        grid: makeGrid(NAVE_ROWS, O.x, O.y),
        mapId: "bellchoir",
        characterId: "bellringer",
        metaStats: emptyStats(),
        seed,
        hard,
        spawnX: map.spawn.x,
        spawnY: map.spawn.y,
        party:
            party === undefined
                ? undefined
                : Array.from({ length: party }, (_, i) => ({
                      name: "p" + i,
                      characterId: "bellringer",
                      metaStats: emptyStats(),
                  })),
    });
}

function run(sim: Sim, ticks: number, moveX = 0, moveY = 0): void {
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step(moveX, moveY);
    }
}

const whisperer = () => getEnemy("the_whisperer");
const phrase = (name: string): SongPhraseDef =>
    whisperer().boss!.song!.phrases.find((p) => p.name === name)!;
const song = (sim: Sim): SongState => sim.song!;
const tpb = (sim: Sim) => song(sim).ticksPerBeat;

// Through her entrance to the fight's first downbeat, with nothing of hers begun: each test starts
// the phrase it's about itself
function startFight(sim: Sim): Enemy {
    run(sim, 1);
    const s = song(sim);
    s.voiceFree = s.arenaFree = 1e9;
    toBeat(sim, 12);
    const boss = sim.enemies.find((e) => e.finalBoss)!;
    s.notes = [];
    s.phrases = [];
    return boss;
}

// Steps until the tick of a beat
function toBeat(sim: Sim, beat: number): void {
    for (let i = 0; i < 100 && !sim.song; i++) {
        sim.step(0, 0);
    }
    const s = song(sim);
    for (let i = 0; i < 10000 && !(s.beat === beat && s.beatTick === sim.tick); i++) {
        sim.step(0, 0);
    }
    expect(s.beat).toBe(beat);
}

// The next downbeat, where a phrase can begin
function toDownbeat(sim: Sim): void {
    const s = song(sim);
    toBeat(sim, s.barBeat + 4);
}

function startPhrase(sim: Sim, boss: Enemy, name: string, canon = false): void {
    sim["startPhrase"](song(sim), phrase(name), boss, canon);
}

function place(sim: Sim, spot: { x: number; y: number }, hero = 0): void {
    const player = sim.heroes[hero].player;
    player.x = player.prevX = spot.x;
    player.y = player.prevY = spot.y;
}

function placeBoss(boss: Enemy, spot: { x: number; y: number }): void {
    boss.x = boss.prevX = spot.x;
    boss.y = boss.prevY = spot.y;
    boss.vx = boss.vy = 0;
}

// A Toll pressed at this tick (or at, for a co-op guest's from a moment ago)
function toll(sim: Sim, at?: number, hero = 0): boolean {
    return sim.as(hero, () =>
        applyAction(sim, at === undefined ? { kind: "ability" } : { kind: "ability", at }),
    );
}

const hp = (sim: Sim, hero = 0) => sim.heroes[hero].player.hp;
const resonance = (sim: Sim, hero = 0) => sim.heroes[hero].song!.resonance;
const middle = { x: O.x + 32.5, y: O.y + 37.5 };

describe("the map", () => {
    test("is one fight, after Zachariah's, with the Bellringer and their Toll", () => {
        const map = getMap("bellchoir");
        expect(map.fight).toEqual({
            requires: "zachariah",
            character: "bellringer",
            weaponLevel: 1,
            ability: BELL_CHOIR_TOLL,
        });
        expect(map.waves).toEqual([]);
        expect(map.events).toEqual([
            { at: 0, kind: "finalBoss", enemyId: "the_whisperer", hp: BELL_CHOIR_HITPOINTS },
        ]);
        expect(map.music).toBe("Song of the Silent Choir");
        expect(map.hard).toEqual({ hp: 1.3, damage: 1.3 });
        const character = getCharacter("bellringer");
        expect(character.only).toBe("bellchoir");
        expect(character.startingWeapon).toBeUndefined();
        expect(createSave().unlockedCharacters).not.toContain("bellringer");
        const sim = createSim();
        // No weapon: all the damage is Toll's
        expect(sim.weapons).toEqual([]);
        expect(sim.player.maxHp).toBe(30);
    });

    test("its features are the cathedral's, in world tiles", () => {
        const f = SUNKEN_CATHEDRAL_FEATURES;
        expect(f.bells).toHaveLength(4);
        expect(f.choir).toHaveLength(6);
        expect(f.bands).toHaveLength(9);
        expect(f.nave).toEqual({
            x0: O.x + NAVE.x0,
            y0: O.y + NAVE.y0,
            x1: O.x + NAVE.x1,
            y1: O.y + NAVE.y1,
        });
        // The bands cover every row of the nave, north to south, with no row between them
        const bands = f.bands!;
        expect(bands[0].y1).toBe(O.y + NAVE.y1);
        expect(bands[bands.length - 1].y0).toBe(O.y + NAVE.y0);
        for (let i = 1; i < bands.length; i++) {
            expect(bands[i].y1).toBe(bands[i - 1].y0 - 1);
            expect(bands[i].y1 - bands[i].y0).toBeGreaterThanOrEqual(2);
        }
        // The bells and the choir mirror about the axis, so the canon's copies are like for like
        const axis = f.axis!;
        const m = f.bells!.map(statueMiddle);
        expect(m[0].x + m[1].x).toBeCloseTo(2 * axis);
        expect(m[2].x + m[3].x).toBeCloseTo(2 * axis);
        const choir = f.choir!;
        expect(choir[0].x + 0.5 + choir[3].x + 0.5).toBeCloseTo(2 * axis);
    });

    test("its pet is the Wisp: 1 in 10, certain on hard", () => {
        expect(PET_BY_ID.get("wisp")?.npcId).toBe(12157);
        expect(TROPHY_BY_ID.get("wisp")?.from).toMatchObject({
            kind: "boss",
            enemyId: "the_whisperer",
            mapId: "bellchoir",
            chance: 1 / 10,
            hardChance: 1,
        });
    });
});

describe("the beat", () => {
    test("runs from her entrance, a beat each 25 ticks, and her song begins on bar 3", () => {
        const sim = createSim();
        run(sim, 1);
        const s = song(sim);
        const start = s.startTick;
        toBeat(sim, 4);
        expect(sim.tick - start).toBe(100);
        expect(s.barBeat).toBe(4);
        // The entrance is three bars, and the first phrases begin on the next downbeat
        const sim2 = createSim();
        toBeat(sim2, 12);
        expect(song(sim2).playing).toBe(true);
        expect(song(sim2).phrases.length).toBeGreaterThan(0);
        expect(song(sim2).phrases.every((p) => p.startBeat === 12)).toBe(true);
    });

    test("each phase's tempo comes in on a downbeat after a quiet bar and a count-in", () => {
        const sim = createSim();
        const boss = startFight(sim);
        expect(tpb(sim)).toBe(25);
        // Into the second phase, a beat into a bar
        toBeat(sim, 13);
        boss.hp = Math.round(boss.maxHp * 0.74) - 5;
        sim.damageEnemy(boss, 1, 0, boss.x, boss.y);
        const phase = boss.bossState!.phase!;
        expect(phase.index).toBe(1);
        expect(song(sim).playing).toBe(false);
        // The rest of this bar at the old tempo (three beats, half a bar or more), then a bar
        // counted in at the new one: up at bar 5's downbeat
        expect(song(sim).tempoAt).toEqual({ beat: 16, ticksPerBeat: 22 });
        const up = phase.pauseEnd!;
        toBeat(sim, 16);
        expect(tpb(sim)).toBe(22);
        expect(up - sim.tick).toBe(4 * 22);
        // Untouchable meanwhile
        expect(toll(sim)).toBe(true);
        expect(boss.hp).toBe(Math.round(boss.maxHp * 0.74));
        toBeat(sim, 20);
        expect(sim.tick).toBe(up);
        expect(song(sim).playing).toBe(true);
        // Its opener, the Psalm, and a voice phrase
        expect(song(sim).phrases.map((p) => p.def.name)).toContain("The Psalm");
    });

    test("a crossing late in a bar keeps the next bar quiet too", () => {
        const sim = createSim();
        const boss = startFight(sim);
        toBeat(sim, 15);
        boss.hp = Math.round(boss.maxHp * 0.74) - 5;
        sim.damageEnemy(boss, 1, 0, boss.x, boss.y);
        expect(song(sim).tempoAt).toEqual({ beat: 20, ticksPerBeat: 22 });
    });
});

describe("Toll", () => {
    function ready(): { sim: Sim; boss: Enemy } {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, middle);
        place(sim, { x: middle.x, y: middle.y - 4 });
        return { sim, boss };
    }

    test("on the beat near her: 6 and a Resonance, then 2 more for each", () => {
        const { sim, boss } = ready();
        const before = boss.hp;
        expect(toll(sim)).toBe(true);
        expect(before - boss.hp).toBeGreaterThanOrEqual(5);
        expect(before - boss.hp).toBeLessThanOrEqual(7);
        expect(resonance(sim)).toBe(1);
        // A second press in the same window does nothing at all
        run(sim, 3);
        const after = boss.hp;
        toll(sim);
        expect(boss.hp).toBe(after);
        expect(resonance(sim)).toBe(1);
        // The next beat, early by 5 ticks: still on it
        run(sim, tpb(sim) - 3 - 5);
        toll(sim);
        expect(resonance(sim)).toBe(2);
        expect(after - boss.hp).toBeGreaterThanOrEqual(Math.floor(8 * 0.85));
    });

    test("off the beat: a clunk, and Resonance halves", () => {
        const { sim } = ready();
        sim.heroes[0].song!.resonance = 7;
        run(sim, 12);
        toll(sim);
        expect(resonance(sim)).toBe(3);
        const events = sim.takeEvents().filter((e) => e.type === "songToll");
        expect(events.at(-1)).toMatchObject({ onBeat: false, damage: 0 });
    });

    test("on the beat out of her reach rings, and does nothing else", () => {
        const { sim, boss } = ready();
        place(sim, { x: middle.x, y: middle.y - 4.6 });
        const before = boss.hp;
        toll(sim);
        expect(boss.hp).toBe(before);
        expect(resonance(sim)).toBe(0);
    });

    test("is judged at the tick it was pressed (a co-op guest's), no further back than 15", () => {
        const { sim } = ready();
        const beatTick = sim.tick;
        // Arriving 12 ticks late (past the window), pressed on the beat
        run(sim, 12);
        toll(sim, beatTick);
        expect(resonance(sim)).toBe(1);
        // A claim from 30 ticks back is taken as 15 back: here, 9 after the beat, off it
        sim.heroes[0].song!.resonance = 4;
        toBeat(sim, song(sim).beat + 1);
        run(sim, 24);
        toll(sim, sim.tick - 30);
        expect(resonance(sim)).toBe(2);
        // The action's at survives cleaning, and a bad one is dropped
        expect(cleanAction({ kind: "ability", at: 120 })).toEqual({ kind: "ability", at: 120 });
        expect(cleanAction({ kind: "ability", at: -4 })).toEqual({ kind: "ability" });
        expect(cleanAction({ kind: "ability", at: "x" })).toEqual({ kind: "ability" });
    });

    test("a hit costs 2 Resonance", () => {
        const { sim } = ready();
        // (the entrance's safety runs out a tick after it)
        run(sim, 2);
        sim.heroes[0].song!.resonance = 5;
        sim["songHit"](sim.shownBoss!, "The Clap", 7);
        expect(resonance(sim)).toBe(3);
    });
});

describe("her attacks", () => {
    test("the Clap lands on beat 4, round her, to the edge drawn", () => {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, middle);
        place(sim, { x: middle.x, y: middle.y - 3.5 - RADIUS + 0.05 });
        const start = sim.tick;
        startPhrase(sim, boss, "The Clap");
        const note = song(sim).notes[0];
        expect(note.landTick - start).toBe(3 * 25);
        expect(note.shape).toMatchObject({ kind: "circle", r: 3.5 });
        const before = hp(sim);
        run(sim, 3 * 25 + 1);
        expect(hp(sim)).toBe(before - 7);
        // Just past its edge: missed
        const sim2 = createSim();
        const boss2 = startFight(sim2);
        placeBoss(boss2, middle);
        place(sim2, { x: middle.x, y: middle.y - 3.5 - RADIUS - 0.05 });
        startPhrase(sim2, boss2, "The Clap");
        run(sim2, 3 * 25 + 1);
        expect(hp(sim2)).toBe(30);
    });

    test("stepping out on its last count is a Grace; out early isn't", () => {
        const lastCount = (leaveAt: number) => {
            const sim = createSim();
            const boss = startFight(sim);
            placeBoss(boss, middle);
            place(sim, { x: middle.x, y: middle.y - 3 });
            startPhrase(sim, boss, "The Clap");
            run(sim, leaveAt);
            // Straight south and out, at 4 tiles a second
            run(sim, 3 * 25 + 1 - leaveAt, 0, -1);
            return sim;
        };
        const inTime = lastCount(2 * 25 + 2);
        expect(hp(inTime)).toBe(30);
        expect(inTime.heroes[0].song!.graces).toBe(1);
        expect(resonance(inTime)).toBe(2);
        expect(inTime.tollReach()).toBe(6.5);
        const early = lastCount(5);
        expect(hp(early)).toBe(30);
        expect(early.heroes[0].song!.graces).toBe(0);
        expect(early.tollReach()).toBe(4.5);
    });

    test("the double clap's ring is dodged by stepping back in on the and", () => {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, middle);
        sim.song!.ticksPerBeat = 20;
        startPhrase(sim, boss, "Double clap");
        const [clap, ring] = song(sim).notes;
        expect(ring.landTick - clap.landTick).toBe(10);
        expect(ring.shape).toMatchObject({ kind: "ring", r0: 3.5, r1: 5.5 });
        expect(inShape(ring.shape, middle.x, middle.y - 3.1, RADIUS)).toBe(false);
        expect(inShape(ring.shape, middle.x, middle.y - 5.86, RADIUS)).toBe(false);
        expect(inShape(ring.shape, middle.x, middle.y - 4, RADIUS)).toBe(true);
    });

    test("Echo lays a mark where you stand each beat, and each lands a bar later", () => {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, { x: middle.x + 8, y: middle.y });
        place(sim, middle);
        startPhrase(sim, boss, "Echo");
        // Stand still for a beat (the first mark), then walk east
        run(sim, 1);
        expect(song(sim).notes).toHaveLength(1);
        const mark = song(sim).notes[0];
        expect(mark.landTick - mark.shownTick).toBe(4 * 25);
        expect(mark.shape).toMatchObject({ kind: "circle", x: middle.x, y: middle.y, r: 1 });
        run(sim, 3 * 25 - 1, 1, 0);
        expect(song(sim).notes).toHaveLength(4);
        // Walking on, nothing lands on them
        run(sim, 4 * 25 + 2, -1, 0);
        expect(hp(sim)).toBe(30);
        // Syncopated, each lands on the half beat after
        const sim2 = createSim();
        const boss2 = startFight(sim2);
        place(sim2, middle);
        startPhrase(sim2, boss2, "Echo (syncopated)");
        run(sim2, 1);
        const late = song(sim2).notes[0];
        expect(late.landTick - late.shownTick).toBe(4 * 25 + 13);
    });

    test("Change ringing: each bell struck a bar after it's lifted, round it, then rung back", () => {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, middle);
        const bells = SUNKEN_CATHEDRAL_FEATURES.bells!;
        const start = sim.tick;
        const startBeat = song(sim).beat;
        startPhrase(sim, boss, "Change ringing");
        const notes = song(sim).notes;
        expect(notes.map((n) => n.bell)).toEqual([0, 1, 2, 3]);
        expect(notes.map((n) => n.landTick - start)).toEqual([100, 125, 150, 175]);
        // In the NE bell's burst as it strikes: hit
        const ne = statueMiddle(bells[0]);
        place(sim, { x: ne.x, y: ne.y - 2.5 });
        run(sim, 100 + 1);
        expect(hp(sim)).toBe(30 - 6);
        // It hums the two beats after: Toll on one of them beside it, and it's rung back
        sim.heroes[0].song!.resonance = 4;
        expect(song(sim).bells[0].humFrom).toBe(startBeat + 5);
        toBeat(sim, startBeat + 5);
        const before = boss.hp;
        toll(sim);
        const dealt = before - boss.hp;
        expect(dealt).toBeGreaterThanOrEqual(Math.floor((40 + 15 * 4) * 0.85));
        expect(dealt).toBeLessThanOrEqual(Math.ceil((40 + 15 * 4) * 1.15));
        expect(resonance(sim)).toBe(0);
        expect(song(sim).bells[0].rung).toBe(true);
        // Out of tune for a bar: double from everything, once a round
        expect(sim.isExposed(boss)).toBe(true);
        expect(boss.bossState!.exposedEnd! - sim.tick).toBe(4 * 25);
    });

    test("in pairs, two bells strike on each of the first two beats", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const start = sim.tick;
        startPhrase(sim, boss, "Change ringing in pairs");
        const lands = song(sim).notes.map((n) => n.landTick - start);
        expect(lands.sort((a, b) => a - b)).toEqual([100, 100, 125, 125]);
    });

    test("the Psalm surges down the nave a band a beat, and is stepped back through", () => {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, { x: middle.x + 10, y: middle.y + 10 });
        const bands = SUNKEN_CATHEDRAL_FEATURES.bands!;
        const start = sim.tick;
        startPhrase(sim, boss, "The Psalm");
        const notes = song(sim).notes;
        expect(notes).toHaveLength(9);
        expect(notes.map((n) => (n.landTick - start) / 25)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
        // Waiting at the north edge of band 4 (in the aisle), and crossing into band 3 just after
        // it's surged: missed by both, and in time
        const band = bands[4];
        place(sim, { x: middle.x, y: band.y1 + 1 - RADIUS - 0.05 });
        run(sim, notes[3].landTick + 3 - sim.tick);
        run(sim, 11, 0, 1);
        run(sim, notes[4].landTick + 3 - sim.tick + 1);
        expect(hp(sim)).toBe(30);
        expect(sim.heroes[0].song!.graces).toBe(1);
        // From both ends, two bands a beat, passing in the middle
        const sim2 = createSim();
        const boss2 = startFight(sim2);
        startPhrase(sim2, boss2, "The Psalm from both ends");
        expect(song(sim2).notes).toHaveLength(17);
    });

    test("Silence: whoever moves in the rest is struck; standing still isn't", () => {
        const rest = (moveAt: number) => {
            const sim = createSim();
            const boss = startFight(sim);
            placeBoss(boss, { x: middle.x + 10, y: middle.y });
            place(sim, middle);
            startPhrase(sim, boss, "Silence");
            run(sim, moveAt);
            run(sim, 4 * 25 - moveAt + 2, 1, 0);
            return hp(sim);
        };
        // Moving through to beat 4 and 4 ticks after it is fine; after that it isn't
        expect(rest(4 * 25)).toBe(30);
        expect(rest(3 * 25 + 4 + 1)).toBe(30 - 8);
        // Still through it all
        const sim = createSim();
        const boss = startFight(sim);
        place(sim, middle);
        startPhrase(sim, boss, "Silence");
        run(sim, 5 * 25);
        expect(hp(sim)).toBe(30);
    });

    test("Harmony: the line between two of the choir, never straight across, as wide as drawn", () => {
        const sim = createSim();
        const boss = startFight(sim);
        placeBoss(boss, { x: middle.x, y: middle.y + 10 });
        startPhrase(sim, boss, "Harmony");
        const note = song(sim).notes[0];
        expect(note.shape.kind).toBe("strip");
        if (note.shape.kind !== "strip") {
            return;
        }
        expect(note.shape.ay).not.toBe(note.shape.by);
        expect(note.landTick - sim.tick).toBe(100);
        const mx = (note.shape.ax + note.shape.bx) / 2;
        const my = (note.shape.ay + note.shape.by) / 2;
        place(sim, { x: mx, y: my });
        run(sim, 101);
        expect(hp(sim)).toBe(30 - 7);
    });

    test("the canon: her reflection claps a bar later, mirrored about the nave's axis", () => {
        const sim = createSim();
        const boss = startFight(sim);
        const off = { x: middle.x - 6, y: middle.y };
        placeBoss(boss, off);
        const start = sim.tick;
        startPhrase(sim, boss, "The Clap", true);
        const [mine, reflection] = song(sim).notes;
        expect(reflection.canon).toBe(true);
        expect(reflection.landTick - mine.landTick).toBe(4 * 25);
        expect(reflection.shownTick - start).toBe(4 * 25);
        expect(reflection.shape).toMatchObject({
            x: 2 * SUNKEN_CATHEDRAL_FEATURES.axis! - off.x,
            y: off.y,
        });
    });
});

describe("the fight", () => {
    test("goes by tolling on the beat: a careful player's phase 1 in about half a minute", () => {
        const sim = createSim();
        const boss = startFight(sim);
        // Up by her, tolling every beat, never hit (she's held off hitting by the test)
        const s = song(sim);
        const p1 = Math.round(boss.maxHp * 0.74);
        const start = sim.tick;
        for (let i = 0; i < 400 && boss.hp > p1; i++) {
            placeBoss(boss, middle);
            place(sim, { x: middle.x, y: middle.y - 4 });
            sim.heroes[0].player.hp = 30;
            s.notes = [];
            toll(sim);
            toBeat(sim, s.beat + 1);
        }
        const seconds = (sim.tick - start) / TICKS_PER_SECOND;
        expect(boss.bossState!.phase!.index).toBe(1);
        expect(seconds).toBeGreaterThan(20);
        expect(seconds).toBeLessThan(45);
    });

    test("co-op: each player's own Resonance, and a guest's late press agrees on every copy", () => {
        const play = () => {
            const sim = createSim(3, 2);
            run(sim, 1);
            song(sim).voiceFree = song(sim).arenaFree = 1e9;
            toBeat(sim, 13);
            const boss = sim.enemies.find((e) => e.finalBoss)!;
            placeBoss(boss, middle);
            place(sim, { x: middle.x - 1, y: middle.y - 4 }, 0);
            place(sim, { x: middle.x + 1, y: middle.y - 4 }, 1);
            const beatTick = sim.tick;
            toll(sim, undefined, 0);
            run(sim, 10);
            // The guest's press, pressed on the beat, arriving 10 ticks later
            toll(sim, beatTick, 1);
            return sim;
        };
        const a = play();
        const b = play();
        expect(resonance(a, 0)).toBe(1);
        expect(resonance(a, 1)).toBe(1);
        expect(syncHash(a)).toBe(syncHash(b));
        expect(a.shownBoss!.hp).toBe(b.shownBoss!.hp);
    });

    test("hard mode rests her lanes a beat less, and keeps the tempo", () => {
        const sim = createSim(1, undefined, true);
        run(sim, 1);
        toBeat(sim, 12);
        const s = song(sim);
        expect(s.ticksPerBeat).toBe(25);
        // The first verse's bells every four bars on normal; the rest's 6 beats, 5 on hard
        const bells = s.phrases.find((p) => p.def.kind === "bells");
        if (bells) {
            expect(s.arenaFree - 12).toBe(Math.ceil((10 + 5) / 4) * 4);
        }
    });

    test("a whole fight, standing by her and tolling, ends with her down", () => {
        const sim = createSim();
        const boss = startFight(sim);
        song(sim).voiceFree = song(sim).arenaFree = 0;
        const s = song(sim);
        for (let i = 0; i < 3000 && !sim.runOver; i++) {
            sim.heroes[0].player.hp = 30;
            if (!boss.dead) {
                place(sim, { x: boss.x, y: boss.y - 4 });
            }
            toll(sim);
            const next = s.beat + 1;
            for (let j = 0; j < 100 && s.beat < next && !sim.runOver; j++) {
                sim.step(0, 0);
            }
        }
        expect(boss.dead).toBe(true);
        expect(sim.runOver).toBe(true);
        expect(sim.getResult().victory).toBe(true);
    });
});
