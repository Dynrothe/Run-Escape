// A hero's gaze as it's drawn (HeroAbilityDef kind "gaze"): how much of its light reaches each
// spot, from the same segments the sim spares what's behind (core/gazeSight.ts). A shadow map
// round the gaze: for each of BINS directions, how far its light gets before something stops it.
// A spot's light is soft over SOFT tiles either side of a shadow's edge, both along the light and
// across it, and half at the edge itself, which is where the sim's line falls.

const BINS = 1024;
const SOFT = 0.35;
// Directions looked along either side of a spot's own, for the soft edge across the light
const SPREAD = [-1, -0.5, 0, 0.5, 1];

export class GazeShade {
    private readonly far = new Float32Array(BINS);
    private fromX = 0;
    private fromY = 0;

    // From (fromX, fromY), with segments (x0, y0, x1, y1 each) in the way, out to reach tiles
    set(segments: readonly number[], fromX: number, fromY: number, reach: number): void {
        this.fromX = fromX;
        this.fromY = fromY;
        const far = this.far;
        far.fill(reach + 1);
        const step = (Math.PI * 2) / BINS;
        for (let i = 0; i < segments.length; i += 4) {
            const ax = segments[i] - fromX;
            const ay = segments[i + 1] - fromY;
            const bx = segments[i + 2] - fromX;
            const by = segments[i + 3] - fromY;
            // The directions it spans, the short way round
            let a0 = Math.atan2(ay, ax);
            let a1 = Math.atan2(by, bx);
            if (a1 < a0) {
                [a0, a1] = [a1, a0];
            }
            if (a1 - a0 > Math.PI) {
                [a0, a1] = [a1, a0 + Math.PI * 2];
            }
            const ex = bx - ax;
            const ey = by - ay;
            for (let k = Math.ceil(a0 / step); k <= Math.floor(a1 / step); k++) {
                const angle = k * step;
                const dx = Math.cos(angle);
                const dy = Math.sin(angle);
                const denom = dx * ey - dy * ex;
                if (denom === 0) {
                    continue;
                }
                const t = (ax * ey - ay * ex) / denom;
                const bin = ((k % BINS) + BINS) % BINS;
                if (t > 0 && t < far[bin]) {
                    far[bin] = t;
                }
            }
        }
    }

    // 0 to 1: how much of the gaze's light reaches (x, y)
    at(x: number, y: number): number {
        const dx = x - this.fromX;
        const dy = y - this.fromY;
        const d = Math.hypot(dx, dy);
        if (d < SOFT) {
            return 1;
        }
        const angle = Math.atan2(dy, dx);
        const across = SOFT / d;
        let lit = 0;
        for (const s of SPREAD) {
            const bin = Math.round(((angle + s * across) * BINS) / (Math.PI * 2));
            const past = this.far[((bin % BINS) + BINS) % BINS] - d;
            // smoothstep over -SOFT to SOFT
            const t = Math.min(1, Math.max(0, (past + SOFT) / (2 * SOFT)));
            lit += t * t * (3 - 2 * t);
        }
        return lit / SPREAD.length;
    }
}
