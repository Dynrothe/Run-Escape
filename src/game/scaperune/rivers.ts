import { WATERFALL } from "./biomes";
import { Build, LOC_NORMAL, SPAWN_CLEAR, getCornerDistance, hasRelief, lerp } from "./mapBuild";
import { Noise, createNoise, createRng, smoothField } from "./noise";
import { spreadNearest } from "./terrain";

// Rivers, lakes and the sea: where they go, and how high they stand.

// The width of a river at a bridge, and a half width of 1 to 1.3 on a line of tile
// corners fills exactly the 2 rows beside it, the gap in a bridge's fences
const BRIDGE_RIVER_HALF_WIDTH = 4.5;

// Crossings are at most this far apart, so that wherever you are one's inside
// the flow field's window (48 tiles each way)
const CROSSING_SPACING = 60;

export const SEA_BED = 6;

// The lowest fresh water can be
export const RIVER_BED = 8;

// How far under the ground round it water lies
const WATER_DROP = 18;

// Tiles a shore takes to come down to the water, at the least. Tall ground takes longer.
const MIN_BANK = 6;

export const MAX_BANK = 24;

// How steep the sides of a river's valley are, from a gorge to a wide valley
const GORGE_SLOPE = 34;

const VALLEY_SLOPE = 7;

// Tiles either side of a crossing where a river runs level
const LEVEL_AT_CROSSING = 13;

// How far a river has to fall for it to come down as a waterfall, and tiles it keeps clear
// of a crossing
const WATERFALL_DROP = 16;

const WATERFALL_RUN = 6;

const WATERFALL_SPACING = 30;

const WATERFALL_WIDTH = 3;

// How much of the land's height a river's course minds, against a straight line
const VALLEY_SEEK = 1;

export type River = {
    // Runs north to south, or west to east
    vertical: boolean;
    // Its column or row at the crossings
    line: number;
    crossings: number[];
    wiggle: Noise;
    amount: number;
    halfWidth: number;
    // Its column or row along its length, where the land gives it a valley to run in
    valley?: Float32Array;
    // How high the water is along its length
    levels: Float32Array;
    // Where it falls, for waterfalls
    drops: { along: number; level: number }[];
};

// A lake or pond: where it is, and how high its water stands
type Pool = { x: number; y: number; radius: number; level: number };

function riverStraightness(river: River, along: number): number {
    let away = Infinity;
    for (const crossing of river.crossings) {
        away = Math.min(away, Math.abs(along - crossing));
    }
    return Math.min(Math.max(away - 10, 0) / 12, 1);
}

// The line a river would follow if it didn't wander
function riverLine(river: River, along: number): number {
    const { valley, line } = river;
    if (!valley) {
        return line;
    }
    return valley[Math.min(Math.max(Math.round(along), 0), valley.length - 1)];
}

function getNearestCrossing(river: River, along: number): number {
    let best = along;
    let bestDistance = Infinity;
    for (const crossing of river.crossings) {
        const distance = Math.abs(along - crossing);
        if (distance < bestDistance) {
            best = crossing;
            bestDistance = distance;
        }
    }
    return best;
}

export function riverCentre(river: River, along: number): number {
    const straight = riverStraightness(river, along);
    const line = lerp(
        riverLine(river, getNearestCrossing(river, along)),
        riverLine(river, along),
        straight,
    );
    return line + (river.wiggle(along / 30, 3.5) - 0.5) * 2 * river.amount * straight;
}

// Rivers narrow to a bridge's span where one can cross them
function riverHalfWidth(river: River, along: number): number {
    return lerp(BRIDGE_RIVER_HALF_WIDTH, river.halfWidth, riverStraightness(river, along));
}

// How far in from the arena's edge the sea comes
function getCoastDepth(build: Build): number {
    const { settings, arena } = build;
    if (settings.boundary !== "sea") {
        return 0;
    }
    const half = Math.min(arena.x1 - arena.x0, arena.y1 - arena.y0) / 2;
    return 3 + settings.island * half * 0.5;
}

