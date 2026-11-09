import { SCABARAS } from "./tombs";

// The Scabaras room's puzzle helper (DisplaySettings.puzzleHelper), as the Tombs of Amascut plugin
// players use in OSRS: what to step on for Lights out and Addition. Worked out from the room as it
// is (Sim's ScabarasRoom); GameView draws it.

type Plate = { x: number; y: number };

// Lights out: the fewest plates to step on to light the whole ring, each toggling itself and its
// two neighbours (Sim.toggleScabarasLight). None when it's lit; every plate's tried both ways, as
// there are only eight. Kept by ring, as it's asked every frame.
export function solveScabarasLights(lights: readonly boolean[]): readonly number[] {
    let ring = lights.length;
    for (let i = 0; i < lights.length; i++) {
        if (lights[i]) {
            ring += 2 ** (i + 8);
        }
    }
    let solution = lightsSolutions.get(ring);
    if (!solution) {
        solution = searchScabarasLights(lights);
        lightsSolutions.set(ring, solution);
    }
    return solution;
}

// By ring: its size, and from bit 8 up, which are lit
const lightsSolutions = new Map<number, number[]>();

function searchScabarasLights(lights: readonly boolean[]): number[] {
    const count = lights.length;
    let best: number[] | undefined;
    for (let mask = 0; mask < 1 << count; mask++) {
        const on = [...lights];
        const presses: number[] = [];
        for (let i = 0; i < count; i++) {
            if (mask & (1 << i)) {
                presses.push(i);
                for (const j of [i - 1, i, i + 1]) {
                    const at = (j + count) % count;
                    on[at] = !on[at];
                }
            }
        }
        if (on.every((lit) => lit) && (!best || presses.length < best.length)) {
            best = presses;
        }
    }
    return best ?? [];
}

// Plates that touch, a diagonal included (a diagonal step crosses neither plate beside it), by
// where they are on the floor
function touching(a: Plate, b: Plate): boolean {
    return a !== b && Math.abs(a.x - b.x) <= 1.5 && Math.abs(a.y - b.y) <= 1.5;
}

// Addition on OSRS's own board (SCABARAS.additionBoard, plates in its order): for each number the
// tablet can show, the fewest symbols that make it, touching one another and one on the board's
// edge. Worked out once by searchScabarasAddition and kept here, so the helper costs nothing to
// draw; the tests check each against the board.
export const SCABARAS_ADDITION_WAYS: Record<number, readonly number[]> = {
    20: [2, 7, 13],
    21: [10, 16, 22],
    22: [10, 16, 20],
    23: [19, 22, 23],
    24: [7, 13, 19],
    25: [0, 1, 7, 13],
    26: [2, 7, 13, 17],
    27: [10, 16, 17, 22],
    28: [3, 7, 13, 19],
    29: [2, 7, 13, 19],
    30: [10, 16, 20, 22],
    31: [0, 1, 7, 13, 17],
    32: [0, 5, 10, 16, 22],
    33: [0, 5, 10, 16, 20],
    34: [0, 1, 7, 13, 19],
    35: [2, 7, 13, 17, 19],
    36: [10, 16, 17, 20, 22],
    37: [10, 16, 20, 21, 22],
    38: [7, 13, 17, 19, 22],
    39: [19, 20, 21, 22, 23],
    40: [0, 1, 7, 13, 17, 19],
    41: [0, 5, 10, 16, 20, 22],
    42: [2, 7, 13, 17, 19, 21],
    43: [2, 7, 13, 17, 19, 22],
    44: [10, 13, 16, 17, 19, 20],
    45: [10, 16, 19, 20, 22, 23],
};

