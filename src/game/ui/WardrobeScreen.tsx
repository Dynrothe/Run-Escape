import { useEffect, useMemo, useState } from "react";

import { getBodyColorHsl } from "../../rs/model/player/PlayerModelLoader";
import { HSL_RGB_MAP } from "../../rs/util/ColorUtil";
import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { characterName, getCharacter } from "../content/characters";
import { RARITIES, RARITY_ORDER, Rarity } from "../content/rarity";
import {
    BODY_COLOURS,
    BODY_PARTS,
    COSMETICS,
    COSMETIC_BY_ID,
    CosmeticDef,
    MAX_OUTFIT_NAME,
    MAX_SAVED_OUTFITS,
    WARDROBE_SLOTS,
    WardrobeLook,
    bodyColourName,
    bodyPartName,
    cleanOutfitName,
    cosmeticName,
    getBodyKits,
    getCosmeticPrice,
    getDefaultBody,
    getPieceAdventurer,
    isWearingOutfit,
    ownsCosmetic,
    wearsWardrobe,
} from "../content/wardrobe";
import { SaveData } from "../core/save";
import { fmtNum, t, tl } from "../i18n";
import { Coins } from "./Coins";
import { ItemIcon } from "./ItemIcon";
import "./WardrobeScreen.css";
import { useMenuKeys } from "./menuKeys";

// The Wardrobe: the player's body and outfit, worn on every adventurer, and a store of outfit
// pieces bought with coins. The panel's on the left, so the adventurer stands beside it in the
// courtyard, wearing it all as it changes; a piece picked in the store is tried on there.

type Props = { ui: UiSnapshot; client: GameClient };

type Tab = "body" | "outfit" | "store";

// Store tiles on a page
const PAGE_SIZE = 40;

export function WardrobeScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const [tab, setTab] = useState<Tab>("body");
    useMenuKeys({ onBack: () => client.showScreen("title") });
    // Changing the body, the adventurer stands in it alone, so what changes can be seen
    useEffect(() => client.showBareBody(tab === "body"), [client, tab]);
    useEffect(() => () => client.showBareBody(false), [client]);
    const look = save.look ?? {};
    const character = getCharacter(ui.characterId);
    return (
        <div className="ui-fill ui-wardrobe-screen">
            <div className="ui-panel rs-border rs-background ui-wardrobe">
                <h2>{t("wardrobe.title")}</h2>
                <div className="ui-armoury-tabs" aria-label={t("wardrobe.title")}>
                    {(["body", "outfit", "store"] as const).map((id) => (
                        <button
                            key={id}
                            className={
                                "ui-armoury-tab" + (tab === id ? " ui-armoury-tab-selected" : "")
                            }
                            aria-pressed={tab === id}
                            onClick={() => {
                                client.previewLook(undefined);
                                setTab(id);
                            }}
                        >
                            {t(`wardrobe.tab.${id}`)}
                        </button>
                    ))}
                </div>
                {!wearsWardrobe(character) && (
                    <p className="ui-wardrobe-note">
                        {t("wardrobe.own_look", { name: characterName(character) })}
                    </p>
                )}
                <div className="ui-wardrobe-body">
                    {tab === "body" ? (
                        <BodyTab look={look} client={client} />
                    ) : tab === "outfit" ? (
                        <OutfitTab
                            save={save}
                            look={look}
                            characterId={ui.characterId}
                            client={client}
                        />
                    ) : (
                        <StoreTab save={save} look={look} client={client} />
                    )}
                </div>
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        {t("canvas.back")}
                    </button>
                    <Coins amount={save.coins} />
                </div>
            </div>
            <PreviewControls ui={ui} client={client} />
        </div>
    );
}