export function createRivers(build: Build): River[] {
    const { settings, arena, rng } = build;
    const coast = getCoastDepth(build);
    const rivers: River[] = [];
    const firstVertical = rng() < 0.5;
    for (let i = 0; i < settings.rivers; i++) {
        const vertical = i % 2 === 0 ? firstVertical : !firstVertical;
        const [alongMin, alongMax, acrossMin, acrossMax] = vertical
            ? [arena.y0, arena.y1, arena.x0, arena.x1]
            : [arena.x0, arena.x1, arena.y0, arena.y1];
        // Across the land, not out in the sea
        const half = (alongMax - alongMin) / 2 - coast;
        const middle = (alongMin + alongMax) / 2;
        const count = Math.max(Math.round((half * 2) / CROSSING_SPACING), 1);
        const crossings: number[] = [];
        for (let c = 0; c < count; c++) {
            const at = middle - half + ((c + 0.5) / count) * half * 2;
            crossings.push(Math.round(at + (rng() - 0.5) * 10));
        }
        const side = rng() < 0.5 ? -1 : 1;
        const acrossHalf = (acrossMax - acrossMin) / 2 - coast;
        rivers.push({
            vertical,
            line: Math.round(
                (acrossMin + acrossMax) / 2 + side * Math.max(acrossHalf * (0.3 + rng() * 0.4), 13),
            ),
            crossings,
            wiggle: createNoise(settings.seed + 100 + i, 1),
            amount: Math.max(half * 0.2, 10),
            halfWidth: settings.riverWidth / 2,
            levels: new Float32Array((vertical ? build.corners.y : build.corners.x) + 1),
            drops: [],
        });
        const river = rivers[rivers.length - 1];
        if (hasRelief(settings)) {
            river.valley = findValley(build, river);
            river.amount *= 0.3;
        }
    }
    return rivers;
}

// The low ground along a river: for each step along, the column that climbs least, each
// a column at most from the last (seam carving). It keeps to its side of the arena, so that
// two rivers don't end up in one valley.
function findValley(build: Build, river: River): Float32Array {
    const { arena, corners, terrain, settings } = build;
    const [alongCount, acrossCount] = river.vertical
        ? [corners.y, corners.x]
        : [corners.x, corners.y];
    const [low, high] = river.vertical ? [arena.x0, arena.x1] : [arena.y0, arena.y1];
    const width = high - low + 1;
    const span = Math.max(width * 0.3, 16);
    const heightAt = (along: number, across: number) =>
        terrain.height[river.vertical ? across + along * corners.x : along + across * corners.x];
    const totals = new Float32Array(alongCount * width);
    const from = new Int8Array(alongCount * width);
    for (let along = 0; along < alongCount; along++) {
        for (let at = 0; at < width; at++) {
            const across = low + at;
            const offset = Math.abs(across - river.line);
            const cost =
                (heightAt(along, across) * VALLEY_SEEK) / 16 + Math.max(offset - span, 0) * 2;
            let best = 0;
            let way = 0;
            if (along > 0) {
                best = Infinity;
                for (let step = -1; step <= 1; step++) {
                    const next = at + step;
                    if (next >= 0 && next < width) {
                        const total = totals[next + (along - 1) * width];
                        if (total < best) {
                            best = total;
                            way = step;
                        }
                    }
                }
            }
            totals[at + along * width] = best + cost;
            from[at + along * width] = way;
        }
    }
    let end = 0;
    for (let at = 1; at < width; at++) {
        if (totals[at + (alongCount - 1) * width] < totals[end + (alongCount - 1) * width]) {
            end = at;
        }
    }
    const valley = new Float32Array(alongCount);
    for (let along = alongCount - 1, at = end; along >= 0; along--) {
        valley[along] = low + at;
        at += from[at + along * width];
    }
    // Smooth it out, with a wider reach the more it can wander
    const reach = Math.max(Math.round(settings.ridgeScale / 4), 6);
    return smoothLine(valley, reach);
}

function smoothLine(line: Float32Array, reach: number): Float32Array {
    const out = new Float32Array(line.length);
    for (let i = 0; i < line.length; i++) {
        const span = Math.min(reach, i, line.length - 1 - i);
        let sum = 0;
        for (let j = i - span; j <= i + span; j++) {
            sum += line[j];
        }
        out[i] = sum / (span * 2 + 1);
    }
    return out;
}

// The arena's edge with its corners rounded off: tiles in from it, negative outside
function toRoundedEdge(build: Build, x: number, y: number): number {
    const { arena } = build;
    const halfX = (arena.x1 + 1 - arena.x0) / 2;
    const halfY = (arena.y1 + 1 - arena.y0) / 2;
    const radius = Math.min(halfX, halfY) * 0.6;
    const dx = Math.abs(x - (arena.x0 + halfX));
    const dy = Math.abs(y - (arena.y0 + halfY));
    const cornerX = dx - (halfX - radius);
    const cornerY = dy - (halfY - radius);
    if (cornerX > 0 && cornerY > 0) {
        return radius - Math.hypot(cornerX, cornerY);
    }
    return Math.min(halfX - dx, halfY - dy);
}