// Addition after a first step off the board's own way, onto an edge symbol (the commonest way
// off it): by that symbol, then the number, the fewest that make it from there. Worked out once,
// with no cap on the search, and checked in the tests: every one has a way.
export const SCABARAS_ADDITION_FROM: Record<number, Record<number, readonly number[]>> = {
    0: {
        20: [0, 1, 5, 7],
        21: [0, 1, 7, 12],
        22: [0, 1, 3, 7],
        23: [0, 1, 2, 7],
        24: [0, 5, 10, 16],
        26: [0, 1, 6, 7, 10],
        27: [0, 1, 5, 7, 10],
        28: [0, 1, 7, 11, 16],
        29: [0, 1, 3, 7, 13],
        30: [0, 1, 2, 7, 13],
        35: [0, 1, 6, 7, 13, 19],
        36: [0, 1, 5, 7, 13, 19],
        37: [0, 1, 7, 11, 16, 20],
        38: [0, 1, 3, 7, 13, 19],
        39: [0, 1, 2, 7, 13, 19],
        42: [0, 1, 5, 7, 10, 16, 20],
        43: [0, 1, 5, 7, 10, 13, 19],
        44: [0, 1, 2, 7, 13, 14, 19],
        45: [0, 1, 2, 7, 13, 17, 19],
    },
    1: {
        20: [0, 1, 5, 7],
        21: [0, 1, 7, 12],
        22: [0, 1, 3, 7],
        23: [0, 1, 2, 7],
        24: [0, 1, 2, 5, 10],
        26: [0, 1, 6, 7, 10],
        27: [0, 1, 5, 7, 10],
        28: [0, 1, 7, 11, 16],
        29: [0, 1, 3, 7, 13],
        30: [0, 1, 2, 7, 13],
        32: [0, 1, 2, 5, 7, 10],
        33: [0, 1, 5, 7, 10, 16],
        35: [0, 1, 6, 7, 13, 19],
        36: [0, 1, 5, 7, 13, 19],
        37: [0, 1, 7, 11, 16, 20],
        38: [0, 1, 3, 7, 13, 19],
        39: [0, 1, 2, 7, 13, 19],
        41: [0, 1, 2, 5, 7, 13, 19],
        42: [0, 1, 5, 7, 10, 16, 20],
        43: [0, 1, 5, 7, 10, 13, 19],
        44: [0, 1, 2, 7, 13, 14, 19],
        45: [0, 1, 2, 7, 13, 17, 19],
    },
    2: {
        21: [1, 2, 7, 13],
        22: [0, 2, 6, 10],
        23: [0, 1, 2, 7],
        24: [2, 3, 7, 13],
        25: [2, 7, 13, 14],
        27: [0, 1, 2, 3, 7],
        28: [2, 3, 7, 9, 13],
        30: [0, 1, 2, 7, 13],
        31: [2, 7, 8, 13, 19],
        32: [2, 7, 11, 16, 20],
        33: [2, 3, 7, 13, 19],
        34: [2, 7, 13, 14, 19],
        36: [0, 1, 2, 7, 13, 17],
        37: [2, 3, 7, 9, 13, 19],
        38: [2, 3, 7, 13, 14, 19],
        39: [0, 1, 2, 7, 13, 19],
        40: [2, 7, 10, 11, 13, 19],
        41: [2, 7, 13, 16, 17, 19],
        44: [0, 1, 2, 7, 13, 14, 19],
        45: [0, 1, 2, 7, 13, 17, 19],
    },
    3: {
        20: [2, 3, 4, 7],
        21: [2, 3, 7, 9],
        22: [3, 4, 7, 13],
        23: [3, 7, 9, 13],
        24: [2, 3, 7, 13],
        25: [3, 7, 13, 17],
        26: [0, 2, 3, 6, 10],
        27: [0, 1, 2, 3, 7],
        29: [2, 3, 7, 13, 14],
        30: [2, 3, 7, 13, 17],
        31: [3, 4, 7, 13, 19],
        32: [3, 7, 9, 13, 19],
        33: [2, 3, 7, 13, 19],
        34: [3, 7, 13, 17, 19],
        35: [2, 3, 7, 8, 13, 19],
        36: [2, 3, 4, 7, 13, 19],
        37: [2, 3, 7, 9, 13, 19],
        38: [2, 3, 7, 13, 14, 19],
        39: [2, 3, 7, 13, 17, 19],
        40: [3, 7, 13, 16, 17, 19],
        41: [3, 7, 13, 17, 19, 21],
        42: [3, 7, 13, 17, 19, 22],
        43: [0, 1, 2, 3, 7, 13, 19],
        44: [2, 3, 7, 10, 11, 13, 19],
        45: [2, 3, 7, 13, 16, 17, 19],
    },
    4: {
        20: [2, 3, 4, 7],
        21: [4, 8, 13, 19],
        22: [3, 4, 7, 13],
        23: [4, 9, 13, 19],
        24: [2, 3, 4, 7, 9],
        25: [0, 1, 3, 4, 7],
        26: [3, 4, 7, 9, 13],
        27: [2, 3, 4, 7, 13],
        28: [3, 4, 7, 13, 17],
        29: [4, 7, 8, 13, 19],
        30: [0, 1, 2, 3, 4, 7],
        31: [3, 4, 7, 13, 19],
        32: [2, 3, 4, 7, 13, 14],
        33: [2, 3, 4, 7, 13, 17],
        34: [3, 4, 7, 11, 16, 20],
        35: [3, 4, 7, 9, 13, 19],
        36: [2, 3, 4, 7, 13, 19],
        37: [3, 4, 7, 13, 17, 19],
        38: [2, 3, 4, 7, 8, 13, 19],
        39: [2, 3, 4, 7, 11, 16, 20],
        40: [2, 3, 4, 7, 9, 13, 19],
        41: [2, 3, 4, 7, 13, 14, 19],
        42: [2, 3, 4, 7, 13, 17, 19],
        43: [3, 4, 7, 13, 16, 17, 19],
        44: [3, 4, 7, 13, 17, 19, 21],
        45: [3, 4, 7, 13, 17, 19, 22],
    },
    5: {
        20: [0, 1, 5, 7],
        21: [0, 5, 10, 15],
        22: [0, 5, 10, 11],
        23: [0, 5, 7, 11],
        24: [0, 5, 10, 16],
        25: [0, 1, 2, 5, 7],
        26: [0, 5, 7, 11, 12],
        27: [0, 1, 5, 7, 10],
        28: [0, 5, 10, 11, 16],
        29: [0, 5, 7, 11, 16],
        30: [0, 5, 7, 10, 11],
        31: [0, 5, 10, 16, 21],
        34: [0, 1, 5, 7, 10, 13],
        35: [0, 5, 10, 11, 16, 21],
        36: [0, 1, 5, 7, 13, 19],
        37: [0, 5, 10, 11, 16, 20],
        38: [0, 5, 10, 16, 17, 22],
        39: [0, 5, 10, 16, 17, 20],
        40: [0, 5, 10, 16, 20, 21],
        42: [0, 1, 5, 7, 10, 16, 20],
        43: [0, 1, 5, 7, 10, 13, 19],
        44: [0, 5, 7, 10, 11, 16, 22],
        45: [0, 5, 7, 10, 11, 16, 20],
    },
    9: {
        20: [9, 13, 19],
        21: [2, 3, 7, 9],
        22: [3, 9, 14, 19],
        23: [3, 7, 9, 13],
        24: [3, 9, 13, 19],
        25: [9, 13, 14, 19],
        26: [9, 13, 17, 19],
        27: [2, 3, 9, 14, 19],
        28: [7, 9, 13, 19],
        29: [2, 3, 9, 13, 19],
        30: [3, 7, 9, 14, 19],
        31: [4, 7, 9, 13, 19],
        32: [3, 7, 9, 13, 19],
        33: [7, 9, 13, 14, 19],
        34: [7, 9, 13, 17, 19],
        35: [2, 3, 7, 9, 14, 19],
        36: [3, 7, 9, 11, 13, 19],
        37: [2, 3, 7, 9, 13, 19],
        38: [3, 7, 9, 13, 17, 19],
        39: [7, 9, 13, 14, 17, 19],
        40: [7, 9, 13, 16, 17, 19],
        41: [7, 9, 13, 17, 19, 21],
        42: [7, 9, 13, 17, 19, 22],
        43: [2, 3, 7, 9, 13, 17, 19],
        44: [3, 7, 9, 13, 16, 17, 19],
        45: [3, 7, 9, 13, 17, 19, 21],
    },
    10: {
        20: [10, 16, 21],
        23: [5, 10, 16, 22],
        24: [0, 5, 10, 16],
        25: [0, 6, 7, 10],
        26: [10, 11, 16, 20],
        28: [10, 16, 17, 20],
        29: [10, 16, 20, 21],
        31: [0, 5, 10, 16, 21],
        34: [7, 10, 11, 16, 20],
        35: [7, 10, 11, 13, 19],
        38: [0, 5, 10, 16, 17, 22],
        39: [0, 5, 10, 16, 17, 20],
        40: [0, 5, 10, 16, 20, 21],
        42: [7, 10, 11, 16, 20, 22],
        43: [10, 16, 17, 20, 21, 22],
    },
    14: {
        20: [7, 13, 14],
        21: [13, 14, 19],
        22: [7, 8, 13, 14],
        23: [8, 13, 14, 19],
        24: [7, 8, 14, 19],
        25: [9, 13, 14, 19],
        26: [7, 13, 14, 17],
        27: [13, 14, 17, 19],
        28: [14, 19, 22, 23],
        29: [7, 13, 14, 19],
        30: [7, 8, 14, 19, 23],
        31: [7, 8, 13, 14, 19],
        32: [9, 14, 19, 22, 23],
        33: [7, 9, 13, 14, 19],
        34: [2, 7, 13, 14, 19],
        35: [7, 13, 14, 17, 19],
        36: [2, 7, 8, 13, 14, 19],
        37: [7, 8, 13, 14, 17, 19],
        38: [7, 8, 14, 19, 22, 23],
        39: [7, 9, 13, 14, 17, 19],
        40: [2, 7, 13, 14, 17, 19],
        41: [7, 13, 14, 16, 17, 19],
        42: [7, 13, 14, 17, 19, 21],
        43: [7, 13, 14, 17, 19, 22],
        44: [14, 19, 20, 21, 22, 23],
        45: [7, 8, 13, 14, 17, 19, 22],
    },
    15: {
        20: [0, 6, 10, 15],
        21: [0, 5, 10, 15],
        22: [7, 10, 11, 15],
        23: [10, 11, 15, 20],
        24: [10, 15, 16, 22],
        25: [10, 15, 16, 20],
        26: [10, 15, 20, 21],
        27: [15, 20, 21, 22],
        28: [0, 5, 10, 15, 21],
        29: [0, 6, 10, 15, 20],
        30: [0, 5, 10, 15, 20],
        31: [7, 10, 11, 15, 20],
        32: [10, 15, 16, 20, 21],
        33: [10, 15, 16, 20, 22],
        34: [10, 15, 20, 21, 22],
        35: [0, 5, 10, 15, 16, 22],
        36: [0, 5, 10, 15, 16, 20],
        37: [0, 5, 10, 15, 20, 21],
        38: [7, 10, 11, 13, 15, 19],
        39: [10, 15, 16, 17, 20, 22],
        40: [10, 15, 16, 20, 21, 22],
        41: [15, 16, 19, 20, 22, 23],
        42: [15, 19, 20, 21, 22, 23],
        43: [0, 5, 10, 15, 16, 20, 21],
        44: [0, 5, 10, 15, 16, 20, 22],
        45: [0, 5, 10, 15, 20, 21, 22],
    },
    19: {
        20: [9, 13, 19],
        21: [13, 14, 19],
        22: [13, 17, 19],
        25: [1, 7, 13, 19],
        26: [7, 8, 13, 19],
        27: [7, 12, 13, 19],
        30: [7, 13, 17, 19],
        31: [1, 7, 13, 17, 19],
        32: [2, 7, 12, 13, 19],
        33: [2, 3, 7, 13, 19],
        36: [7, 13, 16, 17, 19],
        37: [7, 13, 17, 19, 21],
        41: [2, 7, 13, 16, 17, 19],
    },
    20: {
        20: [6, 10, 15, 20],
        21: [16, 17, 20],
        23: [16, 20, 22],
        24: [20, 21, 22],
        25: [10, 15, 16, 20],
        26: [10, 15, 20, 21],
        27: [15, 20, 21, 22],
        28: [10, 16, 17, 20],
        29: [10, 16, 20, 21],
        31: [7, 10, 11, 15, 20],
        32: [10, 15, 16, 20, 21],
        34: [10, 15, 20, 21, 22],
        35: [10, 16, 17, 20, 21],
        38: [16, 19, 20, 22, 23],
        40: [10, 15, 16, 20, 21, 22],
        42: [15, 19, 20, 21, 22, 23],
        43: [10, 16, 17, 20, 21, 22],
    },
    21: {
        20: [10, 16, 21],
        21: [16, 21, 22],
        22: [16, 20, 21],
        23: [10, 15, 16, 21],
        24: [20, 21, 22],
        25: [10, 15, 21, 22],
        26: [10, 15, 20, 21],
        27: [15, 20, 21, 22],
        28: [10, 16, 21, 22],
        29: [10, 16, 20, 21],
        30: [16, 20, 21, 22],
        31: [10, 15, 16, 21, 22],
        32: [10, 15, 16, 20, 21],
        33: [15, 16, 20, 21, 22],
        34: [10, 15, 20, 21, 22],
        35: [10, 16, 17, 20, 21],
        36: [16, 17, 20, 21, 22],
        38: [13, 17, 19, 20, 21],
        40: [10, 15, 16, 20, 21, 22],
        41: [13, 15, 17, 19, 20, 21],
        43: [10, 16, 17, 20, 21, 22],
        44: [13, 16, 17, 19, 20, 21],
        45: [16, 19, 20, 21, 22, 23],
    },
    22: {
        20: [16, 17, 22],
        22: [6, 10, 16, 22],
        24: [20, 21, 22],
        25: [10, 11, 16, 22],
        26: [7, 11, 16, 22],
        28: [10, 16, 21, 22],
        29: [16, 17, 20, 22],
        31: [0, 6, 10, 16, 22],
        33: [7, 10, 11, 16, 22],
        34: [10, 11, 16, 20, 22],
        35: [7, 11, 16, 20, 22],
        40: [0, 6, 10, 16, 20, 22],
        42: [7, 10, 11, 16, 20, 22],
        44: [7, 13, 16, 17, 20, 22],
    },
    23: {
        20: [17, 22, 23],
        21: [17, 19, 23],
        22: [13, 19, 23],
        24: [7, 11, 17, 23],
        25: [11, 17, 19, 23],
        26: [13, 17, 21, 23],
        27: [7, 13, 17, 23],
        28: [13, 17, 19, 23],
        29: [17, 19, 22, 23],
        30: [7, 13, 19, 23],
        31: [7, 11, 13, 17, 23],
        32: [7, 11, 17, 22, 23],
        33: [7, 11, 17, 19, 23],
        34: [7, 13, 17, 21, 23],
        35: [7, 13, 17, 22, 23],
        36: [7, 13, 17, 19, 23],
        37: [17, 19, 20, 21, 23],
        38: [7, 13, 19, 22, 23],
        40: [7, 11, 13, 17, 19, 23],
        41: [7, 11, 17, 19, 22, 23],
        42: [7, 13, 16, 17, 19, 23],
        43: [7, 13, 17, 19, 21, 23],
        44: [7, 13, 17, 19, 22, 23],
    },
    24: {
        20: [18, 19, 22, 24],
        21: [9, 13, 19, 24],
        22: [13, 14, 19, 24],
        23: [13, 17, 19, 24],
        24: [19, 22, 23, 24],
        25: [7, 13, 19, 24],
        26: [7, 13, 18, 22, 24],
        27: [7, 13, 18, 19, 24],
        28: [7, 12, 13, 19, 24],
        29: [3, 7, 13, 19, 24],
        30: [2, 7, 13, 19, 24],
        31: [7, 13, 17, 19, 24],
        32: [2, 7, 13, 18, 19, 24],
        33: [7, 13, 17, 18, 19, 24],
        34: [13, 18, 19, 21, 22, 24],
        35: [7, 13, 18, 19, 22, 24],
        36: [18, 19, 20, 21, 22, 24],
        37: [7, 13, 16, 17, 19, 24],
        38: [7, 13, 17, 19, 21, 24],
        39: [7, 13, 17, 19, 22, 24],
        40: [19, 20, 21, 22, 23, 24],
        41: [7, 13, 17, 18, 19, 22, 24],
        42: [7, 13, 18, 19, 21, 22, 24],
        43: [13, 18, 19, 20, 21, 22, 24],
        44: [2, 7, 13, 17, 19, 22, 24],
        45: [7, 13, 16, 17, 19, 22, 24],
    },
};

