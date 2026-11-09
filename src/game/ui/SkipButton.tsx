import { fmtNum, t } from "../i18n";
import { KeyHint } from "./PadHint";

// Takes none of a level up's rewards (X), for coins from the run: dearer each
// time
export function SkipButton({
    cost,
    affordable,
    onSkip,
}: {
    cost: number;
    affordable: boolean;
    onSkip: () => void;
}): JSX.Element {
    return (
        <div className="ui-reroll">
            <button
                className="ui-button ui-button-small"
                // It has its own sound
                data-silent
                disabled={!affordable}
                title={affordable ? undefined : t("canvas.skip_cost", { cost: fmtNum(cost) })}
                onClick={(e) => {
                    onSkip();
                    // Give the number keys back
                    e.currentTarget.blur();
                }}
            >
                <KeyHint keyLabel="X" pad="north" /> {t("canvas.skip", { cost: fmtNum(cost) })}
            </button>
        </div>
    );
}
