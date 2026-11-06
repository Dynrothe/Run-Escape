import { BossAttackDef, EnemyDef } from "./types";

// Beneath Cursed Sands, as a boss fight in four parts (MapDef.stages; its map in
// scaperune/maps/tombsOfAmascut.ts): the OSRS quest's fights one after another, Coenus the Head
// Menaphite Guard, the Scarab Mages, the Champion of Scabaras and the Menaphite Akh, each a run of
// its own that's kept once it's won, as the quest keeps your progress. Beaten, it opens the Tombs
// of Amascut (MapDef.requires). Everyone plays the Sands Delver (characters.ts) with its kit, so the
// fights are as long as their hitpoints make them: hard, and in phases.

// The humanoid rig's own (the quest's foes are people, the Akh aside): standing, walking, falling
const HUMAN_IDLE = 808;
const HUMAN_WALK = 819;
const GUARD_IDLE = 813;
const GUARD_WALK = 1205;
const HUMAN_DEATH = 836;
const SLASH_SEQ = 390;
const CAST_SEQ = 1162;
// The Ancient Magicks' burst and barrage cast
const BURST_SEQ = 1979;
const NO_SOUNDS = { attack: -1, hit: -1, death: -1 };
// Shadow spells: the barrage's and burst's impacts
const SHADOW_BURST = 382;
const SHADOW_BARRAGE = 383;
// The Tombs' scarabs' magic, and its splash
const SCARAB_BOLT = 2152;
const SCARAB_SPLASH = 2154;
// Akkha's lightning element
const LIGHTNING = 2256;

// A boss's rise at the middle of the arena, the player brought to its south, nothing else till
// it's down
const rise = (title: string, subtitle: string) => ({
    seconds: 3,
    riseAt: 1,
    title,
    subtitle,
    distance: 7,
    alone: true,
    atMiddle: true,
});

// Coenus, the Head Menaphite Guard (11529): melee only up close, and he sees through prayers. A
// cleave, a charge at you from range and a spear thrown if you keep away; from two thirds he calls
// his guards (11527) and stamps the ground round him; from a third, quicker, a shockwave rolls out
// from him to be slipped through its gap.
const COENUS_ATTACKS: BossAttackDef[] = [
    {
        name: "Cleave",
        kind: "swing",
        seq: SLASH_SEQ,
        sound: -1,
        damage: 2,
        windup: 1.1,
        cooldown: 0,
        range: 2.5,
        radius: 2,
        weight: 4,
    },
    {
        name: "Charge",
        kind: "blast",
        seq: SLASH_SEQ,
        sound: -1,
        damage: 2,
        windup: 1.1,
        cooldown: 5,
        range: 12,
        minRange: 4,
        radius: 1.6,
        weight: 2,
        leap: true,
        shout: "Your false gods will not protect you!",
    },
    {
        name: "Spear throw",
        kind: "projectile",
        seq: SLASH_SEQ,
        sound: -1,
        spotAnim: SCARAB_BOLT,
        impactSpotAnim: SCARAB_SPLASH,
        damage: 2,
        windup: 0.9,
        cooldown: 6,
        range: 14,
        minRange: 5,
        weight: 2,
        speed: 7,
    },
    {
        name: "Guards!",
        kind: "summon",
        seq: SLASH_SEQ,
        sound: -1,
        damage: 0,
        windup: 1,
        cooldown: 16,
        range: 30,
        weight: 3,
        summon: { enemyId: "menaphite_guard", count: 2, distance: 4 },
        shout: "Guards! Seize the intruder!",
        phases: [2, 3],
    },
    {
        name: "Shockwave",
        kind: "pattern",
        seq: SLASH_SEQ,
        sound: -1,
        spotAnim: SHADOW_BURST,
        damage: 2,
        windup: 1.2,
        cooldown: 6,
        range: 30,
        weight: 0,
        pattern: {
            shape: "ring",
            count: 20,
            volleys: 2,
            interval: 1,
            speed: 4.5,
            range: 14,
            radius: 0.45,
            gap: 0.9,
            gapAt: "player",
        },
        phases: [3],
    },
    {
        name: "Stamp",
        kind: "swing",
        seq: SLASH_SEQ,
        sound: -1,
        damage: 3,
        windup: 1.3,
        cooldown: 6,
        range: 4,
        radius: 4,
        weight: 3,
        phases: [2, 3],
    },
];

