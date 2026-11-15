import type { FloorActionDef, FloorBeatDef, FloorDef, FloorPatternDef } from "../content/types";
import type { Rng } from "./Rng";
import {
    EFFECT_NONE,
    FloorLayout,
    RAMP_NONE,
    TYPE_FRAGILE,
    TYPE_NORMAL,
    TYPE_PILLAR,
    TYPE_REINFORCED,
    applySkinEffects,
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
// A hole's fall, long before anything: gone, and never drawn falling

// Seconds a fallen tile takes to come back up into place (FloorPatternDef restore)
export const RESTORE_SECONDS = 0.6;
// A fragile tile's warning is this much of a fall's, and it falls by itself after rising this many
// times, unless its floor says otherwise (FloorDef.drop.fragile)
const FRAGILE_WARN = 0.5;
export const FRAGILE_HITS = 2;
// A fallen tile rebuilding by itself (FloorDef.rebuild): warned this long, rising this long, unless
// the floor says otherwise
export const REBUILD_WARN = 1;
export const REBUILD_RISE = 0.8;
// A trigger's rest after it's set off, unless it says otherwise (FloorTriggerDef.cooldown)
const TRIGGER_COOLDOWN = 5;
// Heights closer than this are the same, for ledges (floorLayout's height and ramp)
const LEVEL = 0.01;

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
    // 1 where that's it rebuilding by itself (FloorDef.rebuild), warned from restoreAt less the
    // floor's rebuild warning, rather than put back by a pattern or an action
    readonly rebuilt: Uint8Array;
    // Tiles of the box that are holes (FloorDef.holes): never floor, but walked on till a fight
    // opens them (openHoles), as the map's ground is till then
    readonly hole: Uint8Array;
    // Each trigger's state (FloorDef.triggers, by layout.triggerNames' index): armed, when it can
    // go off again, and whether a player's on it this tick
    readonly armed: Uint8Array;
    readonly readyAt: Int32Array;
    readonly pressed: Uint8Array;
    // The phase it's in (FloorDef.phases), "" for none
    phase = "";
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
    // What's playing: the floor's script, or its phase's
    private script: FloorBeatDef[];
    private loopSeconds: number;
    // Actions waiting for their delay, in the order they're due; and what to say next tick
    // Actions waiting on their delay, each aimed where it was when it was asked for (a boss's
    // ripple out from the boss, not the floor's target)
    private pending: {
        at: number;
        action: FloorActionDef;
        origin: () => { x: number; y: number };
    }[] = [];
    private messages: string[] = [];
    // Whether any tile's a pillar (they block shots and sight), or has an effect
    readonly hasPillars: boolean;
    readonly hasEffects: boolean;
    // Whether any tile's raised, sunken or a ramp
    readonly hasLevels: boolean;

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
        this.rebuilt = new Uint8Array(count);
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
        this.script = def.script;
        this.loopSeconds = def.loopSeconds;
        const triggers = this.layout.triggerNames.length;
        this.armed = Uint8Array.from(this.layout.triggerNames, (name) =>
            def.triggers![name].armed === false ? 0 : 1,
        );
        this.readyAt = new Int32Array(triggers);
        this.pressed = new Uint8Array(triggers);
        this.hasPillars = this.layout.type.some(
            (type, i) => this.layout.mask[i] === 1 && type === TYPE_PILLAR,
        );
        this.hasEffects = this.layout.effect.some((e) => e !== EFFECT_NONE) || !!def.phases;
        this.hasLevels =
            this.layout.height.some((h) => h !== 0) ||
            this.layout.ramp.some((r) => r !== RAMP_NONE);
        this.hole = new Uint8Array(count);
        for (const span of def.holes ?? []) {
            for (let x = span.x0; x <= span.x1; x++) {
                const i = this.index(x, span.y);
                if (i >= 0) {
                    this.hole[i] = 1;
                }
            }
        }
        // The grid's kept between runs on a map; what isn't floor is the pit's from the start (but
        // the holes, till they're opened)
        grid.restoreAllTiles();
        // and a pillar blocks the way, as an object would
        for (let i = 0; i < count; i++) {
            const x = this.x0 + (i % this.sizeX);
            const y = this.y0 + Math.floor(i / this.sizeX);
            if (!this.layout.mask[i]) {
                if (!this.hole[i]) {
                    grid.dropTile(x, y);
                }
            } else if (this.layout.type[i] === TYPE_PILLAR) {
                grid.dropTile(x, y, true);
            }
        }
        // Raised and sunken tiles have ledges round them, but where a ramp comes up
        for (let i = 0; i < count; i++) {
            const x = i % this.sizeX;
            const y = Math.floor(i / this.sizeX);
            for (const [dx, dy, dir] of [
                [1, 0, FLOOR_EAST],
                [0, 1, FLOOR_NORTH],
            ]) {
                const j = this.index(this.x0 + x + dx, this.y0 + y + dy);
                if (j < 0 || !this.layout.mask[i] || !this.layout.mask[j]) {
                    continue;
                }
                const a = this.edgeHeight(i, dir);
                const b = this.edgeHeight(j, (dir + 2) & 3);
                if (Math.abs(a - b) > LEVEL) {
                    grid.addLedge(this.x0 + x, this.y0 + y, dir === FLOOR_EAST ? "east" : "north");
                }
            }
        }
    }

    // The floor's holes, gone from the grid: walked round from now
    openHoles(): void {
        for (let i = 0; i < this.hole.length; i++) {
            if (this.hole[i]) {
                this.grid.dropTile(
                    this.x0 + (i % this.sizeX),
                    this.y0 + Math.floor(i / this.sizeX),
                );
            }
        }
    }

    // How high a tile is along one of its sides (FLOOR_NORTH and on): its height, or a ramp's at
    // that end (the tile's behind it, or ahead), or halfway along its sides
    edgeHeight(i: number, dir: number): number {
        const { layout } = this;
        const ramp = layout.ramp[i];
        if (ramp === RAMP_NONE) {
            return layout.height[i];
        }
        const ahead = this.neighbourHeight(i, ramp);
        const behind = this.neighbourHeight(i, (ramp + 2) & 3);
        return dir === ramp ? ahead : dir === ((ramp + 2) & 3) ? behind : (ahead + behind) / 2;
    }

    // The height of the tile beside one, that way (its own if there's no floor there, or a ramp)
    private neighbourHeight(i: number, dir: number): number {
        const x =
            this.x0 + (i % this.sizeX) + (dir === FLOOR_EAST ? 1 : dir === FLOOR_WEST ? -1 : 0);
        const y =
            this.y0 +
            Math.floor(i / this.sizeX) +
            (dir === FLOOR_NORTH ? 1 : dir === FLOOR_SOUTH ? -1 : 0);
        const j = this.index(x, y);
        return j >= 0 && this.layout.mask[j] && this.layout.ramp[j] === RAMP_NONE
            ? this.layout.height[j]
            : this.layout.height[i];
    }

    // How high the floor stands at a point (world tiles), in tiles: a platform's height, a
    // sunken tile's, or partway up a ramp; 0 off the floor
    liftAt(x: number, y: number): number {
        if (!this.hasLevels) {
            return 0;
        }
        const i = this.index(Math.floor(x), Math.floor(y));
        if (i < 0 || !this.layout.mask[i]) {
            return 0;
        }
        const ramp = this.layout.ramp[i];
        if (ramp === RAMP_NONE) {
            return this.layout.height[i];
        }
        const fx = x - Math.floor(x);
        const fy = y - Math.floor(y);
        // How far up it, from the low end
        const t =
            ramp === FLOOR_NORTH
                ? fy
                : ramp === FLOOR_SOUTH
                  ? 1 - fy
                  : ramp === FLOOR_EAST
                    ? fx
                    : 1 - fx;
        const low = this.edgeHeight(i, (ramp + 2) & 3);
        return low + (this.edgeHeight(i, ramp) - low) * t;
    }

    // What standing on a tile does (floorLayout's EFFECT_ and on), if it's there to stand on
    effectAt(tileX: number, tileY: number, tick: number): number {
        const i = this.index(tileX, tileY);
        return i < 0 || this.isGone(i, tick) ? EFFECT_NONE : this.layout.effect[i];
    }

    // Whether a pillar stands between two points (world tiles), along the line from one to the
    // other: the tiles it crosses, walked in order, not counting the ones they're on
    blocksSight(fromX: number, fromY: number, toX: number, toY: number): boolean {
        if (!this.hasPillars) {
            return false;
        }
        let tx = Math.floor(fromX);
        let ty = Math.floor(fromY);
        const endX = Math.floor(toX);
        const endY = Math.floor(toY);
        const dx = toX - fromX;
        const dy = toY - fromY;
        const stepX = dx > 0 ? 1 : -1;
        const stepY = dy > 0 ? 1 : -1;
        const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
        const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
        let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - fromX : fromX - tx) * tDeltaX : Infinity;
        let tMaxY = dy !== 0 ? (dy > 0 ? ty + 1 - fromY : fromY - ty) * tDeltaY : Infinity;
        // At most the tiles between them
        for (let n = Math.abs(endX - tx) + Math.abs(endY - ty); n > 0; n--) {
            if (tMaxX < tMaxY) {
                tMaxX += tDeltaX;
                tx += stepX;
            } else {
                tMaxY += tDeltaY;
                ty += stepY;
            }
            if (tx === endX && ty === endY) {
                return false;
            }
            if (this.isPillarTile(tx, ty)) {
                return true;
            }
        }
        return false;
    }

    // Whether a pillar stands on a tile (world tiles)
    isPillarTile(tileX: number, tileY: number): boolean {
        const i = this.index(tileX, tileY);
        return i >= 0 && this.layout.mask[i] === 1 && this.layout.type[i] === TYPE_PILLAR;
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

    // A tick of the floor: the script's next patterns, actions that are due, and what rises, falls
    // and comes back this tick. Returns the tiles that rose, fell and came back (world tiles, x then
    // y) and what's to be said. origin is where a ripple "at the player" starts, and who a
    // dropUnder's aimed at.
    step(
        tick: number,
        origin: () => { x: number; y: number },
    ): { rose: number[]; fell: number[]; back: number[]; messages: string[] } {
        const rose: number[] = [];
        const fell: number[] = [];
        const back: number[] = [];
        const messages = this.messages;
        this.messages = [];
        const script = this.script;
        if (tick - this.loopStart >= this.ticks(this.loopSeconds)) {
            this.loopStart = tick;
            this.nextBeat = 0;
            this.loop++;
        }
        while (
            this.script === script &&
            this.nextBeat < script.length &&
            tick - this.loopStart >= this.ticks(script[this.nextBeat].at)
        ) {
            const beat = script[this.nextBeat++];
            if (beat.message) {
                messages.push(beat.message);
            }
            if (beat.pattern) {
                this.start(beat.pattern, tick, origin);
            }
            if (beat.action) {
                this.act(beat.action, tick, origin);
            }
        }
        while (this.pending.length > 0 && this.pending[0].at <= tick) {
            const due = this.pending.shift()!;
            this.run(due.action, tick, due.origin);
        }
        messages.push(...this.messages);
        this.messages = [];
        const rebuild = this.def.rebuild;
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
                // Back by itself, if it's a floor or a tile that rebuilds
                const after = this.layout.rebuild[i] >= 0 ? this.layout.rebuild[i] : rebuild?.after;
                if (after && after > 0 && this.restoreAt[i] === NONE) {
                    this.restoreAt[i] = tick + this.ticks(after);
                    this.restoredAt[i] =
                        this.restoreAt[i] + Math.max(1, this.ticks(rebuild?.rise ?? REBUILD_RISE));
                    this.rebuilt[i] = 1;
                }
            }
            // A tile rebuilding by itself waits for floor beside it, so it never comes back cut off
            if (this.restoreAt[i] === tick && this.rebuilt[i] && this.layout.anchor[i] === i) {
                if (!this.besideStanding(i)) {
                    for (const j of slabTiles(this.layout, i)) {
                        this.restoreAt[j]++;
                        this.restoredAt[j]++;
                    }
                }
            }
            if (this.restoredAt[i] === tick) {
                this.grid.restoreTile(tileX, tileY);
                this.dropWarnAt[i] = NONE;
                this.dropAt[i] = NONE;
                this.restoreAt[i] = NONE;
                this.restoredAt[i] = NONE;
                this.cueAt[i] = NONE;
                this.hits[i] = 0;
                this.rebuilt[i] = 0;
                back.push(tileX, tileY);
            }
        }
        // Rows rebuilt from the back are rows to fall again
        if (back.length > 0 && this.rowsDropped > 0) {
            this.rowsDropped = this.rowsGone();
        }
        return { rose, fell, back, messages };
    }

    // Rows from the back, one after another, with a tile in them that's gone or going
    private rowsGone(): number {
        const { minX, maxX, minY } = this.layout;
        let rows = 0;
        for (let y = minY; y < this.sizeY; y++) {
            let gone = false;
            for (let x = minX; x <= maxX && !gone; x++) {
                gone = this.dropWarnAt[x + y * this.sizeX] !== NONE;
            }
            if (!gone) {
                break;
            }
            rows++;
        }
        return rows;
    }

    // Whether a tile (or its slab) has floor that's there beside it, on a side
    private besideStanding(i: number): boolean {
        const { layout } = this;
        for (const j of slabTiles(layout, i)) {
            const x = this.x0 + (j % this.sizeX);
            const y = this.y0 + Math.floor(j / this.sizeX);
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                const k = this.index(x + dx, y + dy);
                if (
                    k >= 0 &&
                    layout.mask[k] &&
                    layout.anchor[k] !== layout.anchor[i] &&
                    layout.type[k] !== TYPE_PILLAR &&
                    this.dropWarnAt[k] === NONE
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    // How long before a rebuilding tile comes back it's warned, in ticks
    get rebuildWarnTicks(): number {
        return this.ticks(this.def.rebuild?.warn ?? REBUILD_WARN);
    }

    // Something done to the floor (FloorActionDef), now or after its delay: by a trigger, a beat, a
    // phase or a boss (Sim.floorAct). origin is who it's aimed at.
    act(action: FloorActionDef, tick: number, origin: () => { x: number; y: number }): void {
        if (action.delay && action.delay > 0) {
            const at = tick + this.ticks(action.delay);
            // After everything due by then, so ones due together go in the order they came
            let k = this.pending.length;
            while (k > 0 && this.pending[k - 1].at > at) {
                k--;
            }
            this.pending.splice(k, 0, { at, action, origin });
            return;
        }
        this.run(action, tick, origin);
    }

    private run(
        action: FloorActionDef,
        tick: number,
        origin: () => { x: number; y: number },
    ): void {
        const { def } = this;
        switch (action.kind) {
            case "pattern": {
                const pattern =
                    typeof action.pattern === "string"
                        ? def.patterns?.[action.pattern]
                        : action.pattern;
                if (pattern) {
                    this.start(pattern, tick, origin);
                }
                break;
            }
            case "drop":
                for (const i of this.group(action.group)) {
                    const tiles = slabTiles(this.layout, i);
                    if (def.drop.islands || !this.wouldSplit(tiles)) {
                        this.drop(i % this.sizeX, Math.floor(i / this.sizeX), tick, tick);
                    }
                }
                break;
            case "raise":
                for (const i of this.group(action.group)) {
                    for (const j of slabTiles(this.layout, i)) {
                        this.bringBack(j, tick);
                    }
                }
                break;
            case "slam":
                this.bold = (def.cue ?? "subtle") === "bold";
                this.patterns++;
                for (const i of this.group(action.group)) {
                    this.rise(
                        i % this.sizeX,
                        Math.floor(i / this.sizeX),
                        tick + this.slamWarn,
                        FLOOR_SOUTH,
                        tick,
                    );
                }
                break;
            case "dropUnder": {
                const at = origin();
                const i = this.index(Math.floor(at.x), Math.floor(at.y));
                if (
                    i >= 0 &&
                    this.canFall(i) &&
                    (def.drop.islands || !this.wouldSplit(slabTiles(this.layout, i)))
                ) {
                    this.drop(i % this.sizeX, Math.floor(i / this.sizeX), tick, tick);
                }
                break;
            }
            case "arm": {
                const t = this.layout.triggerNames.indexOf(action.trigger);
                if (t >= 0) {
                    this.armed[t] = action.armed === false ? 0 : 1;
                }
                break;
            }
            case "phase": {
                const phase = def.phases?.[action.phase];
                if (!phase) {
                    break;
                }
                this.phase = action.phase;
                if (phase.message) {
                    this.messages.push(phase.message);
                }
                if (phase.script) {
                    this.script = phase.script;
                    this.loopSeconds = phase.loopSeconds ?? def.loopSeconds;
                    this.loopStart = tick;
                    this.nextBeat = 0;
                }
                if (phase.skins) {
                    const skin = this.layout.skin;
                    for (let i = 0; i < skin.length; i++) {
                        const swap = phase.skins.find(([from]) => from === skin[i]);
                        if (swap) {
                            skin[i] = swap[1];
                        }
                    }
                    applySkinEffects(this.layout, def);
                }
                break;
            }
        }
    }

    // A group's tiles (FloorTileRuleDef.group), each slab once, by its south-west tile
    private group(name: string): number[] {
        const tiles = this.layout.groups.get(name) ?? [];
        return [...new Set(tiles.map((i) => this.layout.anchor[i]))].sort((a, b) => a - b);
    }

    // A tile that's fallen, or is going, comes back up from now (or just after it's gone)
    private bringBack(i: number, tick: number): void {
        if (this.dropAt[i] === NONE) {
            return;
        }
        const at = Math.max(tick, this.dropAt[i] + 1);
        if (this.restoreAt[i] !== NONE && this.restoreAt[i] <= at) {
            return;
        }
        this.restoreAt[i] = at;
        this.restoredAt[i] = at + this.restoreTicks;
        this.rebuilt[i] = 0;
    }

    // The players' tiles this tick (world tiles, x then y): a trigger with a player newly on it
    // that's armed and rested goes off. Returns what's to be said.
    press(tiles: number[], tick: number, origin: () => { x: number; y: number }): string[] {
        const names = this.layout.triggerNames;
        if (names.length === 0) {
            return [];
        }
        const now = new Uint8Array(names.length);
        for (let k = 0; k < tiles.length; k += 2) {
            const i = this.index(tiles[k], tiles[k + 1]);
            if (i >= 0 && this.layout.trigger[i] >= 0 && !this.isGone(i, tick)) {
                now[this.layout.trigger[i]] = 1;
            }
        }
        const said: string[] = [];
        for (let t = 0; t < names.length; t++) {
            const newly = now[t] === 1 && this.pressed[t] === 0;
            this.pressed[t] = now[t];
            if (!newly || !this.armed[t] || tick < this.readyAt[t]) {
                continue;
            }
            const trigger = this.def.triggers![names[t]];
            this.readyAt[t] = tick + this.ticks(trigger.cooldown ?? TRIGGER_COOLDOWN);
            if (trigger.once) {
                this.armed[t] = 0;
            }
            if (trigger.message) {
                said.push(trigger.message);
            }
            for (const action of trigger.actions) {
                this.act(action, tick, origin);
            }
        }
        said.push(...this.messages);
        this.messages = [];
        return said;
    }

    // A pattern, from this tick: the script's, or a fight's own (the Wardens' slams)
    start(pattern: FloorPatternDef, tick: number, origin: () => { x: number; y: number }): void {
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
                // From the front (the north row), or both ways from the origin's row
                const from = pattern.outward
                    ? Math.min(Math.max(Math.floor(origin().y) - this.y0, minY), maxY)
                    : maxY;
                for (let y = minY; y <= maxY; y++) {
                    const row = Math.abs(from - y);
                    for (let x = minX; x <= maxX; x++) {
                        const rises =
                            pattern.side === "east"
                                ? x >= middle
                                : pattern.side === "west"
                                  ? x <= middle
                                  : Math.abs(x - middle) > 1;
                        if (rises) {
                            this.rise(
                                x,
                                y,
                                first + row * step,
                                y > from ? FLOOR_NORTH : FLOOR_SOUTH,
                                tick,
                            );
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
            case "lanes": {
                const step = this.ticks(pattern.tileSeconds);
                let ox = middle;
                let oy = Math.floor((minY + maxY) / 2);
                if (pattern.at === "player") {
                    const at = origin();
                    ox = Math.min(Math.max(Math.floor(at.x) - this.x0, minX), maxX);
                    oy = Math.min(Math.max(Math.floor(at.y) - this.y0, minY), maxY);
                }
                const { spacing, width } = pattern;
                const half = Math.floor(width / 2);
                // On a lane lined up with o, width tiles wide round it, every spacing tiles
                const onLane = (v: number, o: number) =>
                    (((v - o + half) % spacing) + spacing) % spacing < width;
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        const down = pattern.axis !== "x" && onLane(x, ox);
                        const across = pattern.axis !== "y" && onLane(y, oy);
                        if (down) {
                            this.rise(x, y, first + (maxY - y) * step, FLOOR_SOUTH, tick);
                        } else if (across) {
                            const dir = x >= middle ? FLOOR_EAST : FLOOR_WEST;
                            this.rise(x, y, first + Math.abs(x - middle) * step, dir, tick);
                        }
                    }
                }
                break;
            }
            case "plus": {
                const step = this.ticks(pattern.tileSeconds);
                let ox = middle;
                let oy = Math.floor((minY + maxY) / 2);
                if (pattern.at === "player") {
                    const at = origin();
                    ox = Math.min(Math.max(Math.floor(at.x) - this.x0, minX), maxX);
                    oy = Math.min(Math.max(Math.floor(at.y) - this.y0, minY), maxY);
                }
                this.rise(ox, oy, first, FLOOR_SOUTH, tick);
                for (let d = 1; d <= pattern.arm; d++) {
                    // Tipping away from the middle, the way it's going
                    for (const [x, y, dir] of [
                        [ox + d, oy, FLOOR_EAST],
                        [ox - d, oy, FLOOR_WEST],
                        [ox, oy + d, FLOOR_NORTH],
                        [ox, oy - d, FLOOR_SOUTH],
                    ]) {
                        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                            this.rise(x, y, first + d * step, dir, tick);
                        }
                    }
                }
                break;
            }
            case "dropRows": {
                const step = this.ticks(pattern.rowSeconds);
                const last = maxY - minY + 1 - (pattern.keep ?? this.def.drop.keepRows);
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
                    if (
                        !this.layout.mask[i] ||
                        this.dropAt[i] === NONE ||
                        this.restoreAt[i] !== NONE
                    ) {
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
            if (
                this.layout.mask[i] &&
                this.dropWarnAt[i] === NONE &&
                this.layout.type[i] !== TYPE_PILLAR
            ) {
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
                    !this.layout.mask[tx + ty * this.sizeX] ||
                    this.layout.type[tx + ty * this.sizeX] === TYPE_PILLAR
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
