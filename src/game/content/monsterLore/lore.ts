// What the Monster diary says about a monster, written for players (monsterDiary.ts has the
// stats and where it turns up, read from the game's own definitions). In English only.
export type MonsterLore = {
    // What it is, in a sentence or two
    about: string;
    // Where it's found in Old School RuneScape
    where: string;
    // Bits of lore and curiosities
    trivia: string[];
};

export const lore = (about: string, where: string, ...trivia: string[]): MonsterLore => ({
    about,
    where,
    trivia,
});
