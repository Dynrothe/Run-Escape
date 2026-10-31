import type { Point } from "./paths";
import type { Terrain } from "./terrain";

// How high every road runs, worked out all together once they're all laid. They can't be
// done one by one: a road's height at any point depends on what it meets, and on what
// it passes close by, and those can come later. So every point of every road is a node, with
// links along the roads and between points of roads close to each other, and heights are
// limited along those links. Roads that are near each other are then near in height by
// construction, and pinning the ground to them can't leave a step between them.

export type RoadLine = {
    points: Point[];
    // How many of the first points run straight out of something and can be next to it
    lead: number;
    halfWidth: number;
    // The height of the lead, which is where it comes out of something
    start?: number;
    // The steepest it may climb, height units a tile. Fords have none, and aren't graded.
    grade?: number;
    // How high each point runs, once graded
    heights?: Float32Array;
};

// A flat plot a road has to keep level with as it goes by
export type Plot = { x: number; y: number; sizeX: number; sizeY: number; height: number };

// Points of different roads, or far along one road, this close together are linked: past
// the road's edge, where ground can start to fall away
const NEAR_PAST_EDGE = 2.2;
// Points along a line that don't count as far along it
const SAME_STRETCH = 8;
const SMOOTH_PASSES = 8;
// What's over the grade is first shared out by trying steeper grades, up to this much steeper
const STEEPER_TRIES = [1, 1.3, 1.6, 2];

type Graph = {
    count: number;
    // Each node's links: first[i] to first[i + 1] in to, length
    first: Int32Array;
    to: Int32Array;
    length: Float32Array;
    grade: Float32Array;
};

function linkNodes(lines: RoadLine[], offsets: number[]): Graph {
    const count = offsets[offsets.length - 1];
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const lineOf = new Int32Array(count);
    const reach = new Float32Array(count);
    lines.forEach((line, l) => {
        line.points.forEach((point, i) => {
            const node = offsets[l] + i;
            xs[node] = point.x;
            ys[node] = point.y;
            lineOf[node] = l;
            reach[node] = line.halfWidth + NEAR_PAST_EDGE;
        });
    });
    const froms: number[] = [];
    const tos: number[] = [];
    const lengths: number[] = [];
    const grades: number[] = [];
    const link = (a: number, b: number, length: number, grade: number) => {
        froms.push(a, b);
        tos.push(b, a);
        lengths.push(length, length);
        grades.push(grade, grade);
    };
    lines.forEach((line, l) => {
        for (let i = 1; i < line.points.length; i++) {
            const a = offsets[l] + i - 1;
            const b = offsets[l] + i;
            link(a, b, Math.max(Math.hypot(xs[a] - xs[b], ys[a] - ys[b]), 0.05), line.grade!);
        }
    });
    // Near each other, off the line: a grid of cells to find them
    const cell = 6;
    const cells = new Map<number, number[]>();
    const key = (x: number, y: number) => Math.floor(x / cell) * 4096 + Math.floor(y / cell);
    for (let node = 0; node < count; node++) {
        const at = key(xs[node], ys[node]);
        let list = cells.get(at);
        if (!list) {
            list = [];
            cells.set(at, list);
        }
        list.push(node);
    }
    for (let a = 0; a < count; a++) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const list = cells.get(key(xs[a] + dx * cell, ys[a] + dy * cell));
                for (const b of list ?? []) {
                    if (b <= a || (lineOf[a] === lineOf[b] && b - a < SAME_STRETCH)) {
                        continue;
                    }
                    const distance = Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
                    if (distance < Math.max(reach[a], reach[b])) {
                        const grade = Math.min(lines[lineOf[a]].grade!, lines[lineOf[b]].grade!);
                        link(a, b, Math.max(distance, 0.05), grade);
                    }
                }
            }
        }
    }
    // Into arrays by node
    const first = new Int32Array(count + 1);
    for (const from of froms) {
        first[from + 1]++;
    }
    for (let i = 0; i < count; i++) {
        first[i + 1] += first[i];
    }
    const next = first.slice();
    const to = new Int32Array(froms.length);
    const length = new Float32Array(froms.length);
    const grade = new Float32Array(froms.length);
    froms.forEach((from, i) => {
        const at = next[from]++;
        to[at] = tos[i];
        length[at] = lengths[i];
        grade[at] = grades[i];
    });
    return { count, first, to, length, grade };
}

