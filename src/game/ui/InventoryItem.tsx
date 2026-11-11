import { InventorySlotView } from "../client/GameStore";
import { t, tl } from "../i18n";
import { DescriptionButton, ItemDescription } from "./DescriptionButton";
import { ItemIcon } from "./ItemIcon";
import { KeyHint } from "./PadHint";

const ITEM_BUTTONS = ["leftBumper", "rightBumper", "leftTrigger", "rightTrigger"] as const;

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
    return (
        <DescriptionButton
            itemId={slot?.item.id}
            className={touch ? "ui-touch-item" : "ui-inv-slot" + (slot ? "" : " ui-inv-slot-empty")}
            style={slot ? { borderColor: slot.item.rarity.color } : undefined}
            disabled={!slot || disabled}
            aria-label={slot ? tl(slot.item.name) : t("ui.hud.empty_item_slot", { n: index + 1 })}
            onUse={onUse}
            touch={touch}
            description={slot && <ItemDescription item={slot.item} rarity />}
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
        </DescriptionButton>
    );
}
