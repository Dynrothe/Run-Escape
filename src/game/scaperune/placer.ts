import type { Ground } from "./Ground";
import { getLocBlocking, getLocSize, isOnGroundLevel } from "./collision";
import { PlacedLoc, TILE_BLOCKED, TileGrid } from "./format";
import { LOC_NORMAL } from "./mapBuild";
import type { Rng } from "./noise";
import type { LocInfo } from "./recipe";

// Putting props down by hand, for a hand-made map: something solid where nothing else stands,
// something walked through one to a tile, and a few of something scattered over an area. It's the
// Sisterhood Sanctuary's own helpers (and Hallowed Night's older ones) made shared, with what they
// got wrong silently made loud:
// - Solid goes by Ground.occupied, what's actually standing there, not by reserved, which painted
//   floor sets too. The Sanctuary went by footprint, which only a stamp sets, so its solids could
//   stand on each other (findSolidOverlaps finds them).
// - A loc's size comes from the cache and turns with it. A test without the cache passes a table.
// - Zones say where nothing goes (an arena, a way through a gate), and each placement can be let
//   onto any of them by name.
// - Every request is counted against what was placed, by kind, so a test can count the build.
// - A loc off a whole tile throws (Ground.place does), as the map file would move it.
// A stamp marks what blocks in it occupied too, given StampOptions.locs, so a Placer can dress
// round a prefab.

// Why a placement was refused: off the grid, on something solid, on something walked through, on
// a building, on a tile already blocked (a stand-in), or the name of the zone it fell in
export type Refusal =
    | "off the grid"
    | "occupied"
    | "dressed"
    | "building"
    | "blocked"
    | (string & {});

export type PlacementCount = {
    requested: number;
    placed: number;
    refused: Record<string, number>;
};

export type PlaceOptions = {
    // Quarter turns; the loc's size turns with it. For dress, random when unset.
    rotation?: number;
    // LocModelType: LOC_NORMAL for solid, and given for dress
    type?: number;
    // Tiles kept clear all round a solid one, so nothing's jammed against it
    gap?: number;
    // Zones it may stand on anyway (the gates' own things on the way through them)
    allow?: string[];
    // What it's counted as in the report; the loc's id when unset
    kind?: string;
};

export type PlacerOptions = {
    // For dress's random turns
    rng: Rng;
    // Each loc's size, from the cache. Optional when every one is in sizes.
    locs?: (id: number) => Pick<LocInfo, "sizeX" | "sizeY">;
    // Sizes by id, [tiles across, tiles deep] unturned, over what locs says: for a test that
    // builds without the cache
    sizes?: Iterable<readonly [id: number, sizeX: number, sizeY: number]>;
};

export class Placer {
    readonly ground: Ground;
    // Tiles something that's walked through stands on: one to a tile
    readonly dressed: Uint8Array;
    // What the game draws in the map's place (standIn), in grid tiles, in the order put down
    readonly standIns: PlacedLoc[] = [];
    private readonly rng: Rng;
    private readonly locs?: PlacerOptions["locs"];
    private readonly sizes = new Map<number, [number, number]>();
    private readonly zones = new Map<string, (x: number, y: number) => boolean>();
    private readonly counts = new Map<string, PlacementCount>();

    constructor(ground: Ground, options: PlacerOptions) {
        this.ground = ground;
        this.dressed = new Uint8Array(ground.sizeX * ground.sizeY);
        this.rng = options.rng;
        this.locs = options.locs;
        for (const [id, sizeX, sizeY] of options.sizes ?? []) {
            this.sizes.set(id, [sizeX, sizeY]);
        }
    }

    // A zone nothing's placed on, unless a placement allows it by name
    refuse(name: string, inZone: (x: number, y: number) => boolean): this {
        this.zones.set(name, inZone);
        return this;
    }

