import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { getMap } from "../content/maps";
import { QUESTS, describeQuest } from "../content/quests";
import { QuestDef } from "../content/types";
import { SaveData, getQuestProgress, isMapUnlocked } from "../core/save";
import { fmtNum, t, tl } from "../i18n";
import { Coins } from "./Coins";
import "./QuestScreen.css";
import { useMenuKeys } from "./menuKeys";

// The quest list, map by map like the client's quest tab: red until started,
// yellow while under way, green once done. Each shows how far it's got and
// what it pays.

type Props = { ui: UiSnapshot; client: GameClient };

type QuestGroup = { mapId?: string; quests: QuestDef[] };

// The quests in their maps' order, the ones done all over last
function getQuestGroups(): QuestGroup[] {
    const groups: QuestGroup[] = [];
    for (const quest of QUESTS) {
        const group = groups.find((g) => g.mapId === quest.mapId);
        if (group) {
            group.quests.push(quest);
        } else {
            groups.push({ mapId: quest.mapId, quests: [quest] });
        }
    }
    return groups;
}

// What there is to do first: groups with a quest under way, then those that can be started, then
// those on a map that isn't open yet, and the finished ones last. In each, those under way first,
// then the rest left, then what's done.
function orderQuestGroups(save: SaveData, groups: QuestGroup[]): QuestGroup[] {
    const isDone = (quest: QuestDef) => save.questsDone.includes(quest.id);
    const isStarted = (quest: QuestDef) => !isDone(quest) && getQuestProgress(save, quest).done > 0;
    const rank = ({ mapId, quests }: QuestGroup) => {
        if (quests.every(isDone)) {
            return 3;
        }
        if (mapId && !isMapUnlocked(save, mapId)) {
            return 2;
        }
        return quests.some(isStarted) ? 0 : 1;
    };
    return groups
        .map((group, order) => ({ group, order, rank: rank(group) }))
        .sort((a, b) => a.rank - b.rank || a.order - b.order)
        .map(({ group }) => ({
            ...group,
            quests: [
                ...group.quests.filter(isStarted),
                ...group.quests.filter((quest) => !isDone(quest) && !isStarted(quest)),
                ...group.quests.filter(isDone),
            ],
        }));
}

export function QuestScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const [hideDone, setHideDone] = useState(false);
    useMenuKeys({ onBack: () => client.showScreen("title") });
    const groups = orderQuestGroups(save, getQuestGroups())
        .map((group) => ({
            ...group,
            quests: hideDone
                ? group.quests.filter((quest) => !save.questsDone.includes(quest.id))
                : group.quests,
        }))
        .filter((group) => group.quests.length > 0);
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-quests">
                <h2>{t("quest.title")}</h2>
                <p className="ui-subtle">{t("quest.intro")}</p>
                <div className="ui-quest-list">
                    {groups.length === 0 && (
                        <p className="ui-subtle ui-quest-none">{t("quest.none_left")}</p>
                    )}
                    {groups.map(({ mapId, quests }) => (
                        <section key={mapId ?? ""} className="ui-quest-group">
                            <h3 className="ui-quest-group-name">
                                {mapId ? tl(getMap(mapId).name) : t("quest.all_over")}
                                {mapId && !isMapUnlocked(save, mapId) && (
                                    <span className="ui-quest-group-note">
                                        {t("quest.not_open")}
                                    </span>
                                )}
                            </h3>
                            {quests.map((quest) => (
                                <QuestRow key={quest.id} save={save} quest={quest} />
                            ))}
                        </section>
                    ))}
                </div>
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        {t("canvas.back")}
                    </button>
                    <button
                        className="ui-button ui-button-small"
                        onClick={() => setHideDone(!hideDone)}
                    >
                        {hideDone ? t("quest.show_done") : t("quest.hide_done")}
                    </button>
                    <span className="ui-quests-count">
                        {t("quest.completed", {
                            done: fmtNum(save.questsDone.length),
                            total: fmtNum(QUESTS.length),
                        })}
                    </span>
                    <Coins amount={save.coins} />
                </div>
            </div>
        </div>
    );
}

function QuestRow({ save, quest }: { save: SaveData; quest: QuestDef }): JSX.Element {
    const done = save.questsDone.includes(quest.id);
    const progress = getQuestProgress(save, quest);
    const state = done ? "done" : progress.done > 0 ? "started" : "new";
    return (
        <div className={"ui-quest ui-quest-" + state}>
            <span className="ui-quest-name">{tl(quest.name)}</span>
            <span className="ui-quest-task">{describeQuest(quest.objective)}</span>
            <span className="ui-quest-progress">
                {done
                    ? t("quest.done")
                    : t("quest.progress", {
                          done: fmtNum(progress.done),
                          total: fmtNum(progress.of),
                      })}
            </span>
            <span className="ui-quest-reward">
                <Coins amount={quest.coins} />
            </span>
        </div>
    );
}
