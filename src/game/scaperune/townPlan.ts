import { Exit } from "./building";
import {
    Build,
    LOC_NORMAL,
    LOC_WALL,
    SPAWN_CLEAR,
    WALL_EAST,
    WALL_NORTH,
    WALL_SOUTH,
    WALL_WEST,
    smoothstep,
} from "./mapBuild";
import { createRng } from "./noise";
import { Point } from "./paths";
import { getBuildingKind } from "./prefabs";
import { Plot } from "./roadGrades";
import { RoadNetwork } from "./roads";
import { KIT_FENCES, PlacedBuilding, markOffLimits, pinPlot } from "./settlements";

// Towns laid out from the middle, as real ones are: a paved square with something in it, streets
// out of that, and buildings facing them a few tiles apart, the biggest on the square. Past the
// paving it goes organic: settlements.ts's scatter fills in, and trees take over from buildings
// over a ring of ground. See the design research, section 6.

export type TownKind = "market" | "axis" | "hamlet";

type KindDef = {
    // The square, tiles across, and how many sides have a street
    squareX: number;
    squareY: number;
    streets: number;
    streetHalf: number;
    paved: boolean;
};

const KINDS: Record<TownKind, KindDef> = {
    // Hosidius: a square with a well and stalls, and a street out of each side
    market: { squareX: 19, squareY: 15, streets: 4, streetHalf: 3.5, paved: true },
    // Shayzien: one long paved way, with a small square on it
    axis: { squareX: 11, squareY: 9, streets: 2, streetHalf: 3.5, paved: true },
    // Most places: a green with a well, and a lane
    hamlet: { squareX: 9, squareY: 9, streets: 2, streetHalf: 2, paved: false },
};

export type PlannedTown = {
    kind: TownKind;
    // Which of the map's towns it is
    town: number;
    // The square, as tile corners
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    height: number;
    // How far out from its middle streets run
    reach: number;
};

// How many buildings make a market, and an axis
const MARKET_BUILDINGS = 10;
const AXIS_BUILDINGS = 5;

const TOWN_PLAN_SEED = 410;

// Tiles from the centre of a town spots are looked for its square
const SQUARE_SEARCH = 20;
const SQUARE_SEARCH_STEP = 3;

// How far the ground under a town can be off its height
const TOWN_RISE = 20;

const SHORTEST_STREET = 10;

// Tiles from a street's edge to the walls along it, past its half width
const WALL_OFF_STREET = 0.5;

// Gaps between buildings along a street: alleys, and a bit more
const LEAST_GAP = 3;
const MOST_GAP = 5;

// Tiles past a building's wall that have to have no other building's
const WALL_CLEAR = 2;

// Tiles between a plot and water, so that the ground can get down to it
const WATER_CLEAR = 6;

const MAX_PLOT_RISE = 18;

// A town's paved core, as a share of its reach
const CORE_SHARE = 0.65;

// Tiles past a town's streets over which trees come back, and how many ground a yard takes
const FADE_TILES = 32;
const YARD_DEEP = 5;
const YARD_GATE = 2;
const LEAST_YARDS = 0.4;

// How far a line of buildings on a square can run past its corner
const OVER_CORNER = 5;

const PER_CHURCH = 12;

const WELL = 884;
const STALLS = [634, 11729, 11730, 634];

// What a square has in it, for the palette
export const SQUARE_LOCS = [WELL, ...STALLS];

// A line that buildings stand along: walls on the line, going out from it
type Frontage = {
    x: number;
    y: number;
    stepX: number;
    stepY: number;
    length: number;
    outX: number;
    outY: number;
    along: number;
    onSquare: boolean;
    done: boolean;
};

type Street = { points: Point[]; end: Point; length: number; wayX: number; wayY: number };

// Whether a band of tiles across a street's way can be built on
function canPave(
    build: Build,
    roads: RoadNetwork,
    water: Uint8Array,
    x: number,
    y: number,
    height: number,
): boolean {
    const { ground, cliffs, mainland, terrain, arena } = build;
    const inset = 3;
    if (
        x < arena.x0 + inset ||
        y < arena.y0 + inset ||
        x > arena.x1 - inset ||
        y > arena.y1 - inset
    ) {
        return false;
    }
    const i = ground.tile(x, y);
    return (
        !water[i] &&
        !cliffs[i] &&
        mainland[i] !== 0 &&
        !roads.bridgeZone[i] &&
        !ground.footprint[i] &&
        Math.abs(terrain.getHeight(x, y) - height) <= TOWN_RISE
    );
}

