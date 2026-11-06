import { ReactNode, useState } from "react";

import { CloudProblem, CloudSummary, CloudView, summarize } from "../client/CloudSave";
import { GameClient } from "../client/GameClient";
import { CLOUD_SAVE_SPRITES } from "../content/titleIcons";
import { SaveData } from "../core/save";
import { ItemIcon } from "./ItemIcon";
import "./NoticePanel.css";
import { GAME_VERSION } from "./changelog";

const PROBLEMS: Record<CloudProblem, string> = {
    offline: "Can't reach cloud save right now. Your progress is still kept here.",
    unknownCode: "That code isn't one cloud save knows.",
    deleted: "That code's cloud save was deleted. Restore brings it back.",
    refused: "Cloud save wouldn't take this save. Export it to keep a copy.",
};

// What's wrong, for Settings and the title's button: a deleted code says until when it's kept
function describeProblem(cloud: CloudView): string | undefined {
    if (cloud.problem === "deleted" && cloud.deletedUntil) {
        const until = new Date(cloud.deletedUntil).toLocaleDateString();
        return `That code's cloud save was deleted. It's kept until ${until}, and Restore brings it back.`;
    }
    return cloud.problem && PROBLEMS[cloud.problem];
}

function describe(summary: CloudSummary | undefined): string {
    if (!summary) {
        return "nothing yet";
    }
    return (
        `${summary.runs.toLocaleString()} runs, ${summary.victories.toLocaleString()} wins, ` +
        `${summary.mapsBeaten} maps beaten, ${summary.totalCoins.toLocaleString()} coins earned`
    );
}

// Cloud save's first row in Settings, which its button on the title screen opens at
export const CLOUD_SETTING_ID = "ui-setting-cloud";