// Addition, for the helper: the symbols to have stepped on to make the target. Nothing stepped on
// yet, or only symbols on its way, it's the board's own way (SCABARAS_ADDITION_WAYS). Off it,
// it's grown from what's been stepped on (a symbol stepped on again adds nothing), searching no
// more than ADDITION_SEARCH groups so a frame never waits on it. Undefined when there's none to
// be found that way: going over resets the board, and a way from scratch is shown again.
// standing: the plate the hero's on, if any. Inside the board with nothing stepped on (the board
// reset under them, or it was dull when they walked on), the way starts beside them, since any
// step off it lands on a plate.
export function solveScabarasAddition(
    plates: readonly Plate[],
    values: readonly number[],
    target: number,
    stepped: readonly boolean[] = [],
    standing?: number,
): number[] | undefined {
    const start = plates.flatMap((_, i) => (stepped[i] ? [i] : []));
    const inside =
        start.length === 0 && standing !== undefined && !onEdge(plates, standing)
            ? standing
            : undefined;
    const reachable = (way: readonly number[]) =>
        inside === undefined || way.some((i) => touching(plates[i], plates[inside]));
    const own = sameBoardValues(values) ? SCABARAS_ADDITION_WAYS[target] : undefined;
    if (own) {
        if (start.every((i) => own.includes(i)) && reachable(own)) {
            return [...own];
        }
        // From a first step off it, onto an edge symbol: that one's way on, while it's kept to.
        // Any symbol stepped on may be that first one, so each is tried.
        for (const first of start) {
            const from = SCABARAS_ADDITION_FROM[first]?.[target];
            if (from && start.every((i) => from.includes(i))) {
                return [...from];
            }
        }
    }
    const key = `${values.join(",")}|${target}|${start.join(",")}|${inside ?? ""}`;
    if (!additionSolutions.has(key)) {
        if (additionSolutions.size > 500) {
            additionSolutions.clear();
        }
        additionSolutions.set(
            key,
            searchScabarasAddition(plates, values, target, start, ADDITION_SEARCH, inside),
        );
    }
    // None beside them within the cap: the board's own way, to thread out to between the plates
    // (a plate counts only well inside its tile)
    return additionSolutions.get(key) ?? (inside !== undefined && own ? [...own] : undefined);
}

