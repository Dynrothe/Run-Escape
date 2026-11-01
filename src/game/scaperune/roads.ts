import { Exit } from "./building";
import { Build, createClimb, forTilesNear, getTouchedTiles, hasRelief, lerp } from "./mapBuild";
import { Noise, createNoise, smoothField } from "./noise";
import { Point, addPathToField, smoothPath } from "./paths";
import { rotatePrefab } from "./prefab";
import {
    BRIDGES,
    BRIDGE_DECK_EAST,
    BRIDGE_DECK_ROW,
    BRIDGE_DECK_WEST,
    BRIDGE_LENGTH,
    loadPrefab,
} from "./prefabs";
import { RESERVE_LANE, RESERVE_PLOT, RESERVE_STREET } from "./reservations";
import { River, getCrossingLine, riverCentre } from "./rivers";
import { RoadLine } from "./roadGrades";
import { getCoveredSides, getOverlayShape } from "./shapes";

// Roads and bridges. How high they run is in roadGrades.ts.

export const BRIDGE_ROAD_HALF_WIDTH = 1.2;

// Tiles along a road from a bridge's width to its own
const ROAD_WIDEN = 6;

// How far past a road's edge its soft underlay runs. The renderer blends underlays over
// 11 tiles, so that's a stain that takes the contrast out of the overlay's edge.
const TRAIL_MARGIN = 0.8;

// How far past a road's edge the square at the spawn reaches
const SPAWN_SQUARE = 1.6;

// Tiles past a road's edge that scatter keeps off
const ROAD_CLEAR_MARGIN = 0.3;

// Tiles past a road's edge, from a tile's middle, that it can paint on. A tile's painted if its
// corner's in, and that's this far from its middle.
const ROAD_PAINT_MARGIN = 0.75;

// Tiles a road that leads nowhere takes to narrow away
const ROAD_TAPER = 7;

// Tiles a street takes to narrow to the road through its gate
const STREET_NARROWS = 5;

// Tiles past a road's end that another road counts as joining it
const ROAD_JOINS = 2.5;

// Tiles a main road stops short of a wall, for the road to its gate to take over. A road that's
// left to fade out has room to, before it gets there.
const WALL_CLEAR = ROAD_TAPER + 1;

// The tightest a road can turn after a straight stretch, in tiles
const ROAD_TURN_RADIUS = 8;

// How far a road runs dead straight off the end of a bridge's stamp, down the middle
// of the gap between its fences and on, before it can curve
const BRIDGE_ROAD_STRAIGHT = 6;

const DOOR_PATH_HALF = 1;

// Rows kept clear either side of a bridge's road
const BRIDGE_ROAD_CLEAR = 4;

// The steepest a road climbs, in height units a tile, and what going over that costs
const ROAD_GRADE = 5;

const ROAD_CLIMB_COST = 6;

// How steep a road can go at a pinch, to meet something, as a share of what's walkable
export const ROAD_STEEPEST = 0.75;

// What a tile of cliff costs a road, for the cutting
const ROAD_CLIFF_COST = 14;

// Tiles either side of a road that are level with it, past its own half width
export const ROAD_SHOULDER = 1.2;

// Passes to even out the ground pinned to roads
export const ROAD_SMOOTHING = 2;

// Points along a main road between places it's routed to, over rough ground, and how far
// they can move to find ground to stand on
const MAIN_ROAD_STEP = 24;

const MAIN_ROAD_SNAP = 8;

