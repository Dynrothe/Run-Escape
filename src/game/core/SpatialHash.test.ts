import { Rng } from "./Rng";
import { Positioned, SpatialHash } from "./SpatialHash";

type Thing = Positioned & { id: number };

// What query should call back with: everything in the cells the circle
// overlaps, cell by cell, rows from the south, in the order it went in
function expected(things: Thing[], cellSize: number, x: number, y: number, radius: number) {
    const cell = (v: number) => Math.floor(v / cellSize);
    const found: number[] = [];
    for (let cellY = cell(y - radius); cellY <= cell(y + radius); cellY++) {
        for (let cellX = cell(x - radius); cellX <= cell(x + radius); cellX++) {
            for (const thing of things) {
                if (cell(thing.x) === cellX && cell(thing.y) === cellY) {
                    found.push(thing.id);
                }
            }
        }
    }
    return found;
}

describe("SpatialHash", () => {
    test("clear releases the objects in reused cells and forgets out-of-bounds cells", () => {
        const hash = new SpatialHash<Thing>(2, { baseX: 0, baseY: 0, sizeX: 8, sizeY: 8 });
        hash.insert({ x: 1, y: 1, id: 1 });
        hash.insert({ x: 1, y: 1, id: 2 });
        hash.insert({ x: -20, y: 1, id: 3 });
        const bucket = hash["buckets"][0];
        hash.clear();
        // Its array's kept, with nothing left in it
        expect(bucket).toEqual([undefined, undefined]);
        expect(hash["counts"][0]).toBe(0);
        expect(hash["outside"].size).toBe(0);
        hash.insert({ x: 0, y: 0, id: 4 });
        expect(hash["buckets"][0]).toBe(bucket);
        expect(bucket).toEqual([{ x: 0, y: 0, id: 4 }, undefined]);
        const found: number[] = [];
        hash.query(0, 0, 0.5, (thing) => found.push(thing.id));
        expect(found).toEqual([4]);
    });

    test("finds things cell by cell in the order they went in, in its bounds and beyond", () => {
        const rng = new Rng(5);
        const bounds = { baseX: 1000, baseY: 2000, sizeX: 40, sizeY: 30 };
        const hash = new SpatialHash<Thing>(2, bounds);
        // Twice, to see clear() leaves nothing behind
        for (let round = 0; round < 2; round++) {
            hash.clear();
            const things: Thing[] = [];
            for (let id = 0; id < 300; id++) {
                // Some a little way outside the bounds
                const thing = {
                    id,
                    x: bounds.baseX - 6 + rng.next() * (bounds.sizeX + 12),
                    y: bounds.baseY - 6 + rng.next() * (bounds.sizeY + 12),
                };
                things.push(thing);
                hash.insert(thing);
            }
            for (let i = 0; i < 50; i++) {
                const x = bounds.baseX - 4 + rng.next() * (bounds.sizeX + 8);
                const y = bounds.baseY - 4 + rng.next() * (bounds.sizeY + 8);
                const radius = rng.next() * 8;
                const found: number[] = [];
                hash.query(x, y, radius, (thing) => found.push(thing.id));
                expect(found).toEqual(expected(things, 2, x, y, radius));
                // visits says which of them the query came to
                const visited = things.filter((t) => hash.visits(x, y, radius, t.x, t.y));
                expect(visited.map((t) => t.id).sort((a, b) => a - b)).toEqual(
                    [...found].sort((a, b) => a - b),
                );
            }
        }
    });
});
