import { describe, expect, test } from "vitest";

import { TOMBS_OF_AMASCUT_MAP } from "../scaperune/maps/tombsOfAmascut";
import {
    SCABARAS_ADDITION_FROM,
    SCABARAS_ADDITION_WAYS,
    searchScabarasAddition,
    solveScabarasAddition,
    solveScabarasLights,
} from "./scabarasHelper";
import { SCABARAS } from "./tombs";

const room = TOMBS_OF_AMASCUT_MAP.tombs!.paths.find((p) => p.room?.scabaras)!.room!.scabaras!;

describe("the Scabaras puzzle helper", () => {
    test("lights the ring in the fewest steps, each flipping itself and its neighbours", () => {
        const flip = (lights: boolean[], presses: readonly number[]) => {
            const on = [...lights];
            for (const i of presses) {
                for (const j of [i - 1, i, i + 1]) {
                    on[(j + on.length) % on.length] = !on[(j + on.length) % on.length];
                }
            }
            return on;
        };
        expect(solveScabarasLights(Array(8).fill(true))).toEqual([]);
        // One out: three steps put it right (stepping on it alone flips its neighbours too)
        const one = [false, true, true, true, true, true, true, true];
        const presses = solveScabarasLights(one);
        expect(flip(one, presses).every((lit) => lit)).toBe(true);
        // Every ring there could be is solved
        for (let mask = 0; mask < 256; mask++) {
            const lights = Array.from({ length: 8 }, (_, i) => (mask & (1 << i)) !== 0);
            expect(
                flip(lights, solveScabarasLights(lights)).every((lit) => lit),
                `${mask}`,
            ).toBe(true);
        }
    });

    test("finds a way across Addition's board for every number the tablet shows", () => {
        const values = SCABARAS.additionBoard.map((symbol) => symbol + 1);
        const plates = room.addition;
        for (let target = SCABARAS.targetLeast; target <= SCABARAS.targetMost; target++) {
            const set = solveScabarasAddition(plates, values, target);
            expect(set, `${target}`).toBeDefined();
            expect(set!.reduce((sum, i) => sum + values[i], 0)).toBe(target);
            // Joined up, from an edge
            const near = (a: number, b: number) =>
                a !== b &&
                Math.abs(plates[a].x - plates[b].x) <= 1.5 &&
                Math.abs(plates[a].y - plates[b].y) <= 1.5;
            const reached = new Set([set![0]]);
            for (let grew = true; grew; ) {
                grew = false;
                for (const i of set!) {
                    if (!reached.has(i) && [...reached].some((j) => near(i, j))) {
                        reached.add(i);
                        grew = true;
                    }
                }
            }
            expect(reached.size, `${target}`).toBe(set!.length);
            const edge = (i: number) => plates.filter((_, j) => near(i, j)).length < 8;
            expect(set!.some(edge), `${target}`).toBe(true);
        }
    });

    test("carries on from what's been stepped on, even off its own way", () => {
        const values = SCABARAS.additionBoard.map((symbol) => symbol + 1);
        const plates = room.addition;
        const target = 30;
        const fresh = solveScabarasAddition(plates, values, target)!;
        // A start somewhere else on the edge: the way on keeps it
        const other = plates.findIndex(
            (_, i) =>
                !fresh.includes(i) &&
                plates.filter(
                    (q) =>
                        q !== plates[i] &&
                        Math.abs(q.x - plates[i].x) <= 1.5 &&
                        Math.abs(q.y - plates[i].y) <= 1.5,
                ).length < 8,
        );
        const stepped = plates.map((_, i) => i === other);
        const on = solveScabarasAddition(plates, values, target, stepped)!;
        expect(on).toContain(other);
        expect(on.reduce((sum, i) => sum + values[i], 0)).toBe(target);
    });

    test("keeps the board's own way for each number as the search finds it", () => {
        const values = SCABARAS.additionBoard.map((symbol) => symbol + 1);
        for (let target = SCABARAS.targetLeast; target <= SCABARAS.targetMost; target++) {
            expect(SCABARAS_ADDITION_WAYS[target], `${target}`).toEqual(
                searchScabarasAddition(room.addition, values, target, [], Infinity),
            );
        }
    });

    test("has a way on from every first step off the board's way, onto an edge symbol", () => {
        const values = SCABARAS.additionBoard.map((symbol) => symbol + 1);
        const plates = room.addition;
        const near = (a: number, b: number) =>
            a !== b &&
            Math.abs(plates[a].x - plates[b].x) <= 1.5 &&
            Math.abs(plates[a].y - plates[b].y) <= 1.5;
        const edges = plates.flatMap((_, i) =>
            plates.filter((_, j) => near(i, j)).length < 8 ? [i] : [],
        );
        for (const edge of edges) {
            for (let target = SCABARAS.targetLeast; target <= SCABARAS.targetMost; target++) {
                if (SCABARAS_ADDITION_WAYS[target].includes(edge)) {
                    continue;
                }
                const stepped = plates.map((_, i) => i === edge);
                const way = solveScabarasAddition(plates, values, target, stepped);
                expect(way, `${edge} for ${target}`).toBeDefined();
                expect(way).toContain(edge);
                expect(way!.reduce((sum, i) => sum + values[i], 0)).toBe(target);
                expect(SCABARAS_ADDITION_FROM[edge][target]).toEqual(way);
            }
        }
    });

    test("keeps showing a way on as it's followed, a step at a time, to the end", () => {
        const values = SCABARAS.additionBoard.map((symbol) => symbol + 1);
        const plates = room.addition;
        const near = (a: number, b: number) =>
            a !== b &&
            Math.abs(plates[a].x - plates[b].x) <= 1.5 &&
            Math.abs(plates[a].y - plates[b].y) <= 1.5;
        for (const [first, byTarget] of Object.entries(SCABARAS_ADDITION_FROM)) {
            for (const [target, way] of Object.entries(byTarget)) {
                // Onto the first, then the way's next touching plate: the highest first, then
                // again the lowest first (a lower one than the first lost the way once)
                for (const pick of [Math.max, Math.min]) {
                    const stepped = plates.map((_, i) => i === Number(first));
                    const order = [Number(first)];
                    while (order.length < way.length) {
                        // A way that holds everything stepped on (another way from a symbol on
                        // the edge is as good as this one)
                        const shown = solveScabarasAddition(
                            plates,
                            values,
                            Number(target),
                            stepped,
                        );
                        expect(shown, `${order.join(",")} for ${target}`).toBeDefined();
                        expect(order.every((i) => shown!.includes(i))).toBe(true);
                        expect(shown!.reduce((sum, i) => sum + values[i], 0)).toBe(Number(target));
                        const next = pick(
                            ...way.filter((i) => !stepped[i] && order.some((j) => near(i, j))),
                        );
                        stepped[next] = true;
                        order.push(next);
                    }
                }
            }
        }
    });

    test("starts the way beside a hero stood inside the board with nothing stepped on", () => {
        const values = SCABARAS.additionBoard.map((symbol) => symbol + 1);
        const plates = room.addition;
        const near = (a: number, b: number) =>
            a !== b &&
            Math.abs(plates[a].x - plates[b].x) <= 1.5 &&
            Math.abs(plates[a].y - plates[b].y) <= 1.5;
        const inside = plates.flatMap((_, i) =>
            plates.filter((_, j) => near(i, j)).length === 8 ? [i] : [],
        );
        expect(inside.length).toBeGreaterThan(0);
        let beside = 0;
        let ways = 0;
        for (const on of inside) {
            for (let target = SCABARAS.targetLeast; target <= SCABARAS.targetMost; target++) {
                const way = solveScabarasAddition(plates, values, target, [], on);
                expect(way, `${on} for ${target}`).toBeDefined();
                expect(way!.reduce((sum, i) => sum + values[i], 0)).toBe(target);
                // Beside them, or (none found within the cap) the board's own way
                if (way!.some((i) => near(i, on))) {
                    beside++;
                } else {
                    expect(way, `${on} for ${target}`).toEqual(SCABARAS_ADDITION_WAYS[target]);
                }
                ways++;
            }
        }
        // Mostly beside them (210 of 234 as written)
        expect(beside / ways).toBeGreaterThan(0.85);
        // On the edge, they can step off the board: the board's own way
        expect(solveScabarasAddition(plates, values, 30, [], 0)).toEqual(
            SCABARAS_ADDITION_WAYS[30],
        );
    });

    test("gives up on a search past its cap rather than hold a frame", () => {
        const values = SCABARAS.additionBoard.map((symbol) => symbol + 1);
        // 3 and 4 stepped on, for 43: there's a way (SCABARAS_ADDITION_FROM[4]), five more
        // symbols on, past what the cap lets the search try
        expect(SCABARAS_ADDITION_FROM[4][43]).toEqual(expect.arrayContaining([3, 4]));
        expect(searchScabarasAddition(room.addition, values, 43, [3, 4])).toBeUndefined();
    });
});