// The road system. Everything joins it, so it's laid as things are placed: main roads
// and bridges, then each building's, which is why a building can face a road that's
// there. A road never goes on a building: tiles round them are out of bounds, and any
// smoothing that drifts onto one is undone.
export class RoadNetwork {
    // Road, for others to join. The spawn counts, so that there's something to lead to.
    readonly tiles: Uint8Array;
    readonly halfWidth: number;
    // Keeps roads and fords off buildings: on each tile, how many buildings it's too
    // close to, because zones overlap and a spot that's given up on takes its own off
    readonly offLimits: Uint8Array;
    readonly lines: RoadLine[] = [];
    // Tiles a road wanted, and can't have: a building's in the way. check-maps.ts wants to know.
    readonly clipped: Uint8Array;
    // The line the main road means to take, and bridges' ends, for gates to be where they arrive
    plannedLine: Point[] = [];
    readonly arrivalPoints: Point[] = [];
    // The ends of main roads a wall's stopped
    private readonly cuts: Point[][] = [];
    // Every point of road, to find the nearest. Not the spawn: that's no road.
    private readonly samples: Point[] = [];
    private readonly road: Float32Array;
    private readonly trail: Float32Array;
    private readonly wiggle: Noise;
    private readonly curves: number;
    private readonly climb: (from: number, to: number) => number;

    constructor(
        readonly build: Build,
        readonly water: Uint8Array,
        readonly bridgeZone: Uint8Array,
    ) {
        const { ground, corners, settings, spawn } = build;
        this.tiles = new Uint8Array(ground.sizeX * ground.sizeY);
        this.offLimits = new Uint8Array(this.tiles.length);
        this.clipped = new Uint8Array(this.tiles.length);
        this.halfWidth = settings.roadWidth / 2;
        this.road = new Float32Array(corners.x * corners.y).fill(-4);
        this.trail = new Float32Array(corners.x * corners.y).fill(-4);
        this.wiggle = createNoise(settings.seed + 5, 1);
        this.curves = settings.roadCurviness;
        this.climb = createClimb(build, ROAD_GRADE, ROAD_CLIMB_COST);
        // Everything leads to the spawn, if nothing else
        this.tiles[ground.tile(spawn.x, spawn.y)] = 1;
    }

    // How far from a building a road must keep, past its own edge
    get wallGap(): number {
        return Math.ceil(this.halfWidth) + 1;
    }

    // How far a road runs straight out of a door before it's free to turn
    get doorLead(): number {
        return this.wallGap + 2;
    }

    // The nearest road to a point, or the spawn if there's none yet
    getNearest(x: number, y: number): Point {
        let best = this.build.spawn;
        let bestDistance = Infinity;
        for (const sample of this.samples) {
            const distance = (sample.x - x) ** 2 + (sample.y - y) ** 2;
            if (distance < bestDistance) {
                best = sample;
                bestDistance = distance;
            }
        }
        return best;
    }

    private cost(x: number, y: number): number {
        const { ground } = this.build;
        const i = ground.tile(x, y);
        if (this.tiles[i]) {
            return 0.2;
        }
        if (this.water[i] || ground.reserved[i] || this.offLimits[i]) {
            return Infinity;
        }
        return (
            1 +
            (this.build.cliffs[i] ? ROAD_CLIFF_COST : 0) +
            this.wiggle(x / lerp(24, 7, this.curves), y / lerp(24, 7, this.curves)) *
                this.curves *
                9
        );
    }

    // Whether a lead can go straight out of something, with nothing in its way that's spoken for.
    // It's the one bit of road that isn't routed round things.
    isLeadClear(lead: Point[]): boolean {
        const { ranks } = this.build.ground.claims;
        let clear = true;
        forTilesNear(this.build, lead, this.halfWidth + ROAD_PAINT_MARGIN, (i) => {
            clear &&= !(ranks[i] !== 0 && ranks[i] <= RESERVE_PLOT && ranks[i] !== RESERVE_STREET);
        });
        return clear;
    }

