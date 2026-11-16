import { EnemyPortrait, cleanPortrait } from "./portraitConfig";
import saved from "./portraits.json";

// Each monster's portrait framing, by enemy id. See portraitConfig.ts for what's in one.
const PORTRAITS = new Map<string, EnemyPortrait>();
for (const [enemyId, value] of Object.entries(saved as Record<string, unknown>)) {
    const portrait = cleanPortrait(value);
    if (portrait) {
        PORTRAITS.set(enemyId, portrait);
    }
}

export function getPortrait(enemyId: string): EnemyPortrait | undefined {
    return PORTRAITS.get(enemyId);
}
