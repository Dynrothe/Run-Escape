// Small seeded random number generator (mulberry32), so a run can be replayed
// from its seed (balance simulations, tests).
export class Rng {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    // [0, 1)
    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(min: number, max: number): number {
        return min + (max - min) * this.next();
    }

    int(maxExclusive: number): number {
        return Math.floor(this.next() * maxExclusive);
    }

    chance(probability: number): boolean {
        return this.next() < probability;
    }

    pick<T>(items: readonly T[]): T {
        return items[this.int(items.length)];
    }

    // Picks by weight; returns -1 when every weight is zero.
    weightedIndex(weights: readonly number[]): number {
        let total = 0;
        for (const w of weights) {
            total += Math.max(w, 0);
        }
        if (total <= 0) {
            return -1;
        }
        let roll = this.next() * total;
        for (let i = 0; i < weights.length; i++) {
            roll -= Math.max(weights[i], 0);
            if (roll < 0) {
                return i;
            }
        }
        return weights.length - 1;
    }
}