// The Settings row's layout, as GameUi's Setting draws it. wide: its control is a box to type
// in, which wraps under the label and shrinks to fit a narrow screen.
function CloudRow({
    name,
    text,
    wide = false,
    id,
    children,
}: {
    name: string;
    id?: string;
    text?: ReactNode;
    wide?: boolean;
    children?: ReactNode;
}): JSX.Element {
    return (
        <div className={"ui-setting" + (wide ? " ui-setting-wide" : "")} id={id}>
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
}: {
    cloud: CloudView | undefined;
    client: GameClient;
    // Whether this tab's saving at all (no save block)
    saving: boolean;
}): JSX.Element | null {
    const [typed, setTyped] = useState("");
    const [copied, setCopied] = useState(false);
    const sync = client.cloud;
    if (!cloud || !sync) {
        return null;
    }
    const busy = cloud.working || !saving;
    const blur = (e: React.MouseEvent<HTMLElement>) => e.currentTarget.blur();
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
            Restore
        </button>
    );
    if (!cloud.code) {
        return (
            <>
                <CloudRow
                    name="Cloud save"
                    id={CLOUD_SETTING_ID}
                    text={
                        problem ??
                        "Keep a copy online, and take it to another device with a code. No account, name or email."
                    }
                >
                    {restore}
                    <button
                        className="ui-button ui-button-small"
                        disabled={busy}
                        onClick={(e) => {
                            blur(e);
                            sync.turnOn();
                        }}
                    >
                        Turn on
                    </button>
                </CloudRow>
                <CloudRow
                    name="Have a code?"
                    text="From another device, to bring its save here"
                    wide
                >
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
                            placeholder="Sync code"
                            spellCheck={false}
                            autoCapitalize="characters"
                            autoComplete="off"
                            aria-label="Sync code"
                            onChange={(e) => setTyped(e.target.value)}
                        />
                        <button
                            className="ui-button ui-button-small"
                            type="submit"
                            disabled={busy || typed.trim().length === 0}
                        >
                            Link
                        </button>
                    </form>
                </CloudRow>
            </>
        );
    }
    const status = cloud.working
        ? "Syncing..."
        : (problem ??
          (cloud.syncedAt
              ? `On. Last synced ${new Date(cloud.syncedAt).toLocaleString()}.`
              : "On."));
    const code = cloud.code;
    return (
        <>
            <CloudRow name="Cloud save" text={status} id={CLOUD_SETTING_ID}>
                {restore}
                <button
                    className="ui-button ui-button-small"
                    disabled={busy}
                    onClick={(e) => {
                        blur(e);
                        sync.check(true);
                    }}
                >
                    Sync now
                </button>
                <button
                    className="ui-button ui-button-small"
                    disabled={cloud.working}
                    onClick={(e) => {
                        blur(e);
                        if (
                            window.confirm(
                                "Stop syncing on this device? The cloud keeps its copy, for your code's other devices.",
                            )
                        ) {
                            sync.turnOff();
                        }
                    }}
                >
                    Turn off
                </button>
            </CloudRow>
            {cloud.choice?.closed && (
                <CloudRow name="Two saves" text="The cloud has a different save from this one">
                    <button
                        className="ui-button ui-button-small"
                        onClick={(e) => {
                            blur(e);
                            sync.reopenChoice();
                        }}
                    >
                        Choose
                    </button>
                </CloudRow>
            )}
            <CloudRow
                name="Your sync code"
                text={
                    <>
                        <span className="ui-cloud-code">{code}</span>
                        <br />
                        Type it on another device to bring this save there. Anyone with it can load
                        or replace your save, and it can't be recovered, so keep it safe.
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
                    {copied ? "Copied" : "Copy"}
                </button>
            </CloudRow>
            <CloudRow
                name="Delete the cloud copy"
                text="And the code. It's kept for a week in case you change your mind."
            >
                <button
                    className="ui-button ui-button-small"
                    disabled={cloud.working}
                    onClick={(e) => {
                        blur(e);
                        if (
                            window.confirm(
                                "Delete the cloud copy of your save? The save on this device stays, and the code stops working everywhere. For a week, Restore in Settings brings it back, here or on any device you type the code into.",
                            )
                        ) {
                            sync.deleteCloud();
                        }
                    }}
                >
                    Delete
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
    const when = theirs.updatedAt && new Date(theirs.updatedAt).toLocaleString();
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-notice">
                <h2>Which save do you want?</h2>
                <div className="ui-notice-body">
                    <p>Your cloud save is different from the one on this device.</p>
                    <p>
                        <b>Cloud</b>
                        {when && `, saved ${when}`}: {describe(theirs.summary)}
                        {theirs.summary && ` (v${theirs.summary.gameVersion})`}
                    </p>
                    <p>
                        <b>This device</b>: {describe(summarize(save, GAME_VERSION))}
                    </p>
                    {choice.newer ? (
                        <p>
                            The cloud's is from a newer version of Run Escape than this one (v
                            {GAME_VERSION}). Reload or update to use it. Keeping this device's
                            replaces it, and loses what's new in it.
                        </p>
                    ) : (
                        <p>
                            The one you don't keep is replaced. Export this one first to keep both.
                        </p>
                    )}
                </div>
                <div className="ui-notice-close">
                    <button
                        className="ui-button"
                        disabled={choice.newer || cloud.working}
                        onClick={() => sync.useCloud()}
                    >
                        Use the cloud's
                    </button>
                    <button
                        className="ui-button"
                        disabled={cloud.working}
                        onClick={() => sync.keepLocal()}
                    >
                        Keep this device's
                    </button>
                    <button className="ui-button" onClick={() => sync.later()}>
                        Later
                    </button>
                </div>
            </div>
        </div>
    );
}

// Beside Settings on the title screen, where cloud save's offered: whether it's on, and whether it
// needs looking at. It opens the choice when one's waiting, and Settings at cloud save otherwise.
export function CloudSaveButton({
    cloud,
    client,
    onOpenSettings,
}: {
    cloud: CloudView | undefined;
    client: GameClient;
    onOpenSettings: () => void;
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
            : "off"
        : cloud.choice
          ? "pick which save to keep"
          : cloud.problem
            ? describeProblem(cloud)
            : cloud.syncedAt
              ? `on, last synced ${new Date(cloud.syncedAt).toLocaleString()}`
              : "on";
    return (
        <button
            className={
                "ui-title-link ui-title-settings ui-title-cloud" +
                (cloud.code ? "" : " ui-title-cloud-off")
            }
            title={`Cloud save: ${status}`}
            aria-label={`Cloud save: ${status}`}
            onClick={(e) => {
                e.currentTarget.blur();
                if (cloud.choice) {
                    client.cloud?.reopenChoice();
                } else {
                    onOpenSettings();
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
