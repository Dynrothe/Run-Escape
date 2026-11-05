import { getEnemy } from "./enemies";
import { CombatStyle, MapDef } from "./types";

// The share of a style's damage every boss in a raid takes, when they all pray against it (the
// Theatre's against ranged and magic), for a weapon card to warn of it; undefined when a boss takes
// it in full. As Sim.prayedAgainst: on expert a Nylocas takes its own style in full, unless it's a
// boss with colours (Nylocas Vasilias), whose prayer still holds. A colour's own style gets a
// little more through its prayer (BossDef.colours.ownStyle), which the card leaves to the fight's
// own notices.
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
        if (
            !protects ||
            !protects.styles.includes(style) ||
            (expert && boss.onlyStyle && !boss.boss?.colours)
        ) {
            return undefined;
        }
        share = Math.max(share, protects.damage);
    }
    return share;
}
