import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { t } from "../i18n";
import "./NoticePanel.css";
import { inertOthers } from "./useDialog";

export type ConfirmOptions = {
    title: string;
    body: ReactNode;
    // What the button does ("Give up"), not "OK"
    confirm: string;
    // Omitted for a message with only the one button
    cancel?: string;
};

type Props = ConfirmOptions & { onAnswer: (confirmed: boolean) => void };

// In place of the browser's confirm and alert, in the game's own panels. The keys go to it alone:
// it listens first, so the screen or run behind it doesn't hear them. The focus starts on the way
// out, so Enter can't do the irreversible thing by accident.
export function ConfirmDialog({ title, body, confirm, cancel, onAnswer }: Props): JSX.Element {
    const titleId = useId();
    const bodyId = useId();
    const panel = useRef<HTMLDivElement>(null);
    const first = useRef<HTMLButtonElement>(null);
    const answer = useRef(onAnswer);
    answer.current = onAnswer;
    useEffect(() => {
        const before = document.activeElement;
        first.current?.focus({ preventScroll: true });
        // Over every screen and window, as it's portaled beside them; toasts are still announced
        const modal = panel.current?.closest(".ui-modal");
        const restore = modal ? inertOthers(modal, { spareWindows: false }) : undefined;
        const onKey = (event: KeyboardEvent) => {
            event.stopPropagation();
            if (event.code === "Escape" && !event.repeat) {
                answer.current(false);
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            restore?.();
            if (before instanceof HTMLElement && before !== document.body && before.isConnected) {
                before.focus({ preventScroll: true });
            }
        };
    }, []);
    return createPortal(
        <div className="ui-fill ui-modal ui-confirm">
            <div
                ref={panel}
                className="ui-panel rs-border rs-background ui-notice"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
            >
                <h2 id={titleId}>{title}</h2>
                <div id={bodyId} className="ui-notice-body ui-confirm-body">
                    {body}
                </div>
                <div className="ui-notice-close">
                    {cancel !== undefined && (
                        <button ref={first} className="ui-button" onClick={() => onAnswer(false)}>
                            {cancel}
                        </button>
                    )}
                    <button
                        ref={cancel === undefined ? first : undefined}
                        className="ui-button"
                        onClick={() => onAnswer(true)}
                    >
                        {confirm}
                    </button>
                </div>
            </div>
        </div>,
        document.querySelector(".ui-contents") ?? document.body,
    );
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

// The way a screen asks: await confirm({...}) is true once the player says yes. Render the second
// value somewhere in the screen.
export function useConfirm(): [Confirm, JSX.Element | null] {
    const [asking, setAsking] = useState<{
        options: ConfirmOptions;
        resolve: (confirmed: boolean) => void;
    }>();
    const confirm = useCallback<Confirm>(
        (options) => new Promise((resolve) => setAsking({ options, resolve })),
        [],
    );
    const dialog = asking ? (
        <ConfirmDialog
            {...asking.options}
            onAnswer={(confirmed) => {
                asking.resolve(confirmed);
                setAsking(undefined);
            }}
        />
    ) : null;
    return [confirm, dialog];
}

// A message with one button, for what used to be an alert
export function messageOptions(title: string, body: ReactNode): ConfirmOptions {
    return { title, body, confirm: t("ui.common.ok") };
}
