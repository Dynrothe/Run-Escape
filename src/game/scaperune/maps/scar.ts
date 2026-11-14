import { Ground } from "../Ground";
import { assertReachable, getCollisionFlags, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, type PlacedLoc, TILE_BLOCKED } from "../format";
import type { GeneratedMap } from "../generator";
import { LOC_NORMAL } from "../mapBuild";
import { createNoise, createRng } from "../noise";
import { cutPrefab } from "../prefab";
import type { BuildContext, MapPoint, MapRecipe } from "../recipe";

// The Scar, Act II's fourth map (content/maps.ts, docs/design/act-2-fallen-empire.md section 6):
// the real Scar, map squares 31 to 32 by 99 to 100, cut whole from the cache. In OSRS it's a sea
// of abyssal sludge with islands of flesh in it, walked only on the islands: three quarters of it
// is sludge, blocked. So the sea's drained here to the flesh under it, the Scar's cracked floor
// laid over it, and the sludge left in pools and along the shore, a band round the arena that
// runs out into the margin's sea, its islets standing in it. The islands stay as they are: the
// Abyssal Rift's in the north-west and the brain, west and north, whole along its edge and black
// in its middle as in the cache; the Leviathan's island comes off, his pool left in the open. Its
// models are drawn lighter (LocOverrides.ts MODEL_SIMPLIFY) so a phone can show it all. Its kit (nerves, brain matter, broken boats and pillars, vents) is scattered over
// what's drained, and its fires stand where the map's lights are (content/scar.ts).
//
// What the rule and the bosses read off it is exported here, in grid tiles: the fires, the
// Leviathan's pool, and his fight's square.

const MAP_X = 62;
const MAP_Y = 120;
const SQUARES = 4;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;
const ARENA_0 = MARGIN * MAP_SQUARE_SIZE;
const ARENA_1 = (SQUARES - MARGIN) * MAP_SQUARE_SIZE - 1;
// The real squares under the arena's south-west corner
const REAL = { x: 31 * MAP_SQUARE_SIZE, y: 99 * MAP_SQUARE_SIZE };

type Tile = { x: number; y: number };

const toGrid = (realX: number, realY: number): Tile => ({
    x: realX - REAL.x + ARENA_0,
    y: realY - REAL.y + ARENA_0,
});

// Floors, as the map files store them: the sludge (a grey-green that hides what's under it), the
// darker flesh (the cache's other, 186, is lighter), and the cache's hidden floor (drawn as
// nothing), under the brain
const SLUDGE = 302;
const FLESH = 185;
const HIDDEN = 42;

// The Leviathan's island: the brain's rim round his pool, its walls and its bits. It comes off
// whole (islandTiles), so the pool's fought from open ground: the rim's walkway is a level of its
// own over the floor, and a view of it was 80k triangles on a phone. Cut at a radius, it left
// stubs of rim standing in a ring.
const ISLAND_RIM = new Set([49224, 49225, 49226, 49227, 49370, 47593, 47594, 49354, 49355, 49356]);
const ISLAND_OPEN = 12;
// and as far as it reaches, so the islets round it stay
const ISLAND_MAX = 18;

// The brain's pieces (all unnamed in the cache): its walls (49223), the tops of its rims (49232 to
// 49235), the islets' low rims (49224 to 49227) and the black filler of its middle (49236). It's
// drawn BRAIN_DEPTH tiles in from its edge, then a ring of the filler (hollowBrain)
const BRAIN = new Set([49223, 49224, 49225, 49226, 49227, 49232, 49233, 49234, 49235, 49236]);
const BRAIN_FILLER = 49236;
const BRAIN_DEPTH = 2;

