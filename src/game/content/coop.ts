import { COOP_BALANCE } from "./balance";

// Co-op: two to four players in one run. Everyone's weapons are on the same
// crowd, so it comes bigger and tougher with each player past the first, and
// bosses keep up with the party's damage. The crowd's attention is split
// between the players, so its hits are harder too. The run's level is shared
// (every level up gives each player their own pick) and a bigger crowd drops
// more bones, so each is worth a little less, and the party levels about as
// fast as a player on their own. It's worked out again whenever a player
// goes down or leaves, counting each of them as half a player (PLAYER_GONE),
// so the rest have it easier but not as easy as a party that size.

export const MAX_PARTY = 4;

// How much of a player one who's down or gone still counts for in the
// party's scale
export const PLAYER_GONE = COOP_BALANCE.playerGone;

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

export function getPartyScale(players: number): PartyScale {
    const extra = Math.max(0, Math.min(players, MAX_PARTY) - 1);
    const perPlayer = COOP_BALANCE.perExtraPlayer;
    return {
        crowd: 1 + perPlayer.crowd * extra,
        hp: 1 + perPlayer.hp * extra,
        bossHp: 1 + perPlayer.bossHp * extra,
        damage: 1 + perPlayer.damage * extra,
        xp: 1 + perPlayer.xp * extra,
        caskets: 1 + perPlayer.caskets * extra,
    };
}
