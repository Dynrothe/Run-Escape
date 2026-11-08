import { getCharredLoc } from "../../rs/config/loctype/LocOverrides";
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
// every building's walls charred, some of them fallen or broken down, its roof, doors and
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
    // `fallen` a run of wall is gone, over `broken` it's broken down (`crumbled`), and below it
    // stands
    wallScale: number;
    fallen: number;
    broken: number;
    // What a broken wall is: the cache's own broken walls (the Wilderness's ruins), by loc type
    // (0 straight, 1 and 3 corner posts, 2 a corner, 9 diagonal). `high` (broken off near the top)
    // where the noise is under halfway from `broken` to `fallen`, `low` (a stub) over it. A type
    // with neither falls. `mirrors`: a straight broken wall that's whole at one end and steps down
    // to the other (whole at the end its rotation turns north to, east at 1), to its mirror. Along
    // a wall, a run of them is turned so every whole end meets the wall standing beside the run or
    // another's whole end, as the Wilderness's ruins are laid: never open ground, a stub or a low
    // end (pairBroken). One that has neither is a stub (`low[0]`). A corner of it needs nothing:
    // its own model (14623's 14788) has both whole ends at the corner, against each other.
    crumbled: {
        high: Partial<Record<number, number>>;
        low: Partial<Record<number, number>>;
        mirrors?: Record<number, number>;
    };
    // Stones a fallen straight wall left along where it stood (a floor decoration that blocks
    // nothing, turned as the wall was), for this share of them
    fallenStones?: { ids: number[]; share: number };
    // The share of what stood indoors that's left, burnt (tables, chairs, beds, stalls)
    furnitureKept: number;
    // Ground underlays as they become: each id to a list of ash floors, picked by a second noise
    underlays: (underlay: number, x: number, y: number) => number;
    // Overlays (paving, paths, wooden floors) to darker ones; what isn't listed stays
    overlays: Record<number, number>;
    // What a walkway's or a bridge's deck is paved with, burnt as dark as the walls it's on (pale
    // paving up there reads as a white path); its own overlay, through `overlays`, if unset
    walkways?: number;
    // Trees, by tiles across: what stands there burnt (a list, picked by place)
    burntTrees: Record<number, number[]>;
    // The share of trees that stand, burnt (the rest burnt to nothing)
    treesKept?: number;
    // Whether a loc is a tree, a plant (burnt off), or something that went with the fire
    // (doors, curtains, torches): by name, and plants with no name (a rose bush, a potted
    // palm) by id
    tree: RegExp;
    plant: RegExp;
    plants?: number[];
    gone: RegExp;
    // A city wall stands, burnt, but for breaches: where the walls' noise is over this, the wall's
    // band is down to the ground and open, both faces, walkway and rails gone
    breaches?: number;
    // A breach's broken ends: where a run of a wall's face came down, its ends are jagged (`walls`,
    // a straight wall loc, turned as the face was, whole at one end and stepping down to the other)
    // with `bricks` fallen in front of them (blocking nothing). A jagged end's whole end is against
    // the wall still standing beside it, and where no straight wall stands beside it (a corner came
    // down too) two stand back to back, whole ends together. A run too short to leave a way
    // through between them gets the bricks alone. Each comes in a mirrored pair: the first whole at
    // the end its rotation turns north to (east at 1), the second at the other, each with the
    // bricks that fell from it.
    breachEnds?: { walls: [number, number]; bricks: [number, number] };
    // The share of a city wall's walkway and rails (upstairs, shown from the ground) still up
    wallTopsKept?: number;
    // Where a straight run of wall fell, some of it's still burning: this loc (a wall of fire)
    // stands in its place, for this share of the fallen pieces
    burning?: { wall: number; share: number };
    // What's left standing whatever furnitureKept says: what makes the place itself (a square's
    // fountain, a church's altar, the market's stalls)
    landmark: RegExp;
    // Floor decorations that stay, burnt, where the rest go: steps, which the ground under them
    // climbs (a palace's front steps)
    steps?: number[];
    // What rests on the walls round it (a gate's lintel, the deck over a gateway): gone where a
    // wall next to it fell or broke, as it would float
    tops?: number[];
    // Tiles the conversion leaves alone, in the cut's tiles (a place it's done by hand)
    skip?: (x: number, y: number) => boolean;
};

