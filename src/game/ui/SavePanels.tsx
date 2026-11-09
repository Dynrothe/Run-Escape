import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { SaveBlock } from "../client/GameStore";
import { SaveData } from "../core/save";
import { dateLocale, t } from "../i18n";
import "./NoticePanel.css";
import { GAME_VERSION } from "./changelog";
import {
    dismissExportReminder,
    loadExportReminderDismissed,
    shouldRemindToExport,
} from "./exportReminder";

// What the panel says about why nothing's saved, and the way out it offers
// (besides playing on without saving)
function describeBlock(
    block: SaveBlock,
    client: GameClient,
): { title: string; body: JSX.Element; actions: JSX.Element } {
    const reload = (
        <button className="ui-button" onClick={() => window.location.reload()}>
            {t("save.reload")}
        </button>
    );
    switch (block.kind) {
        case "otherTab":
            return {
                title: t("save.other_tab_title"),
                body: (
                    <>
                        <p>{t("save.other_tab_body_1")}</p>
                        <p>{t("save.other_tab_body_2")}</p>
                    </>
                ),
                actions: (
                    <button className="ui-button" onClick={() => client.takeOverSave()}>
                        {t("save.play_here")}
                    </button>
                ),
            };
        case "newerGame":
            return {
                title: t("save.newer_title"),
                body: (
                    <>
                        <p>
                            {t("save.newer_body", {
                                saved: block.gameVersion
                                    ? t("save.version_of", { version: block.gameVersion })
                                    : t("save.a_newer"),
                                version: GAME_VERSION,
                            })}
                        </p>
                        <p>
                            {t("save.newer_reload")}
                            {!block.format && t("save.newer_anyway_warning")}
                        </p>
                    </>
                ),
                actions: (
                    <>
                        {reload}
                        {!block.format && (
                            <button className="ui-button" onClick={() => client.saveOverNewer()}>
                                {t("save.save_anyway")}
                            </button>
                        )}
                    </>
                ),
            };
        case "noRoom":
            return {
                title: t("save.unreadable_title"),
                body: (
                    <>
                        <p>{t("save.no_room_body_1")}</p>
                        <p>{t("save.no_room_body_2")}</p>
                    </>
                ),
                actions: (
                    <>
                        <button className="ui-button" onClick={() => client.exportSave()}>
                            {t("save.export")}
                        </button>
                        {reload}
                    </>
                ),
            };
    }
}

// Over everything while nothing's being saved, until the player picks what to
// do about it
export function SaveBlockPanel({
    block,
    client,
}: {
    block: SaveBlock;
    client: GameClient;
}): JSX.Element {
    const { title, body, actions } = describeBlock(block, client);
    // ui-fill for the UI's font, as it's not on a screen
    return (
        <div className="ui-fill ui-modal ui-save-block">
            <div className="ui-panel rs-border rs-background ui-notice">
                <h2>{title}</h2>
                <div className="ui-notice-body">{body}</div>
                <div className="ui-notice-close">
                    {actions}
                    <button className="ui-button" onClick={() => client.playWithoutSaving()}>
                        {t("save.play_without")}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Over the title screen when the save couldn't be read, and a fresh one's
// taken its place
export function UnreadableSavePanel({
    keptAs,
    client,
}: {
    keptAs: string;
    client: GameClient;
}): JSX.Element {
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-notice">
                <h2>{t("save.unreadable_title")}</h2>
                <div className="ui-notice-body">
                    <p>{t("save.unreadable_body_1")}</p>
                    <p>{t("save.unreadable_body_2")}</p>
                </div>
                <div className="ui-notice-close">
                    <button
                        className="ui-button"
                        onClick={() => client.exportUnreadableSave(keptAs)}
                    >
                        {t("save.export")}
                    </button>
                    <button className="ui-button" onClick={() => client.closeUnreadableNotice()}>
                        {t("save.got_it")}
                    </button>
                </div>
            </div>
        </div>
    );
}

// A slim line under the title's menu, until the save's exported or put off for
// the day: players who cleared their browser's data had no copy to import
export function ExportReminder({
    save,
    client,
}: {
    save: SaveData;
    client: GameClient;
}): JSX.Element | null {
    const [dismissed, setDismissed] = useState(loadExportReminderDismissed);
    if (!shouldRemindToExport(save, Date.now(), dismissed)) {
        return null;
    }
    const last = save.lastExported;
    return (
        <div className="ui-panel rs-border rs-background ui-export-reminder">
            <span className="ui-export-reminder-text">
                {last === undefined
                    ? t("save.export_reminder_first")
                    : t("save.export_reminder", {
                          date: new Date(last).toLocaleDateString(dateLocale()),
                      })}
            </span>
            <span className="ui-export-reminder-buttons">
                <button className="ui-button ui-button-small" onClick={() => client.exportSave()}>
                    {t("save.export_save")}
                </button>
                <button
                    className="ui-button ui-button-small"
                    onClick={() => setDismissed(dismissExportReminder(Date.now()))}
                >
                    {t("save.not_today")}
                </button>
            </span>
        </div>
    );
}
