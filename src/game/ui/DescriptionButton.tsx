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

import { ItemView } from "../client/GameStore";
import { TAP_SLOP } from "../client/GameTouch";
import { DURATION_ICON } from "../content/statIcons";
import { t, tl, tp } from "../i18n";
import { StatLine } from "./StatLine";

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
    // A touch or pen is down on it, not yet released or cancelled
    const [pressed, setPressed] = useState(false);
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
        setPressed(false);
    }, []);

    useEffect(() => {
        cancelPress();
    }, [itemId, disabled, cancelPress]);

    // Only while it's shown or pressed: the Armoury has a hundred of these
    const listening = showTip || pressed;
    useEffect(() => {
        if (!listening) {
            return;
        }
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
        // A scroll moves the tile out from under the finger or the mouse. One
        // that's focused (by keys or a controller, which scrolls to it) keeps
        // its description, which follows it.
        const scroll = () => {
            cancelPress();
            setHovered(false);
        };
        window.addEventListener("blur", dismiss);
        window.addEventListener("keydown", escape);
        window.addEventListener("scroll", scroll, true);
        return () => {
            window.removeEventListener("blur", dismiss);
            window.removeEventListener("keydown", escape);
            window.removeEventListener("scroll", scroll, true);
        };
    }, [listening, cancelPress]);

    useEffect(
        () => () => {
            press.current = undefined;
            clearTimeout(timer.current);
            clearTimeout(clickTimer.current);
        },
        [],
    );

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
                // Keys and a controller, not the focus a tap gives (after its
                // pointerup), which would leave the description up
                if (!touch && !ignoreClick.current) {
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
                setPressed(true);
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
        // A focused tile's description follows it when its list scrolls
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
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

// Whether getBoundingClientRect includes CSS zoom, as standard zoom does
// (Chrome 128 on, Firefox), or gives a zoomed element's rectangle unzoomed, as
// Chrome did before. Measured once, on an element zoomed 2x; tests set it.
export const zoomedRects: { value?: boolean } = {};

function rectsIncludeZoom(): boolean {
    if (zoomedRects.value === undefined) {
        const probe = document.createElement("div");
        probe.style.cssText = "position: fixed; visibility: hidden; width: 10px; height: 10px";
        probe.style.zoom = "2";
        document.body.append(probe);
        zoomedRects.value = probe.getBoundingClientRect().width > 15;
        probe.remove();
    }
    return zoomedRects.value;
}

// Where an element is on screen, in the viewport's pixels. The UI and the
// phone HUD both zoom.
function screenRect(element: HTMLElement): DOMRect {
    const rect = element.getBoundingClientRect();
    if (rectsIncludeZoom()) {
        return rect;
    }
    let zoom = 1;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
        const value = Number(getComputedStyle(parent).zoom);
        if (value > 0) {
            zoom *= value;
        }
    }
    return new DOMRect(rect.x * zoom, rect.y * zoom, rect.width * zoom, rect.height * zoom);
}

// An item's name in its rarity's colour, what it does, and its set: the bag,
// worn gear and the Armoury. kind: its rarity and kind under the name, as a casket
// shows them (the bag's). children add lines after.
export function ItemDescription({
    item,
    kind = false,
    setClassName,
    children,
}: {
    item: ItemView;
    kind?: boolean;
    setClassName?: string;
    children?: ReactNode;
}): JSX.Element {
    return (
        <>
            <span style={{ color: item.rarity.color }}>{item.name}</span>
            {kind && (
                <span className="ui-description-kind">
                    {t("chest.kind", { rarity: tl(item.rarity.name), kind: item.kindLabel })}
                </span>
            )}
            <ItemLines item={item} />
            {item.set && (
                <StatLine
                    text={item.set.text}
                    className={setClassName ?? (item.set.active ? "ui-good" : "ui-subtle")}
                />
            )}
            {children}
        </>
    );
}

// What an item does, a line for each stat or effect with its icon, then how long a potion's
// stats last: a tooltip's and a casket's
export function ItemLines({
    item,
    wrap = (line) => line,
}: {
    item: ItemView;
    // Each line in something of its own (a casket's list)
    wrap?: (line: JSX.Element, key: number) => JSX.Element;
}): JSX.Element {
    return (
        <>
            {item.lines.map((line, i) =>
                wrap(<StatLine key={i} text={line} statKey={item.lineStats?.[i]} />, i),
            )}
            {item.seconds !== undefined &&
                wrap(
                    <StatLine
                        key="lasts"
                        text={tp("canvas.lasts", item.seconds)}
                        icon={DURATION_ICON}
                        className="ui-item-lasts"
                    />,
                    item.lines.length,
                )}
        </>
    );
}