// The Scar's kit, all the cache's own
const FIRE = 49342;
const NERVES = [49357, 49358, 49359, 49361, 49362];
const NERVE_PAIRS = [49360, 49363, 49364, 49365];
const NERVE_FORMATIONS = [49366, 49367, 49368];
const BRAIN_MATTER = [49354, 49355, 49356];
const BROKEN_BOATS = [49244, 49245, 49246];
const BROKEN_PILLARS = [49239, 49240];
const VENT = 49388;
const DRIP = 15727;
const BUBBLES = [45538, 45539];
// The cracks in the Scar's floor, walked over (its islands' own), and the ripples on its sludge,
// which come off what's drained
const CRACKS = Array.from({ length: 36 }, (_, i) => 49247 + i);
// Of the drained floor's tiles, cracked
const CRACK_SHARE = 0.1;
const RIPPLES = new Set([49376, 49377, 49378, 49379, 49380, 49381, 49382, 49383, 49384, 49385]);
// How far under the floor round it the sludge lies (height units)
const SLUDGE_DIP = 6;
// and how many tiles round it the flesh is the darker of the cache's two
const SHORE_DARK = 2;

// Thinned for phones (view-weight.ts PHONE=1, then frameProbe): the share of each heavy piece of
// the islands' kept, by id
const KEPT: Record<number, number> = {
    // The floor's cracks: dozens in a view, many triangles each
    ...Object.fromEntries(CRACKS.map((id) => [id, 0.35])),
    // Brain matter, and its lumps
    49351: 0.2,
    49352: 0.2,
    49353: 0.2,
    49354: 0.2,
    49355: 0.2,
    49356: 0.2,
    // Broken pillars and boats
    49239: 0.5,
    49240: 0.5,
    49244: 0.6,
    49245: 0.6,
    49246: 0.6,
    // Nerves and their formations
    49357: 0.25,
    49358: 0.25,
    49359: 0.25,
    49360: 0.25,
    49361: 0.25,
    49362: 0.25,
    49363: 0.25,
    49364: 0.25,
    49365: 0.25,
    49366: 0.25,
    49367: 0.25,
    49368: 0.25,
};

// The Leviathan's pool, where he rises (npc-spawns), and its radius: sludge, blocked
export const SCAR_POOL = { ...toGrid(2081, 6372), radius: 4 };
// His fight's square round it: the party's held in it while he's up
export const SCAR_BOSS_ARENA = { x: SCAR_POOL.x - 15, y: SCAR_POOL.y - 15, size: 31 };

// Where the run starts: the drained middle, south of the rift's island
export const SCAR_START: Tile = { x: 124, y: 120 };
const START = SCAR_START;

// The fires (2 by 2, from their south-west tiles): lights that stay lit (content/scar.ts), spread
// so no ground's far from one, and none in his square
export const SCAR_FIRES: Tile[] = [
    { x: 90, y: 92 },
    { x: 128, y: 82 },
    { x: 112, y: 108 },
    { x: 160, y: 78 },
    { x: 150, y: 140 },
    { x: 182, y: 124 },
    { x: 146, y: 160 },
    { x: 176, y: 160 },
    { x: 100, y: 164 },
];

// The sludge's pools on the drained floor, rx by ry tiles about their middles
const POOLS = [
    { x: 100, y: 118, rx: 6, ry: 4 },
    { x: 142, y: 116, rx: 5, ry: 7 },
    { x: 160, y: 176, rx: 7, ry: 4 },
    { x: 84, y: 76, rx: 7, ry: 5 },
    { x: 116, y: 96, rx: 5, ry: 4 },
    { x: 178, y: 84, rx: 4, ry: 6 },
];

const POINTS: MapPoint[] = [
    { name: "start", ...START },
    { name: "the Leviathan's island", x: SCAR_POOL.x, y: SCAR_POOL.y - 7 },
    { name: "the rift's island", x: 118, y: 166 },
    ...SCAR_FIRES.map((f, i) => ({ name: `fire ${i}'s side`, x: f.x - 1, y: f.y })),
];

// The same hash for a tile wherever it's built, so the map's the same every time
const hash = (x: number, y: number, id = 0) =>
    ((Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(id, 2246822519)) >>> 0) /
    0xffffffff;

