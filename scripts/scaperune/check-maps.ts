// Checks every generated dev map, and settings at their extremes, with the game's own
// collision: every open tile must reach the spawn. Also that a road runs straight off
// both ends of each bridge, the width of the gap in its fences, that no road goes through
// a building, that a building's road ends at its door, and that a building without one
// faces the nearest road. And for height: that collision comes from slopes and agrees with
// the game's, that roads climb smoothly, that buildings stand on flat ground, and that
// nothing you can walk on is hidden from the camera. And that places keep to the flow: nothing on
// a wall or in front of a gate, and no roads or fences where they don't belong (clashes.ts). Fails
// if not.
//
//   npx tsx scripts/scaperune/check-maps.ts
//   ONLY=volcanoes npx tsx scripts/scaperune/check-maps.ts    # the maps whose names match
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { BIOMES, WATERFALL } from "../../src/game/scaperune/biomes";
import {
    BLOOD_WALL_ONLY,
    WATER_OVERLAYS,
    findBannedLocs,
} from "../../src/game/scaperune/catalogue";
import {
    CITY_WALL_IDS,
    WALL_SIDES,
    getGateColumns,
    getSideInsets,
    getWallSide,
} from "../../src/game/scaperune/cityWalls";
import { describeClashes, findClashes } from "../../src/game/scaperune/clashes";
import {
    TileRect,
    countStranded,
    findReachable,
    getCollisionFlags,
    getStepGrid,
} from "../../src/game/scaperune/collision";
import {
    MAP_SQUARE_SIZE,
    TILE_BLOCKED,
    TILE_BRIDGE,
    TileGrid,
} from "../../src/game/scaperune/format";
import {
    DEFAULT_SETTINGS,
    GeneratedMap,
    GeneratorSettings,
    HEIGHTMAP_SIZE,
    SETTING_PRESETS,
    encodeHeightmap,
    formatSettings,
    generateMapDetail,
    generatedRecipe,
    randomSettings,
} from "../../src/game/scaperune/generator";
import { DEV_MAP_SETTINGS, SCAPERUNE_DEV_MAPS } from "../../src/game/scaperune/maps/devMaps";
import { SCAPERUNE_MAPS } from "../../src/game/scaperune/maps/shippedMaps";
import { createRng } from "../../src/game/scaperune/noise";
import {
    BuildContext,
    MapRecipe,
    getRecipeArena,
    getRecipeWorldTile,
} from "../../src/game/scaperune/recipe";
import { buildRecipeSquares, createBuildContext } from "../../src/game/scaperune/squares";
import { getTileSlope } from "../../src/game/scaperune/terrain";
import { buildRegionData } from "../../src/mapviewer/worker/RegionDataLoader";
import { addCustomMapSquares } from "../../src/rs/map/CustomMapFileLoader";
import { createSceneBuilder, createVarManager, loadGameCache } from "../cache/scene-util";
import { LocMeta, createLocs, cropGrid } from "./research/lib";
import {
    findRims,
    measureHeight,
    measureObjects,
    measurePacing,
    measureSightLines,
    measureTowns,
    prepare,
} from "./research/metrics";

const GENERATED = /^scaperune_(?!palette|prefabs|cliffs)/;

// The worst a heightmap could be: black and white squares, with no way between them
const CHECKS = new Uint8Array(HEIGHTMAP_SIZE * HEIGHTMAP_SIZE).map((_, i) => {
    const x = i % HEIGHTMAP_SIZE;
    const y = Math.floor(i / HEIGHTMAP_SIZE);
    return ((x >> 4) + (y >> 4)) % 2 === 0 ? 0 : 255;
});

