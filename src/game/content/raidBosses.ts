import { getEnemy } from "./enemies";
import { CombatStyle, MapDef } from "./types";

// The share of a style's damage every boss in a raid takes, when they all pray against it (the
// Theatre's against ranged and magic), for a weapon card to warn of it; undefined when a boss takes
// it in full. On expert a boss with a colour (onlyStyle) takes its own style in full, so it's not
// every boss there.
export function getRaidBossShare(
    map: MapDef,
    style: CombatStyle,
    expert: boolean,
): number | undefined {
    const rooms = map.raid?.rooms;
    if (!rooms || rooms.length === 0) {
        return undefined;
    }
    let share = 0;
    for (const room of rooms) {
        const boss = getEnemy(room.boss);
        const protects = boss.protects;
        if (!protects || !protects.styles.includes(style) || (expert && boss.onlyStyle)) {
            return undefined;
        }
        share = Math.max(share, protects.damage);
    }
    return share;
}
