import { CSSProperties, ReactNode } from "react";

import { CHECKBOX_SPRITES } from "../content/titleIcons";
import "./RsCheckbox.css";
import { useSpriteFrame } from "./useSpriteFrame";

// A checkbox drawn as the client's own: its square box, ticked or not, lit up under the mouse.
// The box is a real checkbox painted with the sprites, so the keyboard, a controller and a screen
// reader use it as any other, and it's a plain one till they're drawn (or if the cache hasn't
// got them).
export function RsCheckbox({
    checked,
    onChange,
    children,
    className,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
    className?: string;
}): JSX.Element {
    // All four at once, so ticking it never waits on a sprite
    const off = useSpriteFrame(CHECKBOX_SPRITES.off, 0);
    const on = useSpriteFrame(CHECKBOX_SPRITES.on, 0);
    const offLit = useSpriteFrame(CHECKBOX_SPRITES.offHover, 0);
    const onLit = useSpriteFrame(CHECKBOX_SPRITES.onHover, 0);
    const box = checked ? on : off;
    const lit = checked ? onLit : offLit;
    const style =
        box && lit
            ? ({ "--rs-check": `url(${box})`, "--rs-check-lit": `url(${lit})` } as CSSProperties)
            : undefined;
    return (
        <label className={"ui-rs-check" + (className ? " " + className : "")}>
            <input
                type="checkbox"
                className={style ? "ui-rs-check-box" : undefined}
                style={style}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span>{children}</span>
        </label>
    );
}