    // Whether a point of road is on a building or a wall or anything that's theirs, or by a
    // bridge's road where nothing's to go. A road coming off a bridge starts out next to that, so
    // it's let off (nearBridge).
    private touchesBuilding(point: Point, nearBridge: boolean): boolean {
        const { ground } = this.build;
        const { ranks } = ground.claims;
        let touches = false;
        forTilesNear(this.build, [point], this.halfWidth + 0.5, (i) => {
            touches ||=
                ground.footprint[i] !== 0 ||
                (ranks[i] !== 0 && ranks[i] <= RESERVE_PLOT && ranks[i] !== RESERVE_STREET) ||
                (!nearBridge && this.bridgeZone[i] !== 0);
        });
        return touches;
    }

    // join says whether others can join it yet: a town's streets wait till it's been joined up
    // itself, so that two towns can't end up on a road of their own
    add(line: RoadLine, width: (point: number) => number, trail: boolean, join = true): void {
        const { ground, corners } = this.build;
        const { claims } = ground;
        const { points } = line;
        addPathToField(this.road, corners.x, corners.y, points, width);
        if (trail) {
            addPathToField(
                this.trail,
                corners.x,
                corners.y,
                points,
                (i) => width(i) + TRAIL_MARGIN,
            );
        }
        this.lines.push(line);
        const clear = this.halfWidth + ROAD_CLEAR_MARGIN;
        forTilesNear(this.build, points, clear, (i) => {
            ground.reserved[i] = 1;
        });
        // What it can paint, which building has to keep off
        const widest = Math.max(width(0), width(points.length - 1));
        forTilesNear(this.build, points, widest + ROAD_PAINT_MARGIN, (i) => {
            claims.markTile(i, RESERVE_LANE);
        });
        // A lead's its door's or bridge's alone: others join past it, not against the wall
        if (join) {
            forTilesNear(this.build, points.slice(line.lead), clear, (i) => {
                this.tiles[i] = 1;
            });
        }
        this.samples.push(...points);
    }

    // A road as smooth as it'll go without drifting onto a building: each stretch that
    // does gets less smoothing, down to none
    private smoothRoad(raw: Point[], pinned: number): Point[] {
        const reach = Math.round(lerp(9, 5, this.curves));
        const clean = (points: Point[], fallback: Point[]) =>
            points.map((point, i) => {
                const touches =
                    i >= pinned && this.touchesBuilding(point, i < pinned + ROAD_TURN_RADIUS);
                return touches ? fallback[i] : point;
            });
        const light = clean(smoothPath(raw, 2, 1, pinned), raw);
        const medium = clean(smoothPath(raw, 4, 3, pinned), light);
        return clean(smoothPath(raw, reach, 7, pinned), medium);
    }

    // The way from a road's start to the rest of the roads: its tiles, or nothing
    findRoute(from: Point, lead: Point[]): number[] {
        const { finder } = this.build;
        const isRoad = (i: number) => this.tiles[i] !== 0;
        const free = (x: number, y: number) => this.cost(x, y);
        const inTurn = getTurningCircles(lead);
        const turning = (x: number, y: number) => (inTurn(x, y) ? Infinity : free(x, y));
        // Somewhere too tight for a wide turn makes do with a sharp one
        const wide = finder.find(from, turning, isRoad, this.climb);
        return wide.length > 0 ? wide : finder.find(from, free, isRoad, this.climb);
    }

    // Lays a road out of something along a route, as findRoute found it. With no route
    // it leads nowhere, and narrows away into the ground.
    lay(
        from: Point,
        lead: Point[],
        route: number[],
        leadHalfWidth: number,
        startHeight: number,
    ): void {
        const { ground, sizeX } = this.build;
        this.tiles[ground.tile(from.x, from.y)] = 1;
        // Found from the far end back
        const onward = route
            .map((i) => ({ x: (i % sizeX) + 0.5, y: Math.floor(i / sizeX) + 0.5 }))
            .reverse();

        const points = this.smoothRoad([...lead, ...onward], lead.length);

        const width = (i: number) =>
            i < lead.length
                ? leadHalfWidth
                : lerp(leadHalfWidth, this.halfWidth, Math.min((i - lead.length) / ROAD_WIDEN, 1));
        const start = startHeight;
        const line = {
            points,
            lead: lead.length,
            halfWidth: this.halfWidth,
            start,
            grade: ROAD_GRADE,
        };
        this.add(line, width, true);
        if (onward.length === 0) {
            this.taper(points, leadHalfWidth);
        }
    }

