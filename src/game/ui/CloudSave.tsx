import { ReactNode, useState } from "react";

import { CloudProblem, CloudSummary, CloudView, summarize } from "../client/CloudSave";
import { GameClient } from "../client/GameClient";
import { CLOUD_SAVE_SPRITES } from "../content/titleIcons";
import { SaveData } from "../core/save";
import { dateLocale, fmtNum, t } from "../i18n";
import { ItemIcon } from "./ItemIcon";
import "./NoticePanel.css";
import { GAME_VERSION } from "./changelog";
import { releaseFocus } from "./menuKeys";

const PROBLEMS: Record<CloudProblem, string> = {
    offline: "cloud.problem.offline",
    unknownCode: "cloud.problem.unknown_code",
    deleted: "cloud.problem.deleted",
    refused: "cloud.problem.refused",
};

const when = (time: number | string) => new Date(time).toLocaleString(dateLocale());

// What's wrong, for Settings and the title's button: a deleted code says until when it's kept,
// and a linked one that stopped working says what to do
function describeProblem(cloud: CloudView): string | undefined {
    if (cloud.problem === "deleted" && cloud.deletedUntil) {
        const until = new Date(cloud.deletedUntil).toLocaleDateString(dateLocale());
        return t("cloud.problem.deleted_until", { date: until });
    }
    if (cloud.problem === "unknownCode" && cloud.code) {
        return t("cloud.problem.code_dead");
    }
    return cloud.problem && t(PROBLEMS[cloud.problem]);
}

function describe(summary: CloudSummary | undefined): string {
    if (!summary) {
        return t("cloud.summary.nothing");
    }
    return t("cloud.summary", {
        runs: fmtNum(summary.runs),
        wins: fmtNum(summary.victories),
        maps: summary.mapsBeaten,
        coins: fmtNum(summary.totalCoins),
    });
}

// The Settings row's layout, as GameUi's Setting draws it. wide: its control is a box to type
// in, which wraps under the label and shrinks to fit a narrow screen.
function CloudRow({
    name,
    text,
    wide = false,
    children,
}: {
    name: string;
    text?: ReactNode;
    wide?: boolean;
    children?: ReactNode;
}): JSX.Element {
    return (
        <div className={"ui-setting" + (wide ? " ui-setting-wide" : "")}>
            <div className="ui-setting-label">
                <div className="ui-setting-name">{name}</div>
                {text && <div className="ui-setting-text">{text}</div>}
            </div>
            {children && <div className="ui-setting-control">{children}</div>}
        </div>
    );
}

