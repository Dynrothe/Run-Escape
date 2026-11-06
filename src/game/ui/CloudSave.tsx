import { ReactNode, useState } from "react";

import { CloudProblem, CloudSummary, CloudView, summarize } from "../client/CloudSave";
import { GameClient } from "../client/GameClient";
import { SaveData } from "../core/save";
import "./NoticePanel.css";
import { GAME_VERSION } from "./changelog";

const PROBLEMS: Record<CloudProblem, string> = {
    offline: "Can't reach cloud save right now. Your progress is still kept here.",
    unknownCode: "That code isn't one cloud save knows, or its save was deleted.",
    refused: "Cloud save wouldn't take this save. Export it to keep a copy.",
};

function describe(summary: CloudSummary | undefined): string {
    if (!summary) {
        return "nothing yet";
    }
    return (
        `${summary.runs.toLocaleString()} runs, ${summary.victories.toLocaleString()} wins, ` +
        `${summary.mapsBeaten} maps beaten, ${summary.totalCoins.toLocaleString()} coins earned`
    );
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
    const problem = cloud.problem && PROBLEMS[cloud.problem];
    if (!cloud.code) {
        return (
            <>
                <CloudRow
                    name="Cloud save"
                    text={
                        problem ??
                        "Keep a copy online, and take it to another device with a code. No account, name or email."
                    }
                >
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
            <CloudRow name="Cloud save" text={status}>
                <button
                    className="ui-button ui-button-small"
                    disabled={busy}
                    onClick={(e) => {
                        blur(e);
                        sync.check();
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
            <CloudRow name="Delete the cloud copy" text="Every version of it, and the code">
                <button
                    className="ui-button ui-button-small"
                    disabled={cloud.working}
                    onClick={(e) => {
                        blur(e);
                        if (
                            window.confirm(
                                "Delete the cloud copy of your save for good? The save on this device stays, and the code stops working everywhere.",
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
