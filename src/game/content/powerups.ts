import { tr } from "../i18n";
import { PolymorphEffect, PolymorphKind, PolymorphLook, PowerUpDef, ThrallDef } from "./types";

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
// A lantern, on a map with lighting (LightingDef.lanternWeight)
export const LANTERN_ID = "lantern";

export const POWER_UPS: PowerUpDef[] = [
    {
        // Never rolled with the rest (weight 0): only the maps in
        // trickOrTreat.ts drop it
        id: "pumpkin",
        name: "Pumpkin",
        description: "A treat or a trick.",
        objId: 1959,
        weight: 0,
        price: 0,
        color: "#ff8a1e",
        flash: "#ff8a1e",
        // eat
        sound: 2393,
        effect: { kind: "pumpkin" },
    },
    {
        // Thanksgiving's, from its enemies now and then (TurkeyDay.ts). No turkey in the
        // cache is cooked, so it's a Cooked chompy, the map's own bird
        id: "cooked_turkey",
        name: "Cooked turkey",
        description: "A feast or a foul trick.",
        objId: 2878,
        weight: 0,
        price: 0,
        color: "#d27d2d",
        flash: "#ffcc00",
        // eat
        sound: 2393,
        effect: { kind: "cooked_turkey" },
    },
    {
        id: "cannon",
        name: "Dwarf multicannon",
        description: "Sets up a cannon that shoots everything nearby for 20 seconds.",
        // Cannon base; the set-up cannon on the ground
        objId: 6,
        locId: 6,
        weight: 3,
        price: 60,
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
        price: 60,
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
        price: 150,
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
        price: 30,
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
        price: 60,
        flash: "#aad7ff",
        // ice_barrage_impact
        sound: 168,
        effect: { kind: "freeze", seconds: 8 },
    },
    {
        id: "sled",
        name: "Sled",
        description: "Ride for 8 seconds, far faster and with nothing able to hurt you.",
        // The waxed sled from Troll Romance, which both sits on the ground and
        // is ridden
        objId: 4084,
        weight: 2,
        price: 50,
        // sled_start, sled_stop
        sound: 1868,
        endSound: 1869,
        // trollromance_toboggan_ready, trollromance_toboggan_moving
        look: { objId: 4084, idleSeq: 1461, moveSeq: 1462 },
        effect: { kind: "sled", seconds: 8, speed: 2.2 },
    },
    {
        id: "giant_essence",
        name: "Giant rune essence",
        description:
            "A huge rock falls on the thickest crowd nearby. Bosses lose 8% of their hitpoints.",
        objId: 1436,
        weight: 2,
        price: 60,
        // star_meteor_landing, toa_human_boulder_impact_01
        sound: 4930,
        hitSound: 6033,
        effect: {
            kind: "rock",
            delay: 1.2,
            range: 12,
            radius: 5,
            damage: 150,
            knockback: 3,
            bossDamage: 0.08,
            // big_essence_rock, wild_falloff_meteor_blast
            locId: 16687,
            spotAnim: 659,
        },
    },
    {
        id: "evil_bob",
        name: "Evil Bob",
        description: "Evil Bob charges through the crowd three times, throwing it aside.",
        // Pet cat: Evil Bob has no item of his own
        objId: 1561,
        weight: 2,
        price: 60,
        // cat_hiss, cat_angry
        sound: 335,
        hitSound: 1161,
        effect: {
            kind: "rampage",
            seconds: 7,
            passes: 3,
            speed: 12,
            radius: 2.5,
            damage: 60,
            knockback: 3,
            npcId: 390,
            walkSeq: 314,
            scale: 4,
        },
    },
    {
        id: "fairy_ring",
        name: "Fairy ring",
        description: "A ring opens at your feet for 12 seconds and warps away whatever comes near.",
        // Dramen staff, what it takes to use one
        objId: 772,
        weight: 2,
        price: 50,
        // lotg_fairy_teleport
        sound: 5324,
        effect: {
            kind: "ring",
            seconds: 12,
            radius: 2.5,
            // The ring of mushrooms in the game, then teleport_other_impact
            locId: 12003,
            spotAnim: 342,
            scale: 5,
        },
    },
    {
        id: "drill_demon",
        name: "Drill Demon",
        description: "For 9 seconds everything nearby runs laps around you and can't attack.",
        // Camo helmet, from Sergeant Damien's random event
        objId: 6656,
        weight: 2,
        price: 50,
        // whistle
        sound: 1569,
        effect: {
            kind: "laps",
            seconds: 9,
            range: 12,
            // Close enough to stay on screen all the way round
            radius: 6,
            speed: 1.5,
            shout: "Run laps, maggots!",
        },
    },
    {
        id: "polymorph",
        name: "Polymorph",
        description:
            "For 10 seconds everything turns into harmless sheep. Elites and bosses become golden sheep, but still fight.",
        objId: 1737,
        weight: 2,
        price: 60,
        flash: "#f4f0e6",
        sound: 967,
        endSound: 968,
        effect: {
            kind: "polymorph",
            seconds: 10,
            speed: 0.35,
            sheep: [
                {
                    npcId: 2694,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
                {
                    npcId: 2697,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
                {
                    npcId: 2698,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
                {
                    npcId: 2699,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
                {
                    npcId: 2788,
                    idleSeq: 5345,
                    walkSeq: 5344,
                    deathSeq: 5343,
                    scale: 1,
                },
                // Red, Green, Blue and Yellow Sheep
                {
                    npcId: 5305,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
                {
                    npcId: 5306,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
                {
                    npcId: 5307,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
                {
                    npcId: 5308,
                    idleSeq: 5335,
                    walkSeq: 5334,
                    deathSeq: 5336,
                    scale: 1,
                },
            ],
            // Elites and bosses, which go on fighting as golden sheep (a headbutt for every attack)
            golden: {
                npcId: 806,
                idleSeq: 5345,
                walkSeq: 5344,
                deathSeq: 5343,
                attackSeq: 5341,
                scale: 1.3,
                bossScale: 2.5,
            },
            // One in 1000 is the penguin dressed as a sheep from Cold War, which doesn't quite
            // get the bleat right, and two KGP agents run out of it when it's killed
            penguin: {
                npcId: 731,
                idleSeq: 3569,
                walkSeq: 3568,
                deathSeq: -1,
                scale: 1,
                chance: 1 / 1000,
                shout: "Beh?",
                shoutSounds: [1855],
                escapees: { npcId: 842, walkSeq: 5666, count: 2, speed: 4.5, seconds: 5, scale: 1 },
            },
            // One in 3000 wanders off the other way
            rare: {
                npcId: 10594,
                idleSeq: 232,
                walkSeq: 233,
                deathSeq: -1,
                scale: 1,
                chance: 1 / 3000,
            },
            shout: "Baa!",
            shoutSeconds: 8,
            shoutSounds: [3263, 3264],
        },
    },
    {
        // Never rolled with the rest (weight 0): only a map with lighting drops it, at its
        // LightingDef.lanternWeight
        id: LANTERN_ID,
        name: "Abyssal lantern",
        description: "Lights up 4 more tiles round you for 30 seconds.",
        objId: 26822,
        weight: 0,
        price: 0,
        color: "#ffc061",
        sound: -1,
        effect: { kind: "light", bonus: 4, seconds: 30, fade: 5 },
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

export function powerUpName(powerUp: PowerUpDef): string {
    return tr(`powerup.${powerUp.id}.name`, powerUp.name);
}

export function powerUpDescription(powerUp: PowerUpDef): string {
    return tr(`powerup.${powerUp.id}.desc`, powerUp.description);
}

// A polymorph power-up's effect (EnemyPolymorph's powerUpId)
export function getPolymorphEffect(id: string): PolymorphEffect {
    const effect = getPowerUp(id).effect;
    if (effect.kind !== "polymorph") {
        throw new Error("Not a polymorph: " + id);
    }
    return effect;
}

// Each animal a polymorph can turn something into, with what it's known by (EnemyPolymorph's look
// and variant)
export function getPolymorphLooks(
    effect: PolymorphEffect,
): { look: PolymorphKind; variant: number; def: PolymorphLook }[] {
    return [
        ...effect.sheep.map((def, variant) => ({ look: "sheep" as const, variant, def })),
        { look: "golden", variant: 0, def: effect.golden },
        { look: "penguin", variant: 0, def: effect.penguin },
        { look: "rare", variant: 0, def: effect.rare },
    ];
}

export function getPolymorphLook(
    effect: PolymorphEffect,
    look: PolymorphKind,
    variant: number,
): PolymorphLook {
    return look === "sheep" ? effect.sheep[variant] : effect[look];
}
