import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import { Sim } from "../core/Sim";
import {
    BossQuarters,
    BossWindup,
    Enemy,
    GroundHazard,
    SimEvent,
    SurgeLane,
} from "../core/entities";
import { GameAssets } from "./GameAssets";
import { Overlay, ScreenPoint } from "./Overlay";

// What a boss with a fight of its own puts in the world (BossDef.phases,
// BossDef.intro): marks on the ground, bullets, the dark of its entrance. All of
// it is warned on the ground, so anything here that's hard to read is a bug.

const BEAM_MS = 700;
// Tiles either way from the player that flowers and lines are drawn: enough to
// fill the screen at the widest zoom, and no more
const VIEW_REACH = 44;
// A long edge is split into pieces this long, to lie on the ground
const GROUND_STEP = 3;
const SPRITE_SIZE = 64;
const DARK = 0.78;
const FADE_TICKS = 40;
const LANE_CHEVRON_GAP = 4;
// Pixels, at a scale of 1
const TOTEM_ARROW = 14;

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function clamp01(t: number): number {
    return Math.min(1, Math.max(0, t));
}

export class BossFightView {
    private beams: { x: number; y: number; toX: number; toY: number; start: number }[] = [];
    private readonly sprites = new Map<string, HTMLCanvasElement>();
    private readonly a: ScreenPoint = { x: 0, y: 0, visible: false };
    private readonly b: ScreenPoint = { x: 0, y: 0, visible: false };

    constructor(private readonly assets: GameAssets) {}

    reset(): void {
        this.beams = [];
    }

    onEvent(event: SimEvent, now: number): void {
        if (event.type === "totemBlast") {
            const { x, y, toX, toY } = event;
            this.beams.push({ x, y, toX, toY, start: now });
        }
    }

    private ground(sim: Sim, x: number, y: number): number {
        return sim.grid.getHeight(x, y) / 128;
    }

    // ---- In the 3D view ----

    submitActors(actors: ActorRenderer, sim: Sim): void {
        const quarters = sim.quarters;
        if (quarters) {
            this.drawFlowers(actors, sim, quarters);
        }
        for (const hazard of sim.hazards) {
            const locId = hazard.attack.ground?.locId;
            const spotAnim = hazard.attack.ground?.spotAnim;
            const model = this.assets.get(
                locId !== undefined ? "loc:" + locId : "spot:" + spotAnim,
            );
            if (!model) {
                continue;
            }
            const anim = model.anims[0];
            const frame = anim.getFrame(sim.tick - hazard.startTick);
            actors.draw(
                model,
                anim,
                frame,
                hazard.x,
                this.ground(sim, hazard.x, hazard.y),
                hazard.y,
                0,
            );
        }
    }

    // Along the four lines, white on the two beside the safe quarter
    private drawFlowers(actors: ActorRenderer, sim: Sim, quarters: BossQuarters): void {
        const def = quarters.attack.quarters!;
        const safe = this.assets.get("loc:" + def.safeLocId);
        const hurt = this.assets.get("loc:" + def.hurtLocId);
        const arena = sim.bossArena;
        const { x: cx, y: cy, safe: quarter } = quarters;
        const east = (quarter & 1) === 1;
        const north = (quarter & 2) === 2;
        const line = (dx: number, dy: number, white: boolean) => {
            const model = white ? safe : hurt;
            if (!model) {
                return;
            }
            const anim = model.anims[0];
            const frame = anim.getFrame(sim.tick - quarters.startTick);
            for (let along = def.spacing; along <= VIEW_REACH; along += def.spacing) {
                const x = cx + dx * along;
                const y = cy + dy * along;
                if (x < arena.minX || x > arena.maxX || y < arena.minY || y > arena.maxY) {
                    return;
                }
                actors.draw(model, anim, frame, x, this.ground(sim, x, y), y, 0);
            }
        };
        line(1, 0, east);
        line(-1, 0, !east);
        line(0, 1, north);
        line(0, -1, !north);
    }

    // ---- On the ground ----