// Everywhere it can go wrong: every boundary and biome, and each setting at its worst,
// on small arenas and long thin ones
const RANDOM_MAPS = 12;
const SWEEP: Partial<GeneratorSettings>[] = [
    { biome: "meadow", island: 0, rivers: 2 },
    { biome: "desert", boundary: "forest", rivers: 1 },
    { biome: "swamp", boundary: "hills", rivers: 2, ponds: 6 },
    { biome: "snow", boundary: "fence", rivers: 1, buildings: 1 },
    { biome: "swamp", island: 0.6, ponds: 6 },
    { biome: "snow", squaresX: 1, squaresY: 1, island: 1 },
    { boundary: "forest", squaresX: 1, squaresY: 4, rivers: 2 },
    { boundary: "hills", squaresX: 5, squaresY: 1, rivers: 2, buildings: 1 },
    { boundary: "fence", boundaryDepth: 32, squaresX: 3, squaresY: 3 },
    { boundary: "forest", boundaryDepth: 32, squaresX: 1, squaresY: 1 },
    { rivers: 4, riverWidth: 20, squaresX: 3, squaresY: 3 },
    { rivers: 4, riverWidth: 4, lakes: 8, ponds: 16, squaresX: 3, squaresY: 3 },
    { waterLevel: 0.5, squaresX: 3, squaresY: 3, buildings: 1 },
    { waterLevel: 0.7, island: 0.5 },
    { buildings: 1, roads: 1, roadWidth: 6, roadStyle: "ring", squaresX: 3, squaresY: 3 },
    { buildings: 1, roads: 1, roadWidth: 6, roadStyle: "spine", squaresX: 3, squaresY: 3 },
    { buildings: 1, roads: 1, roadCurviness: 1, gardens: 1, rivers: 2 },
    { buildings: 1, roads: 0.5, towns: 8, townSize: 10, squaresX: 3, squaresY: 3 },
    { buildings: 1, roads: 0, towns: 1, townSize: 10, gardens: 1 },
    { buildings: 1, anyBuildings: true, ruins: 1, gardens: 1, roads: 1, roadStyle: "ring" },
    { buildings: 1, houses: false, shops: false },
    { trees: 1, treeClumping: 1, rocks: 1, grass: 1, flowers: 1, boundary: "forest" },
    { hills: 1, hillScale: 10, boundary: "hills", boundaryDepth: 32 },
    { secondBiome: "desert", biomeMix: 1, boundary: "forest", buildings: 1 },
    { spawnX: 0, spawnY: 1, rivers: 2, island: 0.5, buildings: 1 },
    { spawnX: 1, spawnY: 0, boundary: "forest", boundaryDepth: 32 },
    { hills: 1, hillScale: 10, walkSlope: 8 },
    {
        mountains: 1,
        peakHeight: 255,
        ruggedness: 1,
        terraces: 1,
        terraceHeight: 60,
        squaresX: 3,
        squaresY: 3,
        boundary: "forest",
        rivers: 2,
        buildings: 1,
    },
    { mountains: 1, walkSlope: 8, peakHeight: 255, squaresX: 3, squaresY: 3, buildings: 1 },
    { mountains: 1, walkSlope: 16, ridgeScale: 20, warp: 1, ruggedness: 1, buildings: 1 },
    { mountains: 0.8, ridgeScale: 120, warp: 0, terraces: 0, rivers: 1, island: 0.2 },
    { mountains: 0.7, riverValley: 0, rivers: 4, riverWidth: 20, squaresX: 3, squaresY: 3 },
    { mountains: 1, roads: 1, roadStyle: "ring", roadWidth: 6, buildings: 1, squaresX: 3 },
    { mountains: 1, roads: 1, roadStyle: "spine", roadCurviness: 1, squaresX: 4, squaresY: 1 },
    { mountains: 1, squaresX: 1, squaresY: 1, spawnX: 0, spawnY: 0, peakHeight: 255 },
    { boundary: "mountains", boundaryDepth: 32, squaresX: 1, squaresY: 1 },
    { boundary: "mountains", boundaryDepth: 2, squaresX: 5, squaresY: 1, rivers: 2 },
    { boundary: "mountains", mountains: 0.6, snow: 1, biome: "snow", buildings: 1 },
    {
        canyons: 3,
        canyonWidth: 3,
        rivers: 1,
        roads: 1,
        roadStyle: "ring",
        squaresX: 3,
        squaresY: 3,
    },
    { canyons: 3, canyonWidth: 16, biome: "desert", boundary: "fence", buildings: 1 },
    { mesas: 12, plateaus: 6, buildings: 1, towns: 3, biome: "desert", boundary: "forest" },
    { volcanoes: 2, squaresX: 3, squaresY: 3, snow: 1, rivers: 1 },
    { volcanoes: 2, mesas: 12, canyons: 3, mountains: 1, plateaus: 6, biome: "swamp" },
    { heightmap: encodeHeightmap(CHECKS), peakHeight: 255, squaresX: 3, squaresY: 3, rivers: 1 },
    { biome: "jungle", boundary: "forest", rivers: 1, landmarks: 1, buildings: 1, props: 1 },
    { biome: "tropical", waterLevel: 0.5, island: 0.1, landmarks: 1, squaresX: 3, squaresY: 3 },
    { biome: "ash", rivers: 2, lakes: 2, landmarks: 1, volcanoes: 1, squaresX: 3, squaresY: 3 },
    {
        biome: "autumn",
        towns: 2,
        townSize: 16,
        townWalls: 1,
        buildings: 1,
        roads: 1,
        waymarkers: 1,
        squaresX: 3,
        squaresY: 3,
    },
    { biome: "deadlands", boundary: "hills", landmarks: 1, ruins: 1, ponds: 8 },
    { biome: "elven", boundary: "forest", landmarks: 1, lakes: 2, towns: 1, townWalls: 1 },
    { biome: "fairy", landmarks: 1, ruins: 1, props: 1, buildings: 1 },
    { biome: "darkwood", boundary: "fence", landmarks: 1, trees: 1, ruins: 1, gardens: 1 },
    {
        biome: "jungle",
        secondBiome: "ash",
        biomeMix: 0.5,
        rivers: 2,
        lakes: 3,
        roads: 1,
        landmarks: 1,
        squaresX: 3,
        squaresY: 3,
    },
    { mountains: 0.6, landmarks: 1, props: 1, waymarkers: 1, roads: 1, buildings: 1, squaresX: 3 },
    { boundary: "fence", towns: 8, townSize: 10, townWalls: 1, buildings: 1, roads: 0 },
    { biome: "astral", island: 0.3, shoreRoughness: 1, landmarks: 1, buildings: 1 },
    { biome: "astral", island: 0.1, waterLevel: 0.5, squaresX: 3, squaresY: 3, rivers: 1 },
    { biome: "autumn", secondBiome: "astral", biomeMix: 0.5, landmarks: 1, squaresX: 3 },
    { rivers: 2, riverWidth: 14, roads: 0 },
    { towns: 2, townSize: 24, townWalls: 1, buildings: 1, hills: 0.7, squaresX: 3, squaresY: 3 },
    ...CITY_WALL_IDS.map((wallKit) => ({
        wallKit,
        towns: 1,
        townSize: 26,
        townWalls: 1,
        buildings: 1,
        rivers: 1,
        squaresX: 3,
        squaresY: 3,
    })),
    {
        towns: 1,
        townSize: 34,
        townWalls: 1,
        buildings: 1,
        gardens: 1,
        landmarks: 1,
        ruins: 1,
        roadStyle: "ring",
        squaresX: 3,
        squaresY: 3,
    },
    {
        towns: 1,
        townSize: 40,
        townWalls: 1,
        wallKit: "kourend",
        buildings: 1,
        gardens: 1,
        ruins: 1,
        roadStyle: "spine",
        rivers: 1,
        squaresX: 4,
        squaresY: 3,
    },
    { towns: 3, townSize: 18, townWalls: 0.5, buildings: 1, gardens: 1, squaresX: 3, squaresY: 3 },
    { towns: 0, sites: 1, buildings: 1, gardens: 1, landmarks: 1, squaresX: 3, squaresY: 3 },
    { towns: 2, townSize: 24, buildings: 1, gardens: 1, roadStyle: "ring", roadWidth: 6 },
];

