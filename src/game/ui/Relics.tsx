import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import {
    RELICS,
    RELIC_BY_ID,
    RELIC_TIERS,
    RelicDef,
    RelicTier,
    getOpenRelicTiers,
    relicDescription,
    relicName,
} from "../content/relics";
import { t, tp } from "../i18n";
import { ItemIcon } from "./ItemIcon";

// The adventurer screen's relics (content/relics.ts): a slot for each tier, open once that many
// Act II maps have been beaten, holding the relic picked for it. A slot opens its tier's picker.
// Shown once Act II is open (the first tier's slot says what opens it till then).
export function RelicRow({
    ui,
    client,
}: {
    ui: UiSnapshot;
    client: GameClient;
}): JSX.Element | null {
    const [picking, setPicking] = useState<RelicTier>();
    const open = getOpenRelicTiers(ui.save.mapVictories);
    const picked = ui.save.relics ?? [];
    const inTier = (tier: RelicTier) =>
        picked.map((id) => RELIC_BY_ID.get(id)).find((relic) => relic?.tier === tier);
    return (
        <div className="ui-relic-row">
            <span className="ui-pet-label">{t("ui.relics.label")}</span>
            <div className="ui-relic-slots">
                {RELIC_TIERS.map((tier) => {
                    const relic = tier <= open ? inTier(tier) : undefined;
                    const locked = tier > open;
                    const label = locked
                        ? tp("ui.relics.locked", tier)
                        : relic
                          ? `${t("ui.relics.tier", { tier })}: ${relicName(relic)}`
                          : `${t("ui.relics.tier", { tier })}: ${t("ui.common.none")}`;
                    return (
                        <button
                            key={tier}
                            className={
                                "ui-card ui-relic-slot" +
                                (locked ? " ui-card-locked" : "") +
                                (relic ? " ui-card-selected" : "")
                            }
                            aria-label={label}
                            title={label}
                            disabled={locked}
                            onClick={() => setPicking(tier)}
                        >
                            {relic ? (
                                <ItemIcon objId={relic.iconObjId} size={28} />
                            ) : (
                                <span className="ui-relic-tier">{tier}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            {picking !== undefined && (
                <RelicPicker
                    tier={picking}
                    picked={inTier(picking)}
                    onPick={(id) => {
                        client.selectRelic(picking, id);
                        setPicking(undefined);
                    }}
                    onClose={() => setPicking(undefined)}
                />
            )}
        </div>
    );
}

// A tier's relics to pick from, or none
function RelicPicker({
    tier,
    picked,
    onPick,
    onClose,
}: {
    tier: RelicTier;
    picked?: RelicDef;
    onPick: (id: string | undefined) => void;
    onClose: () => void;
}): JSX.Element {
    return (
        <div className="ui-modal" onClick={onClose}>
            <div
                className="ui-panel rs-border rs-background ui-relic-picker"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="ui-invocations-title">{t("ui.relics.pick_title", { tier })}</h2>
                <div className="ui-relic-options">
                    {RELICS.filter((relic) => relic.tier === tier).map((relic) => (
                        <button
                            key={relic.id}
                            className={
                                "ui-card ui-relic-option" +
                                (picked?.id === relic.id ? " ui-card-selected" : "")
                            }
                            aria-pressed={picked?.id === relic.id}
                            onClick={() => onPick(relic.id)}
                        >
                            <ItemIcon objId={relic.iconObjId} size={36} />
                            <span className="ui-relic-text">
                                <span className="ui-card-title">{relicName(relic)}</span>
                                <span className="ui-card-text">{relicDescription(relic)}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <span className="ui-subtle">{t("ui.relics.rules")}</span>
                <div className="ui-invocations-buttons">
                    <button className="ui-button" onClick={() => onPick(undefined)}>
                        {t("ui.relics.none")}
                    </button>
                    <button className="ui-button ui-button-go" onClick={onClose}>
                        {t("ui.invocations.done")}
                    </button>
                </div>
            </div>
        </div>
    );
}