// A plate on the board's edge: one that can be walked onto from off the board
function onEdge(plates: readonly Plate[], i: number): boolean {
    return plates.filter((q) => touching(plates[i], q)).length < 8;
}

const additionSolutions = new Map<string, number[] | undefined>();
// Groups tried at most in one search: about 10 ms at worst on a desktop, once per step
const ADDITION_SEARCH = 1000;

// The tables are by plate in OSRS's board's order, which is how every Scabaras room lays them
// out (Sim.layOutScabarasAddition): so a board with its values is the board
function sameBoardValues(values: readonly number[]): boolean {
    return (
        values.length === SCABARAS_BOARD.length && values.every((v, i) => v === SCABARAS_BOARD[i])
    );
}

const SCABARAS_BOARD = SCABARAS.additionBoard.map((symbol) => symbol + 1);

// The fewest symbols that make the target, touching one another and grown from start (or, with
// none, from one on the board's edge, walked onto from off it, or from one beside the plate
// stood on, inside): smallest groups first, so the first to add up is the fewest. limit: groups
// tried before giving up.
export function searchScabarasAddition(
    plates: readonly Plate[],
    values: readonly number[],
    target: number,
    start: readonly number[] = [],
    limit = ADDITION_SEARCH,
    inside?: number,
): number[] | undefined {
    const neighbours = plates.map((p) => plates.flatMap((q, j) => (touching(p, q) ? [j] : [])));
    const first = neighbours.map((n, i) =>
        inside === undefined ? n.length < 8 : neighbours[inside].includes(i),
    );
    const startSum = start.reduce((sum, i) => sum + values[i], 0);
    let layer: { set: number[]; sum: number }[] =
        start.length > 0
            ? startSum <= target
                ? [{ set: [...start], sum: startSum }]
                : []
            : plates.flatMap((_, i) =>
                  first[i] && values[i] <= target ? [{ set: [i], sum: values[i] }] : [],
              );
    const seen = new Set<string>();
    let tried = 0;
    while (layer.length > 0 && tried < limit) {
        const next: { set: number[]; sum: number }[] = [];
        for (const { set, sum } of layer) {
            if (sum === target) {
                return [...set].sort((a, b) => a - b);
            }
            if (++tried >= limit) {
                return undefined;
            }
            const grow = new Set(set.flatMap((i) => neighbours[i]));
            for (const j of grow) {
                if (set.includes(j) || sum + values[j] > target) {
                    continue;
                }
                const grown = [...set, j].sort((a, b) => a - b);
                const id = grown.join(",");
                if (!seen.has(id)) {
                    seen.add(id);
                    next.push({ set: grown, sum: sum + values[j] });
                }
            }
        }
        layer = next;
    }
    return undefined;
}
