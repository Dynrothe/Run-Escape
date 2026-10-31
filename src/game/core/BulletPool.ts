// A boss's bullets: hundreds at once, so they live in flat arrays rather than
// as objects, and a spent one's slot goes straight back to the free list. The
// tick allocates nothing, and the only things a bullet tests against are the
// players.
import { fm } from "./fmath";

// A player a bullet can hit; spared ones (just hit, or reviving) it passes
// through
export type BulletTarget = { x: number; y: number; radius: number; spare: boolean };

export const MAX_BULLETS = 1024;

export class BulletPool {
    // The slots in use are the first count of order, in no particular order
    readonly x = new Float64Array(MAX_BULLETS);
    readonly y = new Float64Array(MAX_BULLETS);
    readonly prevX = new Float64Array(MAX_BULLETS);
    readonly prevY = new Float64Array(MAX_BULLETS);
    // Tiles per tick
    readonly vx = new Float64Array(MAX_BULLETS);
    readonly vy = new Float64Array(MAX_BULLETS);
    // A turn each tick, as its cosine and sine (a spiral's arms curve)
    readonly turnCos = new Float64Array(MAX_BULLETS);
    readonly turnSin = new Float64Array(MAX_BULLETS);
    readonly radius = new Float32Array(MAX_BULLETS);
    readonly damage = new Float32Array(MAX_BULLETS);
    readonly life = new Int32Array(MAX_BULLETS);
    readonly startTick = new Int32Array(MAX_BULLETS);
    // Which of attacks fired it
    readonly source = new Uint16Array(MAX_BULLETS);
    readonly order = new Uint16Array(MAX_BULLETS);
    count = 0;
    // What step hit, for each of its targets: a bullet's slot, or -1
    readonly hits: number[] = [];

    constructor() {
        for (let i = 0; i < MAX_BULLETS; i++) {
            this.order[i] = i;
        }
    }

    // The slot of a new bullet, -1 when they're all in use
    add(
        x: number,
        y: number,
        vx: number,
        vy: number,
        turn: number,
        radius: number,
        damage: number,
        life: number,
        source: number,
        tick: number,
    ): number {
        if (this.count === MAX_BULLETS) {
            return -1;
        }
        const slot = this.order[this.count++];
        this.x[slot] = this.prevX[slot] = x;
        this.y[slot] = this.prevY[slot] = y;
        this.vx[slot] = vx;
        this.vy[slot] = vy;
        this.turnCos[slot] = fm.cos(turn);
        this.turnSin[slot] = fm.sin(turn);
        this.radius[slot] = radius;
        this.damage[slot] = damage;
        this.life[slot] = life;
        this.source[slot] = source;
        this.startTick[slot] = tick;
        return slot;
    }

    // Moves them all a tick. Each target is hit by one at most, whose slot ends
    // up in hits (-1 for none); the rest still move, and one that hit is spent.
    // A spared target can't be hit, and they pass straight through it rather
    // than being used up.
    step(targets: readonly BulletTarget[]): void {
        const { x, y, prevX, prevY, vx, vy, turnCos, turnSin, radius, life, order, hits } = this;
        hits.length = targets.length;
        hits.fill(-1);
        let i = 0;
        while (i < this.count) {
            const slot = order[i];
            prevX[slot] = x[slot];
            prevY[slot] = y[slot];
            const cos = turnCos[slot];
            if (cos !== 1) {
                const sin = turnSin[slot];
                const nextVx = vx[slot] * cos - vy[slot] * sin;
                vy[slot] = vx[slot] * sin + vy[slot] * cos;
                vx[slot] = nextVx;
            }
            x[slot] += vx[slot];
            y[slot] += vy[slot];
            life[slot]--;
            // The first of them it reaches that it hasn't hit yet this tick
            for (let t = 0; t < targets.length; t++) {
                const target = targets[t];
                if (hits[t] !== -1 || target.spare) {
                    continue;
                }
                const dx = target.x - x[slot];
                const dy = target.y - y[slot];
                const reach = radius[slot] + target.radius;
                if (dx * dx + dy * dy <= reach * reach) {
                    hits[t] = slot;
                    life[slot] = 0;
                    break;
                }
            }
            if (life[slot] <= 0) {
                this.removeAt(i);
            } else {
                i++;
            }
        }
    }

    clear(): void {
        this.count = 0;
    }

    // Swaps the last one in use into its place, so its slot's free
    private removeAt(index: number): void {
        const slot = this.order[index];
        this.order[index] = this.order[--this.count];
        this.order[this.count] = slot;
    }
}