    // A long line that's to go over rough ground: its way between points along it, where
    // it can be walked and climbed. Each run's a stretch that's joined up.
    private routeThrough(line: Point[], skip: Uint8Array): Point[][] {
        const { ground, sizeX, finder, cliffs } = this.build;
        const free = (x: number, y: number) =>
            skip[ground.tile(x, y)] ? Infinity : this.cost(x, y);
        const isFree = (x: number, y: number) =>
            ground.inside(x, y) && free(x, y) !== Infinity && !cliffs[ground.tile(x, y)];
        // The nearest tile that'll do
        const snap = (point: Point): Point | undefined => {
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            for (let reach = 0; reach <= MAIN_ROAD_SNAP; reach++) {
                for (let ny = y - reach; ny <= y + reach; ny++) {
                    for (let nx = x - reach; nx <= x + reach; nx++) {
                        if (
                            Math.max(Math.abs(nx - x), Math.abs(ny - y)) === reach &&
                            isFree(nx, ny)
                        ) {
                            return { x: nx, y: ny };
                        }
                    }
                }
            }
            return undefined;
        };
        const runs: Point[][] = [];
        let run: Point[] = [];
        let last: Point | undefined;
        const finish = () => {
            if (run.length > 3) {
                runs.push(this.smoothRoad(run, 1));
            }
            run = [];
            last = undefined;
        };
        for (let at = 0; at < line.length; at += MAIN_ROAD_STEP) {
            const next = snap(line[at]);
            if (!next) {
                finish();
                continue;
            }
            if (last) {
                const end = ground.tile(next.x, next.y);
                const route = finder.find(last, free, (i) => i === end, this.climb);
                if (route.length === 0) {
                    finish();
                } else {
                    for (let i = route.length - 1; i >= 0; i--) {
                        run.push({
                            x: (route[i] % sizeX) + 0.5,
                            y: Math.floor(route[i] / sizeX) + 0.5,
                        });
                    }
                }
            }
            last = next;
        }
        finish();
        return runs;
    }

    // Lays a road exactly along a line that's already smooth, for a map that's drawn its own
    addRun(run: Point[]): void {
        const { ground } = this.build;
        this.add(
            { points: run, lead: 0, halfWidth: this.halfWidth, grade: ROAD_GRADE },
            () => this.halfWidth,
            true,
        );
        for (const point of run) {
            this.tiles[ground.tile(Math.floor(point.x), Math.floor(point.y))] = 1;
        }
    }

    // Lays a road along a line, leaving out where it can't go, for others to join
    addMainRoad(line: Point[], skip: Uint8Array): void {
        const { ground, settings } = this.build;
        const lay = (run: Point[]) => {
            this.addRun(run);
            this.cuts.push(run.slice(0, 2).reverse(), run.slice(-2));
        };
        if (hasRelief(settings)) {
            this.routeThrough(line, skip).forEach(lay);
            return;
        }
        let run: Point[] = [];
        const finish = () => {
            if (run.length > 3) {
                lay(run);
            }
            run = [];
        };
        for (const point of line) {
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            if (ground.inside(x, y) && !skip[ground.tile(x, y)]) {
                run.push(point);
            } else {
                finish();
            }
        }
        finish();
    }

