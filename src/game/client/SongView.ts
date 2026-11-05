import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import { getEnemy } from "../content/enemies";
import { SongDef } from "../content/types";
import { Sim, yawFromVector } from "../core/Sim";
import { statueMiddle } from "../core/arena";
import { Enemy, SimEvent, SongNote, SongState } from "../core/entities";
import { SongShape } from "../core/song";
import { GameAssets, getEnemyModelKey, getStatueModelKey } from "./GameAssets";
import { Overlay, ScreenPoint } from "./Overlay";

// A song's fight in the world (BossDef.song, the Bell Choir's): the bells, the choir and her
// reflection, all drawn here and moved on the beat; each phrase's warning on the ground, filling a
// step a beat (a quarter, a half, three quarters, then the hit), so when it lands can be read from
// the mark alone with the sound off; Toll's reach round the player, and a beat ring at their feet
// while the game's muted.

// The red of what hurts (the reflection's a violet), and how much of it shows a step at a time
const HURT = "255, 70, 60";
const CANON = "190, 140, 255";
const HUM = "150, 235, 255";
// What lands flashes the water's pale cyan
const LANDED = "205, 245, 255";
const FILL_BASE = 0.06;
const FILL_STEP = 0.12;
const EDGE_ALPHA = 0.55;
// How long a part's landing flashes, in ticks
const LAND_FLASH = 6;
// The bells: how high one's lifted (tiles), how fast it's brought down, its glow humming
const LIFT = 0.7;
const DROP_TICKS = 3;
const HUM_FLASH = 0.35;
const STRIKE_FLASH = 0.7;
// The choir: how far each dips on a beat, and its glow singing
const BOB = 0.15;
const SING_FLASH = 0.45;
const SING_TINT = 0x9fefff;
// Her reflection in the water
const REFLECTION_ALPHA = 0.55;
// Toll's reach round the player, and its widening for a Grace
const REACH = "255, 255, 255";
const GRACE_MS = 600;
// The beat at their feet while muted
const FOOT_RING = 1.2;
const GROUND_STEP = 2;
// How much brighter the nave is on a downbeat (eased back over the beat)
const DOWNBEAT_LIGHT = 0.05;

