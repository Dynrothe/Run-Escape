import type { FloorDef, FloorPatternDef } from "../content/types";
import type { Rng } from "./Rng";
import {
    FloorLayout,
    TYPE_FRAGILE,
    TYPE_NORMAL,
    TYPE_REINFORCED,
    layoutFloor,
    slabTiles,
} from "./floorLayout";
import type { ArenaGrid } from "./world/ArenaGrid";

// Which way a rising slab tips, as it travels: its leading edge comes up first (client/FloorView.ts)
export const FLOOR_NORTH = 0;
export const FLOOR_EAST = 1;
export const FLOOR_SOUTH = 2;
export const FLOOR_WEST = 3;

const NONE = -1;

// Seconds a fallen tile takes to come back up into place (FloorPatternDef restore)
export const RESTORE_SECONDS = 0.6;
// A fragile tile's warning is this much of a fall's, and it falls by itself after rising this many
// times, unless its floor says otherwise (FloorDef.drop.fragile)
const FRAGILE_WARN = 0.5;
const FRAGILE_HITS = 2;

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
    // How it's shown from then: 1 bold, 0 subtle (FloorCue, the pattern's or the floor's)
    readonly cueBold: Uint8Array;
    // Which tiles are floor, and each one's skin, type, turn and slab (floorLayout.ts)
    readonly layout: FloorLayout;
    // Times each tile's risen since the floor was last whole (a fragile tile falls after a few)
    readonly hits: Uint8Array;
    // Which pattern each tile's rise to come is from (the patterns started, counted)
    private readonly by: Int32Array;
    private patterns = 0;
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
    // Whether the pattern starting now is shown bold
    private bold = false;

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
        this.cueBold = new Uint8Array(count);
        this.slamWarn = this.ticks(def.slam.warn);
        this.hurtFrom = this.ticks(def.slam.hurt[0]);
        this.hurtTo = this.ticks(def.slam.hurt[1]);
        this.dropWarn = this.ticks(def.drop.warn);
        this.restoreTicks = this.ticks(RESTORE_SECONDS);
        this.layout = layoutFloor(def, this.sizeX, this.sizeY);
        this.hits = new Uint8Array(count);
        this.by = new Int32Array(count).fill(NONE);
        // The grid's kept between runs on a map; what isn't floor is the pit's from the start
        grid.restoreAllTiles();
        for (let i = 0; i < count; i++) {
            if (!this.layout.mask[i]) {
                grid.dropTile(this.x0 + (i % this.sizeX), this.y0 + Math.floor(i / this.sizeX));
            }
        }
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

    // Whether a tile's fallen and not back, or was never floor
    isGone(i: number, tick: number): boolean {
        return (
            !this.layout.mask[i] ||
            (this.dropAt[i] !== NONE &&
                this.dropAt[i] <= tick &&
                (this.restoredAt[i] === NONE || this.restoredAt[i] > tick))
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
                this.hits[i] = Math.min(255, this.hits[i] + 1);
                rose.push(tileX, tileY);
                this.crack(i, tick);
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
                this.hits[i] = 0;
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
        const { minX, maxX, minY, maxY } = this.layout;
        if (maxX < 0) {
            return;
        }
        const middle = Math.floor((minX + maxX) / 2);
        this.bold = (pattern.cue ?? this.def.cue ?? "subtle") === "bold";
        this.patterns++;
        // The first warning's now, so the first tile rises a warning from now
        const first = tick + this.slamWarn;
        switch (pattern.kind) {
            case "side": {
                const step = this.ticks(pattern.rowSeconds);
                for (let row = 0; row <= maxY - minY; row++) {
                    const y = maxY - row;
                    for (let x = minX; x <= maxX; x++) {
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
                const across = maxX - minX + 1;
                const width = Math.min(pattern.gap, across - 1);
                let gap = minX + this.rng.int(across - width + 1);
                for (let row = 0; row <= maxY - minY; row++) {
                    const y = maxY - row;
                    // A tile at a time, so the gap can always be followed
                    if (row > 0) {
                        gap = Math.min(Math.max(gap + this.rng.int(3) - 1, minX), maxX - width + 1);
                    }
                    // Where it's all floor: the nearest place to there that is, on a shaped floor.
                    // A row with nowhere wide enough stays down.
                    const at = this.gapNear(gap, width, y);
                    if (at === NONE) {
                        continue;
                    }
                    for (let x = minX; x <= maxX; x++) {
                        if (x < at || x >= at + width) {
                            this.rise(x, y, first + row * step, FLOOR_SOUTH, tick);
                        }
                    }
                }
                break;
            }
            case "ripple": {
                const step = this.ticks(pattern.ringSeconds);
                let ox = middle;
                let oy = Math.floor((minY + maxY) / 2);
                if (pattern.at === "player") {
                    const at = origin();
                    ox = Math.min(Math.max(Math.floor(at.x) - this.x0, minX), maxX);
                    oy = Math.min(Math.max(Math.floor(at.y) - this.y0, minY), maxY);
                }
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
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
                const last = maxY - minY + 1 - this.def.drop.keepRows;
                for (let r = 0; r < pattern.rows && this.rowsDropped < last; r++) {
                    const y = minY + this.rowsDropped;
                    const row: number[] = [];
                    for (let x = minX; x <= maxX; x++) {
                        if (this.canFall(x + y * sizeX)) {
                            row.push(...slabTiles(this.layout, x + y * sizeX));
                        }
                    }
                    // Not if it'd leave part of the floor cut off from the rest
                    if (!this.def.drop.islands && this.wouldSplit(row)) {
                        break;
                    }
                    this.rowsDropped++;
                    for (let x = minX; x <= maxX; x++) {
                        this.drop(x, y, tick + r * step, tick);
                    }
                }
                break;
            }
            case "holes": {
                // Inside the edge, and away from the rows falling next: then nothing's cut off
                const free: number[] = [];
                for (let y = minY + this.rowsDropped + 3; y < maxY; y++) {
                    for (let x = minX + 1; x < maxX; x++) {
                        if (this.canFall(x + y * sizeX) && this.isWholeAround(x, y)) {
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
                    const whole = slabTiles(this.layout, i);
                    if (
                        this.isWholeAround(x, y) &&
                        (this.def.drop.islands || whole.length === 1 || !this.wouldSplit(whole))
                    ) {
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
                    const at = Math.max(tick + (maxY - y) * step, this.dropAt[i] + 1);
                    this.restoreAt[i] = at;
                    this.restoredAt[i] = at + this.restoreTicks;
                }
                this.rowsDropped = 0;
                break;
            }
        }
    }

    // A slab rises at a tick, unless the tile's gone or going, already has one coming from an
    // earlier pattern, or never rises (solid, safe, or no floor). known is the tick its pattern
    // started. A slab of several tiles rises as one, when the first of them would.
    private rise(x: number, y: number, at: number, dir: number, known: number): void {
        const i = x + y * this.sizeX;
        const { layout } = this;
        if (!layout.mask[i]) {
            return;
        }
        const type = layout.type[i];
        if (type !== TYPE_NORMAL && type !== TYPE_REINFORCED && type !== TYPE_FRAGILE) {
            return;
        }
        const tiles = slabTiles(layout, i);
        for (const j of tiles) {
            if (this.dropWarnAt[j] !== NONE) {
                return;
            }
            if (this.riseAt[j] !== NONE && (this.by[j] !== this.patterns || this.riseAt[j] <= at)) {
                return;
            }
        }
        for (const j of tiles) {
            this.riseAt[j] = at;
            this.warnAt[j] = at - this.slamWarn;
            this.riseDir[j] = dir;
            this.cueAt[j] = known;
            this.cueBold[j] = this.bold ? 1 : 0;
            this.by[j] = this.patterns;
        }
    }

    // Whether a tile can fall: there's floor, and it's not solid, safe or reinforced
    private canFall(i: number): boolean {
        const type = this.layout.type[i];
        return this.layout.mask[i] === 1 && (type === TYPE_NORMAL || type === TYPE_FRAGILE);
    }

    // A fragile tile that's risen often enough falls by itself, once it's settled
    private crack(i: number, tick: number): void {
        const { layout } = this;
        if (layout.anchor[i] !== i || layout.type[i] !== TYPE_FRAGILE) {
            return;
        }
        if (this.hits[i] < (this.def.drop.fragile?.hits ?? FRAGILE_HITS)) {
            return;
        }
        const tiles = slabTiles(layout, i);
        if (!this.def.drop.islands && this.wouldSplit(tiles)) {
            return;
        }
        this.drop(i % this.sizeX, Math.floor(i / this.sizeX), tick + this.hurtTo + 1, tick);
    }

    // The nearest place to from (by column) where a gap width wide is all floor, in a row
    private gapNear(from: number, width: number, y: number): number {
        const { minX, maxX, mask } = this.layout;
        const fits = (at: number) => {
            for (let x = at; x < at + width; x++) {
                if (x < minX || x > maxX || !mask[x + y * this.sizeX]) {
                    return false;
                }
            }
            return true;
        };
        for (let d = 0; d <= maxX - minX; d++) {
            if (fits(from - d)) {
                return from - d;
            }
            if (fits(from + d)) {
                return from + d;
            }
        }
        return NONE;
    }

    // Whether taking these tiles away would leave the floor that's still there (floor, not gone
    // or going) in more than one piece, side by side, or leave none
    wouldSplit(tiles: number[]): boolean {
        const { sizeX, sizeY } = this;
        const count = sizeX * sizeY;
        const open = new Uint8Array(count);
        let total = 0;
        for (let i = 0; i < count; i++) {
            if (this.layout.mask[i] && this.dropWarnAt[i] === NONE) {
                open[i] = 1;
                total++;
            }
        }
        for (const i of tiles) {
            if (open[i]) {
                open[i] = 0;
                total--;
            }
        }
        if (total <= 0) {
            return true;
        }
        const start = open.indexOf(1);
        const queue = [start];
        open[start] = 2;
        let reached = 0;
        while (queue.length > 0) {
            const i = queue.pop()!;
            reached++;
            const x = i % sizeX;
            const y = Math.floor(i / sizeX);
            for (const [nx, ny] of [
                [x + 1, y],
                [x - 1, y],
                [x, y + 1],
                [x, y - 1],
            ]) {
                const n = nx + ny * sizeX;
                if (nx >= 0 && ny >= 0 && nx < sizeX && ny < sizeY && open[n] === 1) {
                    open[n] = 2;
                    queue.push(n);
                }
            }
        }
        return reached < total;
    }

    // A tile falls, warned from a tick (known from its pattern's start): no slab rises on it from
    // then. A slab falls whole; a fragile one sooner; a solid, safe or reinforced one never.
    private drop(x: number, y: number, from: number, known: number): void {
        const i = x + y * this.sizeX;
        if (!this.canFall(i)) {
            return;
        }
        const tiles = slabTiles(this.layout, i);
        if (tiles.some((j) => this.dropWarnAt[j] !== NONE)) {
            return;
        }
        const warn =
            this.layout.type[i] === TYPE_FRAGILE
                ? Math.round(this.dropWarn * (this.def.drop.fragile?.warn ?? FRAGILE_WARN))
                : this.dropWarn;
        for (const j of tiles) {
            this.dropWarnAt[j] = from;
            this.dropAt[j] = from + warn;
            this.riseAt[j] = NONE;
            this.warnAt[j] = NONE;
            this.cueAt[j] = known;
            this.cueBold[j] = this.bold ? 1 : 0;
        }
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
                if (
                    tx < 0 ||
                    ty < 0 ||
                    tx >= this.sizeX ||
                    ty >= this.sizeY ||
                    !this.layout.mask[tx + ty * this.sizeX]
                ) {
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