    // A loc's size as turned: tiles across, then deep
    getSize(id: number, rotation = 0): [sizeX: number, sizeY: number] {
        let size = this.sizes.get(id);
        if (!size) {
            if (!this.locs) {
                throw new Error(`Placer: no size for loc ${id}`);
            }
            const info = this.locs(id);
            size = [info.sizeX, info.sizeY];
        }
        return rotation & 1 ? [size[1], size[0]] : [size[0], size[1]];
    }

    // Why a tile can't take something solid, if it can't
    private getSolidRefusal(x: number, y: number, allow?: string[]): Refusal | undefined {
        const { ground } = this;
        if (!ground.inside(x, y)) {
            return "off the grid";
        }
        const i = ground.tile(x, y);
        if (ground.occupied[i]) {
            return "occupied";
        }
        if (this.dressed[i]) {
            return "dressed";
        }
        if (ground.footprint[i]) {
            return "building";
        }
        for (const [name, inZone] of this.zones) {
            if (!allow?.includes(name) && inZone(x, y)) {
                return name;
            }
        }
        return undefined;
    }

    // Something solid at its south-west tile, if every tile it fills (and its gap round them) is
    // free. Painted floor's fine to stand on: only what's built or placed is in the way.
    solid(id: number, x: number, y: number, options: PlaceOptions = {}): boolean {
        const { rotation = 0, gap = 0, allow } = options;
        const [across, deep] = this.getSize(id, rotation);
        let refusal: Refusal | undefined;
        for (let ty = y - gap; ty < y + deep + gap && !refusal; ty++) {
            for (let tx = x - gap; tx < x + across + gap && !refusal; tx++) {
                refusal = this.getSolidRefusal(tx, ty, allow);
            }
        }
        const type = options.type ?? LOC_NORMAL;
        if (!refusal) {
            this.ground.place({ id, type, rotation, level: 0, x, y }, across, deep);
        }
        return this.count(options.kind ?? String(id), refusal);
    }

