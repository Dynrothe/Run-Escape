import { CSSProperties, useEffect, useRef, useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import {
    BASIC_PACK,
    CARDS,
    CARD_KINDS,
    CardDef,
    CardKind,
    PACKS,
    PACK_SIZE,
    PackDef,
    cardKindName,
    cardLine,
    cardNumber,
    cardRarityName,
    cardTypeName,
    cardVersions,
    packCards,
    packDescription,
    packName,
} from "../content/cards";
import { RARITIES, RARITY_ORDER, Rarity, rarityName } from "../content/rarity";
import {
    PackCard,
    cantBuyCardPack,
    countCardsOwned,
    getBestVersion,
    getCardCopies,
    getCardPacks,
    getOwnedVersions,
    lastCardRarities,
} from "../core/cards";
import type { SaveData } from "../core/save";
import { fmtNum, list, t } from "../i18n";
import "./CardsScreen.css";
import { Coins } from "./Coins";
import { ItemIcon } from "./ItemIcon";
import { useMenuKeys } from "./menuKeys";
import { useDialog } from "./useDialog";

// Cards (content/cards.ts): the album of every card, each face down till it's been found, with the
// one picked shown big beside it; and the Card shop, its packs bought with coins and opened at
// once in a window over the screen. The free starter pack opens from either.

type Props = { ui: UiSnapshot; client: GameClient };

type Tab = "all" | CardKind;

export function CardsScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const [view, setView] = useState<"album" | "shop">("album");
    const [tab, setTab] = useState<Tab>("all");
    const cards = tab === "all" ? CARDS : CARDS.filter((card) => card.kind === tab);
    const [shownId, setShownId] = useState<string | undefined>(undefined);
    const shown = cards.find((card) => card.id === shownId) ?? cards[0];
    // The pack just opened, and which it was
    const [opened, setOpened] = useState<{ pack: PackDef; cards: PackCard[] } | undefined>();
    // A found card shown big in a window of its own, where there's no room for it beside the grid
    const [viewing, setViewing] = useState<CardDef | undefined>(undefined);
    const packs = getCardPacks(save);
    const backRef = useRef<HTMLButtonElement>(null);
    // A pack's window gives the focus back to the button that opened it, which can be gone or
    // disabled by then (no coins or packs left): then it goes to Back, so a controller keeps its
    // highlight
    useEffect(() => {
        if (!opened && document.activeElement === document.body) {
            backRef.current?.focus({ preventScroll: true });
        }
    }, [opened]);
    const pick = (card: CardDef) => {
        setShownId(card.id);
        if (getCardCopies(save, card.id) > 0 && window.matchMedia?.(NARROW).matches) {
            setViewing(card);
        }
    };
    const back = () => client.showScreen("title");
    const openHeld = () => {
        const cards = client.openCardPack();
        if (cards) {
            setOpened({ pack: BASIC_PACK, cards });
        }
    };
    const buy = (pack: PackDef) => {
        const cards = client.buyCardPack(pack);
        if (cards) {
            setOpened({ pack, cards });
        }
    };
    // Escape shuts a window first (a pack's cards are already in the album)
    useMenuKeys({
        onBack: opened ? () => setOpened(undefined) : viewing ? () => setViewing(undefined) : back,
    });
    const again = (pack: PackDef): { label: string; run: () => void } | undefined => {
        if (pack === BASIC_PACK && packs > 0) {
            return { label: t("cards.open_free", { n: fmtNum(packs) }), run: openHeld };
        }
        if (!cantBuyCardPack(save, pack)) {
            return {
                label: t("cards.buy_another", { price: fmtNum(pack.price) }),
                run: () => buy(pack),
            };
        }
        return undefined;
    };
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-cards">
                <h2>{t("cards.title")}</h2>
                <p className="ui-subtle">{t("cards.intro", { n: fmtNum(PACK_SIZE) })}</p>
                <div className="ui-cards-tabs">
                    <button
                        className={
                            "ui-cards-tab" + (view === "album" ? " ui-cards-tab-selected" : "")
                        }
                        onClick={() => setView("album")}
                    >
                        {t("cards.album")}
                    </button>
                    <button
                        className={
                            "ui-cards-tab" + (view === "shop" ? " ui-cards-tab-selected" : "")
                        }
                        onClick={() => setView("shop")}
                    >
                        {t("cards.shop")}
                    </button>
                    {view === "album" && <span className="ui-cards-tabs-gap" />}
                    {view === "album" &&
                        (["all", ...CARD_KINDS] as Tab[]).map((kind) => (
                            <button
                                key={kind}
                                className={
                                    "ui-cards-tab" + (tab === kind ? " ui-cards-tab-selected" : "")
                                }
                                onClick={() => setTab(kind)}
                            >
                                {kind === "all" ? t("cards.kind.all") : cardKindName(kind)}
                            </button>
                        ))}
                </div>
                {view === "album" ? (
                    <div className="ui-cards-body">
                        <div className="ui-cards-grid">
                            {cards.map((card) => {
                                const copies = getCardCopies(save, card.id);
                                return (
                                    <button
                                        key={card.id}
                                        className={
                                            "ui-cards-slot" +
                                            (card === shown ? " ui-cards-slot-selected" : "")
                                        }
                                        aria-label={
                                            copies > 0
                                                ? card.name()
                                                : t("cards.not_found_label", {
                                                      number: cardNumber(card),
                                                  })
                                        }
                                        onFocus={() => setShownId(card.id)}
                                        onClick={() => pick(card)}
                                    >
                                        {copies > 0 ? (
                                            <CardFace
                                                card={card}
                                                rarity={getBestVersion(save, card)!}
                                                size="small"
                                                copies={copies}
                                                versions={getOwnedVersions(save, card).length}
                                            />
                                        ) : (
                                            <CardBack size="small" card={card} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        {shown && <CardDetail save={save} card={shown} />}
                    </div>
                ) : (
                    <CardShop save={save} onBuy={buy} />
                )}
                <div className="ui-row">
                    <button ref={backRef} className="ui-button" onClick={back}>
                        {t("canvas.back")}
                    </button>
                    <span className="ui-cards-count">
                        {t("cards.collected", {
                            n: fmtNum(countCardsOwned(save)),
                            total: fmtNum(CARDS.length),
                        })}
                    </span>
                    <Coins amount={save.coins} />
                    {packs > 0 && (
                        <button className="ui-button" onClick={openHeld}>
                            {t("cards.open_free", { n: fmtNum(packs) })}
                        </button>
                    )}
                </div>
            </div>
            {viewing && (
                <CardWindow save={save} card={viewing} onClose={() => setViewing(undefined)} />
            )}
            {opened && (
                <PackWindow
                    // A fresh window for each pack, all face down
                    key={save.cardPacksOpened}
                    pack={opened.pack}
                    cards={opened.cards}
                    client={client}
                    again={again(opened.pack)}
                    onClose={() => setOpened(undefined)}
                />
            )}
        </div>
    );
}

// The Card shop: each pack's front, what it holds, its odds in words, how much of it is collected,
// its price and Buy (disabled, saying why, when it can't be bought)
function CardShop({
    save,
    onBuy,
}: {
    save: SaveData;
    onBuy: (pack: PackDef) => void;
}): JSX.Element {
    return (
        <div className="ui-cards-shop">
            {PACKS.map((pack) => {
                const pool = packCards(pack);
                const why = cantBuyCardPack(save, pack);
                return (
                    <div key={pack.id} className="ui-cards-offer">
                        <PackFront pack={pack} />
                        <div className="ui-cards-offer-text">
                            <div className="ui-cards-offer-name">{packName(pack)}</div>
                            <div className="ui-cards-offer-desc">{packDescription(pack)}</div>
                            <div className="ui-cards-offer-odds">
                                <span>{t("cards.odds_title")}</span>
                                {RARITY_ORDER.filter((r) => pack.odds[r] > 0).map((rarity) => (
                                    <span key={rarity} style={{ color: RARITIES[rarity].color }}>
                                        {t("cards.odds", {
                                            rarity: rarityName(rarity),
                                            n: fmtNum(Math.round(pack.odds[rarity] * 100)),
                                        })}
                                    </span>
                                ))}
                            </div>
                            {lastCardRarities(pack.odds).length <
                                RARITY_ORDER.filter((r) => pack.odds[r] > 0).length && (
                                <div className="ui-cards-offer-desc">
                                    {t("cards.last_card", {
                                        rarity: rarityName(lastCardRarities(pack.odds)[0]),
                                    })}
                                </div>
                            )}
                            <div className="ui-cards-offer-owned">
                                {t("cards.collected", {
                                    n: fmtNum(countCardsOwned(save, pool)),
                                    total: fmtNum(pool.length),
                                })}
                            </div>
                            <div className="ui-cards-offer-buy">
                                <Coins amount={pack.price} />
                                <button
                                    className="ui-button"
                                    disabled={why !== undefined}
                                    aria-label={t("cards.buy_pack", { name: packName(pack) })}
                                    onClick={() => onBuy(pack)}
                                >
                                    {t("cards.buy")}
                                </button>
                            </div>
                            {why === "coins" && (
                                <div className="ui-cards-offer-why">
                                    {t("cards.need_coins", {
                                        n: fmtNum(pack.price - save.coins),
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// A pack's front: a sealed foil wrapper in the pack's colour, crimped at both ends, with its name
// over a medal holding its item
export function PackFront({ pack }: { pack: PackDef }): JSX.Element {
    return (
        <span
            className="ui-tcg-pack"
            style={{ "--pack-color": pack.color } as CSSProperties}
            aria-hidden="true"
        >
            <span className="ui-tcg-pack-crimp" />
            <span className="ui-tcg-pack-name">{packName(pack)}</span>
            <span className="ui-tcg-pack-medal">
                <ItemIcon objId={pack.objId} size={32} />
            </span>
            <span className="ui-tcg-pack-count">
                {t("cards.pack_count", { n: fmtNum(PACK_SIZE) })}
            </span>
            <span className="ui-tcg-pack-crimp" />
        </span>
    );
}

// Where the card's big view beside the grid is left out (CardsScreen.css, Mobile.css)
const NARROW = "(pointer: coarse), (max-width: 760px)";

type Size = "small" | "big";

function rarityStyle(rarity: Rarity): CSSProperties {
    return { "--card-rarity": RARITIES[rarity].color } as CSSProperties;
}

// A card's face, as a trading card: its rarity's colour in the frame (and its name in words on the
// type line, so it's never told by colour alone), the name in a title bar, the item's own icon at
// a whole multiple of its size in a window over a backdrop for its kind, the type line, a short
// line of what it is, and its number in the set. Rare and Very rare are foil: a sheen that moves
// only where `moving` asks (the big card and a pack's window), not across the whole album.
export function CardFace({
    card,
    rarity,
    size,
    copies = 0,
    versions = 1,
    isNew = false,
    moving = false,
}: {
    card: CardDef;
    // The version shown (cardVersions)
    rarity: Rarity;
    size: Size;
    copies?: number;
    // Versions owned, when the album shows the card: more than one is said on its footer
    versions?: number;
    isNew?: boolean;
    moving?: boolean;
}): JSX.Element {
    const foil = rarity === "rare" || rarity === "veryRare";
    return (
        <span
            className={
                `ui-tcg ui-tcg-${size} ui-tcg-face ui-tcg-${rarity}` +
                (foil ? " ui-tcg-foil" : "") +
                (moving ? " ui-tcg-moving" : "")
            }
            style={rarityStyle(rarity)}
        >
            <span className="ui-tcg-title">
                <span className="ui-tcg-name">{card.name()}</span>
                {copies > 1 && <span className="ui-tcg-copies">x{fmtNum(copies)}</span>}
            </span>
            <span className={`ui-tcg-art ui-tcg-art-${card.kind}`}>
                <ItemIcon
                    objId={card.objId}
                    spriteId={card.spriteId}
                    // Whole multiples of the icon's 32 pixels, so its pixels stay even
                    size={size === "big" ? 96 : 64}
                />
                {isNew && <span className="ui-tcg-new">{t("cards.new")}</span>}
            </span>
            <span className="ui-tcg-typeline">
                <span>{cardTypeName(card.kind)}</span>
                <span className="ui-tcg-rarity">{cardRarityName(rarity)}</span>
            </span>
            <span className="ui-tcg-text">{size === "big" ? card.text() : cardLine(card)}</span>
            <span className="ui-tcg-footer">
                <span>
                    {versions > 1
                        ? t("cards.versions_n", { n: fmtNum(versions) })
                        : t("cards.set_name")}
                </span>
                <span>{cardNumber(card)}</span>
            </span>
            {foil && <span className="ui-tcg-sheen" aria-hidden="true" />}
        </span>
    );
}

// A card face down: the deck's own back, the same for every card. In the album, a card not found
// yet shows its back with its number, so what's missing can be told apart.
export function CardBack({ size, card }: { size: Size; card?: CardDef }): JSX.Element {
    return (
        <span className={`ui-tcg ui-tcg-${size} ui-tcg-back` + (card ? " ui-tcg-missing" : "")}>
            <span className="ui-tcg-back-panel">
                <span className="ui-tcg-back-medal" aria-hidden="true">
                    RE
                </span>
            </span>
            {card && <span className="ui-tcg-back-number">{cardNumber(card)}</span>}
        </span>
    );
}

// The versions of a card owned, in words ("Common x3, Rare x1"), and those it comes in
function Versions({ save, card }: { save: SaveData; card: CardDef }): JSX.Element {
    const owned = getOwnedVersions(save, card);
    return (
        <div className="ui-cards-detail-text">
            <div>
                {t("cards.versions_owned", {
                    list: list(
                        owned.map(({ rarity, copies }) =>
                            t("cards.version_copies", {
                                rarity: cardRarityName(rarity),
                                n: fmtNum(copies),
                            }),
                        ),
                    ),
                })}
            </div>
            <div className="ui-cards-versions-all">
                {t("cards.versions_all", {
                    list: list(cardVersions(card).map(cardRarityName)),
                })}
            </div>
        </div>
    );
}

// The card picked in the album, big, at its rarest version owned, with the versions owned; one
// not found yet stays face down
function CardDetail({ save, card }: { save: SaveData; card: CardDef }): JSX.Element {
    const best = getBestVersion(save, card);
    return (
        <div className="ui-cards-detail">
            {best ? (
                <>
                    <CardFace card={card} rarity={best} size="big" moving />
                    <Versions save={save} card={card} />
                </>
            ) : (
                <>
                    <CardBack size="big" card={card} />
                    <div className="ui-cards-detail-text">{t("cards.not_found")}</div>
                </>
            )}
        </div>
    );
}

// A found card, big, in a window over the album: on a phone, where it can't go beside the grid
function CardWindow({
    save,
    card,
    onClose,
}: {
    save: SaveData;
    card: CardDef;
    onClose: () => void;
}): JSX.Element {
    const { dialogProps } = useDialog<HTMLDivElement>();
    return (
        <div className="ui-modal" onClick={onClose}>
            <div
                {...dialogProps}
                aria-labelledby={undefined}
                aria-label={card.name()}
                className="ui-panel rs-border rs-background ui-cards-view"
                onClick={(event) => event.stopPropagation()}
            >
                <CardFace card={card} rarity={getBestVersion(save, card)!} size="big" moving />
                <Versions save={save} card={card} />
                <button className="ui-button" onClick={onClose}>
                    {t("cards.close")}
                </button>
            </div>
        </div>
    );
}

// A pack just opened: its cards face down, each turned over when picked (or all at once), the new
// ones marked; then the same pack again, if there's one held or the coins for it
function PackWindow({
    pack,
    cards,
    client,
    again,
    onClose,
}: {
    pack: PackDef;
    cards: PackCard[];
    client: GameClient;
    again?: { label: string; run: () => void };
    onClose: () => void;
}): JSX.Element {
    const [turned, setTurned] = useState<boolean[]>(() => cards.map(() => false));
    const { titleId, dialogProps } = useDialog<HTMLDivElement>();
    const allTurned = turned.every(Boolean);
    // Turn all over goes as it's pressed, and the last card turned is no use pressed again: the
    // focus goes to Done, so a keyboard or a controller carries on from there
    const doneRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (allTurned) {
            doneRef.current?.focus({ preventScroll: true });
        }
    }, [allTurned]);
    const turn = (i: number) => {
        if (!turned[i]) {
            client.revealCard(cards[i].rarity);
            setTurned((was) => was.map((up, j) => up || j === i));
        }
    };
    const turnAll = () => {
        // One sound, the rarest's
        const hidden = cards.filter((_, i) => !turned[i]);
        const rarest = hidden
            .map((c) => c.rarity)
            .sort((a, b) => RARITY_ORDER.indexOf(b) - RARITY_ORDER.indexOf(a))[0];
        if (rarest) {
            client.revealCard(rarest);
        }
        setTurned(cards.map(() => true));
    };
    return (
        <div className="ui-modal">
            <div {...dialogProps} className="ui-panel rs-border rs-background ui-cards-pack">
                <h2 id={titleId} className="ui-cards-pack-title">
                    <ItemIcon objId={pack.objId} size={32} />
                    {packName(pack)}
                </h2>
                <p className="ui-subtle">{t("cards.pack_hint")}</p>
                <div className="ui-cards-pack-row">
                    {cards.map(({ card, rarity, isNew }, i) => (
                        <button
                            key={i}
                            className="ui-cards-slot"
                            aria-label={turned[i] ? card.name() : t("cards.face_down")}
                            onClick={() => turn(i)}
                        >
                            {turned[i] ? (
                                <span className="ui-tcg-turned">
                                    <CardFace
                                        card={card}
                                        rarity={rarity}
                                        size="small"
                                        isNew={isNew}
                                        moving
                                    />
                                </span>
                            ) : (
                                <CardBack size="small" />
                            )}
                        </button>
                    ))}
                </div>
                <div className="ui-row">
                    {allTurned ? (
                        <>
                            <button ref={doneRef} className="ui-button" onClick={onClose}>
                                {t("cards.done")}
                            </button>
                            {again && (
                                <button className="ui-button" onClick={again.run}>
                                    {again.label}
                                </button>
                            )}
                        </>
                    ) : (
                        <button className="ui-button" onClick={turnAll}>
                            {t("cards.turn_all")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
