import { PLATINUM_TOKEN_OBJ } from "../content/titleIcons";
import { fmtNum, tp } from "../i18n";
import { ItemIcon } from "./ItemIcon";

// Platinum tokens (content/cards.ts, what card packs are bought with), as Coins shows coins: the
// token's own icon and the amount, its name said for screen readers
export function Platinum({ amount }: { amount: number }): JSX.Element {
    return (
        <span className="ui-coins" aria-label={tp("cards.platinum_amount", amount)}>
            <ItemIcon objId={PLATINUM_TOKEN_OBJ} size={22} />
            {fmtNum(amount)}
        </span>
    );
}
