import {
    ActorAnim,
    ActorDrawOptions,
    ActorModel,
    ActorRenderer,
    NO_TINT,
} from "../../mapviewer/webgl/actor/ActorRenderer";
import type { FloorCue, FloorMaterialFxDef, FloorSkinDef } from "../content/types";
import {
    ArenaFloor,
    FLOOR_EAST,
    FLOOR_NORTH,
    FLOOR_SOUTH,
    FLOOR_WEST,
    FRAGILE_HITS,
} from "../core/ArenaFloor";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { RAMP_NONE, TYPE_FRAGILE, TYPE_PILLAR } from "../core/floorLayout";
import {
    DEFAULT_FLOOR_SKIN,
    GameAssets,
    getFloorLidKey,
    getFloorPieceKey,
    getFloorSkinKey,
} from "./GameAssets";

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
// Rebuilding by itself (FloorDef.rebuild): through its warning it comes up out of the dark from
// FALL_DEPTH to REBUILD_WAIT tiles down, lit from under, turning back over as it fell; then up
// into place
const REBUILD_WAIT = 1.2;
// A pressure plate (FloorDef.triggers): pressed, it sinks this far; ready, its light's this
// colour unless its skin has one, this strong; resting or disarmed, this strong
const PLATE_SINK = 0.035;
const PLATE_LIGHT = 0xffd070;
const PLATE_READY = 0.6;
const PLATE_RESTING = 0.12;
// A fragile tile that's risen (FloorSkinDef.stages when it has none): darker each time, by
// this, sunk this far and askew this much more (RS angle units)
const CRACK_DARKEN = 0.2;
const CRACK_SINK = 0.02;
const CRACK_TILT = 22;
// A raised tile's sides (FloorTileRuleDef.height): the tile again under itself down to the floor,
// a slab's thickness at a time, from this shade to this
const PLINTH_TOP = 0xd8d8d8;
const PLINTH_BOTTOM = 0x8c8c8c;
// A glowing skin's pulse (FloorSkinDef.pulse), times a second; and an idle effect's share of its
// tiles (FloorSkinDef.idle)
const PULSE_RATE = 0.35;
const IDLE_SHARE = 4;
// A sunken tile's darker, this much a tile down, and at most this much
const SUNKEN_SHADE = 0.7;
const SUNKEN_MOST = 0.45;
// Above this, a raised tile hides what's behind it as the world does (ActorDrawOptions.early)
const RAISED_HIDES = 0.2;
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
// caught their sides: every tile a pattern will raise or drop has it from the moment the pattern
// starts (ArenaFloor.cueAt), so its whole shape, and the safe tiles left out of it, show at once,
// however far off its last rows are. It's low until the tile's own warning, and the tile's a
// shade darker; through the warning it builds to full, as the light under it does. A tile no
// pattern will touch has none and doesn't move. How much of it there is is the pattern's cue
// (FloorCue, ArenaFloor.cueBold):
// - early, earlyWidth: the low light, how strong and how far in (of the way to the middle), as
//   the tile's own warning starts
// - horizon: if set, the low light builds over this many seconds before the tile's own warning
//   (easing in, the square of how near it is), from faint, and its tremor with it from
//   faintTremor; so a wave's tiles fade from its front, where they're about to go, out to the
//   last to go, and a ripple's out from its middle. If not, it's early all along.
// - breath: how much it breathes, slowly, the whole floor together
// - tint: how dark a marked tile is, by its warning
// - tremor: how hard a marked tile trembles by its own warning (of the warning's hardest)
// - full, fullWidth: the light as the tile goes, and while its slab's up
type CueStyle = {
    early: number;
    earlyWidth: number;
    horizon: number;
    faint: number;
    faintTremor: number;
    breath: number;
    tint: number;
    tremor: number;
    full: number;
    fullWidth: number;
};
const CUE_STYLES: Record<FloorCue, CueStyle> = {
    // The floor still reads as stone, straining where it's about to go: a thin warm line in a
    // marked tile's seams and a slight rattle, faint far off and stronger as its moment nears, and
    // in its last second the seams light up, as the light under it shows through them
    subtle: {
        early: 0.4,
        earlyWidth: 0.1,
        horizon: 2,
        faint: 0.08,
        faintTremor: 0.06,
        breath: 0,
        tint: 0xd8d8d8,
        tremor: 0.3,
        full: 0.9,
        fullWidth: 0.24,
    },
    // The whole shape lit gold, bleeding in over the tiles and breathing, then wide and bright
    bold: {
        early: 0.5,
        earlyWidth: 0.3,
        horizon: 0,
        faint: 0.5,
        faintTremor: 0,
        breath: 0.2,
        tint: 0xc0c0c0,
        tremor: 0,
        full: 1,
        fullWidth: 0.6,
    },
};
// The low light comes up over CUE_FADE seconds as the pattern starts, and breathes CUE_RATE times
// a second
const CUE_FADE = 0.2;
const CUE_RATE = 1.5;
// Dev only: ?floorcue=bold or ?floorcue=subtle shows every pattern that way, to compare
const CUE_OVERRIDE = cueOverride();
// Dev only: window.floorWholeTiles = true draws every tile whole, to measure what drawing tiles at
// rest as their tops saves
function wholeTiles(): boolean {
    return (
        !!import.meta.env?.DEV &&
        typeof window !== "undefined" &&
        (window as { floorWholeTiles?: boolean }).floorWholeTiles === true
    );
}

