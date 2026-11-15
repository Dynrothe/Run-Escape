import { Ground } from "../Ground";
import { TILE_BLOCKED, TILE_BRIDGE, TileGrid } from "../format";
import { MapRecipe } from "../recipe";

// Scenery round an arena, only to look at (plans/map-depth/findings.md on the team's VM): how deep
// a drop beside the play area and how tall a backdrop can go and still look good from the play
// camera. Six cells, each a flat pad to stand on with something round it; everything but the
// pads is blocked. Heights in height units, 16 a tile.
//
// Row 1, south: drops.
//   Abyss: a pad 255 up (16 tiles) over bare ground at 0. North of it a chasm 8 tiles across with
//     its far rim back at 255; three ledges step down its near side on the west half, and its east
//     half is sheer with lava at the bottom.
//   Stacked: the same pad as a bridge deck on level 1, 255 over the ground's 255, so 510 (32
//     tiles) over the floor: how a drop goes past the byte.
//   Void: a pad with nothing round it (the black of the sky), and a ledge 65 down north of it, as
//     the Owl's Court's lower walkway is.
// Row 2: what rises.
//   Cliffs: a pad at 0 with a massif stepping up to 255 north of it in four faces, a sheer 128
//     wall dressed with rock to the west, and a bare sheer 255 to the east.
//   Terraces: a pad 255 up with terraces stepping down 32 every 4 tiles to the east and north,
//     trees on them.
//   Temple: a pad with the cache's tallest pieces round it: the sunken steeple, pillars, a statue,
//     a cave mouth, a rock face.

const SQUARES = 5;
const SIZE = SQUARES * 64;

const GRASS = 48;
const OVERLAY_ROCK = 10;
const OVERLAY_DARK_ROCK = 32;
const OVERLAY_LAVA = 19;
const OVERLAY_COBBLES = 12;
// Drawn as nothing, as in caves
const OVERLAY_VOID = 42;

const LOC_NORMAL = 10;

type Rect = { x0: number; y0: number; x1: number; y1: number };

// The pads, in the grid's tiles, and their heights
export const BACKDROP_TEST = {
    abyss: { pad: { x0: 80, y0: 72, x1: 111, y1: 91 } as Rect, height: 255 },
    stacked: { pad: { x0: 144, y0: 72, x1: 175, y1: 91 } as Rect, height: 510 },
    void: { pad: { x0: 208, y0: 72, x1: 239, y1: 91 } as Rect, height: 128 },
    cliffs: { pad: { x0: 84, y0: 136, x1: 107, y1: 151 } as Rect, height: 0 },
    terraces: { pad: { x0: 136, y0: 136, x1: 151, y1: 151 } as Rect, height: 255 },
    temple: { pad: { x0: 212, y0: 136, x1: 235, y1: 151 } as Rect, height: 64 },
};

const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
// Whether a corner is one of a rectangle's tiles'
const onRect = (r: Rect, x: number, y: number) =>
    x >= r.x0 && x <= r.x1 + 1 && y >= r.y0 && y <= r.y1 + 1;

// The cell a tile or corner is in: 0 to 2 in each row, 64 tiles a side from 64,64
function cellOf(x: number, y: number): [number, number] {
    return [Math.floor((x - 64) / 64), Math.floor((y - 64) / 64)];
}

