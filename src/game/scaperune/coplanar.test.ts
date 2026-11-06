import { describe, expect, it } from "vitest";

import { DrawnModel, FaceModel, describeCoplanar, findCoplanar } from "./coplanar";

// A model of flat triangles, each [x, z] three times at height y (down is positive), wound as
// given: anticlockwise in x and z looks up, as a floor tile does
function flats(...faces: { y: number; points: [number, number][] }[]): FaceModel {
    const verticesX: number[] = [];
    const verticesY: number[] = [];
    const verticesZ: number[] = [];
    const indices: number[][] = [[], [], []];
    for (const { y, points } of faces) {
        points.forEach(([x, z], i) => {
            indices[i].push(verticesX.length);
            verticesX.push(x);
            verticesY.push(y);
            verticesZ.push(z);
        });
    }
    return {
        faceCount: faces.length,
        verticesX,
        verticesY,
        verticesZ,
        indices1: indices[0],
        indices2: indices[1],
        indices3: indices[2],
    };
}

// A whole tile, looking up, round its middle
const TILE_FLOOR = (y = 0) =>
    flats(
        {
            y,
            points: [
                [-64, -64],
                [64, -64],
                [64, 64],
            ],
        },
        {
            y,
            points: [
                [-64, -64],
                [64, 64],
                [-64, 64],
            ],
        },
    );
// A strip along a tile's south edge, as a wall's cap is
const CAP = (y: number) =>
    flats({
        y,
        points: [
            [-64, -64],
            [64, -64],
            [64, -48],
        ],
    });

let piece = 0;
const at = (label: string, tileX: number, tileY: number, model: FaceModel): DrawnModel => ({
    piece: ++piece,
    label,
    level: 0,
    x: tileX * 128 + 64,
    z: tileY * 128 + 64,
    height: -1040,
    model,
});

describe("coplanar faces", () => {
    it("finds a wall's cap at the floor's height on the floor tile it's on", () => {
        const found = findCoplanar([
            at("38185 floor decoration", 3, 4, TILE_FLOOR()),
            at("38924 wall", 3, 4, CAP(0)),
        ]);
        expect(found).toEqual([
            {
                a: "38185 floor decoration",
                b: "38924 wall",
                tiles: [{ x: 3, y: 4, level: 0 }],
                stamped: false,
            },
        ]);
        expect(describeCoplanar(found)).toEqual([
            "38185 floor decoration and 38924 wall have faces in one plane, which z-fight, on 1 tile (3,4)",
        ]);
    });

    it("lets a cap a few units lower, or higher, be", () => {
        for (const y of [4, -2]) {
            const floor = at("floor", 3, 4, TILE_FLOOR());
            expect(findCoplanar([floor, at("wall", 3, 4, CAP(y))])).toEqual([]);
        }
    });

    it("counts only faces looking up, flat, and drawn", () => {
        const floor = () => at("floor", 3, 4, TILE_FLOOR());
        // The underside of something standing on the floor: wound the other way
        const under = flats({
            y: 0,
            points: [
                [-64, -64],
                [64, -48],
                [64, -64],
            ],
        });
        expect(findCoplanar([floor(), at("urn", 3, 4, under)])).toEqual([]);
        // A slope that only touches the floor's height at one corner
        const slope = CAP(0);
        slope.verticesY = [0, -8, -8];
        expect(findCoplanar([floor(), at("ramp", 3, 4, slope)])).toEqual([]);
        // A face the model doesn't draw
        const hidden = { ...CAP(0), faceColors3: [-2] };
        expect(findCoplanar([floor(), at("hidden", 3, 4, hidden)])).toEqual([]);
    });

    it("lets neighbours that only touch be, and a loc's own faces", () => {
        expect(
            findCoplanar([at("floor", 3, 4, TILE_FLOOR()), at("floor", 4, 4, TILE_FLOOR())]),
        ).toEqual([]);
        // Both halves of one tile, and a tile on another level
        const one = at("rug", 3, 4, TILE_FLOOR());
        expect(findCoplanar([one, { ...one, model: CAP(0) }])).toEqual([]);
        expect(findCoplanar([one, { ...at("cap", 3, 4, CAP(0)), level: 1 }])).toEqual([]);
    });

    it("finds a big face on every tile it lies over, and says when both were cut as built", () => {
        // A 3 by 1 plate from tile 3 to 5, and floor tiles under its last two
        const plate = flats(
            {
                y: 0,
                points: [
                    [-64, -64],
                    [320, -64],
                    [320, 64],
                ],
            },
            {
                y: 0,
                points: [
                    [-64, -64],
                    [320, 64],
                    [-64, 64],
                ],
            },
        );
        const found = findCoplanar([
            { ...at("plate", 3, 4, plate), stamped: true },
            { ...at("floor", 4, 4, TILE_FLOOR()), stamped: true },
            { ...at("floor", 5, 4, TILE_FLOOR()), stamped: true },
        ]);
        expect(found).toHaveLength(1);
        expect(found[0].tiles).toEqual([
            { x: 4, y: 4, level: 0 },
            { x: 5, y: 4, level: 0 },
        ]);
        expect(found[0].stamped).toBe(true);
        expect(describeCoplanar(found)[0]).toContain("as cut from the real place");
    });
});
