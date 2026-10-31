import { Ground } from "../Ground";
import { TileGrid } from "../format";
import { createNoise, distanceTo } from "../noise";
import { cutPrefab, rotatePrefab } from "../prefab";
import { PREFABS, loadPrefab } from "../prefabs";
import { BuildContext, MapRecipe } from "../recipe";

// A dev-only proof of custom ground: an island of our own, two map squares by
// two of playable ground in a ring of sea, with a river down it, a road, a
// plateau, cache trees and rocks, and real buildings and a bridge stamped on.

// The arena's the middle two squares each way
const SQUARES = 4;
const SIZE = SQUARES * 64;
const ARENA_MIN = 64;
const ARENA_MAX = 191;

// Floor ids, as the map files store them (the cache's id plus one), from the
// surface around Lumbridge
const GRASS = [48, 50, 49];
const SAND = 62;
const OVERLAY_WATER = 6;
const OVERLAY_ROAD = 22;
const OVERLAY_ROCK = 10;

const LOC_NORMAL = 10;
const LOC_FLOOR_DECORATION = 22;

// Cache locs: [id, tiles]
const TREES: [number, number][] = [
    [1276, 2],
    [1278, 2],
    [10820, 3],
];
const ROCKS: [number, number][] = [
    [5605, 1],
    [10790, 2],
    [10793, 1],
];
const TUFTS = [4735, 4736, 4737, 4738];

// Where the river runs, for a row: straight at the bridge
const RIVER_X = 150;
const BRIDGE_Y = 128;
function riverCentre(y: number, wiggle: (x: number, y: number) => number): number {
    const away = Math.max(Math.abs(y - BRIDGE_Y) - 8, 0);
    return RIVER_X + (wiggle(3.5, y / 22) - 0.5) * Math.min(away, 24);
}

const RIVER_HALF_WIDTH = 4.5;