    // The ends of main roads a wall stopped that nothing came to join fade out, rather than stop
    // dead
    finishCuts(): void {
        const { towns } = this.build;
        const reach = WALL_CLEAR + 2;
        for (const end of this.cuts) {
            const [before, last] = end;
            const atWall = towns?.some(
                ({ wall }) =>
                    wall &&
                    last.x > wall.x0 - reach &&
                    last.x < wall.x1 + reach &&
                    last.y > wall.y0 - reach &&
                    last.y < wall.y1 + reach,
            );
            const joined = this.lines.some(
                ({ points }) =>
                    points[points.length - 1] !== last &&
                    points[0] !== last &&
                    points.some(({ x, y }) => Math.hypot(x - last.x, y - last.y) < ROAD_JOINS),
            );
            if (atWall && !joined && Math.hypot(last.x - before.x, last.y - before.y) > 0) {
                this.taper(end, this.halfWidth);
            }
        }
    }

    // Runs a road that leads nowhere on past its end, narrowing away to nothing, so that
    // it fades into the ground instead of stopping square
    private taper(line: Point[], halfWidth: number): void {
        const { corners } = this.build;
        const end = line[line.length - 1];
        const before = line[line.length - 2];
        const length = Math.hypot(end.x - before.x, end.y - before.y);
        const wayX = (end.x - before.x) / length;
        const wayY = (end.y - before.y) / length;
        for (let step = 0; step < ROAD_TAPER; step++) {
            const narrow = halfWidth * (1 - (step + 1) / ROAD_TAPER);
            const from = { x: end.x + wayX * step, y: end.y + wayY * step };
            const to = { x: from.x + wayX, y: from.y + wayY };
            addPathToField(this.road, corners.x, corners.y, [from, to], narrow);
            addPathToField(this.trail, corners.x, corners.y, [from, to], narrow + TRAIL_MARGIN);
        }
    }

    // A town's street, straight and as wide as it wants, narrowing at its far end to a gate if it
    // ends at one. Others can join it once its tiles are opened (openTiles).
    addStreet(
        points: Point[],
        halfWidth: number,
        height: number,
        held: number[],
        gateHalfWidth = halfWidth,
    ): void {
        const { ground } = this.build;
        const { claims } = ground;
        const line = { points, lead: 0, halfWidth, start: height, grade: ROAD_GRADE };
        const last = points.length - 1;
        const width = (i: number) =>
            lerp(gateHalfWidth, halfWidth, Math.min((last - i) / STREET_NARROWS, 1));
        this.add(line, width, true, false);
        forTilesNear(this.build, points, halfWidth + ROAD_CLEAR_MARGIN, (i) => {
            claims.takeTile(i, RESERVE_STREET);
            held.push(i);
        });
    }

    // Lets other roads join tiles
    openTiles(tiles: number[]): void {
        for (const i of tiles) {
            this.tiles[i] = 1;
        }
    }

    // A door on a street: a step or two of road, to the street's edge
    addDoorPath(exit: Exit, height: number): void {
        const points = [0, 1, 2].map((step) => ({
            x: exit.x + exit.outX * step,
            y: exit.y + exit.outY * step,
        }));
        const line = {
            points,
            lead: points.length,
            halfWidth: DOOR_PATH_HALF,
            start: height,
            grade: ROAD_GRADE,
        };
        this.add(line, () => DOOR_PATH_HALF, false);
    }