// The island, opened
function islandOpen(x: number, y: number): boolean {
    const dx = x - SCAR_POOL.x;
    const dy = y - SCAR_POOL.y;
    return dx * dx + dy * dy <= ISLAND_OPEN * ISLAND_OPEN;
}

// The Leviathan's island, whole: the open circle round his pool, and every tile of its rim (or its
// deck) joined to it, so none of it's left standing in pieces
function islandTiles(scar: Scar): Uint8Array {
    const { ground } = scar;
    const rim = new Uint8Array(SIZE * SIZE);
    for (const loc of ground.grid.locs) {
        if (loc.level === 0 && ISLAND_RIM.has(loc.id) && !BRAIN_MATTER.includes(loc.id)) {
            rim[ground.tile(loc.x, loc.y)] = 1;
        }
    }
    for (const upper of ground.grid.levels.slice(1)) {
        for (let i = 0; i < rim.length; i++) {
            if (upper.underlays[i] || upper.overlays[i]) {
                rim[i] = 1;
            }
        }
    }
    const island = new Uint8Array(SIZE * SIZE);
    const front: number[] = [];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (islandOpen(x, y)) {
                island[ground.tile(x, y)] = 1;
                front.push(ground.tile(x, y));
            }
        }
    }
    while (front.length > 0) {
        const i = front.pop()!;
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const j = ground.tile(x + dx, y + dy);
                const far = Math.hypot(x + dx - SCAR_POOL.x, y + dy - SCAR_POOL.y) > ISLAND_MAX;
                if (ground.inside(x + dx, y + dy) && rim[j] && !island[j] && !far) {
                    island[j] = 1;
                    front.push(j);
                }
            }
        }
    }
    return island;
}

function inArena(x: number, y: number): boolean {
    return x >= ARENA_0 && x <= ARENA_1 && y >= ARENA_0 && y <= ARENA_1;
}

// How much a corner is sludge, above 0: the shore's band and the pools
function sludgeField(x: number, y: number, shoreNoise: (x: number, y: number) => number): number {
    const edge = Math.min(x - ARENA_0, ARENA_1 + 1 - x, y - ARENA_0, ARENA_1 + 1 - y);
    const shore = 3 + shoreNoise(x / 14, y / 14) * 6 - edge;
    let pool = -1;
    for (const p of POOLS) {
        const dx = (x - p.x) / p.rx;
        const dy = (y - p.y) / p.ry;
        pool = Math.max(pool, 1 - Math.sqrt(dx * dx + dy * dy));
    }
    return Math.max(shore, pool * 4);
}

// His pool: sludge, but not blocked, as he stands in it (solid) and the sim needs him there
function poolField(x: number, y: number): number {
    const dx = x - SCAR_POOL.x;
    const dy = y - SCAR_POOL.y;
    return SCAR_POOL.radius - Math.sqrt(dx * dx + dy * dy);
}

class Scar {
    readonly ground = new Ground(SIZE, SIZE);
    readonly rng = createRng(31996);
    // Tiles kept clear of scenery: the start, the fires, his island
    readonly keep = new Uint8Array(SIZE * SIZE);
    blocked = new Uint8Array(SIZE * SIZE);
    // Next to what the cache has standing (Scar.occupied), where the kit doesn't go
    near?: Uint8Array;

    constructor(readonly context: BuildContext) {}

    keepClear(x: number, y: number, sizeX: number, sizeY: number, gap: number): void {
        for (let ty = y - gap; ty < y + sizeY + gap; ty++) {
            for (let tx = x - gap; tx < x + sizeX + gap; tx++) {
                if (this.ground.inside(tx, ty)) {
                    this.keep[this.ground.tile(tx, ty)] = 1;
                }
            }
        }
    }

