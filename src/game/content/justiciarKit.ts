import { CharacterDef, HeroAbilityDef } from "./types";

// Justiciar Zachariah as the player, for the Battle for Varrock (fun/maps.ts): his own model and
// animations, and the moves of his fight in the Owl's Court (zachariah.ts) as buttons of his
// own (CharacterDef.abilities, Sim.useAbility): his lunge, his shock wave, his ice, his
// lightning and the Owl's gaze, each with the effects it has when he uses them on you. The
// court's own attacks (its crossbowmen, knights and fire) are the court's, not his, and stay
// there. Each goes off where he faces, with or without anything to hit.

// His animations, on his own skeleton (1756), as the cache has them for npc 7858
const IDLE_SEQ = 7851;
const WALK_SEQ = 7852;
// A wide sword slash, sweeping across about 0.4 s in
const SLASH_SEQ = 7853;
const SLASH_AT = 0.4;
// His sword raised overhead and brought down, about 0.6 s in
const RAISE_SEQ = 7962;
const RAISE_AT = 0.6;

// What his blows throw up, as in his fight: the Corporeal Beast's stomp ring (318), grey dust
// (2184), his blue impact (1458) and blue wave (1515)
const STOMP = 318;
const BLOWN_DUST = 2184;
const BLUE_IMPACT = 1458;
const BLUE_WAVE = 1515;

export const JUSTICIAR_ABILITIES: HeroAbilityDef[] = [
    {
        id: "lunge",
        name: "Lunge",
        description:
            "Draws back and lunges six tiles ahead, cutting through what's in the way. Rising floor can't hurt you mid-lunge.",
        kind: "lunge",
        // Justiciar chestguard
        iconObjId: 22327,
        damage: 40,
        cooldown: 2.5,
        windup: 0.4,
        length: 5.8,
        width: 2,
        seq: SLASH_SEQ,
        strikeAt: SLASH_AT,
        sound: 3876,
        impact: {
            trail: { spotAnim: BLUE_WAVE, fit: 1 },
            spots: [{ spotAnim: BLOWN_DUST, fit: 2 }],
            shake: 0.3,
        },
    },
    {
        id: "shock_wave",
        name: "Shock wave",
        description:
            "Brings his sword down and sends a blue wave twelve tiles along the ground, binding " +
            "what it reaches.",
        kind: "wave",
        // Justiciar faceguard
        iconObjId: 22326,
        damage: 25,
        cooldown: 4,
        windup: 0.6,
        length: 12,
        width: 1.5,
        speed: 6.5,
        spotAnim: BLUE_WAVE,
        // The crescent's tips the way it goes
        spotYaw: 1024,
        freeze: 1.7,
        seq: RAISE_SEQ,
        strikeAt: RAISE_AT,
        windupSound: 3883,
        shout: "Kneel!",
        impact: {
            spots: [
                { spotAnim: STOMP, fit: 3 },
                { spotAnim: BLUE_IMPACT, fit: 2 },
                { spotAnim: BLOWN_DUST, fit: 2.5 },
            ],
            shake: 0.45,
        },
    },
    {
        id: "ice_barrage",
        name: "Ice barrage",
        description:
            "Ice over a three by three square on the nearest enemy, or ahead, freezing it.",
        kind: "square",
        // Justiciar legguards
        iconObjId: 22328,
        damage: 30,
        cooldown: 5,
        windup: 0.6,
        length: 10,
        size: 3,
        spotAnim: 369,
        freeze: 1.5,
        seq: RAISE_SEQ,
        strikeAt: RAISE_AT,
        windupSound: 3856,
        sound: 168,
        impact: { shake: 0.15 },
    },
    {
        id: "lightning",
        name: "Lightning",
        description:
            "Calls lightning down on every three by three cell of one colour round him, marked " +
            "first in gold.",
        kind: "checker",
        // Saradomin's light
        iconObjId: 13256,
        damage: 35,
        cooldown: 7,
        windup: 1.2,
        length: 7,
        size: 3,
        markSpotAnim: 1800,
        spotAnim: 1796,
        // His blue light bursting on each cell as it's struck: the bolt alone barely shows from
        // the play camera over the ash
        cellImpact: { spotAnim: BLUE_IMPACT, fit: 1.2 },
        seq: RAISE_SEQ,
        strikeAt: RAISE_AT,
        windupSound: 4364,
        sound: 4428,
        impact: { shake: 0.3, flash: "#dfe8ff" },
    },
    {
        id: "owls_gaze",
        name: "The Owl's gaze",
        description: "Raises his sword, and everything within eight tiles is judged.",
        kind: "gaze",
        // The Justiciar's hand
        iconObjId: 21797,
        damage: 60,
        cooldown: 12,
        windup: 1.6,
        length: 8,
        spotAnim: BLUE_IMPACT,
        seq: RAISE_SEQ,
        strikeAt: RAISE_AT,
        windupSound: 3883,
        sound: 3887,
        shout: "Face judgement!",
        impact: {
            spots: [
                { spotAnim: STOMP, fit: 6 },
                { spotAnim: BLOWN_DUST, fit: 3 },
            ],
            shake: 0.6,
            flash: "#fff3c4",
        },
    },
];

// Played in the Battle for Varrock alone. His sword's swings are a two-handed sword's sweep,
// drawn as his own slash.
export const JUSTICIAR_ZACHARIAH: CharacterDef = {
    id: "justiciar_zachariah",
    name: "Justiciar Zachariah",
    description:
        "The Justiciar of the Owl, walking burnt Varrock: his lunge, shock wave, ice barrage, " +
        "lightning and the Owl's gaze, on buttons of his own.",
    style: "melee",
    startingWeapon: "two_handed_sword",
    equipment: {},
    bonus: { moveSpeed: 0.2, maxHp: 0.5 },
    only: "battle_for_varrock",
    npcLook: { npcId: 7858, idleSeq: IDLE_SEQ, walkSeq: WALK_SEQ, swingSeq: SLASH_SEQ, scale: 0.7 },
    abilities: JUSTICIAR_ABILITIES,
};

// Every animation his look needs baked
export function getHeroNpcSeqs(character: CharacterDef): number[] {
    const look = character.npcLook;
    if (!look) {
        return [];
    }
    return [
        look.idleSeq,
        look.walkSeq,
        look.swingSeq,
        ...(character.abilities ?? []).flatMap((a) => (a.seq === undefined ? [] : [a.seq])),
    ].filter((id, i, all) => all.indexOf(id) === i);
}
