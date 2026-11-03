import { PlacedLoc, TileGrid } from "./format";

// A rule about a range of loc ids, both ends in
export type LocRange = [from: number, to: number];

// Locs that read wrong outside what they were built for. See the design research, section 8.
// A curated list, not a rule about where a loc comes from: plenty of good outdoor locs are
// never placed on the surface.
export const BANNED_LOCS: { ids: LocRange; why: string; inWater?: true }[] = [
    { ids: [45872, 45915], why: "the Tombs of Amascut's arena floor and its pillars" },
    { ids: [48328, 48333], why: "collapsed roof from a sunken city" },
    { ids: [48972, 48973], why: "instance debris" },
    { ids: [60436, 60444], why: "sea rocks: they sink 3.5 tiles", inWater: true },
    { ids: [14416, 14416], why: "lines a hole in the ground" },
    { ids: [14427, 14427], why: "a quad under the ground" },
];

// Kit pieces: locs made to go with others (a wall's sections, half a model, one face of
// something, the levels of a stack) that have holes or invisible sides standing alone, or read
// as something else. Fine only as the whole set, as designed: cut with it from the real place
// (a stamped prefab), or placed with a loc of each of its set within `reach` tiles.
// All checked in the cache. The ones issue #78 and the Phosani doc name were seen broken in the
// game; the rest are their set mates, found by kit-scan.ts, which suggests more.
export type KitPiece = {
    ids: LocRange;
    why: string;
    // What it's built with, if that's known. A piece with no set is fine only cut intact.
    set?: LocRange[];
    // Tiles from the piece a loc of its set can be, on any level (KIT_REACH if unset)
    reach?: number;
};

export const KIT_REACH = 2;

export const KIT_PIECES: KitPiece[] = [
    // Issue #78, row 8: the Theatre of Blood's halls. The pillars stand in rows along the rooms'
    // walls (43859, 20980), which hide their backs: one-sided, by kit-scan.ts
    {
        ids: [32763, 32765],
        why: "the Theatre's pillars are sections of its rooms' walls: no back, so hollow alone",
    },
    {
        ids: [32769, 32770],
        why: "the Theatre's pillars are sections of its rooms' walls: no back, so hollow alone",
    },
    {
        ids: [32974, 32974],
        why: "the Theatre's pillar is a section of its rooms' walls: no back, so hollow alone",
    },
    { ids: [32866, 32866], why: "the Nylocas egg sac comes apart on its own" },
    { ids: [32697, 32697], why: "the Theatre's war table comes apart on its own" },
    // The Phosani design doc, section 12: the dream's ring (square 60,155) and the Sanctuary's
    // floor (59,152). Each spike on level 0 has a piece over it on level 1, and more on 2 and 3.
    {
        ids: [37646, 37657],
        why: "the dream's spikes are a wall's fragments stacked over three levels: loose shards alone",
        set: [[37658, 37673]],
        reach: 1,
    },
    {
        ids: [37658, 37673],
        why: "the dream's spikes' level 1 pieces: one-sided, and loose shards alone",
        set: [[37646, 37657]],
        reach: 1,
    },
    { ids: [37865, 37865], why: "the Sanctuary's posts draw as flat framed plates" },
    { ids: [37709, 37709], why: "the dream's fallen trunks draw as solid black bars" },
    { ids: [37637, 37637], why: "the dream's Torii gate draws as a dark canopy from above" },
    { ids: [37639, 37639], why: "the dream's Torii gate draws as a dark canopy from above" },
    // Floor decoration: a paved floor of them is fine, a few on their own read as loose tiles
    {
        ids: [37786, 37809],
        why: "the Sanctuary's cracked flags: a few on their own read as loose chequered tiles",
        set: [[37786, 37809]],
        reach: 1,
    },
];

export type LocRule = { ids: LocRange };

// The rule an id falls under, if any
export function findRule<T extends LocRule>(rules: T[], id: number): T | undefined {
    return rules.find(({ ids: [from, to] }) => id >= from && id <= to);
}

export function isInRanges(ranges: LocRange[], id: number): boolean {
    return ranges.some(([from, to]) => id >= from && id <= to);
}

// Overlays that are water, as the map files store them. Lava counts: rocks stand in it too.
export const WATER_OVERLAYS = new Set([6, 7, 19, 442, 547, 568]);

// What grows in a field, by name, as the cache spells it: check-maps.ts finds fields by these
export const CROP_NAME = /^(cabbage|corn|flax|onion|potato|pumpkin|wheat)s?$/i;

// Only has a model for wall decoration, so as ground decoration it draws nothing
export const BLOOD_WALL_ONLY = 13312;

export type BannedLoc = { loc: PlacedLoc; why: string };

// What's on the wrong ground
export function findBannedLocs(grid: TileGrid): BannedLoc[] {
    const { overlays } = grid.levels[0];
    const banned: BannedLoc[] = [];
    for (const loc of grid.locs) {
        const rule = findRule(BANNED_LOCS, loc.id);
        if (!rule) {
            continue;
        }
        const wet = WATER_OVERLAYS.has(overlays[loc.x + loc.y * grid.sizeX]);
        if (!rule.inWater || !wet) {
            banned.push({ loc, why: rule.why });
        }
    }
    return banned;
}

// Kit pieces placed without their set. `intact` says a loc was cut with its set from the real
// place, as a stamped prefab's are (isStamped, Ground.ts). A set's companion can be on any level.
export function findLoneKitPieces(
    grid: TileGrid,
    intact: (loc: PlacedLoc) => boolean = () => false,
    pieces: KitPiece[] = KIT_PIECES,
): BannedLoc[] {
    const lone: BannedLoc[] = [];
    for (const loc of grid.locs) {
        const rule = findRule(pieces, loc.id);
        if (!rule || intact(loc)) {
            continue;
        }
        const reach = rule.reach ?? KIT_REACH;
        const withSet =
            rule.set !== undefined &&
            rule.set.every((range) =>
                grid.locs.some(
                    (other) =>
                        other !== loc &&
                        isInRanges([range], other.id) &&
                        Math.abs(other.x - loc.x) <= reach &&
                        Math.abs(other.y - loc.y) <= reach,
                ),
            );
        if (!withSet) {
            lone.push({ loc, why: rule.why });
        }
    }
    return lone;
}