    isFree(x: number, y: number, sizeX: number, sizeY: number): boolean {
        for (let ty = y; ty < y + sizeY; ty++) {
            for (let tx = x; tx < x + sizeX; tx++) {
                if (!inArena(tx, ty)) {
                    return false;
                }
                const i = this.ground.tile(tx, ty);
                if (this.keep[i] || this.blocked[i] || this.near?.[i]) {
                    return false;
                }
            }
        }
        return true;
    }

    // Something solid, its size the cache's, turned; with gap tiles clear round it
    solid(id: number, x: number, y: number, rotation = 0, check = true, gap = 0): boolean {
        const info = this.context.locs(id);
        const turned = rotation % 2 === 1;
        const sizeX = turned ? info.sizeY : info.sizeX;
        const sizeY = turned ? info.sizeX : info.sizeY;
        if (check && !this.isFree(x - gap, y - gap, sizeX + gap * 2, sizeY + gap * 2)) {
            return false;
        }
        this.ground.grid.locs.push({ id, type: LOC_NORMAL, rotation, level: 0, x, y });
        for (let ty = y; ty < y + sizeY; ty++) {
            for (let tx = x; tx < x + sizeX; tx++) {
                this.blocked[this.ground.tile(tx, ty)] = 1;
            }
        }
        return true;
    }

    // The tiles under anything standing, and those round them: where floor decoration would
    // fight with it
    occupied(): Uint8Array {
        const { ground } = this;
        const occupied = new Uint8Array(SIZE * SIZE);
        for (const loc of ground.grid.locs) {
            if (loc.level !== 0 || loc.type === 22) {
                continue;
            }
            const [sizeX, sizeY] = this.footprint(loc);
            for (let ty = loc.y - 1; ty <= loc.y + sizeY; ty++) {
                for (let tx = loc.x - 1; tx <= loc.x + sizeX; tx++) {
                    if (ground.inside(tx, ty)) {
                        occupied[ground.tile(tx, ty)] = 1;
                    }
                }
            }
        }
        return occupied;
    }

    footprint(loc: PlacedLoc): [number, number] {
        const info = this.context.locs(loc.id);
        const turned = loc.rotation % 2 === 1;
        const big = loc.type === 10 || loc.type === 11;
        return big ? (turned ? [info.sizeY, info.sizeX] : [info.sizeX, info.sizeY]) : [1, 1];
    }

    // Walked over, a crack in the floor
    decal(id: number, x: number, y: number, rotation: number): void {
        this.ground.grid.locs.push({ id, type: 22, rotation, level: 0, x, y });
    }
}

