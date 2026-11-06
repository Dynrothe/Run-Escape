import { getCharredLoc, getLoweredLoc } from "../../rs/config/loctype/LocOverrides";
import {
    LEVELS,
    type PlacedLoc,
    TILE_BLOCKED,
    TILE_BRIDGE,
    TILE_SHOWN,
    type TileGrid,
} from "./format";
import { createNoise } from "./noise";
import type { LocInfo } from "./recipe";

// A place cut from the real world, burnt to ruins: the same streets, walls and squares, with
// every building's walls charred, some of them fallen or half fallen, its roof, doors and
// upstairs gone, what grew there burnt off and the ground gone to ash. It works on a cut
// (prefab.ts cutPrefab) before it's stamped, so any real town can be put through it; what's
// left standing is the real loc, burnt (LocOverrides.ts CHARRED_LOCS), so a building keeps its
// footprint and reads as what it was. maps/battleForVarrock.ts is Varrock's.

// Loc types (LocModelType)
const WALL_TYPES = new Set([0, 1, 2, 3, 9]);
const WALL_DECORATIONS = new Set([4, 5, 6, 7, 8]);
const LOC_NORMAL = 10;
const LOC_DIAGONAL = 11;
const LOC_FLOOR_DECORATION = 22;
// 12 to 21 are a roof's pieces
const isRoof = (type: number) => type >= 12 && type <= 21;

export type RuinRules = {
    // For the noise that picks which runs of wall fall, and what's thinned
    seed: number;
    // Walls: where the noise (about 0 to 1, features `wallScale` tiles across) is over
    // `fallen` a run of wall is gone, over `lowered` it's half its height, and below it stands
    wallScale: number;
    fallen: number;
    lowered: number;
    // The share of what stood indoors that's left, burnt (tables, chairs, beds, stalls)
    furnitureKept: number;
    // Ground underlays as they become: each id to a list of ash floors, picked by a second noise
    underlays: (underlay: number, x: number, y: number) => number;
    // Overlays (paving, paths, wooden floors) to darker ones; what isn't listed stays
    overlays: Record<number, number>;
    // Trees, by tiles across: what stands there burnt (a list, picked by place)
    burntTrees: Record<number, number[]>;
    // The share of trees that stand, burnt (the rest burnt to nothing)
    treesKept?: number;
    // Whether a loc is a tree, a plant (burnt off), or something that went with the fire
    // (doors, curtains, torches): by name
    tree: RegExp;
    plant: RegExp;
    gone: RegExp;
    // A city wall stands, burnt, but for breaches: where the walls' noise is over this, the wall's
    // band is down to the ground and open, both faces, walkway and rails gone
    breaches?: number;
    // The share of a city wall's walkway and rails (upstairs, shown from the ground) still up
    wallTopsKept?: number;
    // Where a straight run of wall fell, some of it's still burning: this loc (a wall of fire)
    // stands in its place, for this share of the fallen pieces
    burning?: { wall: number; share: number };
    // What's left standing whatever furnitureKept says: what makes the place itself (a square's
    // fountain, a church's altar, the market's stalls)
    landmark: RegExp;
    // Tiles the conversion leaves alone, in the cut's tiles (a place it's done by hand)
    skip?: (x: number, y: number) => boolean;
};

export type RuinReport = {
    charred: number;
    lowered: number;
    fallen: number;
    burning: number;
    breached: number;
    burntTrees: number;
    removed: number;
};

// The same number for a tile wherever it's asked for, for thinning by share
export function tileHash(x: number, y: number, salt = 0): number {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

// Whether a level 0 tile is under a city wall's walkway (its level 1 tile is shown from the
// ground, scaperune/CLAUDE.md City walls): those walls are a city's, and stand
export function isCityWallTile(grid: TileGrid, x: number, y: number): boolean {
    const level1 = grid.levels[1];
    return (level1.flags[x + y * grid.sizeX] & TILE_SHOWN) !== 0;
}

export function ruinGrid(
    grid: TileGrid,
    locs: (id: number) => LocInfo,
    rules: RuinRules,
): RuinReport {
    const { sizeX, sizeY } = grid;
    const report: RuinReport = {
        charred: 0,
        lowered: 0,
        fallen: 0,
        burning: 0,
        breached: 0,
        burntTrees: 0,
        removed: 0,
    };
    const walls = createNoise(rules.seed, 2);
    const skip = rules.skip ?? (() => false);
    // The ground: ash, and darker paving
    const level0 = grid.levels[0];
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            if (skip(x, y)) {
                continue;
            }
            const i = x + y * sizeX;
            if (level0.underlays[i]) {
                level0.underlays[i] = rules.underlays(level0.underlays[i], x, y);
            }
            const overlay = rules.overlays[level0.overlays[i]];
            if (overlay !== undefined) {
                level0.overlays[i] = overlay;
            }
        }
    }
    // Upstairs is gone but for a city wall's walkway, which is shown from the ground, and a
    // bridge's deck (a bridge is its level 1, brought down)
    const bridged = (i: number) => (grid.levels[1].flags[i] & TILE_BRIDGE) !== 0;
    for (let level = 1; level < LEVELS; level++) {
        const tiles = grid.levels[level];
        for (let i = 0; i < sizeX * sizeY; i++) {
            if ((tiles.flags[i] & TILE_SHOWN) === 0 && !(level === 1 && bridged(i))) {
                tiles.overlays[i] = tiles.underlays[i] = 0;
            }
        }
    }
    // Breaches in a city wall: its band's tiles where the noise says, down and open
    const breach = new Uint8Array(sizeX * sizeY);
    if (rules.breaches !== undefined) {
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                const i = x + y * sizeX;
                const n = walls(x / rules.wallScale, y / rules.wallScale);
                if (!skip(x, y) && isCityWallTile(grid, x, y) && n > rules.breaches) {
                    breach[i] = 1;
                    report.breached++;
                    grid.levels[1].flags[i] &= ~TILE_SHOWN;
                    level0.flags[i] &= ~TILE_BLOCKED;
                }
            }
        }
    }
    const out: PlacedLoc[] = [];
    for (const loc of grid.locs) {
        if (breach[loc.x + loc.y * sizeX]) {
            report.removed++;
            continue;
        }
        if (skip(loc.x, loc.y)) {
            out.push(loc);
            continue;
        }
        const kept = ruinLoc(grid, loc, locs, rules, walls, report);
        if (kept) {
            out.push(kept);
        }
    }
    grid.locs = out;
    return report;
}