function findSquare(
    build: Build,
    roads: RoadNetwork,
    water: Uint8Array,
    middle: Point,
    def: KindDef,
): Omit<PlannedTown, "kind" | "reach" | "town"> | undefined {
    const { terrain, ground, spawn } = build;
    const fits = (x0: number, y0: number) => {
        const { min, max } = terrain.getRange(x0, y0, def.squareX, def.squareY);
        const height = Math.round((min + max) / 2);
        if (max - min > TOWN_RISE) {
            return undefined;
        }
        for (let y = y0 - 1; y <= y0 + def.squareY; y++) {
            for (let x = x0 - 1; x <= x0 + def.squareX; x++) {
                if (
                    !canPave(build, roads, water, x, y, height) ||
                    ground.reserved[ground.tile(x, y)] ||
                    Math.hypot(x - spawn.x, y - spawn.y) <= SPAWN_CLEAR
                ) {
                    return undefined;
                }
            }
        }
        return height;
    };
    for (let reach = 0; reach <= SQUARE_SEARCH; reach += SQUARE_SEARCH_STEP) {
        for (let turn = 0; turn < (reach === 0 ? 1 : 8); turn++) {
            const angle = (turn / 8) * Math.PI * 2;
            const x0 = Math.round(middle.x + Math.cos(angle) * reach - def.squareX / 2);
            const y0 = Math.round(middle.y + Math.sin(angle) * reach - def.squareY / 2);
            const height = fits(x0, y0);
            if (height !== undefined) {
                return { x0, y0, x1: x0 + def.squareX, y1: y0 + def.squareY, height };
            }
        }
    }
    return undefined;
}

// A street out of the middle of a side of a square, for as far as the ground lets it
function walkStreet(
    build: Build,
    roads: RoadNetwork,
    water: Uint8Array,
    from: Point,
    wayX: number,
    wayY: number,
    longest: number,
    def: KindDef,
    height: number,
): Street {
    const across = Math.ceil(def.streetHalf + WALL_OFF_STREET);
    let length = 0;
    for (let step = 1; step <= longest; step++) {
        const x = from.x + wayX * step;
        const y = from.y + wayY * step;
        let free = true;
        for (let side = -across; side <= across; side++) {
            free &&= canPave(build, roads, water, x + wayY * side, y + wayX * side, height);
        }
        if (!free) {
            break;
        }
        length = step;
    }
    const points: Point[] = [];
    for (let step = 0; step <= length; step++) {
        points.push({ x: from.x + wayX * step, y: from.y + wayY * step });
    }
    return { points, end: points[points.length - 1], length, wayX, wayY };
}

// Whether a building's rectangle can stand beside a street: the street's own tiles don't count
function fitsPlot(
    build: Build,
    water: Uint8Array,
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
    height: number,
    squares: Set<Plot>,
): boolean {
    const { settings, ground, cliffs, mainland, terrain, spawn, toEdge, plots } = build;
    const inset = settings.boundary === "sea" ? 3 : settings.boundaryDepth + 3;
    if (Math.min(toEdge(x, y), toEdge(x + sizeX, y + sizeY)) < inset) {
        return false;
    }
    for (let ty = y - WALL_CLEAR; ty < y + sizeY + WALL_CLEAR; ty++) {
        for (let tx = x - WALL_CLEAR; tx < x + sizeX + WALL_CLEAR; tx++) {
            if (!ground.inside(tx, ty)) {
                return false;
            }
            const i = ground.tile(tx, ty);
            const inRect = tx >= x && ty >= y && tx < x + sizeX && ty < y + sizeY;
            if (
                ground.footprint[i] ||
                water[i] ||
                cliffs[i] ||
                !mainland[i] ||
                (inRect && ground.reserved[i]) ||
                Math.hypot(tx - spawn.x, ty - spawn.y) <= SPAWN_CLEAR
            ) {
                return false;
            }
        }
    }
    for (const plot of plots) {
        if (
            !squares.has(plot) &&
            x < plot.x + plot.sizeX + LEAST_GAP &&
            plot.x < x + sizeX + LEAST_GAP &&
            y < plot.y + plot.sizeY + LEAST_GAP &&
            plot.y < y + sizeY + LEAST_GAP
        ) {
            return false;
        }
    }
    const { min, max } = terrain.getRange(x - 1, y - 1, sizeX + 2, sizeY + 2);
    if (Math.max(max - height, height - min) > MAX_PLOT_RISE) {
        return false;
    }
    for (let ty = y - WATER_CLEAR; ty < y + sizeY + WATER_CLEAR; ty++) {
        for (let tx = x - WATER_CLEAR; tx < x + sizeX + WATER_CLEAR; tx++) {
            if (ground.inside(tx, ty) && water[ground.tile(tx, ty)]) {
                return false;
            }
        }
    }
    return true;
}