// Settings' cloud save rows: turning it on, linking a code, and the code itself. Only in a build
// with a cloud-save Worker that answered.
export function CloudSaveSettings({
    cloud,
    client,
    saving,
    inPanel = false,
}: {
    cloud: CloudView | undefined;
    client: GameClient;
    // Whether this tab's saving at all (no save block)
    saving: boolean;
    // In cloud save's own panel, whose heading already says what it is
    inPanel?: boolean;
}): JSX.Element | null {
    const first = inPanel ? t("cloud.status") : t("cloud.title");
    const [typed, setTyped] = useState("");
    const [copied, setCopied] = useState(false);
    const sync = client.cloud;
    if (!cloud || !sync) {
        return null;
    }
    const busy = cloud.working || !saving;
    const blur = releaseFocus;
    const problem = describeProblem(cloud);
    // A deleted code's saves can come back
    const restore = cloud.problem === "deleted" && (
        <button
            className="ui-button ui-button-small"
            disabled={busy}
            onClick={(e) => {
                blur(e);
                sync.restore();
            }}
        >
            {t("cloud.restore")}
        </button>
    );
    if (!cloud.code) {
        return (
            <>
                <CloudRow name={first} text={problem ?? t("cloud.off.text")}>
                    {restore}
                    <button
                        className="ui-button ui-button-small"
                        disabled={busy}
                        onClick={(e) => {
                            blur(e);
                            sync.turnOn();
                        }}
                    >
                        {t("cloud.turn_on")}
                    </button>
                </CloudRow>
                <CloudRow name={t("cloud.have_code.name")} text={t("cloud.have_code.text")} wide>
                    <form
                        className="ui-cloud-link"
                        onSubmit={(e) => {
                            e.preventDefault();
                            sync.useCode(typed).then((linked) => linked && setTyped(""));
                        }}
                    >
                        <input
                            className="ui-coop-input ui-cloud-code-input"
                            value={typed}
                            placeholder={t("cloud.code_label")}
                            spellCheck={false}
                            autoCapitalize="characters"
                            autoComplete="off"
                            aria-label={t("cloud.code_label")}
                            onChange={(e) => setTyped(e.target.value)}
                        />
                        <button
                            className="ui-button ui-button-small"
                            type="submit"
                            disabled={busy || typed.trim().length === 0}
                        >
                            {t("cloud.link")}
                        </button>
                    </form>
                </CloudRow>
            </>
        );
    }
    const status = cloud.working
        ? t("cloud.syncing")
        : (problem ??
          (cloud.syncedAt ? t("cloud.on_synced", { when: when(cloud.syncedAt) }) : t("cloud.on")));
    const code = cloud.code;
    // A code that's stopped working can only be turned off
    const dead = cloud.problem === "unknownCode";
    return (
        <>
            <CloudRow name={first} text={status}>
                {restore}
                <button
                    className="ui-button ui-button-small"
                    disabled={busy || dead}
                    onClick={(e) => {
                        blur(e);
                        sync.check(true);
                    }}
                >
                    {t("cloud.sync_now")}
                </button>
                <button
                    className="ui-button ui-button-small"
                    disabled={cloud.working}
                    onClick={(e) => {
                        blur(e);
                        if (window.confirm(t("cloud.turn_off_confirm"))) {
                            sync.turnOff();
                        }
                    }}
                >
                    {t("cloud.turn_off")}
                </button>
            </CloudRow>
            {cloud.choice?.closed && (
                <CloudRow name={t("cloud.two_saves.name")} text={t("cloud.two_saves.text")}>
                    <button
                        className="ui-button ui-button-small"
                        onClick={(e) => {
                            blur(e);
                            sync.reopenChoice();
                        }}
                    >
                        {t("cloud.choose")}
                    </button>
                </CloudRow>
            )}
            <CloudRow
                name={t("cloud.your_code.name")}
                text={
                    <>
                        <span className="ui-cloud-code">{code}</span>
                        <br />
                        {t("cloud.your_code.text")}
                    </>
                }
            >
                <button
                    className="ui-button ui-button-small"
                    onClick={(e) => {
                        blur(e);
                        navigator.clipboard?.writeText(code).then(
                            () => setCopied(true),
                            () => setCopied(false),
                        );
                    }}
                >
                    {copied ? t("cloud.copied") : t("cloud.copy")}
                </button>
                <button
                    className="ui-button ui-button-small"
                    disabled={busy || dead}
                    onClick={(e) => {
                        blur(e);
                        if (window.confirm(t("cloud.new_code_confirm"))) {
                            setCopied(false);
                            sync.newCode();
                        }
                    }}
                >
                    {t("cloud.new_code")}
                </button>
            </CloudRow>
            <CloudRow name={t("cloud.delete.name")} text={t("cloud.delete.text")}>
                <button
                    className="ui-button ui-button-small"
                    disabled={cloud.working}
                    onClick={(e) => {
                        blur(e);
                        if (window.confirm(t("cloud.delete_confirm"))) {
                            sync.deleteCloud();
                        }
                    }}
                >
                    {t("cloud.delete")}
                </button>
            </CloudRow>
        </>
    );
}

