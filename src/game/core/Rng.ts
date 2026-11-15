// Small seeded random number generator (mulberry32), so a run can be replayed
// from its seed (balance simulations, tests).
export class Rng {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    // Where it's got to, for co-op's check that copies agree
    get position(): number {
        return this.state;
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

// [0, 1) from a few whole numbers, the same every time for the same ones, without drawing on an
// Rng: for choices that mustn't move a run's rolls (a floor's tiles, a polymorphed sheep's way).
// salt tells apart choices made from the same numbers.
export function hashChance(a: number, b: number, c: number, salt: number): number {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (b + 1) ^ (h >>> 13), 0xc2b2ae35);
    h = Math.imul(h ^ (c + 1) ^ (h >>> 16), 0x27d4eb2f);
    h = Math.imul(h ^ (salt + 7) ^ (h >>> 15), 0x165667b1);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
