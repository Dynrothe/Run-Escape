import {
    ActorDrawOptions,
    ActorRenderer,
    NO_TINT,
} from "../../mapviewer/webgl/actor/ActorRenderer";
import { RESTORE_SECONDS } from "../core/ArenaFloor";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { GameAssets } from "./GameAssets";

// The floor a map draws itself (MapDef.floor, core/ArenaFloor.ts): every tile is the rising slab's
// model at rest, so each can move on its own, and the map leaves the floor under it hidden, so a
// tile that's fallen shows the void. The warnings are the tiles themselves, with nothing drawn
// over them: a tile about to rise shakes, harder as it comes, and one about to fall shakes and
// sags into the dark. A rising tile is the slab's own animation, tipped the way its wave travels;
// a falling one tumbles as it drops away and fades.

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
// How far a falling tile drops, in tiles, in its fall, and from what part of it it fades
const FALL_DEPTH = 4;
const FADE_FROM = 0.45;
// Coming back up, from this far down
const RESTORE_DEPTH = 2;

function smooth(t: number): number {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
}

export class FloorView {
    private readonly options: ActorDrawOptions = { alpha: 1, tint: NO_TINT, flash: 0 };

    constructor(private readonly assets: GameAssets) {}

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
            const x = floor.x0 + (i % floor.sizeX) + 0.5;
            const y = floor.y0 + Math.floor(i / floor.sizeX) + 0.5;
            const ground = sim.grid.getHeight(x, y) / 128;
            options.alpha = 1;
            options.tint = NO_TINT;
            options.flash = 0;
            const dropAt = floor.dropAt[i];
            const restoreAt = floor.restoreAt[i];
            // Coming back up out of the dark
            if (restoreAt !== -1 && tick >= restoreAt) {
                const t = smooth((now - restoreAt) / restoreTicks);
                options.alpha = Math.min(1, t * 2);
                actors.draw(slab, rising, 0, x, ground + (1 - t) * RESTORE_DEPTH, y, 0, options);
                continue;
            }
            // Gone: tumbling down into the dark for a moment, then nothing
            if (dropAt !== -1 && tick >= dropAt) {
                const since = now - dropAt;
                if (since < fallTicks) {
                    const t = since / fallTicks;
                    options.alpha = t < FADE_FROM ? 1 : 1 - (t - FADE_FROM) / (1 - FADE_FROM);
                    const frame = falling.getFrame(tick - dropAt, false);
                    const depth = t * t * FALL_DEPTH;
                    actors.draw(tumble, falling, frame, x, ground + depth, y, 0, options);
                }
                continue;
            }
            const phase = this.phase(i);
            // About to fall: shaking and sagging, darker as it goes
            const dropWarnAt = floor.dropWarnAt[i];
            if (dropWarnAt !== -1 && tick >= dropWarnAt) {
                const t = Math.min(1, (now - dropWarnAt) / Math.max(1, dropAt - dropWarnAt));
                const shake = SAG_SHAKE * (0.4 + 0.6 * t);
                const wobble = Math.sin((seconds * SHAKE_RATE + phase) * Math.PI * 2);
                const turn = Math.sin((seconds * SHAKE_RATE * 0.8 + phase * 2) * Math.PI * 2);
                options.tint = this.darken(t);
                actors.draw(
                    slab,
                    rising,
                    0,
                    x,
                    ground + t * t * SAG_DEPTH + Math.abs(wobble) * SHAKE_HEIGHT * shake,
                    y,
                    turn * SHAKE_TURN * shake,
                    options,
                );
                continue;
            }
            // Coming up: the slab's own animation, tipped the way it's travelling
            const roseAt = floor.roseAt[i];
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                const frame = rising.getFrame(tick - roseAt, false);
                options.flash = RISE_LIGHT * (1 - (now - roseAt) / RISE_TICKS);
                actors.draw(slab, rising, frame, x, ground, y, TIP_YAW[floor.riseDir[i]], options);
                continue;
            }
            // About to come up: shaking, harder as it comes
            const warnAt = floor.warnAt[i];
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
