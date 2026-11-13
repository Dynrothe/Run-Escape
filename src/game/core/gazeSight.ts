import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { ArenaGrid, Box } from "./world/ArenaGrid";

// What a hero's gaze (HeroAbilityDef kind "gaze": Justiciar Zachariah's Owl's gaze) can't see
// past, out of the map itself: every wall and every object that stops a shot (the cache's
// projectile-blocking flags: walls, ruined walls, the city wall, pillars, statues), as segments.
// The sim spares what's hidden behind them (hiddenFrom) and the view leaves it dark (GazeLight),
// from the same segments, so what's drawn as shadow is what's safe. Plain arithmetic only, so
// every co-op copy agrees.

// A wall on each side of a tile, and the side's segment from the tile's south-west corner
const SIDES: [number, number, number, number, number][] = [
    [CollisionFlag.WALL_NORTH_PROJECTILE_BLOCKER, 0, 1, 1, 1],
    [CollisionFlag.WALL_EAST_PROJECTILE_BLOCKER, 1, 0, 1, 1],
    [CollisionFlag.WALL_SOUTH_PROJECTILE_BLOCKER, 0, 0, 1, 0],
    [CollisionFlag.WALL_WEST_PROJECTILE_BLOCKER, 0, 0, 0, 1],
];
const OBJECT = CollisionFlag.OBJECT_PROJECTILE_BLOCKER;

// The segments (x0, y0, x1, y1 in world tiles, four numbers each) of everything within reach
// tiles of (x, y) that hides what's behind it. A wall between two tiles is flagged on both, and
// counted once.
export function gazeOccluders(grid: ArenaGrid, x: number, y: number, reach: number): number[] {
    const segments: number[] = [];
    const seen = new Set<number>();
    const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const tx0 = Math.floor(x - reach) - 1;
    const ty0 = Math.floor(y - reach) - 1;
    const tx1 = Math.floor(x + reach) + 1;
    const ty1 = Math.floor(y + reach) + 1;
    for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            if (!grid.contains(tx, ty)) {
                continue;
            }
            const flags = grid.getFlags(tx, ty);
            for (const [flag, ax, ay, bx, by] of SIDES) {
                if ((flags & flag) === 0) {
                    continue;
                }
                // A side's key: its lower-left end, and whether it runs east or north
                const key = ((tx + ax) * 65536 + (ty + ay)) * 2 + (ay === by ? 0 : 1);
                if (!seen.has(key)) {
                    seen.add(key);
                    segments.push(tx + ax, ty + ay, tx + bx, ty + by);
                }
            }
            if ((flags & OBJECT) !== 0) {
                grid.getSolidBox(tx, ty, box);
                segments.push(box.x0, box.y0, box.x1, box.y0);
                segments.push(box.x1, box.y0, box.x1, box.y1);
                segments.push(box.x1, box.y1, box.x0, box.y1);
                segments.push(box.x0, box.y1, box.x0, box.y0);
            }
        }
    }
    return segments;
}

// Whether (x, y) is hidden from (fromX, fromY): the line between them crosses a segment. Touching
// an end, or lying along one, doesn't hide it.
export function hiddenFrom(
    segments: readonly number[],
    fromX: number,
    fromY: number,
    x: number,
    y: number,
): boolean {
    const dx = x - fromX;
    const dy = y - fromY;
    for (let i = 0; i < segments.length; i += 4) {
        const ax = segments[i];
        const ay = segments[i + 1];
        const ex = segments[i + 2] - ax;
        const ey = segments[i + 3] - ay;
        const denom = dx * ey - dy * ex;
        if (denom === 0) {
            continue;
        }
        const ox = ax - fromX;
        const oy = ay - fromY;
        // Along the sight line (0 at the gaze, 1 at the point) and along the segment
        const t = (ox * ey - oy * ex) / denom;
        const u = (ox * dy - oy * dx) / denom;
        if (t > 0 && t < 1 && u > 0 && u < 1) {
            return true;
        }
    }
    return false;
}
