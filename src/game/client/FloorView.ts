import {
    ActorAnim,
    ActorDrawOptions,
    ActorModel,
    ActorRenderer,
    NO_TINT,
} from "../../mapviewer/webgl/actor/ActorRenderer";
import { ArenaFloor, RESTORE_SECONDS } from "../core/ArenaFloor";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { GameAssets } from "./GameAssets";

// The floor a map draws itself (MapDef.floor, core/ArenaFloor.ts): every tile is the rising slab's
// model at rest, so each can move on its own, and the map leaves the floor under it hidden (a
// bridge over an even, empty pit, scaperune/maps/wardensFloor.ts), so a tile that's fallen opens
// onto the dark. The warnings are the tiles' own movement and nothing else, no colour: a tile
// about to rise trembles, harder as it comes, rattling up off its bed and twisting as the slab
// does when it goes (the cache has the slab's rise, seqs 9697 to 9700, but no tremor of its own);
// one about to fall trembles the same way and sags, darkening as it sinks, grit crumbling off it.
// A rising tile is the slab's own animation, tipped the way its wave travels, throwing up dust; a
// falling one tumbles away into the dark with chips of rock and a puff of dust. Wherever a tile's
// beside a hole, its thickness shows: more of the slab under it, darker as it goes down.
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
// The tremor before a rise: how far it rattles up off its bed and how far it twists at its
// hardest (tiles, RS angle units), how fast (times a second), how hard it starts (of its
// hardest), and how far it's lifted, on average, by the time it goes, so its sides show
const TREMOR_HEIGHT = 0.14;
const TREMOR_TURN = 64;
const TREMOR_RATE = 13;
const TREMOR_START = 0.4;
const TREMOR_LIFT = 0.08;
// Before a fall, it trembles this hard (of the above), sinks this far by the time it goes, and
// darkens to this
const SAG_TREMOR = 0.75;
const SAG_DEPTH = 0.14;
const SAG_TINT = 0x8a8a8a;
// How far a falling tile drops, in tiles, in its fall, and from what part of it it fades
const FALL_DEPTH = 6;
const FADE_FROM = 0.45;
// Coming back up, from this far down
const RESTORE_DEPTH = 2;
// Dust as a slab comes up: on one tile in DUST_SHARE, played once, this big
const DUST_SHARE = 4;
const DUST_SCALE = 1.6;
// Grit off a tile about to fall: on one tile in GRIT_SHARE, one chip at a time, each dropping
// GRIT_DEPTH tiles over GRIT_SECONDS from its edge, once the warning's GRIT_FROM through, this big
const GRIT_SHARE = 2;
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
// A tile beside a hole has its thickness drawn: the slab again under it, each one a slab's
// thickness lower and darker, down into the dark
const SLAB_THICKNESS = 0.13;
const EDGE_TINTS = [0xffffff, 0xc8c8c8, 0x969696, 0x6a6a6a, 0x444444, 0x242424];
const NEIGHBOURS: [dx: number, dy: number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
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
    private readonly options: ActorDrawOptions = { alpha: 1, tint: NO_TINT, scale: 1 };

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
            // Gone: tumbling down into the dark with its chips
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
                continue;
            }
            const edged = this.besideHole(floor, col, row, tick);
            // About to fall: trembling and sagging, darker as it sinks, and grit crumbling off it
            const dropWarnAt = floor.dropWarnAt[i];
            if (dropWarnAt !== -1 && tick >= dropWarnAt) {
                const t = Math.min(1, (now - dropWarnAt) / Math.max(1, dropAt - dropWarnAt));
                const tremor = this.tremor(seconds, phase, SAG_TREMOR * (0.4 + 0.6 * t), 0);
                const sag = t * t * SAG_DEPTH;
                options.tint = this.darken(t);
                this.drawTile(
                    actors,
                    slab,
                    rising,
                    x,
                    ground + sag + tremor.lift,
                    y,
                    tremor.turn,
                    edged,
                );
                if (rock && t > GRIT_FROM && share % GRIT_SHARE === 0) {
                    this.drawGrit(actors, rock, x, y, ground + sag, seconds, phase);
                }
                continue;
            }
            // Coming up: the slab's own animation, tipped the way it's travelling, and dust
            const roseAt = floor.roseAt[i];
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                const frame = rising.getFrame(tick - roseAt, false);
                actors.draw(slab, rising, frame, x, ground, y, TIP_YAW[floor.riseDir[i]], options);
                if (edged) {
                    this.drawThickness(actors, slab, rising, x, ground, y, 0);
                }
            }
            if (dust && roseAt !== -1 && share % DUST_SHARE === 0) {
                this.reset();
                this.drawOnce(actors, dust, x, ground, y, tick - roseAt, phase, DUST_SCALE);
            }
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                continue;
            }
            // About to come up: trembling, harder as it comes
            const warnAt = floor.warnAt[i];
            this.reset();
            if (warnAt !== -1 && tick >= warnAt) {
                const t = Math.min(1, (now - warnAt) / Math.max(1, floor.riseAt[i] - warnAt));
                const strength = TREMOR_START + (1 - TREMOR_START) * t * t;
                const tremor = this.tremor(seconds, phase, strength, t * TREMOR_LIFT);
                this.drawTile(actors, slab, rising, x, ground + tremor.lift, y, tremor.turn, edged);
                continue;
            }
            this.drawTile(actors, slab, rising, x, ground, y, 0, edged);
        }
    }

    private reset(): void {
        this.options.alpha = 1;
        this.options.tint = NO_TINT;
        this.options.scale = 1;
    }

    // How far up (negative) and round a trembling tile is now: a rattle up off its bed, never
    // into it, and a twist, each tile on its own beat
    private tremor(
        seconds: number,
        phase: number,
        strength: number,
        lifted: number,
    ): { lift: number; turn: number } {
        const rattle = Math.abs(Math.sin((seconds * TREMOR_RATE + phase) * Math.PI * 2));
        const twist = Math.sin((seconds * TREMOR_RATE * 0.8 + phase * 2) * Math.PI * 2);
        return {
            lift: -(rattle * TREMOR_HEIGHT * strength + lifted),
            turn: twist * TREMOR_TURN * strength,
        };
    }

    // A tile at rest or moving, with its thickness under it if it's beside a hole
    private drawTile(
        actors: ActorRenderer,
        slab: ActorModel,
        anim: ActorAnim,
        x: number,
        height: number,
        y: number,
        yaw: number,
        edged: boolean,
    ): void {
        actors.draw(slab, anim, 0, x, height, y, yaw, this.options);
        if (edged) {
            this.drawThickness(actors, slab, anim, x, height, y, yaw);
        }
    }

    // The slab again under a tile, a slab's thickness at a time, darker each, so a hole's edge
    // shows the floor's cut edge going down into the dark
    private drawThickness(
        actors: ActorRenderer,
        slab: ActorModel,
        anim: ActorAnim,
        x: number,
        height: number,
        y: number,
        yaw: number,
    ): void {
        const tint = this.options.tint;
        EDGE_TINTS.forEach((edgeTint, k) => {
            this.options.tint = edgeTint;
            actors.draw(slab, anim, 0, x, height + SLAB_THICKNESS * (k + 1), y, yaw, this.options);
        });
        this.options.tint = tint;
    }

    // Whether a tile's beside one that's fallen (and not back), along a side
    private besideHole(floor: ArenaFloor, col: number, row: number, tick: number): boolean {
        for (const [dx, dy] of NEIGHBOURS) {
            const beside = floor.index(floor.x0 + col + dx, floor.y0 + row + dy);
            if (beside >= 0 && floor.isGone(beside, tick)) {
                return true;
            }
        }
        return false;
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

    // A chip of rock falling from a tile's edge as it shakes, one after another
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
        const t = frac(seconds / GRIT_SECONDS + phase);
        // Round the tile's edge, a new place each time it falls
        const at = frac(phase * 7 + Math.floor(seconds / GRIT_SECONDS + phase) * 0.61);
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

    // Each tile's own beat in the tremor, so neighbours don't move as one
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