    // Something the game draws in the map's place: a boss fight's statues that it animates
    // (BossAttackDef.statues). A map square bakes each loc with its own animation only, so a placed
    // loc can't be told to aim, throw or blaze; the Owl's Court's crossbowmen, knights and fire jets
    // are drawn by BossFightView instead. Its tiles are taken as though it stood there, and blocked
    // unless walkThrough, but nothing goes in the map: it's in standIns, which the map hands on
    // (GeneratedMap.standIns) so view-weight.ts counts its triangles. It must stand on open ground.
    standIn(
        id: number,
        x: number,
        y: number,
        options: Omit<PlaceOptions, "gap" | "type"> & { walkThrough?: boolean } = {},
    ): boolean {
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
            throw new Error(`Loc ${id} placed off a whole tile, at ${x},${y}`);
        }
        const { rotation = 0, allow } = options;
        const [across, deep] = this.getSize(id, rotation);
        const { ground } = this;
        let refusal: Refusal | undefined;
        for (let ty = y; ty < y + deep && !refusal; ty++) {
            for (let tx = x; tx < x + across && !refusal; tx++) {
                refusal = this.getSolidRefusal(tx, ty, allow);
                if (!refusal && ground.level0.flags[ground.tile(tx, ty)] & TILE_BLOCKED) {
                    refusal = "blocked";
                }
            }
        }
        if (!refusal) {
            for (let ty = y; ty < y + deep; ty++) {
                for (let tx = x; tx < x + across; tx++) {
                    const i = ground.tile(tx, ty);
                    ground.reserved[i] = 1;
                    ground.occupied[i] = 1;
                    if (!options.walkThrough) {
                        ground.level0.flags[i] |= TILE_BLOCKED;
                    }
                }
            }
            this.standIns.push({ id, type: LOC_NORMAL, rotation, level: 0, x, y });
        }
        return this.count(options.kind ?? String(id), refusal);
    }

    // Something walked through, on one tile with nothing else on it. Painted floor is fine:
    // candles stand on stone.
    dress(id: number, x: number, y: number, options: PlaceOptions & { type: number }): boolean {
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
            throw new Error(`Loc ${id} placed off a whole tile, at ${x},${y}`);
        }
        const refusal = this.getSolidRefusal(x, y, options.allow);
        if (!refusal) {
            this.dressed[this.ground.tile(x, y)] = 1;
            this.ground.grid.locs.push({
                id,
                type: options.type,
                rotation: options.rotation ?? Math.floor(this.rng() * 4),
                level: 0,
                x,
                y,
            });
        }
        return this.count(options.kind ?? String(id), refusal);
    }

    // Tries to put count of something down: at says where to try next, and put tries it there
    // (with solid or dress, or several). Gives up after tries attempts. The kind is counted as
    // count requested, and what put managed placed; put's own calls count under their own kinds.
    scatter(
        kind: string,
        count: number,
        at: () => [x: number, y: number],
        put: (x: number, y: number) => boolean,
        tries = count * 12,
    ): number {
        let placed = 0;
        for (let tried = 0; placed < count && tried < tries; tried++) {
            if (put(...at())) {
                placed++;
            }
        }
        const entry = this.getCount(kind);
        entry.requested += count;
        entry.placed += placed;
        if (placed < count) {
            entry.refused["gave up"] = (entry.refused["gave up"] ?? 0) + count - placed;
        }
        return placed;
    }

    // Requested against placed, by kind, in the order first asked for
    report(): Map<string, PlacementCount> {
        return this.counts;
    }

    // Kinds that came out short, as lines to print or test
    describeShortfalls(): string[] {
        return [...this.counts]
            .filter(([, entry]) => entry.placed < entry.requested)
            .map(([kind, entry]) => {
                const why = Object.entries(entry.refused)
                    .map(([reason, n]) => `${n} ${reason}`)
                    .join(", ");
                return `${kind}: ${entry.placed} of ${entry.requested} (${why})`;
            });
    }

    private getCount(kind: string): PlacementCount {
        let entry = this.counts.get(kind);
        if (!entry) {
            entry = { requested: 0, placed: 0, refused: {} };
            this.counts.set(kind, entry);
        }
        return entry;
    }

    private count(kind: string, refusal: Refusal | undefined): boolean {
        const entry = this.getCount(kind);
        entry.requested++;
        if (refusal) {
            entry.refused[refusal] = (entry.refused[refusal] ?? 0) + 1;
            return false;
        }
        entry.placed++;
        return true;
    }
}

// Tiles where two solid locs stand at once, by tile index, each tile once. Solid is what fills
// its tiles by getCollisionFlags' rules, on the ground level: walls on a tile's edge don't count.
export function findSolidOverlaps(
    grid: TileGrid,
    locs: (id: number) => Pick<LocInfo, "sizeX" | "sizeY" | "clipType" | "drawn">,
): number[] {
    const standing = new Uint8Array(grid.sizeX * grid.sizeY);
    const overlaps: number[] = [];
    for (const loc of grid.locs) {
        const info = locs(loc.id);
        if (getLocBlocking(loc.type, info) !== "tiles" || !isOnGroundLevel(grid, loc)) {
            continue;
        }
        const [sizeX, sizeY] = getLocSize(loc, info);
        for (let y = loc.y; y < Math.min(loc.y + sizeY, grid.sizeY); y++) {
            for (let x = loc.x; x < Math.min(loc.x + sizeX, grid.sizeX); x++) {
                const i = x + y * grid.sizeX;
                if (standing[i] === 1) {
                    overlaps.push(i);
                }
                standing[i] = Math.min(standing[i] + 1, 2);
            }
        }
    }
    return overlaps;
}

// The same as a line for a check, or undefined if there are none
export function describeSolidOverlaps(grid: TileGrid, overlaps: number[]): string | undefined {
    if (overlaps.length === 0) {
        return undefined;
    }
    const first = overlaps
        .slice(0, 3)
        .map((i) => `${i % grid.sizeX},${Math.floor(i / grid.sizeX)}`)
        .join(" ");
    return `${overlaps.length} tiles have two solid locs on them (first ${first})`;
}
