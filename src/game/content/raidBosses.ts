import { getEnemy } from "./enemies";
import { CombatStyle, EnemyDef, MapDef } from "./types";

// Whether an enemy's prayer does nothing: on expert a Nylocas takes its own style in full
// (EnemyDef.onlyStyle), unless it's a boss with colours (Nylocas Vasilias), whose prayer holds.
// Sim.prayedAgainst, the cards' warning and the overheads all go by this.
export function isPrayerIgnored(def: EnemyDef, expert: boolean): boolean {
    return expert && def.onlyStyle !== undefined && !def.boss?.colours;
}

// Whether a raid has a boss with colours, which takes its colour's style better than its prayer
// says (BossDef.colours.ownStyle): the cards' warning is then for most of its bosses
export function raidHasColours(map: MapDef): boolean {
    return (map.raid?.rooms ?? []).some((room) => getEnemy(room.boss).boss?.colours !== undefined);
}

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
        if (!protects || !protects.styles.includes(style) || isPrayerIgnored(boss, expert)) {
            return undefined;
        }
        share = Math.max(share, protects.damage);
    }
    return share;
}

const STYLES: CombatStyle[] = ["melee", "ranged", "magic"];

// The styles a boss's overhead prayer shows it holds back: a boss with colours (Nylocas Vasilias)
// takes its colour's style best and the other two least, whatever its prayer says, so it's those
// two; any other, what it prays against (EnemyDef.protects)
export function getBossPrayerStyles(def: EnemyDef): CombatStyle[] {
    if (def.onlyStyle && def.boss?.colours) {
        return STYLES.filter((style) => style !== def.onlyStyle);
    }
    return def.protects?.styles ?? [];
}
