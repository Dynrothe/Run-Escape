import { EquipSlot } from "../../rs/model/player/PlayerModelLoader";
import { CAPPED_STATS } from "./endless";
import { RARITIES, Rarity } from "./rarity";
import { PassiveDef } from "./types";

// perLevel is what a Common pick gives; an Uncommon pick gives 1.5x that, Rare
// 2.25x and Very rare 3.5x (see rarity.ts).
export const PASSIVES: PassiveDef[] = [
    {
        id: "piety",
        name: "Piety",
        description: "Hit harder.",
        stat: "might",
        perLevel: 0.05,
        effect: "damage",
        unit: "percent",
        maxLevel: 5,
        rarity: "uncommon",
        iconObjId: 1718,
        // The prayer's own icon
        iconSpriteId: 946,
    },
    {
        id: "protect_melee",
        name: "Protect from Melee",
        description: "Take less damage from every hit.",
        stat: "armor",
        perLevel: 1,
        effect: "armour",
        unit: "flat",
        maxLevel: 5,
        rarity: "uncommon",
        iconObjId: 1718,
    },
    {
        id: "rapid_heal",
        name: "Rapid Heal",
        description: "Slowly heal over time.",
        stat: "regen",
        perLevel: 1.5,
        effect: "hitpoints a minute",
        unit: "flat",
        maxLevel: 5,
        rarity: "common",
        iconObjId: 2434,
    },
    {
        id: "graceful",
        name: "Graceful outfit",
        description: "Move faster. Each level adds a piece.",
        stat: "moveSpeed",
        perLevel: 0.05,
        effect: "movement speed",
        unit: "percent",
        maxLevel: 5,
        rarity: "common",
        iconObjId: 11860,
        equipment: [
            { slot: EquipSlot.FEET, objIds: [11860, 11860, 11860, 11860, 11860] },
            { slot: EquipSlot.HANDS, objIds: [-1, 11858, 11858, 11858, 11858] },
            { slot: EquipSlot.LEGS, objIds: [-1, -1, 11856, 11856, 11856] },
            { slot: EquipSlot.TORSO, objIds: [-1, -1, -1, 11854, 11854] },
            { slot: EquipSlot.CAPE, objIds: [-1, -1, -1, -1, 11852] },
        ],
    },
    {
        id: "ring_of_wealth",
        name: "Ring of wealth",
        description: "Luckier rolls and more coins.",
        stat: "luck",
        perLevel: 0.08,
        effect: "luck and coins",
        unit: "percent",
        maxLevel: 5,
        rarity: "rare",
        iconObjId: 2572,
        alsoAdds: ["greed"],
    },
    {
        id: "amulet_of_glory",
        name: "Amulet of glory",
        description: "Pick things up from further away.",
        stat: "magnet",
        perLevel: 0.2,
        effect: "pickup range",
        unit: "percent",
        maxLevel: 5,
        rarity: "common",
        iconObjId: 1712,
        equipment: [{ slot: EquipSlot.AMULET, objIds: [1712, 1712, 1712, 1712, 1712] }],
    },
    {
        id: "tome_of_fire",
        name: "Tome of fire",
        description: "Weapons recharge faster.",
        stat: "cooldown",
        perLevel: 0.04,
        effect: "weapon speed",
        unit: "percent",
        maxLevel: 5,
        rarity: "rare",
        iconObjId: 20714,
        equipment: [{ slot: EquipSlot.SHIELD, objIds: [20714, 20714, 20714, 20714, 20714] }],
    },
    {
        id: "vengeance",
        name: "Vengeance",
        description: "Whatever hits you is hit back.",
        stat: "thorns",
        perLevel: 3,
        effect: "recoil damage",
        unit: "flat",
        maxLevel: 5,
        rarity: "uncommon",
        // An astral rune
        iconObjId: 9075,
        unlock: { kind: "killBoss", mapId: "fremennik", enemyId: "dagannoth_prime" },
    },
    {
        id: "obsidian_armour",
        name: "Obsidian armour",
        description: "More hitpoints. Each level adds a piece.",
        stat: "maxHp",
        perLevel: 0.08,
        effect: "max hitpoints",
        unit: "percent",
        maxLevel: 3,
        rarity: "uncommon",
        iconObjId: 21301,
        equipment: [
            { slot: EquipSlot.HEAD, objIds: [21298, 21298, 21298] },
            { slot: EquipSlot.LEGS, objIds: [-1, 21304, 21304] },
            { slot: EquipSlot.TORSO, objIds: [-1, -1, 21301] },
        ],
        unlock: { kind: "killBoss", mapId: "karamja", enemyId: "ket_zek" },
    },
    {
        id: "book_of_the_dead",
        name: "Book of the dead",
        description: "Freezes, poison and the rest last longer.",
        stat: "duration",
        perLevel: 0.1,
        effect: "effect duration",
        unit: "percent",
        maxLevel: 5,
        rarity: "uncommon",
        iconObjId: 25818,
        unlock: { kind: "killBoss", mapId: "kourend", enemyId: "skotizo" },
    },
    {
        id: "dizanas_quiver",
        name: "Dizana's quiver",
        description: "One more of every projectile, whatever the pick's rarity.",
        stat: "amount",
        perLevel: 1,
        effect: "projectiles",
        unit: "flat",
        whole: true,
        maxLevel: 2,
        rarity: "veryRare",
        iconObjId: 28951,
        equipment: [{ slot: EquipSlot.CAPE, objIds: [28951, 28951] }],
        unlock: { kind: "beatMap", mapId: "varlamore" },
    },
    // The prayers from the raids' scrolls, and the Ancient sceptre for the
    // Ancient spells. Each one's weapons evolve with it.
    {
        id: "rigour",
        name: "Rigour",
        description: "Arrows, bolts and everything thrown hit harder.",
        stat: "rangedMight",
        perLevel: 0.08,
        effect: "ranged damage",
        unit: "percent",
        maxLevel: 5,
        rarity: "uncommon",
        // A dexterous prayer scroll
        iconObjId: 21034,
    },
    {
        id: "augury",
        name: "Augury",
        description: "Spells hit harder, and freezes, poison and the rest last longer.",
        stat: "magicMight",
        perLevel: 0.07,
        effect: "magic damage and effect duration",
        unit: "percent",
        maxLevel: 5,
        rarity: "uncommon",
        // An arcane prayer scroll
        iconObjId: 21079,
        alsoAdds: ["duration"],
    },
    {
        id: "ancient_sceptre",
        name: "Ancient sceptre",
        description: "Auras and Ancient spells cover more ground.",
        stat: "auraArea",
        perLevel: 0.1,
        effect: "aura area",
        unit: "percent",
        maxLevel: 5,
        rarity: "uncommon",
        iconObjId: 27624,
    },
];

export const PASSIVE_BY_ID: Map<string, PassiveDef> = new Map(PASSIVES.map((p) => [p.id, p]));

export function getPassive(id: string): PassiveDef {
    const passive = PASSIVE_BY_ID.get(id);
    if (!passive) {
        throw new Error("Unknown passive " + id);
    }
    return passive;
}

// Whether a passive at this level can take another pick: up to its max level,
// and on past it in endless runs unless one of its stats is capped
export function canLevelPassive(passive: PassiveDef, level: number, endless: boolean): boolean {
    const capped = [passive.stat, ...(passive.alsoAdds ?? [])].some((s) => CAPPED_STATS.has(s));
    return level < passive.maxLevel || (endless && !capped);
}

// What one pick of this quality adds to the passive's stat
export function getPassiveGain(passive: PassiveDef, quality: Rarity): number {
    return passive.whole ? passive.perLevel : passive.perLevel * RARITIES[quality].power;
}

// "+12% damage", "+1.5 armour"
export function formatPassiveValue(passive: PassiveDef, value: number): string {
    if (passive.unit === "percent") {
        return `+${Math.round(value * 100)}% ${passive.effect}`;
    }
    return `+${Math.round(value * 10) / 10} ${passive.effect}`;
}
