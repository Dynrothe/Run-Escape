// Searching the world index (world-index.ts) for places by what they're made of: the colour of
// their floor, the locs on them, the level, and whether they're on the surface. find-place.ts
// runs it; it's apart so it can be tested without the cache.

// What's on one level of a square, by id: locs as id:type, floors as the map files store them
export type IndexLevel = {
    locs: Record<string, number>;
    underlays: Record<string, number>;
    overlays: Record<string, number>;
};
export type IndexSquare = IndexLevel & { x: number; y: number; upper?: Record<string, IndexLevel> };
export type WorldIndex = {
    squares: IndexSquare[];
    locs: Record<string, { id: number; name: string | null }>;
    // Colours as hex strings
    underlays: Record<string, { rgb: string }>;
    overlays: Record<string, { rgb?: string; texture: number }>;
};

// Squares this far north and up are under the ground, or somewhere else that isn't the surface:
// dungeons are the surface's place plus 6,400 tiles (Vampyrium's one of the others)
export const SURFACE_SQUARES_Y = 100;

export const COLOURS = [
    "red",
    "brown",
    "yellow",
    "green",
    "blue",
    "purple",
    "grey",
    "white",
    "black",
] as const;
export type ColourName = (typeof COLOURS)[number];

// A colour's rough name, by its hue, how strong it is and how light
export function nameColour(rgb: number): ColourName {
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (max + min) / 2;
    const sat = max === 0 ? 0 : (max - min) / max;
    let hue = 0;
    if (max !== min) {
        if (max === r) {
            hue = ((g - b) / (max - min) + 6) % 6;
        } else if (max === g) {
            hue = (b - r) / (max - min) + 2;
        } else {
            hue = (r - g) / (max - min) + 4;
        }
    }
    hue *= 60;
    if (light < 24) {
        return "black";
    }
    if (light > 200 && sat < 0.2) {
        return "white";
    }
    if (sat < 0.15) {
        return "grey";
    }
    if (hue >= 280 && hue < 340) {
        return "purple";
    }
    if (hue >= 200 && hue < 280) {
        return "blue";
    }
    if (hue >= 75 && hue < 200) {
        return "green";
    }
    if (hue >= 45) {
        return "yellow";
    }
    if (hue >= 15) {
        return "brown";
    }
    return "red";
}

export type PlaceFilter = {
    // The level to look at (0 is the ground floor)
    plane?: number;
    // true for the surface only, false for everywhere else
    surface?: boolean;
    // A colour by name, or as 0xRRGGBB with how far off it can be (straight-line RGB distance)
    colour?: ColourName | { rgb: number; within: number };
    // The least share of the floor in that colour: "mostly" is over a half
    share?: number;
    // Locs by id, or by a pattern for their names, and the least of them a square has
    locIds?: number[];
    locName?: RegExp;
    minLocs?: number;
};

export type PlaceMatch = { x: number; y: number; share: number; locs: number };

function getLevel(square: IndexSquare, plane: number): IndexLevel | undefined {
    return plane === 0 ? square : square.upper?.[plane];
}

// The share of a level's floor in a colour. Tiles are counted as the floor that's drawn: an
// overlay's own, the underlay's where there's no overlay (the index only has how many of each,
// so that's the underlays less the overlays, shared out). The hidden overlay draws nothing, and
// a textured one's colour isn't known: both count as not that colour.
export function getColourShare(
    index: WorldIndex,
    level: IndexLevel,
    matches: (rgb: number) => boolean,
): number {
    let total = 0;
    let coloured = 0;
    let overlayTiles = 0;
    for (const [id, count] of Object.entries(level.overlays)) {
        const type = index.overlays[id];
        overlayTiles += count;
        total += count;
        if (type?.rgb !== undefined && type.texture === -1 && type.rgb !== "ff00ff") {
            coloured += matches(parseInt(type.rgb, 16)) ? count : 0;
        }
    }
    const underlayTiles = Object.values(level.underlays).reduce((sum, count) => sum + count, 0);
    const shown = Math.max(0, underlayTiles - overlayTiles) / Math.max(underlayTiles, 1);
    for (const [id, count] of Object.entries(level.underlays)) {
        const type = index.underlays[id];
        total += count * shown;
        if (type && matches(parseInt(type.rgb, 16))) {
            coloured += count * shown;
        }
    }
    return total === 0 ? 0 : coloured / total;
}

// Every square that passes the filter, with its share of the colour and how many of the locs
export function findPlaces(index: WorldIndex, filter: PlaceFilter): PlaceMatch[] {
    const plane = filter.plane ?? 0;
    const { colour } = filter;
    const matches =
        colour === undefined
            ? undefined
            : typeof colour === "string"
              ? (rgb: number) => nameColour(rgb) === colour
              : (rgb: number) => {
                    const dr = ((rgb >> 16) & 255) - ((colour.rgb >> 16) & 255);
                    const dg = ((rgb >> 8) & 255) - ((colour.rgb >> 8) & 255);
                    const db = (rgb & 255) - (colour.rgb & 255);
                    return Math.hypot(dr, dg, db) <= colour.within;
                };
    const wantsLocs = filter.locIds !== undefined || filter.locName !== undefined;
    const isWanted = (key: string) => {
        const id = Number(key.split(":")[0]);
        if (filter.locIds?.includes(id)) {
            return true;
        }
        const name = index.locs[key]?.name;
        return filter.locName !== undefined && name !== null && filter.locName.test(name ?? "");
    };
    const found: PlaceMatch[] = [];
    for (const square of index.squares) {
        if (filter.surface !== undefined && filter.surface !== square.y < SURFACE_SQUARES_Y) {
            continue;
        }
        const level = getLevel(square, plane);
        if (!level) {
            continue;
        }
        const share = matches ? getColourShare(index, level, matches) : 0;
        if (matches && share < (filter.share ?? 0.5)) {
            continue;
        }
        let locs = 0;
        if (wantsLocs) {
            for (const [key, count] of Object.entries(level.locs)) {
                locs += isWanted(key) ? count : 0;
            }
            if (locs < (filter.minLocs ?? 1)) {
                continue;
            }
        }
        found.push({ x: square.x, y: square.y, share, locs });
    }
    return found;
}

// Matching squares that touch (sides or corners), as places: the biggest first, each with the box
// round it in world tiles
export type Place = { squares: PlaceMatch[]; x0: number; y0: number; x1: number; y1: number };

export function groupPlaces(matches: PlaceMatch[]): Place[] {
    const byKey = new Map(matches.map((match) => [`${match.x},${match.y}`, match]));
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const first of matches) {
        if (seen.has(`${first.x},${first.y}`)) {
            continue;
        }
        seen.add(`${first.x},${first.y}`);
        const squares: PlaceMatch[] = [];
        const queue = [first];
        while (queue.length > 0) {
            const match = queue.pop()!;
            squares.push(match);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = `${match.x + dx},${match.y + dy}`;
                    const next = byKey.get(key);
                    if (next && !seen.has(key)) {
                        seen.add(key);
                        queue.push(next);
                    }
                }
            }
        }
        const xs = squares.map((square) => square.x);
        const ys = squares.map((square) => square.y);
        places.push({
            squares: squares.sort((a, b) => a.x - b.x || a.y - b.y),
            x0: Math.min(...xs) * 64,
            y0: Math.min(...ys) * 64,
            x1: (Math.max(...xs) + 1) * 64 - 1,
            y1: (Math.max(...ys) + 1) * 64 - 1,
        });
    }
    return places.sort((a, b) => b.squares.length - a.squares.length);
}
