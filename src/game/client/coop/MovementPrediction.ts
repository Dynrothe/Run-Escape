import { PLAYER_SPEED, Sim, TICKS_PER_SECOND, yawFromVector } from "../../core/Sim";
import type { FrameEvent } from "../../core/lockstep";
import { moveCircle } from "../../core/world/Collision";
import { PlayerPose } from "../PlayerPose";

const TICK_MS = 1000 / TICKS_PER_SECOND;
// Bound both replay work and how far the picture can run ahead of confirmed play.
export const PREDICTION_MS = 300;
export const MAX_INPUT_HISTORY = 128;
const STALE_MS = 500;
const CORRECTION_MS = 80;
const SNAP_DISTANCE = 1.5;

type Input = { seq: number; at: number; move: [number, number] };

// Replays only this player's movement on a separate position. No Sim.step,
// random numbers, combat, timers or writes to the authoritative player.
export class MovementPrediction {
    private sequence = 0;
    private acknowledged = 0;
    private inputs: Input[];
    private confirmedAt: number;
    private receivedAt: number;
    private renderedAt: number;
    private confirmed = false;
    private lastTick: number;
    private lastX: number;
    private lastY: number;
    private pose?: PlayerPose;
    private arena?: { minX: number; minY: number; maxX: number; maxY: number };

    constructor(
        private readonly sim: Sim,
        private readonly now: () => number,
    ) {
        const time = now();
        this.confirmedAt = this.receivedAt = this.renderedAt = time;
        this.inputs = [{ seq: 0, at: time, move: [0, 0] }];
        this.lastTick = sim.tick;
        this.lastX = sim.player.x;
        this.lastY = sim.player.y;
    }

    // Called even when the network's move throttle hasn't elapsed yet.
    sample(move: [number, number]): number {
        const last = this.inputs[this.inputs.length - 1];
        if (last.move[0] !== move[0] || last.move[1] !== move[1]) {
            this.inputs.push({ seq: ++this.sequence, at: this.now(), move });
            if (this.inputs.length > MAX_INPUT_HISTORY) {
                this.inputs.shift();
                this.confirmedAt = Math.max(this.confirmedAt, this.inputs[0].at);
            }
        }
        return this.sequence;
    }

    // Called AFTER applying a confirmed frame, not just receiving its packet.
    confirm(events: readonly FrameEvent[]): void {
        const time = this.now();
        this.receivedAt = time;
        this.confirmed = true;
        this.confirmedAt += Math.max(0, this.sim.tick - this.lastTick) * TICK_MS;
        for (const event of events) {
            if (
                event.hero !== this.sim.focus ||
                !event.moveSeq ||
                event.moveSeq <= this.acknowledged
            ) {
                continue;
            }
            const input = this.inputs.find((entry) => entry.seq === event.moveSeq);
            if (input) {
                this.acknowledged = input.seq;
                // This confirmed step already moved once with that input.
                this.confirmedAt = input.at + TICK_MS;
            }
        }
        // Old host ticks mustn't consume input it hasn't applied yet. The
        // host may coalesce several changes; its latest sequence retires all.
        const pending = this.inputs.find((input) => input.seq > this.acknowledged);
        this.confirmedAt = Math.min(this.confirmedAt, pending?.at ?? time, time);
        while (
            this.inputs.length > 1 &&
            this.inputs[1].seq <= this.acknowledged &&
            this.inputs[1].at <= this.confirmedAt
        ) {
            this.inputs.shift();
        }
        const player = this.sim.player;
        if (Math.hypot(player.x - this.lastX, player.y - this.lastY) > SNAP_DISTANCE) {
            this.reset(time);
        }
        this.lastTick = this.sim.tick;
        this.lastX = player.x;
        this.lastY = player.y;
    }

    private reset(time: number): void {
        const last = this.inputs[this.inputs.length - 1];
        this.inputs = [{ ...last, at: time }];
        this.acknowledged = last.seq;
        this.confirmedAt = this.renderedAt = time;
        this.pose = undefined;
    }

