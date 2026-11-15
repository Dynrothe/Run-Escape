import { portraitRequest } from "../content/portraitConfig";
import { getPortrait } from "../content/portraits";
import { PAUSE_TAB_SPRITES } from "../content/titleIcons";
import { EnemyDef } from "../content/types";
import { ItemIcon, NpcHead } from "./ItemIcon";

// A monster's portrait, framed as content/portraits.json has it
export function EnemyHead({ enemy, size }: { enemy: EnemyDef; size: number }): JSX.Element {
    // Fun-map opponents built from player outfits have no NPC id/head in the cache. Give them a
    // real, cached humanoid icon rather than leaving an unexplained empty portrait frame.
    if (enemy.outfits || enemy.npcId < 0) {
        return <ItemIcon objId={-1} spriteId={PAUSE_TAB_SPRITES.loadout} size={size} />;
    }
    return <NpcHead {...portraitRequest(enemy, getPortrait(enemy.id))} size={size} />;
}
