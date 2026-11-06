import type { RootsRuleDef } from "../../content/types";
import { Rng } from "../Rng";
import { fm } from "../fmath";
import type { ArenaGrid } from "../world/ArenaGrid";
import type { RuleHost, RunRule } from "./RunRule";

// The Stranglewood's roots (RootsRuleDef), on any map's grid. The arena's split into cells of
// CELL by CELL tiles, each empty, sprouting (the warning: harmless) or rooted. A few creeping
// fronts carry the roots in from the wood (the cells of blocked ground, the forest itself), each
// sprouting a neighbour of where it's got to every so often, quicker as the run goes on and twice
// as quick near a root heart. A cut cell can take root again from a rooted neighbour once its
// regrowth time is up. Everything's on the rule's own Rng.

export const CELL = 2;
export const CELL_EMPTY = 0;
export const CELL_SPROUT = 1;
export const CELL_ROOTED = 2;

// A cell's open if this many of its tiles can be stood on; one with fewer is part of the wood
const OPEN_TILES = 2;
// The wood: blocked ground this many cells or more joined up (a lone tree or rock isn't)
const WOOD_CELLS = 6;
// A front that can't spread from where it is looks this many cells round for an edge of the
// roots to go on from, before it gives up and starts again from the wood
const FRONT_SEARCH = 3;
// Of a front's spreads, this share move it on to the cell it sprouted (the rest fill in round it)
const FRONT_MOVES = 0.55;
// A new front starts at the best of this many spots of the wood, the nearest a player
const SEED_TRIES = 3;
// A heart comes up at a root front this far from a player, as near to it as can be found
const HEART_DISTANCE = 16;
const HEART_TRIES = 24;
// Cut cells are checked for regrowth this often (ticks)
const REGROW_CHECK = 10;

const NEIGHBOURS_8: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];

type Front = { cell: number; next: number };
type Heart = { uid: number; x: number; y: number };

export class RootRule implements RunRule {
    readonly baseX: number;
    readonly baseY: number;
    readonly cellsX: number;
    readonly cellsY: number;
    // Each cell's CELL_*
    readonly state: Uint8Array;
    // The tick it sprouted, took root, or was cut (whichever it last did); and the tick it was last
    // cut (-1 never), for the snap and the puff
    readonly changedAt: Int32Array;
    readonly cutAt: Int32Array;
    // A cut cell takes root again no sooner than this tick (a root heart's calm too)
    readonly regrowAt: Int32Array;
    // Can be rooted (open ground, outside the safe circle); and is the wood's edge, where fronts
    // start
    readonly open: Uint8Array;
    private readonly seeds: number[] = [];
    readonly openCount: number;
    rootedCount = 0;
    readonly fronts: Front[] = [];
    readonly hearts: Heart[] = [];
    private nextHeart: number;
    private regrowing: number[] = [];
    private readonly rng: Rng;
    private tick = 0;

    constructor(
        readonly def: RootsRuleDef,
        readonly grid: ArenaGrid,
        seed: number,
        private readonly tps: number,
    ) {
        this.rng = new Rng((seed ^ 0x5e7f00d) >>> 0);
        this.baseX = grid.baseX;
        this.baseY = grid.baseY;
        this.cellsX = Math.ceil(grid.sizeX / CELL);
        this.cellsY = Math.ceil(grid.sizeY / CELL);
        const count = this.cellsX * this.cellsY;
        this.state = new Uint8Array(count);
        this.changedAt = new Int32Array(count).fill(-1);
        this.cutAt = new Int32Array(count).fill(-1);
        this.regrowAt = new Int32Array(count);
        this.open = new Uint8Array(count);
        const solid = new Uint8Array(count);
        const safe = def.safe;
        let open = 0;
        for (let cy = 0; cy < this.cellsY; cy++) {
            for (let cx = 0; cx < this.cellsX; cx++) {
                let tiles = 0;
                for (let dy = 0; dy < CELL; dy++) {
                    for (let dx = 0; dx < CELL; dx++) {
                        const x = this.baseX + cx * CELL + dx;
                        const y = this.baseY + cy * CELL + dy;
                        if (grid.contains(x, y) && !grid.isSolid(x, y)) {
                            tiles++;
                        }
                    }
                }
                const i = cx + cy * this.cellsX;
                if (tiles === 0) {
                    solid[i] = 1;
                }
                const { x, y } = this.cellMiddle(i);
                const inSafe = safe && fm.hypot(x - safe.x, y - safe.y) < safe.radius;
                if (tiles >= OPEN_TILES && !inSafe) {
                    this.open[i] = 1;
                    open++;
                }
            }
        }
        this.openCount = open;
        this.findSeeds(solid);
        this.nextHeart = def.hearts.from * this.tps;
    }

