import { tr } from "../i18n";
import { FALLEN_EMPIRE, getActFightIds } from "./acts";
import { CLEAR_POINTS, SAFE_POINTS, SLOW_PAR, SPEED_POINTS } from "./raids";

// The Forgotten Four (act-2-fallen-empire.md, 7.3): the act's four Awakened fights one after
// another, in the player's order, each a step harder than the last, with a camp between them where
// the fight just won pays points for a blessing on the next. Opened from the act's middle card once
// all four are beaten. Each fight is its own map and its own run (GameClient chains them, the
// camp's a screen between): the run's state, its points, wounds and records are core/gauntlet.ts.

export const GAUNTLET_ID = "forgotten_four";

// Its fights: the act's Awakened fights, in the act's order (the order screen's to change)
export const GAUNTLET_FIGHTS: readonly string[] = getActFightIds(FALLEN_EMPIRE);

// The climb: each fight's boss's hitpoints, and its tempo (its attacks' interval and patterns'
// windups divided by it), by where it comes in the order
export const GAUNTLET_CLIMB: readonly number[] = [1, 1.05, 1.1, 1.15];

// Wounds: an adventurer starts their fight at full hitpoints less this much of what the last one
// had lost at the end of theirs (so at most a fifth down)
export const WOUND_SHARE = 0.2;

// The camp between fights: this long, unless the player's ready sooner
export const CAMP_SECONDS = 45;

// Points for a fight won, as a raid room's (raids.ts getRoomPoints): CLEAR_POINTS for the win, all
// of SPEED_POINTS within PAR_SECONDS of the fight's start (none by SLOW_PAR times that), all of
// SAFE_POINTS with no damage taken (none at a whole hitpoints bar's worth), and GUARD_POINTS for
// each time the boss's guard dropped, up to MAX_GUARD_POINTS
export const PAR_SECONDS = 120;
export const GUARD_POINTS = 5;
export const MAX_GUARD_POINTS = 50;

// The first clear (clean or not), on either mode: Awakener's orbs (8.6), spent in build step 16
export const FIRST_CLEAR_ORBS = 2;
export const AWAKENERS_ORB_OBJ = 28334;
// The first clean clear's look: the Ancient blood ornament kit (8.6's blood-touched look)
export const BLOOD_KIT_OBJ = 28336;
// The Soulreaper axe's look with it: the cache's ornamented axe
export const SOULREAPER_AXE_OBJ = 28338;
export const BLOOD_SOULREAPER_AXE_OBJ = 33335;

export type BlessingId = "rest" | "saradomin" | "second_wind" | "ancient_focus" | "steady_hands";

export type BlessingDef = {
    id: BlessingId;
    name: string;
    description: string;
    // Gauntlet points
    price: number;
    iconObjId: number;
};

// A blessing's numbers
// Saradomin's blessing: more hitpoints, for the fight
export const SARADOMIN_HP = 0.2;
// Second wind: falling leaves you at this much of your hitpoints, untouchable for a moment, once
export const SECOND_WIND_HP = 0.3;
export const SECOND_WIND_SECONDS = 3;
// Ancient focus: the fight's button's cooldown times this
export const ANCIENT_FOCUS = 0.75;
// Steady hands: every drop of the boss's guard this much longer
export const STEADY_HANDS_SECONDS = 0.5;

// One a camp, for the next fight (and its retries)
export const BLESSINGS: BlessingDef[] = [
    {
        id: "rest",
        name: "Rest",
        description: "Clears your wounds: the next fight starts at full hitpoints.",
        price: 60,
        // A meal by the fire
        iconObjId: 385,
    },
    {
        id: "steady_hands",
        name: "Steady hands",
        description: "Each time the boss's guard drops, it stays down 0.5 s longer.",
        price: 80,
        iconObjId: 26235,
    },
    {
        id: "ancient_focus",
        name: "Ancient focus",
        description: "The fight's button charges 25% quicker.",
        price: 100,
        iconObjId: 27627,
    },
    {
        id: "saradomin",
        name: "Saradomin's blessing",
        description: "+20% hitpoints for the fight.",
        price: 120,
        iconObjId: 1718,
    },
    {
        id: "second_wind",
        name: "Second wind",
        description: "Once, falling leaves you at 30% hitpoints and untouchable for 3 s.",
        price: 150,
        iconObjId: 11090,
    },
];

export const BLESSING_BY_ID: Map<string, BlessingDef> = new Map(BLESSINGS.map((b) => [b.id, b]));

export function isBlessingId(id: unknown): id is BlessingId {
    return typeof id === "string" && BLESSING_BY_ID.has(id);
}

// What a fight of the gauntlet's is played with (SimOptions.gauntlet): its climb, the hitpoints it
// starts at (a share of the whole, after wounds), and the blessing bought for it
export type GauntletFightOptions = { climb: number; hp: number; blessing?: BlessingId };

// What a fight won pays, and what for (the camp shows each)
export type GauntletPoints = {
    clear: number;
    speed: number;
    safe: number;
    guard: number;
    total: number;
};

// seconds: the fight's time; damageTaken and maxHp: the adventurer's; guardDowns: times the boss's
// guard dropped
export function getFightPoints(
    seconds: number,
    damageTaken: number,
    maxHp: number,
    guardDowns: number,
): GauntletPoints {
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const speed = Math.round(
        SPEED_POINTS * clamp(1 - (seconds - PAR_SECONDS) / (PAR_SECONDS * SLOW_PAR - PAR_SECONDS)),
    );
    const safe = Math.round(SAFE_POINTS * clamp(1 - damageTaken / Math.max(1, maxHp)));
    const guard = Math.min(MAX_GUARD_POINTS, GUARD_POINTS * Math.max(0, Math.floor(guardDowns)));
    return {
        clear: CLEAR_POINTS,
        speed,
        safe,
        guard,
        total: CLEAR_POINTS + speed + safe + guard,
    };
}

// The wounds an adventurer leaves the next: a share of what they'd lost by the end
export function getWound(hp: number, maxHp: number): number {
    const lost = 1 - Math.min(1, Math.max(0, hp / Math.max(1, maxHp)));
    return Math.round(WOUND_SHARE * lost * 1000) / 1000;
}

// A gauntlet order's record key: the fights' ids, joined (13.2: times compare within an order)
export function gauntletOrderKey(order: readonly string[]): string {
    return order.join(">");
}

// Whether an order is the four fights, each once
export function isGauntletOrder(order: unknown): order is string[] {
    return (
        Array.isArray(order) &&
        order.length === GAUNTLET_FIGHTS.length &&
        GAUNTLET_FIGHTS.every((id) => order.includes(id))
    );
}

// In the player's language (world.json, gauntlet.blessing.<id>.*)
export function blessingName(blessing: BlessingDef): string {
    return tr(`gauntlet.blessing.${blessing.id}.name`, blessing.name);
}

export function blessingDescription(blessing: BlessingDef): string {
    return tr(`gauntlet.blessing.${blessing.id}.description`, blessing.description);
}