function drain(scar: Scar): Uint8Array {
    const { ground, context } = scar;
    const cut = cutPrefab(context.maps, REAL.x, REAL.y, 2 * MAP_SQUARE_SIZE, 2 * MAP_SQUARE_SIZE);
    ground.stamp(cut, ARENA_0, ARENA_0, {
        floor: "all",
        feather: 0,
        flatten: false,
        height: 0,
        anchor: 0,
    });
    const level = ground.level0;
    // The island comes off whole, so nothing's left of its rim standing about: its top's a level
    // of its own over the floor (a bridge's deck, in the map's terms), gone with it
    const island = islandTiles(scar);
    ground.grid.locs = ground.grid.locs.filter(
        (loc) => !island[ground.tile(loc.x, loc.y)] || (loc.level === 0 && !ISLAND_RIM.has(loc.id)),
    );
    // The cache has drips falling into its bubbling pools (45538, 45539), in one plane with them
    const bubbling = new Uint8Array(SIZE * SIZE);
    for (const loc of ground.grid.locs) {
        if (BUBBLES.includes(loc.id)) {
            const [sizeX, sizeY] = scar.footprint(loc);
            for (let ty = loc.y; ty < loc.y + sizeY; ty++) {
                for (let tx = loc.x; tx < loc.x + sizeX; tx++) {
                    bubbling[ground.tile(tx, ty)] = 1;
                }
            }
        }
    }
    ground.grid.locs = ground.grid.locs.filter(
        (loc) => loc.id !== DRIP || !bubbling[ground.tile(loc.x, loc.y)],
    );
    for (let i = 0; i < island.length; i++) {
        if (!island[i]) {
            continue;
        }
        level.flags[i] &= ~TILE_BLOCKED;
        // What was under the rim is the flesh, as round it
        if (level.overlays[i] === HIDDEN) {
            level.overlays[i] = 0;
            level.shapes[i] = 0;
        }
        if (!level.underlays[i]) {
            level.underlays[i] = FLESH;
        }
        for (const upper of ground.grid.levels.slice(1)) {
            upper.overlays[i] = 0;
            upper.underlays[i] = 0;
            upper.shapes[i] = 0;
            upper.flags[i] = 0;
        }
    }
    // Where the sea was: drained, but for what's painted back
    const drained = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = ground.tile(x, y);
            if (!inArena(x, y)) {
                level.underlays[i] = FLESH;
                continue;
            }
            if (level.overlays[i] === SLUDGE) {
                level.overlays[i] = 0;
                level.shapes[i] = 0;
                level.rotations[i] = 0;
                level.flags[i] &= ~TILE_BLOCKED;
                drained[i] = 1;
                // A few of the sea's tiles have no ground under the sludge
                if (!level.underlays[i]) {
                    level.underlays[i] = FLESH;
                }
            }
        }
    }
    // The margin's flat, and eases down to it from the arena's edge
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            const out = Math.max(ARENA_0 - x, x - (ARENA_1 + 1), ARENA_0 - y, y - (ARENA_1 + 1));
            if (out > 0) {
                ground.setHeight(x, y, 0);
            }
        }
    }
    // The sludge back: the shore's band and the margin, the pools, his pool
    const shoreNoise = createNoise(31997, 2);
    const field = new Float32Array((SIZE + 1) * (SIZE + 1));
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            field[x + y * (SIZE + 1)] = sludgeField(x, y, shoreNoise);
        }
    }
    // Over the drained sea, the margin and the islands' own floor, so the shore runs on round an
    // island, its rims standing in it as in the cache, rather than stopping in a step at its
    // tiles: not over the brain's hidden floor or an island's deck
    const skip = new Uint8Array(SIZE * SIZE);
    const upper = ground.grid.levels[1];
    for (let i = 0; i < skip.length; i++) {
        const hidden = level.overlays[i] === HIDDEN || upper.underlays[i] || upper.overlays[i];
        skip[i] = inArena(i % SIZE, Math.floor(i / SIZE)) && !drained[i] && hidden ? 1 : 0;
    }
    const painted = ground.paintField(field, SLUDGE, true, skip);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            field[x + y * (SIZE + 1)] = poolField(x, y);
        }
    }
    const pool = ground.paintField(field, SLUDGE, false);
    for (let i = 0; i < drained.length; i++) {
        if (painted[i] || pool[i]) {
            drained[i] = 0;
        }
        if (pool[i]) {
            level.flags[i] &= ~TILE_BLOCKED;
        }
    }
    // The sludge's ripples off what's drained, and on what's painted back now and then
    ground.grid.locs = ground.grid.locs.filter(
        (loc) => !RIPPLES.has(loc.id) || level.overlays[ground.tile(loc.x, loc.y)] === SLUDGE,
    );
    levelSludge(scar);
    // The flesh darkens to its shore: the cache's darker flesh (its islands are both) for a
    // couple of tiles round the sludge, which the underlays' blending runs into the floor
    const isSludge = (x: number, y: number) =>
        ground.inside(x, y) && level.overlays[ground.tile(x, y)] === SLUDGE;
    for (let y = ARENA_0; y <= ARENA_1; y++) {
        for (let x = ARENA_0; x <= ARENA_1; x++) {
            let near = false;
            for (let dy = -SHORE_DARK; dy <= SHORE_DARK && !near; dy++) {
                for (let dx = -SHORE_DARK; dx <= SHORE_DARK && !near; dx++) {
                    near = isSludge(x + dx, y + dy);
                }
            }
            if (near) {
                level.underlays[ground.tile(x, y)] = FLESH;
            }
        }
    }
    return drained;
}

