// Geometry the research scripts share that needs no cache, so it can be tested on its own

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
