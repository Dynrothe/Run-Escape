import { PlayerEffectDef, Stats } from "./types";

// Trick or treat: on these maps enemies now and then drop a pumpkin, which is
// walked over like a power-up and turns out to be a treat or a trick.
export const PUMPKIN_MAPS: readonly string[] = ["halloween"];
export const PUMPKIN_ID = "pumpkin";
// A kill's chance of dropping one (luck makes it likelier)
export const PUMPKIN_CHANCE = 0.012;
// Seconds after one drops before another can
export const PUMPKIN_MIN_GAP = 25;

export type PumpkinOutcome = {
    // Shown as it opens, starting with Treat! or Trick!
    message: string;
    weight: number;
    trick: boolean;
    does: // Heals this fraction of the player's hitpoints
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

export const PUMPKIN_OUTCOMES: PumpkinOutcome[] = [
    {
        message: "Treat! A slice of pumpkin pie heals you.",
        weight: 3,
        trick: false,
        does: { kind: "heal", fraction: 0.3 },
    },
    {
        message: "Treat! The pumpkin is stuffed with coins.",
        weight: 3,
        trick: false,
        does: { kind: "coins", coins: 60 },
    },
    {
        message: "Treat! A sugar rush: faster and stronger for 15 seconds.",
        weight: 2,
        trick: false,
        does: {
            kind: "buff",
            itemId: "super_combat_potion",
            stats: { might: 0.2, moveSpeed: 0.2 },
            seconds: 15,
        },
    },
    {
        message: "Trick! Ghosts burst out of the pumpkin!",
        weight: 3,
        trick: true,
        does: { kind: "enemies", enemyId: "ghost", count: 4 },
    },
    {
        message: "Trick! The pumpkin curses you: slower for 6 seconds.",
        weight: 2,
        trick: true,
        does: {
            kind: "effect",
            effect: {
                kind: "debuff",
                id: "pumpkin_curse",
                name: "Cursed: legs like jelly",
                // Pumpkin
                iconObjId: 1959,
                stats: { moveSpeed: -0.3 },
                seconds: 6,
            },
        },
    },
];
