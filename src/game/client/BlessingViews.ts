import { getBlessing } from "../content/blessings";
import { formatStats } from "../content/stats";
import { BlessingDef, BlessingsDef, StatKey, Stats } from "../content/types";
import { SlotView } from "./GameStore";

// A map's blessings (MapDef.blessings) as the HUD and the pause menu show them, and the notice as
// one's granted

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
            stats: [blessing.description],
            detail: count > 1 ? describeTotal(blessing, count) : "",
            rarityColor: BLESSING_COLOR,
            blessing: true,
        };
    });
}

// What its stats come to, had count times: "In all: +16% damage"
function describeTotal(blessing: BlessingDef, count: number): string {
    if (!blessing.stats) {
        return "";
    }
    const total: Partial<Stats> = {};
    for (const [key, value] of Object.entries(blessing.stats)) {
        total[key as StatKey] = value * count;
    }
    const lines = formatStats(total);
    return lines.length > 0 ? `In all: ${lines.join(", ")}` : "";
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

// The notice as one's granted: "Blessing of Saradomin: Saradomin's strength (2 of 6). +8% damage."
export function describeBlessing(blessings: BlessingsDef, id: string, count: number): string {
    const blessing = getBlessing(blessings, id);
    const of =
        Number.isFinite(blessing.max) && blessing.max > 1 ? ` (${count} of ${blessing.max})` : "";
    return `${blessings.name}: ${blessing.name}${of}. ${blessing.description}`;
}
