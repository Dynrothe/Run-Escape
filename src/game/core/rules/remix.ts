import { GHORROCK_COLD } from "../../content/ghorrock";
import { LASSAR_REALM } from "../../content/lassar";
import { getMap } from "../../content/maps";
import {
    REMIX_BY_ID,
    REMIX_CROWD_SHARE,
    REMIX_FIRE_LIGHT,
    RemixId,
    cleanRemixes,
    getRemixToughness,
} from "../../content/remixes";
import { SCAR_LIGHTING } from "../../content/scar";
import { STRANGLEWOOD_ROOTS } from "../../content/stranglewood";
import type {
    ColdRuleDef,
    LightingDef,
    MapDef,
    RealmRuleDef,
    RootsRuleDef,
    RunEventDef,
    RunRuleDef,
    WaveDef,
} from "../../content/types";
import { Rng } from "../Rng";
import type { ArenaGrid } from "../world/ArenaGrid";

// What a run's remixes (content/remixes.ts) put on it: each Act II rule, placed on the map's own
// grid by the run's seed, at the map's toughness (getRemixToughness); their enemies, sharing one
// share of the crowd between them; their elites; and, for the Dark remix, the run's lights. Nothing
// here reads an Act II map's arena: braziers, ice and fires go on this map's open ground, round
// where the run starts.

export type RemixRun = {
    remixes: RemixId[];
    rules: RunRuleDef[];
    waves: WaveDef[];
    events: RunEventDef[];
    lighting?: LightingDef;
    // The Dark remix's fires, world tiles (their middles): lights the weapons aim by, drawn by the
    // view as fires (REMIX_FIRE_LOC)
    fires: { x: number; y: number }[];
};

// Its own seed off the run's, so placing things never moves the run's Rng
const PLACE_SEED = 0x7e3a1c55;
// Braziers: this many, at least apart tiles from each other, within reach of the start
const BRAZIERS = { count: 6, apart: 20, reach: 40 };
// Ice: this many pools, within reach of the start, rx and ry between min and max
const ICE = { count: 12, reach: 60, min: 2, max: 5 };
// Fires in the dark: this many, at least apart, within reach of the start
const FIRES = { count: 9, apart: 15, reach: 60 };
// The realm on a map without a twin is its palette (8.3): darker, washed violet
const REALM_BRIGHTNESS = 0.55;
// The dark on an older map: a little lighter than the Scar's on the easiest maps
const DARK_AMBIENT = { from: 0.36, to: 0.3 };

export function buildRemixRun(
    map: MapDef,
    ids: readonly string[],
    grid: ArenaGrid,
    seed: number,
    start: { x: number; y: number },
): RemixRun | undefined {
    const remixes = cleanRemixes(ids);
    if (remixes.length === 0) {
        return undefined;
    }
    const tough = getRemixToughness(map);
    const place = new Placer(grid, start, new Rng((seed ^ PLACE_SEED) >>> 0));
    const rules: RunRuleDef[] = [];
    let lighting: LightingDef | undefined;
    let fires: { x: number; y: number }[] = [];
    for (const id of remixes) {
        switch (id) {
            case "overgrown":
                rules.push(overgrown(map, tough));
                break;
            case "shadow":
                rules.push(shadow(tough));
                break;
            case "frozen":
                rules.push(frozen(tough, place));
                break;
            case "dark":
                fires = place.spread(FIRES.count, FIRES.apart, FIRES.reach, 1);
                lighting = dark(tough, fires, place);
                break;
        }
    }
    return {
        remixes,
        rules,
        waves: remixWaves(map.waves, remixes),
        events: remixEvents(map.events, remixes),
        lighting,
        fires,
    };
}

// The roots creep slower on the easier maps, and never in a final fight's clearing (an Act II map's)
function overgrown(map: MapDef, tough: number): RootsRuleDef {
    const def = STRANGLEWOOD_ROOTS;
    const arena = map.bossArena;
    return {
        ...def,
        every: [def.every[0] / tough, def.every[1] / tough],
        safe: arena
            ? { x: arena.baseX + arena.size / 2, y: arena.baseY + arena.size / 2, radius: 10 }
            : undefined,
    };
}

// The realm as a palette (no twin squares on these maps), sanity draining slower on easier maps
function shadow(tough: number): RealmRuleDef {
    const def = LASSAR_REALM;
    return {
        ...def,
        sanity: { ...def.sanity, drain: def.sanity.drain * tough },
        look: { ...def.look, brightness: REALM_BRIGHTNESS },
    };
}

// Braziers and ice on the map's open ground, no vents (they're Ghorrock's scenery); the cold rises
// slower on easier maps
function frozen(tough: number, place: Placer): ColdRuleDef {
    const def = GHORROCK_COLD;
    const half = def.braziers.size / 2;
    const braziers = place
        .spread(BRAZIERS.count, BRAZIERS.apart, BRAZIERS.reach, def.braziers.size)
        .map(({ x, y }) => ({ x: x - half, y: y - half }));
    const pools = place.spread(ICE.count, 8, ICE.reach, 3).map(({ x, y }) => ({
        x,
        y,
        rx: place.rng.range(ICE.min, ICE.max),
        ry: place.rng.range(ICE.min, ICE.max),
    }));
    return {
        ...def,
        cold: { ...def.cold, rise: def.cold.rise * tough, fast: def.cold.fast * tough },
        braziers: { ...def.braziers, at: braziers },
        vents: { ...def.vents, at: [] },
        ice: { ...def.ice, pools },
    };
}

