import { t } from "../i18n";
import { StatIconRef } from "./statIcons";

// What kind of damage a hit on an enemy was, for the stats screens (Sim.damageKind): a weapon's
// style, a weapon's venom or burning ground, the Ring of recoil, a power-up (a cannon, thralls), a
// utility item, the fight's own button and its arena turned on the boss, or anything else
export const DAMAGE_KINDS = [
    "melee",
    "ranged",
    "magic",
    "poison",
    "burn",
    "recoil",
    "powerUp",
    "item",
    "arena",
    "other",
] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];

// Each kind's icon, from the cache: the skill tab's, the poison hitsplat, or an item.
// scripts/cache/slim-plan.ts and getGameSpriteIds keep them in the slim cache.
export const DAMAGE_KIND_ICONS: Record<DamageKind, StatIconRef | undefined> = {
    melee: { spriteId: 197 }, // Attack
    ranged: { spriteId: 200 }, // Ranged
    magic: { spriteId: 202 }, // Magic
    poison: { spriteId: 1360 }, // The poison hitsplat (GameAssets' HITSPLAT_SPRITES)
    burn: { objId: 554 }, // Fire rune
    recoil: { objId: 2550 }, // Ring of recoil
    powerUp: { objId: 6 }, // Cannon base, the cannon power-up's
    item: { objId: 10034 }, // Red chinchompa, a utility item that blasts
    arena: undefined,
    other: undefined,
};

// The plank on the Combat tab's worst weapon, the ranking's cabbage-patch joke (item icons the slim
// cache keeps with the kinds')
export const RANK_PLANK_OBJ = 960;

export const DAMAGE_KIND_OBJ_IDS: number[] = [
    ...Object.values(DAMAGE_KIND_ICONS).flatMap((icon) =>
        icon?.objId !== undefined ? [icon.objId] : [],
    ),
    RANK_PLANK_OBJ,
];

export const DAMAGE_KIND_SPRITE_IDS: number[] = Object.values(DAMAGE_KIND_ICONS).flatMap((icon) =>
    icon?.spriteId !== undefined ? [icon.spriteId] : [],
);

export function damageKindName(kind: DamageKind): string {
    return t(`combat.kind.${kind}`);
}

// What counts as the kind, for its tooltip
export function damageKindDescription(kind: DamageKind): string {
    return t(`combat.kind.${kind}.desc`);
}

// Each kind's colour, for the damage mix bar and the weapons' kind tags
export const DAMAGE_KIND_COLORS: Record<DamageKind, string> = {
    melee: "#e0702c",
    ranged: "#58b84a",
    magic: "#4f94e8",
    poison: "#9ad13c",
    burn: "#ff9a1f",
    recoil: "#c9a45c",
    powerUp: "#b575ff",
    item: "#e45a5a",
    arena: "#8f86ff",
    other: "#9b9480",
};