function cueOverride(): FloorCue | undefined {
    if (!import.meta.env?.DEV || typeof window === "undefined") {
        return undefined;
    }
    const cue = new URLSearchParams(window.location.search).get("floorcue");
    return cue === "bold" || cue === "subtle" ? cue : undefined;
}
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

const STILL = { lift: 0, turn: 0 };
const NO_CUE: NonNullable<FloorSkinDef["cue"]> = {};

// A floor with no skins of its own: the slam's slab, rising with its own animation and tumbling
// away as the drop's
const DEFAULT_SKIN: FloorSkinDef = { rise: "anim", fall: "tumble" };
// A tile coming up in code (FloorSkinDef.rise "code"): up RISE_LIFT tiles over the first RISE_UP
// of its rise, held to RISE_HOLD, and settled back; its leading edge tipped up RISE_TIP (RS angle
// units) at the top
const RISE_LIFT = 0.45;
const RISE_UP = 0.15;
const RISE_HOLD = 0.7;
const RISE_TIP = 110;
// A tile falling in code turns over this far (RS angle units) as it goes
const FALL_TURN = 700;
// A decal's lifted this far (tiles) over the skin under it (FloorSkinDef.under)
const DECAL_LIFT = 0.012;
// A glyph's steady light at rest (FloorSkinDef.light): how strong, and how far in
const GLYPH_LIGHT = 0.55;
const GLYPH_WIDTH = 0.35;
// The way each of ArenaFloor's FLOOR_NORTH and on goes, along x and z
const DIRECTIONS: [number, number][] = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
];

// Two tints together
function mulTint(a: number, b: number): number {
    if (b === NO_TINT) {
        return a;
    }
    const c = (shift: number) =>
        Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255) << shift;
    return c(16) | c(8) | c(0);
}

function smooth(t: number): number {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
}

// The fraction of a number
function frac(v: number): number {
    return v - Math.floor(v);
}

type Effect = { model: ActorModel; anim: ActorAnim };

const RAMP_DIRECTIONS = [FLOOR_NORTH, FLOOR_EAST, FLOOR_SOUTH, FLOOR_WEST];