    // This mirrors stepPlayer's movement rules, but moves only the picture.
    // Known freezes stay authoritative; we never guess when a hold will end.
    private move(pose: PlayerPose, input: Input, ms: number): void {
        const sim = this.sim;
        const hero = sim.heroes[sim.focus];
        let x = input.move[0] / 127;
        let y = input.move[1] / 127;
        if (hero.curse) {
            const [a, b, c, d] = hero.curse.matrix;
            [x, y] = [x * a + y * b, x * c + y * d];
        }
        pose.moving = x !== 0 || y !== 0;
        if (pose.moving) {
            pose.yaw = yawFromVector(x, y);
            const sled = sim.tick < hero.sledEndTick ? hero.sledSpeed : 1;
            const speed = PLAYER_SPEED * (1 + hero.stats.moveSpeed) * sled;
            // Small steps follow the same wall sliding as confirmed movement.
            for (let left = ms; left > 0; left -= TICK_MS) {
                const ticks = Math.min(left, TICK_MS) / TICK_MS;
                moveCircle(
                    sim.grid,
                    pose,
                    x * speed * ticks,
                    y * speed * ticks,
                    hero.player.radius,
                );
            }
        }
        this.clampArena(pose);
    }

    private clampArena(pose: PlayerPose): void {
        const sim = this.sim;
        if (this.arena) {
            const arena = this.arena;
            const edge = sim.player.radius;
            pose.x = Math.max(arena.minX + edge, Math.min(arena.maxX - edge, pose.x));
            pose.y = Math.max(arena.minY + edge, Math.min(arena.maxY - edge, pose.y));
        }
    }

    private replay(pose: PlayerPose, from: number, to: number): void {
        let input = this.inputs[0];
        for (const next of this.inputs) {
            if (next.at <= from) {
                input = next;
            } else if (next.at < to) {
                this.move(pose, input, next.at - from);
                from = next.at;
                input = next;
            } else {
                break;
            }
        }
        this.move(pose, input, Math.max(0, to - from));
    }

    render(): PlayerPose | undefined {
        const time = this.now();
        const sim = this.sim;
        const player = sim.player;
        if (
            !this.confirmed ||
            sim.state !== "playing" ||
            sim.runOver ||
            !sim.isUp(sim.heroes[sim.focus]) ||
            player.frozen > 0 ||
            time - this.receivedAt > STALE_MS ||
            time < this.renderedAt
        ) {
            this.reset(time);
            return undefined;
        }
        const target: PlayerPose = {
            hero: sim.focus,
            x: player.x,
            y: player.y,
            yaw: player.yaw,
            moving: player.moving,
            moveTicks: sim.tick - player.moveStart,
        };
        // Resolve this once per render, rather than scanning for the boss
        // during every replayed movement segment.
        this.arena =
            sim.map.bossArena && sim.shownBoss?.def.boss?.phases ? sim.bossArena : undefined;
        const end = Math.min(time, this.confirmedAt + PREDICTION_MS);
        this.replay(target, this.confirmedAt, end);
        const dt = Math.min(50, Math.max(0, time - this.renderedAt));
        const pose = this.pose ?? { ...target };
        const wasMoving = pose.moving;
        if (this.pose) {
            this.replay(
                pose,
                this.renderedAt,
                Math.max(this.renderedAt, Math.min(end, this.renderedAt + dt)),
            );
            const dx = target.x - pose.x;
            const dy = target.y - pose.y;
            if (Math.hypot(dx, dy) > SNAP_DISTANCE) {
                pose.x = target.x;
                pose.y = target.y;
            } else {
                const blend = 1 - Math.exp(-dt / CORRECTION_MS);
                moveCircle(sim.grid, pose, dx * blend, dy * blend, player.radius);
                this.clampArena(pose);
            }
        }
        // Facing and animation react even before the next movement tick.
        this.move(pose, this.inputs[this.inputs.length - 1], 0);
        pose.moveTicks = pose.moving === wasMoving ? pose.moveTicks + dt / TICK_MS : 0;
        this.renderedAt = time;
        this.pose = pose;
        return pose;
    }
}