// Lowers values until none is more than the grade over a linked one. Nodes that were lowered
// pass it on, so this reaches as far as it needs to.
function limitAlongLinks(values: Float32Array, graph: Graph, steeper: number): void {
    const { count, first, to, length, grade } = graph;
    const queued = new Uint8Array(count).fill(1);
    let queue: number[] = [];
    for (let i = 0; i < count; i++) {
        queue.push(i);
    }
    while (queue.length > 0) {
        const next: number[] = [];
        for (const node of queue) {
            queued[node] = 0;
            for (let at = first[node]; at < first[node + 1]; at++) {
                const other = to[at];
                const limit = values[node] + length[at] * grade[at] * steeper;
                if (values[other] > limit + 0.001) {
                    values[other] = limit;
                    if (!queued[other]) {
                        queued[other] = 1;
                        next.push(other);
                    }
                }
            }
        }
        queue = next;
    }
}

// Sets every point of every road's height, and pins the ground to them. plots are kept to
// as a road goes by; a road out of one starts at its height anyway. Nothing goes steeper
// than steepest, even to meet what's pinned.
export function gradeRoads(
    terrain: Terrain,
    lines: RoadLine[],
    plots: Plot[],
    shoulder: number,
    steepest: number,
): void {
    const graded = lines.filter((line) => line.grade !== undefined && line.points.length > 1);
    const offsets = [0];
    for (const line of graded) {
        offsets.push(offsets[offsets.length - 1] + line.points.length);
    }
    const count = offsets[offsets.length - 1];
    if (count === 0) {
        return;
    }
    const graph = linkNodes(graded, offsets);
    const ground = new Float32Array(count);
    const pins = new Float32Array(count).fill(NaN);
    graded.forEach((line, l) => {
        line.points.forEach((point, i) => {
            const node = offsets[l] + i;
            ground[node] = terrain.getHeight(point.x, point.y);
            if (line.start !== undefined && i < line.lead) {
                pins[node] = line.start;
            }
        });
    });
    // Beside a plot, a road's as near its height as the ground can come up in that distance
    const nearPlot = new Float32Array(count).fill(Infinity);
    graded.forEach((line, l) => {
        line.points.forEach((point, i) => {
            if (i < line.lead) {
                return;
            }
            const node = offsets[l] + i;
            for (const plot of plots) {
                const dx = Math.max(plot.x - point.x, point.x - plot.x - plot.sizeX, 0);
                const dy = Math.max(plot.y - point.y, point.y - plot.y - plot.sizeY, 0);
                const distance = Math.hypot(dx, dy);
                if (distance < line.halfWidth + NEAR_PAST_EDGE + 1 && distance < nearPlot[node]) {
                    nearPlot[node] = distance;
                    pins[node] = plot.height;
                }
            }
        });
    });

    // The highest and lowest each point can be, from everything that's pinned. If pins are
    // too far apart for the grade, the grade has to give there.
    let high = new Float32Array(count);
    let low = new Float32Array(count);
    let steeper = 1;
    const roomToSteepen = steepest / Math.max(...graded.map((line) => line.grade!));
    for (const tryGrade of STEEPER_TRIES) {
        steeper = Math.max(Math.min(tryGrade, roomToSteepen), 1);
        high = Float32Array.from(pins, (pin) => (Number.isNaN(pin) ? Infinity : pin));
        low = Float32Array.from(pins, (pin) => (Number.isNaN(pin) ? Infinity : -pin));
        limitAlongLinks(high, graph, steeper);
        limitAlongLinks(low, graph, steeper);
        if (high.every((value, i) => low[i] === Infinity || value >= -low[i] - 0.01)) {
            break;
        }
    }
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const lowest = low[i] === Infinity ? -Infinity : -low[i];
        heights[i] =
            lowest > high[i]
                ? (lowest + high[i]) / 2
                : Math.min(Math.max(ground[i], lowest), high[i]);
    }
    // Steady it: lines of ground that climb too fast are taken down, and then back up, and
    // smoothed, which only ever makes a line gentler
    const fit = () => {
        for (let i = 0; i < count; i++) {
            if (!Number.isNaN(pins[i])) {
                heights[i] = pins[i];
            }
        }
        limitAlongLinks(heights, graph, steeper);
        const flipped = heights.map((height) => -height);
        limitAlongLinks(flipped, graph, steeper);
        for (let i = 0; i < count; i++) {
            heights[i] = -flipped[i];
        }
    };
    fit();
    const { first, to } = graph;
    for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
        const from = Float32Array.from(heights);
        for (let i = 0; i < count; i++) {
            if (!Number.isNaN(pins[i])) {
                continue;
            }
            let sum = from[i];
            for (let at = first[i]; at < first[i + 1]; at++) {
                sum += from[to[at]];
            }
            heights[i] = sum / (first[i + 1] - first[i] + 1);
        }
    }
    fit();

    graded.forEach((line, l) => {
        line.heights = heights.slice(offsets[l], offsets[l + 1]);
        terrain.pinLine(line.points, line.heights, line.halfWidth + shoulder);
    });
}