function clamp01(t: number): number {
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

export class SongView {
    // While the game's sound is muted (set by GameClient each frame): a ring at the player's feet
    muted = false;
    private graceAt = -Infinity;
    private readonly a: ScreenPoint = { x: 0, y: 0, visible: false };

    constructor(private readonly assets: GameAssets) {}

    reset(): void {
        this.graceAt = -Infinity;
    }

    onEvent(event: SimEvent, now: number, focus: number): void {
        if (event.type === "songGrace" && (event.hero === undefined || event.hero === focus)) {
            this.graceAt = now;
        }
    }

    private def(sim: Sim): SongDef | undefined {
        return sim.song ? (sim.shownBoss?.def.boss?.song ?? undefined) : undefined;
    }

    private ground(sim: Sim, x: number, y: number): number {
        return sim.grid.getHeight(x, y) / 128;
    }

    // ---- In the 3D view ----

    submitActors(actors: ActorRenderer, sim: Sim, alpha: number): void {
        const song = sim.song;
        const def = this.def(sim);
        if (!song || !def) {
            return;
        }
        const shown = sim.tick - 1 + alpha;
        this.drawBells(actors, sim, song, def, shown);
        this.drawChoir(actors, sim, song, def, shown);
        this.drawReflection(actors, sim, song, def, alpha);
    }

    // The tenor, struck on each downbeat; the great bells lifted on their count, dropped as
    // they strike, humming cyan while they can be rung back
    private drawBells(
        actors: ActorRenderer,
        sim: Sim,
        song: SongState,
        def: SongDef,
        shown: number,
    ): void {
        const features = sim.map.features;
        if (def.bellLocId === undefined || !features) {
            return;
        }
        const model = this.assets.get(getStatueModelKey(def.bellLocId));
        if (!model) {
            return;
        }
        const anim = model.getAnim(-1);
        const tenor = features.tenor;
        if (tenor) {
            const { x, y } = statueMiddle(tenor);
            const downbeat = song.beatTick - (song.beat - song.barBeat) * song.ticksPerBeat;
            const since = shown - downbeat;
            const flash =
                song.playing && since < LAND_FLASH ? STRIKE_FLASH * (1 - since / LAND_FLASH) : 0;
            actors.draw(model, anim, 0, x, this.ground(sim, x, y), y, 0, {
                flash,
                tint: SING_TINT,
            });
        }
        const bells = features.bells ?? [];
        bells.forEach((bell, i) => {
            const state = song.bells[i];
            const { x, y } = statueMiddle(bell);
            let lift = 0;
            let flash = 0;
            if (state && state.liftTick >= 0 && shown >= state.liftTick) {
                if (shown < state.strikeTick) {
                    lift = LIFT * clamp01((shown - state.liftTick) / (song.ticksPerBeat * 0.6));
                } else {
                    lift = LIFT * (1 - clamp01((shown - state.strikeTick) / DROP_TICKS));
                    const since = shown - state.strikeTick;
                    if (since < LAND_FLASH) {
                        flash = STRIKE_FLASH * (1 - since / LAND_FLASH);
                    }
                }
            }
            const humming =
                state &&
                !state.rung &&
                song.beat + 1 >= state.humFrom &&
                song.beat <= state.humTo &&
                shown >= state.strikeTick;
            if (humming) {
                const pulse =
                    0.5 +
                    0.5 * Math.cos(((shown - song.beatTick) / song.ticksPerBeat) * Math.PI * 2);
                flash = Math.max(flash, HUM_FLASH * pulse);
            }
            actors.draw(model, anim, 0, x, this.ground(sim, x, y) - lift, y, 0, {
                flash,
                tint: SING_TINT,
            });
        });
    }

    // The Silent Choir: Lost Souls by the walls, facing in, dipping on every beat, lit while they
    // sing (Silence's count, Harmony's line)
    private drawChoir(
        actors: ActorRenderer,
        sim: Sim,
        song: SongState,
        def: SongDef,
        shown: number,
    ): void {
        const choir = sim.map.features?.choir ?? [];
        const looks = def.choirLooks ?? [];
        if (looks.length === 0) {
            return;
        }
        const beat = clamp01((shown - song.beatTick) / (song.ticksPerBeat * 0.5));
        const dip = song.playing ? BOB * (1 - beat) : 0;
        choir.forEach((soul, i) => {
            const look = getEnemy(looks[i % looks.length]);
            const model = this.assets.get(getEnemyModelKey(look, 0));
            if (!model) {
                this.assets.requestEnemy(look);
                return;
            }
            const anim = model.getAnim(look.idleSeq);
            const x = soul.x + 0.5;
            const y = soul.y + 0.5;
            const singing = (song.singing[i] ?? -1) > shown;
            actors.draw(
                model,
                anim,
                anim.getFrame(sim.tick + i * 11),
                x,
                this.ground(sim, x, y) + dip,
                y,
                yawFromVector(-soul.side, 0),
                singing ? { flash: SING_FLASH, tint: SING_TINT } : undefined,
            );
        });
    }

    // Her reflection: her head under the water mirrored across the nave in the requiem, and where
    // she went down at a threshold
    private drawReflection(
        actors: ActorRenderer,
        sim: Sim,
        song: SongState,
        def: SongDef,
        alpha: number,
    ): void {
        const boss = sim.shownBoss;
        if (!boss || boss.dead || def.reflectionLook === undefined) {
            return;
        }
        const phase = boss.bossState?.phase;
        const under = phase?.pauseEnd !== undefined;
        const axis = sim.map.features?.axis;
        if (!under && (!song.reflection || axis === undefined)) {
            return;
        }
        const look = getEnemy(def.reflectionLook);
        const model = this.assets.get(getEnemyModelKey(look, 0));
        if (!model) {
            this.assets.requestEnemy(look);
            return;
        }
        const bx = boss.prevX + (boss.x - boss.prevX) * alpha;
        const by = boss.prevY + (boss.y - boss.prevY) * alpha;
        const x = under || axis === undefined ? bx : 2 * axis - bx;
        const anim = model.getAnim(look.idleSeq);
        actors.draw(
            model,
            anim,
            anim.getFrame(sim.tick),
            x,
            this.ground(sim, x, by),
            by,
            boss.yaw,
            {
                alpha: REFLECTION_ALPHA,
                tint: SING_TINT,
                flash: 0.2,
            },
        );
    }

    // How far she's sunk (0 to 1 of her height) at a threshold: down with her sink, and up again
    // through the count-in (GameView.drawEnemy)
    static sinkOf(sim: Sim, enemy: Enemy, alpha: number): number {
        const phase = enemy.bossState?.phase;
        if (!enemy.def.boss?.song || !phase || phase.pauseEnd === undefined) {
            return 0;
        }
        const tick = sim.tick - 1 + alpha;
        const rise = phase.riseTick ?? phase.pauseEnd;
        if (tick < rise) {
            return clamp01((tick - (phase.startTick ?? tick) - 20) / 40);
        }
        return 1 - clamp01((tick - rise) / Math.max(1, phase.pauseEnd - rise));
    }

    // Her idle in time: one loop to a bar, so she sways on the beat (GameView.drawEnemy)
    static conductTick(
        sim: Sim,
        enemy: Enemy,
        alpha: number,
        totalTicks: number,
    ): number | undefined {
        const song = sim.song;
        if (!song || !enemy.def.boss?.song || !song.playing) {
            return undefined;
        }
        const shown = sim.tick - 1 + alpha;
        const beats = song.beat - song.barBeat + (shown - song.beatTick) / song.ticksPerBeat;
        return Math.floor(((beats / 4) % 1) * totalTicks);
    }

    // How much brighter the nave is now: a little on each downbeat, eased back over the beat
    static light(sim: Sim, alpha: number): number {
        const song = sim.song;
        if (!song || !song.playing) {
            return 1;
        }
        const downbeat = song.beatTick - (song.beat - song.barBeat) * song.ticksPerBeat;
        const since = (sim.tick - 1 + alpha - downbeat) / song.ticksPerBeat;
        return 1 + DOWNBEAT_LIGHT * (1 - clamp01(since)) ** 2;
    }

    // ---- On the overlay ----

    drawGround(overlay: Overlay, sim: Sim, alpha: number, now: number, scale: number): void {
        const song = sim.song;
        const def = this.def(sim);
        if (!song || !def) {
            return;
        }
        const shown = sim.tick - 1 + alpha;
        const ctx = overlay.ctx;
        for (const note of song.notes) {
            if (shown >= note.shownTick) {
                this.drawNote(overlay, sim, song, note, shown, scale);
            }
        }
        this.drawHum(overlay, sim, song, def, shown, scale);
        this.drawReach(overlay, sim, alpha, now, scale);
        if (this.muted && song.playing) {
            const player = sim.player;
            const x = player.prevX + (player.x - player.prevX) * alpha;
            const y = player.prevY + (player.y - player.prevY) * alpha;
            const t = clamp01((shown - song.beatTick) / song.ticksPerBeat);
            this.trace(overlay, sim, { kind: "circle", x, y, r: 0.3 + FOOT_RING * t });
            ctx.lineWidth = Math.max(1, 1.5 * scale);
            ctx.strokeStyle = `rgba(${HUM}, ${0.45 * (1 - t)})`;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // A part's warning: its shape, filled a step more on each beat of its count, its edge plain
    // all along; a white flash as it lands
    private drawNote(
        overlay: Overlay,
        sim: Sim,
        song: SongState,
        note: SongNote,
        shown: number,
        scale: number,
    ): void {
        const ctx = overlay.ctx;
        const phrase = song.phrases.find((p) => p.id === note.phrase);
        const tpb = phrase?.ticksPerBeat ?? song.ticksPerBeat;
        const colour = note.canon ? CANON : HURT;
        if (shown >= note.landTick) {
            const t = clamp01((shown - note.landTick) / (note.hurtTicks + LAND_FLASH));
            this.trace(overlay, sim, note.shape);
            ctx.fillStyle = `rgba(${LANDED}, ${0.3 * (1 - t)})`;
            ctx.fill("evenodd");
            return;
        }
        const step = Math.min(
            note.steps,
            Math.max(0, Math.floor((shown - note.countFrom) / tpb) + 1),
        );
        this.trace(overlay, sim, note.shape);
        ctx.fillStyle = `rgba(${colour}, ${FILL_BASE + (FILL_STEP * step) / note.steps})`;
        ctx.fill("evenodd");
        ctx.lineWidth = Math.max(1, 2 * scale);
        ctx.strokeStyle = `rgba(${colour}, ${EDGE_ALPHA})`;
        ctx.stroke();
        // A circle fills from its middle out, a step a beat
        if (note.shape.kind === "circle" && step > 0) {
            const inner = { ...note.shape, r: (note.shape.r * step) / note.steps };
            this.trace(overlay, sim, inner);
            ctx.fillStyle = `rgba(${colour}, ${FILL_STEP})`;
            ctx.fill();
        }
    }

    // A bell humming after it's struck: the zone it burst in, where a Toll rings it back
    private drawHum(
        overlay: Overlay,
        sim: Sim,
        song: SongState,
        def: SongDef,
        shown: number,
        scale: number,
    ): void {
        const bells = sim.map.features?.bells ?? [];
        const ctx = overlay.ctx;
        song.bells.forEach((state, i) => {
            if (
                !bells[i] ||
                state.rung ||
                shown < state.strikeTick ||
                song.beat > state.humTo ||
                song.beat + 1 < state.humFrom
            ) {
                return;
            }
            const { x, y } = statueMiddle(bells[i]);
            const pulse =
                0.5 + 0.5 * Math.cos(((shown - song.beatTick) / song.ticksPerBeat) * Math.PI * 2);
            this.trace(overlay, sim, { kind: "circle", x, y, r: def.toll.ringBack.reach });
            ctx.lineWidth = Math.max(1, 2.5 * scale);
            ctx.strokeStyle = `rgba(${HUM}, ${0.35 + 0.35 * pulse})`;
            ctx.stroke();
            ctx.fillStyle = `rgba(${HUM}, ${0.05 + 0.05 * pulse})`;
            ctx.fill();
        });
    }

    // Toll's reach round the player when she's out of it, and widened for a bar after a Grace
    private drawReach(overlay: Overlay, sim: Sim, alpha: number, now: number, scale: number): void {
        const boss = sim.shownBoss;
        if (!boss || boss.dead || sim.intro) {
            return;
        }
        const player = sim.player;
        const reach = sim.tollReach();
        const grace = now - this.graceAt < GRACE_MS;
        const graced = reach > (sim.map.fight?.ability?.reach ?? reach);
        if (Math.hypot(boss.x - player.x, boss.y - player.y) <= reach && !grace && !graced) {
            return;
        }
        const x = player.prevX + (player.x - player.prevX) * alpha;
        const y = player.prevY + (player.y - player.prevY) * alpha;
        const ctx = overlay.ctx;
        this.trace(overlay, sim, { kind: "circle", x, y, r: reach });
        ctx.lineWidth = Math.max(1, (grace ? 3 : 2) * scale);
        ctx.strokeStyle = `rgba(${REACH}, ${grace ? 0.7 : graced ? 0.5 : 0.35})`;
        ctx.stroke();
    }

    // A shape's outline on the ground (a ring's two circles, filled with evenodd)
    private trace(overlay: Overlay, sim: Sim, shape: SongShape): void {
        const ctx = overlay.ctx;
        ctx.beginPath();
        const circle = (cx: number, cy: number, r: number) => {
            const steps = Math.max(16, Math.ceil(r * 8));
            for (let i = 0; i <= steps; i++) {
                const angle = (i / steps) * Math.PI * 2;
                this.point(
                    overlay,
                    sim,
                    cx + Math.cos(angle) * r,
                    cy + Math.sin(angle) * r,
                    i === 0,
                );
            }
            ctx.closePath();
        };
        const polygon = (corners: { x: number; y: number }[]) => {
            let first = true;
            for (let i = 0; i < corners.length; i++) {
                const from = corners[i];
                const to = corners[(i + 1) % corners.length];
                const steps = Math.max(
                    1,
                    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / GROUND_STEP),
                );
                for (let s = 0; s < steps; s++) {
                    const t = s / steps;
                    this.point(
                        overlay,
                        sim,
                        from.x + (to.x - from.x) * t,
                        from.y + (to.y - from.y) * t,
                        first,
                    );
                    first = false;
                }
            }
            ctx.closePath();
        };
        switch (shape.kind) {
            case "circle":
                circle(shape.x, shape.y, shape.r);
                break;
            case "ring":
                circle(shape.x, shape.y, shape.r1);
                circle(shape.x, shape.y, shape.r0);
                break;
            case "box":
                polygon([
                    { x: shape.x0, y: shape.y0 },
                    { x: shape.x1, y: shape.y0 },
                    { x: shape.x1, y: shape.y1 },
                    { x: shape.x0, y: shape.y1 },
                ]);
                break;
            case "strip": {
                const dx = shape.bx - shape.ax;
                const dy = shape.by - shape.ay;
                const length = Math.hypot(dx, dy) || 1;
                const nx = (-dy / length) * (shape.width / 2);
                const ny = (dx / length) * (shape.width / 2);
                polygon([
                    { x: shape.ax + nx, y: shape.ay + ny },
                    { x: shape.bx + nx, y: shape.by + ny },
                    { x: shape.bx - nx, y: shape.by - ny },
                    { x: shape.ax - nx, y: shape.ay - ny },
                ]);
                break;
            }
        }
    }

    private point(overlay: Overlay, sim: Sim, x: number, y: number, first: boolean): void {
        const p = overlay.project(x, this.ground(sim, x, y) - 0.05, y, this.a);
        if (first) {
            overlay.ctx.moveTo(p.x, p.y);
        } else {
            overlay.ctx.lineTo(p.x, p.y);
        }
    }
}