// Level 0's corner heights
function height(x: number, y: number): number {
    const t = BACKDROP_TEST;
    const [cx, cy] = cellOf(x, y);
    if (cy === 0 && cx === 0) {
        const { pad } = t.abyss;
        if (onRect(pad, x, y)) {
            return 255;
        }
        // A chasm north of the pad, 8 tiles across, with the far rim back up at 255 so its
        // face looks at the camera. Ledges down the near side's west half: three steps of 65,
        // each 3 tiles deep
        if (y > pad.y1 + 10 && x >= pad.x0 - 8 && x <= pad.x1 + 9) {
            return 255;
        }
        if (x >= pad.x0 && x <= (pad.x0 + pad.x1) >> 1 && y > pad.y1 + 1) {
            const step = Math.floor((y - pad.y1 - 2) / 3);
            return step < 3 ? 190 - step * 65 : 0;
        }
        return 0;
    }
    if (cy === 0 && cx === 1) {
        // The deck's corners stand 255 up, its level 1 another 255 over them
        return onRect(t.stacked.pad, x, y) ? 255 : 0;
    }
    if (cy === 0 && cx === 2) {
        const { pad } = t.void;
        // A ledge 65 down, 6 tiles north of the pad
        if (x >= pad.x0 + 2 && x <= pad.x1 - 1 && y >= pad.y1 + 7 && y <= pad.y1 + 10) {
            return 63;
        }
        return 128;
    }
    if (cy === 1 && cx === 0) {
        const { pad } = t.cliffs;
        // North: four faces of 2 tiles, each with a 2 tile ledge on top, up to 255
        if (y > pad.y1 + 3 && x >= pad.x0 - 6 && x <= pad.x1 + 6) {
            const into = y - pad.y1 - 4;
            const step = Math.floor(into / 4);
            const within = into % 4;
            const level = (s: number) => Math.min(255, s * 64);
            return step >= 4
                ? 255
                : within < 2
                  ? level(step) + ((within + 1) * 64) / 2
                  : level(step + 1);
        }
        // West: a sheer 128; east: a sheer 255
        if (x < pad.x0 - 6) {
            return 128;
        }
        if (x > pad.x1 + 6) {
            return 255;
        }
        return 0;
    }
    if (cy === 1 && cx === 1) {
        const { pad } = t.terraces;
        if (onRect(pad, x, y)) {
            return 255;
        }
        // Down 32 every 4 tiles going east or north, whichever's further from the pad
        const away = Math.max(x - pad.x1 - 1, y - pad.y1 - 1, 0);
        return Math.max(255 - Math.ceil(away / 4) * 32, 0);
    }
    if (cy === 1 && cx === 2) {
        return t.temple.height;
    }
    return 0;
}

function build(): TileGrid {
    const ground = new Ground(SIZE, SIZE);
    const [level0, level1] = ground.grid.levels;
    level0.underlays.fill(GRASS);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, height(x, y));
        }
    }
    const t = BACKDROP_TEST;
    const pads = Object.values(t).map((p) => p.pad);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = ground.tile(x, y);
            const [cx, cy] = cellOf(x, y);
            const h = [
                ground.getHeight(x, y),
                ground.getHeight(x + 1, y),
                ground.getHeight(x, y + 1),
                ground.getHeight(x + 1, y + 1),
            ];
            const rise = Math.max(...h) - Math.min(...h);
            const pad = pads.some((r) => inRect(r, x, y));
            if (!pad) {
                level0.flags[i] |= TILE_BLOCKED;
            }
            if (cy === 0 && cx === 2 && !pad) {
                // The void: nothing drawn, but the ledge
                const ledge = h.every((v) => v === 63);
                level0.underlays[i] = ledge ? GRASS : 0;
                level0.overlays[i] = ledge ? OVERLAY_COBBLES : OVERLAY_VOID;
                continue;
            }
            if (cy === 0 && cx === 1 && inRect(t.stacked.pad, x, y)) {
                // The deck, on level 1, and nothing of level 0 under it
                level0.underlays[i] = 0;
                level0.overlays[i] = OVERLAY_VOID;
                level1.underlays[i] = GRASS;
                level1.overlays[i] = OVERLAY_COBBLES;
                level1.flags[i] = TILE_BRIDGE;
                continue;
            }
            if (pad) {
                level0.overlays[i] = OVERLAY_COBBLES;
            } else if (rise > 12) {
                level0.overlays[i] = cy === 0 ? OVERLAY_DARK_ROCK : OVERLAY_ROCK;
            } else if (cy === 0 && h.every((v) => v === 0) && (cx === 0 || cx === 1)) {
                // Lava at the bottom of the drops north of the pads: the chasm's east half, and
                // far off under the deck
                const r = cx === 0 ? t.abyss.pad : t.stacked.pad;
                const lava = cx === 0 ? x > (r.x0 + r.x1) >> 1 && y > r.y1 : y > r.y1 + 12;
                if (lava) {
                    level0.overlays[i] = OVERLAY_LAVA;
                }
            }
        }
    }
    // The deck's corners: 255 more over level 0's
    const corners = SIZE + 1;
    const deck = t.stacked.pad;
    for (let y = deck.y0; y <= deck.y1 + 1; y++) {
        for (let x = deck.x0; x <= deck.x1 + 1; x++) {
            level1.heights[x + y * corners] = 255;
        }
    }
    placeScenery(ground);
    return ground.grid;
}

