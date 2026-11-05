import type { FloorDef, FloorPatternDef } from "../content/types";
import type { Rng } from "./Rng";
import type { ArenaGrid } from "./world/ArenaGrid";

// Which way a rising slab tips, as it travels: its leading edge comes up first (client/FloorView.ts)
export const FLOOR_NORTH = 0;
export const FLOOR_EAST = 1;
export const FLOOR_SOUTH = 2;
export const FLOOR_WEST = 3;

const NONE = -1;

// Seconds a fallen tile takes to come back up into place (FloorPatternDef restore)
export const RESTORE_SECONDS = 0.6;

// A floor that rises and falls away (MapDef.floor, FloorDef): its script, and each tile's state,
// in ticks. Everything's worked out when a pattern starts, so a tile's warning and its rise are
// both known ahead, and the client draws straight from these arrays. Deterministic: its only
// randomness is the run's Rng.
export class ArenaFloor {
    readonly x0: number;
    readonly y0: number;
    readonly sizeX: number;
    readonly sizeY: number;
    // A rise to come: when the tile starts shaking, and when it comes up
    readonly warnAt: Int32Array;
    readonly riseAt: Int32Array;
    // The last rise that's happened, which way it tipped, and so whether it's up now
    readonly roseAt: Int32Array;
    readonly riseDir: Int8Array;
    // A fall to come, or the one that's happened (dropAt <= now): from when it shakes, and when
    // it goes. A fallen tile is blocked floor on the grid until it's put back.
    readonly dropWarnAt: Int32Array;
    readonly dropAt: Int32Array;
    // When a fallen tile starts coming back, and when it's back and walked on again
    readonly restoreAt: Int32Array;
    readonly restoredAt: Int32Array;
    // When the rise or fall to come was known: its pattern's start, which can be well before its
    // warning (a wave's far rows), so the client can show a pattern's whole shape as it starts.
    // Cleared as it rises, or as a fallen tile's back.
    readonly cueAt: Int32Array;
    // Rows fallen from the back so far
    rowsDropped = 0;
    private loopStart = 0;
    private nextBeat = 0;
    // How many times round the script it's been, from 0
    loop = 0;
    private readonly slamWarn: number;
    private readonly hurtFrom: number;
    private readonly hurtTo: number;
    private readonly dropWarn: number;
    private readonly restoreTicks: number;

    constructor(
        readonly def: FloorDef,
        private readonly grid: ArenaGrid,
        private readonly rng: Rng,
        private readonly ticksPerSecond: number,
    ) {
        const { rect } = def;
        this.x0 = rect.x0;
        this.y0 = rect.y0;
        this.sizeX = rect.x1 - rect.x0 + 1;
        this.sizeY = rect.y1 - rect.y0 + 1;
        const count = this.sizeX * this.sizeY;
        this.warnAt = new Int32Array(count).fill(NONE);
        this.riseAt = new Int32Array(count).fill(NONE);
        this.roseAt = new Int32Array(count).fill(NONE);
        this.riseDir = new Int8Array(count);
        this.dropWarnAt = new Int32Array(count).fill(NONE);
        this.dropAt = new Int32Array(count).fill(NONE);
        this.restoreAt = new Int32Array(count).fill(NONE);
        this.restoredAt = new Int32Array(count).fill(NONE);
        this.cueAt = new Int32Array(count).fill(NONE);
        this.slamWarn = this.ticks(def.slam.warn);
        this.hurtFrom = this.ticks(def.slam.hurt[0]);
        this.hurtTo = this.ticks(def.slam.hurt[1]);
        this.dropWarn = this.ticks(def.drop.warn);
        this.restoreTicks = this.ticks(RESTORE_SECONDS);
        // The grid's kept between runs on a map
        grid.restoreAllTiles();
    }

    private ticks(seconds: number): number {
        return Math.round(seconds * this.ticksPerSecond);
    }

    index(tileX: number, tileY: number): number {
        const x = tileX - this.x0;
        const y = tileY - this.y0;
        return x >= 0 && y >= 0 && x < this.sizeX && y < this.sizeY ? x + y * this.sizeX : -1;
    }

    // Whether a tile's slab is up and hurting this tick
    isHurting(tileX: number, tileY: number, tick: number): boolean {
        const i = this.index(tileX, tileY);
        if (i < 0 || this.roseAt[i] === NONE) {
            return false;
        }
        const since = tick - this.roseAt[i];
        return since >= this.hurtFrom && since <= this.hurtTo;
    }

