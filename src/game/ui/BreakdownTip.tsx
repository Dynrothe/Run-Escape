import { ReactNode, useEffect, useId, useRef, useState } from "react";

import type { BreakdownIcon, BreakdownLine, BreakdownView } from "../client/GameStore";
import "./BreakdownTip.css";
import { DescriptionTip } from "./DescriptionButton";
import { ItemIcon } from "./ItemIcon";

// What gives a bonus, a small icon each after the line's name (its own name is its title)
function SourceIcons({ icons }: { icons: BreakdownIcon[] }): JSX.Element {
    return (
        <span className="ui-breakdown-icons">
            {icons.map((icon) => (
                <span key={icon.name} className="ui-breakdown-icon" title={icon.name}>
                    <ItemIcon objId={icon.objId ?? -1} spriteId={icon.spriteId} size={16} />
                </span>
            ))}
        </span>
    );
}

// One line of a breakdown. A line with a single plain part is written across ("Chance 20% on each
// hit"). One with several (an endless run has a pick for every level up, so hundreds), or whose
// parts say what they're of, is a list: a row for each, in the order they came, never joined up.
function BreakdownLineView({
    line,
    showTotal,
}: {
    line: BreakdownLine;
    showTotal: boolean;
}): JSX.Element {
    const list = line.parts.length > 1 || line.parts.some((part) => part.label !== undefined);
    const total = showTotal && line.total ? line.total : undefined;
    if (!list) {
        return (
            <div className="ui-breakdown-line">
                {line.label && <span className="ui-breakdown-label">{line.label}</span>}
                {line.icons && <SourceIcons icons={line.icons} />}
                <span className="ui-breakdown-parts">
                    {line.parts.map((part, i) => (
                        <span key={i} style={part.color ? { color: part.color } : undefined}>
                            {part.text}
                        </span>
                    ))}
                </span>
                {total && <span className="ui-breakdown-total">= {total}</span>}
            </div>
        );
    }
    return (
        <div className="ui-breakdown-line ui-breakdown-line-list">
            {line.label && <span className="ui-breakdown-label">{line.label}</span>}
            <ul className="ui-breakdown-rows">
                {line.parts.map((part, i) => (
                    <li key={i}>
                        <span className="ui-breakdown-row-label">{part.label}</span>
                        <span style={part.color ? { color: part.color } : undefined}>
                            {part.text}
                        </span>
                    </li>
                ))}
            </ul>
            {total && <span className="ui-breakdown-total">= {total}</span>}
        </div>
    );
}

// Where a number comes from, as the tooltip on it shows: a head with what it is and what it comes
// to, then a line for each source or step, each part in the colour of the rarity it was taken at.
// The lines scroll when there's more than fits (an endless run's), with the head staying put.
export function BreakdownContent({ breakdown }: { breakdown: BreakdownView }): JSX.Element {
    const headTotal = breakdown.total ?? breakdown.lines[0]?.total;
    return (
        <div className="ui-breakdown">
            <div className="ui-breakdown-head">
                <span>{breakdown.title}</span>
                {headTotal && <span className="ui-breakdown-sum">{headTotal}</span>}
            </div>
            <div className="ui-breakdown-scroll">
                {breakdown.lines.map((line, i) => (
                    <BreakdownLineView
                        key={i}
                        line={line}
                        // The first line's total is the head's
                        showTotal={!(i === 0 && line.total === headTotal)}
                    />
                ))}
            </div>
            {breakdown.about && (
                <div className="ui-breakdown-about">
                    <p className="ui-breakdown-about-what">{breakdown.about.what}</p>
                    {breakdown.about.calc && (
                        <p className="ui-breakdown-about-calc">{breakdown.about.calc}</p>
                    )}
                    {breakdown.about.from && (
                        <p className="ui-breakdown-about-from">{breakdown.about.from}</p>
                    )}
                    {breakdown.about.power && (
                        <p className="ui-breakdown-about-power">{breakdown.about.power}</p>
                    )}
                </div>
            )}
        </div>
    );
}

