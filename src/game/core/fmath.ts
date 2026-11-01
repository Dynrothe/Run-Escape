// The sim's trigonometry. Browsers are free to round Math.sin and the like
// differently in the last bit, which doesn't matter on your own but sends
// co-op's copies of a run apart: every player's browser runs the same sim from
// the same inputs, and they have to agree to the bit. usePortableMath swaps in
// versions built from + - * / and sqrt, which every engine rounds the same
// (the kernels are fdlibm's). Solo runs keep the browser's own.

type MathFns = {
    sin: (x: number) => number;
    cos: (x: number) => number;
    atan2: (y: number, x: number) => number;
    hypot: (x: number, y: number) => number;
    acos: (x: number) => number;
    // For whole-number exponents
    pow: (base: number, exponent: number) => number;
};

const NATIVE: MathFns = {
    sin: Math.sin,
    cos: Math.cos,
    atan2: Math.atan2,
    hypot: Math.hypot,
    acos: Math.acos,
    pow: Math.pow,
};

// pi/2 in two parts, so k * PIO2_HI is exact for the angles the sim uses
const PIO2_HI = 1.57079632673412561417;
const PIO2_LO = 6.07710050650619224932e-11;
const TWO_OVER_PI = 0.6366197723675814;

function sinKernel(x: number): number {
    const z = x * x;
    return (
        x +
        x *
            z *
            (-1.66666666666666324348e-1 +
                z *
                    (8.33333333332248946124e-3 +
                        z *
                            (-1.98412698298579493134e-4 +
                                z *
                                    (2.75573137070700676789e-6 +
                                        z *
                                            (-2.50507602534068634195e-8 +
                                                z * 1.58969099521155010221e-10)))))
    );
}

function cosKernel(x: number): number {
    const z = x * x;
    return (
        1 -
        z * 0.5 +
        z *
            z *
            (4.16666666666666019037e-2 +
                z *
                    (-1.38888888888741095749e-3 +
                        z *
                            (2.48015872894767294178e-5 +
                                z *
                                    (-2.75573143513906633035e-7 +
                                        z *
                                            (2.0875723212981748279e-9 +
                                                z * -1.13596475577881948265e-11)))))
    );
}

// x as a quarter turn count and what's left (within pi/4 either way)
function reduce(x: number): { quadrant: number; r: number } {
    const k = Math.round(x * TWO_OVER_PI);
    return { quadrant: ((k % 4) + 4) % 4, r: x - k * PIO2_HI - k * PIO2_LO };
}

function portableSin(x: number): number {
    const { quadrant, r } = reduce(x);
    switch (quadrant) {
        case 0:
            return sinKernel(r);
        case 1:
            return cosKernel(r);
        case 2:
            return -sinKernel(r);
        default:
            return -cosKernel(r);
    }
}

function portableCos(x: number): number {
    const { quadrant, r } = reduce(x);
    switch (quadrant) {
        case 0:
            return cosKernel(r);
        case 1:
            return -sinKernel(r);
        case 2:
            return -cosKernel(r);
        default:
            return sinKernel(r);
    }
}

const ATAN_HI = [
    4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
    1.570796326794896558,
];
const ATAN_LO = [
    2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
    6.12323399573676603587e-17,
];
const AT = [
    3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
    -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
    6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
    -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];

function portableAtan(value: number): number {
    const negative = value < 0;
    let x = negative ? -value : value;
    let id: number;
    if (x < 0.4375) {
        id = -1;
    } else if (x < 0.6875) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
    } else if (x < 1.1875) {
        id = 1;
        x = (x - 1) / (x + 1);
    } else if (x < 2.4375) {
        id = 2;
        x = (x - 1.5) / (1 + 1.5 * x);
    } else {
        id = 3;
        x = -1 / x;
    }
    const z = x * x;
    const w = z * z;
    const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    const result = id < 0 ? x - x * (s1 + s2) : ATAN_HI[id] - (x * (s1 + s2) - ATAN_LO[id] - x);
    return negative ? -result : result;
}

function portableAtan2(y: number, x: number): number {
    if (x === 0) {
        return y > 0 ? Math.PI / 2 : y < 0 ? -Math.PI / 2 : 0;
    }
    const z = portableAtan(Math.abs(y / x));
    if (x > 0) {
        return y < 0 ? -z : z;
    }
    return y < 0 ? z - Math.PI : Math.PI - z;
}

function portableHypot(x: number, y: number): number {
    return Math.sqrt(x * x + y * y);
}

function portableAcos(x: number): number {
    return portableAtan2(Math.sqrt((1 - x) * (1 + x)), x);
}

// Squaring and multiplying, the same steps everywhere
function portablePow(base: number, exponent: number): number {
    if (!Number.isInteger(exponent)) {
        return Math.pow(base, exponent);
    }
    let n = Math.abs(exponent);
    let result = 1;
    let square = base;
    while (n > 0) {
        if (n % 2 === 1) {
            result *= square;
        }
        square *= square;
        n = Math.floor(n / 2);
    }
    return exponent < 0 ? 1 / result : result;
}

const PORTABLE: MathFns = {
    sin: portableSin,
    cos: portableCos,
    atan2: portableAtan2,
    hypot: portableHypot,
    acos: portableAcos,
    pow: portablePow,
};

export const fm: MathFns = { ...NATIVE };

export function usePortableMath(portable: boolean): void {
    Object.assign(fm, portable ? PORTABLE : NATIVE);
}