// Tiles past the end of a deck that must be whole road, and that must have nothing
// beside them: past the fences, which end 3 or 4 tiles off the deck. Further on, another
// road can join it.
const ROAD_OFF_DECK = 7;
const ROAD_ALONE_OFF_DECK = 4;

// Problems with the roads off a grid's bridges, and how many ran each way
function checkBridgeRoads(
    grid: TileGrid,
    roadTiles: Uint8Array,
): { problems: string[]; ways: number[] } {
    const { sizeX } = grid;
    const deck = new Set<number>();
    grid.levels[1].flags.forEach((flag, i) => {
        if (flag & TILE_BRIDGE) {
            deck.add(i);
        }
    });
    const problems: string[] = [];
    const ways = [0, 0];
    for (const start of deck) {
        // A bridge's tiles, flooding along the deck
        const tiles = [start];
        deck.delete(start);
        for (let at = 0; at < tiles.length; at++) {
            for (const i of [tiles[at] - 1, tiles[at] + 1, tiles[at] - sizeX, tiles[at] + sizeX]) {
                if (deck.delete(i)) {
                    tiles.push(i);
                }
            }
        }
        const xs = tiles.map((i) => i % sizeX);
        const ys = tiles.map((i) => Math.floor(i / sizeX));
        const [x0, x1, y0, y1] = [
            Math.min(...xs),
            Math.max(...xs),
            Math.min(...ys),
            Math.max(...ys),
        ];
        const eastWest = x1 - x0 > y1 - y0;
        ways[eastWest ? 0 : 1]++;
        const overlayAt = (along: number, across: number) => {
            const i = eastWest ? along + across * sizeX : across + along * sizeX;
            return { overlay: grid.levels[0].overlays[i], shape: grid.levels[0].shapes[i] };
        };
        const [first, last] = eastWest ? [x0, x1] : [y0, y1];
        const [low, high] = eastWest ? [y0, y1] : [x0, x1];
        for (const way of [-1, 1]) {
            const end = way < 0 ? first : last;
            for (let step = 1; step <= ROAD_OFF_DECK; step++) {
                const along = end + way * step;
                for (const across of [low, high]) {
                    const { overlay, shape } = overlayAt(along, across);
                    if (overlay === 0 || shape !== 0) {
                        problems.push(`gap at ${along},${across} off the deck isn't whole road`);
                    }
                }
                for (const across of [low - 1, high + 1]) {
                    const i = eastWest ? along + across * sizeX : across + along * sizeX;
                    if (step <= ROAD_ALONE_OFF_DECK && roadTiles[i]) {
                        problems.push(`road outside the fences at ${along},${across}`);
                    }
                }
            }
        }
    }
    return { problems, ways };
}