    // Whether a tile's gone, or going (on its warning); anywhere off the floor isn't
    isFalling(tileX: number, tileY: number, tick: number): boolean {
        const i = this.index(tileX, tileY);
        return i >= 0 && this.dropWarnAt[i] !== NONE && this.dropWarnAt[i] <= tick;
    }

    // Whether a tile's fallen and not back
    isGone(i: number, tick: number): boolean {
        return (
            this.dropAt[i] !== NONE &&
            this.dropAt[i] <= tick &&
            (this.restoredAt[i] === NONE || this.restoredAt[i] > tick)
        );
    }

    // A tick of the floor: the script's next patterns, and what rises, falls and comes back this
    // tick. Returns the tiles that rose and fell (world tiles, x then y) and the patterns'
    // messages. origin is where a ripple "at the player" starts.
    step(
        tick: number,
        origin: () => { x: number; y: number },
    ): { rose: number[]; fell: number[]; messages: string[] } {
        const rose: number[] = [];
        const fell: number[] = [];
        const messages: string[] = [];
        const { script, loopSeconds } = this.def;
        if (tick - this.loopStart >= this.ticks(loopSeconds)) {
            this.loopStart = tick;
            this.nextBeat = 0;
            this.loop++;
        }
        while (
            this.nextBeat < script.length &&
            tick - this.loopStart >= this.ticks(script[this.nextBeat].at)
        ) {
            const beat = script[this.nextBeat++];
            if (beat.message) {
                messages.push(beat.message);
            }
            this.start(beat.pattern, tick, origin);
        }
        for (let i = 0; i < this.riseAt.length; i++) {
            const tileX = this.x0 + (i % this.sizeX);
            const tileY = this.y0 + Math.floor(i / this.sizeX);
            if (this.riseAt[i] === tick) {
                this.roseAt[i] = tick;
                this.riseAt[i] = NONE;
                this.warnAt[i] = NONE;
                this.cueAt[i] = NONE;
                rose.push(tileX, tileY);
            }
            if (this.dropAt[i] === tick) {
                this.grid.dropTile(tileX, tileY);
                fell.push(tileX, tileY);
            }
            if (this.restoredAt[i] === tick) {
                this.grid.restoreTile(tileX, tileY);
                this.dropWarnAt[i] = NONE;
                this.dropAt[i] = NONE;
                this.restoreAt[i] = NONE;
                this.restoredAt[i] = NONE;
                this.cueAt[i] = NONE;
            }
        }
        return { rose, fell, messages };
    }

