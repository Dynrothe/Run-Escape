import { getBlessing } from "../content/blessings";
import { StatText, formatStats } from "../content/stats";
import { BlessingDef, BlessingsDef, StatKey, Stats } from "../content/types";
import { SlotView } from "./GameStore";

// A map's blessings (MapDef.blessings) as the HUD and the pause menu show them

// Saradomin's blue, for a blessing's border and its name
export const BLESSING_COLOR = "#8ec5ff";

// Each blessing a hero's had, in the order they first had it
export function getBlessingViews(
    blessings: BlessingsDef,
    had: readonly { id: string; count: number }[],
): SlotView[] {
    return had.map(({ id, count }) => {
        const blessing = getBlessing(blessings, id);
        return {
            id: `blessing:${id}`,
            name: blessing.name,
            level: count,
            maxLevel: blessing.max,
            iconObjId: blessing.iconObjId,
            stats: [{ text: blessing.description }],
            detail: count > 1 ? describeTotal(blessing, count) : undefined,
            rarityColor: BLESSING_COLOR,
            blessing: true,
        };
    });
}

// What its stats come to, had count times: "In all: +16% damage"
function describeTotal(blessing: BlessingDef, count: number): StatText | undefined {
    if (!blessing.stats) {
        return undefined;
    }
    const total: Partial<Stats> = {};
    for (const [key, value] of Object.entries(blessing.stats)) {
        total[key as StatKey] = value * count;
    }
    const lines = formatStats(total);
    return lines.length > 0
        ? { text: `In all: ${lines.map((line) => line.text).join(", ")}` }
        : undefined;
}

// How many times it's been had, under its name: "Blessed 2 times of 6"
export function describeBlessed(slot: SlotView): string {
    const times = slot.level === 1 ? "once" : `${slot.level} times`;
    if (!Number.isFinite(slot.maxLevel)) {
        return `Blessed ${times}`;
    }
    return slot.level >= slot.maxLevel
        ? `Blessed ${times}, the most it can be`
        : `Blessed ${times} of ${slot.maxLevel}`;
}
