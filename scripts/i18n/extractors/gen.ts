// The generated texts' English (locales/en/gen.json): what the content builds sentences from,
// each message table living beside the code that uses it. Keys: stat.*, statline.*, unlock.*,
// quest.*, evo.*, endless.*, log.*, weaponstat.*
import { LOG_MESSAGES } from "../../../src/game/content/collectionLog";
import { ENDLESS_MESSAGES } from "../../../src/game/content/endless";
import { EVOLUTIONS, EVO_MESSAGES } from "../../../src/game/content/evolutions";
import { QUESTS, QUEST_MESSAGES, questWhatKey } from "../../../src/game/content/quests";
import { STAT_MESSAGES } from "../../../src/game/content/stats";
import { UNLOCK_MESSAGES } from "../../../src/game/content/unlocks";
import { WEAPON_STAT_MESSAGES } from "../../../src/game/content/weaponStats";

// quest.<id>.name for each quest, and quest.what.<slug> for what they kill (.one when the
// quest kills one, .other for more; alone for killing each of several)
function questMessages(): Record<string, string> {
    const messages: Record<string, string> = { ...QUEST_MESSAGES };
    for (const quest of QUESTS) {
        messages[`quest.${quest.id}.name`] = quest.name;
        const objective = quest.objective;
        if (objective.kind === "kill" && objective.what !== undefined) {
            const form = objective.count === 1 ? "one" : "other";
            messages[`${questWhatKey(objective.what)}.${form}`] = objective.what;
        } else if (objective.kind === "killEach" && objective.what !== undefined) {
            messages[questWhatKey(objective.what)] = objective.what;
        }
    }
    return messages;
}

// evo.family.<family> for each family a recipe takes any of
function evoMessages(): Record<string, string> {
    const messages: Record<string, string> = { ...EVO_MESSAGES };
    for (const evolution of EVOLUTIONS) {
        const family = evolution.weapons[0].family;
        if (evolution.weapons.length > 1 && family !== undefined) {
            messages[`evo.family.${family}`] = family;
        }
    }
    return messages;
}

export default function extract(): Record<string, string> {
    return {
        ...STAT_MESSAGES,
        ...UNLOCK_MESSAGES,
        ...questMessages(),
        ...evoMessages(),
        ...ENDLESS_MESSAGES,
        ...LOG_MESSAGES,
        ...WEAPON_STAT_MESSAGES,
    };
}