export type RuinReport = {
    charred: number;
    broken: number;
    fallen: number;
    burning: number;
    breached: number;
    burntTrees: number;
    rubble: number;
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
        broken: 0,
        fallen: 0,
        burning: 0,
        breached: 0,
        burntTrees: 0,
        rubble: 0,
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
            // Ground that showed nothing (the hidden overlay, under walls that may fall) shows ash
            if (level0.overlays[i] === 0 && level0.underlays[i] === 0) {
                level0.underlays[i] = rules.underlays(1, x, y);
                level0.shapes[i] = 0;
            }
        }
    }
    // Upstairs is gone but for a city wall's walkway, which is shown from the ground, and a
    // bridge's deck (a bridge is its level 1, brought down); their paving's burnt (`walkways`)
    const bridged = (i: number) => (grid.levels[1].flags[i] & TILE_BRIDGE) !== 0;
    for (let level = 1; level < LEVELS; level++) {
        const tiles = grid.levels[level];
        for (let i = 0; i < sizeX * sizeY; i++) {
            if ((tiles.flags[i] & TILE_SHOWN) === 0 && !(level === 1 && bridged(i))) {
                tiles.overlays[i] = tiles.underlays[i] = 0;
            } else if (tiles.overlays[i] !== 0) {
                tiles.overlays[i] =
                    rules.walkways ?? rules.overlays[tiles.overlays[i]] ?? tiles.overlays[i];
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
                    // Its ground is ash like the rest, where the band had none to show
                    level0.overlays[i] = 0;
                    level0.shapes[i] = 0;
                    level0.underlays[i] = rules.underlays(level0.underlays[i] || 1, x, y);
                }
            }
        }
    }
    const out: PlacedLoc[] = [];
    const down = new Uint8Array(sizeX * sizeY);
    // The breaches' faces, for their broken ends
    const fell: PlacedLoc[] = [];
    // Where a wall stands whole (charred as it was), level by level, for what stands on it
    const whole = Array.from({ length: LEVELS }, () => new Uint8Array(sizeX * sizeY));
    // Straight walls standing whole on the ground, by tile and rotation, for broken ends to meet
    const straight = new Set<string>();
    for (const loc of grid.locs) {
        if (breach[loc.x + loc.y * sizeX]) {
            if (loc.level === 0 && loc.type === 0) {
                fell.push(loc);
            }
            report.removed++;
            continue;
        }
        if (skip(loc.x, loc.y)) {
            out.push(loc);
            if (loc.level === 0 && loc.type === 0) {
                straight.add(wallKey(loc.x, loc.y, loc.rotation));
            }
            continue;
        }
        const kept = ruinLoc(grid, loc, locs, rules, walls, report, out);
        if (kept) {
            out.push(kept);
        }
        // Where a wall's down or broken, for what rested on it
        if (WALL_TYPES.has(loc.type)) {
            if (kept?.id === getCharredLoc(loc.id)) {
                whole[loc.level][loc.x + loc.y * sizeX] = 1;
                if (loc.level === 0 && loc.type === 0) {
                    straight.add(wallKey(loc.x, loc.y, loc.rotation));
                }
            } else if (loc.level === 0) {
                down[loc.x + loc.y * sizeX] = 1;
            }
        }
    }
    unfloat(grid, whole, out, report);
    if (rules.tops) {
        const tops = new Set(rules.tops.map(getCharredLoc));
        const unsupported = (loc: PlacedLoc) => {
            for (let y = Math.max(0, loc.y - 1); y <= Math.min(sizeY - 1, loc.y + 1); y++) {
                for (let x = Math.max(0, loc.x - 1); x <= Math.min(sizeX - 1, loc.x + 1); x++) {
                    if (down[x + y * sizeX]) {
                        return true;
                    }
                }
            }
            return false;
        };
        const before = out.length;
        out.splice(
            0,
            out.length,
            ...out.filter((loc) => {
                if (loc.level === 0 && tops.has(loc.id) && unsupported(loc)) {
                    // Nothing to hold a broken end against now
                    straight.delete(wallKey(loc.x, loc.y, loc.rotation));
                    return false;
                }
                return true;
            }),
        );
        report.removed += before - out.length;
    }
    pairBroken(out, rules.crumbled, straight);
    if (rules.breachEnds) {
        breakEnds(fell, rules.breachEnds, straight, out, report);
    }
    grid.locs = out;
    return report;
}

