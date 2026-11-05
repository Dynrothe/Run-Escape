import { InventorySlotView } from "../client/GameStore";
import { DescriptionButton } from "./DescriptionButton";
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
            className={touch ? "ui-touch-item" : "ui-inv-slot"}
            style={slot ? { borderColor: slot.item.rarity.color } : undefined}
            disabled={!slot || disabled}
            aria-label={slot?.item.name ?? `Empty item slot ${index + 1}`}
            onUse={onUse}
            touch={touch}
            description={
                slot && (
                    <>
                        <span style={{ color: slot.item.rarity.color }}>{slot.item.name}</span>
                        {slot.item.lines.map((line) => (
                            <span key={line}>{line}</span>
                        ))}
                    </>
                )
            }
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