    drawGround(overlay: Overlay, sim: Sim, alpha: number, now: number, scale: number): void {
        const quarters = sim.quarters;
        if (quarters) {
            this.drawQuarters(overlay, sim, quarters, alpha, scale);
        }
        for (const hazard of sim.hazards) {
            this.drawHazard(overlay, sim, hazard, alpha);
        }
        for (const enemy of sim.enemies) {
            const state = enemy.bossState;
            if (!state || enemy.dead) {
                continue;
            }
            const windup = state.windup;
            if (windup) {
                const t = clamp01(
                    (sim.tick + alpha - windup.startTick) /
                        Math.max(1, windup.landTick - windup.startTick),
                );
                if (windup.lane) {
                    this.drawLane(overlay, sim, windup.lane, t, now, scale);
                } else if (windup.attack.cone !== undefined) {
                    this.drawCone(overlay, sim, enemy, windup, t, scale);
                } else if (windup.attack.pattern) {
                    this.drawGathering(overlay, sim, enemy, windup, t, now, scale);
                }
            }
            const surge = state.surge;
            if (surge) {
                this.drawLane(overlay, sim, surge.lane, 1, now, scale);
            }
        }
        this.drawPlayerMarks(overlay, sim, alpha, now, scale);
    }

    // Traces a shape on the ground, each edge split up to follow it. Corners
    // behind the camera are left out: only a shape well off the screen has any.
    private traceGround(overlay: Overlay, sim: Sim, corners: { x: number; y: number }[]): void {
        const ctx = overlay.ctx;
        ctx.beginPath();
        let first = true;
        const point = (x: number, y: number) => {
            const p = overlay.project(x, this.ground(sim, x, y) - 0.1, y, this.a);
            if (p.behind) {
                return;
            }
            if (first) {
                ctx.moveTo(p.x, p.y);
                first = false;
            } else {
                ctx.lineTo(p.x, p.y);
            }
        };
        for (let i = 0; i < corners.length; i++) {
            const from = corners[i];
            const to = corners[(i + 1) % corners.length];
            const steps = Math.max(
                1,
                Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / GROUND_STEP),
            );
            for (let step = 0; step < steps; step++) {
                point(lerp(from.x, to.x, step / steps), lerp(from.y, to.y, step / steps));
            }
        }
        ctx.closePath();
    }

    private traceCircle(
        overlay: Overlay,
        sim: Sim,
        cx: number,
        cy: number,
        radius: number,
        steps = 20,
    ): void {
        const ctx = overlay.ctx;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            const p = overlay.project(x, this.ground(sim, x, y) - 0.1, y, this.a);
            if (i === 0) {
                ctx.moveTo(p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
    }

    // The whole lane, there from the start, red, with arrows running the way
    // she'll come and a bright front closing down it as the moment nears
    private drawLane(
        overlay: Overlay,
        sim: Sim,
        lane: SurgeLane,
        t: number,
        now: number,
        scale: number,
    ): void {
        const ctx = overlay.ctx;
        const player = sim.player;
        const dx = lane.toX - lane.fromX;
        const dy = lane.toY - lane.fromY;
        const length = Math.max(0.001, Math.hypot(dx, dy));
        const dirX = dx / length;
        const dirY = dy / length;
        const sideX = -dirY * lane.halfWidth;
        const sideY = dirX * lane.halfWidth;
        // What's in view of the player, so a long lane doesn't reach behind the camera
        const middle = (player.x - lane.fromX) * dirX + (player.y - lane.fromY) * dirY;
        const start = Math.max(0, middle - VIEW_REACH);
        const end = Math.min(length, middle + VIEW_REACH);
        const at = (along: number, side: number) => ({
            x: lane.fromX + dirX * along + sideX * side,
            y: lane.fromY + dirY * along + sideY * side,
        });
        const strip = (from: number, to: number) => {
            this.traceGround(overlay, sim, [at(from, -1), at(to, -1), at(to, 1), at(from, 1)]);
        };

        strip(start, end);
        ctx.fillStyle = `rgba(255, 20, 50, ${0.22 + 0.2 * t})`;
        ctx.fill();
        ctx.lineWidth = Math.max(2, 4 * scale);
        ctx.strokeStyle = `rgba(255, 90, 90, ${0.75 + 0.25 * t})`;
        ctx.stroke();

        // The time left, as how far down the lane it's filled
        const front = lerp(0, length, t);
        if (front > start) {
            strip(start, Math.min(end, front));
            ctx.fillStyle = `rgba(255, 60, 60, ${0.14 + 0.16 * t})`;
            ctx.fill();
        }

        // Which way she's coming
        const travel = ((now / 1000) * 10) % LANE_CHEVRON_GAP;
        ctx.lineWidth = Math.max(2, 3 * scale);
        ctx.strokeStyle = `rgba(255, 235, 235, ${0.55 + 0.4 * t})`;
        const first = Math.floor(start / LANE_CHEVRON_GAP) * LANE_CHEVRON_GAP + travel;
        for (let along = first; along < end; along += LANE_CHEVRON_GAP) {
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const spot = at(along + (i === 1 ? 1.2 : 0), (i - 1) * 0.6);
                const p = overlay.project(
                    spot.x,
                    this.ground(sim, spot.x, spot.y) - 0.1,
                    spot.y,
                    this.a,
                );
                if (i === 0) {
                    ctx.moveTo(p.x, p.y);
                } else {
                    ctx.lineTo(p.x, p.y);
                }
            }
            ctx.stroke();
        }
    }

    // In the way she's facing, and under her
    private drawCone(
        overlay: Overlay,
        sim: Sim,
        enemy: Enemy,
        windup: BossWindup,
        t: number,
        scale: number,
    ): void {
        const ctx = overlay.ctx;
        const attack = windup.attack;
        const radius = attack.radius ?? 2;
        const cone = attack.cone!;
        const base = Math.atan2(windup.dirY, windup.dirX);
        const steps = 8;
        const wedge = (reach: number) => {
            const points = [{ x: enemy.x, y: enemy.y }];
            for (let i = 0; i <= steps; i++) {
                const angle = base - cone / 2 + (cone * i) / steps;
                points.push({
                    x: enemy.x + Math.cos(angle) * reach,
                    y: enemy.y + Math.sin(angle) * reach,
                });
            }
            this.traceGround(overlay, sim, points);
        };
        wedge(radius);
        ctx.fillStyle = `rgba(200, 20, 20, ${0.14 + 0.14 * t})`;
        ctx.fill();
        ctx.lineWidth = Math.max(2, 3 * scale);
        ctx.strokeStyle = `rgba(255, 70, 50, ${0.6 + 0.4 * t})`;
        ctx.stroke();
        wedge(radius * t);
        ctx.fillStyle = `rgba(255, 40, 20, ${0.28 * t})`;
        ctx.fill();
        this.traceCircle(overlay, sim, enemy.x, enemy.y, attack.underRadius ?? 0);
        ctx.fillStyle = `rgba(255, 40, 20, ${0.16 + 0.16 * t})`;
        ctx.fill();
        ctx.stroke();
    }

    // Petals drawing in on her, or a fan's lines showing where it's aimed
    private drawGathering(
        overlay: Overlay,
        sim: Sim,
        enemy: Enemy,
        windup: BossWindup,
        t: number,
        now: number,
        scale: number,
    ): void {
        const ctx = overlay.ctx;
        const pattern = windup.attack.pattern!;
        if (pattern.shape === "spread") {
            const base = Math.atan2(windup.dirY, windup.dirX);
            const arc = pattern.arc ?? 1;
            ctx.strokeStyle = pattern.color;
            ctx.globalAlpha = 0.3 + 0.5 * t;
            ctx.lineWidth = Math.max(2, 3 * scale);
            for (let i = 0; i < pattern.count; i++) {
                const angle = base - arc / 2 + (arc * i) / Math.max(1, pattern.count - 1);
                const from = overlay.project(
                    enemy.x,
                    this.ground(sim, enemy.x, enemy.y),
                    enemy.y,
                    this.a,
                );
                const x = enemy.x + Math.cos(angle) * 12;
                const y = enemy.y + Math.sin(angle) * 12;
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                const to = overlay.project(x, this.ground(sim, x, y), y, this.b);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            return;
        }
        const sprite = this.getSprite(pattern.color);
        const petals = pattern.count * 3;
        const size = 22 * scale;
        const reach = lerp(7, 1.5, t);
        const spin = (now / 1000) * 2.4;
        for (let i = 0; i < petals; i++) {
            const angle = (i / petals) * Math.PI * 2 + spin;
            const x = enemy.x + Math.cos(angle) * reach;
            const y = enemy.y + Math.sin(angle) * reach;
            const p = overlay.project(x, this.ground(sim, x, y) - 1, y, this.a);
            if (p.visible) {
                ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
            }
        }
    }

    private drawHazard(overlay: Overlay, sim: Sim, hazard: GroundHazard, alpha: number): void {
        const ctx = overlay.ctx;
        const tick = sim.tick + alpha;
        const { x, y, radius } = hazard;
        const t = clamp01(
            (tick - hazard.startTick) / Math.max(1, hazard.landTick - hazard.startTick),
        );
        this.traceCircle(overlay, sim, x, y, radius);
        if (hazard.armed) {
            // Sitting there, waiting to be walked into
            const lit = hazard.fuseTick !== -1;
            ctx.fillStyle = lit
                ? "rgba(255, 150, 40, 0.5)"
                : `rgba(190, 220, 70, ${0.1 + 0.14 * t})`;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = lit
                ? "rgba(255, 220, 120, 1)"
                : `rgba(220, 255, 110, ${0.4 + 0.5 * t})`;
            ctx.stroke();
            return;
        }
        ctx.fillStyle = `rgba(20, 0, 40, ${0.15 + 0.25 * t})`;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(230, 90, 255, ${0.7 + 0.3 * t})`;
        ctx.stroke();
        this.traceCircle(overlay, sim, x, y, radius * t);
        ctx.fillStyle = `rgba(230, 60, 255, ${0.28 * t})`;
        ctx.fill();
    }

    // Green for the quarter to be in; red for the rest, stronger once they hurt
    private drawQuarters(
        overlay: Overlay,
        sim: Sim,
        quarters: BossQuarters,
        alpha: number,
        scale: number,
    ): void {
        const ctx = overlay.ctx;
        const player = sim.player;
        const arena = sim.bossArena;
        const left = Math.max(arena.minX, player.x - VIEW_REACH);
        const right = Math.min(arena.maxX, player.x + VIEW_REACH);
        const bottom = Math.max(arena.minY, player.y - VIEW_REACH);
        const top = Math.min(arena.maxY, player.y + VIEW_REACH);
        const hurting = sim.tick + alpha >= quarters.hurtTick;
        for (let quarter = 0; quarter < 4; quarter++) {
            const x0 = quarter & 1 ? quarters.x : left;
            const x1 = quarter & 1 ? right : quarters.x;
            const y0 = quarter & 2 ? quarters.y : bottom;
            const y1 = quarter & 2 ? top : quarters.y;
            this.traceGround(overlay, sim, [
                { x: x0, y: y0 },
                { x: x1, y: y0 },
                { x: x1, y: y1 },
                { x: x0, y: y1 },
            ]);
            if (quarter === quarters.safe) {
                ctx.fillStyle = "rgba(90, 255, 140, 0.16)";
                ctx.fill();
                ctx.lineWidth = Math.max(2, 4 * scale);
                ctx.strokeStyle = "rgba(170, 255, 190, 0.95)";
                ctx.stroke();
            } else {
                ctx.fillStyle = `rgba(200, 10, 40, ${hurting ? 0.3 : 0.12})`;
                ctx.fill();
            }
        }
    }

    // What's on the player: held, or a parasite counting down
    private drawPlayerMarks(
        overlay: Overlay,
        sim: Sim,
        alpha: number,
        now: number,
        scale: number,
    ): void {
        const ctx = overlay.ctx;
        const player = sim.player;
        const x = lerp(player.prevX, player.x, alpha);
        const y = lerp(player.prevY, player.y, alpha);
        if (sim.hold) {
            this.traceCircle(overlay, sim, x, y, 1.1);
            ctx.lineWidth = Math.max(2, 3 * scale);
            ctx.strokeStyle = "rgba(120, 210, 255, 0.95)";
            ctx.stroke();
        }
        const parasite = sim.parasite;
        if (parasite) {
            const t = clamp01(
                (sim.tick + alpha - parasite.startTick) /
                    Math.max(1, parasite.burstTick - parasite.startTick),
            );
            const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * (4 + 14 * t));
            this.traceCircle(overlay, sim, x, y, 1.4 - 0.6 * t);
            ctx.lineWidth = Math.max(2, 3 * scale);
            ctx.strokeStyle = `rgba(255, 110, 215, ${0.5 + 0.5 * pulse})`;
            ctx.stroke();
        }
    }

    // ---- Bullets ----

    // A soft dot in the colour, with a white middle and a dark edge so it shows
    // on any ground. One sprite each, as a gradient per bullet costs too much.
    private getSprite(color: string): HTMLCanvasElement {
        let sprite = this.sprites.get(color);
        if (!sprite) {
            sprite = document.createElement("canvas");
            sprite.width = sprite.height = SPRITE_SIZE;
            const ctx = sprite.getContext("2d")!;
            const middle = SPRITE_SIZE / 2;
            const glow = ctx.createRadialGradient(middle, middle, 0, middle, middle, middle);
            glow.addColorStop(0, "#ffffff");
            glow.addColorStop(0.3, "#ffffff");
            glow.addColorStop(0.45, color);
            glow.addColorStop(0.72, color);
            glow.addColorStop(0.8, "rgba(20, 0, 20, 0.9)");
            glow.addColorStop(1, "rgba(20, 0, 20, 0)");
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
            this.sprites.set(color, sprite);
        }
        return sprite;
    }

    drawBullets(overlay: Overlay, sim: Sim, alpha: number): void {
        const bullets = sim.bullets;
        if (bullets.count === 0) {
            return;
        }
        const ctx = overlay.ctx;
        const player = sim.player;
        // Tiles to pixels at the player, near enough for everything on screen
        const groundY = this.ground(sim, player.x, player.y);
        const from = overlay.project(player.x, groundY, player.y, this.a);
        const fromX = from.x;
        const to = overlay.project(player.x + 1, groundY, player.y, this.b);
        const pixels = Math.abs(to.x - fromX);
        const { prevX, prevY, x, y, radius, source, order } = bullets;
        for (let i = 0; i < bullets.count; i++) {
            const slot = order[i];
            const wx = lerp(prevX[slot], x[slot], alpha);
            const wy = lerp(prevY[slot], y[slot], alpha);
            const p = overlay.project(wx, this.ground(sim, wx, wy) - 0.5, wy, this.a);
            if (!p.visible) {
                continue;
            }
            const pattern = sim.bulletSources[source[slot]].attack.pattern!;
            const size = Math.max(8, radius[slot] * 2.2 * pixels);
            ctx.drawImage(
                this.getSprite(pattern.color),
                p.x - size / 2,
                p.y - size / 2,
                size,
                size,
            );
        }
    }

    // ---- Over the whole screen ----

    drawScreen(overlay: Overlay, sim: Sim, alpha: number, now: number, scale: number): void {
        this.drawBeams(overlay, sim, now, scale);
        this.drawTotemArrows(overlay, sim, scale);
        const boss = sim.shownBoss;
        const width = overlay.width;
        const height = overlay.height;
        const ctx = overlay.ctx;
        // Still dim around the edges for as long as she's up
        if (boss?.def.boss?.intro && !boss.dead && !sim.intro) {
            this.vignette(ctx, width, height, "rgba(10, 0, 20, 0.5)");
        }
        if (sim.curse) {
            const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * 3);
            this.vignette(ctx, width, height, `rgba(255, 60, 190, ${0.28 + 0.2 * pulse})`);
        }
        this.drawIntro(overlay, sim, alpha, scale);
    }

    private vignette(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        color: string,
    ): void {
        const reach = Math.hypot(width, height) / 2;
        const glow = ctx.createRadialGradient(
            width / 2,
            height / 2,
            reach * 0.55,
            width / 2,
            height / 2,
            reach,
        );
        glow.addColorStop(0, "rgba(0, 0, 0, 0)");
        glow.addColorStop(1, color);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
    }

    // Each totem's blast, across to her
    private drawBeams(overlay: Overlay, sim: Sim, now: number, scale: number): void {
        const ctx = overlay.ctx;
        this.beams = this.beams.filter((beam) => now - beam.start < BEAM_MS);
        for (const beam of this.beams) {
            const t = (now - beam.start) / BEAM_MS;
            const from = overlay.project(
                beam.x,
                this.ground(sim, beam.x, beam.y) - 2,
                beam.y,
                this.a,
            );
            const to = overlay.project(
                beam.toX,
                this.ground(sim, beam.toX, beam.toY) - 2,
                beam.toY,
                this.b,
            );
            if (from.behind || to.behind) {
                continue;
            }
            ctx.lineWidth = 8 * scale * (1 - t) + 1;
            ctx.strokeStyle = `rgba(255, 230, 150, ${1 - t})`;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        }
    }

    // Where the totems still to charge are, for those off the screen
    private drawTotemArrows(overlay: Overlay, sim: Sim, scale: number): void {
        const phase = sim.shownBoss?.bossState?.phase;
        if (!phase || phase.stage !== "totems") {
            return;
        }
        const ctx = overlay.ctx;
        const width = overlay.width;
        const height = overlay.height;
        const margin = 40 * scale;
        const size = TOTEM_ARROW * scale;
        const middleX = width / 2;
        const middleY = height / 2;
        const player = sim.player;
        for (const totem of phase.totems) {
            if (totem.hp <= 0) {
                continue;
            }
            const p = overlay.project(totem.x, this.ground(sim, totem.x, totem.y), totem.y, this.a);
            if (!p.behind && p.x > 0 && p.y > 0 && p.x < width && p.y < height) {
                continue;
            }
            // The way there on the ground, as it's on the screen: north is up
            const dx = totem.x - player.x;
            const dy = -(totem.y - player.y);
            const length = Math.max(0.001, Math.hypot(dx, dy));
            const dirX = dx / length;
            const dirY = dy / length;
            const reach = Math.min(
                (middleX - margin) / Math.max(Math.abs(dirX), 0.001),
                (middleY - margin) / Math.max(Math.abs(dirY), 0.001),
            );
            const x = middleX + dirX * reach;
            const y = middleY + dirY * reach;
            ctx.beginPath();
            ctx.moveTo(x + dirX * size, y + dirY * size);
            ctx.lineTo(x - dirX * size - dirY * size * 0.8, y - dirY * size + dirX * size * 0.8);
            ctx.lineTo(x - dirX * size + dirY * size * 0.8, y - dirY * size - dirX * size * 0.8);
            ctx.closePath();
            ctx.fillStyle = "#ffd76a";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#000000";
            ctx.stroke();
        }
    }

    // The dark coming down, a light left on her as she rises, and her name
    private drawIntro(overlay: Overlay, sim: Sim, alpha: number, scale: number): void {
        const intro = sim.intro;
        if (!intro) {
            return;
        }
        const ctx = overlay.ctx;
        const width = overlay.width;
        const height = overlay.height;
        const tick = sim.tick + alpha;
        const fade = clamp01(
            Math.min((tick - intro.startTick) / FADE_TICKS, (intro.endTick - tick) / FADE_TICKS),
        );
        const spot = intro.boss ?? sim.player;
        const p = overlay.project(spot.x, this.ground(sim, spot.x, spot.y) - 2, spot.y, this.a);
        const cx = p.behind ? width / 2 : p.x;
        const cy = p.behind ? height / 2 : p.y;
        const reach = Math.hypot(width, height);
        // A wide light, as she's a big thing, and it reaches the player beside her
        const dark = ctx.createRadialGradient(cx, cy, height * 0.2, cx, cy, reach * 0.62);
        dark.addColorStop(0, `rgba(8, 0, 18, ${0.12 * fade})`);
        dark.addColorStop(0.45, `rgba(8, 0, 18, ${0.5 * fade})`);
        dark.addColorStop(1, `rgba(8, 0, 18, ${DARK * fade})`);
        ctx.fillStyle = dark;
        ctx.fillRect(0, 0, width, height);

        const title = clamp01((tick - intro.riseTick) / FADE_TICKS);
        const titleFade = Math.min(title, clamp01((intro.endTick - tick) / FADE_TICKS));
        if (titleFade <= 0) {
            return;
        }
        const def = intro.def.boss!.intro!;
        const pixel = Math.max(1, Math.round(scale * 2));
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = titleFade;
        ctx.font = `${24 * pixel}px "OSRS Bold", sans-serif`;
        const y = height * 0.28;
        ctx.fillStyle = "#000000";
        ctx.fillText(def.title, width / 2 + pixel, y + pixel);
        ctx.fillStyle = "#ff9ae6";
        ctx.fillText(def.title, width / 2, y);
        if (def.subtitle) {
            ctx.font = `${12 * pixel}px "OSRS Bold", sans-serif`;
            ctx.fillStyle = "#000000";
            ctx.fillText(def.subtitle, width / 2 + pixel, y + 18 * pixel + pixel);
            ctx.fillStyle = "#e8d0ff";
            ctx.fillText(def.subtitle, width / 2, y + 18 * pixel);
        }
        ctx.globalAlpha = 1;
    }
}