// Nothing upstairs floats: a shown tile (a walkway's deck) stays only over a wall standing whole
// on the level under it, or over a city wall's solid middle (level 0 blocked) or another shown
// tile, and what's on an upper level (a walkway's rails) only on a tile that's still shown. A
// bridge's deck is its own support.
function unfloat(grid: TileGrid, whole: Uint8Array[], out: PlacedLoc[], report: RuinReport): void {
    const { sizeX, sizeY } = grid;
    const level0 = grid.levels[0];
    const count = sizeX * sizeY;
    const bridged = (i: number) => (grid.levels[1].flags[i] & TILE_BRIDGE) !== 0;
    for (let level = 1; level < LEVELS; level++) {
        const tiles = grid.levels[level];
        const below = grid.levels[level - 1];
        for (let i = 0; i < count; i++) {
            if ((tiles.flags[i] & TILE_SHOWN) === 0 || bridged(i)) {
                continue;
            }
            const held =
                whole[level - 1][i] === 1 ||
                (level === 1
                    ? (level0.flags[i] & TILE_BLOCKED) !== 0
                    : (below.flags[i] & TILE_SHOWN) !== 0);
            if (!held) {
                tiles.flags[i] &= ~TILE_SHOWN;
                tiles.overlays[i] = tiles.underlays[i] = 0;
            }
        }
    }
    const kept = out.filter((loc) => {
        const i = loc.x + loc.y * sizeX;
        return (
            loc.level === 0 ||
            (loc.level === 1 && bridged(i)) ||
            (grid.levels[loc.level].flags[i] & TILE_SHOWN) !== 0
        );
    });
    report.removed += out.length - kept.length;
    out.splice(0, out.length, ...kept);
}

const wallKey = (x: number, y: number, rotation: number) => `${x},${y},${rotation}`;

// A run of straight walls side by side in a line, all turned the same way: along x (turned 1 or
// 3, on their tiles' north or south sides) or along y (0 or 2), from the south or west. `beside`
// says whether a straight wall stands whole on the tile past either end (`to` 1 north or east, -1
// the other way), and `whole` which of a broken wall and its mirror is whole at its end toward
// `to` (0 the one whole at the end its rotation turns north to).
type WallRun = {
    run: PlacedLoc[];
    beside: (to: number) => boolean;
    whole: (to: number) => 0 | 1;
};

function wallRuns(locs: PlacedLoc[], straight: Set<string>): WallRun[] {
    const along = (loc: PlacedLoc) => (loc.rotation & 1) === 1;
    const lines = new Map<string, PlacedLoc[]>();
    for (const loc of locs) {
        const key = along(loc) ? `x${loc.y},${loc.rotation}` : `y${loc.x},${loc.rotation}`;
        const line = lines.get(key) ?? [];
        line.push(loc);
        lines.set(key, line);
    }
    const runs: WallRun[] = [];
    for (const line of lines.values()) {
        const at = (loc: PlacedLoc) => (along(loc) ? loc.x : loc.y);
        line.sort((a, b) => at(a) - at(b));
        let start = 0;
        for (let k = 1; k <= line.length; k++) {
            if (k < line.length && at(line[k]) === at(line[k - 1]) + 1) {
                continue;
            }
            const run = line.slice(start, k);
            start = k;
            const { rotation } = run[0];
            const [dx, dy] = along(run[0]) ? [1, 0] : [0, 1];
            runs.push({
                run,
                beside: (to) => {
                    const tip = to === 1 ? run[run.length - 1] : run[0];
                    return straight.has(wallKey(tip.x + to * dx, tip.y + to * dy, rotation));
                },
                whole: (to) => ((to === 1) === rotation < 2 ? 0 : 1),
            });
        }
    }
    return runs;
}

// A breach's broken ends: along each face that came down, a run of its straight walls in a line,
// each end of the run is jagged with its bricks fallen in front: one jagged end, whole against the
// straight wall standing beside it, or where none does two back to back, whole ends together. A
// run that wouldn't leave a way through between them loses its pairs first, then the rest, and
// gets the bricks alone.
function breakEnds(
    fell: PlacedLoc[],
    ends: NonNullable<RuinRules["breachEnds"]>,
    straight: Set<string>,
    out: PlacedLoc[],
    report: RuinReport,
): void {
    for (const { run, beside, whole } of wallRuns(fell, straight)) {
        // Each end's tip, with the way out of the run from it (1 north or east)
        const tips: [PlacedLoc, number][] = [[run[0], -1]];
        if (run.length > 1) {
            tips.push([run[run.length - 1], 1]);
        }
        const pieces = tips.map(([, to]): number => (beside(to) ? 1 : 2));
        const taken = () => pieces.reduce((sum, n) => sum + n, 0);
        while (taken() > 0 && run.length < taken() + 2) {
            pieces[pieces.indexOf(Math.max(...pieces))] = 0;
        }
        const place = (loc: PlacedLoc, to: number) => {
            out.push({ ...loc, id: ends.walls[whole(to)] });
            out.push({ ...loc, id: ends.bricks[whole(to)], type: LOC_NORMAL });
            report.rubble += 2;
        };
        tips.forEach(([tip, to], i) => {
            if (pieces[i] === 1) {
                place(tip, to);
            } else if (pieces[i] === 2) {
                place(tip, -to);
                place(to === 1 ? run[run.length - 2] : run[1], to);
            } else {
                out.push({ ...tip, id: ends.bricks[whole(to)], type: LOC_NORMAL });
                report.rubble++;
            }
        });
    }
}

