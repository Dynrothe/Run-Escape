import { ArenaFeatures, ArenaStatue, BossAttackDef } from "../content/types";

// The shapes a boss's attacks read off its arena (MapDef.features): pillars that
// block bolts and sight, a checker of cells, rows of fire on a rhythm. Plain
// arithmetic, no trigonometry, so the sim and the screen agree to the bit.

type Pillar = { x: number; y: number; size: number };

// How far along (x, y) + (dx, dy) * t, for t from 0 to maxT, it first enters a
// pillar, or Infinity for none. Its start inside one counts as 0.
export function pillarHit(
    pillars: readonly Pillar[] | undefined,
    x: number,
    y: number,
    dx: number,
    dy: number,
    maxT: number,
): number {
    let first = Infinity;
    if (!pillars) {
        return first;
    }
    for (const pillar of pillars) {
        const span = boxSpan(pillar, x, y, dx, dy, maxT);
        if (span && span.from < first) {
            first = span.from;
        }
    }
    return first;
}

// Whether a pillar stands between (fromX, fromY) and (x, y): one the line
// between them goes through, not one it only touches the corner of
export function behindPillar(
    pillars: readonly Pillar[] | undefined,
    fromX: number,
    fromY: number,
    x: number,
    y: number,
): boolean {
    if (!pillars) {
        return false;
    }
    for (const pillar of pillars) {
        const span = boxSpan(pillar, fromX, fromY, x - fromX, y - fromY, 1);
        if (span && span.to - span.from > 1e-6) {
            return true;
        }
    }
    return false;
}

// The part of the line in the pillar's square (the slab test), or undefined
function boxSpan(
    pillar: Pillar,
    x: number,
    y: number,
    dx: number,
    dy: number,
    maxT: number,
): { from: number; to: number } | undefined {
    let from = 0;
    let to = maxT;
    const axes: [number, number, number][] = [
        [x, dx, pillar.x],
        [y, dy, pillar.y],
    ];
    for (const [p, d, lo] of axes) {
        const hi = lo + pillar.size;
        if (Math.abs(d) < 1e-12) {
            // Along an edge isn't through it
            if (p <= lo || p >= hi) {
                return undefined;
            }
            continue;
        }
        let t1 = (lo - p) / d;
        let t2 = (hi - p) / d;
        if (t1 > t2) {
            const swap = t1;
            t1 = t2;
            t2 = swap;
        }
        from = Math.max(from, t1);
        to = Math.min(to, t2);
        if (from > to) {
            return undefined;
        }
    }
    return { from, to };
}

// Whether a circle overlaps a square (or oblong) halfX by halfY either way of cx, cy
export function circleInBox(
    px: number,
    py: number,
    radius: number,
    cx: number,
    cy: number,
    halfX: number,
    halfY: number,
): boolean {
    const dx = Math.max(0, Math.abs(px - cx) - halfX);
    const dy = Math.max(0, Math.abs(py - cy) - halfY);
    return dx * dx + dy * dy <= radius * radius;
}

// Whether a circle touches a strip from (x, y) length tiles along (dirX, dirY), a
// unit vector, width tiles across: the strip's ends are square, so behind and
// beside its start are clear
export function inStrip(
    px: number,
    py: number,
    radius: number,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    length: number,
    width: number,
): boolean {
    const dx = px - x;
    const dy = py - y;
    const along = dx * dirX + dy * dirY;
    const across = Math.abs(dy * dirX - dx * dirY);
    return along >= -radius && along <= length + radius && across <= width / 2 + radius;
}

export type CheckerCell = { cx: number; cy: number; x: number; y: number; colour: number };

// Every cell of a checker, its middle and colour
export function checkerCells(checker: NonNullable<ArenaFeatures["checker"]>): CheckerCell[] {
    const cells: CheckerCell[] = [];
    for (let cy = 0; cy < checker.rows; cy++) {
        for (let cx = 0; cx < checker.cols; cx++) {
            cells.push({
                cx,
                cy,
                x: checker.x0 + (cx + 0.5) * checker.cell,
                y: checker.y0 + (cy + 0.5) * checker.cell,
                colour: (cx + cy) % 2,
            });
        }
    }
    return cells;
}