// The Scarab Mages (11508): a bolt, a fan of them, and scarab swarms out of the sand. The second
// comes as the first falls, quicker.
const MAGE_ATTACKS: BossAttackDef[] = [
    {
        name: "Scarab bolt",
        kind: "projectile",
        seq: CAST_SEQ,
        sound: -1,
        spotAnim: SCARAB_BOLT,
        impactSpotAnim: SCARAB_SPLASH,
        damage: 1,
        windup: 0.7,
        cooldown: 0,
        range: 14,
        weight: 4,
        speed: 6,
    },
    {
        name: "Scarab fan",
        kind: "pattern",
        seq: CAST_SEQ,
        sound: -1,
        spotAnim: SCARAB_BOLT,
        damage: 2,
        windup: 1,
        cooldown: 4,
        range: 14,
        weight: 3,
        pattern: {
            shape: "spread",
            count: 5,
            volleys: 2,
            interval: 0.5,
            speed: 7,
            range: 16,
            radius: 0.4,
            arc: 1,
        },
    },
    {
        name: "Swarm",
        kind: "summon",
        seq: CAST_SEQ,
        sound: -1,
        damage: 0,
        windup: 1,
        cooldown: 14,
        range: 30,
        weight: 2,
        summon: { enemyId: "scarab_swarm", count: 2, distance: 3 },
        shout: "Scarabs, rise!",
    },
];

// The Champion of Scabaras (11483): shadow magic, and in turn his specials, as the wiki gives
// them: Shadow Burst (round himself, four tiles out: be away), Shadow Rift (a rift that bursts
// where you stood: be gone) and Shadow Flames (a scarab swarm). Phases make him quicker, and his
// last adds a ring of shadow to dodge through.
const CHAMPION_ATTACKS: BossAttackDef[] = [
    {
        name: "Shadow bolt",
        kind: "projectile",
        seq: CAST_SEQ,
        sound: -1,
        spotAnim: SCARAB_BOLT,
        impactSpotAnim: SHADOW_BARRAGE,
        damage: 1,
        windup: 0.8,
        cooldown: 0,
        range: 16,
        weight: 3,
        speed: 6,
    },
    {
        name: "Shadow Burst",
        kind: "swing",
        seq: BURST_SEQ,
        sound: -1,
        impactSpotAnim: SHADOW_BURST,
        damage: 4,
        windup: 1.5,
        cooldown: 7,
        range: 5,
        radius: 4,
        weight: 3,
    },
    {
        name: "Shadow Rift",
        kind: "blast",
        seq: BURST_SEQ,
        sound: -1,
        impactSpotAnim: SHADOW_BARRAGE,
        damage: 4,
        windup: 2.6,
        cooldown: 9,
        range: 16,
        radius: 2.2,
        weight: 2,
        shout: "We are born in the shadows!",
    },
    {
        name: "Shadow Flames",
        kind: "summon",
        seq: CAST_SEQ,
        sound: -1,
        damage: 0,
        windup: 1,
        cooldown: 14,
        range: 30,
        weight: 2,
        summon: { enemyId: "scarab_swarm", count: 4, distance: 3 },
        shout: "The children of Scabaras are eternal!",
    },
    {
        name: "Shadow ring",
        kind: "pattern",
        seq: BURST_SEQ,
        sound: -1,
        spotAnim: SCARAB_BOLT,
        damage: 2,
        windup: 1.2,
        cooldown: 6,
        range: 30,
        weight: 0,
        pattern: {
            shape: "ring",
            count: 18,
            volleys: 2,
            interval: 0.9,
            speed: 5,
            range: 14,
            radius: 0.45,
            gap: 0.9,
            gapAt: "player",
        },
        phases: [3],
    },
];

