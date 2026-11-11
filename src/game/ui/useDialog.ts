import { useEffect, useId, useRef } from "react";

// Everything outside a window can't be reached while it's open: walks up from the window to the
// UI's root, making what's beside it inert. Toasts stay out of it, so they're still announced, and
// so do other windows (a notice over every screen), which can still be answered.
function inertOthers(element: Element): () => void {
    const root = element.closest(".ui-contents");
    const changed: Element[] = [];
    let node = element;
    while (node !== root && node.parentElement) {
        for (const sibling of node.parentElement.children) {
            if (
                sibling !== node &&
                !sibling.hasAttribute("inert") &&
                !sibling.matches(".ui-toasts, .ui-modal")
            ) {
                sibling.setAttribute("inert", "");
                changed.push(sibling);
            }
        }
        node = node.parentElement;
    }
    return () => changed.forEach((sibling) => sibling.removeAttribute("inert"));
}

// What makes a window one for the keyboard and screen readers. Spread dialogProps on the window
// and give its title titleId. The focus goes on the window itself, not a button in it: a level up
// can open in the middle of a key press. modal: false for co-op's menu, with the run going on.
export function useDialog<T extends HTMLElement>({ modal = true } = {}) {
    const ref = useRef<T>(null);
    const titleId = useId();
    useEffect(() => {
        const panel = ref.current;
        if (!panel) {
            return;
        }
        const before = document.activeElement;
        panel.focus({ preventScroll: true });
        const restore = modal ? inertOthers(panel.closest(".ui-modal") ?? panel) : undefined;
        return () => {
            restore?.();
            if (before instanceof HTMLElement && before !== document.body && before.isConnected) {
                before.focus({ preventScroll: true });
            }
        };
    }, [modal]);
    return {
        titleId,
        dialogProps: {
            ref,
            role: "dialog",
            "aria-modal": modal,
            "aria-labelledby": titleId,
            tabIndex: -1,
        },
    };
}
