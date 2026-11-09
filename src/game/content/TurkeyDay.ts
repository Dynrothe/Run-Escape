import { PlayerEffectDef, Stats } from "./types";

// Harvest Feast: on these maps enemies now and then drop a roasted turkey,
// which is walked over like a power-up and carved for a feast or a fowl trick.
export const TURKEY_MAPS: readonly string[] = ["thanksgiving"];
export const TURKEY_ID = "cooked_turkey";

// A kill's chance of dropping one (luck makes it likelier)
export const TURKEY_CHANCE = 0.015; // Slightly higher chance than pumpkin

// Seconds after one drops before another can
export const TURKEY_MIN_GAP = 20;

export type TurkeyOutcome = {
    // Shown as it is carved, starting with Feast! or Fowl!
    message: string;
    weight: number;
    trick: boolean;
    does: 
        // Heals this fraction of the player's hitpoints
        | { kind: "heal"; fraction: number }
        // Coins, before greed
        | { kind: "coins"; coins: number }
        // A boost for a while, shown like a potion's with this item's icon
        | { kind: "buff"; itemId: string; stats: Partial<Stats>; seconds: number }
        // Enemies around the player, which drop nothing but their bones
        | { kind: "enemies"; enemyId: string; count: number }
        // What a boss's attack can do to the player
        | { kind: "effect"; effect: PlayerEffectDef };
};

export const TURKEY_OUTCOMES: TurkeyOutcome[] = [
    {
        message: "Feast! A generous serving of roast turkey heals you.",
        weight: 4,
        trick: false,
        does: { kind: "heal", fraction: 0.4 }, // Better healing for a massive feast!
    },
    {
        message: "Feast! The turkey stuffing was filled with hidden coins.",
        weight: 3,
        trick: false,
        does: { kind: "coins", coins: 100 },
    },
    {
        message: "Feast! Hearty Thanksgiving dinner gives you immense vigor for 25 seconds.",
        weight: 2,
        trick: false,
        does: {
            kind: "buff",
            itemId: "super_combat_potion",
            stats: { might: 0.25, armor: 0.15 }, // Tanky combat buff from eating well
            seconds: 25,
        },
    },
    {
        message: "Fowl! Angry, vengeful Chompy Birds burst from the carcass!",
        weight: 3,
        trick: true,
        does: { kind: "enemies", enemyId: "chompy_bird", count: 6 }, // Spawns your map theme enemies
    },
    {
        message: "Fowl! A massive food coma hits you: sleepy and slow for 5 seconds.",
        weight: 2,
        trick: true,
        does: {
            kind: "effect",
            effect: {
                kind: "debuff",
                id: "food_coma",
                name: "Food Coma: Tryptophan overload",
                // OSRS Asset ID for Cooked Turkey / Roast item icon
                iconObjId: 2313, 
                stats: { moveSpeed: -0.4 },
                seconds: 5,
            },
        },
    },
];
