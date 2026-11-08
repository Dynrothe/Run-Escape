import { useSyncExternalStore } from "react";

import { GameClient } from "../client/GameClient";
import { padLabel } from "../client/GamePad";
import { AbilityView } from "../client/GameStore";
import { ItemIcon } from "./ItemIcon";
import { KeyHint, PadIcon, usePadKind } from "./PadHint";

// A fight's own button (MapDef.fight.ability), on the HUD and the touch screen: it fills as it
// charges, is dim while the boss is out of its reach, and shines while the boss's guard is down
// and it would land, which is when it's worth most. Space or a pad's bottom button use it too.
// The touch screen's acts on the press, as its other buttons do (TouchControls). One that coaches
// (FightAbilityDef.guide) pulses while his guard's down, with a tag over it saying so, and early in
// a fight, until it's first used, a hint says what it's for, naming the button for the input in use
// (a tap, a controller's, or Space).
export function AbilityButton({
    client,
    touch = false,
}: {
    client: GameClient;
    touch?: boolean;
}): JSX.Element | null {
    const store = client.store;
    const ability = useSyncExternalStore(store.subscribeNumbers, () => store.getNumbers()?.ability);
    const pad = usePadKind();
    if (!ability) {
        return null;
    }
    const press = pad ? (
        <>
            Press <PadIcon kind={pad} icon="south" label={padLabel(pad, "south")} />
        </>
    ) : touch ? (
        "Tap"
    ) : (
        "Press Space or click"
    );
    return (
        <div
            className={[
                "ui-ability-wrap",
                touch ? "ui-ability-wrap-touch" : "",
                // Its pulsing ring, whenever his guard's down, ready or not, so the moment's never
                // missed
                ability.guide && ability.opened ? "ui-ability-wrap-alert" : "",
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {ability.guide && ability.opened ? (
                // The moment it's for, said plainly: in reach, use it; out of it, get in
                <span className="ui-ability-tag" role="status">
                    {ability.inReach ? "Guard down! Fire!" : "Guard down! Get close!"}
                </span>
            ) : (
                ability.hint && (
                    <span className="ui-ability-hint" role="status">
                        Dodge the boss's big attacks to drop its guard, then get close. {press} this
                        while it's down: it hits twice as hard.
                    </span>
                )
            )}
            <button
                data-silent
                className={abilityClass(ability, touch)}
                aria-label={ability.name}
                title={`${ability.name}: from right by him, and twice as hard while his guard's down`}
                // Keep focus on the game, so Space doesn't press it again
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={touch ? () => client.useAbility() : undefined}
                onClick={touch ? undefined : () => client.useAbility()}
            >
                {!touch && <KeyHint keyLabel="Space" pad="south" className="ui-inv-key" />}
                <ItemIcon objId={ability.iconObjId} size={touch ? 40 : 30} />
                <div
                    className="ui-ability-charge"
                    style={{ transform: `scaleY(${1 - ability.charge})` }}
                />
                <span className="ui-ability-name">{ability.name}</span>
            </button>
        </div>
    );
}

function abilityClass(ability: AbilityView, touch: boolean): string {
    const ready = ability.charge >= 1;
    return [
        touch ? "ui-ability ui-touch-ability" : "ui-ability",
        ready && ability.inReach ? "ui-ability-near" : "",
        ready && ability.inReach && ability.opened ? "ui-ability-opened" : "",
        // Lit whenever his guard's down, ready or not (its ring pulses: the wrap's)
        ability.guide && ability.opened ? "ui-ability-alert" : "",
    ]
        .filter(Boolean)
        .join(" ");
}