    // A rectangle of road, between tile corners, for a town's square
    addRect(x0: number, y0: number, x1: number, y1: number, held: number[]): void {
        const { ground, corners } = this.build;
        for (let y = y0 - 2; y <= y1 + 2; y++) {
            for (let x = x0 - 2; x <= x1 + 2; x++) {
                const inside = Math.min(x - x0, x1 - x, y - y0, y1 - y) + 0.5;
                const at = x + y * corners.x;
                this.road[at] = Math.max(this.road[at], inside);
                this.trail[at] = Math.max(this.trail[at], inside + TRAIL_MARGIN);
            }
        }
        // It paints half a tile past its edge
        ground.claims.take(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, RESERVE_STREET);
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                held.push(ground.tile(x, y));
            }
        }
    }

    // A round of road, for a town's square
    addSquare(x: number, y: number, radius: number): void {
        const { corners } = this.build;
        const middle = [
            { x, y },
            { x: x + 0.01, y },
        ];
        addPathToField(this.road, corners.x, corners.y, middle, radius);
        addPathToField(this.trail, corners.x, corners.y, middle, radius + TRAIL_MARGIN);
    }

    // paving says which overlay a tile gets, if it isn't the biome's own road
    paint(paving?: (x: number, y: number) => number | undefined): Uint8Array {
        const { ground, sizeX, sizeY, corners, biomeAt } = this.build;
        const skip = new Uint8Array(this.water.length);
        for (let i = 0; i < skip.length; i++) {
            skip[i] = this.water[i] | ground.footprint[i];
        }
        // Roads end in points, so where they meet at the spawn is a little square
        const { spawn } = this.build;
        const reach = this.halfWidth + SPAWN_SQUARE;
        let room = true;
        forTilesNear(this.build, [spawn], reach + 2, (i) => {
            room &&= this.bridgeZone[i] === 0;
        });
        if (this.lines.length > 0 && room) {
            this.addSquare(spawn.x, spawn.y, reach);
        }
        const band = getTouchedTiles(this.trail, sizeX, sizeY);
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                const i = ground.tile(x, y);
                if (band[i] && !skip[i]) {
                    ground.level0.underlays[i] = biomeAt(x, y).trail;
                }
            }
        }
        const field = smoothField(this.road, corners.x, corners.y, 1);
        const overlay = (x: number, y: number) => paving?.(x, y) ?? biomeAt(x, y).road;
        this.findClipped(field);
        return ground.paintField(field, overlay, false, skip);
    }

    // The tiles of buildings a road would have painted, which only looks all right because
    // painting stops at a wall
    private findClipped(field: Float32Array): void {
        const { ground, sizeX, sizeY, corners } = this.build;
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                const i = ground.tile(x, y);
                if (ground.footprint[i]) {
                    const at = x + y * corners.x;
                    const sw = field[at];
                    const se = field[at + 1];
                    const ne = field[at + corners.x + 1];
                    const nw = field[at + corners.x];
                    const sides = getCoveredSides(sw, se, ne, nw);
                    this.clipped[i] = getOverlayShape(sides, sw + se + ne + nw) ? 1 : 0;
                }
            }
        }
    }
}

// The tiles a road can't use just past a straight stretch: a circle either side of its
// end, so that it can only swing away in a wide arc. Left to itself, a road whose way
// lies back past the stretch doubles back on it in a sharp point.
function getTurningCircles(lead: Point[]): (x: number, y: number) => boolean {
    const end = lead[lead.length - 1];
    const before = lead[lead.length - 2];
    const length = Math.hypot(end.x - before.x, end.y - before.y);
    const sideX = (before.y - end.y) / length;
    const sideY = (end.x - before.x) / length;
    const radius = Math.min(lead.length, ROAD_TURN_RADIUS);
    const centres = [1, -1].map((side) => ({
        x: end.x + sideX * side * radius,
        y: end.y + sideY * side * radius,
    }));
    return (x, y) =>
        centres.some((centre) => Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y) < radius - 0.7);
}

// The tiles that only hide the ground under the bridge's ends, which is the one
// floor it needs at ground level: the rest is ours, river and road
const BRIDGE_HIDDEN_FLOOR = 61;

// How a road leaves something: dead straight along these points, in tile corners, to
// where it's free to find its way from (from, a tile)
export type RoadStart = { from: Point; lead: Point[]; height: number };