export class FloorView {
    private readonly options: ActorDrawOptions = {
        alpha: 1,
        tint: NO_TINT,
        scale: 1,
        flash: 0,
        edge: 0,
        edgeWidth: 0,
        edgeColor: NO_TINT,
        stretchX: 1,
        stretchZ: 1,
        pitch: 0,
        roll: 0,
        early: false,
    };
    // The tile, or slab, being drawn: its size, tint, model at rest and turn
    private tile!: {
        w: number;
        h: number;
        tint: number;
        model: ActorModel;
        anim: ActorAnim;
        turn: number;
        // A skin drawn under it (FloorSkinDef.under), and how far it's stretched
        under?: ActorModel;
        underW: number;
        underH: number;
        // A glow all over it (FloorSkinDef.glow), how it's tipped at rest (a ramp, a cracked tile),
        // and whether it hides what's behind it (a pillar, a raised tile)
        glow: number;
        pitch: number;
        roll: number;
        early: boolean;
        // Its index in the floor's arrays
        index: number;
    };
    // The floor being drawn
    private drawing!: ArenaFloor;
    // How the cues look on the skin being drawn (FloorSkinDef.cue)
    private tileCue: NonNullable<FloorSkinDef["cue"]> = {};
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
        const rebuildWarn = floor.rebuildWarnTicks;
        const options = this.options;
        const glow = def.glow;
        // The low light's slow breath, the whole floor's together
        const breath = Math.sin(seconds * CUE_RATE * Math.PI * 2);
        const layout = floor.layout;
        // Each skin's model (FloorDef.skins), or the slam's own slab; and its top alone, for a
        // tile at rest among others
        const skinDefs = def.skins ?? [DEFAULT_SKIN];
        const models = def.skins
            ? def.skins.map((skin) => this.assets.get(getFloorSkinKey(skin)) ?? slab)
            : [slab];
        const lids = (def.skins ?? [DEFAULT_FLOOR_SKIN(def)]).map((skin) =>
            this.assets.get(getFloorLidKey(skin)),
        );
        const fragileHits = def.drop.fragile?.hits ?? FRAGILE_HITS;
        this.drawing = floor;
        const whole = wholeTiles();
        for (let i = 0; i < floor.riseAt.length; i++) {
            // What isn't floor is the pit's; a slab's drawn from its south-west tile, as one
            if (!layout.mask[i] || layout.anchor[i] !== i) {
                continue;
            }
            const col = i % floor.sizeX;
            const row = Math.floor(i / floor.sizeX);
            const w = layout.slabX[i];
            const h = layout.slabY[i];
            const x = floor.x0 + col + w / 2;
            const y = floor.y0 + row + h / 2;
            // A fragile tile that's risen shows it (FloorSkinDef.stages), if it has stages
            const hits = layout.type[i] === TYPE_FRAGILE ? Math.min(floor.hits[i], fragileHits) : 0;
            let skinIndex = layout.skin[i];
            const stages = skinDefs[skinIndex]?.stages;
            if (hits > 0 && stages && stages.length > 0) {
                skinIndex = stages[Math.min(hits, stages.length) - 1];
            }
            const skin = skinDefs[skinIndex] ?? DEFAULT_SKIN;
            const model = models[skinIndex] ?? slab;
            const rest = model.anims[0];
            const ramp = layout.ramp[i];
            const turn = ramp === RAMP_NONE ? layout.turn[i] * 512 : 0;
            // Raised, sunken, or partway up a ramp (FloorTileRuleDef.height, ramp)
            const lift = floor.liftAt(x, y);
            const base = sim.grid.getHeight(x, y) / 128;
            const ground = base - (skin.height ?? 0) - lift;
            const phase = this.phase(i);
            // Which share of the tiles this one's in, for effects only some of them have
            const share = col + 2 * row;
            const style = this.style(floor, i);
            // Its own rise, or one in code (FloorSkinDef.rise); the slam's tumble as it falls, or
            // one in code
            const animated =
                (skin.rise ?? (skin.spotAnim !== undefined ? "anim" : "code")) === "anim";
            const tumbles =
                w === 1 && h === 1 && (skin.fall ?? (def.skins ? "code" : "tumble")) === "tumble";
            const under = skin.under !== undefined ? models[skin.under] : undefined;
            const underSize = (skin.under !== undefined && skinDefs[skin.under]?.size) || 1;
            // Stretched over its slab, from the tiles across it's made
            const across = skin.size ?? 1;
            // Tipped up its slope, and stretched along it, on a ramp; askew as it cracks
            let pitch = 0;
            let roll = 0;
            let stretch = 1;
            if (ramp !== RAMP_NONE) {
                const rise = floor.edgeHeight(i, ramp) - floor.edgeHeight(i, (ramp + 2) & 3);
                const angle = Math.atan(rise);
                stretch = 1 / Math.cos(angle);
                const tip = (angle / (Math.PI * 2)) * 2048;
                const [mx, mz] = DIRECTIONS[RAMP_DIRECTIONS[ramp]];
                pitch = tip * mz;
                roll = -tip * mx;
            }
            let tint = skin.tint ?? NO_TINT;
            if (hits > 0 && !stages) {
                tint = mulTint(this.shade(0, CRACK_DARKEN * hits), tint);
                pitch += CRACK_TILT * hits * Math.cos(phase * Math.PI * 2);
                roll += CRACK_TILT * hits * Math.sin(phase * Math.PI * 2);
            }
            const sink = hits > 0 && !stages ? CRACK_SINK * hits : 0;
            // Sunken, in the shade of what's round it
            if (lift < 0) {
                tint = mulTint(this.shade(0, Math.min(SUNKEN_MOST, -lift * SUNKEN_SHADE)), tint);
            }
            const along = ramp === FLOOR_NORTH || ramp === FLOOR_SOUTH;
            this.tile = {
                w: (w / across) * (ramp !== RAMP_NONE && !along ? stretch : 1),
                h: (h / across) * (along ? stretch : 1),
                tint,
                model,
                anim: rest,
                turn,
                under,
                underW: w / underSize,
                underH: h / underSize,
                // A slow pulse over its glow, each tile on its own beat
                glow:
                    (skin.glow ?? 0) +
                    (skin.pulse ?? 0) *
                        (0.5 + 0.5 * Math.sin((seconds * PULSE_RATE + phase) * Math.PI * 2)),
                pitch,
                roll,
                early: layout.type[i] === TYPE_PILLAR || lift > RAISED_HIDES,
                index: i,
            };
            this.tileCue = skin.cue ?? NO_CUE;
            const material = skin.material;
            // The light on this skin, if it has its own (FloorSkinDef.cue)
            const light = skin.cue?.color ?? glow;
            this.resetTile();
            const dropAt = floor.dropAt[i];
            const restoreAt = floor.restoreAt[i];
            // Rebuilding by itself: up out of the dark, lit from under, and into place
            if (floor.rebuilt[i] && tick >= restoreAt - rebuildWarn) {
                this.drawRebuild(
                    actors,
                    slab,
                    rising,
                    x,
                    ground,
                    y,
                    now,
                    restoreAt,
                    floor.restoredAt[i],
                    rebuildWarn,
                    phase,
                    light,
                );
                continue;
            }
            // Coming back up out of the dark
            if (restoreAt !== -1 && tick >= restoreAt) {
                const t = smooth((now - restoreAt) / Math.max(1, floor.restoredAt[i] - restoreAt));
                options.alpha = Math.min(1, t * 2);
                actors.draw(model, rest, 0, x, ground + (1 - t) * RESTORE_DEPTH, y, turn, options);
                continue;
            }
            // Gone: tumbling down into the dark with its chips
            if (dropAt !== -1 && tick >= dropAt) {
                const since = now - dropAt;
                if (since < fallTicks) {
                    const t = since / fallTicks;
                    const fade = t < FADE_FROM ? 1 : 1 - (t - FADE_FROM) / (1 - FADE_FROM);
                    options.alpha = fade;
                    const depth = t * t * FALL_DEPTH;
                    if (tumbles) {
                        const frame = falling.getFrame(tick - dropAt, false);
                        actors.draw(tumble, falling, frame, x, ground + depth, y, 0, options);
                    } else {
                        // Turning over as it drops, a way of its own
                        const over = t * FALL_TURN;
                        options.pitch = pitch + over * Math.cos(phase * Math.PI * 2);
                        options.roll = roll + over * Math.sin(phase * Math.PI * 2);
                        actors.draw(model, rest, 0, x, ground + depth, y, turn, options);
                    }
                    if (rock) {
                        this.drawChips(actors, rock, x, y, ground, t, fade, phase, tick - dropAt);
                    }
                    // Its material's dust (FloorSkinDef.material), or the floor's
                    const fallFx = this.materialFx(material?.fall);
                    if (fallFx && share % FALL_DUST_SHARE === 0) {
                        this.reset();
                        this.drawOnce(
                            actors,
                            fallFx.effect,
                            x,
                            ground,
                            y,
                            tick - dropAt,
                            phase,
                            fallFx.scale * w,
                        );
                    } else if (!fallFx && fallDust && share % FALL_DUST_SHARE === 0) {
                        this.reset();
                        this.drawOnce(actors, fallDust, x, ground, y, tick - dropAt, phase, 1);
                    }
                }
                continue;
            }
            const edged = this.besideHole(floor, col, row, w, h, tick);
            // About to fall: trembling and sagging, darker as it sinks, and grit crumbling off it
            const dropWarnAt = floor.dropWarnAt[i];
            if (dropWarnAt !== -1 && tick >= dropWarnAt) {
                const t = Math.min(1, (now - dropWarnAt) / Math.max(1, dropAt - dropWarnAt));
                const tremor = this.tremor(seconds, phase, SAG_TREMOR * (0.4 + 0.6 * t), 0);
                const sag = t * t * SAG_DEPTH;
                options.tint = mulTint(this.darken(style, t), this.tile.tint);
                this.edgeLight(light, style, t);
                this.drawTile(actors, x, ground + sag + tremor.lift, y, tremor.turn, edged, lift);
                this.drawGlow(actors, slab, rising, x, ground + sag, y, t, light);
                if (rock && t > GRIT_FROM && share % GRIT_SHARE === 0) {
                    this.drawGrit(actors, rock, x, y, ground + sag, seconds, phase);
                }
                continue;
            }
            // To fall later in its pattern (a later row): marked, and still
            const cueAt = floor.cueAt[i];
            if (dropWarnAt !== -1) {
                const lift2 = this.cue(
                    light,
                    style,
                    now,
                    cueAt,
                    dropWarnAt,
                    breath,
                    seconds,
                    phase,
                );
                this.drawTile(actors, x, ground + lift2.lift, y, lift2.turn, edged, lift);
                continue;
            }
            // Coming up: the slab's own animation, tipped the way it's travelling, or lifted and
            // tipped in code; and dust
            const roseAt = floor.roseAt[i];
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                // Its light full while it's up and hurting, fading as it settles
                const up = (tick - roseAt) / RISE_TICKS;
                const lit = Math.min(1, 4 * (1 - up));
                this.edgeLight(light, style, lit);
                const dir = floor.riseDir[i];
                if (animated) {
                    const frame = rest.getFrame(tick - roseAt, false);
                    actors.draw(model, rest, frame, x, ground, y, TIP_YAW[dir], options);
                } else {
                    const up2 = this.codeRise((now - roseAt) / RISE_TICKS, dir, turn);
                    options.pitch = (options.pitch ?? 0) + pitch;
                    options.roll = (options.roll ?? 0) + roll;
                    actors.draw(model, rest, 0, x, ground - up2, y, turn, options);
                }
                this.resetTile();
                if (edged) {
                    this.drawThickness(actors, x, ground, y, turn);
                }
                this.drawPlinth(actors, floor, i, x, ground, y, turn, lift);
                this.drawGlow(actors, slab, rising, x, ground, y, lit, light);
            }
            if (roseAt !== -1) {
                // Its material's dust (FloorSkinDef.material), or the floor's on a share of them;
                // and a fragile tile's crack as it comes up nearer giving way
                const riseFx = this.materialFx(material?.rise);
                if (riseFx && share % DUST_SHARE === 0) {
                    this.reset();
                    this.drawOnce(
                        actors,
                        riseFx.effect,
                        x,
                        ground,
                        y,
                        tick - roseAt,
                        phase,
                        riseFx.scale * w,
                    );
                } else if (!riseFx && dust && share % DUST_SHARE === 0) {
                    this.reset();
                    this.drawOnce(actors, dust, x, ground, y, tick - roseAt, phase, DUST_SCALE * w);
                }
                const crackFx =
                    layout.type[i] === TYPE_FRAGILE ? this.materialFx(material?.crack) : undefined;
                if (crackFx) {
                    this.reset();
                    this.drawOnce(
                        actors,
                        crackFx.effect,
                        x,
                        ground,
                        y,
                        tick - roseAt,
                        phase,
                        crackFx.scale * w,
                    );
                }
            }
            if (roseAt !== -1 && tick - roseAt < RISE_TICKS) {
                continue;
            }
            // About to come up: trembling, harder as it comes
            const warnAt = floor.warnAt[i];
            this.resetTile();
            if (warnAt !== -1 && tick >= warnAt) {
                const t = Math.min(1, (now - warnAt) / Math.max(1, floor.riseAt[i] - warnAt));
                const strength = TREMOR_START + (1 - TREMOR_START) * t * t;
                const tremor = this.tremor(seconds, phase, strength, t * TREMOR_LIFT);
                options.tint = mulTint(style.tint, this.tile.tint);
                this.edgeLight(light, style, t);
                this.drawTile(actors, x, ground + tremor.lift, y, tremor.turn, edged, lift);
                this.drawGlow(actors, slab, rising, x, ground, y, t, light);
                continue;
            }
            // To rise later in its pattern: marked
            if (warnAt !== -1) {
                const lift2 = this.cue(light, style, now, cueAt, warnAt, breath, seconds, phase);
                this.drawTile(actors, x, ground + lift2.lift, y, lift2.turn, edged, lift);
                continue;
            }
            // At rest, a glyph's steady light in its seams (FloorSkinDef.light)
            if (skin.light !== undefined) {
                options.edge = GLYPH_LIGHT;
                options.edgeWidth = GLYPH_WIDTH;
                options.edgeColor = skin.light;
            }
            // A pressure plate: lit while it's ready, and down while it's stood on
            const trigger = layout.trigger[i];
            let pressed = 0;
            if (trigger >= 0) {
                const ready = floor.armed[trigger] === 1 && tick >= floor.readyAt[trigger];
                options.edge = ready ? PLATE_READY : PLATE_RESTING;
                options.edgeWidth = GLYPH_WIDTH;
                options.edgeColor = skin.light ?? PLATE_LIGHT;
                pressed = floor.pressed[trigger] ? PLATE_SINK : 0;
            }
            // Among others at rest, none of its sides show: its top alone
            const lid = lids[skinIndex];
            if (
                lid &&
                !whole &&
                !edged &&
                trigger < 0 &&
                skin.light === undefined &&
                !under &&
                sink === 0 &&
                ramp === RAMP_NONE &&
                w === 1 &&
                h === 1 &&
                this.amongStill(floor, col, row, tick, lift)
            ) {
                actors.draw(lid, lid.anims[0], 0, x, ground, y, turn, options);
            } else {
                this.drawTile(actors, x, ground + pressed + sink, y, 0, edged, lift);
            }
            // Now and then, on some of them, its idle effect (lava's embers)
            const idle = skin.idle;
            const idleFx =
                idle && share % (idle.share ?? IDLE_SHARE) === 0 && this.effect(idle.spotAnim);
            if (idle && idleFx) {
                const every = Math.max(1, Math.round(idle.every * TICKS_PER_SECOND));
                this.reset();
                const since = Math.floor(now + phase * every) % every;
                this.drawOnce(actors, idleFx, x, ground, y, since, phase, idle.scale ?? 1);
            }
        }
        this.drawUnder(actors, sim, floor, slab, rising, tick);
    }

    // A material's effect (FloorMaterialDef), if it has one that's loaded
    private materialFx(
        fx: FloorMaterialFxDef | undefined,
    ): { effect: Effect; scale: number } | undefined {
        const effect = this.effect(fx?.spotAnim);
        return effect && { effect, scale: fx?.scale ?? 1 };
    }

    // Whether a tile's four neighbours are floor at rest at its height: nothing round it will show
    // its sides
    private amongStill(
        floor: ArenaFloor,
        col: number,
        row: number,
        tick: number,
        lift: number,
    ): boolean {
        const { layout } = floor;
        for (const [dx, dy] of NEIGHBOURS) {
            const j = floor.index(floor.x0 + col + dx, floor.y0 + row + dy);
            if (
                j < 0 ||
                !layout.mask[j] ||
                floor.warnAt[j] !== -1 ||
                floor.dropWarnAt[j] !== -1 ||
                floor.cueAt[j] !== -1 ||
                floor.restoreAt[j] !== -1 ||
                (floor.roseAt[j] !== -1 && tick - floor.roseAt[j] < RISE_TICKS) ||
                layout.trigger[j] >= 0 ||
                layout.ramp[j] !== RAMP_NONE ||
                layout.type[j] === TYPE_PILLAR ||
                Math.abs(layout.height[j] - lift) > 0.01 ||
                (layout.type[j] === TYPE_FRAGILE && floor.hits[j] > 0)
            ) {
                return false;
            }
        }
        return true;
    }

    // A tile rebuilding by itself (FloorDef.rebuild): through its warning, coming up out of the
    // dark, turning back over the way it fell, lit from under; then up into place
    private drawRebuild(
        actors: ActorRenderer,
        slab: ActorModel,
        anim: ActorAnim,
        x: number,
        ground: number,
        y: number,
        now: number,
        restoreAt: number,
        restoredAt: number,
        warnTicks: number,
        phase: number,
        light: number | undefined,
    ): void {
        const { model, turn } = this.tile;
        const options = this.options;
        let depth: number;
        let over: number;
        if (now < restoreAt) {
            const t = smooth(1 - (restoreAt - now) / Math.max(1, warnTicks));
            depth = FALL_DEPTH + (REBUILD_WAIT - FALL_DEPTH) * t;
            over = FALL_TURN * (1 - t * 0.6);
            options.alpha = Math.min(1, t * 1.5);
        } else {
            const t = smooth((now - restoreAt) / Math.max(1, restoredAt - restoreAt));
            depth = REBUILD_WAIT * (1 - t);
            over = FALL_TURN * 0.4 * (1 - t);
        }
        options.pitch = this.tile.pitch + over * Math.cos(phase * Math.PI * 2);
        options.roll = this.tile.roll + over * Math.sin(phase * Math.PI * 2);
        actors.draw(model, model.anims[0], 0, x, ground + depth, y, turn, options);
        // The light it comes up on, brighter as it nears
        const t = Math.min(
            1,
            Math.max(0, 1 - (restoredAt - now) / (warnTicks + restoredAt - restoreAt)),
        );
        this.resetTile();
        this.drawGlow(actors, slab, anim, x, ground + depth, y, t, light);
    }

    // A tile's sides, down to the lowest of what's beside it, where that's lower (a raised tile's,
    // or one beside a sunken one: FloorTileRuleDef.height); off the floor counts as its level
    private drawPlinth(
        actors: ActorRenderer,
        floor: ArenaFloor,
        i: number,
        x: number,
        top: number,
        y: number,
        yaw: number,
        lift: number,
    ): void {
        const { layout } = floor;
        if (layout.ramp[i] !== RAMP_NONE || !floor.hasLevels) {
            return;
        }
        const col = i % floor.sizeX;
        const row = Math.floor(i / floor.sizeX);
        let lowest = lift;
        for (const [dx, dy] of NEIGHBOURS) {
            const j = floor.index(floor.x0 + col + dx, floor.y0 + row + dy);
            lowest = Math.min(lowest, j >= 0 && layout.mask[j] ? layout.height[j] : 0);
        }
        const depth = lift - lowest;
        if (depth <= 0.01) {
            return;
        }
        const model = this.tile.under ?? this.tile.model;
        const anim = model.anims[0];
        const { tint, edge } = this.options;
        this.options.edge = 0;
        const steps = Math.ceil(depth / SLAB_THICKNESS);
        for (let k = 1; k <= steps; k++) {
            const t = k / steps;
            const c = Math.round(
                (PLINTH_TOP & 0xff) + ((PLINTH_BOTTOM & 0xff) - (PLINTH_TOP & 0xff)) * t,
            );
            this.options.tint = mulTint((c << 16) | (c << 8) | c, this.tile.tint);
            actors.draw(
                model,
                anim,
                0,
                x,
                top + Math.min(depth, SLAB_THICKNESS * k),
                y,
                yaw,
                this.options,
            );
        }
        this.options.tint = tint;
        this.options.edge = edge;
    }

    // How a tile's marked: its pattern's cue, unless the dev override says otherwise
    private style(floor: ArenaFloor, i: number): CueStyle {
        return CUE_STYLES[CUE_OVERRIDE ?? (floor.cueBold[i] ? "bold" : "subtle")];
    }

    // The low light on a tile marked by a pattern that's started, before its own warning (from
    // warnAt), and how it trembles (breath from -1 to 1)
    private cue(
        glow: number | undefined,
        style: CueStyle,
        now: number,
        cueAt: number,
        warnAt: number,
        breath: number,
        seconds: number,
        phase: number,
    ): { lift: number; turn: number } {
        if (glow === undefined || cueAt === -1) {
            return STILL;
        }
        const k = smooth((now - cueAt) / (CUE_FADE * TICKS_PER_SECOND));
        // How near its warning is, eased in, over the style's horizon
        let near = 1;
        if (style.horizon > 0) {
            const ahead = Math.min(
                1,
                Math.max(0, (warnAt - now) / (style.horizon * TICKS_PER_SECOND)),
            );
            near = (1 - ahead) * (1 - ahead);
        }
        const options = this.options;
        const edge = style.faint + (style.early - style.faint) * near;
        const { strength = 1, width = 1, tremor: shake = 1 } = this.tileCue;
        options.edge = Math.min(1, edge * k * (1 + style.breath * breath) * strength);
        options.edgeWidth = style.earlyWidth * width;
        options.edgeColor = glow;
        options.tint = mulTint(
            this.shade(style.tint, k * (style.horizon > 0 ? 0.35 + 0.65 * near : 1)),
            this.tile.tint,
        );
        const tremor = (style.faintTremor + (style.tremor - style.faintTremor) * near) * shake;
        return tremor > 0 ? this.tremor(seconds, phase, tremor * k, 0) : STILL;
    }

    // The light on a tile's edges through its warning (t from 0 to 1 as it goes), or while it's up
    private edgeLight(glow: number | undefined, style: CueStyle, t: number): void {
        if (glow === undefined) {
            return;
        }
        const options = this.options;
        const k = t * t;
        const { strength = 1, width = 1 } = this.tileCue;
        options.edge = Math.min(1, (style.early + (style.full - style.early) * k) * strength);
        options.edgeWidth = (style.earlyWidth + (style.fullWidth - style.earlyWidth) * k) * width;
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
        // colour. Not under a shaped floor: seen past its edge, it's a flat plane in the pit.
        if (!floor.layout.mask.every((m) => m === 1)) {
            this.reset();
            return;
        }
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
            // A hole, not where there was never floor: the structure shows through holes only
            gone[i] = floor.layout.mask[i] && floor.isGone(i, tick) ? 1 : 0;
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
                    // Only well under the floor: where there's never been any is a clean pit,
                    // and nothing's seen from it
                    near[x + y * sizeX] = this.inland(floor, x, y) ? 1 : 0;
                }
            }
        }
        return near;
    }

    // Whether a tile and all eight round it are floor (the box's edge counts as floor)
    private inland(floor: ArenaFloor, x: number, y: number): boolean {
        const { sizeX, sizeY, layout } = floor;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const tx = x + dx;
                const ty = y + dy;
                if (
                    tx >= 0 &&
                    ty >= 0 &&
                    tx < sizeX &&
                    ty < sizeY &&
                    !layout.mask[tx + ty * sizeX]
                ) {
                    return false;
                }
            }
        }
        return true;
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

    private reset(stretchX = 1, stretchZ = 1): void {
        this.options.alpha = 1;
        this.options.tint = NO_TINT;
        this.options.scale = 1;
        this.options.flash = 0;
        this.options.edge = 0;
        this.options.stretchX = stretchX;
        this.options.stretchZ = stretchZ;
        this.options.pitch = 0;
        this.options.roll = 0;
        this.options.early = false;
    }

    // As reset, for the tile or slab being drawn: its size and tint
    private resetTile(): void {
        this.reset(this.tile.w, this.tile.h);
        this.options.tint = this.tile.tint;
        this.options.flash = -this.tile.glow;
        this.options.pitch = this.tile.pitch;
        this.options.roll = this.tile.roll;
        this.options.early = this.tile.early;
    }

    // A tile coming up in code (FloorSkinDef.rise "code"), u from 0 to 1 as it does: how far
    // it's up, in tiles, with it tipped the way the wave's going (dir, ArenaFloor's FLOOR_NORTH
    // and on) however it's turned
    private codeRise(u: number, dir: number, turn: number): number {
        const up =
            u < RISE_UP ? smooth(u / RISE_UP) : 1 - smooth((u - RISE_HOLD) / (1 - RISE_HOLD));
        const lift = RISE_LIFT * Math.max(0, Math.min(1, up));
        // The way it's going, in the world, then in the model before it's turned
        const [wx, wz] = DIRECTIONS[dir];
        const a = (turn / 2048) * Math.PI * 2;
        const mx = wx * Math.cos(a) - wz * Math.sin(a);
        const mz = wx * Math.sin(a) + wz * Math.cos(a);
        const tip = (RISE_TIP * lift) / RISE_LIFT;
        this.options.pitch = tip * mz;
        this.options.roll = -tip * mx;
        return lift;
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

    // The tile or slab being drawn, at rest or moving (yaw on top of its turn), with its thickness
    // under it if it's beside a hole
    private drawTile(
        actors: ActorRenderer,
        x: number,
        height: number,
        y: number,
        yaw: number,
        edged: boolean,
        lift = 0,
    ): void {
        const { model, anim, turn, under } = this.tile;
        // A decal over its skin is lifted off it, so they don't fight
        if (under) {
            const options = this.options;
            const { stretchX, stretchZ } = options;
            options.stretchX = this.tile.underW;
            options.stretchZ = this.tile.underH;
            actors.draw(under, under.anims[0], 0, x, height, y, turn + yaw, options);
            options.stretchX = stretchX;
            options.stretchZ = stretchZ;
        }
        const decal = under ? DECAL_LIFT : 0;
        actors.draw(model, anim, 0, x, height - decal, y, turn + yaw, this.options);
        if (edged) {
            this.drawThickness(actors, x, height, y, turn + yaw);
        }
        this.drawPlinth(actors, this.drawing, this.tile.index, x, height, y, turn + yaw, lift);
    }

    // The tile again under itself, a slab's thickness at a time, darker each, so a hole's edge
    // shows the floor's cut edge going down into the dark
    private drawThickness(
        actors: ActorRenderer,
        x: number,
        height: number,
        y: number,
        yaw: number,
    ): void {
        const model = this.tile.under ?? this.tile.model;
        const anim = model.anims[0];
        const { tint, edge } = this.options;
        this.options.edge = 0;
        EDGE_TINTS.forEach((edgeTint, k) => {
            this.options.tint = mulTint(edgeTint, this.tile.tint);
            actors.draw(model, anim, 0, x, height + SLAB_THICKNESS * (k + 1), y, yaw, this.options);
        });
        this.options.tint = tint;
        this.options.edge = edge;
    }

    // Whether a tile or slab's beside one that's fallen (and not back), or no floor, along a side
    private besideHole(
        floor: ArenaFloor,
        col: number,
        row: number,
        w: number,
        h: number,
        tick: number,
    ): boolean {
        for (let dy = -1; dy <= h; dy++) {
            for (let dx = -1; dx <= w; dx++) {
                const side = (dx === -1 || dx === w) !== (dy === -1 || dy === h);
                if (!side) {
                    continue;
                }
                const beside = floor.index(floor.x0 + col + dx, floor.y0 + row + dy);
                if (beside >= 0 && floor.isGone(beside, tick)) {
                    return true;
                }
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
    private darken(style: CueStyle, t: number): number {
        return this.shade(SAG_TINT, t, style.tint);
    }

    // A grey (by its blue) t of the way to another, from white
    private shade(grey: number, t: number, from = NO_TINT): number {
        const a = (from & 0xff) / 255;
        const k = a + t * ((grey & 0xff) / 255 - a);
        const c = Math.round(255 * k);
        return (c << 16) | (c << 8) | c;
    }
}
