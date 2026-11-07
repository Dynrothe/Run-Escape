import { GameClient } from "../client/GameClient";
import { EventView } from "../client/GameStore";
import { fmtNum, t, tl } from "../i18n";
import { Coins } from "./Coins";
import { ItemIcon } from "./ItemIcon";
import { KeyHint } from "./PadHint";

type Props = { event: EventView; coins: number; client: GameClient };

// A random event's visitor with something on offer: the Mysterious Old Man's
// power-ups, or the Quiz Master's question. A raid's supply chest too, for raid points.
export function EventModal({ event, coins, client }: Props): JSX.Element {
    const forSale = event.options.some((option) => option.price !== undefined);
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-levelup">
                <h2>{tl(event.name)}</h2>
                <p className="ui-subtle ui-event-speech">{tl(event.speech)}</p>
                <div className="ui-choices">
                    {event.options.map((option, i) => (
                        <button
                            key={i}
                            className="ui-card ui-choice"
                            disabled={!option.enabled}
                            onClick={() => client.chooseEvent(i)}
                        >
                            <KeyHint keyLabel={String(i + 1)} />
                            <ItemIcon objId={option.iconObjId} size={44} />
                            <div className="ui-card-body">
                                <div className="ui-card-title">{tl(option.title)}</div>
                                {option.text && (
                                    <div className="ui-card-text">{tl(option.text)}</div>
                                )}
                            </div>
                            {option.price !== undefined && (
                                <div className="ui-card-cost">
                                    {option.sold ? (
                                        t("canvas.sold")
                                    ) : event.points !== undefined ? (
                                        <span className="ui-raid-price">
                                            {t("canvas.points_short", { n: fmtNum(option.price) })}
                                        </span>
                                    ) : (
                                        <Coins amount={option.price} />
                                    )}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
                <div className="ui-levelup-actions ui-event-actions">
                    {forSale &&
                        (event.points !== undefined ? (
                            <span className="ui-raid-price">
                                {t("canvas.raid_points", { n: fmtNum(event.points) })}
                            </span>
                        ) : (
                            <Coins amount={coins} />
                        ))}
                    <button className="ui-button" onClick={() => client.leaveEvent()}>
                        {tl(event.leaveLabel)}
                    </button>
                </div>
            </div>
        </div>
    );
}