// Where the water goes, as fields per tile corner: above 0 is water. Fields rather
// than tiles so that its edges can be smooth lines.
export function createWaterFields(build: Build, rivers: River[], hills: Noise) {
    const { settings, arena, rng, corners, spawn } = build;
    const pools: Pool[] = [];
    const rough = settings.shoreRoughness;
    const coast = createNoise(settings.seed + 1, rough > 0.7 ? 3 : 2);
    const shape = createNoise(settings.seed + 2, 1);
    const count = corners.x * corners.y;
    const sea = new Float32Array(count).fill(-100);
    const fresh = new Float32Array(count).fill(-100);
    // Low ground flooded, which stands at the lowest level there is
    const flood = new Uint8Array(count);

    if (settings.boundary === "sea") {
        const depth = getCoastDepth(build);
        const span = lerp(40, 14, rough);
        const amount = 4 + rough * 30;
        for (let y = 0; y < corners.y; y++) {
            for (let x = 0; x < corners.x; x++) {
                const wobble = (coast(x / span, y / span) - 0.5) * amount;
                sea[x + y * corners.x] = depth - toRoundedEdge(build, x, y) - wobble;
            }
        }
    }

    // Low ground floods
    if (settings.waterLevel > 0) {
        const line = 0.28 + settings.waterLevel * 0.42;
        for (let y = 0; y < corners.y; y++) {
            for (let x = 0; x < corners.x; x++) {
                const low = line - hills(x / settings.hillScale, y / settings.hillScale);
                fresh[x + y * corners.x] = low * 80;
                flood[x + y * corners.x] = low > -0.1 ? 1 : 0;
            }
        }
    }

    for (const river of rivers) {
        const [alongCount, acrossCount] = river.vertical
            ? [corners.y, corners.x]
            : [corners.x, corners.y];
        for (let along = 0; along < alongCount; along++) {
            const centre = riverCentre(river, along);
            const half = riverHalfWidth(river, along);
            const reach = half + 8;
            const first = Math.max(Math.floor(centre - reach), 0);
            const last = Math.min(Math.ceil(centre + reach), acrossCount - 1);
            for (let across = first; across <= last; across++) {
                const i = river.vertical ? across + along * corners.x : along + across * corners.x;
                fresh[i] = Math.max(fresh[i], half - Math.abs(across - centre));
            }
        }
    }

    const addPool = (radius: number) => {
        // Anywhere in the arena, clear of the spawn
        const x = lerp(arena.x0, arena.x1, rng());
        const y = lerp(arena.y0, arena.y1, rng());
        pools.push({ x, y, radius, level: 0 });
        const reach = radius * 1.5 + 8;
        const x0 = Math.max(Math.floor(x - reach), 0);
        const x1 = Math.min(Math.ceil(x + reach), corners.x - 1);
        const y0 = Math.max(Math.floor(y - reach), 0);
        const y1 = Math.min(Math.ceil(y + reach), corners.y - 1);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const wobble = (shape(cx / 14, cy / 14) - 0.5) * radius * (0.6 + rough);
                const edge = radius + wobble - Math.hypot(cx - x, cy - y);
                const i = cx + cy * corners.x;
                fresh[i] = Math.max(fresh[i], edge);
            }
        }
    };
    for (let i = 0; i < settings.lakes; i++) {
        addPool(14 + rng() * 14);
    }
    for (let i = 0; i < settings.ponds; i++) {
        addPool(4 + rng() * 6);
    }

    const smooth = (field: Float32Array) => {
        const out = smoothField(field, corners.x, corners.y, 3);
        // Nothing round the spawn
        for (let y = 0; y < corners.y; y++) {
            for (let x = 0; x < corners.x; x++) {
                const away = Math.hypot(x - spawn.x, y - spawn.y) - SPAWN_CLEAR;
                out[x + y * corners.x] = Math.min(out[x + y * corners.x], away);
            }
        }
        return out;
    };
    return { sea: smooth(sea), fresh: smooth(fresh), flood, pools };
}

