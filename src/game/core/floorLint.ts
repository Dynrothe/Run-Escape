import { FLOOR_SKINS } from "../content/floorSkins";
import type { FloorDef, FloorSkinDef } from "../content/types";
import { ArenaFloor, FLOOR_EAST, FLOOR_NORTH, FLOOR_SOUTH, FLOOR_WEST } from "./ArenaFloor";
import { Rng } from "./Rng";
import { RAMP_NONE, TYPE_FRAGILE, TYPE_NORMAL, TYPE_PILLAR, TYPE_REINFORCED } from "./floorLayout";
import { makeGrid } from "./world/testGrid";

// Checks on a floor (FloorDef) before it's played, for the floor preview page (dev only,
// ui/FloorPreview.tsx) and anything else that wants them: whether it's in one piece, what can't
// be reached from the start, skins that may not be opaque, and a rough phone triangle count.
// Rough on purpose: worked out from tile counts and each skin's triangles, not drawn.

// A phone's budget, at 844 by 390, worst case (scaperune/CLAUDE.md)
export const PHONE_TRIANGLES = 69000;
// What a phone draws besides the floor in the Wardens' room (its walls and props, the player),
// and the share of a 23 by 25 floor in view: worked out from the probes of rounds 1 to 10
const ROOM_TRIANGLES = 25000;
const SHARE_IN_VIEW = 0.52;
// What a wave and falling tiles add at their worst (dust, chips, thickness round holes). At rest
// the estimate came within 1k of the probe on four floors; at the busiest, within about 8k either way
const BUSY_TRIANGLES = 18000;
// Triangles in a skin's model, by what it's made from (counted from the game's bakes); and its top
// alone (FloorView draws a tile at rest among others as its top). Unknown ones count as a slab.
const SKIN_TRIANGLES: Record<string, [whole: number, top: number]> = {
    "spot:2220": [52, 36],
    "loc:20624": [110, 38],
    "loc:38822": [58, 50],
    "loc:45345": [50, 26],
    "loc:45349": [94, 51],
    "loc:53349": [186, 149],
    "loc:56393": [30, 30],
    "loc:7016": [214, 214],
    "loc:747": [18, 10],
    "loc:45582": [338, 338],
};
const SLAB = SKIN_TRIANGLES["spot:2220"];
// The tile types that rise or fall (floorLayout's TYPE_ and on)
const MOVING = new Set([TYPE_NORMAL, TYPE_REINFORCED, TYPE_FRAGILE]);
// Floor models the cache has that are see-through or draw nothing (scaperune/CLAUDE.md)
const SEE_THROUGH = new Set(["loc:45356", "loc:54539"]);

export type FloorLint = {
    warnings: string[];
    notes: string[];
    // Rough phone triangles, at rest and at the busiest
    triangles: { rest: number; busy: number };
};

function skinKey(skin: FloorSkinDef): string {
    return skin.spotAnim !== undefined
        ? "spot:" + skin.spotAnim
        : skin.loc !== undefined
          ? "loc:" + skin.loc
          : "model:" + skin.model;
}

// A grid round a floor's box, a wall of solid tiles round it, for laying it out away from a map
export function floorGrid(def: FloorDef) {
    const { x0, y0, x1, y1 } = def.rect;
    const rows: string[] = [];
    for (let y = y0 - 1; y <= y1 + 1; y++) {
        let row = "";
        for (let x = x0 - 1; x <= x1 + 1; x++) {
            row += x < x0 || y < y0 || x > x1 || y > y1 ? "#" : ".";
        }
        rows.push(row);
    }
    return makeGrid(rows, x0 - 1, y0 - 1);
}