// The Menaphite Akh (11493, her own animations): her spear up close, and every so often she
// twitches and casts a cone of lightning ahead of her (step beside or behind her), calls her
// shadow, which shoots from afar, and from her last phase fills the arena with her lightning.
const AKH_ATTACKS: BossAttackDef[] = [
    {
        name: "Spear",
        kind: "swing",
        seq: 9427,
        sound: -1,
        damage: 2,
        windup: 1.0,
        cooldown: 0,
        range: 2.6,
        radius: 2,
        weight: 4,
    },
    {
        name: "Lightning",
        kind: "pattern",
        seq: 9417,
        sound: -1,
        spotAnim: LIGHTNING,
        damage: 2,
        windup: 1.4,
        cooldown: 9,
        range: 14,
        weight: 3,
        pattern: {
            shape: "spread",
            count: 9,
            volleys: 1,
            interval: 0.2,
            speed: 11,
            range: 14,
            radius: 0.5,
            arc: 1.3,
        },
        shout: "Darkness begins to surround you!",
    },
    {
        name: "Her shadow",
        kind: "summon",
        seq: 9423,
        sound: -1,
        damage: 0,
        windup: 1.2,
        cooldown: 26,
        range: 30,
        weight: 2,
        summon: { enemyId: "menaphite_shadow", count: 1, distance: 5 },
    },
    {
        name: "Storm",
        kind: "pattern",
        seq: 9417,
        sound: -1,
        spotAnim: LIGHTNING,
        damage: 3,
        windup: 1.2,
        cooldown: 7,
        range: 30,
        weight: 0,
        pattern: {
            shape: "spiral",
            count: 6,
            volleys: 8,
            interval: 0.35,
            speed: 6,
            range: 14,
            radius: 0.45,
            turn: 0.35,
        },
        phases: [3],
    },
];

// Down on one knee between phases, and up again
const pause = (shout: string) => ({ seconds: 2, shout });