// Bridges where rivers can take one. Returns a road start for each end of each, and
// marks where main roads must keep off them.
export function placeBridges(
    build: Build,
    rivers: River[],
    water: Uint8Array,
    zone: Uint8Array,
): RoadStart[] {
    const { context, ground, arena, terrain, biomeAt } = build;
    const starts: RoadStart[] = [];
    const middle = BRIDGE_LENGTH >> 1;
    const straight = middle + BRIDGE_ROAD_STRAIGHT;
    for (const river of rivers) {
        for (const crossing of river.crossings) {
            // Tile corners along the bridge's middle line, by distance from the river's
            // middle. Turning a prefab mirrors it along its length.
            const line = getCrossingLine(river, crossing);
            const across = (distance: number): Point =>
                river.vertical
                    ? { x: line + distance, y: crossing }
                    : { x: crossing, y: line + distance };
            const deckNear = river.vertical ? BRIDGE_DECK_WEST - middle : middle - BRIDGE_DECK_EAST;
            const deckFar = river.vertical ? BRIDGE_DECK_EAST - middle : middle - BRIDGE_DECK_WEST;

            // The straight runs must be on land in the arena, both rows of them
            const inArena = (p: Point) =>
                p.x >= arena.x0 && p.y >= arena.y0 && p.x <= arena.x1 && p.y <= arena.y1;
            const onLand = (distance: number) => {
                const p = across(distance);
                const q = river.vertical ? { x: p.x, y: p.y - 1 } : { x: p.x - 1, y: p.y };
                const free = (t: Point) =>
                    !water[ground.tile(t.x, t.y)] && !zone[ground.tile(t.x, t.y)];
                return inArena(p) && inArena(q) && free(p) && free(q);
            };
            let fits = true;
            for (let distance = deckFar; distance <= straight + 1; distance++) {
                fits &&= onLand(distance);
            }
            for (let distance = deckNear - 1; distance >= -straight - 2; distance--) {
                fits &&= onLand(distance);
            }
            const crossesOther = rivers.some(
                (other) => other !== river && Math.abs(crossing - riverCentre(other, line)) < 26,
            );
            if (!fits || crossesOther) {
                continue;
            }
            // Each biome has its own, where one fits, and banks stand as far over the water
            // as they do where they're from
            const middleTile = river.vertical ? biomeAt(line, crossing) : biomeAt(crossing, line);
            const def = BRIDGES[middleTile.bridge];
            const eastWest = rotatePrefab(loadPrefab(context, def), def.turns, context.locs);
            const height = river.levels[crossing] + def.bankHeight;
            const options = {
                floor: (overlay: number) => overlay === BRIDGE_HIDDEN_FLOOR,
                feather: 0,
                flatten: false,
                height,
                anchor: def.bankHeight,
                keepUnderlays: true,
                keepHeights: true,
            };
            const stampAt = crossing - BRIDGE_DECK_ROW;
            const bridge = river.vertical ? eastWest : rotatePrefab(eastWest, 1, context.locs);
            const stampX = river.vertical ? line - middle : stampAt;
            const stampY = river.vertical ? stampAt : line - middle;
            ground.stamp(bridge, stampX, stampY, options);
            const cornersOfStamp = bridge.sizeX + 1;
            for (let cy = 0; cy <= bridge.sizeY; cy++) {
                for (let cx = 0; cx <= bridge.sizeX; cx++) {
                    // The deck's stored over the ground under it, so that has to stay. Past
                    // it the bank's lumpy, and a road runs off it, so it's level.
                    const out = (river.vertical ? stampX + cx : stampY + cy) - line;
                    const own = bridge.levels[0].heights[cx + cy * cornersOfStamp];
                    const onDeck = out >= deckNear && out <= deckFar;
                    const rise = onDeck ? own - def.bankHeight : 0;
                    terrain.pin(stampX + cx, stampY + cy, height + rise);
                }
            }
            for (let y = stampY; y < stampY + bridge.sizeY; y++) {
                for (let x = stampX; x < stampX + bridge.sizeX; x++) {
                    zone[ground.tile(x, y)] = 1;
                }
            }
            // Nothing goes on the road's rows or close by, all the way along: no buildings
            // or trees, nor roads doubling back beside it
            for (let distance = -straight; distance <= straight; distance++) {
                const p = across(distance);
                for (let row = -BRIDGE_ROAD_CLEAR - 1; row <= BRIDGE_ROAD_CLEAR; row++) {
                    const x = river.vertical ? p.x : p.x + row;
                    const y = river.vertical ? p.y + row : p.y;
                    ground.reserved[ground.tile(x, y)] = 1;
                    zone[ground.tile(x, y)] = 1;
                }
            }
            for (const [deck, end, way] of [
                [deckNear, -straight, -1],
                [deckFar, straight, 1],
            ]) {
                const lead: Point[] = [];
                for (let distance = deck; distance !== end + way; distance += way) {
                    lead.push(across(distance));
                }
                starts.push({ from: across(end + way), lead, height });
            }
        }
    }
    return starts;
}

