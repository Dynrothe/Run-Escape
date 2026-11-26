import { ACT2_LORE } from "./monsterLore/act2";
import { MONSTER_DROPS } from "./monsterLore/drops";
import { EARLY_LORE } from "./monsterLore/early";
import { FUN_LORE } from "./monsterLore/fun";
import { GWD_LORE } from "./monsterLore/gwd";
import { KOUREND_LORE } from "./monsterLore/kourend";
import { MonsterLore } from "./monsterLore/lore";
import { RAIDS_LORE } from "./monsterLore/raids";

export type { MonsterLore };
export { MONSTER_DROPS };

// The Monster diary's text, by the monster's English name (EnemyDef.name). Where two files give the
// same name, the later one wins: the same monster seen on different maps.
export const MONSTER_LORE: Record<string, MonsterLore> = {
    ...EARLY_LORE,
    ...KOUREND_LORE,
    ...GWD_LORE,
    ...ACT2_LORE,
    ...RAIDS_LORE,
    ...FUN_LORE,
};
