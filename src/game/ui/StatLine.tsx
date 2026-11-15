import { ReactNode } from "react";

import { ICON_HEIGHT, ICON_WIDTH } from "../../mapviewer/worker/ItemIconLoader";
import { StatIconRef, statIconFor, statKeyIcon } from "../content/statIcons";
import { StatKey } from "../content/types";
import { ItemIcon } from "./ItemIcon";

// A stat or bonus line with its OSRS icon, or a spacer when it has none so lines line up.
// A menu that knows the stat's key passes it, so wording like "Take 1 less damage" still
// gets its icon. A line the game built passes its English (StatText's english), which the
// icon goes by in any language. children replace the plain text (a level up's coloured
// values), and the icon still goes by text. icon is for a line that isn't a stat (how long a
// potion lasts).
export function StatLine({
    text,
    english,
    size = 16,
    statKey,
    icon: given,
    className,
    children,
}: {
    text: string;
    english?: string;
    size?: number;
    statKey?: StatKey;
    icon?: StatIconRef;
    className?: string;
    children?: ReactNode;
}): JSX.Element {
    const icon = given ?? ((statKey && statKeyIcon(statKey)) || statIconFor(text, english));
    const width = Math.round((size * ICON_WIDTH) / ICON_HEIGHT);
    return (
        <div className={"ui-stat-line" + (className ? " " + className : "")}>
            {icon ? (
                <ItemIcon {...icon} size={size} />
            ) : (
                <span
                    className="ui-stat-spacer"
                    style={{ width, height: size }}
                    aria-hidden="true"
                />
            )}
            <span>{children ?? text}</span>
        </div>
    );
}