export const CURSED_SANDS_ENEMIES: EnemyDef[] = [
    {
        id: "coenus",
        name: "Coenus",
        npcId: 11529,
        idleSeq: GUARD_IDLE,
        walkSeq: GUARD_WALK,
        attackSeq: SLASH_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 1,
        damage: 2,
        speed: 2.1,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        sounds: NO_SOUNDS,
        boss: {
            // Its last share: quicker still
            enrage: { message: "", at: 0.15 },
            intro: rise("Coenus", "The Head Menaphite Guard"),
            attackInterval: 1.6,
            attacks: COENUS_ATTACKS,
            phases: {
                phases: [
                    { until: 0.66, status: "He comes for you" },
                    {
                        until: 0.33,
                        status: "Your false gods will not protect you",
                        message: "Coenus calls his guards, and stamps the ground!",
                        tempo: 0.85,
                        speed: 1.1,
                    },
                    {
                        status: "You will not leave this place",
                        message: "Coenus is enraged!",
                        tempo: 0.7,
                        speed: 1.2,
                        ambient: { attack: "Shockwave", interval: 6, delay: 1.5 },
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
                threshold: pause("You will not leave this place!"),
            },
        },
    },
    ...[
        { id: "scarab_mage", title: "Scarab Mage", tempo: 1 },
        { id: "scarab_mage_elder", title: "Scarab Mage", tempo: 0.85 },
    ].map(
        ({ id, title, tempo }): EnemyDef => ({
            id,
            name: "Scarab Mage",
            npcId: 11508,
            idleSeq: GUARD_IDLE,
            walkSeq: GUARD_WALK,
            attackSeq: CAST_SEQ,
            deathSeq: HUMAN_DEATH,
            hp: 1,
            damage: 2,
            speed: 2,
            radius: 0.5,
            xp: 0,
            knockbackResist: 1,
            sounds: NO_SOUNDS,
            boss: {
                enrage: { message: "", at: 0.3 },
                intro: rise(title, "Servant of Scabaras"),
                attackInterval: 1.8 * tempo,
                keepDistance: 6,
                attacks: MAGE_ATTACKS,
            },
        }),
    ),
    {
        id: "champion_of_scabaras",
        name: "Champion of Scabaras",
        npcId: 11483,
        idleSeq: HUMAN_IDLE,
        walkSeq: HUMAN_WALK,
        attackSeq: CAST_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 1,
        damage: 3,
        speed: 2.2,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        sounds: NO_SOUNDS,
        boss: {
            // Its last share: quicker still
            enrage: { message: "", at: 0.15 },
            intro: rise("Champion of Scabaras", "The children of Scabaras are eternal"),
            attackInterval: 1.6,
            keepDistance: 5,
            attacks: CHAMPION_ATTACKS,
            phases: {
                phases: [
                    { until: 0.66, status: "Shadows gather" },
                    {
                        until: 0.33,
                        status: "Born in the shadows",
                        message: "The Champion draws the shadows round him!",
                        tempo: 0.85,
                        speed: 1.1,
                    },
                    {
                        status: "Eternal",
                        message: "The Champion of Scabaras will not fall!",
                        tempo: 0.7,
                        speed: 1.2,
                        ambient: { attack: "Shadow ring", interval: 6, delay: 2 },
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
                threshold: pause("We are born in the shadows!"),
            },
        },
    },
    {
        id: "menaphite_akh",
        name: "Menaphite Akh",
        npcId: 11493,
        idleSeq: 9426,
        walkSeq: 9425,
        attackSeq: 9427,
        deathSeq: 9433,
        hp: 1,
        damage: 2,
        speed: 2.2,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        sounds: NO_SOUNDS,
        boss: {
            // Its last share: quicker still
            enrage: { message: "", at: 0.15 },
            intro: rise("Menaphite Akh", "Amascut's servant"),
            attackInterval: 1.5,
            attacks: AKH_ATTACKS,
            phases: {
                phases: [
                    { until: 0.66, status: "The Akh strikes" },
                    {
                        until: 0.33,
                        status: "Her shadow turns to magic",
                        message: "The Akh's shadow darkens!",
                        tempo: 0.85,
                        speed: 1.1,
                    },
                    {
                        status: "Darkness surrounds you",
                        message: "Darkness begins to surround you!",
                        tempo: 0.7,
                        speed: 1.2,
                        ambient: { attack: "Storm", interval: 7, delay: 2 },
                        // The arena darkens round her
                        light: 0.35,
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
                threshold: pause("Amascut will not be denied!"),
            },
        },
    },
    {
        // Coenus's guards (11527): swords, after you, a few hits each
        id: "menaphite_guard",
        name: "Menaphite Guard",
        npcId: 11527,
        idleSeq: HUMAN_IDLE,
        walkSeq: HUMAN_WALK,
        attackSeq: SLASH_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 350,
        damage: 1,
        speed: 2.2,
        radius: 0.5,
        xp: 20,
        sounds: NO_SOUNDS,
    },
    {
        // Her shadow (11462): shoots from afar, as the wiki has it; a few hits put it down
        id: "menaphite_shadow",
        name: "Menaphite Shadow",
        npcId: 11462,
        idleSeq: HUMAN_IDLE,
        walkSeq: HUMAN_WALK,
        attackSeq: 426,
        deathSeq: HUMAN_DEATH,
        hp: 250,
        damage: 1,
        speed: 2,
        radius: 0.5,
        xp: 30,
        shot: {
            range: 9,
            interval: 1.8,
            speed: 6,
            spotAnim: SCARAB_BOLT,
            impactSpotAnim: SHADOW_BARRAGE,
            sound: -1,
        },
        sounds: NO_SOUNDS,
    },
];