// A road's tiles past its lead, which must be nowhere near a building's
function checkRoadsAndBuildings(map: GeneratedMap): string[] {
    const { grid, footprint, roadTiles, lines, buildings } = map;
    const { sizeX, sizeY } = grid;
    const problems: string[] = [];
    roadTiles.forEach((road, i) => {
        if (road && footprint[i]) {
            problems.push(`road painted on a building at ${i % sizeX},${Math.floor(i / sizeX)}`);
        }
    });
    for (const line of lines) {
        const reach = Math.ceil(line.halfWidth);
        for (const point of line.points.slice(line.lead)) {
            const px = Math.floor(point.x);
            const py = Math.floor(point.y);
            for (let y = py - reach; y <= py + reach; y++) {
                for (let x = px - reach; x <= px + reach; x++) {
                    const near = Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y) <= line.halfWidth;
                    const onGrid = x >= 0 && y >= 0 && x < sizeX && y < sizeY;
                    if (near && onGrid && footprint[x + y * sizeX]) {
                        problems.push(`road runs through a building at ${x},${y}`);
                    }
                }
            }
        }
    }
    // Fords aren't roads, and have no grade
    const roadPoints = lines.filter((line) => line.grade !== undefined);
    for (const building of buildings) {
        const { exit, name } = building;
        if (!exit) {
            problems.push(`${name} has no way out`);
            continue;
        }
        if (building.hasRoad) {
            const ends = lines.some(
                (line) =>
                    line.lead > 0 &&
                    Math.hypot(line.points[0].x - exit.x, line.points[0].y - exit.y) < 0.01,
            );
            if (!ends) {
                problems.push(`${name}'s road doesn't end at its door`);
            }
            continue;
        }
        // On its own: its door faces the nearest road, if there is one
        let toX = 0;
        let toY = 0;
        let best = Infinity;
        for (const line of roadPoints) {
            for (const point of line.points) {
                const distance = Math.hypot(point.x - exit.x, point.y - exit.y);
                if (distance < best) {
                    best = distance;
                    toX = point.x - exit.x;
                    toY = point.y - exit.y;
                }
            }
        }
        if (best !== Infinity && toX * exit.outX + toY * exit.outY <= 0) {
            problems.push(`${name} at ${building.x},${building.y} turns its door from the road`);
        }
    }
    return problems;
}

// How steep the line from the play camera to the ground it's looking at is, in height units
// a tile: at 70 degrees, the angle the camera sits at, for a tile in the middle of the screen
const CAMERA_LINE = 44;
// How far south of a tile to look for what could hide it
const HIDING_REACH = 24;
// A road's ground can change by this much from one point to the next, and that change by
// this much: more is a step, not a slope
const MAX_ROAD_BEND = 5;

function getCornerHeight(grid: TileGrid, x: number, y: number): number {
    const { sizeX, sizeY } = grid;
    const cx = Math.min(Math.max(x, 0), sizeX - 0.001);
    const cy = Math.min(Math.max(y, 0), sizeY - 0.001);
    const tx = Math.floor(cx);
    const ty = Math.floor(cy);
    const corners = sizeX + 1;
    const heights = grid.levels[0].heights;
    const at = tx + ty * corners;
    const south = heights[at] + (heights[at + 1] - heights[at]) * (cx - tx);
    const north =
        heights[at + corners] + (heights[at + corners + 1] - heights[at + corners]) * (cx - tx);
    return south + (north - south) * (cy - ty);
}

// Collision from height, and the same collision in the game and the generator
function checkCollision(
    map: GeneratedMap,
    game: ArenaGrid,
    origin: { x: number; y: number },
    rect: { x0: number; y0: number; x1: number; y1: number },
    context: BuildContext,
): string[] {
    const { grid, walkSlope } = map;
    const problems: string[] = [];
    const corners = grid.sizeX + 1;
    const steps = getStepGrid(getCollisionFlags(grid, context.locs), grid.sizeX, rect);
    const bridges = grid.levels[1].flags;
    let disagree = 0;
    for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
            const i = x + y * grid.sizeX;
            const solid = game.isSolid(origin.x + x, origin.y + y);
            disagree += solid === steps.isSolid(x, y) ? 0 : 1;
            const slope = getTileSlope(grid.levels[0].heights, corners, x, y);
            if (slope > walkSlope && !solid && !(bridges[i] & TILE_BRIDGE)) {
                problems.push(`too steep to walk but open at ${x},${y}: ${slope.toFixed(1)}`);
            }
        }
    }
    if (disagree > 0) {
        problems.push(`the generator's collision and the game's differ on ${disagree} tiles`);
    }
    return problems;
}

// Every road's ground, along its length: how it was graded, steady, and walkable
// A walled town has two ways in or more, you can walk through them, and a road only meets its
// wall at a gate
function checkWalls(
    map: GeneratedMap,
    context: BuildContext,
    spawn: { x: number; y: number },
    arena: TileRect,
): string[] {
    const { grid, roadTiles } = map;
    const problems: string[] = [];
    const flags = getCollisionFlags(grid, context.locs);
    const reached = findReachable(flags, grid.sizeX, grid.sizeY, arena, spawn.x, spawn.y);
    const tile = (x: number, y: number) => x + y * grid.sizeX;
    for (const town of map.walled ?? []) {
        const { kit, gates, taken, x0, y0, x1, y1 } = town;
        const open = gates.filter((gate) => {
            const { side, start } = getGateColumns(kit, town, gate);
            const middle = start + (kit.gateSize >> 1);
            return [-2, kit.width + 2].every(
                (across) => reached[tile(side.x(middle, across), side.y(middle, across))],
            );
        });
        if (open.length < 2) {
            problems.push(`the wall at ${x0},${y0} has ${open.length} gates you can walk through`);
        }
        for (let turn = 0; turn < 4; turn++) {
            const side = getWallSide({ x0, y0, x1, y1 }, turn);
            const [inset, end] = getSideInsets(kit, town, turn);
            const here = gates.filter((gate) => WALL_SIDES.indexOf(gate.side) === turn);
            const starts = here.map((gate) => getGateColumns(kit, town, gate).start);
            let from = -1;
            for (let along = inset; along <= side.length - end + 1; along++) {
                const i = tile(side.x(along, 0), side.y(along, 0));
                const onRoad = along <= side.length - end && roadTiles[i] && !taken.has(i);
                if (onRoad && from < 0) {
                    from = along;
                } else if (!onRoad && from >= 0) {
                    const stop = along - 1;
                    if (!starts.some((at) => at <= stop && at + kit.gateSize > from)) {
                        const [x, y] = [side.x(from, 0), side.y(from, 0)];
                        problems.push(`a road meets the wall at ${x},${y} with no gate`);
                    }
                    from = -1;
                }
            }
        }
    }
    return problems;
}

