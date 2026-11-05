import {
    ActorAnim,
    ActorDrawOptions,
    ActorModel,
    ActorRenderer,
    NO_TINT,
} from "../../mapviewer/webgl/actor/ActorRenderer";
import { ArenaFloor, RESTORE_SECONDS } from "../core/ArenaFloor";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { GameAssets, getFloorPieceKey } from "./GameAssets";

// The floor a map draws itself (MapDef.floor, core/ArenaFloor.ts): every tile is the rising slab's
// model at rest, so each can move on its own, and the map leaves the floor under it hidden (a
// bridge over an empty pit, scaperune/maps/wardensFloor.ts), so a tile that's fallen opens onto
// what's drawn here under the floor. The warnings are the tiles' own movement and the floor's
// light: from the moment a pattern starts, every tile it'll raise or drop has a low light along
// its edges, so its whole shape shows at once, and the tiles left out of it are the safe ones;
// then a tile about to rise trembles, harder as it comes, rattling up off its bed and twisting as
// the slab does when it goes (the cache has the slab's rise, seqs 9697 to 9700, but no tremor of
// its own), and the floor's gold light under it shows through the seams that opens, brighter and
// wider as the moment nears; one about to fall trembles the same way and sags, darkening as it
// sinks, grit crumbling off it. A rising tile is the slab's own animation, tipped the way its wave
// travels, over its light at full, throwing up dust; a falling one tumbles away with chips of
// rock and a puff of dust. Under the floor is one structure on a grid (FloorDef.under): pillars,
// beams, the wall down the edge and a dim glow far below, so every hole looks into the same place;
// and wherever a tile's beside a hole, its thickness shows.
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
const EDGE_TINTS = [0xffffff, 0xb0b0b0, 0x686868, 0x303030];
const NEIGHBOURS: [dx: number, dy: number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

// The light under a tile that's about to rise or fall (FloorDef.glow): the slab again just under
// it, glowing in the floor's light, so it shows only through the seams the tremor opens. It's
// faint as the warning starts and full when the tile goes, and a little wider than the tile, so
// it shows round all four sides and no further. A rising slab has it full under it while it's up:
// the moment it hurts.
const GLOW_DEPTH = 0.05;
const GLOW_FROM = 0.35;
const GLOW_SPREAD = 0.14;
// The same light on the tiles themselves, along their edges (ActorDrawOptions.edge), as if it
// caught their sides and bled up over them: every tile a pattern will raise or drop has it from
// the moment the pattern starts (ArenaFloor.cueAt), so its whole shape, and the safe tiles left
// out of it, show at once, however far off its last rows are. It's low and narrow until the
// tile's own warning, breathing slowly with the floor, and the tile's a little darker; through
// the warning it builds to full and wide, as the light under it does. A tile no pattern will
// touch has none and doesn't move.
// Low: how strong and how far in (of the way to the middle), coming up over CUE_FADE seconds as
// the pattern starts, breathing by CUE_BREATH at CUE_RATE times a second
const CUE_EDGE = 0.5;
const CUE_WIDTH = 0.3;
const CUE_FADE = 0.2;
const CUE_BREATH = 0.2;
const CUE_RATE = 1.5;
const CUE_TINT = 0xc0c0c0;
// Full, as it goes
const EDGE_FULL = 1;
const EDGE_WIDTH = 0.6;
// What's under the floor (FloorDef.under), on a grid symmetric about the floor's middle: pillars
// every PILLAR_EVERY tiles both ways, with beams between them along those rows and columns, and
// the wall going down all round. Only what could show through a hole is drawn: what's within
// UNDER_REACH tiles of one.
const PILLAR_EVERY = 6;
const UNDER_REACH = 2;
// How much of each level down is lit, as it falls away into the dark: the beams and the wall's
// top, the pillars and the wall's next piece down, and the glow at the bottom
const UNDER_TINTS = [0x9a9a9a, 0x5c5c5c];
const PILLAR_TINT = 0x7a7a7a;
// The glow far below: slabs SKY_SCALE tiles a side, only ever under the floor, this far down, in
// this dim amber (the floor's light, deep down), this strongly
const SKY_SCALE = 2;
const SKY_DEPTH = 7;
const SKY_TINT = 0x5a3810;
const SKY_LIGHT = 0.3;

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
    private readonly options: ActorDrawOptions = {
        alpha: 1,
        tint: NO_TINT,
        scale: 1,
        flash: 0,
        edge: 0,
        edgeWidth: 0,
        edgeColor: NO_TINT,
    };
    private goneMask?: Uint8Array;
    private nearMask?: Uint8Array;

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
        const glow = def.glow;
        // The low light's slow breath, the whole floor's together
        const breath = 1 + CUE_BREATH * Math.sin(seconds * CUE_RATE * Math.PI * 2);
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
                this.edgeLight(glow, t);
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
                this.drawGlow(actors, slab, rising, x, ground + sag, y, t, glow);
                if (rock && t > GRIT_FROM && share % GRIT_SHARE === 0) {
                    this.drawGrit(actors, rock, x, y, ground + sag, seconds, phase);
                }
                continue;
            }
            // To fall later in its pattern (a later row): marked, and still
            const cueAt = floor.cueAt[i];
            if (dropWarnAt !== -1) {
                this.cue(glow, now, cueAt, breath);
                this.drawTile(actors, slab, rising, x, ground, y, 0, edged);
                continue;
            }
            // Coming up: the slab's own animation, tipped the way it's travelling, and dust
            const roseAt = floor.roseAt[i];
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                const frame = rising.getFrame(tick - roseAt, false);
                // Its light full while it's up and hurting, fading as it settles
                const up = (tick - roseAt) / RISE_TICKS;
                const lit = Math.min(1, 4 * (1 - up));
                this.edgeLight(glow, lit);
                actors.draw(slab, rising, frame, x, ground, y, TIP_YAW[floor.riseDir[i]], options);
                this.reset();
                if (edged) {
                    this.drawThickness(actors, slab, rising, x, ground, y, 0);
                }
                this.drawGlow(actors, slab, rising, x, ground, y, lit, glow);
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
                options.tint = CUE_TINT;
                this.edgeLight(glow, t);
                this.drawTile(actors, slab, rising, x, ground + tremor.lift, y, tremor.turn, edged);
                this.drawGlow(actors, slab, rising, x, ground, y, t, glow);
                continue;
            }
            // To rise later in its pattern: marked, and still
            if (warnAt !== -1) {
                this.cue(glow, now, cueAt, breath);
            }
            this.drawTile(actors, slab, rising, x, ground, y, 0, edged);
        }
        this.drawUnder(actors, sim, floor, slab, rising, tick);
    }

    // The low light on a tile marked by a pattern that's started, before its own warning
    private cue(glow: number | undefined, now: number, cueAt: number, breath: number): void {
        if (glow === undefined || cueAt === -1) {
            return;
        }
        const k = smooth((now - cueAt) / (CUE_FADE * TICKS_PER_SECOND));
        const options = this.options;
        options.edge = CUE_EDGE * k * breath;
        options.edgeWidth = CUE_WIDTH;
        options.edgeColor = glow;
        options.tint = this.shade(CUE_TINT, k);
    }

    // The light on a tile's edges through its warning (t from 0 to 1 as it goes), or while it's up
    private edgeLight(glow: number | undefined, t: number): void {
        if (glow === undefined) {
            return;
        }
        const options = this.options;
        const k = t * t;
        options.edge = CUE_EDGE + (EDGE_FULL - CUE_EDGE) * k;
        options.edgeWidth = CUE_WIDTH + (EDGE_WIDTH - CUE_WIDTH) * k;
        options.edgeColor = glow;
    }

    // The light under a tile about to go, t from 0 as the warning starts to 1 as it goes
    private drawGlow(
        actors: ActorRenderer,
        slab: ActorModel,
        anim: ActorAnim,
        x: number,
        height: number,
        y: number,
        t: number,
        glow: number | undefined,
    ): void {
        if (glow === undefined || t <= 0) {
            return;
        }
        const options = this.options;
        const { tint, scale, edge } = options;
        options.edge = 0;
        options.tint = glow;
        options.flash = -(GLOW_FROM + (1 - GLOW_FROM) * t);
        options.scale = 1 + GLOW_SPREAD * t;
        actors.draw(slab, anim, 0, x, height + GLOW_DEPTH, y, 0, options);
        options.tint = tint;
        options.scale = scale;
        options.flash = 0;
        options.edge = edge;
    }

    // What's under the floor, where a hole could show it: the same grid of pillars and beams
    // everywhere, the wall going down round the edge, and the glow far below, so every hole,
    // whatever its size, looks into the same place
    private drawUnder(
        actors: ActorRenderer,
        sim: Sim,
        floor: ArenaFloor,
        slab: ActorModel,
        slabAnim: ActorAnim,
        tick: number,
    ): void {
        const under = floor.def.under;
        const { sizeX, sizeY } = floor;
        const near = this.near(floor, tick);
        if (!near) {
            return;
        }
        const pillar = under && this.assets.get(getFloorPieceKey(under.pillar));
        const beam = under && this.assets.get(getFloorPieceKey(under.beam));
        const wall = under && this.assets.get(getFloorPieceKey(under.wall));
        const options = this.options;
        // The grid's lines, symmetric about the middle
        const midX = Math.floor(sizeX / 2);
        const midY = Math.floor(sizeY / 2);
        const onLine = (v: number, mid: number) =>
            (((v - mid) % PILLAR_EVERY) + PILLAR_EVERY) % PILLAR_EVERY === PILLAR_EVERY / 2;
        for (let i = 0; i < near.length; i++) {
            if (!near[i]) {
                continue;
            }
            const col = i % sizeX;
            const row = Math.floor(i / sizeX);
            const x = floor.x0 + col + 0.5;
            const y = floor.y0 + row + 0.5;
            const top = sim.grid.getHeight(x, y) / 128 + SLAB_THICKNESS;
            const lineX = onLine(col, midX);
            const lineY = onLine(row, midY);
            this.reset();
            if (beam) {
                const anim = beam.anims[0];
                const height = beam.height / 128;
                options.tint = UNDER_TINTS[0];
                // A wall sits on its tile's edge: these put it through the tile's middle
                if (lineX) {
                    actors.draw(beam, anim, 0, x + 0.5, top + height, y, 1024, options);
                }
                if (lineY) {
                    actors.draw(beam, anim, 0, x, top + height, y - 0.5, 1536, options);
                }
            }
            if (pillar && lineX && lineY) {
                options.tint = PILLAR_TINT;
                actors.draw(
                    pillar,
                    pillar.anims[0],
                    0,
                    x,
                    top + pillar.height / 128,
                    y,
                    0,
                    options,
                );
            }
            // The wall down the floor's edge, two pieces deep, on the sides the camera sees
            if (wall) {
                const anim = wall.anims[0];
                const height = wall.height / 128;
                for (const [rotation, edge] of [
                    [0, col === 0],
                    [1, row === sizeY - 1],
                    [2, col === sizeX - 1],
                ] as const) {
                    if (!edge) {
                        continue;
                    }
                    UNDER_TINTS.forEach((tint, k) => {
                        options.tint = tint;
                        const yaw = ((rotation + 2) & 3) * 512;
                        actors.draw(wall, anim, 0, x, top + height * (k + 1), y, yaw, options);
                    });
                }
            }
        }
        // The glow far below, in pieces, wherever there's a hole near, and never past the floor's
        // edge: an odd row or column's last piece overlaps the one before, in the same plane and
        // colour
        this.reset();
        options.tint = SKY_TINT;
        options.flash = -SKY_LIGHT;
        options.scale = SKY_SCALE;
        const half = SKY_SCALE / 2;
        const ground = sim.grid.getHeight(floor.x0 + 0.5, floor.y0 + 0.5) / 128;
        for (let sy = 0; sy < sizeY; sy += SKY_SCALE) {
            for (let sx = 0; sx < sizeX; sx += SKY_SCALE) {
                const cx = Math.min(sx + half, sizeX - half);
                const cy = Math.min(sy + half, sizeY - half);
                if (!this.nearArea(near, sizeX, sizeY, cx, cy, half)) {
                    continue;
                }
                actors.draw(
                    slab,
                    slabAnim,
                    0,
                    floor.x0 + cx,
                    ground + SKY_DEPTH,
                    floor.y0 + cy,
                    0,
                    options,
                );
            }
        }
        options.flash = 0;
        this.reset();
    }

    // Tiles within UNDER_REACH of a hole, or nothing if there's no hole
    private near(floor: ArenaFloor, tick: number): Uint8Array | undefined {
        const { sizeX, sizeY } = floor;
        let any = false;
        const gone = (this.goneMask ??= new Uint8Array(sizeX * sizeY));
        for (let i = 0; i < gone.length; i++) {
            gone[i] = floor.isGone(i, tick) ? 1 : 0;
            any ||= gone[i] === 1;
        }
        if (!any) {
            return undefined;
        }
        const near = (this.nearMask ??= new Uint8Array(sizeX * sizeY));
        near.fill(0);
        for (let i = 0; i < gone.length; i++) {
            if (!gone[i]) {
                continue;
            }
            const col = i % sizeX;
            const row = Math.floor(i / sizeX);
            for (
                let y = Math.max(0, row - UNDER_REACH);
                y <= Math.min(sizeY - 1, row + UNDER_REACH);
                y++
            ) {
                for (
                    let x = Math.max(0, col - UNDER_REACH);
                    x <= Math.min(sizeX - 1, col + UNDER_REACH);
                    x++
                ) {
                    near[x + y * sizeX] = 1;
                }
            }
        }
        return near;
    }

    // Whether any tile within reach of a point (floor tiles) is near a hole
    private nearArea(
        near: Uint8Array,
        sizeX: number,
        sizeY: number,
        cx: number,
        cy: number,
        reach: number,
    ): boolean {
        for (
            let y = Math.max(0, Math.floor(cy - reach));
            y <= Math.min(sizeY - 1, cy + reach);
            y++
        ) {
            for (
                let x = Math.max(0, Math.floor(cx - reach));
                x <= Math.min(sizeX - 1, cx + reach);
                x++
            ) {
                if (near[x + y * sizeX]) {
                    return true;
                }
            }
        }
        return false;
    }

    private reset(): void {
        this.options.alpha = 1;
        this.options.tint = NO_TINT;
        this.options.scale = 1;
        this.options.flash = 0;
        this.options.edge = 0;
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
        const { tint, edge } = this.options;
        this.options.edge = 0;
        EDGE_TINTS.forEach((edgeTint, k) => {
            this.options.tint = edgeTint;
            actors.draw(slab, anim, 0, x, height + SLAB_THICKNESS * (k + 1), y, yaw, this.options);
        });
        this.options.tint = tint;
        this.options.edge = edge;
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

    // From a marked tile's shade to a sinking one's
    private darken(t: number): number {
        return this.shade(SAG_TINT, t, CUE_TINT);
    }

    // A grey (by its blue) t of the way to another, from white
    private shade(grey: number, t: number, from = NO_TINT): number {
        const a = (from & 0xff) / 255;
        const k = a + t * ((grey & 0xff) / 255 - a);
        const c = Math.round(255 * k);
        return (c << 16) | (c << 8) | c;
    }
}
