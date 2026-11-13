import { useSyncExternalStore } from "react";

import { GameClient } from "../client/GameClient";
import { PadButton, padLabel } from "../client/GamePad";
import { AbilityView } from "../client/GameStore";
import { t, tl } from "../i18n";
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
            {t("canvas.press")} <PadIcon kind={pad} icon="south" label={padLabel(pad, "south")} />
        </>
    ) : touch ? (
        t("canvas.tap")
    ) : (
        t("canvas.press_space_or_click")
    );
    return (
        <div
            className={[
                "ui-ability-wrap",
                touch ? "ui-ability-wrap-touch" : "",
                touch && ability.withItems ? "ui-ability-wrap-items" : "",
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
                    {ability.inReach
                        ? t("canvas.ability_guard_fire")
                        : t("canvas.ability_guard_close")}
                </span>
            ) : (
                ability.hint && (
                    <span className="ui-ability-hint" role="status">
                        {t("canvas.ability_guide")} {press} {t("canvas.ability_guide_action")}
                    </span>
                )
            )}
            <button
                data-silent
                className={abilityClass(ability, touch)}
                aria-label={tl(ability.name)}
                title={t("canvas.ability_hint", { name: tl(ability.name) })}
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
                {!touch && <span className="ui-ability-name">{tl(ability.name)}</span>}
            </button>
            {/* Under the round button, not in it: its circle cuts off a long name's ends */}
            {touch && <span className="ui-ability-name ui-ability-name-under">{ability.name}</span>}
        </div>
    );
}

// A hero's own buttons (CharacterDef.abilities: Justiciar Zachariah's), in place of a fight's
// one: Space and 1 to 4 on a keyboard, the bottom button and the shoulders on a pad, and on a
// touch screen a big first button in the items' corner with the others round it. Each fills as
// it charges, and goes off where the hero faces.
const KIT_PAD: PadButton[] = ["south", "leftBumper", "rightBumper", "leftTrigger", "rightTrigger"];

export function KitButtons({
    client,
    touch = false,
}: {
    client: GameClient;
    touch?: boolean;
}): JSX.Element | null {
    const store = client.store;
    const abilities = useSyncExternalStore(
        store.subscribeNumbers,
        () => store.getNumbers()?.abilities,
    );
    if (!abilities) {
        return null;
    }
    return (
        <div className={touch ? "ui-touch-kit" : "ui-kit"}>
            {abilities.map((ability, slot) => (
                <button
                    key={ability.name}
                    data-silent
                    className={
                        abilityClass(ability, touch) +
                        (touch ? ` ui-touch-kit-${slot}` : "") +
                        (slot === 0 ? " ui-kit-first" : "")
                    }
                    aria-label={ability.name}
                    title={`${ability.name}: ${ability.description ?? ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={touch ? () => client.useAbility(slot) : undefined}
                    onClick={touch ? undefined : () => client.useAbility(slot)}
                >
                    {!touch && (
                        <KeyHint
                            keyLabel={ability.keyLabel}
                            pad={KIT_PAD[slot]}
                            className="ui-inv-key"
                        />
                    )}
                    <ItemIcon
                        objId={ability.iconObjId}
                        size={touch ? (slot === 0 ? 40 : 30) : 30}
                    />
                    <div
                        className="ui-ability-charge"
                        style={{ transform: `scaleY(${1 - ability.charge})` }}
                    />
                    {(!touch || slot === 0) && (
                        <span className="ui-ability-name">{ability.name}</span>
                    )}
                </button>
            ))}
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
