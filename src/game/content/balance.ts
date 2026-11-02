import { CombatStyle } from "./types";

// Damage multipliers: 1 keeps the authored damage, 0.6 does 40% less, 1.2 does 20%
// more. Missing entries mean 1. All matching entries multiply together.
// See docs/BALANCE.md for examples and how these affect DPS.
export type DamageStages = {
    all?: number;
    base?: number;
    evolved?: number;
};

export type WeaponDamageProfile = DamageStages & {
    styles?: Partial<Record<CombatStyle, DamageStages>>;
    // Exact ids from weapons.ts. An evolution has its own id.
    weapons?: Record<string, number>;
};

type Difficulty = "normal" | "hard";
type PlayMode = "solo" | "coop";

export type WeaponDamageBalance = {
    global: WeaponDamageProfile;
    difficulty: Record<Difficulty, WeaponDamageProfile>;
    playMode: Record<PlayMode, WeaponDamageProfile>;
    modes: Record<PlayMode, Record<Difficulty, WeaponDamageProfile>>;
    // Starting party size; going down or leaving doesn't change weapon damage.
    partySize: Partial<Record<1 | 2 | 3 | 4, WeaponDamageProfile>>;
};

export const WEAPON_DAMAGE_BALANCE: WeaponDamageBalance = {
    global: {
        all: 1,
        base: 1,
        evolved: 0.5,
        styles: {
            melee: { all: 1, base: 1, evolved: 1 },
            ranged: { all: 1, base: 1, evolved: 1 },
            magic: { all: 1, base: 1, evolved: 1 },
        },
        weapons: {},
    },
    difficulty: { normal: {}, hard: {} },
    playMode: { solo: {}, coop: {} },
    modes: {
        solo: { normal: {}, hard: {} },
        coop: { normal: {}, hard: {} },
    },
    partySize: { 1: {}, 2: {}, 3: {}, 4: {} },
};

// Enemy and reward scaling, separate from outgoing weapon damage above.
// Each extra player adds these amounts to a multiplier starting at 1.
export const COOP_BALANCE = {
    // A downed or departed player still counts this much for enemy scaling.
    playerGone: 0.5,
    perExtraPlayer: {
        crowd: 0.35,
        hp: 0.5,
        bossHp: 1.1,
        damage: 0.1,
        xp: -0.12,
        caskets: 0.2,
    },
};