// Takes the land down to the sea, over a few tiles
export function sinkSea(build: Build, toSea: Float32Array): void {
    const { terrain, corners } = build;
    const { height } = terrain;
    for (let y = 0; y < corners.y; y++) {
        for (let x = 0; x < corners.x; x++) {
            const at = terrain.corner(x, y);
            const share = Math.min(getCornerDistance(build, toSea, x, y) / 8, 1);
            height[at] = SEA_BED + (height[at] - SEA_BED) * share;
        }
    }
}

// How high a river's water stands along its length: under the ground, always downhill to
// its lower end, and level at a crossing for a bridge's sake. One with the sea at both ends
// runs down to each from its highest point.
function setRiverLevels(build: Build, river: River): void {
    const { terrain, corners } = build;
    const count = river.vertical ? corners.y : corners.x;
    const { levels } = river;
    const heightAt = (along: number) => {
        const across = riverCentre(river, along);
        return river.vertical ? terrain.getHeight(across, along) : terrain.getHeight(along, across);
    };
    let high = 0;
    for (let along = 0; along < count; along++) {
        levels[along] = Math.max(heightAt(along) - WATER_DROP, RIVER_BED);
        if (levels[along] > levels[high]) {
            high = along;
        }
    }
    const first = levels[0];
    const last = levels[count - 1];
    const fall = (start: number, end: number) => {
        const way = Math.sign(end - start);
        for (let along = start + way; along !== end + way; along += way) {
            levels[along] = Math.min(levels[along], levels[along - way]);
        }
    };
    if (first < RIVER_BED + 2 && last < RIVER_BED + 2) {
        fall(high, 0);
        fall(high, count - 1);
    } else if (first > last) {
        fall(0, count - 1);
    } else {
        fall(count - 1, 0);
    }
    for (const crossing of river.crossings) {
        const level = levels[Math.min(Math.max(crossing, 0), count - 1)];
        for (
            let along = crossing - LEVEL_AT_CROSSING;
            along <= crossing + LEVEL_AT_CROSSING;
            along++
        ) {
            if (along >= 0 && along < count) {
                levels[along] = level;
            }
        }
    }
    levels.set(smoothLine(levels, 3));
    stepRiver(build, river);
}

// Gathers a river's fall into drops, for waterfalls, away from crossings
function stepRiver(build: Build, river: River): void {
    const { settings } = build;
    if (settings.waterfalls <= 0) {
        return;
    }
    const { levels } = river;
    const roll = createRng(settings.seed + 300 + river.line);
    const clear = (along: number) =>
        river.crossings.every(
            (crossing) => Math.abs(along - crossing) > LEVEL_AT_CROSSING + WATERFALL_RUN,
        );
    const way = levels[0] >= levels[levels.length - 1] ? 1 : -1;
    const first = way > 0 ? 0 : levels.length - 1;
    let held = levels[first];
    let last = -Infinity;
    for (let along = first; along >= 0 && along < levels.length; along += way) {
        const drop = held - levels[along];
        const due = Math.abs(along - last) >= WATERFALL_SPACING;
        if (drop >= WATERFALL_DROP && due && clear(along) && roll() < settings.waterfalls) {
            river.drops.push({ along, level: levels[along] });
            held = levels[along];
            last = along;
        } else if (!clear(along)) {
            held = levels[along];
        }
        levels[along] = held;
    }
}

