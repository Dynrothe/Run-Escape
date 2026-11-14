import { JSX, useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
    BreakdownLine,
    BreakdownView,
    FormView,
    GearSlotView,
    HudView,
    SlotStatView,
    SlotView,
    StatRowView,
} from "../client/GameStore";
import { DAMAGE_KIND_ICONS, DamageKind, damageKindName } from "../content/damageKinds";
import { GEAR_SLOT_BY_ID } from "../content/items";
import { statIconFor } from "../content/statIcons";
import { t, tl } from "../i18n";
import { BreakdownTip } from "./BreakdownTip";
import { ItemIcon } from "./ItemIcon";
import "./PauseLoadout.css";
import { StatLine } from "./StatLine";

// The groups the stats are listed in, in order
const STAT_GROUP_NAMES: [StatRowView["group"], string][] = [
    ["offense", "pause.stats.offense"],
    ["defense", "pause.stats.defense"],
    ["utility", "pause.stats.utility"],
];

// The page tightens to fit what room the window leaves it, so the buttons under it stay in view:
// the roomiest layout first, then smaller icons and shorter rows. What still doesn't fit scrolls
// inside the page; it's never shrunk to unreadable.
const MAX_DENSITY = 3;
type Density = 0 | 1 | 2 | 3;
const WEAPON_ICON: Record<Density, number> = { 0: 64, 1: 48, 2: 32, 3: 32 };
const PASSIVE_ICON: Record<Density, number> = { 0: 48, 1: 32, 2: 32, 3: 32 };

const GREEN = "#00ff00";

type Fit = { density: Density; key: string };

// How tight the page has to be to fit: each time it's drawn and its page still scrolls, the next
// tighter layout is tried. It starts from the roomiest again when what's in it or the window's size
// changes.
function useFit(key: string): [React.RefObject<HTMLDivElement | null>, Fit] {
    const root = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState<Fit>({ density: 0, key });
    useLayoutEffect(() => {
        if (fit.key !== key) {
            setFit({ density: 0, key });
            return;
        }
        const page = root.current?.closest<HTMLElement>(".ui-pause-page");
        if (!page || page.scrollHeight <= page.clientHeight + 1) {
            return;
        }
        if (fit.density < MAX_DENSITY) {
            setFit({ ...fit, density: (fit.density + 1) as Density });
        }
    });
    useEffect(() => {
        const again = () => setFit((f) => ({ density: 0, key: f.key }));
        window.addEventListener("resize", again);
        return () => window.removeEventListener("resize", again);
    }, []);
    return [root, fit.key === key ? fit : { density: 0, key }];
}

// A section's name at the left, how many of its slots are used at the right, over a rule
function Heading({
    name,
    count,
    max,
}: {
    name: string;
    count?: number;
    max?: number;
}): JSX.Element {
    return (
        <h3 className="ui-loadout-heading">
            <span>{name}</span>
            {count !== undefined && max !== undefined && (
                <span className="ui-loadout-count">
                    {count}/{max}
                </span>
            )}
        </h3>
    );
}

// The runes that circle the hero, all in one icon: as many as are circling, in a ring
function OrbitIcon({ ids, size }: { ids: number[]; size: number }): JSX.Element {
    const box = Math.round((size * 36) / 32);
    const each = Math.round(size * (ids.length <= 2 ? 0.62 : ids.length <= 4 ? 0.55 : 0.46));
    const width = Math.round((each * 36) / 32);
    const radius = (box - width) / 2;
    return (
        <span className="ui-loadout-orbit" style={{ width: box, height: size }}>
            {ids.map((objId, i) => {
                const angle = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
                return (
                    <span
                        key={i}
                        style={{
                            left: box / 2 + Math.cos(angle) * radius - width / 2,
                            top: size / 2 + Math.sin(angle) * (size / 2 - each / 2) - each / 2,
                        }}
                    >
                        <ItemIcon objId={objId} size={each} />
                    </span>
                );
            })}
        </span>
    );
}