// The sludge lies level, a little under the floor round it, as water does: the ground the cache
// has under it rolls, and slopes catch the light, so a sludge rolling with it shows streaks. Each
// body of it (corners with sludge all round, joined) is set at the lowest of its shore's corners
// in the arena, less SLUDGE_DIP, so its edge is a bank down to it; the sea in the margin with it
function levelSludge(scar: Scar): void {
    const { ground } = scar;
    const level = ground.level0;
    const C = SIZE + 1;
    const isSludge = (x: number, y: number) =>
        ground.inside(x, y) && level.overlays[ground.tile(x, y)] === SLUDGE;
    const under = new Uint8Array(C * C);
    for (let y = 1; y < SIZE; y++) {
        for (let x = 1; x < SIZE; x++) {
            const all =
                isSludge(x, y) &&
                isSludge(x - 1, y) &&
                isSludge(x, y - 1) &&
                isSludge(x - 1, y - 1);
            const any =
                isSludge(x, y) ||
                isSludge(x - 1, y) ||
                isSludge(x, y - 1) ||
                isSludge(x - 1, y - 1);
            under[x + y * C] = all ? 2 : any ? 1 : 0;
        }
    }
    const seen = new Uint8Array(C * C);
    for (let start = 0; start < under.length; start++) {
        if (under[start] !== 2 || seen[start]) {
            continue;
        }
        const body = [start];
        seen[start] = 1;
        let low = Infinity;
        for (let h = 0; h < body.length; h++) {
            const x = body[h] % C;
            const y = Math.floor(body[h] / C);
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                const j = x + dx + (y + dy) * C;
                if (x + dx < 0 || y + dy < 0 || x + dx > SIZE || y + dy > SIZE) {
                    continue;
                }
                const shore = x + dx >= ARENA_0 && x + dx <= ARENA_1 + 1 && y + dy >= ARENA_0;
                if (under[j] === 1 && shore && y + dy <= ARENA_1 + 1) {
                    low = Math.min(low, ground.getHeight(x + dx, y + dy));
                } else if (under[j] === 2 && !seen[j]) {
                    seen[j] = 1;
                    body.push(j);
                }
            }
        }
        const surface =
            (low === Infinity ? ground.getHeight(start % C, Math.floor(start / C)) : low) -
            SLUDGE_DIP;
        for (const at of body) {
            ground.setHeight(at % C, Math.floor(at / C), surface);
        }
    }
}

// The Scar's floor over what's drained: its cracks, and now and then its kit
function dress(scar: Scar, drained: Uint8Array): void {
    const { rng } = scar;
    const pick = <T>(list: T[]) => list[Math.floor(rng() * list.length)];
    const turn = () => Math.floor(rng() * 4);
    for (const fire of SCAR_FIRES) {
        scar.keepClear(fire.x, fire.y, 2, 2, 2);
    }
    scar.keepClear(START.x - 3, START.y - 3, 7, 7, 0);
    scar.keepClear(
        SCAR_BOSS_ARENA.x + 4,
        SCAR_BOSS_ARENA.y + 4,
        SCAR_BOSS_ARENA.size - 8,
        SCAR_BOSS_ARENA.size - 8,
        0,
    );
    scar.near = scar.occupied();
    for (const fire of SCAR_FIRES) {
        scar.solid(FIRE, fire.x, fire.y, 0, false);
    }
    for (let y = ARENA_0 + 2; y <= ARENA_1 - 2; y++) {
        for (let x = ARENA_0 + 2; x <= ARENA_1 - 2; x++) {
            const i = scar.ground.tile(x, y);
            if (!drained[i]) {
                continue;
            }
            const roll = rng();
            if (roll < 0.004) {
                scar.solid(pick(NERVES), x, y, turn(), true, 1);
            } else if (roll < 0.0065) {
                scar.solid(pick(NERVE_PAIRS), x, y, turn(), true, 1);
            } else if (roll < 0.0078) {
                scar.solid(pick(NERVE_FORMATIONS), x, y, turn(), true, 2);
            } else if (roll < 0.0098) {
                scar.solid(pick(BRAIN_MATTER), x, y, turn(), true, 1);
            } else if (roll < 0.0108) {
                scar.solid(pick(BROKEN_PILLARS), x, y, turn(), true, 2);
            } else if (roll < 0.0114) {
                scar.solid(pick(BROKEN_BOATS), x, y, turn(), true, 2);
            } else if (roll < 0.0118) {
                scar.solid(VENT, x, y, turn(), true, 2);
            }
        }
    }
    // The cracks, last, and never under anything (its faces and theirs would fight)
    const { ground } = scar;
    const occupied = scar.occupied();
    for (let y = ARENA_0 + 2; y <= ARENA_1 - 2; y++) {
        for (let x = ARENA_0 + 2; x <= ARENA_1 - 2; x++) {
            const i = ground.tile(x, y);
            if (drained[i] && !occupied[i] && hash(x, y, 7) < CRACK_SHARE) {
                const id = CRACKS[Math.floor(hash(x, y, 11) * CRACKS.length)];
                scar.decal(id, x, y, Math.floor(hash(x, y, 13) * 4));
            }
        }
    }
}

