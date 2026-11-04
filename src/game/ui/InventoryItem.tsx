import { useCallback, useEffect, useId, useRef, useState } from "react";

import { InventorySlotView } from "../client/GameStore";
import { TAP_SLOP } from "../client/GameTouch";
import { ItemIcon } from "./ItemIcon";
import { KeyHint } from "./PadHint";

const ITEM_BUTTONS = ["leftBumper", "rightBumper", "leftTrigger", "rightTrigger"] as const;
const LONG_PRESS_MS = 500;
// A touch or pen press was used (or held) on pointerup, so for this long after
// it the click the browser or SharedTaps makes for it is ignored
const PRESS_CLICK_MS = 400;

type Props = {
    slot: InventorySlotView;
    index: number;
    onUse: () => void;
    touch?: boolean;
    disabled?: boolean;
};

export function InventoryItem({
    slot,
    index,
    onUse,
    touch = false,
    disabled = false,
}: Props): JSX.Element {
    const tipId = useId();
    // Each shows the description. A new item in the slot ends a hold but not a
    // hover, so the mouse still reads whatever's under it.
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [held, setHeld] = useState(false);
    const showTip = slot !== null && (hovered || focused || held);
    const press = useRef<{ id: number; x: number; y: number; held: boolean } | undefined>(
        undefined,
    );
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
        window.addEventListener("blur", cancelPress);
        return () => {
            window.removeEventListener("blur", cancelPress);
            cancelPress();
        };
    }, [slot?.item.id, disabled, cancelPress]);

    return (
        <button
            data-silent
            className={touch ? "ui-touch-item" : "ui-inv-slot"}
            style={slot ? { borderColor: slot.item.rarity.color } : undefined}
            disabled={!slot || disabled}
            aria-label={slot?.item.name ?? `Empty item slot ${index + 1}`}
            aria-describedby={showTip ? tipId : undefined}
            // Keep focus on the game, so Space doesn't press it again
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
                if (e.key === "Escape") {
                    cancelPress();
                    setHovered(false);
                    setFocused(false);
                } else if (e.key === "Enter" || e.key === " ") {
                    ignoreClick.current = false;
                }
            }}
            onPointerDown={(e) => {
                if (!touch && e.pointerType === "mouse") {
                    ignoreClick.current = false;
                    return;
                }
                if (press.current) {
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
                // Once it's held it's only being read, so a resting finger can drift
                if (
                    start?.id === e.pointerId &&
                    !start.held &&
                    Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP
                ) {
                    cancelPress();
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
                    Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP
                ) {
                    onUse();
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
                // Touch taps finish on pointerup, including a second finger's.
                if (!touch && !ignoreClick.current) {
                    onUse();
                }
            }}
        >
            {!touch && (
                <KeyHint
                    keyLabel={String(index + 1)}
                    pad={ITEM_BUTTONS[index]}
                    className="ui-inv-key"
                />
            )}
            {slot && <ItemIcon objId={slot.item.objId} size={touch ? 36 : 30} />}
            {slot && slot.count > 1 && <span className="ui-inv-count">{slot.count}</span>}
            {showTip && (
                <span id={tipId} role="tooltip" className="ui-inv-tip rs-border rs-background">
                    <span style={{ color: slot.item.rarity.color }}>{slot.item.name}</span>
                    {slot.item.lines.map((line) => (
                        <span key={line}>{line}</span>
                    ))}
                </span>
            )}
        </button>
    );
}