// How high the fresh water stands at each corner, and everywhere else the height of the
// nearest water
export function createWaterLevels(
    build: Build,
    rivers: River[],
    pools: Pool[],
    fresh: Float32Array,
    flood: Uint8Array,
): Float32Array {
    const { terrain, corners } = build;
    const levels = new Float32Array(fresh.length).fill(Infinity);
    for (const river of rivers) {
        setRiverLevels(build, river);
        const [alongCount, acrossCount] = river.vertical
            ? [corners.y, corners.x]
            : [corners.x, corners.y];
        for (let along = 0; along < alongCount; along++) {
            const centre = riverCentre(river, along);
            const reach = riverHalfWidth(river, along) + 8;
            const first = Math.max(Math.floor(centre - reach), 0);
            const last = Math.min(Math.ceil(centre + reach), acrossCount - 1);
            for (let across = first; across <= last; across++) {
                const i = river.vertical ? across + along * corners.x : along + across * corners.x;
                levels[i] = Math.min(levels[i], river.levels[along]);
            }
        }
    }
    // A pool's as high as its lowest shore, or as what runs into it, and it's level all
    // over: a step in water shows as a dark line across it
    const forPoolCorners = (pool: Pool, visit: (i: number) => void) => {
        const reach = pool.radius * 1.5 + 8;
        const x0 = Math.max(Math.floor(pool.x - reach), 0);
        const x1 = Math.min(Math.ceil(pool.x + reach), corners.x - 1);
        const y0 = Math.max(Math.floor(pool.y - reach), 0);
        const y1 = Math.min(Math.ceil(pool.y + reach), corners.y - 1);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const i = cx + cy * corners.x;
                if (fresh[i] > -8) {
                    visit(i);
                }
            }
        }
    };
    for (const pool of pools) {
        pool.level = Infinity;
        const reach = pool.radius * 1.5 + 8;
        for (let a = 0; a < 24; a++) {
            const angle = (a / 24) * Math.PI * 2;
            const x = pool.x + Math.cos(angle) * reach;
            const y = pool.y + Math.sin(angle) * reach;
            pool.level = Math.min(pool.level, terrain.getHeight(x, y) - WATER_DROP);
        }
        forPoolCorners(pool, (i) => {
            pool.level = Math.min(pool.level, levels[i]);
        });
        pool.level = Math.max(pool.level, RIVER_BED);
    }
    const touches = (pool: Pool, other: Pool) =>
        Math.hypot(pool.x - other.x, pool.y - other.y) < (pool.radius + other.radius) * 1.5 + 16;
    for (const pool of pools) {
        for (const other of pools) {
            if (touches(pool, other)) {
                pool.level = Math.min(pool.level, other.level);
            }
        }
    }
    for (const pool of pools) {
        forPoolCorners(pool, (i) => {
            levels[i] = pool.level;
        });
    }
    for (let i = 0; i < levels.length; i++) {
        if (flood[i]) {
            levels[i] = RIVER_BED;
        }
    }
    spreadNearest(levels, corners.x, corners.y);
    return levels;
}

// Takes the land down to the fresh water. Tall ground needs a wider valley to get down in,
// as wide as the setting says.
export function sinkFresh(build: Build, toFresh: Float32Array, levels: Float32Array): void {
    const { terrain, corners, settings } = build;
    const { height } = terrain;
    const slope = lerp(GORGE_SLOPE, VALLEY_SLOPE, settings.riverValley);
    for (let y = 0; y < corners.y; y++) {
        for (let x = 0; x < corners.x; x++) {
            const at = terrain.corner(x, y);
            const level = levels[at];
            if (level === Infinity) {
                continue;
            }
            const bank = Math.max((height[at] - level) / slope, MIN_BANK);
            const share = Math.min(getCornerDistance(build, toFresh, x, y) / bank, 1);
            height[at] = level + (height[at] - level) * share;
        }
    }
}

// The corners of water tiles: nothing moves them from here on
export function holdWater(build: Build, tiles: Uint8Array): void {
    const { sizeX, sizeY, corners, heldCorners } = build;
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            if (tiles[x + y * sizeX]) {
                const at = x + y * corners.x;
                heldCorners[at] = 1;
                heldCorners[at + 1] = 1;
                heldCorners[at + corners.x] = 1;
                heldCorners[at + corners.x + 1] = 1;
            }
        }
    }
}

// Foam along the foot of a river's drops
export function placeWaterfalls(build: Build, rivers: River[]): void {
    const { ground, biomeAt } = build;
    for (const river of rivers) {
        for (const { along } of river.drops) {
            const centre = riverCentre(river, along);
            const half = riverHalfWidth(river, along);
            const middle = Math.round(centre);
            if ((river.vertical ? biomeAt(middle, along) : biomeAt(along, middle)).molten) {
                continue;
            }
            for (let at = -half; at + WATERFALL_WIDTH <= half; at += WATERFALL_WIDTH) {
                const across = Math.round(centre + at);
                ground.grid.locs.push({
                    id: WATERFALL,
                    type: LOC_NORMAL,
                    rotation: river.vertical ? 0 : 1,
                    level: 0,
                    x: river.vertical ? across : along,
                    y: river.vertical ? along : across,
                });
            }
        }
    }
}

// A river's line at a crossing: bridges stand on whole tiles
export function getCrossingLine(river: River, crossing: number): number {
    return Math.round(riverLine(river, crossing));
}