// Rock and the cache's tall pieces
const ROCK_HEAP = 11434; // 2 by 2 rockslide, 174 triangles
const WHITE_ROCK = 50964; // 6 by 3 rock face, 9.7 tiles tall, 217 triangles
const BLUE_ROCK = 49068; // 7 by 7, 10 tiles tall, 250 triangles
const STEEPLE = 48311; // the sunken steeple: 9 by 9, 15 tiles tall, 2,475 triangles
const PILLAR = 52490; // 3 by 3, 7.6 tiles tall, 1,756 triangles
const STATUE = 37818; // 6 by 4, 8.8 tiles tall, 1,589 triangles
const CAVE = 62217; // a cave mouth 12 tiles wide, 7.3 tall, 1,880 triangles
const TREE = 1276; // 2 by 2

function placeScenery(ground: Ground): void {
    const locs = ground.grid.locs;
    const put = (id: number, x: number, y: number, rotation = 0) =>
        locs.push({ id, type: LOC_NORMAL, rotation, level: 0, x, y });
    const t = BACKDROP_TEST;
    // Cliffs: heaps on the north ledges, white rock along the foot of the west wall
    const c = t.cliffs.pad;
    for (let step = 0; step < 4; step++) {
        const y = c.y1 + 4 + step * 4 + 2;
        for (let x = c.x0 - 4; x <= c.x1 + 4; x += 5) {
            put(ROCK_HEAP, x + (step % 2) * 2, y);
        }
    }
    for (let y = c.y0 - 8; y <= c.y1 + 2; y += 6) {
        put(WHITE_ROCK, c.x0 - 6, y, 1);
    }
    // Terraces: a tree every few tiles on each step
    const r = t.terraces.pad;
    for (let y = r.y0 - 4; y < r.y1 + 30; y += 5) {
        for (let x = r.x0 - 4; x < r.x1 + 30; x += 5) {
            if (
                !inRect({ x0: r.x0 - 2, y0: r.y0 - 6, x1: r.x1 + 1, y1: r.y1 + 1 }, x, y) &&
                (x * 7 + y * 3) % 3 !== 0
            ) {
                put(TREE, x, y);
            }
        }
    }
    // Temple: the steeple north, pillars either side of it, the statue and the rock face west, the
    // cave east
    const p = t.temple.pad;
    const mid = (p.x0 + p.x1) >> 1;
    put(STEEPLE, mid - 4, p.y1 + 4);
    for (const dx of [-12, -8, 6, 10]) {
        put(PILLAR, mid + dx, p.y1 + 3);
    }
    put(STATUE, p.x0 - 8, p.y0 + 6, 1);
    put(BLUE_ROCK, p.x0 - 9, p.y0 - 4);
    put(CAVE, p.x1 + 4, p.y0 + 4, 3);
}

export const BACKDROP_TEST_RECIPE: MapRecipe = {
    id: "scaperune_backdrop",
    mapX: 85,
    mapY: 96,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: 1,
    spawn: { x: 96, y: 144 },
    build,
};