// The cell a spot's in (which can be off the checker, for the nearest cells round it)
export function checkerCellAt(
    checker: NonNullable<ArenaFeatures["checker"]>,
    x: number,
    y: number,
): { cx: number; cy: number } {
    return {
        cx: Math.floor((x - checker.x0) / checker.cell),
        cy: Math.floor((y - checker.y0) / checker.cell),
    };
}

// The middle of a statue, in tiles
export function statueMiddle(statue: ArenaStatue): { x: number; y: number } {
    const size = statue.size ?? 1;
    return { x: statue.x + size / 2, y: statue.y + size / 2 };
}

export type CycleStage = "idle" | "warn" | "burn" | "out";

// Where a row's rhythm is (BossAttackDef.cycle), and how many ticks it's been
// at it: rows go in turn, each stagger behind the last
export function cycleStage(
    cycle: NonNullable<BossAttackDef["cycle"]>,
    startTick: number,
    row: number,
    tick: number,
    ticksPerSecond: number,
): { stage: CycleStage; since: number } {
    const ticks = (seconds: number) => Math.round(seconds * ticksPerSecond);
    const local = tick - startTick - ticks(cycle.stagger * row);
    if (local < 0) {
        return { stage: "idle", since: 0 };
    }
    const period = Math.max(1, ticks(cycle.period));
    const at = local % period;
    const warn = ticks(cycle.warn);
    const burn = ticks(cycle.burn);
    const out = ticks(cycle.out);
    if (at < warn) {
        return { stage: "warn", since: at };
    }
    if (at < warn + burn) {
        return { stage: "burn", since: at - warn };
    }
    if (at < warn + burn + out) {
        return { stage: "out", since: at - warn - burn };
    }
    return { stage: "idle", since: at - warn - burn - out };
}

// A recipe's features (map-local tiles) moved into the world, by baseX and baseY
export function moveFeatures(features: ArenaFeatures, dx: number, dy: number): ArenaFeatures {
    const statue = (s: ArenaStatue): ArenaStatue => ({ ...s, x: s.x + dx, y: s.y + dy });
    const moved: ArenaFeatures = {};
    if (features.checker) {
        moved.checker = {
            ...features.checker,
            x0: features.checker.x0 + dx,
            y0: features.checker.y0 + dy,
        };
    }
    if (features.pillars) {
        moved.pillars = features.pillars.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    }
    if (features.bolts) {
        moved.bolts = features.bolts.map((row) => ({
            ...row,
            y: row.y + dy,
            fromX: row.fromX + dx,
            toX: row.toX + dx,
            statues: row.statues.map(statue),
        }));
    }
    if (features.knights) {
        moved.knights = features.knights.map(statue);
    }
    if (features.fires) {
        moved.fires = features.fires.map((row) => ({
            ...row,
            y: row.y + dy,
            x0: row.x0 + dx,
            x1: row.x1 + dx,
        }));
    }
    if (features.rise) {
        moved.rise = { x: features.rise.x + dx, y: features.rise.y + dy };
    }
    if (features.dais) {
        moved.dais = { ...features.dais, x: features.dais.x + dx, y: features.dais.y + dy };
    }
    if (features.bells) {
        moved.bells = features.bells.map(statue);
    }
    if (features.tenor) {
        moved.tenor = statue(features.tenor);
    }
    if (features.choir) {
        moved.choir = features.choir.map((soul) => ({ ...soul, x: soul.x + dx, y: soul.y + dy }));
    }
    if (features.nave) {
        const { x0, y0, x1, y1 } = features.nave;
        moved.nave = { x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy };
    }
    if (features.bands) {
        moved.bands = features.bands.map((band) => ({ y0: band.y0 + dy, y1: band.y1 + dy }));
    }
    if (features.axis !== undefined) {
        moved.axis = features.axis + dx;
    }
    if (features.statues) {
        moved.statues = Object.fromEntries(
            Object.entries(features.statues).map(([group, list]) => [group, list.map(statue)]),
        );
    }
    return moved;
}

// The first of the pillars a circle overlaps, or undefined
export function boxCircle(
    pillars: readonly Pillar[] | undefined,
    x: number,
    y: number,
    radius: number,
): Pillar | undefined {
    for (const pillar of pillars ?? []) {
        const half = pillar.size / 2;
        if (circleInBox(x, y, radius, pillar.x + half, pillar.y + half, half, half)) {
            return pillar;
        }
    }
    return undefined;
}