// The brain's masses are thousands of one-tile pieces, and a view of the rift's island took 220k
// triangles of them: far too many for a phone. So the brain's kept whole only BRAIN_DEPTH tiles
// in from its edge, wherever that edge faces (the floor, the sludge): its walls, the masses on
// its rims, and masses behind them, so it's seen whole from anywhere it's seen. Deeper, the
// masses come off and show what the cache has under them, its hidden floor, drawn as nothing:
// as black as the dark round it, and further than any light reaches. The islands' kit is
// thinned (KEPT) the same way, what's gone still blocking (view-weight.ts PHONE=1, then
// frameProbe)
function hollowBrain(scar: Scar): Uint8Array {
    const { ground } = scar;
    const level = ground.level0;
    const brain = new Uint8Array(SIZE * SIZE);
    for (const loc of ground.grid.locs) {
        if (loc.level === 0 && BRAIN.has(loc.id)) {
            brain[ground.tile(loc.x, loc.y)] = 1;
        }
    }
    // Its depth: tiles from the nearest that isn't brain, in the arena (past it, nothing's seen)
    const depth = new Uint8Array(SIZE * SIZE).fill(255);
    let front: number[] = [];
    for (let i = 0; i < depth.length; i++) {
        if (!brain[i] && inArena(i % SIZE, Math.floor(i / SIZE))) {
            depth[i] = 0;
            front.push(i);
        }
    }
    for (let d = 1; d <= BRAIN_DEPTH + 1 && front.length > 0; d++) {
        const next: number[] = [];
        for (const i of front) {
            const x = i % SIZE;
            const y = Math.floor(i / SIZE);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const j = ground.tile(x + dx, y + dy);
                    if (ground.inside(x + dx, y + dy) && depth[j] > d) {
                        depth[j] = d;
                        next.push(j);
                    }
                }
            }
        }
        front = next;
    }
    // The brain's hollow, drawn as nothing
    const hollow = new Uint8Array(SIZE * SIZE);
    const filled = new Set<number>();
    ground.grid.locs = ground.grid.locs.filter((loc) => {
        const i = ground.tile(loc.x, loc.y);
        if (BRAIN.has(loc.id)) {
            if (depth[i] <= BRAIN_DEPTH) {
                return true;
            }
            // A ring of the cache's black filler behind what's kept, as in the brain's own middle,
            // so the rims' backs don't show against the hollow
            if (depth[i] === BRAIN_DEPTH + 1 && !filled.has(i)) {
                filled.add(i);
                Object.assign(loc, { id: BRAIN_FILLER, type: LOC_NORMAL, rotation: 0 });
                return true;
            }
            hollow[i] = 1;
            level.overlays[i] = HIDDEN;
            level.shapes[i] = 0;
            level.flags[i] |= TILE_BLOCKED;
            return false;
        }
        if (hash(loc.x, loc.y, loc.id) < (KEPT[loc.id] ?? 1)) {
            return true;
        }
        // What stood there still blocks, so the ground that's walked stays as it was
        if (loc.type !== 22) {
            const info = scar.context.locs(loc.id);
            const turned = loc.rotation % 2 === 1;
            const sizeX =
                loc.type === 10 || loc.type === 11 ? (turned ? info.sizeY : info.sizeX) : 1;
            const sizeY =
                loc.type === 10 || loc.type === 11 ? (turned ? info.sizeX : info.sizeY) : 1;
            if (info.clipType !== 0) {
                for (let ty = loc.y; ty < loc.y + sizeY; ty++) {
                    for (let tx = loc.x; tx < loc.x + sizeX; tx++) {
                        if (ground.inside(tx, ty)) {
                            level.flags[ground.tile(tx, ty)] |= TILE_BLOCKED;
                        }
                    }
                }
            }
        }
        return false;
    });
    // Anything else on the hollow comes off with it
    ground.grid.locs = ground.grid.locs.filter(
        (loc) => loc.level > 0 || !hollow[ground.tile(loc.x, loc.y)],
    );
    // The margin goes on as what's at the arena's edge: the brain's hollow, or the sea
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (inArena(x, y)) {
                continue;
            }
            const edge = ground.tile(
                Math.min(Math.max(x, ARENA_0), ARENA_1),
                Math.min(Math.max(y, ARENA_0), ARENA_1),
            );
            if (hollow[edge] || brain[edge]) {
                const i = ground.tile(x, y);
                hollow[i] = 1;
                level.overlays[i] = HIDDEN;
                level.shapes[i] = 0;
            }
        }
    }
    return hollow;
}

