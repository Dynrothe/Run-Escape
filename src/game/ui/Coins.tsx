import { fmtNum } from "../i18n";
import { ItemIcon } from "./ItemIcon";

export function Coins({ amount }: { amount: number }): JSX.Element {
    return (
        <span className="ui-coins">
            <ItemIcon objId={995} size={22} count={amount} />
            {fmtNum(amount)}
        </span>
    );
}
