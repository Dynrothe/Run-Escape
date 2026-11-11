import { fmtNum, t } from "../i18n";
import { KeyHint } from "./PadHint";
import { releaseFocus } from "./menuKeys";

// Takes none of a level up's rewards (X), for coins from the run: dearer each
// time. short: the coins it's short of, shown while it can't be paid
export function SkipButton({
    cost,
    affordable,
    short = 0,
    onSkip,
}: {
    cost: number;
    affordable: boolean;
    short?: number;
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
                    releaseFocus(e);
                }}
            >
                <KeyHint keyLabel="X" pad="north" /> {t("canvas.skip", { cost: fmtNum(cost) })}
                {!affordable && short > 0 && (
                    <span className="ui-card-short">
                        {" "}
                        · {t("ui.common.short_by", { n: fmtNum(short) })}
                    </span>
                )}
            </button>
        </div>
    );
}