function checkRoadHeights(map: GeneratedMap): { problems: string[]; steepest: number } {
    const { grid, lines, passes, walkSlope } = map;
    const problems: string[] = [];
    let steepest = 0;
    // Fords run through water, and have no grade
    for (const line of [...lines, ...passes].filter((road) => road.heights)) {
        const { points } = line;
        const ground = points.map((point) => getCornerHeight(grid, point.x, point.y));
        let last = 0;
        for (let i = 1; i < points.length; i++) {
            const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            // Bridges and door leads go by their own rules
            if (length < 0.2 || i <= line.lead) {
                continue;
            }
            const grade = (ground[i] - ground[i - 1]) / length;
            steepest = Math.max(steepest, Math.abs(grade));
            if (Math.abs(grade) > walkSlope) {
                const at = `${points[i].x.toFixed(1)},${points[i].y.toFixed(1)}`;
                const planned = line.heights![i] - line.heights![i - 1];
                problems.push(
                    `road too steep at ${at}: ${grade.toFixed(1)} a tile, ` +
                        `planned ${(planned / length).toFixed(1)}, ` +
                        `at ${ground[i - 1].toFixed(0)} to ${ground[i].toFixed(0)}, ` +
                        `planned ${line.heights![i - 1].toFixed(0)} to ${line.heights![i].toFixed(0)}`,
                );
            }
            if (i > line.lead + 1 && Math.abs(grade - last) > MAX_ROAD_BEND * 2) {
                const at = `${points[i].x.toFixed(1)},${points[i].y.toFixed(1)}`;
                problems.push(`road steps at ${at}: ${last.toFixed(1)} to ${grade.toFixed(1)}`);
            }
            last = grade;
        }
    }
    return { problems, steepest };
}

// Buildings stand on flat ground, and you can get out of them
function checkBuildingGround(map: GeneratedMap): string[] {
    const { grid, buildings } = map;
    const problems: string[] = [];
    const corners = grid.sizeX + 1;
    const { heights, flags } = grid.levels[0];
    for (const building of buildings) {
        const { name, x, y, sizeX, sizeY, exit } = building;
        let min = Infinity;
        let max = -Infinity;
        for (let cy = y; cy <= y + sizeY; cy++) {
            for (let cx = x; cx <= x + sizeX; cx++) {
                min = Math.min(min, heights[cx + cy * corners]);
                max = Math.max(max, heights[cx + cy * corners]);
            }
        }
        if (max !== min) {
            problems.push(`${name} at ${x},${y} isn't on flat ground: ${min} to ${max}`);
        }
        if (exit) {
            // One that's all out of reach, across water, is only something to look at
            const outX = Math.floor(exit.x + exit.outX * 1.5);
            const outY = Math.floor(exit.y + exit.outY * 1.5);
            const inX = Math.floor(exit.x - exit.outX * 0.5);
            const inY = Math.floor(exit.y - exit.outY * 0.5);
            const inside = flags[inX + inY * grid.sizeX] & TILE_BLOCKED;
            if (flags[outX + outY * grid.sizeX] & TILE_BLOCKED && !inside) {
                problems.push(`${name} at ${x},${y} opens onto ground you can't walk on`);
            }
        }
    }
    return problems;
}

// Set pieces on land stand on flat ground, with nothing built or painted under them
function checkLandmarks(map: GeneratedMap): string[] {
    const { grid, landmarks, roadTiles, footprint } = map;
    const problems: string[] = [];
    const corners = grid.sizeX + 1;
    const { heights } = grid.levels[0];
    for (const { name, x, y, sizeX, sizeY, onLand } of landmarks.filter((piece) => piece.onLand)) {
        let min = Infinity;
        let max = -Infinity;
        for (let cy = y; cy <= y + sizeY; cy++) {
            for (let cx = x; cx <= x + sizeX; cx++) {
                min = Math.min(min, heights[cx + cy * corners]);
                max = Math.max(max, heights[cx + cy * corners]);
            }
        }
        if (onLand && max !== min) {
            problems.push(`${name} at ${x},${y} isn't on flat ground: ${min} to ${max}`);
        }
        for (let ty = y; ty < y + sizeY; ty++) {
            for (let tx = x; tx < x + sizeX; tx++) {
                const i = tx + ty * grid.sizeX;
                if (roadTiles[i] || footprint[i]) {
                    problems.push(`${name} at ${x},${y} has something under it at ${tx},${ty}`);
                }
            }
        }
    }
    return problems;
}

