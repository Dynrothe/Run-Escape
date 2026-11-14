import { ModelData } from "../ModelData";

// Faces a model draws over others by render priority (a skill cape's emblem, a chainbody's rings)
// can sit a little behind the cloth they're drawn on. The client paints a model's faces in
// priority order, so it shows them anyway, but under a depth test the cloth hides them. Each such
// face that shares no corner with a lower-priority face is moved out along its normal to just in
// front of the face hiding it, its corners going together where its neighbours move too.

// Model units: a face that would have to come further than this isn't a decal on what hides it
// (an eye set deep in a mask), and its corners stay where they are
const MAX_LIFT = 6;
// How far behind it looks for what hides a face
const SEARCH = 16;
// How far in front of what hides it it ends up
const CLEAR = 1;
// Nearer than this it lies on it, and the shader's priority nudge is enough (actor.vert.glsl)
const TOUCHING = 0.05;
// Priorities 10 and 11 the client draws later still, by depth among themselves: left as they are
const LATE_PRIORITY = 10;
// Faces whose normals are closer than this (a cosine) face the same way
const SAME_WAY = 0.5;
// Rounds of keeping corners still where a move would turn a face over
const SETTLE_ROUNDS = 8;

// Moves the hidden decals forward, and says how many faces it moved
export function liftDecals(model: ModelData): number {
    const priorities = model.faceRenderPriorities;
    if (!priorities) {
        return 0;
    }
    const faces = model.faceCount;
    const vertices = model.verticesCount;
    const X = model.verticesX;
    const Y = model.verticesY;
    const Z = model.verticesZ;
    const A = model.indices1;
    const B = model.indices2;
    const C = model.indices3;
    const types = model.faceRenderTypes;
    const alphas = model.faceAlphas;
    // A face the model never draws hides nothing
    const drawn = (f: number) => types?.[f] !== 2 && alphas?.[f] !== -1;
    const normals = faceNormals(model);
    // A face with no area has no normal: it goes where its corners go
    const flat = (f: number) =>
        normals[f * 3] === 0 && normals[f * 3 + 1] === 0 && normals[f * 3 + 2] === 0;

    // The lowest priority of a face on each vertex
    const lowest = new Int8Array(vertices).fill(127);
    for (let f = 0; f < faces; f++) {
        const p = priorities[f];
        for (const v of [A[f], B[f], C[f]]) {
            if (p < lowest[v]) {
                lowest[v] = p;
            }
        }
    }

    // How far each face has to come: from its middle along its normal, the nearest face of a lower
    // priority facing the same way that's crossed, and a little past it
    const bounds = faceBounds(model);
    const lifts = new Float64Array(faces);
    // Corners that stay where they are: a face hidden too deep keeps its own
    const pinned = new Uint8Array(vertices);
    let any = false;
    for (let f = 0; f < faces; f++) {
        const p = priorities[f];
        if (p <= 0 || p >= LATE_PRIORITY || !drawn(f) || flat(f)) {
            continue;
        }
        if (lowest[A[f]] < p || lowest[B[f]] < p || lowest[C[f]] < p) {
            continue;
        }
        const ox = (X[A[f]] + X[B[f]] + X[C[f]]) / 3;
        const oy = (Y[A[f]] + Y[B[f]] + Y[C[f]]) / 3;
        const oz = (Z[A[f]] + Z[B[f]] + Z[C[f]]) / 3;
        const dx = normals[f * 3];
        const dy = normals[f * 3 + 1];
        const dz = normals[f * 3 + 2];
        const minX = Math.min(ox, ox + dx * SEARCH);
        const maxX = Math.max(ox, ox + dx * SEARCH);
        const minY = Math.min(oy, oy + dy * SEARCH);
        const maxY = Math.max(oy, oy + dy * SEARCH);
        const minZ = Math.min(oz, oz + dz * SEARCH);
        const maxZ = Math.max(oz, oz + dz * SEARCH);
        let nearest = Infinity;
        for (let g = 0; g < faces; g++) {
            if (priorities[g] >= p || !drawn(g)) {
                continue;
            }
            if (
                bounds[g * 6] > maxX ||
                bounds[g * 6 + 1] < minX ||
                bounds[g * 6 + 2] > maxY ||
                bounds[g * 6 + 3] < minY ||
                bounds[g * 6 + 4] > maxZ ||
                bounds[g * 6 + 5] < minZ
            ) {
                continue;
            }
            if (
                normals[g * 3] * dx + normals[g * 3 + 1] * dy + normals[g * 3 + 2] * dz <
                SAME_WAY
            ) {
                continue;
            }
            const t = crossing(model, g, ox, oy, oz, dx, dy, dz);
            if (t > TOUCHING && t <= SEARCH && t < nearest) {
                nearest = t;
            }
        }
        if (nearest === Infinity) {
            continue;
        }
        const lift = Math.ceil(nearest) + CLEAR;
        if (lift <= MAX_LIFT) {
            lifts[f] = lift;
            any = true;
        } else {
            pinned[A[f]] = pinned[B[f]] = pinned[C[f]] = 1;
        }
    }
    if (!any) {
        return 0;
    }

    // Each corner moves along its lifted faces' normals put together, far enough that each of
    // them comes its lift forward. A corner they pull apart (a fold) stays.
    const sums = new Float64Array(vertices * 3);
    for (let f = 0; f < faces; f++) {
        if (lifts[f] === 0) {
            continue;
        }
        for (const v of [A[f], B[f], C[f]]) {
            sums[v * 3] += normals[f * 3];
            sums[v * 3 + 1] += normals[f * 3 + 1];
            sums[v * 3 + 2] += normals[f * 3 + 2];
        }
    }
    const moves = new Float64Array(vertices);
    for (let f = 0; f < faces; f++) {
        if (lifts[f] === 0) {
            continue;
        }
        for (const v of [A[f], B[f], C[f]]) {
            const length = Math.hypot(sums[v * 3], sums[v * 3 + 1], sums[v * 3 + 2]);
            const along =
                length === 0
                    ? 0
                    : (sums[v * 3] * normals[f * 3] +
                          sums[v * 3 + 1] * normals[f * 3 + 1] +
                          sums[v * 3 + 2] * normals[f * 3 + 2]) /
                      length;
            if (along < SAME_WAY) {
                pinned[v] = 1;
            } else {
                moves[v] = Math.max(moves[v], lifts[f] / along);
            }
        }
    }

    // Where each corner would go, settled until no face it's on turns over: a face that would
    // keeps its corners still, and the rest move again without them
    const movedX = new Int32Array(vertices);
    const movedY = new Int32Array(vertices);
    const movedZ = new Int32Array(vertices);
    const moving = (v: number) => moves[v] > 0 && !pinned[v];
    for (let round = 0; ; round++) {
        for (let v = 0; v < vertices; v++) {
            movedX[v] = X[v];
            movedY[v] = Y[v];
            movedZ[v] = Z[v];
            if (moving(v)) {
                const scale = moves[v] / Math.hypot(sums[v * 3], sums[v * 3 + 1], sums[v * 3 + 2]);
                movedX[v] += Math.round(sums[v * 3] * scale);
                movedY[v] += Math.round(sums[v * 3 + 1] * scale);
                movedZ[v] += Math.round(sums[v * 3 + 2] * scale);
            }
        }
        let settled = true;
        for (let f = 0; f < faces; f++) {
            if (flat(f) || !(moving(A[f]) || moving(B[f]) || moving(C[f]))) {
                continue;
            }
            const n = normalOf(movedX, movedY, movedZ, A[f], B[f], C[f]);
            if (
                n[0] * normals[f * 3] + n[1] * normals[f * 3 + 1] + n[2] * normals[f * 3 + 2] <
                SAME_WAY
            ) {
                pinned[A[f]] = pinned[B[f]] = pinned[C[f]] = 1;
                settled = false;
            }
        }
        if (settled) {
            break;
        }
        if (round === SETTLE_ROUNDS - 1) {
            // Still turning faces over: nothing moves
            return 0;
        }
    }

    let lifted = 0;
    for (let f = 0; f < faces; f++) {
        if (lifts[f] > 0 && (moving(A[f]) || moving(B[f]) || moving(C[f]))) {
            lifted++;
        }
    }
    for (let v = 0; v < vertices; v++) {
        if (moving(v)) {
            X[v] = movedX[v];
            Y[v] = movedY[v];
            Z[v] = movedZ[v];
        }
    }
    if (lifted > 0) {
        model.invalidate();
    }
    return lifted;
}

