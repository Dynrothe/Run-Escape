import {
    ComponentProps,
    ReactNode,
    RefObject,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";

import { TAP_SLOP } from "../client/GameTouch";

const LONG_PRESS_MS = 500;
// Ignore the browser's and SharedTaps' clicks after handling a touch on release.
const PRESS_CLICK_MS = 400;

type Props = Pick<
    ComponentProps<"button">,
    "className" | "style" | "disabled" | "aria-label" | "aria-pressed"
> & {
    itemId?: string;
    description: ReactNode;
    children: ReactNode;
    onUse?: () => void;
    touch?: boolean;
    silent?: boolean;
};

export function DescriptionButton({
    itemId,
    description,
    children,
    onUse,
    touch = false,
    silent = true,
    disabled = false,
    ...props
}: Props): JSX.Element {
    const tipId = useId();
    const button = useRef<HTMLButtonElement>(null);
    // A replacement ends a hold, but the mouse still reads what's under it.
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [held, setHeld] = useState(false);
    const showTip = !disabled && itemId !== undefined && (hovered || focused || held);
    const press = useRef<
        { id: number; x: number; y: number; held: boolean; cancelled: boolean } | undefined
    >(undefined);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const ignoreClick = useRef(false);
    const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const cancelPress = useCallback(() => {
        clearTimeout(timer.current);
        if (press.current) {
            press.current = undefined;
            clearTimeout(clickTimer.current);
            clickTimer.current = setTimeout(() => {
                ignoreClick.current = false;
            }, PRESS_CLICK_MS);
        }
        setHeld(false);
    }, []);

    useEffect(() => {
        cancelPress();
    }, [itemId, disabled, cancelPress]);

    useEffect(() => {
        const dismiss = () => {
            cancelPress();
            setHovered(false);
            setFocused(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                dismiss();
            }
        };
        window.addEventListener("blur", dismiss);
        window.addEventListener("keydown", escape);
        // A scrolled tile must not leave a floating description behind.
        window.addEventListener("scroll", dismiss, true);
        return () => {
            window.removeEventListener("blur", dismiss);
            window.removeEventListener("keydown", escape);
            window.removeEventListener("scroll", dismiss, true);
            press.current = undefined;
            clearTimeout(timer.current);
            clearTimeout(clickTimer.current);
        };
    }, [cancelPress]);

    return (
        <button
            {...props}
            ref={button}
            type="button"
            data-silent={silent || undefined}
            disabled={disabled}
            aria-describedby={showTip ? tipId : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onPointerEnter={(e) => {
                if (e.pointerType === "mouse") {
                    setHovered(true);
                }
            }}
            onPointerLeave={(e) => {
                if (e.pointerType === "mouse") {
                    setHovered(false);
                }
            }}
            onFocus={() => {
                if (!touch) {
                    setFocused(true);
                }
            }}
            onBlur={() => {
                setFocused(false);
                cancelPress();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    ignoreClick.current = false;
                }
            }}
            onPointerDown={(e) => {
                if (!touch && e.pointerType === "mouse") {
                    ignoreClick.current = false;
                    return;
                }
                if (press.current || disabled) {
                    return;
                }
                ignoreClick.current = true;
                clearTimeout(clickTimer.current);
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                press.current = {
                    id: e.pointerId,
                    x: e.clientX,
                    y: e.clientY,
                    held: false,
                    cancelled: false,
                };
                timer.current = setTimeout(() => {
                    if (press.current) {
                        press.current.held = true;
                        setHeld(true);
                    }
                }, LONG_PRESS_MS);
            }}
            onPointerMove={(e) => {
                const start = press.current;
                if (
                    start?.id === e.pointerId &&
                    !start.held &&
                    Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP
                ) {
                    clearTimeout(timer.current);
                    start.cancelled = true;
                }
            }}
            onPointerUp={(e) => {
                const start = press.current;
                if (start?.id !== e.pointerId) {
                    return;
                }
                cancelPress();
                if (
                    !start.held &&
                    !start.cancelled &&
                    Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP
                ) {
                    onUse?.();
                }
            }}
            onPointerCancel={(e) => {
                if (press.current?.id === e.pointerId) {
                    cancelPress();
                }
            }}
            onLostPointerCapture={(e) => {
                if (press.current?.id === e.pointerId) {
                    cancelPress();
                }
            }}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
                if (!touch && !ignoreClick.current) {
                    onUse?.();
                }
            }}
        >
            {children}
            {showTip && (
                <DescriptionTip id={tipId} anchor={button}>
                    {description}
                </DescriptionTip>
            )}
        </button>
    );
}

function DescriptionTip({
    id,
    anchor,
    children,
}: {
    id: string;
    anchor: RefObject<HTMLButtonElement | null>;
    children: ReactNode;
}): JSX.Element {
    const tip = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const place = () => {
            if (!anchor.current || !tip.current) {
                return;
            }
            const scale =
                Number(getComputedStyle(anchor.current).getPropertyValue("--ui-scale")) || 1;
            tip.current.style.zoom = String(scale);
            tip.current.style.maxWidth = `${(window.innerWidth - 24) / scale}px`;
            const rect = screenRect(anchor.current);
            const size = screenRect(tip.current);
            const left = Math.max(12, Math.min(rect.left, window.innerWidth - size.width - 12));
            const below = rect.bottom + 6;
            const top = Math.max(
                12,
                Math.min(
                    below + size.height <= window.innerHeight - 12
                        ? below
                        : rect.top - size.height - 6,
                    window.innerHeight - size.height - 12,
                ),
            );
            tip.current.style.left = `${left / scale}px`;
            tip.current.style.top = `${top / scale}px`;
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
    }, [anchor, children]);

    // Outside the scrolling Armoury and the phone HUD's extra zoom.
    return createPortal(
        <div
            id={id}
            ref={tip}
            role="tooltip"
            className="ui-description-tip rs-border rs-background"
        >
            {children}
        </div>,
        document.body,
    );
}

function screenRect(element: HTMLElement): DOMRect {
    const rect = element.getBoundingClientRect();
    // Some browsers report unzoomed rectangles. The HUD has its own extra zoom,
    // so use the effective zoom only when the measured width is still unscaled.
    let zoom = 1;
    if (Math.abs(rect.width - element.offsetWidth) < 1) {
        for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
            const value = Number(getComputedStyle(parent).zoom);
            if (value > 0) {
                zoom *= value;
            }
        }
    }
    return new DOMRect(rect.x * zoom, rect.y * zoom, rect.width * zoom, rect.height * zoom);
}
