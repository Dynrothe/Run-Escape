import {
    ActorAnim,
    ActorDrawOptions,
    ActorModel,
    ActorRenderer,
    NO_TINT,
} from "../../mapviewer/webgl/actor/ActorRenderer";
import { ArenaFloor, RESTORE_SECONDS } from "../core/ArenaFloor";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { GameAssets, getFloorEdgeKey } from "./GameAssets";

// The floor a map draws itself (MapDef.floor, core/ArenaFloor.ts): every tile is the rising slab's
// model at rest, so each can move on its own, and the map leaves the floor under it hidden (a
// bridge over a pit, scaperune/maps/wardensFloor.ts), so a tile that's fallen opens onto the pit.
// The warnings are the tiles themselves, with nothing drawn over them: a tile about to rise
// shakes, harder as it comes, and one about to fall shakes and sags, light showing round it and
// grit crumbling off it into the dark. A rising tile is the slab's own animation, tipped the way
// its wave travels, throwing up dust; a falling one tumbles away into the pit with chips of rock
// and a puff of dust, and embers drift up out of the holes it leaves.
//
// The effects (FloorDef.effects) are worked out from the floor's arrays and the clock alone, so
// there's nothing to keep, and they're spread over a share of the tiles so a whole row coming up
// costs a phone a few thousand triangles, not tens of thousands.

// A slab rising is back at rest this many ticks in (seq 9697 is 30 long, but its last baked
// frames draw nothing, so the slab at rest takes over from here)
const RISE_TICKS = 18;
// The rising slab, unturned, tips its west edge up first; this turns that to the way a wave
// travels (ArenaFloor's FLOOR_NORTH and on), so the leading edge comes up first
const TIP_YAW = [1536, 1024, 512, 0];
// Shaking before a rise: how far up and down, and how far round, at its hardest (tiles, RS
// angle units), and how fast (times a second)
const SHAKE_HEIGHT = 0.08;
const SHAKE_TURN = 36;
const SHAKE_RATE = 13;
// A shaking tile catches the light (ActorDrawOptions.flash), faintly at first and most just
// before it comes up, so a wave's front shows as it travels; a slab coming up is lit and fades as
// it settles. The floor's dark, and this is what picks the moving tiles out of it.
const SHAKE_LIGHT = [0.03, 0.2];
const RISE_LIGHT = 0.24;
// Before a fall, it shakes this hard (of the above) and sinks this far by the time it goes, and
// darkens to this
const SAG_SHAKE = 0.7;
const SAG_DEPTH = 0.12;
const SAG_TINT = 0x8a8a8a;
// The light in the cracks round a tile about to fall: a second slab just under it, warm and lit,
// pulsing this fast, brighter as it comes; it shows only where the shaking tile leaves a gap
const CRACK_TINT = 0xffb070;
const CRACK_LIGHT = [0.2, 0.45];
const CRACK_PULSE = 5;
const CRACK_DEPTH = 0.06;
// How far a falling tile drops, in tiles, in its fall, and from what part of it it fades
const FALL_DEPTH = 6;
const FADE_FROM = 0.45;
// Coming back up, from this far down
const RESTORE_DEPTH = 2;
// Dust as a slab comes up: on one tile in DUST_SHARE, played once, this big
const DUST_SHARE = 4;
const DUST_SCALE = 1.6;
// Grit off a tile about to fall: on one tile in GRIT_SHARE, GRIT chips at a time, each dropping
// GRIT_DEPTH tiles over GRIT_SECONDS from its edge, once the warning's GRIT_FROM through, this big
const GRIT_SHARE = 2;
const GRIT = 1;
const GRIT_SECONDS = 0.7;
const GRIT_DEPTH = 3;
const GRIT_FROM = 0.25;
const GRIT_SCALE = 0.6;
// Chips falling with a tile, spreading out as they go, this big; and its puff of dust on one tile
// in FALL_DUST_SHARE
const CHIPS = 3;
const CHIP_SPREAD = 0.9;
const CHIP_SCALE = 0.45;
const FALL_DUST_SHARE = 2;
// Embers out of the pit under a hole: on one hole in EMBER_SHARE, rising EMBER_RISE tiles from
// EMBER_DEPTH down over EMBER_SECONDS, lit, this big
const EMBER_SHARE = 4;
const EMBER_DEPTH = 7;
const EMBER_RISE = 6;
const EMBER_SECONDS = 2.6;
const EMBER_SCALE = 1.1;
const EMBER_LIGHT = 0.55;

