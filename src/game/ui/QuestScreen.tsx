import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { getMap } from "../content/maps";
import { QUESTS, describeQuest } from "../content/quests";
import { QuestDef } from "../content/types";
import { SaveData, getQuestProgress, isMapUnlocked } from "../core/save";
import { Coins } from "./Coins";
import "./QuestScreen.css";

// The quest list, map by map like the client's quest tab: red until started,
// yellow while under way, green once done. Each shows how far it's got and
// what it pays.

type Props = { ui: UiSnapshot; client: GameClient };

// The quests in their maps' order, the ones done all over last
function getQuestGroups(): { mapId?: string; quests: QuestDef[] }[] {
    const groups: { mapId?: string; quests: QuestDef[] }[] = [];
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

export function QuestScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-quests">
                <h2>Quests</h2>
                <p className="ui-subtle">
                    Quests take as many runs as they need. Each pays its coins once, when the run
                    that finishes it ends.
                </p>
                <div className="ui-quest-list">
                    {getQuestGroups().map(({ mapId, quests }) => (
                        <section key={mapId ?? ""} className="ui-quest-group">
                            <h3 className="ui-quest-group-name">
                                {mapId ? getMap(mapId).name : "All over"}
                                {mapId && !isMapUnlocked(save, mapId) && (
                                    <span className="ui-quest-group-note">not open yet</span>
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
                        Back
                    </button>
                    <span className="ui-quests-count">
                        Completed {save.questsDone.length} / {QUESTS.length}
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
            <span className="ui-quest-name">{quest.name}</span>
            <span className="ui-quest-task">{describeQuest(quest.objective)}</span>
            <span className="ui-quest-progress">
                {done
                    ? "Done"
                    : `${progress.done.toLocaleString()} / ${progress.of.toLocaleString()}`}
            </span>
            <span className="ui-quest-reward">
                <Coins amount={quest.coins} />
            </span>
        </div>
    );
}