function ruinLoc(
    grid: TileGrid,
    loc: PlacedLoc,
    locs: (id: number) => LocInfo,
    rules: RuinRules,
    walls: (x: number, y: number) => number,
    report: RuinReport,
): PlacedLoc | undefined {
    const i = loc.x + loc.y * grid.sizeX;
    const removed = () => {
        report.removed++;
        return undefined;
    };
    const charred = (id = loc.id): PlacedLoc => {
        report.charred++;
        return { ...loc, id: getCharredLoc(id) };
    };
    if (loc.level > 0) {
        // A city wall's walkway and rails, seen from the ground; the rest of upstairs is gone
        // A bridge's deck keeps its walls and rails, burnt; what stood on it in the way is gone,
        // so it's still a way across
        if (loc.level === 1 && (grid.levels[1].flags[i] & TILE_BRIDGE) !== 0) {
            // (the Grand Exchange's pillars and booths among it)
            const blocks = locs(loc.id).clipType !== 0 && loc.type >= 9;
            return isRoof(loc.type) || blocks || loc.type === LOC_FLOOR_DECORATION
                ? removed()
                : charred();
        }
        const shown = (grid.levels[loc.level].flags[i] & TILE_SHOWN) !== 0;
        const kept = tileHash(loc.x, loc.y, loc.level + 11) < (rules.wallTopsKept ?? 1);
        return shown && kept && WALL_TYPES.has(loc.type) ? charred() : removed();
    }
    if (loc.type === LOC_FLOOR_DECORATION || WALL_DECORATIONS.has(loc.type) || isRoof(loc.type)) {
        return removed();
    }
    const info = locs(loc.id);
    const name = info.name ?? "";
    if (rules.gone.test(name) || rules.plant.test(name)) {
        return removed();
    }
    if (WALL_TYPES.has(loc.type)) {
        if (isCityWallTile(grid, loc.x, loc.y)) {
            return charred();
        }
        const n = walls(loc.x / rules.wallScale, loc.y / rules.wallScale);
        if (n > rules.fallen) {
            const burning = rules.burning;
            if (burning && loc.type === 0 && tileHash(loc.x, loc.y, 7) < burning.share) {
                report.burning++;
                return { ...loc, id: burning.wall };
            }
            report.fallen++;
            return undefined;
        }
        if (n > rules.lowered) {
            report.lowered++;
            return { ...loc, id: getLoweredLoc(loc.id) };
        }
        return charred();
    }
    if (loc.type === LOC_NORMAL || loc.type === LOC_DIAGONAL) {
        if (rules.tree.test(name)) {
            if (tileHash(loc.x, loc.y, 8) >= (rules.treesKept ?? 1)) {
                return removed();
            }
            const size = Math.max(info.sizeX, info.sizeY);
            const sizes = Object.keys(rules.burntTrees)
                .map(Number)
                .sort((a, b) => b - a);
            const fits = sizes.find((s) => s <= size) ?? sizes[sizes.length - 1];
            const list = rules.burntTrees[fits];
            report.burntTrees++;
            return {
                ...loc,
                id: list[Math.floor(tileHash(loc.x, loc.y, 3) * list.length)],
                type: LOC_NORMAL,
            };
        }
        // Indoors, some of what stood there went with the fire
        if (
            name !== "null" &&
            name !== "" &&
            !rules.landmark.test(name) &&
            tileHash(loc.x, loc.y, 5) >= rules.furnitureKept
        ) {
            return removed();
        }
        return charred();
    }
    return charred();
}
