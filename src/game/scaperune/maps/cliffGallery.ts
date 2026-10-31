import { Ground } from "../Ground";
import { createRng } from "../noise";
import { BuildContext, MapRecipe } from "../recipe";

// Rock locs laid over a steep band, one kind to a cell, to look at them from the play
// camera. Row by row from the south-west.
const CELL_X = 10;
const CELL_Y = 11;
const COLS = 6;
const ROWS = 8;
const MARGIN = 64;
const SIZE = 4 * 64;
const LOW = 30;
const RISE = 70;

// [id, type, tiles a side, rotation]: a loc once in its cell's middle if it has a rotation,
// or all over its band if not. Type -1 is an overlay.
const KINDS: [number, number, number, number?][] = [
    [5, -1, 1],
    [174, -1, 1],
    [329, -1, 1],
    [1, -1, 1],
    [83, -1, 1],
    [3, -1, 1],
    ...[14436, 17209, 2123, 19039, 30177, 30180, 20852, 26499].flatMap(
        (id): [number, number, number, number][] => [
            [id, 10, 3, 0],
            [id, 10, 3, 1],
            [id, 10, 3, 2],
        ],
    ),
    [21509, 3, 1, 0],
    [21509, 3, 1, 1],
    [1797, 10, 1, 0],
    [12683, 10, 1, 0],
    [12684, 10, 1, 0],
    [15487, 10, 4, 0],
];

function build(_context: BuildContext) {
    const ground = new Ground(SIZE, SIZE);
    ground.level0.underlays.fill(92);
    const rng = createRng(1);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            const ly = y - MARGIN;
            const cell = Math.floor(ly / CELL_Y);
            const inCell = ly - cell * CELL_Y;
            // A step up then back down, so that each cell has a face looking south
            const up = Math.min(Math.max(inCell - 3, 0) / 3, 1);
            const down = Math.min(Math.max(inCell - 8, 0) / 3, 1);
            ground.setHeight(x, y, LOW + RISE * (up - down));
        }
    }
    KINDS.forEach(([id, type, size, turned], i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x0 = MARGIN + col * CELL_X;
        const y0 = MARGIN + row * CELL_Y;
        if (turned !== undefined) {
            ground.grid.locs.push({ id, type, rotation: turned, level: 0, x: x0 + 3, y: y0 + 1 });
            return;
        }
        for (let y = y0 + 3; y < y0 + 6; y += size) {
            for (let x = x0 + 1; x < x0 + CELL_X - 1; x += size) {
                if (type < 0) {
                    ground.level0.overlays[ground.tile(x, y)] = id;
                    continue;
                }
                const rotation = type === 0 ? 3 : Math.floor(rng() * 4);
                ground.grid.locs.push({ id, type, rotation, level: 0, x, y });
            }
        }
    });
    return ground.grid;
}

export const CLIFF_GALLERY: MapRecipe = {
    id: "scaperune_cliffs",
    mapX: 92,
    mapY: 110,
    squaresX: 4,
    squaresY: 4,
    margin: 1,
    spawn: { x: MARGIN + 30, y: MARGIN + ROWS * CELL_Y + 4 },
    build,
};