// Over the title screen when the cloud has a different save from this device's, until the
// player picks one or puts it off
export function CloudChoicePanel({
    cloud,
    save,
    client,
}: {
    cloud: CloudView;
    save: SaveData;
    client: GameClient;
}): JSX.Element | null {
    const choice = cloud.choice;
    const sync = client.cloud;
    if (!choice || !sync) {
        return null;
    }
    const theirs = choice.cloud;
    const savedAt = theirs.updatedAt && when(theirs.updatedAt);
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-notice">
                <h2>{t("cloud.choice.title")}</h2>
                <div className="ui-notice-body">
                    <p>{t("cloud.choice.different")}</p>
                    <p>
                        <b>{t("cloud.choice.cloud")}</b>
                        {savedAt && t("cloud.choice.saved", { when: savedAt })}:{" "}
                        {describe(theirs.summary)}
                        {theirs.summary && ` (v${theirs.summary.gameVersion})`}
                    </p>
                    <p>
                        <b>{t("cloud.choice.this_device")}</b>:{" "}
                        {describe(summarize(save, GAME_VERSION))}
                    </p>
                    {choice.newer ? (
                        <p>{t("cloud.choice.newer", { version: GAME_VERSION })}</p>
                    ) : (
                        <p>{t("cloud.choice.replaced")}</p>
                    )}
                </div>
                <div className="ui-notice-close">
                    <button
                        className="ui-button"
                        disabled={choice.newer || cloud.working}
                        onClick={() => sync.useCloud()}
                    >
                        {t("cloud.use_cloud")}
                    </button>
                    <button
                        className="ui-button"
                        disabled={cloud.working}
                        onClick={() => sync.keepLocal()}
                    >
                        {t("cloud.keep_local")}
                    </button>
                    <button className="ui-button" onClick={() => sync.later()}>
                        {t("cloud.later")}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Behind cloud save's button on the title screen: its rows from Settings, on their own
export function CloudSavePanel({
    cloud,
    client,
    saving,
    onClose,
}: {
    cloud: CloudView | undefined;
    client: GameClient;
    saving: boolean;
    onClose: () => void;
}): JSX.Element {
    return (
        <div className="ui-panel rs-border rs-background ui-settings ui-cloud-panel">
            <h2>{t("cloud.title")}</h2>
            <div className="ui-settings-body">
                <CloudSaveSettings cloud={cloud} client={client} saving={saving} inPanel />
            </div>
            <div className="ui-row">
                <button className="ui-button" onClick={onClose}>
                    {t("cloud.back")}
                </button>
            </div>
        </div>
    );
}

// Beside Settings on the title screen, where cloud save's offered: whether it's on, and whether it
// needs looking at. It opens the choice when one's waiting, and cloud save's panel otherwise.
export function CloudSaveButton({
    cloud,
    client,
    onOpen,
}: {
    cloud: CloudView | undefined;
    client: GameClient;
    onOpen: () => void;
}): JSX.Element | null {
    if (!cloud || !client.cloud) {
        return null;
    }
    // While it's off, only a code just deleted is worth a mark (a mistyped one isn't)
    const problem = cloud.code || cloud.problem === "deleted" ? cloud.problem : undefined;
    const badge = cloud.choice
        ? CLOUD_SAVE_SPRITES.choose
        : problem
          ? CLOUD_SAVE_SPRITES.problem
          : undefined;
    const status = !cloud.code
        ? problem
            ? describeProblem(cloud)
            : t("cloud.button.off")
        : cloud.choice
          ? t("cloud.button.choose")
          : cloud.problem
            ? describeProblem(cloud)
            : cloud.syncedAt
              ? t("cloud.button.on_synced", { when: when(cloud.syncedAt) })
              : t("cloud.button.on");
    return (
        <button
            className={
                "ui-title-link ui-title-settings ui-title-cloud" +
                (cloud.code ? "" : " ui-title-cloud-off")
            }
            title={t("cloud.button.label", { status: status ?? "" })}
            aria-label={t("cloud.button.label", { status: status ?? "" })}
            onClick={(e) => {
                releaseFocus(e);
                if (cloud.choice) {
                    client.cloud?.reopenChoice();
                } else {
                    onOpen();
                }
            }}
        >
            <ItemIcon objId={-1} spriteId={CLOUD_SAVE_SPRITES.saved} />
            {badge !== undefined && (
                <span className="ui-title-cloud-badge">
                    <ItemIcon objId={-1} spriteId={badge} size={24} />
                </span>
            )}
        </button>
    );
}
