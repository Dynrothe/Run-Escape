import { CollisionFlag } from "../../../rs/pathfinder/flag/CollisionFlag";
import { ArenaGrid } from "./ArenaGrid";

const STRAIGHT_COST = 10;
const DIAGONAL_COST = 14;
const UNREACHED = 0x7fffffff;
// Jumping a ditch costs as much as walking this far, so enemies near a way
// round it still walk
const JUMP_COST = 6 * STRAIGHT_COST;
// Ditches are two tiles deep, so a jump goes three tiles north or south
const DITCH_DEPTH = 2;
const JUMP_NORTH = 8;
const JUMP_SOUTH = 9;

const DIR_X = [0, 1, 0, -1, 1, 1, -1, -1];
const DIR_Y = [1, 0, -1, 0, 1, -1, -1, 1];

// Whether a one tile step is allowed, with the OSRS rules: walls on either side
// of the edge block it, and a diagonal step needs both straight routes around
// the corner open.
export function canStep(grid: ArenaGrid, x: number, y: number, dx: number, dy: number): boolean {
    if (grid.isSolid(x + dx, y + dy)) {
        return false;
    }
    if (dx !== 0 && dy !== 0) {
        return (
            canStep(grid, x, y, dx, 0) &&
            canStep(grid, x, y, 0, dy) &&
            canStep(grid, x + dx, y, 0, dy) &&
            canStep(grid, x, y + dy, dx, 0)
        );
    }
    const from = grid.getFlags(x, y);
    const to = grid.getFlags(x + dx, y + dy);
    if (dx === 1) {
        return (from & CollisionFlag.WALL_EAST) === 0 && (to & CollisionFlag.WALL_WEST) === 0;
    }
    if (dx === -1) {
        return (from & CollisionFlag.WALL_WEST) === 0 && (to & CollisionFlag.WALL_EAST) === 0;
    }
    if (dy === 1) {
        return (from & CollisionFlag.WALL_NORTH) === 0 && (to & CollisionFlag.WALL_SOUTH) === 0;
    }
    return (from & CollisionFlag.WALL_SOUTH) === 0 && (to & CollisionFlag.WALL_NORTH) === 0;
}

// Walking distance to one target tile from every tile in a square window
// around it (Dijkstra), so any number of enemies can find their way to the
// player around walls and rivers for the cost of one search.
export class FlowField {
    readonly cost: Int32Array;
    originX = 0;
    originY = 0;
    targetX = -1;
    targetY = -1;
    // The south row of a ditch enemies jump (MapDef.ditch)
    ditchY: number | undefined;

    private readonly heap: Int32Array;
    private readonly heapCost: Int32Array;
    private heapSize = 0;

    // Next step per tile, worked out on demand: 0-7 into DIR_X/DIR_Y, -1 none
    private readonly step: Int8Array;
    private readonly stepVersion: Int32Array;
    private version = 1;

    constructor(readonly size: number) {
        const count = size * size;
        this.cost = new Int32Array(count).fill(UNREACHED);
        this.step = new Int8Array(count);
        this.stepVersion = new Int32Array(count);
        // Each tile can be pushed once per neighbour at most
        this.heap = new Int32Array(count * 8);
        this.heapCost = new Int32Array(count * 8);
    }

    contains(tileX: number, tileY: number): boolean {
        const x = tileX - this.originX;
        const y = tileY - this.originY;
        return x >= 0 && y >= 0 && x < this.size && y < this.size;
    }

    getCost(tileX: number, tileY: number): number {
        if (!this.contains(tileX, tileY)) {
            return UNREACHED;
        }
        return this.cost[tileX - this.originX + (tileY - this.originY) * this.size];
    }

    isReachable(tileX: number, tileY: number): boolean {
        return this.getCost(tileX, tileY) !== UNREACHED;
    }

