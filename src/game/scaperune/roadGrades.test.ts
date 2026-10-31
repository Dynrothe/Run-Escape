import { describe, expect, it } from "vitest";

import type { Point } from "./paths";
import { Plot, RoadLine, gradeRoads } from "./roadGrades";
import { Terrain } from "./terrain";

function flatGround(height: number): Terrain {
    const terrain = new Terrain(80, 80);
    terrain.height.fill(height);
    return terrain;
}

function straight(from: Point, to: Point): Point[] {
    const length = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
    return Array.from({ length: length + 1 }, (_, i) => ({
        x: from.x + ((to.x - from.x) * i) / length,
        y: from.y + ((to.y - from.y) * i) / length,
    }));
}

function road(points: Point[], more?: Partial<RoadLine>): RoadLine {
    return { points, lead: 0, halfWidth: 1.2, grade: 5, ...more };
}

function steepest(line: RoadLine): number {
    let most = 0;
    for (let i = 1; i < line.points.length; i++) {
        const { x, y } = line.points[i];
        const last = line.points[i - 1];
        const rise = Math.abs(line.heights![i] - line.heights![i - 1]);
        most = Math.max(most, rise / Math.hypot(x - last.x, y - last.y));
    }
    return most;
}

describe("gradeRoads", () => {
    it("never climbs steeper than its grade over a cliff", () => {
        const terrain = flatGround(50);
        for (let y = 0; y < 80; y++) {
            for (let x = 40; x < 80; x++) {
                terrain.height[terrain.corner(x, y)] = 200;
            }
        }
        const line = road(straight({ x: 5, y: 10 }, { x: 75, y: 10 }));
        gradeRoads(terrain, [line], [], 1, 10);
        expect(steepest(line)).toBeLessThanOrEqual(5.01);
    });

    it("leaves the end of a lead at the height it comes out of", () => {
        const terrain = flatGround(100);
        const line = road(straight({ x: 5, y: 10 }, { x: 40, y: 10 }), { lead: 6, start: 60 });
        gradeRoads(terrain, [line], [], 1, 10);
        expect(line.heights![5]).toBe(60);
        expect(steepest(line)).toBeLessThanOrEqual(5.01);
        expect(line.heights![line.points.length - 1]).toBeCloseTo(100, 0);
    });

    it("keeps roads that meet at the same height, whichever was laid first", () => {
        const terrain = flatGround(50);
        for (let y = 0; y < 80; y++) {
            for (let x = 0; x < 80; x++) {
                terrain.height[terrain.corner(x, y)] = 40 + x * 2 + y;
            }
        }
        const main = road(straight({ x: 5, y: 30 }, { x: 70, y: 30 }));
        const side = road(straight({ x: 40, y: 70 }, { x: 40, y: 31 }));
        gradeRoads(terrain, [side, main], [], 1, 10);
        const end = side.heights![side.points.length - 1];
        const at = main.points.findIndex((point) => point.x >= 40);
        expect(Math.abs(end - main.heights![at])).toBeLessThan(6);
    });

    it("brings two roads running side by side to about the same height", () => {
        const terrain = flatGround(50);
        for (let y = 20; y < 80; y++) {
            for (let x = 0; x < 80; x++) {
                terrain.height[terrain.corner(x, y)] = 150;
            }
        }
        const one = road(straight({ x: 5, y: 17 }, { x: 70, y: 17 }));
        const two = road(straight({ x: 5, y: 20 }, { x: 70, y: 20 }));
        gradeRoads(terrain, [one, two], [], 1, 10);
        const rise = Math.abs(one.heights![30] - two.heights![30]);
        expect(rise).toBeLessThanOrEqual(5 * 3 + 0.1);
    });

    it("keeps level with a plot it goes by", () => {
        const terrain = flatGround(100);
        const plots: Plot[] = [{ x: 30, y: 12, sizeX: 8, sizeY: 8, height: 70 }];
        const line = road(straight({ x: 5, y: 10 }, { x: 70, y: 10 }));
        gradeRoads(terrain, [line], plots, 1, 10);
        expect(line.heights![29]).toBeCloseTo(70, 0);
        expect(steepest(line)).toBeLessThanOrEqual(5.01);
    });

    it("climbs steadily between two heights it has to meet, if it has to go over the grade", () => {
        const terrain = flatGround(100);
        const line = road(straight({ x: 5, y: 10 }, { x: 25, y: 10 }), { lead: 2, start: 60 });
        const other = road(straight({ x: 25, y: 10 }, { x: 45, y: 10 }), { lead: 2, start: 130 });
        gradeRoads(terrain, [line, other], [], 1, 10);
        expect(steepest(line)).toBeLessThanOrEqual(5 * 2.01);
    });

    it("pins the ground to the road, and leaves fords alone", () => {
        const terrain = flatGround(100);
        const line = road(straight({ x: 5, y: 10 }, { x: 40, y: 10 }), { lead: 3, start: 90 });
        const ford: RoadLine = {
            points: straight({ x: 5, y: 50 }, { x: 40, y: 50 }),
            lead: 0,
            halfWidth: 2,
        };
        gradeRoads(terrain, [line, ford], [], 1, 10);
        expect(terrain.isPinned(6, 10)).toBe(true);
        expect(terrain.isPinned(20, 50)).toBe(false);
        expect(ford.heights).toBeUndefined();
    });
});