// A weapon's or passive's icon: its item, or for runes circling the hero all that circle
export function SlotIcon({ slot, size }: { slot: SlotView; size: number }): JSX.Element {
    return slot.orbit && slot.orbit.length > 1 ? (
        <OrbitIcon ids={slot.orbit} size={size} />
    ) : (
        <ItemIcon objId={slot.iconObjId} spriteId={slot.iconSpriteId} size={size} />
    );
}

// What the mouse over an item's square says, as the original's examine does: its name, a line or
// two of what it is and how it fights, and where it stands (at its best, able to evolve, not yet
// known how to evolve, or still to level up)
type SlotInfo = {
    name: string;
    color: string;
    examine: string;
    form?: FormView;
    evolved?: boolean;
};

function ExamineTip({ info }: { info: SlotInfo }): JSX.Element {
    return (
        <div className="ui-examine">
            <div className="ui-examine-name" style={{ color: info.color }}>
                {info.name}
            </div>
            <p className="ui-examine-text">{info.examine}</p>
            {info.evolved && <p className="ui-examine-note">{t("pause.slot.evolved_note")}</p>}
            {info.form && (
                <p className={`ui-examine-form ui-examine-form-${info.form.kind}`}>
                    {info.form.text}
                </p>
            )}
        </div>
    );
}

// The glow of a finished item: a soft golden aura behind its icon, and little motes of light that
// rise from it and fade, here and there over it
function Glow(): JSX.Element {
    return (
        <span className="ui-glow" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
                <i key={i} />
            ))}
        </span>
    );
}

// An item in its square, as the client frames an item: dark and sunk in, the icon big in it and
// never out of it. An evolved weapon's frame is violet with a star in the corner, and one that's
// done (at its last level, with nothing left to evolve into) glows. The mouse over it says what it
// is and where it stands (info).
function Slot({
    objId,
    spriteId,
    orbit,
    size,
    state,
    evolved,
    finished,
    info,
}: {
    objId: number;
    spriteId?: number;
    orbit?: number[];
    size: number;
    state?: "ready" | "over";
    evolved?: boolean;
    finished?: boolean;
    info?: SlotInfo;
}): JSX.Element {
    const side = Math.round((size * 36) / 32) + 8;
    return (
        <BreakdownTip content={info && <ExamineTip info={info} />} className="ui-loadout-slot-tip">
            <span
                className={
                    "ui-loadout-slot" +
                    (state ? ` ui-loadout-slot-${state}` : "") +
                    (evolved ? " ui-loadout-slot-evolved" : "") +
                    (finished ? " ui-loadout-slot-final" : "")
                }
                style={{ width: side, height: side }}
            >
                {finished && <Glow />}
                {orbit && orbit.length > 1 ? (
                    <OrbitIcon ids={orbit} size={size} />
                ) : (
                    <ItemIcon objId={objId} spriteId={spriteId} size={size} />
                )}
                {evolved && <i className="ui-loadout-star" aria-hidden />}
            </span>
        </BreakdownTip>
    );
}

// What a finished item wears beside its level: MAX in a dark plate
function MaxBadge(): JSX.Element {
    return (
        <span className="ui-max" title={t("pause.slot.final")}>
            <b>{t("pause.max")}</b>
        </span>
    );
}

// How far a slot has got, as the client writes a level: "Level 3/8" in yellow, green once it's
// the most it can be, and in an endless run with how many it's gone past it. One that's finished
// (nothing left to level or evolve into) wears the MAX badge before it.
function Level({
    level,
    maxLevel,
    finished,
}: {
    level: number;
    maxLevel: number;
    finished?: boolean;
}): JSX.Element {
    const maxed = level >= maxLevel;
    const over = level - maxLevel;
    return (
        <span
            className={
                "ui-loadout-level" +
                (maxed ? " ui-loadout-level-max" : "") +
                (finished ? " ui-loadout-level-final" : "") +
                (over > 0 ? " ui-loadout-level-over" : "")
            }
        >
            {finished && <MaxBadge />}
            <span>{t("pause.level", { level: Math.min(level, maxLevel), max: maxLevel })}</span>
            {over > 0 && <b> {t("pause.level_over", { n: over })}</b>}
        </span>
    );
}

