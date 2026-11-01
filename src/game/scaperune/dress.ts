import { Ground, OverlayChoice } from "./Ground";
import { RockDef } from "./biomes";
import { WATER_OVERLAYS } from "./catalogue";
import { TILE_BLOCKED } from "./format";
import { createRng, distanceTo, smoothField } from "./noise";
import { getTileSlope } from "./terrain";

// What goes on the ground once it's shaped: rock's dressing and the carpet of small things
// that real ground has on every tile. Hand-made maps call these too, so they only need Ground.
// See the design research, sections 3 and 4.

const LOC_NORMAL = 10;
const LOC_FLOOR_DECORATION = 22;

// How steep a tile is before a heap of rock can stand on it, and how many of those get one
const SLIDE_SLOPE = 16;
const SLIDE_SHARE = 1 / 3;
// Rock with pebbles on it
const PEBBLE_SHARE = 0.4;
// Facets cover rock this many tiles out from a face
const FACET_REACH = 3;

// Where a field stops, in the same units as paintOverlay's: far enough under 0 that a tile's
// edge runs through its middle rather than along its side
const OFF_THE_ROCK = -0.3;

// What a tile of rock can have on it
export type RockKit = Pick<RockDef, "pebbles" | "rubble" | "facets">;

export type RockDressing = {
    kitAt: (x: number, y: number) => RockKit;
    seed: number;
    // Of the slides and facets a tile could have, how many it gets
    share: number;
};

// Rock's colour, on rock and nowhere else. paintOverlay's smoothing reaches over onto the tiles
// next to what it's given, and a real cliff stops at its foot: the ground beside it is plain
// ground. So a corner that touches anything but rock is kept out of the field.
export function paintRockFloor(
    ground: Ground,
    rock: Uint8Array,
    overlay: OverlayChoice,
    skip?: Uint8Array,
): Uint8Array {
    const { sizeX, sizeY } = ground;
    const cornersX = sizeX + 1;
    const field = new Float32Array(cornersX * (sizeY + 1));
    const edge = new Uint8Array(field.length);
    for (let y = 0; y <= sizeY; y++) {
        for (let x = 0; x <= sizeX; x++) {
            let count = 0;
            for (const [tx, ty] of [
                [x - 1, y - 1],
                [x, y - 1],
                [x - 1, y],
                [x, y],
            ]) {
                if (ground.inside(tx, ty) && rock[ground.tile(tx, ty)]) {
                    count++;
                }
            }
            field[x + y * cornersX] = count / 4 - 0.4;
            edge[x + y * cornersX] = count < 4 ? 1 : 0;
        }
    }
    const smoothed = smoothField(field, cornersX, sizeY + 1, 1);
    for (let i = 0; i < smoothed.length; i++) {
        if (edge[i]) {
            smoothed[i] = Math.min(smoothed[i], OFF_THE_ROCK);
        }
    }
    return ground.paintField(smoothed, overlay, false, skip);
}

// What's on rock: facets over everything near a face if the kit has them, low slides on a
// share of the steep band, and pebbles on most of what's left. Only on blocked ground, so
// nothing here changes where you walk.
export function dressRock(ground: Ground, rock: Uint8Array, dressing: RockDressing): void {
    const { kitAt, seed, share } = dressing;
    const { sizeX, sizeY } = ground;
    const { heights, flags, overlays } = ground.level0;
    const { locs } = ground.grid;
    const roll = createRng(seed);
    const corners = sizeX + 1;
    const isRock = (i: number) =>
        rock[i] !== 0 && (flags[i] & TILE_BLOCKED) !== 0 && !WATER_OVERLAYS.has(overlays[i]);
    const steep = new Uint8Array(rock.length);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            steep[i] = isRock(i) && getTileSlope(heights, corners, x, y) > SLIDE_SLOPE ? 1 : 0;
        }
    }
    const toFace = distanceTo(steep, sizeX, sizeY, FACET_REACH + 1);
    const taken = new Uint8Array(rock.length);
    const put = (id: number, type: number, x: number, y: number) =>
        locs.push({ id, type, rotation: Math.floor(roll() * 4), level: 0, x, y });
    const pick = (list: number[]) => list[Math.floor(roll() * list.length)];
    // The outermost tiles of a grid aren't drawn
    for (let y = 1; y < sizeY - 2; y++) {
        for (let x = 1; x < sizeX - 2; x++) {
            const i = x + y * sizeX;
            if (!isRock(i) || taken[i]) {
                continue;
            }
            const kit = kitAt(x, y);
            if (kit.facets && toFace[i] <= FACET_REACH) {
                taken[i] = 1;
                if (roll() < share) {
                    put(pick(kit.facets), LOC_NORMAL, x, y);
                }
                continue;
            }
            const block = [i, i + 1, i + sizeX, i + sizeX + 1];
            if (
                steep[i] &&
                roll() < SLIDE_SHARE * share &&
                block.every((tile) => isRock(tile) && !taken[tile])
            ) {
                const [id] = kit.rubble[Math.floor(roll() * kit.rubble.length)];
                put(id, LOC_NORMAL, x, y);
                for (const tile of block) {
                    taken[tile] = 1;
                }
            }
        }
    }
    for (let y = 1; y < sizeY - 1; y++) {
        for (let x = 1; x < sizeX - 1; x++) {
            const i = x + y * sizeX;
            if (isRock(i) && !taken[i] && roll() < PEBBLE_SHARE) {
                put(pick(kitAt(x, y).pebbles), LOC_FLOOR_DECORATION, x, y);
            }
        }
    }
}