    // The open cells beside the wood: blocked ground big enough to be the forest, not a tree
    private findSeeds(solid: Uint8Array): void {
        const { cellsX, cellsY } = this;
        const wood = new Uint8Array(solid.length);
        const seen = new Uint8Array(solid.length);
        const queue: number[] = [];
        for (let start = 0; start < solid.length; start++) {
            if (!solid[start] || seen[start]) {
                continue;
            }
            const piece: number[] = [];
            queue.length = 0;
            queue.push(start);
            seen[start] = 1;
            while (queue.length > 0) {
                const i = queue.pop()!;
                piece.push(i);
                const cx = i % cellsX;
                const cy = (i - cx) / cellsX;
                for (const [dx, dy] of NEIGHBOURS_8.slice(0, 4)) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= cellsX || ny >= cellsY) {
                        continue;
                    }
                    const j = nx + ny * cellsX;
                    if (solid[j] && !seen[j]) {
                        seen[j] = 1;
                        queue.push(j);
                    }
                }
            }
            // What touches the arena's edge is the wood round it, whatever its size
            const edge = piece.some((i) => {
                const cx = i % cellsX;
                const cy = (i - cx) / cellsX;
                return cx === 0 || cy === 0 || cx === cellsX - 1 || cy === cellsY - 1;
            });
            if (edge || piece.length >= WOOD_CELLS) {
                for (const i of piece) {
                    wood[i] = 1;
                }
            }
        }
        for (let i = 0; i < solid.length; i++) {
            if (!this.open[i]) {
                continue;
            }
            const cx = i % cellsX;
            const cy = (i - cx) / cellsX;
            const byWood = NEIGHBOURS_8.some(([dx, dy]) => {
                const nx = cx + dx;
                const ny = cy + dy;
                return (
                    nx < 0 || ny < 0 || nx >= cellsX || ny >= cellsY || wood[nx + ny * cellsX] === 1
                );
            });
            if (byWood) {
                this.seeds.push(i);
            }
        }
    }

    cellAt(x: number, y: number): number {
        const cx = Math.floor((x - this.baseX) / CELL);
        const cy = Math.floor((y - this.baseY) / CELL);
        if (cx < 0 || cy < 0 || cx >= this.cellsX || cy >= this.cellsY) {
            return -1;
        }
        return cx + cy * this.cellsX;
    }

    cellMiddle(i: number): { x: number; y: number } {
        const cx = i % this.cellsX;
        const cy = (i - cx) / this.cellsX;
        return { x: this.baseX + cx * CELL + CELL / 2, y: this.baseY + cy * CELL + CELL / 2 };
    }

    isRooted(x: number, y: number): boolean {
        const i = this.cellAt(x, y);
        return i >= 0 && this.state[i] === CELL_ROOTED;
    }

    // How far the run is between start and lateBy, 0 to 1
    private ramp(seconds: number): number {
        const { start, lateBy } = this.def;
        return Math.min(1, Math.max(0, (seconds - start) / Math.max(1, lateBy - start)));
    }

    step(host: RuleHost): void {
        this.tick = host.tick;
        // Sprouts take root once their warning's up, whoever laid them and whenever
        this.rootSprouts(Math.round(this.def.sprout * this.tps));
        const seconds = host.mapSeconds;
        if (seconds < this.def.start) {
            return;
        }
        const ramp = this.ramp(seconds);
        this.stepHearts(host);
        const wanted = Math.round(
            this.def.fronts[0] + (this.def.fronts[1] - this.def.fronts[0]) * ramp,
        );
        while (this.fronts.length < wanted) {
            const cell = this.pickSeed(host);
            if (cell < 0) {
                break;
            }
            this.fronts.push({ cell, next: this.tick });
        }
        const every = this.def.every[0] + (this.def.every[1] - this.def.every[0]) * ramp;
        for (let k = 0; k < this.fronts.length; k++) {
            const front = this.fronts[k];
            if (this.tick < front.next) {
                continue;
            }
            const quick = this.nearHeart(front.cell) ? 0.5 : 1;
            front.next = this.tick + Math.max(1, Math.round(every * quick * this.tps));
            if (!this.spread(front)) {
                this.fronts.splice(k, 1);
                k--;
            }
        }
        if (this.tick % REGROW_CHECK === 0) {
            this.regrow();
        }
    }

    private sprouts: number[] = [];

    private rootSprouts(sproutTicks: number): void {
        let kept = 0;
        for (const i of this.sprouts) {
            if (this.state[i] !== CELL_SPROUT) {
                continue;
            }
            if (this.tick - this.changedAt[i] >= sproutTicks) {
                this.state[i] = CELL_ROOTED;
                this.changedAt[i] = this.tick;
                this.rootedCount++;
            } else {
                this.sprouts[kept++] = i;
            }
        }
        this.sprouts.length = kept;
    }

    // Whether a cell can take root now: open, empty, and its regrowth (or a heart's calm) up
    private canSprout(i: number): boolean {
        return this.open[i] === 1 && this.state[i] === CELL_EMPTY && this.tick >= this.regrowAt[i];
    }

    private sprout(i: number): void {
        this.state[i] = CELL_SPROUT;
        this.changedAt[i] = this.tick;
        this.sprouts.push(i);
    }

    // A front sprouts a free neighbour of its cell and maybe moves on to it; failing that, it finds
    // an edge of the roots nearby to go on from. False when it's nowhere to go.
    private spread(front: Front): boolean {
        const free = this.freeNeighbours(front.cell);
        if (free.length > 0) {
            const next = this.rng.pick(free);
            this.sprout(next);
            if (this.rng.chance(FRONT_MOVES)) {
                front.cell = next;
            }
            return true;
        }
        const cx = front.cell % this.cellsX;
        const cy = (front.cell - cx) / this.cellsX;
        for (let r = 1; r <= FRONT_SEARCH; r++) {
            const ring: number[] = [];
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) {
                        continue;
                    }
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= this.cellsX || ny >= this.cellsY) {
                        continue;
                    }
                    const j = nx + ny * this.cellsX;
                    if (this.state[j] !== CELL_EMPTY && this.freeNeighbours(j).length > 0) {
                        ring.push(j);
                    }
                }
            }
            if (ring.length > 0) {
                front.cell = this.rng.pick(ring);
                const free2 = this.freeNeighbours(front.cell);
                this.sprout(this.rng.pick(free2));
                return true;
            }
        }
        return false;
    }

    private freeNeighbours(i: number): number[] {
        const cx = i % this.cellsX;
        const cy = (i - cx) / this.cellsX;
        const free: number[] = [];
        for (const [dx, dy] of NEIGHBOURS_8) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= this.cellsX || ny >= this.cellsY) {
                continue;
            }
            const j = nx + ny * this.cellsX;
            if (this.canSprout(j)) {
                free.push(j);
            }
        }
        return free;
    }

    // A spot of the wood's edge for a new front: the nearest a player of a few picked at random,
    // so the forest closes in where they are
    private pickSeed(host: RuleHost): number {
        if (this.seeds.length === 0) {
            return -1;
        }
        const heroes = host.heroPositions();
        let best = -1;
        let bestDistance = Infinity;
        for (let t = 0; t < SEED_TRIES; t++) {
            const i = this.rng.pick(this.seeds);
            const { x, y } = this.cellMiddle(i);
            let distance = 0;
            for (let h = 0; h < heroes.length; h += 2) {
                distance = Math.min(
                    h === 0 ? Infinity : distance,
                    fm.hypot(heroes[h] - x, heroes[h + 1] - y),
                );
            }
            if (distance < bestDistance) {
                bestDistance = distance;
                best = i;
            }
        }
        // The front starts there: a seed that's taken root already goes on from it
        if (this.canSprout(best)) {
            this.sprout(best);
        }
        return best;
    }

    private regrow(): void {
        let kept = 0;
        for (const i of this.regrowing) {
            if (this.state[i] !== CELL_EMPTY) {
                continue;
            }
            if (this.tick < this.regrowAt[i]) {
                this.regrowing[kept++] = i;
                continue;
            }
            if (this.open[i] && this.hasRootedNeighbour(i)) {
                this.sprout(i);
            }
        }
        this.regrowing.length = kept;
    }

    private hasRootedNeighbour(i: number): boolean {
        const cx = i % this.cellsX;
        const cy = (i - cx) / this.cellsX;
        for (const [dx, dy] of NEIGHBOURS_8.slice(0, 4)) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= this.cellsX || ny >= this.cellsY) {
                continue;
            }
            if (this.state[nx + ny * this.cellsX] === CELL_ROOTED) {
                return true;
            }
        }
        return false;
    }

    private nearHeart(cell: number): boolean {
        if (this.hearts.length === 0) {
            return false;
        }
        const { x, y } = this.cellMiddle(cell);
        const reach = this.def.hearts.reach;
        return this.hearts.some((heart) => fm.hypot(heart.x - x, heart.y - y) <= reach);
    }

    private stepHearts(host: RuleHost): void {
        for (let k = 0; k < this.hearts.length; k++) {
            if (!host.isEnemyAlive(this.hearts[k].uid)) {
                this.hearts.splice(k, 1);
                k--;
            }
        }
        if (this.tick < this.nextHeart) {
            return;
        }
        this.nextHeart = this.tick + Math.round(this.def.hearts.every * this.tps);
        if (this.hearts.length >= this.def.hearts.max) {
            return;
        }
        // At a root front, about HEART_DISTANCE from a player: where a front's got to, or failing
        // that a rooted cell found at random (where the roots have taken everything, any of them)
        const heroes = host.heroPositions();
        if (heroes.length === 0) {
            return;
        }
        const candidates = this.fronts
            .map((front) => front.cell)
            .filter((i) => this.state[i] !== CELL_EMPTY);
        for (let t = 0; t < HEART_TRIES; t++) {
            const i = this.rng.int(this.state.length);
            if (this.state[i] === CELL_ROOTED) {
                candidates.push(i);
            }
        }
        let best = -1;
        let bestScore = Infinity;
        for (const i of candidates) {
            const { x, y } = this.cellMiddle(i);
            let nearest = Infinity;
            for (let h = 0; h < heroes.length; h += 2) {
                nearest = Math.min(nearest, fm.hypot(heroes[h] - x, heroes[h + 1] - y));
            }
            // A front's edge is better than the middle of the roots
            const edge = this.freeNeighbours(i).length > 0 ? 0 : HEART_DISTANCE;
            const score = Math.abs(nearest - HEART_DISTANCE) + edge;
            if (score < bestScore) {
                bestScore = score;
                best = i;
            }
        }
        if (best >= 0) {
            const { x, y } = this.cellMiddle(best);
            this.plantHeart(host, x, y);
        }
    }

    plantHeart(host: RuleHost, x: number, y: number): void {
        const uid = host.spawnRuleEnemy(this.def.hearts.enemyId, x, y);
        if (uid === undefined) {
            return;
        }
        this.hearts.push({ uid, x, y });
        // Its roots reach out from it: a front of its own, starting there
        const cell = this.cellAt(x, y);
        if (cell >= 0) {
            this.plant(x, y, 2.5);
            this.fronts.push({ cell, next: this.tick });
        }
    }

    playerPace(x: number, y: number): number {
        return this.isRooted(x, y) ? 1 - this.def.slow : 1;
    }

    enemyPace(x: number, y: number): number {
        return this.isRooted(x, y) ? 1 + this.def.haste : 1;
    }

    hurtsAt(x: number, y: number): boolean {
        return this.isRooted(x, y);
    }

    onHit(x: number, y: number): void {
        if (this.isRooted(x, y) || this.state[this.cellAt(x, y)] === CELL_SPROUT) {
            this.cutCircle(x, y, this.def.cut.hit, 0);
        }
    }

    onSwing(
        x: number,
        y: number,
        dirX: number,
        dirY: number,
        reach: number,
        arc: number,
        width: number,
    ): void {
        this.forCellsNear(x, y, reach + CELL, (i, mx, my) => {
            if (this.state[i] === CELL_EMPTY) {
                return;
            }
            const ox = mx - x;
            const oy = my - y;
            const distance = fm.hypot(ox, oy);
            const along = ox * dirX + oy * dirY;
            if (width > 0) {
                const across = Math.abs(ox * -dirY + oy * dirX);
                if (
                    along < -CELL / 2 ||
                    along > reach + CELL / 2 ||
                    across > width / 2 + CELL / 2
                ) {
                    return;
                }
            } else {
                if (distance > reach + CELL / 2) {
                    return;
                }
                const angle = fm.acos(Math.max(-1, Math.min(1, along / Math.max(distance, 0.001))));
                if (distance > CELL && angle > arc + CELL / 2 / distance) {
                    return;
                }
            }
            this.cut(i, 0);
        });
    }

    onKill(uid: number, x: number, y: number): void {
        const heart = this.hearts.findIndex((h) => h.uid === uid);
        if (heart >= 0) {
            this.hearts.splice(heart, 1);
            const { clear, calm } = this.def.hearts;
            this.cutCircle(x, y, clear, calm, true);
            return;
        }
        if (this.isRooted(x, y) || this.state[this.cellAt(x, y)] === CELL_SPROUT) {
            this.cutCircle(x, y, this.def.cut.kill, 0);
        }
    }

    plant(x: number, y: number, radius: number): void {
        this.forCellsNear(x, y, radius, (i) => {
            if (this.canSprout(i)) {
                this.sprout(i);
            }
        });
    }

    pickSpots(x: number, y: number, reach: number, count: number): { x: number; y: number }[] {
        const rooted: number[] = [];
        this.forCellsNear(x, y, reach, (i) => {
            if (this.state[i] === CELL_ROOTED) {
                rooted.push(i);
            }
        });
        const spots: { x: number; y: number }[] = [];
        while (spots.length < count && rooted.length > 0) {
            const k = this.rng.int(rooted.length);
            spots.push(this.cellMiddle(rooted[k]));
            rooted[k] = rooted[rooted.length - 1];
            rooted.pop();
        }
        return spots;
    }

    // Every cell any of whose ground is within radius of x, y (its middle, for its index)
    private forCellsNear(
        x: number,
        y: number,
        radius: number,
        visit: (i: number, middleX: number, middleY: number) => void,
    ): void {
        const cx0 = Math.max(0, Math.floor((x - radius - this.baseX) / CELL));
        const cy0 = Math.max(0, Math.floor((y - radius - this.baseY) / CELL));
        const cx1 = Math.min(this.cellsX - 1, Math.floor((x + radius - this.baseX) / CELL));
        const cy1 = Math.min(this.cellsY - 1, Math.floor((y + radius - this.baseY) / CELL));
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const x0 = this.baseX + cx * CELL;
                const y0 = this.baseY + cy * CELL;
                const nearX = Math.min(Math.max(x, x0), x0 + CELL);
                const nearY = Math.min(Math.max(y, y0), y0 + CELL);
                if (fm.hypot(nearX - x, nearY - y) <= radius) {
                    visit(cx + cy * this.cellsX, x0 + CELL / 2, y0 + CELL / 2);
                }
            }
        }
    }

    // calm: seconds before anything there takes root again, beyond the usual regrowth; all: a
    // heart's clearing, which calms the empty ground in it too
    private cutCircle(x: number, y: number, radius: number, calm: number, all = false): void {
        this.forCellsNear(x, y, radius, (i) => {
            if (this.state[i] !== CELL_EMPTY) {
                this.cut(i, calm);
            } else if (all && this.open[i]) {
                this.regrowAt[i] = Math.max(
                    this.regrowAt[i],
                    this.tick + Math.round(calm * this.tps),
                );
            }
        });
    }

    private cut(i: number, calm: number): void {
        if (this.state[i] === CELL_ROOTED) {
            this.rootedCount--;
        }
        this.state[i] = CELL_EMPTY;
        this.changedAt[i] = this.tick;
        this.cutAt[i] = this.tick;
        this.regrowAt[i] = this.tick + Math.round(Math.max(calm, this.def.cut.regrow) * this.tps);
        this.regrowing.push(i);
    }

    // Of the open ground, how much has taken root, 0 to 1
    get cover(): number {
        return this.openCount > 0 ? this.rootedCount / this.openCount : 0;
    }

    hash(): number {
        let hash = this.rootedCount * 31 + this.fronts.length;
        for (const front of this.fronts) {
            hash = (Math.imul(hash, 16777619) ^ front.cell) >>> 0;
        }
        return (Math.imul(hash, 16777619) ^ this.hearts.length) >>> 0;
    }
}