// Something with a tooltip that shows how its number got its size: on the mouse over it, on a focus
// (keys and controllers), and on a tap on a touch screen (and off on the next one). Without a
// breakdown it's just what's inside. A list in the tooltip that's longer than it fits is scrolled
// with the mouse wheel while the mouse is over the thing or its tooltip, and with the arrow keys
// while it's focused, and by hand on a touch screen.
export function BreakdownTip({
    breakdown,
    content,
    className,
    children,
}: {
    breakdown?: BreakdownView;
    // A tooltip of its own, in place of the breakdown's (an evolution's recipe)
    content?: ReactNode;
    className?: string;
    children: ReactNode;
}): JSX.Element {
    const id = useId();
    const anchor = useRef<HTMLSpanElement>(null);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [tapped, setTapped] = useState(false);
    const hasTip = breakdown !== undefined || content !== undefined;
    const shown = hasTip && (hovered || focused || tapped);

    // Off with Escape, or a tap anywhere else; the wheel and arrow keys scroll its list
    useEffect(() => {
        if (!shown) {
            return;
        }
        const tip = () => document.getElementById(id);
        const scroller = () => tip()?.querySelector<HTMLElement>(".ui-breakdown-scroll");
        const scrolls = (box: HTMLElement | null | undefined): box is HTMLElement =>
            !!box && box.scrollHeight > box.clientHeight + 1;
        const dismiss = () => {
            setHovered(false);
            setTapped(false);
        };
        const outside = (event: PointerEvent) => {
            if (!anchor.current?.contains(event.target as Node)) {
                setTapped(false);
            }
        };
        const keys = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                dismiss();
                setFocused(false);
                return;
            }
            const box = scroller();
            const step =
                event.key === "ArrowDown"
                    ? 24
                    : event.key === "ArrowUp"
                      ? -24
                      : event.key === "PageDown"
                        ? 120
                        : event.key === "PageUp"
                          ? -120
                          : 0;
            if (step && scrolls(box) && document.activeElement === anchor.current) {
                event.preventDefault();
                box.scrollTop += step;
            }
        };
        const wheel = (event: WheelEvent) => {
            const target = event.target as Node;
            const box = scroller();
            if (scrolls(box) && (anchor.current?.contains(target) || tip()?.contains(target))) {
                event.preventDefault();
                box.scrollTop += event.deltaY;
            }
        };
        // A scroll elsewhere moves it out from under the mouse; its own list's doesn't
        const scroll = (event: Event) => {
            if (!tip()?.contains(event.target as Node)) {
                dismiss();
            }
        };
        window.addEventListener("pointerdown", outside);
        window.addEventListener("keydown", keys);
        window.addEventListener("blur", dismiss);
        window.addEventListener("wheel", wheel, { passive: false });
        window.addEventListener("scroll", scroll, true);
        return () => {
            window.removeEventListener("pointerdown", outside);
            window.removeEventListener("keydown", keys);
            window.removeEventListener("blur", dismiss);
            window.removeEventListener("wheel", wheel);
            window.removeEventListener("scroll", scroll, true);
        };
    }, [shown, id]);

    if (!hasTip) {
        return <span className={className}>{children}</span>;
    }
    return (
        <span
            ref={anchor}
            className={"ui-breakdown-anchor" + (className ? " " + className : "")}
            tabIndex={0}
            aria-describedby={shown ? id : undefined}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
            onPointerUp={(e) => e.pointerType !== "mouse" && setTapped((on) => !on)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        >
            {children}
            {shown && (
                <DescriptionTip id={id} anchor={anchor}>
                    {content ?? (breakdown && <BreakdownContent breakdown={breakdown} />)}
                </DescriptionTip>
            )}
        </span>
    );
}
