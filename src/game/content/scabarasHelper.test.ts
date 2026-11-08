import { describe, expect, test } from "vitest";

import { TOMBS_OF_AMASCUT_MAP } from "../scaperune/maps/tombsOfAmascut";
import { solveScabarasAddition, solveScabarasLights } from "./scabarasHelper";
import { SCABARAS } from "./tombs";

const room = TOMBS_OF_AMASCUT_MAP.tombs!.paths.find((p) => p.room?.scabaras)!.room!.scabaras!;

describe("the Scabaras puzzle helper", () => {
    test("lights the ring in the fewest steps, each flipping itself and its neighbours", () => {
        const flip = (lights: boolean[], presses: number[]) => {
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
});
