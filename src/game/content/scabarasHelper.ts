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

// Addition: the fewest symbols that add up to the target, all touching one another and one of
// them on the board's edge (walked onto from off it, and walked between without crossing any
// other). A symbol stepped on again adds nothing, so they needn't be one line. Part way through
// (stepped), it's grown from those already stepped on, so it says what to step on next from
// where they are. Undefined when none do. Each board, target and start is worked out once.
export function solveScabarasAddition(
    plates: readonly Plate[],
    values: readonly number[],
    target: number,
    stepped: readonly boolean[] = [],
): number[] | undefined {
    const start = plates.flatMap((_, i) => (stepped[i] ? [i] : []));
    const key = `${values.join(",")}|${target}|${start.join(",")}|${plates.map((p) => `${p.x},${p.y}`).join(";")}`;
    if (additionSolutions.has(key)) {
        return additionSolutions.get(key);
    }
    const neighbours = plates.map((p) => plates.flatMap((q, j) => (touching(p, q) ? [j] : [])));
    const edge = neighbours.map((n) => n.length < 8);
    // Grown a symbol at a time from each edge one, smallest groups first: the first to add up
    // is the fewest
    const startSum = start.reduce((sum, i) => sum + values[i], 0);
    let layer: { set: number[]; sum: number }[] =
        start.length > 0
            ? startSum <= target
                ? [{ set: start, sum: startSum }]
                : []
            : plates.flatMap((_, i) =>
                  edge[i] && values[i] <= target ? [{ set: [i], sum: values[i] }] : [],
              );
    const seen = new Set<string>();
    let found: number[] | undefined;
    while (layer.length > 0 && !found) {
        const next: { set: number[]; sum: number }[] = [];
        for (const { set, sum } of layer) {
            if (sum === target) {
                found = [...set].sort((a, b) => a - b);
                break;
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
    additionSolutions.set(key, found);
    return found;
}

const additionSolutions = new Map<string, number[] | undefined>();
