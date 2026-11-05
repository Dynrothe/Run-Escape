import type {
    FloorDef,
    FloorShapeDef,
    FloorTileRuleDef,
    FloorTileType,
    FloorWhereDef,
} from "../content/types";

// How a floor (FloorDef) is laid out: which tiles of its box are floor, and each one's skin, type,
// turn and slab, from its shape, ascii map and tiles rules. Worked out once, the same every time
// for the same floor: its only chance is the floor's own seed, never the run's.

export const TILE_TYPES: readonly FloorTileType[] = [
    "normal",
    "solid",
    "reinforced",
    "fragile",
    "safe",
    "pillar",
];
export const TYPE_NORMAL = 0;
export const TYPE_SOLID = 1;
export const TYPE_REINFORCED = 2;
export const TYPE_FRAGILE = 3;
export const TYPE_SAFE = 4;
export const TYPE_PILLAR = 5;

export type FloorLayout = {
    sizeX: number;
    sizeY: number;
    // 1 where there's floor
    mask: Uint8Array;
    // Each tile's skin (FloorDef.skins), type (TILE_TYPES' index) and quarter turns
    skin: Uint8Array;
    type: Uint8Array;
    turn: Uint8Array;
    // The slab each tile's in: its south-west tile; and at that tile, how many tiles across it is
    anchor: Int32Array;
    slabX: Uint8Array;
    slabY: Uint8Array;
    // The floor's extent, both ends in
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

// Whether a floor tile (from the box's south-west corner) is in a shape
export function inShape(
    shape: FloorShapeDef,
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
): boolean {
    const mid = (s: { cx?: number; cy?: number }) => ({
        dx: x - (s.cx ?? (sizeX - 1) / 2),
        dy: y - (s.cy ?? (sizeY - 1) / 2),
    });
    // A little over, so a circle's edge tiles aren't lost to rounding
    const EPSILON = 1e-6;
    switch (shape.kind) {
        case "rect":
            return x >= shape.x0 && x <= shape.x1 && y >= shape.y0 && y <= shape.y1;
        case "ellipse": {
            const { dx, dy } = mid(shape);
            return (dx / shape.rx) ** 2 + (dy / shape.ry) ** 2 <= 1 + EPSILON;
        }
        case "ring": {
            const { dx, dy } = mid(shape);
            const d = shape.square
                ? Math.max(Math.abs(dx), Math.abs(dy))
                : Math.sqrt(dx * dx + dy * dy);
            return d >= shape.inner - EPSILON && d <= shape.outer + EPSILON;
        }
        case "diamond": {
            const { dx, dy } = mid(shape);
            return Math.abs(dx) + Math.abs(dy) <= shape.r + EPSILON;
        }
        case "cross": {
            const { dx, dy } = mid(shape);
            const half = (shape.width - 1) / 2 + EPSILON;
            return Math.abs(dx) <= half || Math.abs(dy) <= half;
        }
        case "union":
            return shape.of.some((s) => inShape(s, x, y, sizeX, sizeY));
        case "minus":
            return (
                inShape(shape.from, x, y, sizeX, sizeY) && !inShape(shape.cut, x, y, sizeX, sizeY)
            );
    }
}

// A number from 0 to 1 for a tile, the same for the same floor, rule and tile
function chance(seed: number, rule: number, i: number, salt: number): number {
    let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (rule + 1) ^ (h >>> 13), 0xc2b2ae35);
    h = Math.imul(h ^ (i + 1) ^ (h >>> 16), 0x27d4eb2f);
    h = Math.imul(h ^ (salt + 7) ^ (h >>> 15), 0x165667b1);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// The ascii map's character at a floor tile, or "" off it
function asciiAt(ascii: string[] | undefined, x: number, y: number): string {
    if (!ascii) {
        return "";
    }
    const row = ascii[ascii.length - 1 - y];
    return row !== undefined && x < row.length ? row[x] : "";
}

function inWhere(
    where: FloorWhereDef | undefined,
    layout: { mask: Uint8Array; sizeX: number; sizeY: number },
    ascii: string[] | undefined,
    x: number,
    y: number,
): boolean {
    if (!where) {
        return true;
    }
    const { mask, sizeX, sizeY } = layout;
    switch (where.kind) {
        case "all":
            return true;
        case "checker": {
            const size = where.size ?? 1;
            const parity = (Math.floor(x / size) + Math.floor(y / size)) % 2;
            return parity === (where.odd ? 1 : 0);
        }
        case "border": {
            const width = where.width ?? 1;
            for (let dy = -width; dy <= width; dy++) {
                for (let dx = -width; dx <= width; dx++) {
                    const tx = x + dx;
                    const ty = y + dy;
                    if (tx < 0 || ty < 0 || tx >= sizeX || ty >= sizeY || !mask[tx + ty * sizeX]) {
                        return true;
                    }
                }
            }
            return false;
        }
        case "stripes": {
            const v = (where.axis === "x" ? x : y) - (where.offset ?? 0);
            const every = Math.max(1, where.every);
            return ((v % every) + every) % every < (where.width ?? 1);
        }
        case "chars":
            return where.chars.includes(asciiAt(ascii, x, y));
        default:
            return inShape(where, x, y, sizeX, sizeY);
    }
}

export function layoutFloor(def: FloorDef, sizeX: number, sizeY: number): FloorLayout {
    const count = sizeX * sizeY;
    const mask = new Uint8Array(count);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const inAscii = def.ascii ? !". ".includes(asciiAt(def.ascii, x, y) || ".") : true;
            const inShaped = def.shape ? inShape(def.shape, x, y, sizeX, sizeY) : true;
            mask[x + y * sizeX] = inAscii && inShaped ? 1 : 0;
        }
    }
    const layout: FloorLayout = {
        sizeX,
        sizeY,
        mask,
        skin: new Uint8Array(count),
        type: new Uint8Array(count),
        turn: new Uint8Array(count),
        anchor: Int32Array.from({ length: count }, (_, i) => i),
        slabX: new Uint8Array(count).fill(1),
        slabY: new Uint8Array(count).fill(1),
        minX: sizeX,
        maxX: -1,
        minY: sizeY,
        maxY: -1,
    };
    for (let i = 0; i < count; i++) {
        if (mask[i]) {
            const x = i % sizeX;
            const y = Math.floor(i / sizeX);
            layout.minX = Math.min(layout.minX, x);
            layout.maxX = Math.max(layout.maxX, x);
            layout.minY = Math.min(layout.minY, y);
            layout.maxY = Math.max(layout.maxY, y);
        }
    }
    const seed = def.seed ?? 1;
    (def.tiles ?? []).forEach((rule, r) => applyRule(layout, def, rule, r, seed));
    // A slab's tiles are all as its south-west one is
    for (let i = 0; i < count; i++) {
        const a = layout.anchor[i];
        if (a !== i) {
            layout.skin[i] = layout.skin[a];
            layout.type[i] = layout.type[a];
            layout.turn[i] = layout.turn[a];
        }
    }
    return layout;
}

