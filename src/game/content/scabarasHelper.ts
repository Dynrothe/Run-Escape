import { SCABARAS } from "./tombs";

// The Scabaras room's puzzle helper (DisplaySettings.puzzleHelper), as the Tombs of Amascut plugin
// players use in OSRS: what to step on for Lights out and Addition. Worked out from the room as it
// is (Sim's ScabarasRoom); GameView draws it.

type Plate = { x: number; y: number };

// Lights out: the fewest plates to step on to light the whole ring, each toggling itself and its
// two neighbours (Sim.toggleScabarasLight). None when it's lit; every plate's tried both ways, as
// there are only eight.
export function solveScabarasLights(lights: readonly boolean[]): number[] {
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

// Addition, for the helper: the symbols to have stepped on to make the target. Nothing stepped on
// yet, or only symbols on its way, it's the board's own way (SCABARAS_ADDITION_WAYS). Off it,
// it's grown from what's been stepped on (a symbol stepped on again adds nothing), searching no
// more than ADDITION_SEARCH groups so a frame never waits on it. Undefined when there's none to
// be found that way: going over resets the board, and the board's own way is shown again.
export function solveScabarasAddition(
    plates: readonly Plate[],
    values: readonly number[],
    target: number,
    stepped: readonly boolean[] = [],
): number[] | undefined {
    const start = plates.flatMap((_, i) => (stepped[i] ? [i] : []));
    const own = SCABARAS_ADDITION_WAYS[target];
    if (own && sameBoard(values) && start.every((i) => own.includes(i))) {
        return [...own];
    }
    const key = `${values.join(",")}|${target}|${start.join(",")}`;
    if (!additionSolutions.has(key)) {
        if (additionSolutions.size > 500) {
            additionSolutions.clear();
        }
        additionSolutions.set(key, searchScabarasAddition(plates, values, target, start));
    }
    return additionSolutions.get(key);
}

const additionSolutions = new Map<string, number[] | undefined>();
// Groups tried at most in one search: about 10 ms at worst on a desktop, once per step
const ADDITION_SEARCH = 1000;

function sameBoard(values: readonly number[]): boolean {
    return (
        values.length === SCABARAS_BOARD.length && values.every((v, i) => v === SCABARAS_BOARD[i])
    );
}

const SCABARAS_BOARD = SCABARAS.additionBoard.map((symbol) => symbol + 1);

// The fewest symbols that make the target, touching one another and grown from start (or, with
// none, from one on the board's edge, walked onto from off it): smallest groups first, so the
// first to add up is the fewest. limit: groups tried before giving up.
export function searchScabarasAddition(
    plates: readonly Plate[],
    values: readonly number[],
    target: number,
    start: readonly number[] = [],
    limit = ADDITION_SEARCH,
): number[] | undefined {
    const neighbours = plates.map((p) => plates.flatMap((q, j) => (touching(p, q) ? [j] : [])));
    const edge = neighbours.map((n) => n.length < 8);
    const startSum = start.reduce((sum, i) => sum + values[i], 0);
    let layer: { set: number[]; sum: number }[] =
        start.length > 0
            ? startSum <= target
                ? [{ set: [...start], sum: startSum }]
                : []
            : plates.flatMap((_, i) =>
                  edge[i] && values[i] <= target ? [{ set: [i], sum: values[i] }] : [],
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
