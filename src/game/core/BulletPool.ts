// A boss's bullets: hundreds at once, so they live in flat arrays rather than
// as objects, and a spent one's slot goes straight back to the free list. The
// tick allocates nothing, and the only thing a bullet tests against is the
// player.

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
        this.turnCos[slot] = Math.cos(turn);
        this.turnSin[slot] = Math.sin(turn);
        this.radius[slot] = radius;
        this.damage[slot] = damage;
        this.life[slot] = life;
        this.source[slot] = source;
        this.startTick[slot] = tick;
        return slot;
    }

    // Moves them all a tick. Returns the slot of one touching (px, py) with
    // radius pr, -1 for none; the rest still move, and one that hit is spent.
    // spare: true while the player can't be hit, when they pass straight
    // through rather than being used up.
    step(px: number, py: number, pr: number, spare: boolean): number {
        const { x, y, prevX, prevY, vx, vy, turnCos, turnSin, radius, life, order } = this;
        let hit = -1;
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
            const dx = px - x[slot];
            const dy = py - y[slot];
            const reach = radius[slot] + pr;
            if (hit === -1 && !spare && dx * dx + dy * dy <= reach * reach) {
                hit = slot;
                life[slot] = 0;
            }
            if (life[slot] <= 0) {
                this.removeAt(i);
            } else {
                i++;
            }
        }
        return hit;
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
