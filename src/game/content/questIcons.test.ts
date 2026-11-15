import { describe, expect, test } from "vitest";

import { getEnemy } from "./enemies";
import { QUEST_ICON_OBJ_IDS } from "./questIcons";
import { QUESTS } from "./quests";

describe("quest icons", () => {
    test("every quest has its own icon, and none is left over", () => {
        for (const quest of QUESTS) {
            expect(QUEST_ICON_OBJ_IDS[quest.id], quest.id).toBeGreaterThan(0);
        }
        const ids = new Set(QUESTS.map((quest) => quest.id));
        for (const id of Object.keys(QUEST_ICON_OBJ_IDS)) {
            expect(ids.has(id), id).toBe(true);
        }
    });

    test("what a kill quest is after has a face to show", () => {
        for (const quest of QUESTS) {
            const objective = quest.objective;
            if (objective.kind === "kill" || objective.kind === "killEach") {
                for (const id of objective.enemyIds) {
                    expect(getEnemy(id).npcId, id).toBeGreaterThan(0);
                }
            }
        }
    });
});