// One stat as a row of a grid: its icon, its name, and its size at the right, with the tooltip
// that says how it got it
function StatCell({
    label,
    value,
    breakdown,
    kinds,
}: {
    label: string;
    value: string;
    breakdown?: BreakdownView;
    // A weapon's damage line: its kinds of damage, the first as the line's icon (Attack, Ranged
    // or Magic) and poison or burning after its name
    kinds?: DamageKind[];
}): JSX.Element {
    const kindIcon = kinds && DAMAGE_KIND_ICONS[kinds[0]];
    const icon = kindIcon ?? statIconFor(`${label} ${value}`);
    return (
        <BreakdownTip breakdown={breakdown} className="ui-loadout-cell">
            {icon ? (
                <ItemIcon {...icon} size={16} />
            ) : (
                <span className="ui-stat-spacer" style={{ width: 18, height: 16 }} aria-hidden />
            )}
            <span className="ui-loadout-cell-label">
                {label}
                {kinds?.slice(1).map((kind) => {
                    const extra = DAMAGE_KIND_ICONS[kind];
                    return (
                        extra && (
                            <span
                                key={kind}
                                className="ui-loadout-cell-kind"
                                title={damageKindName(kind)}
                            >
                                <ItemIcon
                                    objId={extra.objId ?? -1}
                                    spriteId={extra.spriteId}
                                    size={14}
                                />
                            </span>
                        )
                    );
                })}
            </span>
            <span className="ui-loadout-cell-value">{value}</span>
        </BreakdownTip>
    );
}

// A line like "+5% damage" as a cell: its number at the right, with what it's of at the left. The
// breakdown's total says which part is the number.
function splitCell(text: string, breakdown?: BreakdownView): SlotStatView {
    const total = breakdown?.lines[0]?.total;
    if (total && text.startsWith(total)) {
        const label = text.slice(total.length).trim();
        return {
            label: label.charAt(0).toUpperCase() + label.slice(1),
            value: total,
            breakdown,
        };
    }
    return { label: text, value: "", breakdown };
}

// ---- Evolutions: a square with what it makes, and how much of it there is, and a recipe on it ----

type Ingredient = {
    objId: number;
    spriteId?: number;
    name: string;
    // What the line says of it ("Level 3/8", "Owned")
    value: string;
    met: boolean;
};

