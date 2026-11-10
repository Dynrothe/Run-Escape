import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";

// Whether the focus got where it is from the keyboard (Tab or the arrows), and not from a click:
// Enter on a button that was only clicked is for the screen, not that button
let focusFromKeys = false;

if (typeof window !== "undefined") {
    window.addEventListener(
        "keydown",
        (event) => {
            if (event.code === "Tab" || event.code.startsWith("Arrow")) {
                focusFromKeys = true;
            }
        },
        true,
    );
    window.addEventListener(
        "pointerdown",
        () => {
            focusFromKeys = false;
        },
        true,
    );
}

// For tests
export function resetFocusSource(): void {
    focusFromKeys = false;
}

function isTyping(target: HTMLElement): boolean {
    return target.closest?.("input, textarea, select") != null;
}

type MenuKeys = {
    // Escape, and a controller's back button (GameInput sends it as Escape)
    onBack?: () => void;
    // Enter. Only the keyboard's: a controller's south button already presses what's highlighted
    onConfirm?: () => void;
    // A screen that can open under a held key (a run's results) ignores keys for this long
    guardMs?: number;
};

// A screen's Escape and Enter
export function useMenuKeys({ onBack, onConfirm, guardMs = 0 }: MenuKeys): void {
    const latest = useRef({ onBack, onConfirm });
    latest.current = { onBack, onConfirm };
    useEffect(() => {
        const opened = performance.now();
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (
                event.repeat ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                performance.now() - opened < guardMs ||
                isTyping(target) ||
                // The panel saying nothing's being saved comes first
                document.querySelector(".ui-save-block")
            ) {
                return;
            }
            if (event.code === "Escape") {
                // Escape shuts an item's description first, as it does everywhere
                if (!document.querySelector(".ui-description-tip")) {
                    latest.current.onBack?.();
                }
            } else if (
                event.code === "Enter" &&
                document.documentElement.dataset.input !== "pad" &&
                latest.current.onConfirm &&
                !(focusFromKeys && target.closest?.("button, a"))
            ) {
                event.preventDefault();
                latest.current.onConfirm();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [guardMs]);
}

// Gives Enter and Space back to the screen after a click. A press from the keyboard or a
// controller (no pointer, so detail is 0) stays where it is, or the player loses their place.
export function releaseFocus(event: MouseEvent<HTMLElement>): void {
    if (event.detail !== 0) {
        event.currentTarget.blur();
    }
}