// The walls hung under a hole's edges: this many, one under another, each darker, so the edge
// goes down into the dark; and how thick the floor's slab is, which they hang from under
const EDGE_STACK = 3;
const EDGE_TINTS = [0xb4b4b4, 0x707070, 0x383838];
const SLAB_THICKNESS = 0.13;
// The sides of a hole the camera sees, as a wall's rotation on the hole's own tile (west, north,
// east; the south side faces away), and the neighbour on each
const EDGE_SIDES: [rotation: number, dx: number, dy: number][] = [
    [0, -1, 0],
    [1, 0, 1],
    [2, 1, 0],
];

function smooth(t: number): number {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
}

// The fraction of a number
function frac(v: number): number {
    return v - Math.floor(v);
}

type Effect = { model: ActorModel; anim: ActorAnim };

export class FloorView {
    private readonly options: ActorDrawOptions = { alpha: 1, tint: NO_TINT, flash: 0 };

    constructor(private readonly assets: GameAssets) {}

    private effect(spotAnim: number | undefined): Effect | undefined {
        const model = spotAnim !== undefined ? this.assets.get("spot:" + spotAnim) : undefined;
        return model && { model, anim: model.anims[0] };
    }

    submitActors(actors: ActorRenderer, sim: Sim, alpha: number): void {
        const floor = sim.floor;
        if (!floor) {
            return;
        }
        const def = floor.def;
        const slab = this.assets.get("spot:" + def.slam.spotAnim);
        const tumble = this.assets.get("spot:" + def.drop.spotAnim);
        if (!slab || !tumble) {
            return;
        }
        const dust = this.effect(def.effects?.dust);
        const fallDust = this.effect(def.effects?.fallDust);
        const rock = this.effect(def.effects?.rock);
        const ember = this.effect(def.effects?.ember);
        const edgeId = def.effects?.edge;
        const edge = edgeId !== undefined ? this.assets.get(getFloorEdgeKey(edgeId)) : undefined;
        const rising = slab.anims[0];
        const falling = tumble.anims[0];
        const tick = sim.tick;
        // In ticks, between this one and the next, so what moves on its own moves smoothly
        const now = tick + alpha;
        const seconds = now / TICKS_PER_SECOND;
        const fallTicks = def.drop.fall * TICKS_PER_SECOND;
        const restoreTicks = RESTORE_SECONDS * TICKS_PER_SECOND;
        const options = this.options;
        for (let i = 0; i < floor.riseAt.length; i++) {
            const col = i % floor.sizeX;
            const row = Math.floor(i / floor.sizeX);
            const x = floor.x0 + col + 0.5;
            const y = floor.y0 + row + 0.5;
            const ground = sim.grid.getHeight(x, y) / 128;
            const phase = this.phase(i);
            // Which share of the tiles this one's in, for effects only some of them have
            const share = col + 2 * row;
            this.reset();
            const dropAt = floor.dropAt[i];
            const restoreAt = floor.restoreAt[i];
            // Coming back up out of the dark
            if (restoreAt !== -1 && tick >= restoreAt) {
                const t = smooth((now - restoreAt) / restoreTicks);
                options.alpha = Math.min(1, t * 2);
                actors.draw(slab, rising, 0, x, ground + (1 - t) * RESTORE_DEPTH, y, 0, options);
                continue;
            }
            // Gone: tumbling down into the pit with its chips, then embers out of the hole
            if (dropAt !== -1 && tick >= dropAt) {
                const since = now - dropAt;
                if (since < fallTicks) {
                    const t = since / fallTicks;
                    const fade = t < FADE_FROM ? 1 : 1 - (t - FADE_FROM) / (1 - FADE_FROM);
                    options.alpha = fade;
                    const frame = falling.getFrame(tick - dropAt, false);
                    const depth = t * t * FALL_DEPTH;
                    actors.draw(tumble, falling, frame, x, ground + depth, y, 0, options);
                    if (rock) {
                        this.drawChips(actors, rock, x, y, ground, t, fade, phase, tick - dropAt);
                    }
                    if (fallDust && share % FALL_DUST_SHARE === 0) {
                        this.reset();
                        this.drawOnce(actors, fallDust, x, ground, y, tick - dropAt, phase, 1);
                    }
                }
                if (ember && share % EMBER_SHARE === 0 && floor.isGone(i, tick)) {
                    this.drawEmber(actors, ember, x, y, ground, seconds, phase);
                }
                if (edge) {
                    this.drawEdges(actors, edge, floor, col, row, x, y, ground, tick);
                }
                continue;
            }
            // About to fall: shaking and sagging, darker as it goes, light in the cracks round
            // it, and grit crumbling off it into the dark
            const dropWarnAt = floor.dropWarnAt[i];
            if (dropWarnAt !== -1 && tick >= dropWarnAt) {
                const t = Math.min(1, (now - dropWarnAt) / Math.max(1, dropAt - dropWarnAt));
                const shake = SAG_SHAKE * (0.4 + 0.6 * t);
                const wobble = Math.sin((seconds * SHAKE_RATE + phase) * Math.PI * 2);
                const turn = Math.sin((seconds * SHAKE_RATE * 0.8 + phase * 2) * Math.PI * 2);
                const sag = t * t * SAG_DEPTH;
                options.tint = this.darken(t);
                actors.draw(
                    slab,
                    rising,
                    0,
                    x,
                    ground + sag + Math.abs(wobble) * SHAKE_HEIGHT * shake,
                    y,
                    turn * SHAKE_TURN * shake,
                    options,
                );
                const pulse = 0.5 + 0.5 * Math.sin((seconds * CRACK_PULSE + phase) * Math.PI * 2);
                options.tint = CRACK_TINT;
                options.flash =
                    CRACK_LIGHT[0] + (CRACK_LIGHT[1] - CRACK_LIGHT[0]) * t * (0.6 + 0.4 * pulse);
                actors.draw(slab, rising, 0, x, ground + sag + CRACK_DEPTH, y, 0, options);
                if (rock && t > GRIT_FROM && share % GRIT_SHARE === 0) {
                    this.drawGrit(actors, rock, x, y, ground + sag, seconds, phase);
                }
                continue;
            }
            // Coming up: the slab's own animation, tipped the way it's travelling, and dust
            const roseAt = floor.roseAt[i];
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                const frame = rising.getFrame(tick - roseAt, false);
                options.flash = RISE_LIGHT * (1 - (now - roseAt) / RISE_TICKS);
                actors.draw(slab, rising, frame, x, ground, y, TIP_YAW[floor.riseDir[i]], options);
            }
            if (dust && roseAt !== -1 && share % DUST_SHARE === 0) {
                this.reset();
                this.drawOnce(actors, dust, x, ground, y, tick - roseAt, phase, DUST_SCALE);
            }
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                continue;
            }
            // About to come up: shaking, harder as it comes
            const warnAt = floor.warnAt[i];
            this.reset();
            if (warnAt !== -1 && tick >= warnAt) {
                const t = Math.min(1, (now - warnAt) / Math.max(1, floor.riseAt[i] - warnAt));
                const shake = 0.35 + 0.65 * t * t;
                options.flash = SHAKE_LIGHT[0] + (SHAKE_LIGHT[1] - SHAKE_LIGHT[0]) * t * t * t;
                const lift = Math.abs(Math.sin((seconds * SHAKE_RATE + phase) * Math.PI * 2));
                const turn = Math.sin((seconds * SHAKE_RATE * 0.8 + phase * 2) * Math.PI * 2);
                actors.draw(
                    slab,
                    rising,
                    0,
                    x,
                    ground - lift * SHAKE_HEIGHT * shake,
                    y,
                    turn * SHAKE_TURN * shake,
                    options,
                );
                continue;
            }
            actors.draw(slab, rising, 0, x, ground, y, 0, options);
        }
    }

    private reset(): void {
        this.options.alpha = 1;
        this.options.tint = NO_TINT;
        this.options.flash = 0;
        this.options.scale = 1;
    }

    // An effect played through once from a tick, turned a tile's own way, and then gone
    private drawOnce(
        actors: ActorRenderer,
        effect: Effect,
        x: number,
        height: number,
        y: number,
        since: number,
        phase: number,
        scale: number,
    ): void {
        if (since < 0 || since >= effect.anim.totalTicks) {
            return;
        }
        this.options.scale = scale;
        const frame = effect.anim.getFrame(since, false);
        actors.draw(effect.model, effect.anim, frame, x, height, y, phase * 2048, this.options);
    }

    // Chips of rock falling from a tile's edges as it shakes, one after another
    private drawGrit(
        actors: ActorRenderer,
        rock: Effect,
        x: number,
        y: number,
        height: number,
        seconds: number,
        phase: number,
    ): void {
        const options = this.options;
        this.reset();
        options.scale = GRIT_SCALE;
        for (let n = 0; n < GRIT; n++) {
            const t = frac(seconds / GRIT_SECONDS + phase + n / GRIT);
            // Round the tile's edge, a new place each time it falls
            const at = frac(phase * 7 + n * 0.37 + Math.floor(seconds / GRIT_SECONDS) * 0.61);
            const side = Math.floor(at * 4);
            const along = frac(at * 4) - 0.5;
            const dx = side === 0 ? along : side === 1 ? 0.5 : side === 2 ? -along : -0.5;
            const dy = side === 0 ? 0.5 : side === 1 ? along : side === 2 ? -0.5 : -along;
            options.alpha = 1 - t;
            const frame = rock.anim.getFrame(Math.floor(t * rock.anim.totalTicks));
            actors.draw(
                rock.model,
                rock.anim,
                frame,
                x + dx,
                height + t * t * GRIT_DEPTH,
                y + dy,
                at * 2048,
                options,
            );
        }
    }

    // Chips breaking off a falling tile, spreading out and dropping faster than it
    private drawChips(
        actors: ActorRenderer,
        rock: Effect,
        x: number,
        y: number,
        height: number,
        t: number,
        fade: number,
        phase: number,
        since: number,
    ): void {
        const options = this.options;
        this.reset();
        options.scale = CHIP_SCALE;
        options.alpha = fade;
        for (let n = 0; n < CHIPS; n++) {
            const angle = (phase + n / CHIPS) * Math.PI * 2;
            const out = t * CHIP_SPREAD;
            actors.draw(
                rock.model,
                rock.anim,
                rock.anim.getFrame(since + n * 7),
                x + Math.cos(angle) * out,
                height + t * t * FALL_DEPTH * 1.2 + 0.1,
                y + Math.sin(angle) * out,
                angle * 326,
                options,
            );
        }
    }

    // An ember drifting up out of the pit under a hole, brightest halfway, over and over
    private drawEmber(
        actors: ActorRenderer,
        ember: Effect,
        x: number,
        y: number,
        height: number,
        seconds: number,
        phase: number,
    ): void {
        const t = frac(seconds / EMBER_SECONDS + phase);
        const options = this.options;
        this.reset();
        options.scale = EMBER_SCALE;
        options.flash = EMBER_LIGHT;
        options.alpha = Math.sin(t * Math.PI);
        actors.draw(
            ember.model,
            ember.anim,
            0,
            x + Math.sin((t + phase) * Math.PI * 2) * 0.3,
            height + EMBER_DEPTH - t * EMBER_RISE,
            y + (phase - 0.5) * 0.6,
            phase * 2048,
            options,
        );
    }

    // The floor's edge going down into the dark on each side of a hole the camera sees, where the
    // tile beside it is still there
    private drawEdges(
        actors: ActorRenderer,
        edge: ActorModel,
        floor: ArenaFloor,
        col: number,
        row: number,
        x: number,
        y: number,
        ground: number,
        tick: number,
    ): void {
        const options = this.options;
        const height = edge.height / 128;
        const anim = edge.anims[0];
        for (const [rotation, dx, dy] of EDGE_SIDES) {
            const beside = floor.index(floor.x0 + col + dx, floor.y0 + row + dy);
            if (beside >= 0 && floor.isGone(beside, tick)) {
                continue;
            }
            this.reset();
            for (let k = 0; k < EDGE_STACK; k++) {
                options.tint = EDGE_TINTS[k];
                const bottom = ground + SLAB_THICKNESS + height * (k + 1);
                actors.draw(edge, anim, 0, x, bottom, y, ((rotation + 2) & 3) * 512, options);
            }
        }
    }

    // Each tile's own place in the shake, so neighbours don't move as one
    private phase(i: number): number {
        const h = Math.imul(i + 1, 0x9e3779b1) >>> 0;
        return (h % 1000) / 1000;
    }

    private darken(t: number): number {
        const k = 1 - t * (1 - (SAG_TINT & 0xff) / 255);
        const c = Math.round(255 * k);
        return (c << 16) | (c << 8) | c;
    }
}