function normalOf(
    X: Int32Array,
    Y: Int32Array,
    Z: Int32Array,
    a: number,
    b: number,
    c: number,
): [number, number, number] {
    const ux = X[b] - X[a];
    const uy = Y[b] - Y[a];
    const uz = Z[b] - Z[a];
    const wx = X[c] - X[a];
    const wy = Y[c] - Y[a];
    const wz = Z[c] - Z[a];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const length = Math.hypot(nx, ny, nz);
    return length === 0 ? [0, 0, 0] : [nx / length, ny / length, nz / length];
}

// Each face's unit normal
function faceNormals(model: ModelData): Float64Array {
    const normals = new Float64Array(model.faceCount * 3);
    for (let f = 0; f < model.faceCount; f++) {
        const [nx, ny, nz] = normalOf(
            model.verticesX,
            model.verticesY,
            model.verticesZ,
            model.indices1[f],
            model.indices2[f],
            model.indices3[f],
        );
        normals[f * 3] = nx;
        normals[f * 3 + 1] = ny;
        normals[f * 3 + 2] = nz;
    }
    return normals;
}

// Each face's box: min and max x, y, z
function faceBounds(model: ModelData): Float64Array {
    const X = model.verticesX;
    const Y = model.verticesY;
    const Z = model.verticesZ;
    const bounds = new Float64Array(model.faceCount * 6);
    for (let f = 0; f < model.faceCount; f++) {
        const a = model.indices1[f];
        const b = model.indices2[f];
        const c = model.indices3[f];
        bounds[f * 6] = Math.min(X[a], X[b], X[c]);
        bounds[f * 6 + 1] = Math.max(X[a], X[b], X[c]);
        bounds[f * 6 + 2] = Math.min(Y[a], Y[b], Y[c]);
        bounds[f * 6 + 3] = Math.max(Y[a], Y[b], Y[c]);
        bounds[f * 6 + 4] = Math.min(Z[a], Z[b], Z[c]);
        bounds[f * 6 + 5] = Math.max(Z[a], Z[b], Z[c]);
    }
    return bounds;
}

// Where a ray from o along d crosses face g, as a distance along it (Möller–Trumbore), or -1
function crossing(
    model: ModelData,
    g: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
): number {
    const X = model.verticesX;
    const Y = model.verticesY;
    const Z = model.verticesZ;
    const a = model.indices1[g];
    const b = model.indices2[g];
    const c = model.indices3[g];
    const e1x = X[b] - X[a];
    const e1y = Y[b] - Y[a];
    const e1z = Z[b] - Z[a];
    const e2x = X[c] - X[a];
    const e2y = Y[c] - Y[a];
    const e2z = Z[c] - Z[a];
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) {
        return -1;
    }
    const inverse = 1 / det;
    const tx = ox - X[a];
    const ty = oy - Y[a];
    const tz = oz - Z[a];
    const u = (tx * px + ty * py + tz * pz) * inverse;
    if (u < 0 || u > 1) {
        return -1;
    }
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inverse;
    if (v < 0 || u + v > 1) {
        return -1;
    }
    return (e2x * qx + e2y * qy + e2z * qz) * inverse;
}