// A fenced yard behind a building, open at a gate in its far side. A real farm town has 5 to
// 8.5 tiles of fence per 100 tiles of ground, in yards, pens and fields.
function placeBackYard(build: Build, plot: PlacedBuilding, out: Frontage, family: string): void {
    const { ground, biomeAt } = build;
    const { x, y, sizeX, sizeY } = plot;
    // The yard's rectangle, off the wall that faces away from the street
    const x0 = out.outX > 0 ? x + sizeX : out.outX < 0 ? x - YARD_DEEP : x;
    const y0 = out.outY > 0 ? y + sizeY : out.outY < 0 ? y - YARD_DEEP : y;
    const x1 = (out.outX !== 0 ? x0 + YARD_DEEP : x + sizeX) - 1;
    const y1 = (out.outY !== 0 ? y0 + YARD_DEEP : y + sizeY) - 1;
    if (!ground.isClear(x0, y0, x1 - x0 + 1, y1 - y0 + 1)) {
        return;
    }
    const middleX = (x0 + x1) >> 1;
    const middleY = (y0 + y1) >> 1;
    const id = KIT_FENCES[family] || biomeAt(middleX, middleY).fence;
    const post = (tx: number, ty: number, rotation: number) =>
        ground.grid.locs.push({ id, type: LOC_WALL, rotation, level: 0, x: tx, y: ty });
    const gate = (at: number, middle: number) => Math.abs(at - middle) < YARD_GATE;
    for (let tx = x0; tx <= x1; tx++) {
        if (out.outY >= 0 && !(out.outY > 0 && gate(tx, middleX))) {
            post(tx, y1, WALL_NORTH);
        }
        if (out.outY <= 0 && !(out.outY < 0 && gate(tx, middleX))) {
            post(tx, y0, WALL_SOUTH);
        }
    }
    for (let ty = y0; ty <= y1; ty++) {
        if (out.outX >= 0 && !(out.outX > 0 && gate(ty, middleY))) {
            post(x1, ty, WALL_EAST);
        }
        if (out.outX <= 0 && !(out.outX < 0 && gate(ty, middleY))) {
            post(x0, ty, WALL_WEST);
        }
    }
}

export type TownParts = {
    // The names a town's buildings can be, its family's first
    names: string[];
    wanted: number;
    town: number;
    family: string;
};