// start: the player's start, in floor tiles from the box's south-west corner
export function lintFloor(def: FloorDef, start: { x: number; y: number }): FloorLint {
    const warnings: string[] = [];
    const notes: string[] = [];
    const grid = floorGrid(def);
    const floor = new ArenaFloor(def, grid, new Rng(1), 50);
    const { layout, sizeX, sizeY } = floor;
    const count = sizeX * sizeY;
    const open = (i: number) => layout.mask[i] === 1 && layout.type[i] !== TYPE_PILLAR;
    // In one piece (4-way, as the no-islands rule goes)
    const piece = new Int32Array(count).fill(-1);
    let pieces = 0;
    for (let i = 0; i < count; i++) {
        if (!open(i) || piece[i] >= 0) {
            continue;
        }
        const queue = [i];
        piece[i] = pieces;
        while (queue.length > 0) {
            const j = queue.pop()!;
            for (const k of neighbours(j, sizeX, sizeY)) {
                if (open(k) && piece[k] < 0) {
                    piece[k] = pieces;
                    queue.push(k);
                }
            }
        }
        pieces++;
    }
    if (pieces > 1) {
        warnings.push(`The floor is in ${pieces} pieces: holes can strand a player on one.`);
    }
    if (pieces === 0) {
        warnings.push("There's no floor.");
    }
    // Reached from the start on foot, over ledges only where a ramp is (the grid's steps)
    const startI = start.x + start.y * sizeX;
    if (start.x < 0 || start.y < 0 || start.x >= sizeX || start.y >= sizeY || !open(startI)) {
        warnings.push(`The start (${start.x}, ${start.y}) isn't on the floor.`);
    } else {
        const seen = new Uint8Array(count);
        seen[startI] = 1;
        const queue = [startI];
        let reached = 0;
        while (queue.length > 0) {
            const j = queue.pop()!;
            reached++;
            const x = floor.x0 + (j % sizeX);
            const y = floor.y0 + Math.floor(j / sizeX);
            for (let d = 0; d < 4; d++) {
                const dx = d === 1 ? 1 : d === 3 ? -1 : 0;
                const dy = d === 0 ? 1 : d === 2 ? -1 : 0;
                const k = floor.index(x + dx, y + dy);
                if (k >= 0 && !seen[k] && open(k) && grid.steps.can(x, y, d)) {
                    seen[k] = 1;
                    queue.push(k);
                }
            }
        }
        let total = 0;
        for (let i = 0; i < count; i++) {
            total += open(i) ? 1 : 0;
        }
        if (reached < total) {
            warnings.push(
                `${total - reached} of ${total} tiles can't be reached from the start (cut off, or behind a ledge with no ramp).`,
            );
        }
    }
    // Ramps should lead somewhere: a different height ahead and behind
    for (let i = 0; i < count; i++) {
        const ramp = layout.ramp[i];
        if (layout.mask[i] && ramp !== RAMP_NONE) {
            const rise = floor.edgeHeight(i, ramp) - floor.edgeHeight(i, (ramp + 2) & 3);
            if (Math.abs(rise) < 0.01) {
                const name = ["north", "east", "south", "west"][ramp];
                warnings.push(
                    `The ramp at (${i % sizeX}, ${Math.floor(i / sizeX)}) goes ${name} but is level.`,
                );
            }
        }
    }
    // Skins
    const skins = def.skins ?? [{ spotAnim: def.slam.spotAnim }];
    const presets = new Set(Object.values(FLOOR_SKINS).map((skin) => skinKey(skin)));
    skins.forEach((skin, n) => {
        const key = skinKey(skin);
        if (SEE_THROUGH.has(key)) {
            warnings.push(`Skin ${n} (${key}) is see-through or draws nothing in the cache.`);
        } else if (!presets.has(key)) {
            notes.push(
                `Skin ${n} (${key}) isn't a FLOOR_SKINS preset: check it's opaque in the game.`,
            );
        }
        if (skin.under !== undefined && !skins[skin.under]) {
            warnings.push(`Skin ${n} is drawn on skin ${skin.under}, which there isn't.`);
        }
    });
    for (const name of Object.keys(def.triggers ?? {})) {
        if (!layout.trigger.includes(layout.triggerNames.indexOf(name))) {
            notes.push(`Trigger "${name}" isn't on any tile.`);
        }
    }
    // Triangles: each slab once, its top alone where it's among others that don't move
    let rest = 0;
    let busy = 0;
    for (let i = 0; i < count; i++) {
        if (!layout.mask[i] || layout.anchor[i] !== i) {
            continue;
        }
        const skin = skins[layout.skin[i]] ?? skins[0];
        const [whole, top] = SKIN_TRIANGLES[skinKey(skin)] ?? SLAB;
        const under = skin.under !== undefined ? skins[skin.under] : undefined;
        const underWhole = under ? (SKIN_TRIANGLES[skinKey(under)] ?? SLAB)[0] : 0;
        const inner =
            layout.slabX[i] === 1 &&
            layout.slabY[i] === 1 &&
            skin.light === undefined &&
            !under &&
            layout.trigger[i] < 0 &&
            neighbours(i, sizeX, sizeY).length === 4 &&
            neighbours(i, sizeX, sizeY).every(
                (k) => layout.mask[k] && layout.height[k] === layout.height[i],
            );
        // Over the ground (FloorDef.onGround) a plain tile's its top but while it's coming up,
        // which the busy allowance covers
        const lidded =
            def.onGround === true &&
            layout.slabX[i] === 1 &&
            layout.slabY[i] === 1 &&
            skin.light === undefined &&
            !under &&
            layout.trigger[i] < 0;
        rest += (inner || lidded ? top : whole) + underWhole;
        // A tile that never moves stays as it is at rest
        const moves = MOVING.has(layout.type[i]);
        busy += ((moves || !inner) && !lidded ? whole : top) + underWhole;
        // A raised tile's sides
        if (layout.height[i] > 0.01) {
            const steps = Math.ceil(layout.height[i] / 0.13);
            rest += steps * whole * 0.5;
            busy += steps * whole * 0.5;
        }
    }
    const estimate = (tiles: number, extra: number) =>
        Math.round((ROOM_TRIANGLES + tiles * SHARE_IN_VIEW + extra) / 100) * 100;
    const triangles = { rest: estimate(rest, 0), busy: estimate(busy, BUSY_TRIANGLES) };
    if (triangles.busy > PHONE_TRIANGLES) {
        warnings.push(
            `About ${(triangles.busy / 1000).toFixed(1)}k phone triangles at its busiest, over the ${PHONE_TRIANGLES / 1000}k budget.`,
        );
    }
    return { warnings, notes, triangles };
}

function neighbours(i: number, sizeX: number, sizeY: number): number[] {
    const x = i % sizeX;
    const y = Math.floor(i / sizeX);
    const out: number[] = [];
    for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ]) {
        if (x + dx >= 0 && y + dy >= 0 && x + dx < sizeX && y + dy < sizeY) {
            out.push(x + dx + (y + dy) * sizeX);
        }
    }
    return out;
}

// For the preview: which way each ramp goes, as arrows
export const RAMP_ARROWS: Record<number, string> = {
    [FLOOR_NORTH]: "↑",
    [FLOOR_EAST]: "→",
    [FLOOR_SOUTH]: "↓",
    [FLOOR_WEST]: "←",
};
