import { portraitRequest } from "../content/portraitConfig";
import { getPortrait } from "../content/portraits";
import { EnemyDef } from "../content/types";
import { NpcHead } from "./ItemIcon";

// A monster's portrait, framed as content/portraits.json has it
export function EnemyHead({ enemy, size }: { enemy: EnemyDef; size: number }): JSX.Element {
    return <NpcHead {...portraitRequest(enemy, getPortrait(enemy.id))} size={size} />;
}
