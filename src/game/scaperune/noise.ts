// Random numbers and noise that only depend on the seed. Maps must come out the
// same everywhere, so nothing here uses Math.random.

export type Rng = () => number;

// 0 up to 1 (mulberry32)
export function createRng(seed: number): Rng {
    let state = seed | 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type Noise = (x: number, y: number) => number;

// Smooth noise, about 0 to 1, a mix of up to three scales. Features are about 1
// apart; fewer scales means fewer small ones, for edges that should be smooth.
export function createNoise(seed: number, scales: 1 | 2 | 3 = 3): Noise {
    const hash = (x: number, y: number): number => {
        let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
    };
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const layer = (x: number, y: number): number => {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = smooth(x - ix);
        const fy = smooth(y - iy);
        const south = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
        const north = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
        return south + (north - south) * fy;
    };
    return (x, y) => {
        if (scales === 1) {
            return layer(x, y);
        }
        const two = layer(x, y) * 4 + layer(x * 2.1 + 7, y * 2.1 + 3) * 2;
        return scales === 2 ? two / 6 : (two + layer(x * 4.3 + 1, y * 4.3 + 9)) / 7;
    };
}

// Evens out a field, per grid point (3 by 3, a few times over), which takes off
// bumps too small to draw
export function smoothField(
    field: Float32Array,
    sizeX: number,
    sizeY: number,
    passes: number,
): Float32Array {
    let from = field;
    for (let pass = 0; pass < passes; pass++) {
        const to = new Float32Array(field.length);
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                let sum = 0;
                let count = 0;
                for (let ny = Math.max(y - 1, 0); ny <= Math.min(y + 1, sizeY - 1); ny++) {
                    for (let nx = Math.max(x - 1, 0); nx <= Math.min(x + 1, sizeX - 1); nx++) {
                        sum += from[nx + ny * sizeX];
                        count++;
                    }
                }
                to[x + y * sizeX] = sum / count;
            }
        }
        from = to;
    }
    return from;
}

// Tiles to the nearest set tile of a mask, out to a limit: two passes of a
// chamfer distance, which is close enough to round
export function distanceTo(
    mask: Uint8Array,
    sizeX: number,
    sizeY: number,
    limit: number,
): Float32Array {
    const distances = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        distances[i] = mask[i] ? 0 : limit;
    }
    const relax = (i: number, x: number, y: number, dx: number, dy: number, cost: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < sizeX && ny < sizeY) {
            distances[i] = Math.min(distances[i], distances[nx + ny * sizeX] + cost);
        }
    };
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            relax(i, x, y, -1, 0, 1);
            relax(i, x, y, 0, -1, 1);
            relax(i, x, y, -1, -1, 1.41);
            relax(i, x, y, 1, -1, 1.41);
        }
    }
    for (let y = sizeY - 1; y >= 0; y--) {
        for (let x = sizeX - 1; x >= 0; x--) {
            const i = x + y * sizeX;
            relax(i, x, y, 1, 0, 1);
            relax(i, x, y, 0, 1, 1);
            relax(i, x, y, 1, 1, 1.41);
            relax(i, x, y, -1, 1, 1.41);
        }
    }
    return distances;
}
