import { BlessingDef, BlessingKitDef, BlessingsDef, HeroAbilityDef } from "./types";

// The blessings of Saradomin (MapDef.blessings): burnt Varrock has no items, and every level up
// grants the Justiciar one of these at random instead of a pick, his god's strike coming down on
// him as it does (Saradomin Strike's bolt and its sound). Each is a Saradomin item, for its icon.
// They stand in for everything a run's items and picks would give (weapons, passives, gear and
// caskets), with no choosing, so one is worth more than a pick. They're for a hero of about 38
// hitpoints whose buttons are his weapons (justiciarKit.ts), and against a general or Yama alone
// the buttons are most of the damage. Past every one's max, the tear, as often as that comes.

// Shock wave's extra waves fan out this far from the first, in radians, one more each way per fan
export const BLESSED_FAN_ANGLE = 0.4;

export const SARADOMIN_BLESSINGS: BlessingsDef = {
    name: "Blessing of Saradomin",
    spotAnim: 76,
    sound: 1659,
    pool: [
        {
            id: "strength",
            name: "Saradomin's strength",
            description: "+12% damage, your buttons' too.",
            // Saradomin sword
            iconObjId: 11838,
            max: 8,
            weight: 2,
            stats: { might: 0.12 },
        },
        {
            id: "brew",
            name: "Saradomin brew",
            description: "+12% hitpoints, and heals a third of them.",
            iconObjId: 6685,
            max: 5,
            stats: { maxHp: 0.12 },
            heal: 0.33,
        },
        {
            id: "ward",
            name: "Saradomin's ward",
            description: "+1 armour.",
            // Saradomin kiteshield
            iconObjId: 2667,
            max: 3,
            stats: { armor: 1 },
        },
        {
            id: "sandals",
            name: "Holy sandals",
            description: "+6% movement speed.",
            iconObjId: 12598,
            max: 3,
            stats: { moveSpeed: 0.06 },
        },
        {
            id: "elixir",
            name: "Holy elixir",
            description: "+2 hitpoints a minute.",
            iconObjId: 12833,
            max: 4,
            stats: { regen: 2 },
        },
        {
            id: "will",
            name: "Saradomin's will",
            description: "Your buttons come back 8% sooner, and your sword swings 6% faster.",
            // Holy symbol
            iconObjId: 1718,
            max: 4,
            stats: { cooldown: 0.06 },
            kit: { cooldown: 0.08 },
        },
        {
            id: "wisdom",
            name: "Holy book",
            description: "+12% experience.",
            iconObjId: 3840,
            max: 3,
            stats: { growth: 0.12 },
        },
        {
            id: "blade",
            name: "Blessed blade",
            description: "Your Saradomin sword a level up: its sweep grows.",
            // Saradomin's blessed sword
            iconObjId: 12809,
            max: 7,
            weight: 1.5,
            weaponLevel: true,
        },
        {
            id: "staff",
            name: "Saradomin staff",
            description: "Saradomin Strike, or a level of it: Saradomin strikes enemies round you.",
            iconObjId: 2415,
            // Its levels (weapons.ts)
            max: 8,
            weight: 2,
            weapon: "saradomin_strike",
        },
        {
            id: "crossbow",
            name: "Zilyana's crossbow",
            description:
                "From Commander Zilyana, Saradomin's general: the Armadyl crossbow, or a level of it.",
            iconObjId: 11785,
            // Its levels (weapons.ts)
            max: 5,
            // The likeliest: against a general alone, out of his reach, it's most of the damage
            weight: 3,
            weapon: "armadyl_crossbow",
        },
        {
            id: "light",
            name: "Saradomin's light",
            description: "Your buttons hit 20% harder.",
            iconObjId: 13256,
            max: 5,
            weight: 1.5,
            kit: { damage: 0.2 },
        },
        {
            id: "zeal",
            name: "Zeal",
            description: "Lunge goes 1.5 tiles further and hits 50% harder.",
            // Saradomin godsword
            iconObjId: 11806,
            max: 2,
            kit: { abilities: ["lunge"], length: 1.5, damage: 0.5 },
        },
        {
            id: "crozier",
            name: "Saradomin crozier",
            description: "Shock wave sends one more wave out to each side.",
            iconObjId: 10440,
            max: 2,
            kit: { abilities: ["shock_wave"], fan: 1 },
        },
        {
            id: "holy_water",
            name: "Holy water",
            description:
                "Ice barrage covers five by five, freezes 0.75 seconds longer and hits 60% harder.",
            iconObjId: 732,
            max: 1,
            kit: { abilities: ["ice_barrage"], size: 2, freeze: 0.75, damage: 0.6 },
        },
        {
            id: "mjolnir",
            name: "Saradomin mjolnir",
            description: "Lightning reaches 1.5 tiles further and hits 40% harder.",
            iconObjId: 6762,
            max: 2,
            kit: { abilities: ["lightning"], length: 1.5, damage: 0.4 },
        },
        {
            id: "halo",
            name: "Saradomin halo",
            description:
                "The Owl's gaze reaches 2 tiles further and hits 40% harder. It's still an ultimate.",
            iconObjId: 12637,
            max: 2,
            kit: { abilities: ["owls_gaze"], length: 2, damage: 0.4 },
        },
    ],
    fallback: {
        id: "tear",
        name: "Saradomin's tear",
        description: "Heals half your hitpoints, and +5% damage.",
        iconObjId: 12804,
        max: Infinity,
        stats: { might: 0.05 },
        heal: 0.5,
    },
};

