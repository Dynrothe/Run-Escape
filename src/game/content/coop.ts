// Co-op: two to four players in one run. Everyone's weapons are on the same
// crowd, so it comes bigger and tougher with each player past the first. The
// run's level is shared (every level up gives each player their own pick), so
// bones aren't scaled: a bigger crowd drops more of them.

export const MAX_PARTY = 4;

export type PartyScale = {
    // Multiplies the waves' spawn rate and how many are about at once
    crowd: number;
    // Multiplies enemies' hitpoints (bosses' too, by their own amount)
    hp: number;
    bossHp: number;
};

// Each player past the first adds this much of each
const CROWD_PER_PLAYER = 0.35;
const HP_PER_PLAYER = 0.5;
const BOSS_HP_PER_PLAYER = 0.75;

export function getPartyScale(players: number): PartyScale {
    const extra = Math.max(0, Math.min(players, MAX_PARTY) - 1);
    return {
        crowd: 1 + CROWD_PER_PLAYER * extra,
        hp: 1 + HP_PER_PLAYER * extra,
        bossHp: 1 + BOSS_HP_PER_PLAYER * extra,
    };
}