// The Scar's dark, with fires by the seed for its lights; the player's light bigger on easier maps
function dark(tough: number, fires: { x: number; y: number }[], place: Placer): LightingDef {
    const def = SCAR_LIGHTING;
    const ease = (tough - 0.7) / 0.3;
    return {
        ...def,
        ambient: DARK_AMBIENT.from + (DARK_AMBIENT.to - DARK_AMBIENT.from) * ease,
        player: { ...def.player!, radius: def.player!.radius / tough },
        lights: fires.map((fire) => ({ ...fire, ...REMIX_FIRE_LIGHT })),
        lanterns: place.spread(2, 4, 6, 1),
    };
}

// Each wave with the remixes' crowds in: wave i of each remix's Act II map (they're all paced as
// Lumbridge's), their weights together REMIX_CROWD_SHARE of the crowd, split evenly between them
export function remixWaves(waves: WaveDef[], remixes: readonly RemixId[]): WaveDef[] {
    const share = REMIX_CROWD_SHARE / (1 - REMIX_CROWD_SHARE) / remixes.length;
    return waves.map((wave, i) => {
        const own = wave.enemies.reduce((sum, e) => sum + e.weight, 0);
        const added = remixes.flatMap((id) => {
            const from = getMap(REMIX_BY_ID.get(id)!.from).waves;
            const theirs = from[Math.min(i, from.length - 1)].enemies;
            const total = theirs.reduce((sum, e) => sum + e.weight, 0);
            return theirs.map((e) => ({ id: e.id, weight: (e.weight / total) * own * share }));
        });
        return { ...wave, enemies: [...wave.enemies, ...added] };
    });
}

export function remixEvents(events: RunEventDef[], remixes: readonly RemixId[]): RunEventDef[] {
    return [...events, ...remixes.flatMap((id) => REMIX_BY_ID.get(id)!.events)].sort(
        (a, b) => a.at - b.at,
    );
}

// The enemies a run's remixes can bring in, for the loading screen to bake
export function remixContent(ids: readonly string[]): unknown[] {
    return cleanRemixes(ids).map((id) => {
        const remix = REMIX_BY_ID.get(id)!;
        const from = getMap(remix.from);
        return [from.waves, remix.events, from.rule];
    });
}

// Picks spots on the map's open ground, reachable from the start
class Placer {
    private reachable?: Uint8Array;
    private readonly taken: { x: number; y: number }[] = [];

    constructor(
        private readonly grid: ArenaGrid,
        private readonly start: { x: number; y: number },
        readonly rng: Rng,
    ) {}

    // Up to count spots apart tiles from each other and anything placed before, within reach of the
    // start, each with size by size open tiles round it (and outdoors); their middles
    spread(count: number, apart: number, reach: number, size: number): { x: number; y: number }[] {
        const spots: { x: number; y: number }[] = [];
        const sx = Math.floor(this.start.x);
        const sy = Math.floor(this.start.y);
        for (let tries = 0; tries < count * 80 && spots.length < count; tries++) {
            // Later tries take what's nearer each other, so a cramped map still gets its count
            const gap = tries < count * 40 ? apart : apart / 2;
            const x = sx + this.rng.int(reach * 2 + 1) - reach;
            const y = sy + this.rng.int(reach * 2 + 1) - reach;
            if (!this.open(x, y, size)) {
                continue;
            }
            const near = (s: { x: number; y: number }) => (s.x - x) ** 2 + (s.y - y) ** 2;
            if (spots.some((s) => near(s) < gap * gap)) {
                continue;
            }
            // Clear of the start, and of what's placed before
            if ((x - sx) ** 2 + (y - sy) ** 2 < 16 || this.taken.some((s) => near(s) < 36)) {
                continue;
            }
            spots.push({ x: x + 0.5, y: y + 0.5 });
        }
        this.taken.push(...spots);
        return spots;
    }

    private open(x: number, y: number, size: number): boolean {
        const reachable = this.flood();
        const grid = this.grid;
        const from = -Math.floor((size - 1) / 2) - 1;
        const to = Math.ceil((size - 1) / 2) + 1;
        for (let dy = from; dy <= to; dy++) {
            for (let dx = from; dx <= to; dx++) {
                const tx = x + dx;
                const ty = y + dy;
                if (!grid.contains(tx, ty) || grid.isSolid(tx, ty) || grid.isInside(tx, ty)) {
                    return false;
                }
                if (!reachable[tx - grid.baseX + (ty - grid.baseY) * grid.sizeX]) {
                    return false;
                }
            }
        }
        return true;
    }

    // The open ground joined to the start
    private flood(): Uint8Array {
        if (this.reachable) {
            return this.reachable;
        }
        const { baseX, baseY, sizeX, sizeY } = this.grid;
        const seen = new Uint8Array(sizeX * sizeY);
        const sx = Math.floor(this.start.x) - baseX;
        const sy = Math.floor(this.start.y) - baseY;
        const queue: number[] = [];
        if (sx >= 0 && sy >= 0 && sx < sizeX && sy < sizeY) {
            seen[sx + sy * sizeX] = 1;
            queue.push(sx + sy * sizeX);
        }
        for (let head = 0; head < queue.length; head++) {
            const i = queue[head];
            const x = i % sizeX;
            const y = (i - x) / sizeX;
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                const nx = x + dx;
                const ny = y + dy;
                const j = nx + ny * sizeX;
                if (nx < 0 || ny < 0 || nx >= sizeX || ny >= sizeY || seen[j]) {
                    continue;
                }
                if (this.grid.isSolid(nx + baseX, ny + baseY)) {
                    continue;
                }
                seen[j] = 1;
                queue.push(j);
            }
        }
        this.reachable = seen;
        return seen;
    }
}
