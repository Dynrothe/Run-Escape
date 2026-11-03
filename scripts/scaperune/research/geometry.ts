// Geometry the research scripts share that needs no cache, so it can be tested on its own:
// how one-sided a model is, what the play camera sees, and the heaviest places in a sum.

// How much a model's faces point one way across the ground: the length of the sum of their
// area-weighted normals, flat, over the sum of their areas. 0 for anything closed, near 1 for a
// single face standing up.
export function getOpenness(model: {
    faceCount: number;
    verticesX: ArrayLike<number>;
    verticesY: ArrayLike<number>;
    verticesZ: ArrayLike<number>;
    indices1: ArrayLike<number>;
    indices2: ArrayLike<number>;
    indices3: ArrayLike<number>;
}): number {
    let sumX = 0;
    let sumZ = 0;
    let total = 0;
    for (let face = 0; face < model.faceCount; face++) {
        const a = model.indices1[face];
        const b = model.indices2[face];
        const c = model.indices3[face];
        const ux = model.verticesX[b] - model.verticesX[a];
        const uy = model.verticesY[b] - model.verticesY[a];
        const uz = model.verticesZ[b] - model.verticesZ[a];
        const vx = model.verticesX[c] - model.verticesX[a];
        const vy = model.verticesY[c] - model.verticesY[a];
        const vz = model.verticesZ[c] - model.verticesZ[a];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        sumX += nx;
        sumZ += nz;
        total += Math.hypot(nx, ny, nz);
    }
    return total > 0 ? Math.hypot(sumX, sumZ) / total : 0;
}

// The play camera, as GameClient sets it: pitch in RS angle units (-512 looks straight down),
// distance in tiles from the player, the vertical field of view in degrees, and the screen's
// width over its height
export type ViewCamera = { pitch: number; distance: number; fov: number; aspect: number };

// Whether a box is in the camera's view when it looks at a player on flat ground at 0,0 from
// the south: x east and y north, in tiles from the player, and its top in tiles up. As the
// renderer culls (CullGrid), a box is out only if every corner of it is past one side of the view.
export function createViewTest(
    camera: ViewCamera,
): (x0: number, y0: number, x1: number, y1: number, top: number) => boolean {
    const pitch = (-camera.pitch * Math.PI * 2) / 2048;
    const sin = Math.sin(pitch);
    const cos = Math.cos(pitch);
    // The camera, behind the player and above: forward is down and north, up is up and north
    const eyeY = -camera.distance * cos;
    const eyeH = camera.distance * sin;
    const tanUp = Math.tan((camera.fov * Math.PI) / 360);
    const tanAcross = tanUp * camera.aspect;
    return (x0, y0, x1, y1, top) => {
        let left = 0;
        let right = 0;
        let below = 0;
        let above = 0;
        let behind = 0;
        for (const x of [x0, x1]) {
            for (const y of [y0, y1]) {
                for (const h of [0, top]) {
                    const north = y - eyeY;
                    const up = h - eyeH;
                    const depth = north * cos - up * sin;
                    const high = north * sin + up * cos;
                    if (depth <= 0.1) behind++;
                    if (x < -depth * tanAcross) left++;
                    if (x > depth * tanAcross) right++;
                    if (high < -depth * tanUp) below++;
                    if (high > depth * tanUp) above++;
                }
            }
        }
        return left < 8 && right < 8 && below < 8 && above < 8 && behind < 8;
    };
}

// The heaviest tiles of a sum, each at least `apart` tiles (both ways) from a heavier one picked
// before it, only where `allowed` says (all tiles if not given)
export function pickPeaks(
    sums: ArrayLike<number>,
    sizeX: number,
    count: number,
    apartX: number,
    apartY: number,
    allowed?: (x: number, y: number) => boolean,
): { x: number; y: number; sum: number }[] {
    const order = Array.from({ length: sums.length }, (_, i) => i)
        .filter((i) => !allowed || allowed(i % sizeX, Math.floor(i / sizeX)))
        .sort((a, b) => sums[b] - sums[a]);
    const peaks: { x: number; y: number; sum: number }[] = [];
    for (const i of order) {
        if (peaks.length >= count) {
            break;
        }
        const x = i % sizeX;
        const y = Math.floor(i / sizeX);
        if (peaks.every((p) => Math.abs(p.x - x) >= apartX || Math.abs(p.y - y) >= apartY)) {
            peaks.push({ x, y, sum: sums[i] });
        }
    }
    return peaks;
}