// Beside the adventurer: who's wearing it, and which way they face
function PreviewControls({ ui, client }: Props): JSX.Element {
    const unlocked = ui.save.unlockedCharacters;
    const at = unlocked.indexOf(ui.characterId);
    const step = (by: number) => {
        if (unlocked.length > 0) {
            client.selectCharacter(unlocked[(at + by + unlocked.length) % unlocked.length]);
        }
    };
    return (
        <div className="ui-panel rs-border rs-background ui-wardrobe-preview">
            <div className="ui-wardrobe-stepper">
                <button
                    className="ui-button ui-wardrobe-arrow"
                    aria-label={t("wardrobe.previous_adventurer")}
                    onClick={() => step(-1)}
                >
                    ‹
                </button>
                <span className="ui-wardrobe-stepper-value">
                    {characterName(getCharacter(ui.characterId))}
                </span>
                <button
                    className="ui-button ui-wardrobe-arrow"
                    aria-label={t("wardrobe.next_adventurer")}
                    onClick={() => step(1)}
                >
                    ›
                </button>
            </div>
            <div className="ui-wardrobe-stepper">
                <button
                    className="ui-button ui-wardrobe-arrow"
                    aria-label={t("wardrobe.turn_left")}
                    onClick={() => client.turnMenuCamera(-256)}
                >
                    ↶
                </button>
                <span className="ui-wardrobe-stepper-value ui-wardrobe-turn-label">
                    {t("wardrobe.turn")}
                </span>
                <button
                    className="ui-button ui-wardrobe-arrow"
                    aria-label={t("wardrobe.turn_right")}
                    onClick={() => client.turnMenuCamera(256)}
                >
                    ↷
                </button>
            </div>
        </div>
    );
}

// ---- The body ----