function build(context: BuildContext): GeneratedMap {
    const scar = new Scar(context);
    const drained = drain(scar);
    const { ground } = scar;
    // What blocks already, so what's added stands clear of it
    const flags = getCollisionFlags(ground.grid, context.locs);
    const level = ground.level0;
    for (let i = 0; i < scar.blocked.length; i++) {
        scar.blocked[i] = flags[i] !== 0 || (level.flags[i] & TILE_BLOCKED) !== 0 ? 1 : 0;
    }
    hollowBrain(scar);
    dress(scar, drained);
    // Nothing outside the arena is walked on
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (!inArena(x, y)) {
                level.flags[ground.tile(x, y)] |= TILE_BLOCKED;
            }
        }
    }
    const arena = { x0: ARENA_0, y0: ARENA_0, x1: ARENA_1, y1: ARENA_1 };
    const sealed = sealFrom(ground.grid, context.locs, [
        { name: "the Scar", rect: arena, from: START },
    ]);
    assertReachable(sealed, POINTS, "The Scar");
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles: new Uint8Array(SIZE * SIZE),
        lines: [],
        buildings: [],
        landmarks: [],
        passes: [],
        walkSlope: 48,
        caves: [],
        falls: [],
        waterfalls: [],
        designed: [{ x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 }],
    };
}

export const SCAR_RECIPE: MapRecipe = {
    id: "scar",
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: START,
    build: (context) => build(context).grid,
    detail: (context) => build(context),
    points: POINTS,
    // The Awakened Leviathan's fight is on its ground (content/leviathan.ts)
    fights: ["awakened_leviathan"],
};

// A grid tile's world tile; middle: the middle of a 2 by 2 from its south-west tile
export function scarWorld(tile: Tile, middle = false): Tile {
    const at = middle ? 1 : 0.5;
    return {
        x: MAP_X * MAP_SQUARE_SIZE + tile.x + at,
        y: MAP_Y * MAP_SQUARE_SIZE + tile.y + at,
    };
}