// A blessing of a map's by id, the fallback too
export function getBlessing(blessings: BlessingsDef, id: string): BlessingDef {
    const blessing =
        blessings.fallback.id === id
            ? blessings.fallback
            : blessings.pool.find((candidate) => candidate.id === id);
    if (!blessing) {
        throw new Error("Unknown blessing " + id);
    }
    return blessing;
}

// Whether a blessing's kit changes reach an ability
function reaches(kit: BlessingKitDef, ability: HeroAbilityDef): boolean {
    return kit.abilities === undefined || kit.abilities.includes(ability.id);
}

// A hero's own button as their blessings have made it (each had count times): its numbers
// changed, and its fan of extra waves (a wave's only). The ability itself when nothing reaches it.
export function blessAbility(
    ability: HeroAbilityDef,
    had: { blessing: BlessingDef; count: number }[],
): { ability: HeroAbilityDef; fan: number; by: BlessingDef[] } {
    let damage = 0;
    let cooldown = 0;
    let length = 0;
    let width = 0;
    let size = 0;
    let freeze = 0;
    let fan = 0;
    const by: BlessingDef[] = [];
    for (const { blessing, count } of had) {
        const kit = blessing.kit;
        if (!kit || !reaches(kit, ability)) {
            continue;
        }
        by.push(blessing);
        damage += (kit.damage ?? 0) * count;
        cooldown += (kit.cooldown ?? 0) * count;
        length += (kit.length ?? 0) * count;
        width += (kit.width ?? 0) * count;
        size += (kit.size ?? 0) * count;
        freeze += (kit.freeze ?? 0) * count;
        fan += (kit.fan ?? 0) * count;
    }
    if (by.length === 0) {
        return { ability, fan: 0, by };
    }
    return {
        ability: {
            ...ability,
            damage: ability.damage * (1 + damage),
            // Never under a fifth of what it was
            cooldown: ability.cooldown * Math.max(0.2, 1 - cooldown),
            length: ability.length + length,
            ...(ability.width !== undefined && { width: ability.width + width }),
            ...(ability.size !== undefined && { size: ability.size + size }),
            ...(ability.freeze !== undefined && { freeze: ability.freeze + freeze }),
        },
        fan: ability.kind === "wave" ? fan : 0,
        by,
    };
}