// A building's broken walls that are whole at one end (crumbled.mirrors), turned as the
// Wilderness's ruins are laid: along each run of them, the end ones whole against the wall
// standing beside the run, the rest in pairs, whole end to whole end, and one left over a stub,
// with an even number either side of it to pair. So no whole end stands in the open or against a
// low end.
function pairBroken(
    out: PlacedLoc[],
    crumbled: RuinRules["crumbled"],
    straight: Set<string>,
): void {
    const mirrors = crumbled.mirrors;
    if (!mirrors) {
        return;
    }
    const broken = out.filter(
        (loc) => loc.level === 0 && loc.type === 0 && mirrors[loc.id] !== undefined,
    );
    for (const { run, beside, whole } of wallRuns(broken, straight)) {
        // The way each is whole: 1 north or east, -1 the other way, 0 a stub
        const ways = new Array<number>(run.length).fill(0);
        let first = 0;
        let last = run.length - 1;
        if (beside(-1)) {
            ways[first++] = -1;
        }
        if (beside(1) && first <= last) {
            ways[last--] = 1;
        }
        const left = last - first + 1;
        const stub = left % 2 === 1 ? first + 2 * Math.floor((left - 1) / 4) : -1;
        let opens = true;
        for (let i = first; i <= last; i++) {
            if (i !== stub) {
                ways[i] = opens ? 1 : -1;
                opens = !opens;
            }
        }
        run.forEach((loc, i) => {
            const id = loc.id;
            loc.id =
                ways[i] === 0 ? (crumbled.low[0] ?? id) : whole(ways[i]) === 0 ? id : mirrors[id];
        });
    }
}

function ruinLoc(
    grid: TileGrid,
    loc: PlacedLoc,
    locs: (id: number) => LocInfo,
    rules: RuinRules,
    walls: (x: number, y: number) => number,
    report: RuinReport,
    out: PlacedLoc[],
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
    if (loc.type === LOC_FLOOR_DECORATION && rules.steps?.includes(loc.id)) {
        return charred();
    }
    if (loc.type === LOC_FLOOR_DECORATION || WALL_DECORATIONS.has(loc.type) || isRoof(loc.type)) {
        return removed();
    }
    const info = locs(loc.id);
    // A loc that changes with a var is what it shows (a farming patch's weeds, a STASH's bush)
    const shown = info.shows !== undefined && info.shows !== -1 ? locs(info.shows) : info;
    const name = shown.name ?? "";
    if (rules.gone.test(name) || rules.plant.test(name) || rules.plants?.includes(loc.id)) {
        return removed();
    }
    if (WALL_TYPES.has(loc.type)) {
        if (isCityWallTile(grid, loc.x, loc.y)) {
            return charred();
        }
        const n = walls(loc.x / rules.wallScale, loc.y / rules.wallScale);
        const { high, low } = rules.crumbled;
        const crumbled =
            n > (rules.broken + rules.fallen) / 2
                ? (low[loc.type] ?? high[loc.type])
                : (high[loc.type] ?? low[loc.type]);
        if (n > rules.fallen || (n > rules.broken && crumbled === undefined)) {
            const burning = rules.burning;
            if (burning && loc.type === 0 && tileHash(loc.x, loc.y, 7) < burning.share) {
                report.burning++;
                return { ...loc, id: burning.wall };
            }
            // Its stones where it stood
            const stones = rules.fallenStones;
            if (stones && loc.type === 0 && tileHash(loc.x, loc.y, 12) < stones.share) {
                const id = stones.ids[Math.floor(tileHash(loc.x, loc.y, 13) * stones.ids.length)];
                out.push({ ...loc, id, type: LOC_FLOOR_DECORATION });
                report.rubble++;
            }
            report.fallen++;
            return undefined;
        }
        if (crumbled !== undefined && n > rules.broken) {
            report.broken++;
            return { ...loc, id: crumbled };
        }
        return charred();
    }
    if (loc.type === LOC_NORMAL || loc.type === LOC_DIAGONAL) {
        if (rules.tree.test(name)) {
            if (tileHash(loc.x, loc.y, 8) >= (rules.treesKept ?? 1)) {
                return removed();
            }
            const size = Math.max(shown.sizeX, shown.sizeY);
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
