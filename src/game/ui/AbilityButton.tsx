import { useSyncExternalStore } from "react";

import { GameClient } from "../client/GameClient";
import { AbilityView } from "../client/GameStore";
import { ItemIcon } from "./ItemIcon";
import { KeyHint } from "./PadHint";

// A fight's own button (MapDef.fight.ability), on the HUD and the touch screen: it fills as it
// charges, is dim while the boss is out of its reach, and shines while the boss's guard is down
// and it would land, which is when it's worth most. Space or a pad's bottom button use it too.
// The touch screen's acts on the press, as its other buttons do (TouchControls).
export function AbilityButton({
    client,
    touch = false,
}: {
    client: GameClient;
    touch?: boolean;
}): JSX.Element | null {
    const store = client.store;
    const ability = useSyncExternalStore(store.subscribeNumbers, () => store.getNumbers()?.ability);
    if (!ability) {
        return null;
    }
    return (
        <button
            data-silent
            className={abilityClass(ability, touch)}
            aria-label={ability.name}
            title={ability.hint}
            // Keep focus on the game, so Space doesn't press it again
            onMouseDown={(e) => e.preventDefault()}
            // On the press, not its release: a song's beat is judged by when it's pressed
            onPointerDown={touch || ability.pips ? () => client.useAbility() : undefined}
            onClick={touch || ability.pips ? undefined : () => client.useAbility()}
        >
            {!touch && <KeyHint keyLabel="Space" pad="south" className="ui-inv-key" />}
            <ItemIcon objId={ability.iconObjId} size={touch ? 40 : 30} />
            <div
                className="ui-ability-charge"
                style={{ transform: `scaleY(${1 - ability.charge})` }}
            />
            <span className="ui-ability-name">{ability.name}</span>
            {ability.pips && (
                <div className="ui-ability-pips" aria-label={`Resonance ${ability.pips.value}`}>
                    {Array.from({ length: ability.pips.max }, (_, i) => (
                        <span
                            key={i}
                            className={i < ability.pips!.value ? "ui-ability-pip-on" : undefined}
                        />
                    ))}
                </div>
            )}
        </button>
    );
}

function abilityClass(ability: AbilityView, touch: boolean): string {
    const ready = ability.charge >= 1;
    return [
        touch ? "ui-ability ui-touch-ability" : "ui-ability",
        ready && ability.inReach ? "ui-ability-near" : "",
        ready && ability.inReach && ability.opened ? "ui-ability-opened" : "",
    ]
        .filter(Boolean)
        .join(" ");
}
