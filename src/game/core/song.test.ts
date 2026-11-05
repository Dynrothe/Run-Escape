import { describe, expect, it } from "vitest";

import {
    SongShape,
    beatAt,
    halfBeat,
    harmonyChoices,
    inShape,
    mirrorShape,
    phraseBeats,
    shapeSpots,
} from "./song";

// The song's arithmetic: what's drawn is what's hit, to the edge of each shape, and a press's
// beat (docs/design/the-bell-choir.md)
describe("song shapes", () => {
    const radius = 0.35;

    it("hits a circle to its edge plus the player's radius", () => {
        const clap: SongShape = { kind: "circle", x: 10, y: 10, r: 3.5 };
        expect(inShape(clap, 10 + 3.5 + radius - 0.01, 10, radius)).toBe(true);
        expect(inShape(clap, 10 + 3.5 + radius + 0.01, 10, radius)).toBe(false);
        expect(inShape(clap, 10, 10 - 3.84, radius)).toBe(true);
    });

    it("hits a ring only where some of the player's in it", () => {
        const ring: SongShape = { kind: "ring", x: 0, y: 0, r0: 3.5, r1: 5.5 };
        // Stepped back in: clear of its inner edge
        expect(inShape(ring, 3.5 - radius - 0.01, 0, radius)).toBe(false);
        expect(inShape(ring, 3.5 - radius + 0.01, 0, radius)).toBe(true);
        expect(inShape(ring, 0, 5.5 + radius - 0.01, radius)).toBe(true);
        // Beyond 5.85: clear of both claps
        expect(inShape(ring, 0, 5.5 + radius + 0.01, radius)).toBe(false);
    });

    it("hits a band to its edges, and a strip to its width", () => {
        const band: SongShape = { kind: "box", x0: 0, y0: 10, x1: 27, y1: 13 };
        expect(inShape(band, 5, 13 + radius - 0.01, radius)).toBe(true);
        expect(inShape(band, 5, 13 + radius + 0.01, radius)).toBe(false);
        expect(inShape(band, 5, 10 - radius - 0.01, radius)).toBe(false);
        const strip: SongShape = { kind: "strip", ax: 0, ay: 0, bx: 10, by: 0, width: 1.5 };
        expect(inShape(strip, 5, 0.75 + radius - 0.01, radius)).toBe(true);
        expect(inShape(strip, 5, 0.75 + radius + 0.01, radius)).toBe(false);
        expect(inShape(strip, -radius - 0.01, 0, radius)).toBe(false);
    });

    it("mirrors about the axis", () => {
        expect(mirrorShape({ kind: "circle", x: 3, y: 4, r: 1 }, 10)).toEqual({
            kind: "circle",
            x: 17,
            y: 4,
            r: 1,
        });
        expect(mirrorShape({ kind: "box", x0: 2, y0: 0, x1: 5, y1: 3 }, 10)).toEqual({
            kind: "box",
            x0: 15,
            y0: 0,
            x1: 18,
            y1: 3,
        });
        const line = mirrorShape({ kind: "strip", ax: 1, ay: 2, bx: 19, by: 8, width: 1 }, 10);
        expect(line).toMatchObject({ ax: 19, ay: 2, bx: 1, by: 8 });
    });

    it("throws up spots along a band", () => {
        const spots = shapeSpots({ kind: "box", x0: 0, y0: 0, x1: 27, y1: 3 }, 3);
        expect(spots).toHaveLength(9);
        expect(spots[0]).toEqual({ x: 1.5, y: 1.5 });
    });
});

describe("the beat", () => {
    const beats = [
        { index: 4, tick: 100 },
        { index: 5, tick: 125 },
        { index: 6, tick: 150 },
    ];

    it("counts a press from 5 ticks before a beat to 7 after", () => {
        expect(beatAt(beats, 120, 5, 7)).toBe(5);
        expect(beatAt(beats, 119, 5, 7)).toBeUndefined();
        expect(beatAt(beats, 132, 5, 7)).toBe(5);
        expect(beatAt(beats, 133, 5, 7)).toBeUndefined();
        expect(beatAt(beats, 150, 5, 7)).toBe(6);
    });

    it("leaves a gap between windows at the fastest tempo", () => {
        // 20 ticks a beat: 13 of them count, 7 between are off it
        const fast = [
            { index: 1, tick: 0 },
            { index: 2, tick: 20 },
        ];
        expect(beatAt(fast, 7, 5, 7)).toBe(1);
        expect(beatAt(fast, 8, 5, 7)).toBeUndefined();
        expect(beatAt(fast, 14, 5, 7)).toBeUndefined();
        expect(beatAt(fast, 15, 5, 7)).toBe(2);
    });

    it("halves a beat in whole ticks", () => {
        expect([25, 22, 20].map(halfBeat)).toEqual([13, 11, 10]);
    });

    it("keeps a lane as long as its phrase", () => {
        const def = { name: "x", phases: [1], weight: 1, damage: 1 };
        expect(phraseBeats({ ...def, kind: "clap" }, 9, false)).toBe(4);
        expect(phraseBeats({ ...def, kind: "clap" }, 9, true)).toBe(8);
        expect(phraseBeats({ ...def, kind: "bells" }, 9, true)).toBe(10);
        expect(phraseBeats({ ...def, kind: "psalm" }, 9, false)).toBe(13);
    });
});

describe("harmony", () => {
    const choir = [
        { x: 0, y: 11, side: -1 as const },
        { x: 0, y: 14, side: -1 as const },
        { x: 0, y: 17, side: -1 as const },
        { x: 27, y: 11, side: 1 as const },
        { x: 27, y: 14, side: 1 as const },
        { x: 27, y: 17, side: 1 as const },
    ];

    it("never sings straight across", () => {
        const lines = harmonyChoices(choir, 1);
        expect(lines).toHaveLength(6);
        for (const [[a, b]] of lines) {
            expect(choir[a].side).toBe(-1);
            expect(choir[b].side).toBe(1);
            expect(choir[a].y).not.toBe(choir[b].y);
        }
    });

    it("sings chords whose lines never cross", () => {
        const chords = harmonyChoices(choir, 2);
        expect(chords.length).toBeGreaterThan(0);
        for (const [[a, b], [c, d]] of chords) {
            expect(new Set([a, b, c, d]).size).toBe(4);
            expect(Math.sign(choir[a].y - choir[c].y)).toBe(Math.sign(choir[b].y - choir[d].y));
        }
    });
});