// A cliff's waterfall comes down into its pool
function checkFalls(map: GeneratedMap): string[] {
    const { grid, falls } = map;
    const { flags, overlays } = grid.levels[0];
    return falls
        .filter(({ x, y }) => {
            const i = x + 1 + (y - 2) * grid.sizeX;
            return !(flags[i] & TILE_BLOCKED) || overlays[i] === 0;
        })
        .map(({ x, y }) => `the waterfall at ${x},${y} has no pool`);
}

// How far from a fall foam can be: rivers fall across their whole width
const FOAM_REACH = 14;

// Nothing from the wrong place: the ban list, blood that draws nothing, foam away from a fall
function checkCatalogue(map: GeneratedMap): string[] {
    const { grid, falls, waterfalls } = map;
    const problems = findBannedLocs(grid).map(
        ({ loc, why }) => `banned loc ${loc.id} at ${loc.x},${loc.y}: ${why}`,
    );
    const drops = [...falls, ...waterfalls];
    for (const { id, type, x, y } of grid.locs) {
        if (id === BLOOD_WALL_ONLY && type === 22) {
            problems.push(`loc ${id} at ${x},${y} draws nothing as ground decoration`);
        }
        const atFall = drops.some((fall) => Math.hypot(fall.x - x, fall.y - y) <= FOAM_REACH);
        if (id === WATERFALL && !atFall) {
            problems.push(`foam at ${x},${y} isn't at a fall`);
        }
    }
    return problems;
}

// Bars for how a map looks. A map can be fully reachable and still look awful, and now these
// failures can be measured. Real regions have 26 to 39 decorations per 100 tiles and 23 to 96
// on roads, 99.96% of tiles are 80 a tile or under, places with relief have something on 12%
// to 83% of steep tiles, and the tile at a cliff's foot is on rock 2% to 20% of the time, with
// 29 to 93 decorations per 100. See the engine plan.
const LOOK = {
    decorPer100: 20,
    roadDecorPer100: 15,
    steepest: 80,
    steepWithLocPct: 25,
    footOnRockPct: 30,
    footDecorPer100: 20,
    viewP50: 4,
};
// Below these a rule says nothing: a sliver of road or one short cliff isn't a look
const LOOK_LEAST = { land: 2000, road: 200, steep: 100, foot: 60 };
// Land textures, which stretched down a cliff are the bands that started all this
const TEXTURED_ROCK = new Set([20, 32]);
const ROCK_OVERLAYS = new Set(Object.values(BIOMES).map(({ rock }) => rock.overlay));
const STARS = 39;
const BIG_LOC = 6;
// 45 degrees
const STEEP = 16;
const BRIDGE_REACH = 4;
const WATER_REACH = 2;