function applyRule(
    layout: FloorLayout,
    def: FloorDef,
    rule: FloorTileRuleDef,
    r: number,
    seed: number,
): void {
    const { sizeX, sizeY, mask } = layout;
    const covers = (x: number, y: number) =>
        x < sizeX &&
        y < sizeY &&
        mask[x + y * sizeX] === 1 &&
        inWhere(rule.where, layout, def.ascii, x, y) &&
        (rule.share === undefined || chance(seed, r, x + y * sizeX, 0) < rule.share);
    const set = (i: number) => {
        if (rule.skin !== undefined) {
            layout.skin[i] = typeof rule.skin === "number" ? rule.skin : pick(rule.skin, i);
        }
        if (rule.type !== undefined) {
            layout.type[i] = TILE_TYPES.indexOf(rule.type);
        }
        if (rule.turn !== undefined) {
            layout.turn[i] =
                rule.turn === "random" ? Math.floor(chance(seed, r, i, 2) * 4) : rule.turn & 3;
        }
    };
    const pick = (skins: { skin: number; weight: number }[], i: number): number => {
        const total = skins.reduce((sum, s) => sum + s.weight, 0);
        let at = chance(seed, r, i, 1) * total;
        for (const s of skins) {
            at -= s.weight;
            if (at < 0) {
                return s.skin;
            }
        }
        return skins[skins.length - 1].skin;
    };
    const slab = rule.slab;
    if (slab && (slab[0] > 1 || slab[1] > 1)) {
        const [w, h] = slab;
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                let fits = true;
                for (let dy = 0; dy < h && fits; dy++) {
                    for (let dx = 0; dx < w && fits; dx++) {
                        const tx = x + dx;
                        const ty = y + dy;
                        fits =
                            covers(tx, ty) &&
                            layout.slabX[layout.anchor[tx + ty * sizeX]] === 1 &&
                            layout.slabY[layout.anchor[tx + ty * sizeX]] === 1;
                    }
                }
                if (!fits) {
                    continue;
                }
                const a = x + y * sizeX;
                set(a);
                // A slab longer one way than the other only turns end over end
                if (w !== h) {
                    layout.turn[a] &= 2;
                }
                for (let dy = 0; dy < h; dy++) {
                    for (let dx = 0; dx < w; dx++) {
                        layout.anchor[x + dx + (y + dy) * sizeX] = a;
                    }
                }
                layout.slabX[a] = w;
                layout.slabY[a] = h;
            }
        }
        return;
    }
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            if (covers(x, y)) {
                set(x + y * sizeX);
            }
        }
    }
}

// The tiles of the slab a tile's in
export function slabTiles(layout: FloorLayout, i: number): number[] {
    const a = layout.anchor[i];
    const w = layout.slabX[a];
    const h = layout.slabY[a];
    if (w === 1 && h === 1) {
        return [a];
    }
    const tiles: number[] = [];
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            tiles.push(a + dx + dy * layout.sizeX);
        }
    }
    return tiles;
}
