import { t } from "../i18n";
import { releaseFocus } from "./menuKeys";

// Banishes a level up's reward or a casket's item (Firemaking): it's never
// offered again this run, and something else takes its place
export function BanishButton({
    label,
    title,
    onBanish,
}: {
    label?: string;
    title: string;
    onBanish: () => void;
}): JSX.Element {
    return (
        <button
            className="ui-button ui-button-small ui-banish"
            // The reroll's sound plays for what takes its place
            data-silent
            title={title}
            onClick={(e) => {
                e.stopPropagation();
                onBanish();
                // Give the number keys back
                releaseFocus(e);
            }}
        >
            {label ?? t("canvas.banish")}
        </button>
    );
}