    private start(
        pattern: FloorPatternDef,
        tick: number,
        origin: () => { x: number; y: number },
    ): void {
        const { sizeX, sizeY } = this;
        const middle = Math.floor(sizeX / 2);
        // The first warning's now, so the first tile rises a warning from now
        const first = tick + this.slamWarn;
        switch (pattern.kind) {
            case "side": {
                const step = this.ticks(pattern.rowSeconds);
                for (let row = 0; row < sizeY; row++) {
                    const y = sizeY - 1 - row;
                    for (let x = 0; x < sizeX; x++) {
                        const rises =
                            pattern.side === "east"
                                ? x >= middle
                                : pattern.side === "west"
                                  ? x <= middle
                                  : Math.abs(x - middle) > 1;
                        if (rises) {
                            this.rise(x, y, first + row * step, FLOOR_SOUTH, tick);
                        }
                    }
                }
                break;
            }
            case "sweep": {
                const step = this.ticks(pattern.rowSeconds);
                const width = Math.min(pattern.gap, sizeX - 1);
                let gap = this.rng.int(sizeX - width + 1);
                for (let row = 0; row < sizeY; row++) {
                    const y = sizeY - 1 - row;
                    // A tile at a time, so the gap can always be followed
                    if (row > 0) {
                        gap = Math.min(Math.max(gap + this.rng.int(3) - 1, 0), sizeX - width);
                    }
                    for (let x = 0; x < sizeX; x++) {
                        if (x < gap || x >= gap + width) {
                            this.rise(x, y, first + row * step, FLOOR_SOUTH, tick);
                        }
                    }
                }
                break;
            }
            case "ripple": {
                const step = this.ticks(pattern.ringSeconds);
                let ox = middle;
                let oy = Math.floor(sizeY / 2);
                if (pattern.at === "player") {
                    const at = origin();
                    ox = Math.min(Math.max(Math.floor(at.x) - this.x0, 0), sizeX - 1);
                    oy = Math.min(Math.max(Math.floor(at.y) - this.y0, 0), sizeY - 1);
                }
                for (let y = 0; y < sizeY; y++) {
                    for (let x = 0; x < sizeX; x++) {
                        const dx = x - ox;
                        const dy = y - oy;
                        const ring = Math.max(Math.abs(dx), Math.abs(dy));
                        const spoke =
                            ring > 0 &&
                            (pattern.spokes === "cross"
                                ? dx === 0 || dy === 0
                                : Math.abs(dx) === Math.abs(dy));
                        if (ring > pattern.radius || spoke) {
                            continue;
                        }
                        // Tipping away from the middle, the way it's going
                        const dir =
                            Math.abs(dx) >= Math.abs(dy)
                                ? dx >= 0
                                    ? FLOOR_EAST
                                    : FLOOR_WEST
                                : dy >= 0
                                  ? FLOOR_NORTH
                                  : FLOOR_SOUTH;
                        this.rise(x, y, first + ring * step, dir, tick);
                    }
                }
                break;
            }
            case "dropRows": {
                const step = this.ticks(pattern.rowSeconds);
                const last = sizeY - this.def.drop.keepRows;
                for (let r = 0; r < pattern.rows && this.rowsDropped < last; r++) {
                    const y = this.rowsDropped++;
                    for (let x = 0; x < sizeX; x++) {
                        this.drop(x, y, tick + r * step, tick);
                    }
                }
                break;
            }
            case "holes": {
                // Inside the edge, and away from the rows falling next: then nothing's cut off
                const free: number[] = [];
                for (let y = this.rowsDropped + 3; y < sizeY - 1; y++) {
                    for (let x = 1; x < sizeX - 1; x++) {
                        if (this.isWholeAround(x, y)) {
                            free.push(x + y * sizeX);
                        }
                    }
                }
                for (let n = 0; n < pattern.count && free.length > 0; n++) {
                    const pick = this.rng.int(free.length);
                    const i = free[pick];
                    free.splice(pick, 1);
                    const x = i % sizeX;
                    const y = Math.floor(i / sizeX);
                    if (this.isWholeAround(x, y)) {
                        this.drop(x, y, tick, tick);
                    }
                }
                break;
            }
            case "restore": {
                const step = this.ticks(pattern.rowSeconds);
                for (let i = 0; i < this.dropAt.length; i++) {
                    if (this.dropAt[i] === NONE || this.restoreAt[i] !== NONE) {
                        continue;
                    }
                    const y = Math.floor(i / sizeX);
                    // From the front back; one that hasn't gone yet comes back as it would
                    const at = Math.max(tick + (sizeY - 1 - y) * step, this.dropAt[i] + 1);
                    this.restoreAt[i] = at;
                    this.restoredAt[i] = at + this.restoreTicks;
                }
                this.rowsDropped = 0;
                break;
            }
        }
    }

    // A slab rises at a tick, unless the tile's gone or going, or already has one coming. known is
    // the tick its pattern started.
    private rise(x: number, y: number, at: number, dir: number, known: number): void {
        const i = x + y * this.sizeX;
        if (this.dropWarnAt[i] !== NONE || this.riseAt[i] !== NONE) {
            return;
        }
        this.riseAt[i] = at;
        this.warnAt[i] = at - this.slamWarn;
        this.riseDir[i] = dir;
        this.cueAt[i] = known;
    }

    // A tile falls, warned from a tick (known from its pattern's start): no slab rises on it from
    // then
    private drop(x: number, y: number, from: number, known: number): void {
        const i = x + y * this.sizeX;
        if (this.dropWarnAt[i] !== NONE) {
            return;
        }
        this.dropWarnAt[i] = from;
        this.dropAt[i] = from + this.dropWarn;
        this.riseAt[i] = NONE;
        this.warnAt[i] = NONE;
        this.cueAt[i] = known;
    }

    // Whether a tile's known to rise or fall, from its pattern's start until it rises or is back:
    // the tiles to keep off. Ones not marked are safe from everything started so far.
    isMarked(i: number, tick: number): boolean {
        return this.cueAt[i] !== NONE && this.cueAt[i] <= tick && !this.isGone(i, tick);
    }

    // A tile and all eight round it whole and not going: a hole there cuts nothing off
    private isWholeAround(x: number, y: number): boolean {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const tx = x + dx;
                const ty = y + dy;
                if (tx < 0 || ty < 0 || tx >= this.sizeX || ty >= this.sizeY) {
                    return false;
                }
                if (this.dropWarnAt[tx + ty * this.sizeX] !== NONE) {
                    return false;
                }
            }
        }
        return true;
    }
}