// The line the ring road or spine means to take. Nothing's laid yet: towns are planned first, so
// that a wall's gates can go where it arrives.
export function getMainRoadLine(build: Build): Point[] {
    const { settings, arena, spawn, sizeX, sizeY } = build;
    const line: Point[] = [];
    if (settings.roads <= 0 || settings.roadStyle === "branching") {
        return line;
    }
    const wiggle = createNoise(settings.seed + 8, 1);
    if (settings.roadStyle === "ring") {
        const middleX = (arena.x0 + arena.x1) / 2;
        const middleY = (arena.y0 + arena.y1) / 2;
        const radiusX = (arena.x1 - arena.x0) * 0.32;
        const radiusY = (arena.y1 - arena.y0) * 0.32;
        const steps = Math.ceil((radiusX + radiusY) * 4);
        for (let step = 0; step <= steps; step++) {
            const angle = (step / steps) * Math.PI * 2;
            const out =
                1 +
                (wiggle(Math.cos(angle) * 2 + 3, Math.sin(angle) * 2 + 3) - 0.5) *
                    settings.roadCurviness *
                    0.8;
            line.push({
                x: middleX + Math.cos(angle) * radiusX * out,
                y: middleY + Math.sin(angle) * radiusY * out,
            });
        }
    } else {
        // Off both sides of the map, through the spawn, the long way
        const eastWest = sizeX >= sizeY;
        const length = eastWest ? sizeX : sizeY;
        const middle = eastWest ? spawn.y : spawn.x;
        const swing = 8 + settings.roadCurviness * 50;
        for (let along = 0; along < length; along++) {
            const across = middle + (wiggle(along / 50, 7.5) - 0.5) * 2 * swing;
            line.push(eastWest ? { x: along, y: across } : { x: across, y: along });
        }
    }
    return line;
}

// The ring road or spine, for the others to join, stopping short of a town's wall or its square.
// The roads out of its gates pick it up from there.
export function layMainRoads(build: Build, roads: RoadNetwork, bridgeZone: Uint8Array): void {
    const { ground, towns } = build;
    if (roads.plannedLine.length === 0) {
        return;
    }
    const skip = new Uint8Array(roads.water.length);
    for (let i = 0; i < skip.length; i++) {
        skip[i] = roads.water[i] | bridgeZone[i];
    }
    const mark = (x0: number, y0: number, x1: number, y1: number) => {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (ground.inside(x, y)) {
                    skip[ground.tile(x, y)] = 1;
                }
            }
        }
    };
    for (const { x0, y0, x1, y1, wall } of towns ?? []) {
        mark(x0, y0, x1, y1);
        if (wall) {
            const far = WALL_CLEAR;
            mark(wall.x0 - far, wall.y0 - far, wall.x1 + far, wall.y1 + far);
        }
    }
    const { ranks } = ground.claims;
    for (let i = 0; i < skip.length; i++) {
        skip[i] |= ranks[i] !== 0 && ranks[i] < RESERVE_STREET ? 1 : 0;
    }
    roads.addMainRoad(roads.plannedLine, skip);
}