    update(grid: ArenaGrid, targetX: number, targetY: number): void {
        this.targetX = targetX;
        this.targetY = targetY;
        this.originX = targetX - (this.size >> 1);
        this.originY = targetY - (this.size >> 1);
        this.version++;
        const size = this.size;
        const cost = this.cost;
        cost.fill(UNREACHED);

        this.heapSize = 0;
        const start = (size >> 1) + (size >> 1) * size;
        cost[start] = 0;
        this.push(start, 0);

        while (this.heapSize > 0) {
            const [index, c] = this.pop();
            if (c > cost[index]) {
                continue;
            }
            const lx = index % size;
            const ly = (index / size) | 0;
            const wx = lx + this.originX;
            const wy = ly + this.originY;
            for (let d = 0; d < 8; d++) {
                const nx = lx + DIR_X[d];
                const ny = ly + DIR_Y[d];
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
                    continue;
                }
                const nIndex = nx + ny * size;
                const nCost = c + (d < 4 ? STRAIGHT_COST : DIAGONAL_COST);
                if (nCost >= cost[nIndex]) {
                    continue;
                }
                // Searching outward from the target, so check the step an
                // enemy on the neighbour would take back towards it.
                if (!canStep(grid, wx + DIR_X[d], wy + DIR_Y[d], -DIR_X[d], -DIR_Y[d])) {
                    continue;
                }
                cost[nIndex] = nCost;
                this.push(nIndex, nCost);
            }
            // Over a ditch, straight across (the jump back is the same)
            const jump = this.jumpFrom(grid, wx, wy);
            const ny = ly + jump;
            if (jump !== 0 && ny >= 0 && ny < size) {
                const nIndex = lx + ny * size;
                const nCost = c + JUMP_COST;
                if (nCost < cost[nIndex]) {
                    cost[nIndex] = nCost;
                    this.push(nIndex, nCost);
                }
            }
        }
    }

    // How far north (+) or south (-) a jump over the ditch goes from this
    // tile, or 0 when it isn't on the ditch's edge or there's nowhere to land
    jumpFrom(grid: ArenaGrid, tileX: number, tileY: number): number {
        if (this.ditchY === undefined) {
            return 0;
        }
        const jump =
            tileY === this.ditchY - 1
                ? DITCH_DEPTH + 1
                : tileY === this.ditchY + DITCH_DEPTH
                  ? -(DITCH_DEPTH + 1)
                  : 0;
        if (jump === 0 || grid.isSolid(tileX, tileY) || grid.isSolid(tileX, tileY + jump)) {
            return 0;
        }
        return jump;
    }

    // The tile to walk to next from this one, as an offset (three tiles north
    // or south for a jump over the ditch); false when there's no route
    // (outside the window, or walled off).
    getStep(grid: ArenaGrid, tileX: number, tileY: number, out: { x: number; y: number }): boolean {
        if (!this.contains(tileX, tileY)) {
            return false;
        }
        const lx = tileX - this.originX;
        const ly = tileY - this.originY;
        const index = lx + ly * this.size;
        if (this.stepVersion[index] !== this.version) {
            this.stepVersion[index] = this.version;
            let best = -1;
            let bestCost = this.cost[index];
            for (let d = 0; d < 8; d++) {
                const c = this.getCost(tileX + DIR_X[d], tileY + DIR_Y[d]);
                if (c < bestCost && canStep(grid, tileX, tileY, DIR_X[d], DIR_Y[d])) {
                    best = d;
                    bestCost = c;
                }
            }
            // A jump if it's quicker than the best step, counting what each costs
            const jump = this.jumpFrom(grid, tileX, tileY);
            if (jump !== 0) {
                const walk =
                    best === -1 ? UNREACHED : bestCost + (best < 4 ? STRAIGHT_COST : DIAGONAL_COST);
                const jumpCost = this.getCost(tileX, tileY + jump);
                if (jumpCost !== UNREACHED && jumpCost + JUMP_COST < walk) {
                    best = jump > 0 ? JUMP_NORTH : JUMP_SOUTH;
                }
            }
            this.step[index] = best;
        }
        const d = this.step[index];
        if (d === -1) {
            return false;
        }
        out.x = d < 8 ? DIR_X[d] : 0;
        out.y = d < 8 ? DIR_Y[d] : d === JUMP_NORTH ? DITCH_DEPTH + 1 : -(DITCH_DEPTH + 1);
        return true;
    }

    private push(index: number, c: number): void {
        let i = this.heapSize++;
        const heap = this.heap;
        const heapCost = this.heapCost;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (heapCost[parent] <= c) {
                break;
            }
            heap[i] = heap[parent];
            heapCost[i] = heapCost[parent];
            i = parent;
        }
        heap[i] = index;
        heapCost[i] = c;
    }

    private readonly popped: [number, number] = [0, 0];

    private pop(): [number, number] {
        const heap = this.heap;
        const heapCost = this.heapCost;
        this.popped[0] = heap[0];
        this.popped[1] = heapCost[0];
        const lastIndex = heap[--this.heapSize];
        const lastCost = heapCost[this.heapSize];
        let i = 0;
        const half = this.heapSize >> 1;
        while (i < half) {
            let child = 2 * i + 1;
            if (child + 1 < this.heapSize && heapCost[child + 1] < heapCost[child]) {
                child++;
            }
            if (heapCost[child] >= lastCost) {
                break;
            }
            heap[i] = heap[child];
            heapCost[i] = heapCost[child];
            i = child;
        }
        heap[i] = lastIndex;
        heapCost[i] = lastCost;
        return this.popped;
    }
}