// How far along (x, y) + (dirX, dirY) * t, a unit direction, it is to where the line leaves the
// box (an arena's bounds) for good, or 0 if it never crosses it
export function boxExit(
    box: { minX: number; minY: number; maxX: number; maxY: number },
    x: number,
    y: number,
    dirX: number,
    dirY: number,
): number {
    let from = -Infinity;
    let to = Infinity;
    const axes: [number, number, number, number][] = [
        [x, dirX, box.minX, box.maxX],
        [y, dirY, box.minY, box.maxY],
    ];
    for (const [p, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-12) {
            if (p < lo || p > hi) {
                return 0;
            }
            continue;
        }
        const t1 = (lo - p) / d;
        const t2 = (hi - p) / d;
        from = Math.max(from, Math.min(t1, t2));
        to = Math.min(to, Math.max(t1, t2));
    }
    return to > Math.max(from, 0) ? to : 0;
}

// A gaze's shadows (BossAttackDef.cover), as drawn and as hit. Each pillar's is the outline of
// what it hides from (fromX, fromY): the pillar, and behind it between the two lines from the
// gaze past its outermost corners, out to far tiles (shadowOutline). It's drawn soft, fading out
// over SHADOW_SOFT tiles past that edge, and a player is spared when any part of them is within
// SHADOW_SOFT of a shadow: the faint outer edge of what's drawn counts as shadow, never the
// reverse (inShadow).
export const SHADOW_SOFT = 0.35;

// Unit directions round a circle, for inShadow's look round a player (fixed: no trigonometry)
const ROUND = [
    [1, 0],
    [0.92388, 0.38268],
    [0.70711, 0.70711],
    [0.38268, 0.92388],
    [0, 1],
    [-0.38268, 0.92388],
    [-0.70711, 0.70711],
    [-0.92388, 0.38268],
    [-1, 0],
    [-0.92388, -0.38268],
    [-0.70711, -0.70711],
    [-0.38268, -0.92388],
    [0, -1],
    [0.38268, -0.92388],
    [0.70711, -0.70711],
    [0.92388, -0.38268],
];

export function shadowOutline(
    pillar: Pillar,
    fromX: number,
    fromY: number,
    far: number,
): { x: number; y: number }[] {
    const { x, y, size } = pillar;
    const corners = [
        { x, y },
        { x: x + size, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
    ];
    // The corners outermost either way, as seen from the gaze: every other one's to one side
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        (a.x - fromX) * (b.y - fromY) - (a.y - fromY) * (b.x - fromX);
    const outer = (sign: number) =>
        corners.find((a) => corners.every((b) => cross(a, b) * sign >= 0))!;
    const points = [...corners];
    for (const corner of [outer(1), outer(-1)]) {
        const dx = corner.x - fromX;
        const dy = corner.y - fromY;
        const length = Math.max(1e-9, Math.sqrt(dx * dx + dy * dy));
        points.push({ x: corner.x + (dx / length) * far, y: corner.y + (dy / length) * far });
    }
    return convexHull(points);
}

// The points' outline, anticlockwise (Andrew's monotone chain)
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const turn = (
        o: { x: number; y: number },
        a: { x: number; y: number },
        b: { x: number; y: number },
    ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: { x: number; y: number }[] = [];
    for (const p of sorted) {
        while (
            lower.length >= 2 &&
            turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
        ) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper: { x: number; y: number }[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (
            upper.length >= 2 &&
            turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
        ) {
            upper.pop();
        }
        upper.push(p);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Whether a player of radius at (x, y) is out of the gaze's sight: their middle hidden behind a
// pillar, or a point of them, or of the soft edge round them, out to radius + SHADOW_SOFT, hidden
// (looked for at their middle and on two rings round it, every sixteenth of a turn: a shadow's
// straight edge can't fall between those by more than a fiftieth of a tile)
export function inShadow(
    pillars: readonly Pillar[] | undefined,
    fromX: number,
    fromY: number,
    x: number,
    y: number,
    radius: number,
): boolean {
    if (behindPillar(pillars, fromX, fromY, x, y)) {
        return true;
    }
    const reach = radius + SHADOW_SOFT;
    for (const ring of [reach, reach / 2]) {
        for (const [dx, dy] of ROUND) {
            const px = x + dx * ring;
            const py = y + dy * ring;
            if (!boxCircle(pillars, px, py, 0) && behindPillar(pillars, fromX, fromY, px, py)) {
                return true;
            }
        }
    }
    return false;
}
