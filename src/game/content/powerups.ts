import { PowerUpDef, ThrallDef } from "./types";

// Power-ups drop now and then from enemies and are used as soon as they're
// walked over. A kill is likelier to drop one the longer it's been since the
// last, so they turn up every couple of minutes whether a lot is dying or not
// (a little more often the more is).
//
// Ids are from RuneLite's gameval constants and the osrs-dumps config dumps.

// A kill's chance of dropping a power-up a minute after the last one dropped;
// it grows with the square of the time (1.2% two minutes after, 2.7% three)
export const POWER_UP_CHANCE = 0.003;
// Seconds after one drops before another can
export const POWER_UP_MIN_GAP = 45;
// Seconds one lies on the ground before it's gone; it blinks for the last few
export const POWER_UP_LIFETIME = 30;
export const POWER_UP_BLINK = 5;
// Their loot beams and minimap dots (caskets' are their tier's colour)
export const POWER_UP_COLOR = "#46f0dc";

export const POWER_UPS: PowerUpDef[] = [
    {
        id: "cannon",
        name: "Dwarf multicannon",
        description: "Sets up a cannon that shoots everything nearby for 20 seconds.",
        // Cannon base; the set-up cannon on the ground
        objId: 6,
        locId: 6,
        weight: 3,
        // mcannon_setup plays as it's set up
        sound: -1,
        effect: { kind: "cannon", damage: 12, interval: 0.5, amount: 2, range: 8, seconds: 20 },
    },
    {
        id: "thrall",
        name: "Book of the Dead",
        description: "Raises a greater thrall to fight beside you for 30 seconds.",
        objId: 25818,
        weight: 3,
        // prayer_boost
        sound: 2671,
        effect: { kind: "thrall", seconds: 30 },
    },
    {
        id: "bot_nuke",
        name: "Bot nuke",
        description: "Wipes out every enemy. Bosses only lose a tenth of their hitpoints.",
        // Lit explosive
        objId: 29573,
        weight: 1,
        flash: "#fff5dc",
        // firewave_hit
        sound: 163,
        effect: { kind: "nuke", bossDamage: 0.1 },
    },
    {
        id: "magnet",
        name: "Magnet",
        description: "Pulls every drop on the ground to you.",
        objId: 2410,
        weight: 2,
        // teleport_vwoop
        sound: 200,
        effect: { kind: "magnet" },
    },
    {
        id: "stopwatch",
        name: "Giant stopwatch",
        description: "Everything but bosses stands still for 8 seconds.",
        objId: 27414,
        weight: 2,
        flash: "#aad7ff",
        // ice_barrage_impact
        sound: 168,
        effect: { kind: "freeze", seconds: 8 },
    },
];

// The Arceuus greater thralls; the Book of the Dead raises one at random. They
// attack faster and harder than in OSRS, to be worth a power-up.
export const THRALLS: ThrallDef[] = [
    {
        id: "ghost",
        name: "Greater Ghost",
        npcId: 10880,
        idleSeq: 894,
        walkSeq: 10792,
        attackSeq: 11101,
        style: "magic",
        ghost: true,
        damage: 16,
        interval: 1.2,
        range: 7,
        knockback: 0.2,
        projectileSpotAnim: 1907,
        impactSpotAnim: 1908,
        // The ghost enemy's attack
        sound: 436,
    },
    {
        id: "skeleton",
        name: "Greater Skeleton",
        npcId: 10883,
        idleSeq: 13670,
        walkSeq: 13671,
        attackSeq: 13672,
        style: "ranged",
        damage: 9,
        interval: 0.6,
        range: 8,
        knockback: 0.1,
        projectileSpotAnim: 1906,
        sound: 776,
    },
    {
        id: "zombie",
        name: "Greater Zombie",
        npcId: 10886,
        idleSeq: 13675,
        walkSeq: 13676,
        attackSeq: 13681,
        style: "melee",
        damage: 24,
        interval: 1.2,
        range: 6,
        knockback: 0.6,
        sound: 918,
    },
];

export const POWER_UP_BY_ID: Map<string, PowerUpDef> = new Map(POWER_UPS.map((p) => [p.id, p]));

export function getPowerUp(id: string): PowerUpDef {
    const powerUp = POWER_UP_BY_ID.get(id);
    if (!powerUp) {
        throw new Error("Unknown power-up " + id);
    }
    return powerUp;
}