// Lays a town out round a spot, and returns the buildings it placed, facing its streets.
// Nothing if there's no room.
export function planTown(
    build: Build,
    roads: RoadNetwork,
    water: Uint8Array,
    middle: Point,
    parts: TownParts,
): PlacedBuilding[] {
    const { settings, ground, kit, spawn } = build;
    const { names, wanted, town, family } = parts;
    const roll = createRng(settings.seed + TOWN_PLAN_SEED + town);
    const byKind: TownKind[] =
        wanted >= MARKET_BUILDINGS
            ? [roll() < 0.6 ? "market" : "axis", "axis", "hamlet"]
            : wanted >= AXIS_BUILDINGS
              ? ["axis", "hamlet"]
              : ["hamlet"];
    let kind: TownKind = "hamlet";
    let square: ReturnType<typeof findSquare>;
    for (const next of byKind) {
        kind = next;
        square = findSquare(build, roads, water, middle, KINDS[next]);
        if (square) {
            break;
        }
    }
    if (!square) {
        return [];
    }
    const def = KINDS[kind];
    const { x0, y0, x1, y1, height } = square;
    const cx = (x0 + x1) >> 1;
    const cy = (y0 + y1) >> 1;
    const longest = Math.round(settings.townSize * 0.9);

    // Every way a street could go, then the ones with the most ground
    const ways = [
        { from: { x: cx, y: y1 }, wayX: 0, wayY: 1 },
        { from: { x: cx, y: y0 }, wayX: 0, wayY: -1 },
        { from: { x: x1, y: cy }, wayX: 1, wayY: 0 },
        { from: { x: x0, y: cy }, wayX: -1, wayY: 0 },
    ];
    const streets = ways
        .map(({ from, wayX, wayY }) =>
            walkStreet(build, roads, water, from, wayX, wayY, longest, def, height),
        )
        .filter((street) => street.length >= SHORTEST_STREET);
    streets.sort((a, b) => b.length - a.length);
    let kept = streets.slice(0, def.streets);
    // An axis is one line
    if (kind !== "market" && kept.length > 1) {
        const first = kept[0];
        const opposite = streets.find(
            (street) => street.wayX === -first.wayX && street.wayY === -first.wayY,
        );
        kept = opposite ? [first, opposite] : [first];
    }

    // The way in, from the end of the street nearest the rest of the roads
    if (kept.length > 0 && settings.roads > 0) {
        const near = [...kept].sort(
            (a, b) =>
                Math.hypot(a.end.x - spawn.x, a.end.y - spawn.y) -
                Math.hypot(b.end.x - spawn.x, b.end.y - spawn.y),
        )[0];
        const lead = near.points.slice(-3);
        const from = { x: Math.floor(near.end.x), y: Math.floor(near.end.y) };
        if (ground.inside(from.x, from.y) && lead.length >= 2) {
            const route = roads.findRoute(from, lead);
            if (route.length > 0) {
                roads.lay(from, lead, route, roads.halfWidth, height);
            }
        }
    }

    // The ground, the square and the streets
    pinPlot(build, x0, y0, x1 - x0, y1 - y0, height);
    const squares = new Set<Plot>(build.plots.filter((plot) => plot.x === x0 && plot.y === y0));
    roads.addRect(x0, y0, x1, y1);
    for (const street of kept) {
        roads.addStreet(street.points, def.streetHalf, height);
    }

    // What's in the middle
    const placeAt = (id: number, x: number, y: number, rotation = 0) =>
        ground.place({ id, type: LOC_NORMAL, rotation, level: 0, x, y }, 2, 2);
    placeAt(WELL, cx - 1, cy - 1);
    if (kind === "market") {
        placeAt(STALLS[0], cx - 7, cy - 1);
        placeAt(STALLS[1], cx + 5, cy - 1, 2);
        placeAt(STALLS[2], cx - 1, cy - 6, 1);
        placeAt(STALLS[3], cx - 1, cy + 4, 3);
    }

    // Lines to build along: round the square, then down both sides of each street
    const setBack = Math.ceil(def.streetHalf + WALL_OFF_STREET);
    const hasStreet = (wayX: number, wayY: number) =>
        kept.some((street) => street.wayX === wayX && street.wayY === wayY);
    const line = (
        x: number,
        y: number,
        stepX: number,
        stepY: number,
        length: number,
        outX: number,
        outY: number,
        onSquare: boolean,
    ): Frontage => ({
        x,
        y,
        stepX,
        stepY,
        length,
        outX,
        outY,
        along: Math.floor(roll() * 3),
        onSquare,
        done: false,
    });
    const sides: Frontage[] = [];
    const squareSide = (
        x: number,
        y: number,
        stepX: number,
        stepY: number,
        length: number,
        outX: number,
        outY: number,
    ) => {
        // Two lengths, if a street leaves from its middle, running past the square's corners
        // so that a building's room to face it
        const near = (length >> 1) - setBack;
        const over = OVER_CORNER;
        if (hasStreet(outX, outY)) {
            const far = length - near;
            const whole = near + over;
            sides.push(
                line(x - stepX * over, y - stepY * over, stepX, stepY, whole, outX, outY, true),
                line(x + stepX * far, y + stepY * far, stepX, stepY, whole, outX, outY, true),
            );
        } else {
            sides.push(line(x, y, stepX, stepY, length, outX, outY, true));
        }
    };
    squareSide(x0, y1, 1, 0, x1 - x0, 0, 1);
    squareSide(x0, y0, 1, 0, x1 - x0, 0, -1);
    squareSide(x1, y0, 0, 1, y1 - y0, 1, 0);
    squareSide(x0, y0, 0, 1, y1 - y0, -1, 0);
    const front: Frontage[] = [];
    for (const street of kept) {
        const { points, length, wayX, wayY } = street;
        const start = points[0];
        for (const side of [-1, 1]) {
            const outX = wayY * side;
            const outY = wayX * side;
            // Lines run east or north, so one that goes out west or south starts at its far end
            const x = start.x + outX * setBack + (wayX < 0 ? -length : 0);
            const y = start.y + outY * setBack + (wayY < 0 ? -length : 0);
            front.push(line(x, y, Math.abs(wayX), Math.abs(wayY), length, outX, outY, false));
        }
    }

    // Buildings: the biggest on the square, then outward in turn along each line
    const placed: PlacedBuilding[] = [];
    const biggest = [...names].sort((a, b) => {
        const area = (name: string) => {
            const { sizeX, sizeY } = kit.get(name, 0).prefab;
            return sizeX * sizeY;
        };
        return area(b) - area(a);
    });
    const yards = Math.max(settings.gardens, LEAST_YARDS);
    const houses = names.some((name) => getBuildingKind(name) !== "church");
    let churches = 0;
    const placeNext = (frontage: Frontage) => {
        // Any order but the same every time: a sort by chance would differ between browsers
        const first = Math.floor(roll() * names.length);
        const choices =
            frontage.onSquare && placed.length === 0
                ? biggest
                : names.map((_, i) => names[(first + i) % names.length]);
        for (const name of choices) {
            // A town has one church to every so many buildings, if the kit has anything else
            const church = getBuildingKind(name) === "church";
            if (church && churches * PER_CHURCH > placed.length && houses) {
                continue;
            }
            for (let turns = 0; turns < 4; turns++) {
                const { prefab, exits } = kit.get(name, turns);
                const door = exits.find(
                    (exit) => exit.outX === -frontage.outX && exit.outY === -frontage.outY,
                );
                const wide = frontage.stepX ? prefab.sizeX : prefab.sizeY;
                if (!door || frontage.along + wide > frontage.length) {
                    continue;
                }
                const atX = frontage.x + frontage.stepX * frontage.along;
                const atY = frontage.y + frontage.stepY * frontage.along;
                const x = frontage.outX < 0 ? atX - prefab.sizeX : atX;
                const y = frontage.outY < 0 ? atY - prefab.sizeY : atY;
                if (!fitsPlot(build, water, x, y, prefab.sizeX, prefab.sizeY, height, squares)) {
                    continue;
                }
                const exit: Exit = { ...door, x: door.x + x, y: door.y + y };
                const road = roads.getNearest(exit.x, exit.y);
                const facing = exit.outX * (road.x - exit.x) + exit.outY * (road.y - exit.y);
                if (facing <= 0) {
                    continue;
                }
                kit.stamp(ground, name, turns, x, y, true);
                pinPlot(build, x, y, prefab.sizeX, prefab.sizeY, height, exit);
                markOffLimits(build, roads, x, y, prefab.sizeX, prefab.sizeY, 1);
                roads.addDoorPath(exit, height);
                if (getBuildingKind(name) === "church") {
                    churches++;
                }
                const plot: PlacedBuilding = {
                    name,
                    x,
                    y,
                    sizeX: prefab.sizeX,
                    sizeY: prefab.sizeY,
                    exit,
                    hasRoad: true,
                    town,
                };
                placed.push(plot);
                if (!frontage.onSquare && roll() < yards) {
                    placeBackYard(build, plot, frontage, family);
                }
                const gap = LEAST_GAP + Math.floor(roll() * (MOST_GAP - LEAST_GAP + 1));
                frontage.along += wide + gap;
                return;
            }
        }
        frontage.along += LEAST_GAP;
        frontage.done = frontage.along >= frontage.length;
    };
    const all = [...sides, ...front];
    while (placed.length < wanted && all.some((frontage) => !frontage.done)) {
        for (const frontage of all) {
            if (!frontage.done && placed.length < wanted) {
                placeNext(frontage);
            }
        }
    }
    const reach = Math.max(...kept.map((street) => street.length), 0) + (x1 - x0) / 2;
    (build.towns ??= []).push({ kind, town, x0, y0, x1, y1, height, reach });
    return placed;
}

// How far along a paved core a tile is, for paving: inside it or not
export function getTownPaving(build: Build, x: number, y: number): boolean {
    for (const { kind, x0, y0, x1, y1, reach } of build.towns ?? []) {
        const core = reach * CORE_SHARE;
        const middleX = (x0 + x1) / 2;
        const middleY = (y0 + y1) / 2;
        if (KINDS[kind].paved && Math.hypot(x - middleX, y - middleY) <= core) {
            return true;
        }
    }
    return false;
}

// How much of a tile's trees and scenery a town leaves: none in its middle, all past its fade.
// Trees take over from buildings over about 32 tiles, and the ground stays as busy.
export function getTownFade(build: Build, x: number, y: number): number {
    let fade = 1;
    for (const { x0, y0, x1, y1, reach } of build.towns ?? []) {
        const distance = Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
        fade = Math.min(fade, smoothstep((distance - reach * CORE_SHARE) / FADE_TILES));
    }
    return fade;
}
