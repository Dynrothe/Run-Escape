import { t } from "../i18n";
import { KeyHint } from "./PadHint";

// Rolls a level up's rewards or a casket's item again (R), for one of the
// run's rerolls
export function RerollButton({
    rerolls,
    onReroll,
}: {
    rerolls: number;
    onReroll: () => void;
}): JSX.Element {
    return (
        <div className="ui-reroll">
            <button
                className="ui-button ui-button-small"
                // It has its own sound
                data-silent
                disabled={rerolls <= 0}
                onClick={(e) => {
                    onReroll();
                    // Give the number keys back
                    e.currentTarget.blur();
                }}
            >
                <KeyHint keyLabel="R" pad="west" /> {t("canvas.reroll", { n: rerolls })}
            </button>
        </div>
    );
}