function BodyTab({ look, client }: { look: WardrobeLook; client: GameClient }): JSX.Element {
    const body = look.body ?? getDefaultBody();
    const setBody = (changes: Partial<typeof body>) =>
        client.setLook({ ...look, body: { ...body, ...changes } });
    return (
        <div className="ui-wardrobe-list">
            <p className="ui-subtle">{t("wardrobe.body_intro")}</p>
            <div className="ui-wardrobe-row">
                <span className="ui-wardrobe-label">{t("wardrobe.body_type")}</span>
                <div className="ui-wardrobe-choices">
                    {([0, 1] as const).map((bodyType) => (
                        <button
                            key={bodyType}
                            className={
                                "ui-armoury-tab" +
                                (body.bodyType === bodyType ? " ui-armoury-tab-selected" : "")
                            }
                            aria-pressed={body.bodyType === bodyType}
                            onClick={() => {
                                if (body.bodyType !== bodyType) {
                                    // A new body starts on its own kits, keeping the colours
                                    client.setLook({
                                        ...look,
                                        body: { ...getDefaultBody(bodyType), colors: body.colors },
                                    });
                                }
                            }}
                        >
                            {t(bodyType === 0 ? "wardrobe.body_a" : "wardrobe.body_b")}
                        </button>
                    ))}
                </div>
            </div>
            {BODY_PARTS.map((part, i) => {
                const kits = getBodyKits(body.bodyType, i);
                const at = Math.max(0, kits.indexOf(body.kits[i]));
                const step = (by: number) => {
                    const kits2 = body.kits.slice();
                    kits2[i] = kits[(at + by + kits.length) % kits.length];
                    setBody({ kits: kits2 });
                };
                return (
                    <div key={part.id} className="ui-wardrobe-row">
                        <span className="ui-wardrobe-label">{bodyPartName(part)}</span>
                        <div className="ui-wardrobe-stepper">
                            <button
                                className="ui-button ui-wardrobe-arrow"
                                aria-label={t("wardrobe.previous", { part: bodyPartName(part) })}
                                disabled={kits.length < 2}
                                onClick={() => step(-1)}
                            >
                                ‹
                            </button>
                            <span className="ui-wardrobe-stepper-value">
                                {body.kits[i] === -1
                                    ? t("wardrobe.none")
                                    : t("wardrobe.style_of", {
                                          n: fmtNum(at + 1),
                                          total: fmtNum(kits.length),
                                      })}
                            </span>
                            <button
                                className="ui-button ui-wardrobe-arrow"
                                aria-label={t("wardrobe.next", { part: bodyPartName(part) })}
                                disabled={kits.length < 2}
                                onClick={() => step(1)}
                            >
                                ›
                            </button>
                        </div>
                    </div>
                );
            })}
            {BODY_COLOURS.map((colour, i) => (
                <div key={colour.id} className="ui-wardrobe-row ui-wardrobe-colour-row">
                    <span className="ui-wardrobe-label">{bodyColourName(colour)}</span>
                    <div className="ui-wardrobe-swatches">
                        {Array.from({ length: colour.count }, (_, choice) => {
                            const rgb = HSL_RGB_MAP[getBodyColorHsl(i, choice)];
                            const picked = (body.colors[i] ?? 0) === choice;
                            return (
                                <button
                                    key={choice}
                                    className={
                                        "ui-wardrobe-swatch" +
                                        (picked ? " ui-wardrobe-swatch-picked" : "")
                                    }
                                    style={{ background: "#" + rgb.toString(16).padStart(6, "0") }}
                                    aria-label={t("wardrobe.colour_n", {
                                        name: bodyColourName(colour),
                                        n: fmtNum(choice + 1),
                                    })}
                                    aria-pressed={picked}
                                    onClick={() => {
                                        const colors = body.colors.slice();
                                        colors[i] = choice;
                                        setBody({ colors });
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            ))}
            <div className="ui-row">
                <button
                    className="ui-button"
                    onClick={() => client.setLook({ ...look, body: undefined })}
                >
                    {t("wardrobe.reset_body")}
                </button>
            </div>
        </div>
    );
}

// ---- The outfit ----

function OutfitTab({
    save,
    look,
    characterId,
    client,
}: {
    save: SaveData;
    look: WardrobeLook;
    characterId: string;
    client: GameClient;
}): JSX.Element {
    const [open, setOpen] = useState<number>();
    const character = getCharacter(characterId);
    const outfit = look.outfit ?? {};
    const wear = (slot: number, objId: number | undefined) => {
        const next = { ...outfit };
        if (objId === undefined) {
            delete next[slot];
        } else {
            next[slot] = objId;
        }
        client.setLook({ ...look, outfit: next });
    };
    const owned = (cosmetic: CosmeticDef) =>
        ownsCosmetic(save.cosmetics ?? [], save.unlockedCharacters, cosmetic.objId);
    return (
        <div className="ui-wardrobe-list">
            <p className="ui-subtle">{t("wardrobe.outfit_intro")}</p>
            <SavedOutfits save={save} look={look} client={client} />
            {WARDROBE_SLOTS.map((slot) => {
                const worn = outfit[slot.equipSlot];
                const own = character.equipment[slot.equipSlot];
                const pieces = COSMETICS.filter((c) => c.slot === slot.equipSlot && owned(c));
                const piece = worn !== undefined ? COSMETIC_BY_ID.get(worn) : undefined;
                return (
                    <div key={slot.id} className="ui-wardrobe-slot">
                        <button
                            className="ui-wardrobe-slot-head"
                            aria-expanded={open === slot.equipSlot}
                            onClick={() =>
                                setOpen(open === slot.equipSlot ? undefined : slot.equipSlot)
                            }
                        >
                            <ItemIcon objId={-1} spriteId={slot.iconSpriteId} size={26} />
                            <span className="ui-wardrobe-label">{tl(slot.name)}</span>
                            <span className="ui-wardrobe-worn">
                                {piece ? (
                                    <>
                                        <ItemIcon objId={piece.objId} size={24} />
                                        {cosmeticName(piece)}
                                    </>
                                ) : worn === -1 ? (
                                    t("wardrobe.nothing")
                                ) : (
                                    t("wardrobe.adventurers_own")
                                )}
                            </span>
                            <span className="ui-wardrobe-count">
                                {t("wardrobe.owned_n", { n: fmtNum(pieces.length) })}
                            </span>
                        </button>
                        {open === slot.equipSlot && (
                            <div className="ui-wardrobe-tiles">
                                <button
                                    className={
                                        "ui-card ui-wardrobe-tile ui-wardrobe-tile-text" +
                                        (worn === undefined ? " ui-card-selected" : "")
                                    }
                                    title={t("wardrobe.adventurers_own")}
                                    aria-pressed={worn === undefined}
                                    onClick={() => wear(slot.equipSlot, undefined)}
                                >
                                    {own !== undefined ? (
                                        <ItemIcon objId={own} size={28} />
                                    ) : (
                                        t("wardrobe.own_short")
                                    )}
                                </button>
                                <button
                                    className={
                                        "ui-card ui-wardrobe-tile ui-wardrobe-tile-text" +
                                        (worn === -1 ? " ui-card-selected" : "")
                                    }
                                    title={t("wardrobe.nothing")}
                                    aria-pressed={worn === -1}
                                    onClick={() => wear(slot.equipSlot, -1)}
                                >
                                    {t("wardrobe.none")}
                                </button>
                                {pieces.map((cosmetic) => (
                                    <CosmeticTile
                                        key={cosmetic.objId}
                                        cosmetic={cosmetic}
                                        selected={worn === cosmetic.objId}
                                        onClick={() => wear(slot.equipSlot, cosmetic.objId)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            <label className="ui-wardrobe-check">
                <input
                    type="checkbox"
                    checked={look.overGear === true}
                    onChange={(e) =>
                        client.setLook({ ...look, overGear: e.target.checked || undefined })
                    }
                />
                {t("wardrobe.over_gear")}
            </label>
            <div className="ui-row">
                <button
                    className="ui-button"
                    onClick={() => client.setLook({ ...look, outfit: undefined })}
                >
                    {t("wardrobe.clear_outfit")}
                </button>
            </div>
        </div>
    );
}

// Outfits kept under a name (SaveData.outfits): each goes on in one go, and what's worn saves as
// one, over one of the same name. Styled as the Tombs' invocation presets are.
function SavedOutfits({
    save,
    look,
    client,
}: {
    save: SaveData;
    look: WardrobeLook;
    client: GameClient;
}): JSX.Element {
    const outfits = save.outfits ?? [];
    const [name, setName] = useState("");
    // The outfit whose Delete was pressed once: a second press deletes it, so a slip beside its
    // Wear button doesn't
    const [deleting, setDeleting] = useState<string>();
    useEffect(() => {
        if (deleting === undefined) {
            return;
        }
        // Any other press takes it back (Safari gives a pressed button no focus, so no blur)
        const disarm = (e: PointerEvent) => {
            if (!(e.target instanceof Element && e.target.closest(".ui-invocations-preset-sure"))) {
                setDeleting(undefined);
            }
        };
        window.addEventListener("pointerdown", disarm, true);
        return () => window.removeEventListener("pointerdown", disarm, true);
    }, [deleting]);
    // A name left blank is the first "Outfit n" not taken
    let n = outfits.length + 1;
    while (outfits.some((o) => o.name === t("wardrobe.outfit_n", { n: fmtNum(n) }))) {
        n++;
    }
    const placeholder = t("wardrobe.outfit_n", { n: fmtNum(n) });
    const named = cleanOutfitName(name) || placeholder;
    const replaces = outfits.some((o) => o.name === named);
    const full = outfits.length >= MAX_SAVED_OUTFITS && !replaces;
    return (
        <div className="ui-invocations-presets">
            <div className="ui-invocations-presets-title">{t("wardrobe.saved_outfits")}</div>
            {outfits.length === 0 ? (
                <span className="ui-subtle">{t("wardrobe.saved_none")}</span>
            ) : (
                <div className="ui-invocations-preset-list">
                    {outfits.map((outfit) => {
                        const current = isWearingOutfit(look, outfit);
                        const sure = deleting === outfit.name;
                        return (
                            <div key={outfit.name} className="ui-invocations-preset">
                                <button
                                    className={
                                        "ui-button ui-invocations-preset-load" +
                                        (current ? " ui-invocations-preset-on" : "")
                                    }
                                    aria-label={t("wardrobe.wear_outfit", { name: outfit.name })}
                                    aria-current={current || undefined}
                                    onClick={() => client.wearOutfit(outfit.name)}
                                >
                                    {outfit.name}
                                </button>
                                <button
                                    className={
                                        "ui-button ui-button-small" +
                                        (sure ? " ui-invocations-preset-sure" : "")
                                    }
                                    aria-label={
                                        sure
                                            ? t("wardrobe.delete_sure", { name: outfit.name })
                                            : t("wardrobe.delete_outfit", { name: outfit.name })
                                    }
                                    onBlur={() => sure && setDeleting(undefined)}
                                    onClick={() => {
                                        if (!sure) {
                                            setDeleting(outfit.name);
                                            return;
                                        }
                                        setDeleting(undefined);
                                        client.deleteOutfit(outfit.name);
                                    }}
                                >
                                    {sure ? t("wardrobe.sure") : t("wardrobe.delete")}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            <form
                className="ui-invocations-preset-save"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!full && client.saveOutfit(named)) {
                        setName("");
                    }
                }}
            >
                <input
                    className="ui-coop-input"
                    value={name}
                    maxLength={MAX_OUTFIT_NAME}
                    placeholder={placeholder}
                    aria-label={t("wardrobe.outfit_name")}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                />
                <button className="ui-button" type="submit" disabled={full}>
                    {replaces ? t("wardrobe.replace_outfit") : t("wardrobe.save_outfit")}
                </button>
            </form>
            {full && (
                <span className="ui-subtle">
                    {t("wardrobe.outfits_full", { n: fmtNum(MAX_SAVED_OUTFITS) })}
                </span>
            )}
        </div>
    );
}

function CosmeticTile({
    cosmetic,
    selected,
    owned = true,
    onClick,
}: {
    cosmetic: CosmeticDef;
    selected: boolean;
    owned?: boolean;
    onClick: () => void;
}): JSX.Element {
    return (
        <button
            className={
                "ui-card ui-wardrobe-tile" +
                (selected ? " ui-card-selected" : "") +
                (owned ? " ui-wardrobe-tile-owned" : "")
            }
            style={{ borderColor: RARITIES[cosmetic.rarity].color }}
            title={cosmeticName(cosmetic)}
            aria-label={cosmeticName(cosmetic)}
            aria-pressed={selected}
            onClick={onClick}
        >
            <ItemIcon objId={cosmetic.objId} size={30} />
        </button>
    );
}

// ---- The store ----

function StoreTab({
    save,
    look,
    client,
}: {
    save: SaveData;
    look: WardrobeLook;
    client: GameClient;
}): JSX.Element {
    const [slot, setSlot] = useState<number>(WARDROBE_SLOTS[0].equipSlot);
    const [rarity, setRarity] = useState<Rarity>();
    const [search, setSearch] = useState("");
    const [hideOwned, setHideOwned] = useState(false);
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<number>();
    const owned = (objId: number) =>
        ownsCosmetic(save.cosmetics ?? [], save.unlockedCharacters, objId);
    const query = search.trim().toLowerCase();
    const shown = useMemo(
        () =>
            COSMETICS.filter(
                (c) =>
                    // A search looks through every slot
                    (query !== "" || c.slot === slot) &&
                    (rarity === undefined || c.rarity === rarity) &&
                    (query === "" || cosmeticName(c).toLowerCase().includes(query)) &&
                    !(hideOwned && owned(c.objId)),
            ),
        // owned goes by the save
        [slot, rarity, query, hideOwned, save],
    );
    const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    const at = Math.min(page, pages - 1);
    useEffect(() => setPage(0), [slot, rarity, query, hideOwned]);
    const pick = (cosmetic: CosmeticDef) => {
        setSelected(cosmetic.objId);
        // Tried on at once, over the outfit
        client.previewLook({
            ...look,
            outfit: { ...look.outfit, [cosmetic.slot]: cosmetic.objId },
        });
    };
    const piece = selected !== undefined ? COSMETIC_BY_ID.get(selected) : undefined;
    return (
        <div className="ui-wardrobe-store">
            <div className="ui-wardrobe-filters">
                <div className="ui-wardrobe-choices">
                    {WARDROBE_SLOTS.map((s) => (
                        <button
                            key={s.id}
                            className={
                                "ui-armoury-tab ui-wardrobe-slot-tab" +
                                (query === "" && slot === s.equipSlot
                                    ? " ui-armoury-tab-selected"
                                    : "")
                            }
                            title={tl(s.name)}
                            aria-label={tl(s.name)}
                            aria-pressed={query === "" && slot === s.equipSlot}
                            onClick={() => {
                                setSearch("");
                                setSlot(s.equipSlot);
                            }}
                        >
                            <ItemIcon objId={-1} spriteId={s.iconSpriteId} size={22} />
                        </button>
                    ))}
                </div>
                <input
                    className="ui-wardrobe-search"
                    type="search"
                    placeholder={t("wardrobe.search")}
                    aria-label={t("wardrobe.search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div className="ui-wardrobe-choices">
                    <button
                        className={
                            "ui-armoury-tab" +
                            (rarity === undefined ? " ui-armoury-tab-selected" : "")
                        }
                        aria-pressed={rarity === undefined}
                        onClick={() => setRarity(undefined)}
                    >
                        {t("wardrobe.all")}
                    </button>
                    {RARITY_ORDER.map((r) => (
                        <button
                            key={r}
                            className={
                                "ui-armoury-tab" + (rarity === r ? " ui-armoury-tab-selected" : "")
                            }
                            style={{ color: RARITIES[r].color }}
                            aria-pressed={rarity === r}
                            onClick={() => setRarity(rarity === r ? undefined : r)}
                        >
                            {tl(RARITIES[r].name)}
                        </button>
                    ))}
                    <label className="ui-wardrobe-check">
                        <input
                            type="checkbox"
                            checked={hideOwned}
                            onChange={(e) => setHideOwned(e.target.checked)}
                        />
                        {t("wardrobe.hide_owned")}
                    </label>
                </div>
            </div>
            <div className="ui-wardrobe-store-body">
                <div className="ui-wardrobe-grid-wrap">
                    {shown.length === 0 ? (
                        <p className="ui-subtle">{t("wardrobe.nothing_found")}</p>
                    ) : (
                        <div className="ui-wardrobe-grid">
                            {shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE).map((cosmetic) => (
                                <CosmeticTile
                                    key={cosmetic.objId}
                                    cosmetic={cosmetic}
                                    owned={owned(cosmetic.objId)}
                                    selected={selected === cosmetic.objId}
                                    onClick={() => pick(cosmetic)}
                                />
                            ))}
                        </div>
                    )}
                    <div className="ui-wardrobe-pages">
                        <button
                            className="ui-button ui-wardrobe-arrow"
                            aria-label={t("wardrobe.previous_page")}
                            disabled={at === 0}
                            onClick={() => setPage(at - 1)}
                        >
                            ‹
                        </button>
                        <span>
                            {t("wardrobe.page", { n: fmtNum(at + 1), total: fmtNum(pages) })}
                        </span>
                        <button
                            className="ui-button ui-wardrobe-arrow"
                            aria-label={t("wardrobe.next_page")}
                            disabled={at >= pages - 1}
                            onClick={() => setPage(at + 1)}
                        >
                            ›
                        </button>
                        <span className="ui-subtle">
                            {t("wardrobe.pieces_n", { n: fmtNum(shown.length) })}
                        </span>
                    </div>
                </div>
                <StoreDetails save={save} look={look} piece={piece} client={client} />
            </div>
        </div>
    );
}

function StoreDetails({
    save,
    look,
    piece,
    client,
}: {
    save: SaveData;
    look: WardrobeLook;
    piece: CosmeticDef | undefined;
    client: GameClient;
}): JSX.Element {
    if (!piece) {
        return (
            <div className="ui-select-details ui-wardrobe-details">
                <p className="ui-subtle">{t("wardrobe.store_intro")}</p>
            </div>
        );
    }
    const owned = ownsCosmetic(save.cosmetics ?? [], save.unlockedCharacters, piece.objId);
    const price = getCosmeticPrice(piece);
    const adventurer = getPieceAdventurer(piece.objId);
    const worn = look.outfit?.[piece.slot] === piece.objId;
    const slot = WARDROBE_SLOTS.find((s) => s.equipSlot === piece.slot);
    const wear = () =>
        client.setLook({ ...look, outfit: { ...look.outfit, [piece.slot]: piece.objId } });
    return (
        <div className="ui-select-details ui-wardrobe-details">
            <div className="ui-select-details-head">
                <ItemIcon objId={piece.objId} size={36} />
                <div>
                    <div className="ui-card-title" style={{ color: RARITIES[piece.rarity].color }}>
                        {cosmeticName(piece)}
                    </div>
                    <div className="ui-card-style">
                        {t("armoury.style", {
                            rarity: tl(RARITIES[piece.rarity].name),
                            slot: slot ? tl(slot.name) : "",
                        })}
                    </div>
                </div>
            </div>
            <p className="ui-subtle">{t("wardrobe.trying_on")}</p>
            {owned ? (
                <>
                    <div className="ui-card-style">
                        {adventurer && !save.cosmetics?.includes(piece.objId)
                            ? t("wardrobe.from_adventurer", {
                                  name: characterName(getCharacter(adventurer)),
                              })
                            : t("wardrobe.owned")}
                    </div>
                    <button className="ui-button ui-button-go" disabled={worn} onClick={wear}>
                        {worn ? t("wardrobe.wearing") : t("wardrobe.wear")}
                    </button>
                </>
            ) : (
                <>
                    <button
                        className="ui-button ui-button-go"
                        data-silent
                        disabled={save.coins < price}
                        onClick={() => {
                            if (client.buyCosmetic(piece.objId)) {
                                wear();
                            }
                        }}
                    >
                        {t("wardrobe.buy_and_wear")} <Coins amount={price} />
                    </button>
                    {save.coins < price && (
                        <div className="ui-card-short">
                            {t("ui.common.short_by", { n: fmtNum(price - save.coins) })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