// The recipe in the tooltip, as the client's make menus lay one out: what it makes, big, with its
// name in orange, and under it each thing it takes with its icon, in green once it's there and red
// while it isn't
function RecipePanel({
    into,
    intoIconObjId,
    ready,
    ingredients,
}: {
    into: string;
    intoIconObjId: number;
    ready: boolean;
    ingredients: Ingredient[];
}): JSX.Element {
    return (
        <div className="ui-recipe">
            <div className="ui-recipe-result">
                <span className={"ui-loadout-sq ui-loadout-sq-" + (ready ? "ready" : "plain")}>
                    <ItemIcon objId={intoIconObjId} size={32} />
                </span>
                <span className="ui-recipe-title">
                    <i className={ready ? "ui-recipe-ready" : undefined}>
                        {ready ? t("ui.hud.evolve_ready") : t("pause.evolve.into")}
                    </i>
                    <b>{tl(into)}</b>
                </span>
            </div>
            <div className="ui-recipe-needs">
                {ingredients.map((ingredient, i) => (
                    <div
                        key={i}
                        className={
                            "ui-recipe-need " +
                            (ingredient.met ? "ui-recipe-met" : "ui-recipe-missing")
                        }
                    >
                        <ItemIcon
                            objId={ingredient.objId}
                            spriteId={ingredient.spriteId}
                            size={16}
                        />
                        <span className="ui-recipe-need-name">{ingredient.name}</span>
                        <span>
                            {ingredient.value} {ingredient.met ? "✓" : "✗"}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// What an evolution makes, in a square at the card's right, dim until it can be and gold once it
// can, with a count in its corner as an item's is: how many of what it takes are there ("1/2",
// green at "2/2"). The recipe is in its tooltip.
function EvolutionBadge({
    into,
    intoIconObjId,
    ready,
    ingredients,
}: {
    into: string;
    intoIconObjId: number;
    ready: boolean;
    ingredients: Ingredient[];
}): JSX.Element {
    const met = ingredients.filter((ingredient) => ingredient.met).length;
    return (
        <BreakdownTip
            className="ui-loadout-sq-tip"
            content={
                <RecipePanel
                    into={into}
                    intoIconObjId={intoIconObjId}
                    ready={ready}
                    ingredients={ingredients}
                />
            }
        >
            <span className={"ui-loadout-sq ui-loadout-sq-" + (ready ? "ready" : "result")}>
                <ItemIcon objId={intoIconObjId} size={32} />
                <i
                    className={
                        "ui-loadout-count-badge" +
                        (met === ingredients.length ? " ui-loadout-count-badge-all" : "")
                    }
                >
                    {met}/{ingredients.length}
                </i>
            </span>
        </BreakdownTip>
    );
}

// A weapon's evolution: itself at its last level, and the passive that evolves it
function WeaponRecipe({ slot }: { slot: SlotView }): JSX.Element | null {
    const evolution = slot.evolution;
    if (!evolution) {
        return null;
    }
    return (
        <EvolutionBadge
            ready={evolution.ready}
            into={evolution.into}
            intoIconObjId={evolution.intoIconObjId}
            ingredients={[
                {
                    objId: slot.iconObjId,
                    name: tl(slot.name),
                    value: t("pause.level", {
                        level: Math.min(slot.level, slot.maxLevel),
                        max: slot.maxLevel,
                    }),
                    met: evolution.maxed,
                },
                {
                    objId: evolution.passiveIconObjId,
                    spriteId: evolution.passiveIconSpriteId,
                    name: tl(evolution.passive),
                    value: t(
                        evolution.hasPassive ? "pause.recipe.owned" : "pause.recipe.not_owned",
                    ),
                    met: evolution.hasPassive,
                },
            ]}
        />
    );
}

// A weapon or passive: its icon big in its square, its name and level, its stats in a grid, and
// at the right the recipe of what it evolves into
function SlotCard({
    slot,
    weapon,
    density,
    endless,
}: {
    slot: SlotView;
    weapon: boolean;
    density: Density;
    endless: boolean;
}): JSX.Element {
    const stats: SlotStatView[] =
        slot.statLines ?? (slot.stats ?? []).map((text) => ({ label: text, value: "" }));
    // A weapon's damage bonus is called that, not "Damage" over the damage it's a bonus to
    const split = slot.detail ? splitCell(slot.detail, slot.detailBreakdown) : undefined;
    const detail =
        split && weapon && slot.detailBreakdown
            ? { ...split, label: slot.detailBreakdown.title }
            : split;
    const damageLabel = t("weaponstat.damage");
    const ready = slot.evolution?.ready;
    // Done with: at its last level, nothing to evolve into, and no more levels to come (an endless
    // run has them)
    const finished = !endless && slot.level >= slot.maxLevel && !slot.evolution;
    return (
        <div
            className={
                "ui-loadout-card" +
                (weapon ? " ui-loadout-weapon" : "") +
                (ready ? " ui-loadout-card-ready" : "") +
                (finished ? " ui-loadout-card-final" : "")
            }
        >
            <Slot
                evolved={slot.evolved}
                finished={finished}
                info={
                    slot.examine
                        ? {
                              name: tl(slot.name),
                              color: slot.rarityColor,
                              examine: slot.examine,
                              form: slot.form,
                              evolved: slot.evolved,
                          }
                        : undefined
                }
                objId={slot.iconObjId}
                spriteId={slot.iconSpriteId}
                orbit={slot.orbit}
                size={weapon ? WEAPON_ICON[density] : PASSIVE_ICON[density]}
                state={ready ? "ready" : slot.level > slot.maxLevel ? "over" : undefined}
            />
            {finished && (
                <>
                    <i className="ui-loadout-corners" aria-hidden />
                    <i className="ui-loadout-embers" aria-hidden>
                        <b />
                        <b />
                        <b />
                    </i>
                </>
            )}
            <span className="ui-loadout-body">
                <span className="ui-loadout-title">
                    <span className="ui-loadout-name" style={{ color: slot.rarityColor }}>
                        {tl(slot.name)}
                    </span>
                    <Level level={slot.level} maxLevel={slot.maxLevel} finished={finished} />
                </span>
                <span className={"ui-loadout-grid" + (weapon ? "" : " ui-loadout-grid-one")}>
                    {stats.map((stat, i) => (
                        <StatCell
                            key={i}
                            {...stat}
                            kinds={stat.label === damageLabel ? slot.kinds : undefined}
                        />
                    ))}
                    {detail && <StatCell {...detail} />}
                </span>
            </span>
            <WeaponRecipe slot={slot} />
        </div>
    );
}

// A slot the hero has room for and nothing in yet: an empty square where its icon will go, what
// the slot is, and where one comes from
function EmptyCard({
    text,
    hint,
    size,
}: {
    text: string;
    hint: string;
    size: number;
}): JSX.Element {
    const side = Math.round((size * 36) / 32) + 8;
    return (
        <div className="ui-loadout-card ui-loadout-empty">
            <span className="ui-loadout-ghost" style={{ width: side, height: side }} aria-hidden>
                <i />
            </span>
            <span className="ui-loadout-body">
                <span className="ui-loadout-empty-name">{text}</span>
                <span className="ui-loadout-empty-hint">{hint}</span>
            </span>
        </div>
    );
}

// The hero's stats in groups: each a name and its size, dim when nothing adds to it, with the
// tooltip that lists what does
function StatsPanel({ rows }: { rows: StatRowView[] }): JSX.Element {
    return (
        <div className="ui-loadout-stats">
            {STAT_GROUP_NAMES.map(([group, key]) => {
                const inGroup = rows.filter((row) => row.group === group);
                return (
                    inGroup.length > 0 && (
                        <div key={group} className="ui-loadout-stat-group">
                            <h4>{t(key)}</h4>
                            {inGroup.map((row) => (
                                <BreakdownTip
                                    key={row.key}
                                    breakdown={row.breakdown}
                                    className={
                                        "ui-loadout-stat" +
                                        (row.zero ? " ui-loadout-stat-zero" : "")
                                    }
                                >
                                    <StatLine text={row.label} statKey={row.key} />
                                    <span className="ui-loadout-stat-value">{row.value}</span>
                                </BreakdownTip>
                            ))}
                        </div>
                    )
                );
            })}
        </div>
    );
}

// What a worn piece's tooltip says: its name, and each of its stats with how it got its size
// (and, for one that heals, when)
function gearTooltip(slot: GearSlotView): BreakdownView {
    const item = slot.item;
    if (!item) {
        return { title: tl(slot.name), lines: [{ parts: [{ text: t("pause.slot.empty_gear") }] }] };
    }
    const lines: BreakdownLine[] = [];
    item.lines.forEach((line, i) => {
        const cell = splitCell(line, item.lineBreakdowns?.[i]);
        const first = cell.breakdown?.lines[0];
        lines.push({
            label: cell.label,
            parts: first?.parts ?? [{ text: cell.value }],
            total: first?.total ?? (cell.value || undefined),
        });
        lines.push(...(cell.breakdown?.lines.slice(1) ?? []));
    });
    if (item.set) {
        lines.push({
            parts: [{ text: item.set.text, color: item.set.active ? GREEN : undefined }],
        });
    }
    return { title: tl(item.name), lines };
}

// The worn equipment follows the canonical OSRS silhouette. Run Escape has no weapon or ammo gear,
// so those two canonical positions stay open while every supported slot keeps its familiar place.
function GearGrid({ gear }: { gear: GearSlotView[] }): JSX.Element {
    return (
        <div className="ui-loadout-gear-grid">
            {gear.map((slot) => (
                <BreakdownTip
                    key={slot.slot}
                    breakdown={gearTooltip(slot)}
                    className={`ui-loadout-gear-anchor ui-loadout-gear-${slot.slot}`}
                >
                    <span
                        className={
                            "ui-loadout-gear-cell" +
                            (slot.item ? "" : " ui-loadout-gear-cell-empty")
                        }
                        style={
                            slot.item
                                ? { boxShadow: `inset 0 0 0 1px ${slot.item.rarity.color}` }
                                : undefined
                        }
                    >
                        {slot.item ? (
                            <ItemIcon objId={slot.item.objId} size={32} />
                        ) : (
                            <ItemIcon
                                spriteId={GEAR_SLOT_BY_ID.get(slot.slot)!.iconSpriteId}
                                size={32}
                            />
                        )}
                        <span className="ui-loadout-gear-cell-name">{tl(slot.name)}</span>
                    </span>
                </BreakdownTip>
            ))}
        </div>
    );
}

// The pause menu's Loadout: the run's weapons and passives (with the recipe of what each evolves
// into), followed by canonical worn equipment and the hero's stats. Wide layouts use the spare room
// below the cards for stats; narrow layouts keep equipment before stats in one column.
export function PauseLoadout({ hud }: { hud: HudView }): JSX.Element {
    const freeWeapons = Math.max(0, hud.maxWeapons - hud.weapons.length);
    const freePassives = Math.max(0, hud.maxPassives - hud.passives.length);
    const worn = hud.gear.filter((slot) => slot.item).length;
    // An endless run keeps levelling past the last level, so nothing's ever done with there
    const endless = hud.round !== undefined;
    const [root, { density }] = useFit(
        `${hud.weapons.length}:${hud.passives.length}:${worn}:${hud.maxWeapons}:${hud.maxPassives}`,
    );
    return (
        <div ref={root} className={`ui-loadout ui-loadout-d${density}`}>
            <div className="ui-loadout-column ui-loadout-column-main">
                <section>
                    <Heading
                        name={t("pause.heading.weapons")}
                        count={hud.weapons.length}
                        max={hud.maxWeapons}
                    />
                    <div className="ui-loadout-cards">
                        {hud.weapons.map((slot) => (
                            <SlotCard
                                key={slot.id}
                                slot={slot}
                                weapon
                                density={density}
                                endless={endless}
                            />
                        ))}
                        {Array.from({ length: freeWeapons }, (_, i) => (
                            <EmptyCard
                                key={i}
                                text={t("pause.slot.empty_weapon")}
                                hint={t("pause.slot.empty_weapon_hint")}
                                size={WEAPON_ICON[density]}
                            />
                        ))}
                    </div>
                </section>
                <section>
                    <Heading
                        name={t("pause.heading.passives")}
                        count={hud.passives.length}
                        max={hud.maxPassives}
                    />
                    <div className="ui-loadout-cards ui-loadout-passives">
                        {hud.passives.map((slot) => (
                            <SlotCard
                                key={slot.id}
                                slot={slot}
                                weapon={false}
                                density={density}
                                endless={endless}
                            />
                        ))}
                        {Array.from({ length: freePassives }, (_, i) => (
                            <EmptyCard
                                key={i}
                                text={t("pause.slot.empty_passive")}
                                hint={t("pause.slot.empty_passive_hint")}
                                size={PASSIVE_ICON[density]}
                            />
                        ))}
                    </div>
                </section>
            </div>
            <div className="ui-loadout-column ui-loadout-column-side">
                <section className="ui-loadout-equipment">
                    <Heading name={t("pause.heading.worn_equipment")} />
                    <GearGrid gear={hud.gear} />
                </section>
                <section className="ui-loadout-stats-panel">
                    <Heading name={t("pause.heading.your_stats")} />
                    <StatsPanel rows={hud.statRows} />
                </section>
            </div>
        </div>
    );
}
