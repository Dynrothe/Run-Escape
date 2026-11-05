import { ArenaFeatures, SongPhraseDef } from "../content/types";
import { circleInBox, inStrip } from "./arena";

// A fight that's a song (BossDef.song, the Bell Choir's): its beat clock, the shapes its phrases
// land as, and the arithmetic the sim and the screen share. Plain arithmetic, no trigonometry, so
// every copy of a co-op run agrees to the bit, and what's drawn is what's hit.

// What a part of a phrase hurts, in world tiles: a circle, a ring (from r0 out to r1), a box (a
// band of the arena, x0 to x1 by y0 to y1, its far edges included), or a strip between two points
export type SongShape =
    | { kind: "circle"; x: number; y: number; r: number }
    | { kind: "ring"; x: number; y: number; r0: number; r1: number }
    | { kind: "box"; x0: number; y0: number; x1: number; y1: number }
    | { kind: "strip"; ax: number; ay: number; bx: number; by: number; width: number };

// Whether a player of radius at (x, y) is touched by a shape: any part of them in it, as drawn
export function inShape(shape: SongShape, x: number, y: number, radius: number): boolean {
    switch (shape.kind) {
        case "circle": {
            const dx = x - shape.x;
            const dy = y - shape.y;
            const reach = shape.r + radius;
            return dx * dx + dy * dy <= reach * reach;
        }
        case "ring": {
            const dx = x - shape.x;
            const dy = y - shape.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance + radius > shape.r0 && distance - radius < shape.r1;
        }
        case "box": {
            const halfX = (shape.x1 - shape.x0) / 2;
            const halfY = (shape.y1 - shape.y0) / 2;
            return circleInBox(x, y, radius, shape.x0 + halfX, shape.y0 + halfY, halfX, halfY);
        }
        case "strip": {
            const dx = shape.bx - shape.ax;
            const dy = shape.by - shape.ay;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length <= 0) {
                return false;
            }
            return inStrip(
                x,
                y,
                radius,
                shape.ax,
                shape.ay,
                dx / length,
                dy / length,
                length,
                shape.width,
            );
        }
    }
}

// The shape mirrored about the north-south line x = axis (the Canon's reflection)
export function mirrorShape(shape: SongShape, axis: number): SongShape {
    switch (shape.kind) {
        case "circle":
        case "ring":
            return { ...shape, x: 2 * axis - shape.x };
        case "box":
            return { ...shape, x0: 2 * axis - shape.x1, x1: 2 * axis - shape.x0 };
        case "strip":
            return { ...shape, ax: 2 * axis - shape.ax, bx: 2 * axis - shape.bx };
    }
}

// Where a shape's middle is, for its sound and what it throws up
export function shapeMiddle(shape: SongShape): { x: number; y: number } {
    switch (shape.kind) {
        case "circle":
        case "ring":
            return { x: shape.x, y: shape.y };
        case "box":
            return { x: (shape.x0 + shape.x1) / 2, y: (shape.y0 + shape.y1) / 2 };
        case "strip":
            return { x: (shape.ax + shape.bx) / 2, y: (shape.ay + shape.by) / 2 };
    }
}

// Points along a band or a line every gap tiles (half a gap in from each end), for what's thrown up
// along it
export function shapeSpots(shape: SongShape, gap: number): { x: number; y: number }[] {
    const along = (ax: number, ay: number, bx: number, by: number) => {
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.sqrt(dx * dx + dy * dy);
        const count = Math.max(1, Math.round(length / gap));
        const spots: { x: number; y: number }[] = [];
        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            spots.push({ x: ax + dx * t, y: ay + dy * t });
        }
        return spots;
    };
    switch (shape.kind) {
        case "box": {
            const y = (shape.y0 + shape.y1) / 2;
            return along(shape.x0, y, shape.x1, y);
        }
        case "strip":
            return along(shape.ax, shape.ay, shape.bx, shape.by);
        default:
            return [shapeMiddle(shape)];
    }
}

// The half beat after a beat, in ticks (13, 11 and 10 at 25, 22 and 20 a beat)
export function halfBeat(ticksPerBeat: number): number {
    return Math.round(ticksPerBeat / 2);
}

// The beat a press at tick at is on, from the beats' ticks round it (index and tick, any order),
// or undefined when it's outside every beat's window (early ticks before to late after). Between
// two windows that touch, the nearer beat.
export function beatAt(
    beats: readonly { index: number; tick: number }[],
    at: number,
    early: number,
    late: number,
): number | undefined {
    let best: { index: number; distance: number } | undefined;
    for (const beat of beats) {
        const offset = at - beat.tick;
        if (offset < -early || offset > late) {
            continue;
        }
        const distance = Math.abs(offset);
        if (!best || distance < best.distance) {
            best = { index: beat.index, distance };
        }
    }
    return best?.index;
}

// Which lane a phrase runs in: hers (her voice), or the arena's (bells, water, choir's rest)
export function phraseLane(def: SongPhraseDef): "voice" | "arena" {
    return def.kind === "clap" || def.kind === "echo" || def.kind === "harmony" ? "voice" : "arena";
}

// How many beats a phrase keeps its lane busy, from its first downbeat: the canon's copy a bar
// later adds a bar to the voice's
export function phraseBeats(def: SongPhraseDef, bands: number, canon: boolean): number {
    const echoed = canon && phraseLane(def) === "voice" ? 4 : 0;
    switch (def.kind) {
        case "clap":
            return 4 + echoed;
        case "echo":
            return 8 + echoed;
        case "harmony":
            return 4 + echoed;
        case "bells":
            // Lifted a bar, struck a bar, and humming two beats after the last
            return 10;
        case "psalm":
            // Foaming a bar, then a band a beat (from both ends, they pass in the middle)
            return 4 + bands;
        case "silence":
            return 4;
    }
}

// Harmony's lines: pairs of the choir, one from each side and never straight across, count of
// them that don't cross each other. Every way of picking them, for the sim to pick one of.
export function harmonyChoices(
    choir: NonNullable<ArenaFeatures["choir"]>,
    count: number,
): number[][][] {
    const west = choir.map((soul, i) => ({ ...soul, i })).filter((soul) => soul.side < 0);
    const east = choir.map((soul, i) => ({ ...soul, i })).filter((soul) => soul.side > 0);
    const lines: number[][] = [];
    for (const a of west) {
        for (const b of east) {
            if (a.y !== b.y) {
                lines.push([a.i, b.i]);
            }
        }
    }
    if (count <= 1) {
        return lines.map((line) => [line]);
    }
    // Two lines on four of the choir, in the same order on both sides: they never cross
    const choices: number[][][] = [];
    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const [a, b] = lines[i];
            const [c, d] = lines[j];
            if (a === c || b === d) {
                continue;
            }
            const westOrder = Math.sign(choir[a].y - choir[c].y);
            const eastOrder = Math.sign(choir[b].y - choir[d].y);
            if (westOrder === eastOrder) {
                choices.push([lines[i], lines[j]]);
            }
        }
    }
    return choices;
}