// How a map looks, from the same measures as the real world's, on its arena. Says what's wrong,
// and prints what a map can be right to differ on.
function checkLook(
    id: string,
    map: GeneratedMap,
    margin: number,
    locs: (id: number) => LocMeta,
    settings?: GeneratorSettings,
): string[] {
    const { grid, roadTiles } = map;
    const m = margin * MAP_SQUARE_SIZE;
    const arena = cropGrid(grid, m, m, grid.sizeX - m * 2, grid.sizeY - m * 2);
    const p = prepare(arena, locs);
    const { n, sizeX } = p;
    const { overlays, underlays, flags } = arena.levels[0];
    const problems: string[] = [];

    const isLand = (i: number) =>
        !WATER_OVERLAYS.has(overlays[i]) && overlays[i] !== STARS && underlays[i] !== 0;
    const decorAt = new Uint8Array(n);
    for (const loc of arena.locs) {
        if (loc.level === 0 && loc.type === 22) {
            decorAt[loc.x + loc.y * sizeX] = 1;
        }
    }
    let land = 0;
    let decor = 0;
    let road = 0;
    let roadDecor = 0;
    let textured = 0;
    for (let i = 0; i < n; i++) {
        land += isLand(i) ? 1 : 0;
        decor += isLand(i) ? decorAt[i] : 0;
        const whole = i % sizeX;
        const y = Math.floor(i / sizeX);
        if (roadTiles[whole + m + (y + m) * grid.sizeX]) {
            road++;
            roadDecor += decorAt[i];
        }
        textured += flags[i] & TILE_BLOCKED && TEXTURED_ROCK.has(overlays[i]) ? 1 : 0;
    }
    const dressed = !settings || (settings.dressing === 1 && settings.grass > 0);
    const decorPer100 = (100 * decor) / Math.max(land, 1);
    if (dressed && land >= LOOK_LEAST.land && decorPer100 < LOOK.decorPer100) {
        problems.push(`decoration is ${decorPer100.toFixed(1)} per 100 land tiles`);
    }
    const roadPer100 = (100 * roadDecor) / Math.max(road, 1);
    if (dressed && road >= LOOK_LEAST.road && roadPer100 < LOOK.roadDecorPer100) {
        problems.push(`decoration is ${roadPer100.toFixed(1)} per 100 road tiles`);
    }
    if (textured > 0) {
        problems.push(`${textured} blocked tiles are on a textured floor`);
    }
    // What stands on what's steep, on land: a shore can be as steep as it likes under water.
    // Past that, only what can't move is left over the bar: a bridge's own heights, a fall in a
    // river, and a road that's pinned where it meets water, which all hold both ends of a tile.
    const covered = new Uint8Array(n);
    for (const loc of arena.locs) {
        const { sizeX: wide, sizeY: deep } = locs(loc.id);
        for (let ty = loc.y; ty < Math.min(loc.y + deep, arena.sizeY); ty++) {
            for (let tx = loc.x; tx < Math.min(loc.x + wide, sizeX); tx++) {
                covered[tx + ty * sizeX] = loc.level === 0 ? 1 : covered[tx + ty * sizeX];
            }
        }
    }
    const held = new Uint8Array(n);
    const hold = (i: number, reach: number) => {
        for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
                held[Math.min(Math.max(i + dx + dy * sizeX, 0), n - 1)] = 1;
            }
        }
    };
    for (let i = 0; i < n; i++) {
        if (arena.levels[1].flags[i] & TILE_BRIDGE) {
            hold(i, BRIDGE_REACH);
        } else if (WATER_OVERLAYS.has(overlays[i])) {
            hold(i, WATER_REACH);
        }
    }
    let steepest = 0;
    let steepTiles = 0;
    let steepCovered = 0;
    for (let i = 0; i < n; i++) {
        if (!held[i] && isLand(i)) {
            steepest = Math.max(steepest, p.slope[i]);
        }
        if (isLand(i) && p.slope[i] >= STEEP) {
            steepTiles++;
            steepCovered += covered[i];
        }
    }
    // A heightmap can ask for anything, and the sweep's asks for the worst
    if (steepest > LOOK.steepest && !settings?.heightmap) {
        problems.push(`the steepest tile is ${steepest} a tile`);
    }
    const steepWithLocPct = Math.round((100 * steepCovered) / Math.max(steepTiles, 1));
    if (dressed && steepTiles >= LOOK_LEAST.steep && steepWithLocPct < LOOK.steepWithLocPct) {
        problems.push(
            `only ${steepWithLocPct}% of ${steepTiles} steep tiles have anything on them`,
        );
    }
    const { walkSlopeSharePct } = measureHeight(p);
    const rim = findRims(p);
    let foot = 0;
    let footRock = 0;
    let footDecor = 0;
    for (let i = 0; i < n; i++) {
        if (rim[i] === 1) {
            foot++;
            footRock += ROCK_OVERLAYS.has(overlays[i]) ? 1 : 0;
            footDecor += decorAt[i];
        }
    }
    const footRockPct = (100 * footRock) / Math.max(foot, 1);
    const footPer100 = (100 * footDecor) / Math.max(foot, 1);
    if (foot >= LOOK_LEAST.foot && footRockPct > LOOK.footOnRockPct) {
        problems.push(`${footRockPct.toFixed(0)}% of tiles at a cliff's foot are on rock`);
    }
    if (dressed && foot >= LOOK_LEAST.foot && footPer100 < LOOK.footDecorPer100) {
        problems.push(`decoration at a cliff's foot is ${footPer100.toFixed(1)} per 100 tiles`);
    }
    const view = measureSightLines(p).viewQ[1];
    if (view < LOOK.viewP50) {
        problems.push(`you can only see ${view} tiles at the median`);
    }

    const { objectsOnScreen, kindsOnScreen } = measurePacing(p);
    const { indoorSharePct, gapQ } = measureTowns(p);
    const { scenerySize } = measureObjects(p);
    const big = Object.entries(scenerySize).reduce(
        (sum, [size, count]) => sum + (Number(size) >= BIG_LOC ? count : 0),
        0,
    );
    console.log(
        `  look ${id.slice(0, 24)}: decor ${decorPer100.toFixed(0)}, road ${roadPer100.toFixed(0)}, ` +
            `steepest ${steepest}, on steep ${steepWithLocPct}%, foot rock ${footRockPct.toFixed(0)}% ` +
            `decor ${footPer100.toFixed(0)}, view ${view}; objects ${objectsOnScreen.p10}/` +
            `${objectsOnScreen.p50}/${objectsOnScreen.p90}, kinds ${kindsOnScreen.p50}, ` +
            `flat ${walkSlopeSharePct["0-0"]}%, indoor ${indoorSharePct}%, gap ${gapQ[1]}, ` +
            `size 6+ ${big}`,
    );
    return problems;
}

// Open tiles the play camera can't see, for the ground between
function countHiddenTiles(
    grid: TileGrid,
    game: ArenaGrid,
    origin: { x: number; y: number },
    rect: { x0: number; y0: number; x1: number; y1: number },
): number {
    let hidden = 0;
    for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
            if (game.isSolid(origin.x + x, origin.y + y)) {
                continue;
            }
            const height = getCornerHeight(grid, x + 0.5, y + 0.5);
            for (let reach = 1; reach <= HIDING_REACH; reach++) {
                if (
                    getCornerHeight(grid, x + 0.5, y + 0.5 - reach) >
                    height + CAMERA_LINE * reach
                ) {
                    hidden++;
                    break;
                }
            }
        }
    }
    return hidden;
}

const cache = loadGameCache();
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : undefined;