function build({ maps, locs }: BuildContext): TileGrid {
    const ground = new Ground(SIZE, SIZE);
    const hills = createNoise(1);
    const patches = createNoise(2);
    const wiggle = createNoise(3);
    const clumps = createNoise(4);
    const tiles = SIZE * SIZE;

    // Sea all round: the island's edge is a noisy rectangle inside the arena
    const sea = new Uint8Array(tiles);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const toEdge = Math.min(x - ARENA_MIN, ARENA_MAX - x, y - ARENA_MIN, ARENA_MAX - y);
            if (toEdge + (patches(x / 18, y / 18) - 0.5) * 16 < 6) {
                sea[ground.tile(x, y)] = 1;
            }
        }
    }

    // The river, and a pond
    const fresh = new Uint8Array(tiles);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const toRiver = Math.abs(x - riverCentre(y, wiggle));
            if (toRiver <= RIVER_HALF_WIDTH || Math.hypot(x - 88, y - 88) < 7) {
                fresh[ground.tile(x, y)] = 1;
            }
        }
    }

    // Hills, falling away to the water
    const toSea = distanceTo(sea, SIZE, SIZE, 8);
    const toFresh = distanceTo(fresh, SIZE, SIZE, 6);
    const SEA_BED = 6;
    const RIVER_BED = 8;
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            const tx = Math.min(x, SIZE - 1);
            const ty = Math.min(y, SIZE - 1);
            const i = ground.tile(tx, ty);
            let height = 46 + (hills(x / 26, y / 26) - 0.5) * 44;
            height = RIVER_BED + (height - RIVER_BED) * Math.min(toFresh[i] / 6, 1);
            height = SEA_BED + (height - SEA_BED) * Math.min(toSea[i] / 8, 1);
            ground.setHeight(x, y, height);
        }
    }

    // A plateau with a cliff round it and a ramp up the south side
    const PLATEAU_X = 92;
    const PLATEAU_Y = 160;
    const PLATEAU_RADIUS = 14;
    const cliff = new Uint8Array(tiles);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            const distance = Math.hypot(x - PLATEAU_X, y - PLATEAU_Y);
            const ramp = Math.abs(x - PLATEAU_X) <= 2 && y < PLATEAU_Y;
            if (distance < PLATEAU_RADIUS + 1) {
                ground.setHeight(x, y, ground.getHeight(x, y) + 44);
            } else if (ramp && distance < PLATEAU_RADIUS + 12) {
                const t = (distance - PLATEAU_RADIUS - 1) / 11;
                ground.setHeight(x, y, ground.getHeight(x, y) + 44 * (1 - t));
            } else if (distance < PLATEAU_RADIUS + 3) {
                const t = (distance - PLATEAU_RADIUS - 1) / 2;
                ground.setHeight(x, y, ground.getHeight(x, y) + 44 * (1 - t));
            }
            const i = x < SIZE && y < SIZE ? ground.tile(x, y) : -1;
            if (i >= 0 && !ramp && distance >= PLATEAU_RADIUS && distance < PLATEAU_RADIUS + 3) {
                cliff[i] = 1;
            }
        }
    }

    // Grass in patches, sand by the sea
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = ground.tile(x, y);
            const patch = patches(x / 11 + 40, y / 11 + 40);
            const grass = GRASS[patch < 0.42 ? 0 : patch < 0.56 ? 1 : 2];
            ground.level0.underlays[i] = toSea[i] < 4 ? SAND : grass;
        }
    }
    ground.paintOverlay(sea, OVERLAY_WATER, true);
    ground.paintOverlay(fresh, OVERLAY_WATER, true);
    ground.paintOverlay(cliff, OVERLAY_ROCK, true);

    // The road: west from the bridge through the village, and on past the
    // river to the east side's forest
    const road = new Uint8Array(tiles);
    const markRoad = (x: number, y: number) => {
        for (let dy = 0; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
                if (ground.inside(x + dx, y + dy)) {
                    road[ground.tile(x + dx, y + dy)] = 1;
                }
            }
        }
    };
    for (let x = 96; x < 180; x++) {
        const bend = (wiggle(x / 19, 8.5) - 0.5) * 26 * Math.min(Math.abs(x - 150) / 20, 1);
        markRoad(x, Math.round(BRIDGE_Y + bend));
    }
    for (let y = 100; y < BRIDGE_Y; y++) {
        markRoad(100 + Math.round((wiggle(9.5, y / 14) - 0.5) * 10), y);
    }
    ground.paintOverlay(road, OVERLAY_ROAD, false);

    // The bridge over the River Lum, across our river. It's the one thing
    // stamped with its own heights and everything under it: the deck's on
    // level 1.
    const bridge = cutPrefab(maps, 3236, 3222, 18, 8);
    ground.stamp(bridge, RIVER_X - 9, BRIDGE_Y - 4, {
        floor: "all",
        feather: 5,
        flatten: false,
    });

    // Houses from Lumbridge, on our grass, turned different ways. The church
    // keeps only its floor; the first house brings its whole rectangle, to see
    // the seam.
    const context = { maps, locs };
    const house = loadPrefab(context, PREFABS.lumbridge_house);
    ground.stamp(rotatePrefab(house, 0, locs), 108, 134, {
        floor: "all",
        feather: 4,
        flatten: true,
    });
    ground.stamp(rotatePrefab(house, 2, locs), 118, 112, {
        floor: "footprint",
        feather: 4,
        flatten: true,
    });
    const church = loadPrefab(context, PREFABS.lumbridge_church);
    ground.stamp(rotatePrefab(church, 1, locs), 78, 108, {
        floor: "footprint",
        feather: 5,
        flatten: true,
    });
    // A shop from Varrock, from another map square
    const varrockHouse = loadPrefab(context, PREFABS.varrock_shop);
    ground.stamp(rotatePrefab(varrockHouse, 3, locs), 170, 150, {
        floor: "footprint",
        feather: 4,
        flatten: true,
    });

    // Scatter: trees in clumps, rocks here and there, tufts everywhere. The
    // same every time, from a hash of the tile.
    const random = createNoise(5);
    const roll = (x: number, y: number, salt: number) =>
        (random(x * 3.7 + salt, y * 3.1 - salt) * 10) % 1;
    for (let y = ARENA_MIN - 4; y <= ARENA_MAX + 4; y++) {
        for (let x = ARENA_MIN - 4; x <= ARENA_MAX + 4; x++) {
            const clump = clumps(x / 15, y / 15);
            const east = x > 158;
            const chance = clump > 0.56 ? 0.16 : east ? 0.04 : 0.012;
            const r = roll(x, y, 1);
            if (r < chance) {
                const [id, size] = TREES[Math.floor(roll(x, y, 2) * TREES.length)];
                if (ground.isClear(x, y, size, size)) {
                    ground.place(
                        {
                            id,
                            type: LOC_NORMAL,
                            rotation: Math.floor(roll(x, y, 3) * 4),
                            level: 0,
                            x,
                            y,
                        },
                        size,
                        size,
                    );
                }
            } else if (r > 0.992) {
                const [id, size] = ROCKS[Math.floor(roll(x, y, 4) * ROCKS.length)];
                if (ground.isClear(x, y, size, size)) {
                    ground.place(
                        {
                            id,
                            type: LOC_NORMAL,
                            rotation: Math.floor(roll(x, y, 5) * 4),
                            level: 0,
                            x,
                            y,
                        },
                        size,
                        size,
                    );
                }
            } else if (r > 0.75 && ground.isClear(x, y, 1, 1)) {
                ground.grid.locs.push({
                    id: TUFTS[Math.floor(roll(x, y, 6) * TUFTS.length)],
                    type: LOC_FLOOR_DECORATION,
                    rotation: Math.floor(roll(x, y, 7) * 4),
                    level: 0,
                    x,
                    y,
                });
            }
        }
    }

    return ground.grid;
}

export const TERRAIN_TEST: MapRecipe = {
    id: "terrain_test",
    mapX: 79,
    mapY: 119,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: 1,
    spawn: { x: 124, y: 127 },
    build,
};
