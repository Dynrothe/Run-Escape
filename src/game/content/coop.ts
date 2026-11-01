// Co-op: two to four players in one run. Everyone's weapons are on the same
// crowd, so it comes bigger and tougher with each player past the first, and
// bosses keep up with the party's damage. The crowd's attention is split
// between the players, so its hits are harder too. The run's level is shared
// (every level up gives each player their own pick) and a bigger crowd drops
// more bones, so each is worth a little less, and the party levels about as
// fast as a player on their own. It's worked out again from the players
// still up whenever one goes down or leaves, so the last of them isn't
// facing a crowd made for four.

export const MAX_PARTY = 4;

export type PartyScale = {
    // Multiplies the waves' spawn rate and how many are about at once
    crowd: number;
    // Multiplies enemies' hitpoints (bosses' too, by their own amount)
    hp: number;
    bossHp: number;
    // Multiplies everything enemies hit with: touches, shots, bosses' attacks
    damage: number;
    // Multiplies the experience in enemies' bones
    xp: number;
    // Multiplies the chance of an enemy dropping a casket, so there's gear
    // enough for everyone
    caskets: number;
};

// Each player past the first adds this much of each (the experience, takes
// it away)
const CROWD_PER_PLAYER = 0.35;
const HP_PER_PLAYER = 0.5;
const BOSS_HP_PER_PLAYER = 1.1;
const DAMAGE_PER_PLAYER = 0.1;
const XP_PER_PLAYER = -0.12;
const CASKETS_PER_PLAYER = 0.4;

export function getPartyScale(players: number): PartyScale {
    const extra = Math.max(0, Math.min(players, MAX_PARTY) - 1);
    return {
        crowd: 1 + CROWD_PER_PLAYER * extra,
        hp: 1 + HP_PER_PLAYER * extra,
        bossHp: 1 + BOSS_HP_PER_PLAYER * extra,
        damage: 1 + DAMAGE_PER_PLAYER * extra,
        xp: 1 + XP_PER_PLAYER * extra,
        caskets: 1 + CASKETS_PER_PLAYER * extra,
    };
}