// Checks one map. Returns false if it fails.
function checkMap(
    id: string,
    mapDetail: (context: BuildContext) => GeneratedMap,
    recipe: MapRecipe,
    settings?: GeneratorSettings,
) {
    if (only && !only.test(id)) {
        return true;
    }
    const shipped = SCAPERUNE_MAPS.some((recipe) => recipe.id === id);
    const sceneBuilder = createSceneBuilder(cache);
    const { mapFileLoader, locTypeLoader } = sceneBuilder;
    const context = createBuildContext(mapFileLoader, locTypeLoader);
    let map: GeneratedMap;
    try {
        map = mapDetail(context);
    } catch (e) {
        // Settings can leave too little ground: that's an error to show, not a failure
        const message = e instanceof Error ? e.message : String(e);
        console.log(`${id}: refused: ${message}`);
        return message.includes("too little ground");
    }
    addCustomMapSquares(
        mapFileLoader,
        buildRecipeSquares({ ...recipe, build: () => map.grid }, context),
    );
    const region = { ...getRecipeArena(recipe), plane: 0 };
    const grid = new ArenaGrid(buildRegionData(sceneBuilder, createVarManager(cache), region));
    const spawn = getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y);
    const { open, stranded } = countStranded(grid, spawn.x, spawn.y);
    const bridges = checkBridgeRoads(map.grid, map.roadTiles);
    const gridRect = {
        x0: recipe.margin * 64,
        y0: recipe.margin * 64,
        x1: (recipe.squaresX - recipe.margin) * 64 - 1,
        y1: (recipe.squaresY - recipe.margin) * 64 - 1,
    };
    const origin = {
        x: recipe.mapX * 64,
        y: recipe.mapY * 64,
    };
    const roadHeights = checkRoadHeights(map);
    const hidden = countHiddenTiles(map.grid, grid, origin, gridRect);
    const problems = [
        ...bridges.problems,
        ...checkRoadsAndBuildings(map),
        ...checkCollision(map, grid, origin, gridRect, context),
        ...roadHeights.problems,
        ...checkBuildingGround(map),
        ...checkLandmarks(map),
        ...checkFalls(map),
        ...checkWalls(map, context, recipe.spawn, gridRect),
        ...describeClashes(findClashes(map, context.locs)),
        ...(shipped ? [] : checkCatalogue(map)),
        ...(shipped ? [] : checkLook(id, map, recipe.margin, createLocs(locTypeLoader), settings)),
    ];
    if (hidden > 0) {
        problems.push(`${hidden} open tiles are hidden from the camera`);
    }
    const [eastWest, northSouth] = bridges.ways;
    const roadless = map.buildings.filter((building) => !building.hasRoad).length;
    console.log(
        `${id}: ${open} open, ${stranded} stranded, bridges ${eastWest}+${northSouth}, ` +
            `${map.buildings.length} buildings (${roadless} without a road), ` +
            `${map.landmarks.length} landmarks, ${map.falls.length} falls, ` +
            `passes ${map.passes.length}, steepest road ${roadHeights.steepest.toFixed(1)}`,
    );
    for (const problem of problems.slice(0, 8)) {
        console.log(`  ${problem}`);
    }
    return stranded === 0 && open >= 200 && problems.length === 0;
}

let failed = false;
for (const recipe of [
    ...SCAPERUNE_MAPS,
    ...SCAPERUNE_DEV_MAPS.filter((map) => GENERATED.test(map.id)),
]) {
    // A hand-made map has no settings, and says what's on it itself
    const settings = DEV_MAP_SETTINGS[recipe.id];
    // A hand-made map says how to build what it's held to, if it's held to the rules at all
    const detail = settings ? (c: BuildContext) => generateMapDetail(settings, c) : recipe.detail;
    if (detail) {
        failed = !checkMap(recipe.id, detail, recipe, settings) || failed;
    }
}
SWEEP.forEach((overrides, i) => {
    const settings: GeneratorSettings = { seed: 11 + i, ...DEFAULT_SETTINGS, ...overrides };
    const recipe = generatedRecipe("sweep", 70, 134, settings);
    const passed = checkMap(
        `sweep ${i} ${JSON.stringify({ ...overrides, heightmap: undefined })}`,
        (context) => generateMapDetail(settings, context),
        recipe,
        settings,
    );
    failed = !passed || failed;
});
for (const [name, preset] of Object.entries(SETTING_PRESETS)) {
    const settings: GeneratorSettings = { seed: 3, ...DEFAULT_SETTINGS, ...preset };
    const recipe = generatedRecipe("preset", 70, 134, settings);
    const passed = checkMap(
        name,
        (context) => generateMapDetail(settings, context),
        recipe,
        settings,
    );
    failed = !passed || failed;
}
// What the screen's Randomize can come up with: refusing for too little ground is fine
const roll = createRng(1);
for (let i = 0; i < RANDOM_MAPS; i++) {
    const settings = randomSettings({ seed: 100 + i, ...DEFAULT_SETTINGS }, roll);
    const recipe = generatedRecipe("random", 70, 134, settings);
    const passed = checkMap(
        `random ${i} ${formatSettings(settings)}`,
        (context) => generateMapDetail(settings, context),
        recipe,
        settings,
    );
    failed = !passed || failed;
}
if (failed) {
    console.log("Some maps failed");
    process.exit(1);
}
console.log(
    "All open tiles reach the spawn, every road and door is where it should be, and the ground's right",
);
