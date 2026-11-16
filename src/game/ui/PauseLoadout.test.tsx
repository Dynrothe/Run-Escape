// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { BreakdownView, GearSlotView, HudView, SlotView } from "../client/GameStore";
import { PauseLoadout } from "./PauseLoadout";

afterEach(cleanup);

// A mouse over it, or off it: jsdom has no pointer events, so one is made, as the other tests do
function mouse(element: Element, type: "pointerover" | "pointerout"): void {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(element, event);
}

function slot(
    id: string,
    level: number,
    maxLevel: number,
    extra: Partial<SlotView> = {},
): SlotView {
    return {
        id,
        name: id,
        level,
        maxLevel,
        iconObjId: 1,
        rarityColor: "#fff",
        ...extra,
    };
}

function hud(weapons: SlotView[], passives: SlotView[] = []): HudView {
    return {
        mapId: "lumbridge",
        level: 5,
        maxWeapons: 4,
        maxPassives: 4,
        weapons,
        passives,
        stats: [],
        statRows: [],
        gear: [],
        inventory: [],
        rerolls: 0,
        banishes: 0,
    };
}

function levels(view: ReturnType<typeof render>): (string | null)[] {
    return [...view.container.querySelectorAll(".ui-loadout-level")].map((e) => e.textContent);
}

test("a level shows as Level n/max, and one past the last (endless) with how many past", () => {
    const view = render(
        <PauseLoadout hud={hud([slot("a", 3, 8), slot("b", 8, 8), slot("c", 11, 8)])} />,
    );
    // (A weapon at its last level, with nothing to evolve into, wears the MAX badge before it)
    expect(levels(view)).toEqual(["Level 3/8", "MAXLevel 8/8", "MAXLevel 8/8 +3"]);
    const all = view.container.querySelectorAll(".ui-loadout-level");
    expect(all[1].classList.contains("ui-loadout-level-max")).toBe(true);
    expect(all[2].querySelector(":scope > b")?.textContent).toBe(" +3");
});

test("a weapon's stats are a grid of cells, each with its name and size", () => {
    const weapon = slot("scimitar", 2, 8, {
        statLines: [
            { label: "Damage", value: "18" },
            { label: "Attacks", value: "1.11/s" },
        ],
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    const cells = [...view.container.querySelectorAll(".ui-loadout-cell")].map((cell) => [
        cell.querySelector(".ui-loadout-cell-label")?.textContent,
        cell.querySelector(".ui-loadout-cell-value")?.textContent,
    ]);
    expect(cells).toEqual([
        ["Damage", "18"],
        ["Attacks", "1.11/s"],
    ]);
});

const breakdown: BreakdownView = {
    title: "Damage",
    lines: [
        {
            parts: [
                { label: "Base", text: "8" },
                { label: "Level 2", text: "+2", color: "#56e156" },
                { label: "Level 3", text: "+3", color: "#ff863c" },
            ],
            total: "13",
        },
    ],
};

test("the mouse over a stat shows how it got its size, each part in its rarity's colour", () => {
    const weapon = slot("scimitar", 3, 8, {
        statLines: [{ label: "Damage", value: "13", breakdown }],
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    const cell = view.container.querySelector(".ui-loadout-cell")!;
    expect(screen.queryByRole("tooltip")).toBeNull();
    mouse(cell, "pointerover");
    const tip = screen.getByRole("tooltip");
    // What it comes to is in the head, and each level up is a row of its own
    expect(tip.querySelector(".ui-breakdown-sum")?.textContent).toBe("13");
    const rows = [...tip.querySelectorAll(".ui-breakdown-rows > li")] as HTMLElement[];
    expect(rows.map((row) => row.textContent)).toEqual(["Base8", "Level 2+2", "Level 3+3"]);
    const sizes = rows.map((row) => (row.lastElementChild as HTMLElement).style.color);
    expect(sizes).toEqual(["", "rgb(86, 225, 86)", "rgb(255, 134, 60)"]);
    mouse(cell, "pointerout");
    expect(screen.queryByRole("tooltip")).toBeNull();
});

test("a stat of the hero's has its tooltip too, listing what gives it", () => {
    const view = render(
        <PauseLoadout
            hud={{
                ...hud([]),
                statRows: [
                    {
                        key: "might",
                        group: "offense",
                        label: "Damage",
                        value: "+15%",
                        zero: false,
                        breakdown: {
                            title: "Damage",
                            total: "+15%",
                            lines: [
                                {
                                    label: "Tome of fire",
                                    parts: [{ text: "+5%" }, { text: "+10%" }],
                                },
                            ],
                        },
                    },
                ],
            }}
        />,
    );
    fireEvent.focus(view.container.querySelector(".ui-loadout-stat")!);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Tome of fire");
    expect(tip.textContent).toContain("+5%+10%");
});

const emptyGear: GearSlotView[] = [
    { slot: "head", name: "Head" },
    { slot: "cape", name: "Cape" },
    { slot: "neck", name: "Neck" },
    { slot: "body", name: "Body" },
    { slot: "shield", name: "Shield" },
    { slot: "legs", name: "Legs" },
    { slot: "hands", name: "Hands" },
    { slot: "feet", name: "Feet" },
    { slot: "ring", name: "Ring" },
];

test("the active effects sit in the equipment's column, under it, and the stats are apart", () => {
    const view = render(<PauseLoadout hud={{ ...hud([]), gear: emptyGear }} />);
    const side = view.container.querySelector(".ui-loadout-column-side")!;
    const equipment = side.querySelector(".ui-loadout-equipment")!;
    const effects = side.querySelector(".ui-loadout-effects")!;
    expect(
        equipment.compareDocumentPosition(effects) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(side.querySelector(".ui-loadout-stats-panel")).toBeNull();
    const stats = view.container.querySelector(".ui-loadout > .ui-loadout-stats-panel")!;
    expect(side.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("worn equipment uses the canonical OSRS slot map", () => {
    const view = render(<PauseLoadout hud={{ ...hud([]), gear: emptyGear }} />);
    const equipment = view.container.querySelector(".ui-loadout-equipment")!;
    // The nine slots a run fills, and the weapon and ammo squares it never does, drawn locked
    expect(equipment.querySelectorAll(".ui-loadout-gear-anchor")).toHaveLength(11);
    expect(equipment.querySelectorAll(".ui-loadout-gear-cell-locked")).toHaveLength(2);
    for (const slot of emptyGear) {
        const anchor = equipment.querySelector(`.ui-loadout-gear-${slot.slot}`)!;
        expect(anchor.textContent).toContain(slot.name);
        expect(anchor.querySelector(".ui-icon")).not.toBeNull();
    }
    for (const name of ["Weapon", "Ammo"]) {
        const locked = equipment.querySelector(`.ui-loadout-gear-${name.toLowerCase()}`)!;
        expect(locked.textContent).toContain(name);
        expect(locked.querySelector(".ui-loadout-gear-cell-locked")).not.toBeNull();
    }
});

test("the revives: how many are left, and a red last stand with a skull once there are none", () => {
    const view = render(
        <PauseLoadout hud={{ ...hud([]), revives: { left: 2, given: 3, coop: true } }} />,
    );
    const panel = view.container.querySelector(".ui-loadout-revives")!;
    expect(panel.textContent).toContain("Revives left");
    expect(panel.querySelector(".ui-loadout-revive-value")?.textContent).toBe("2");
    expect(panel.textContent).toContain("Teammates revived");
    expect(panel.querySelector(".ui-loadout-revives-last")).toBeNull();
    cleanup();
    const last = render(
        <PauseLoadout hud={{ ...hud([]), revives: { left: 0, given: 0, coop: false } }} />,
    );
    expect(last.container.querySelector(".ui-loadout-revives-last")?.textContent).toContain(
        "Last stand",
    );
    expect(last.container.textContent).not.toContain("Teammates revived");
});

const missing = {
    passive: "Piety",
    passiveIconObjId: 2,
    into: "Abyssal whip",
    intoIconObjId: 3,
    maxed: true,
    hasPassive: false,
    ready: false,
};

test("a weapon's evolution is a square with what it makes and a count of what's there", () => {
    const weapon = slot("scimitar", 8, 8, { evolution: missing });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    const square = view.container.querySelector(".ui-loadout-sq")!;
    expect(view.container.querySelectorAll(".ui-loadout-sq")).toHaveLength(1);
    // Its last level is there, the passive isn't: one of two
    expect(square.querySelector(".ui-loadout-count-badge")?.textContent).toBe("1/2");
    expect(square.classList.contains("ui-loadout-sq-result")).toBe(true);
    expect(view.container.querySelector(".ui-loadout-card-ready")).toBeNull();
});

test("the recipe is in its tooltip: what it makes, and each thing it takes, green or red", () => {
    const weapon = slot("scimitar", 8, 8, { evolution: missing });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    mouse(view.container.querySelector(".ui-loadout-sq")!.parentElement!, "pointerover");
    const tip = screen.getByRole("tooltip");
    expect(tip.querySelector(".ui-recipe-title b")?.textContent).toBe("Abyssal whip");
    expect(tip.querySelector(".ui-recipe-title i")?.textContent).toBe("Evolves into");
    const needs = [...tip.querySelectorAll(".ui-recipe-need")];
    expect(needs.map((need) => need.textContent)).toEqual([
        "scimitarLevel 8/8 ✓",
        "PietyNot owned ✗",
    ]);
    expect(needs[0].classList.contains("ui-recipe-met")).toBe(true);
    expect(needs[1].classList.contains("ui-recipe-missing")).toBe(true);
});

test("one that can evolve now is gold with all of its count, and free slots show", () => {
    const weapon = slot("scimitar", 8, 8, {
        evolution: { ...missing, hasPassive: true, ready: true },
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    expect(view.container.querySelectorAll(".ui-loadout-card-ready")).toHaveLength(1);
    expect(view.container.querySelectorAll(".ui-loadout-sq-ready")).toHaveLength(1);
    const count = view.container.querySelector(".ui-loadout-count-badge")!;
    expect(count.textContent).toBe("2/2");
    expect(count.classList.contains("ui-loadout-count-badge-all")).toBe(true);
    mouse(view.container.querySelector(".ui-loadout-sq")!.parentElement!, "pointerover");
    expect(screen.getByRole("tooltip").textContent).toContain("Ready to evolve");
    expect(view.container.querySelectorAll(".ui-loadout-empty")).toHaveLength(3 + 4);
});

test("a passive has no evolution square: the hint is on the weapon", () => {
    const view = render(<PauseLoadout hud={hud([], [slot("piety", 1, 5)])} />);
    expect(view.container.querySelector(".ui-loadout-sq")).toBeNull();
});

test("runes that circle the hero are drawn as one icon with all of them", () => {
    const runes = slot("elemental_runes", 3, 8, { orbit: [556, 555, 557] });
    const single = slot("single_rune", 1, 8, { orbit: [556] });
    const view = render(<PauseLoadout hud={hud([runes, single])} />);
    const cards = view.container.querySelectorAll(".ui-loadout-weapon");
    expect(cards[0].querySelectorAll(".ui-loadout-orbit > span")).toHaveLength(3);
    // One rune is just the item
    expect(cards[1].querySelector(".ui-loadout-orbit")).toBeNull();
});

test("a stat nothing adds to says so in its tooltip", () => {
    const view = render(
        <PauseLoadout
            hud={{
                ...hud([]),
                statRows: [
                    {
                        key: "growth",
                        group: "utility",
                        label: "Experience",
                        value: "0%",
                        zero: true,
                        breakdown: {
                            title: "Experience",
                            total: "0%",
                            lines: [{ parts: [{ text: "Nothing adds to this yet" }] }],
                        },
                    },
                ],
            }}
        />,
    );
    mouse(view.container.querySelector(".ui-loadout-stat")!, "pointerover");
    expect(screen.getByRole("tooltip").textContent).toContain("Nothing adds to this yet");
});

test("every level up is a row of its own, in order, in a list that scrolls (endless's hundreds)", () => {
    const parts = [
        { label: "Base", text: "8" },
        ...Array.from({ length: 150 }, (_, i) => ({
            label: `Level ${i + 2}`,
            text: i % 2 ? "+2" : "+2",
            color: i % 2 ? "#56e156" : "#ff863c",
        })),
    ];
    const weapon = slot("scimitar", 151, 8, {
        statLines: [
            {
                label: "Damage",
                value: "400",
                breakdown: { title: "Damage", lines: [{ parts, total: "400" }] },
            },
        ],
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    mouse(view.container.querySelector(".ui-loadout-cell")!, "pointerover");
    const tip = screen.getByRole("tooltip");
    // None are joined: equal steps stay as separate rows
    const rows = [...tip.querySelectorAll(".ui-breakdown-rows > li")];
    expect(rows).toHaveLength(151);
    expect(rows[1].textContent).toBe("Level 2+2");
    expect(rows[2].textContent).toBe("Level 3+2");
    expect(rows[150].textContent).toBe("Level 151+2");
    // And they're in a box of their own that scrolls, under the head
    const box = tip.querySelector(".ui-breakdown-scroll")!;
    expect(box.querySelector(".ui-breakdown-rows")).not.toBeNull();
    expect(tip.querySelector(".ui-breakdown-head .ui-breakdown-sum")?.textContent).toBe("400");
});

test("the mouse wheel over a stat scrolls its tooltip's list", () => {
    const parts = Array.from({ length: 60 }, (_, i) => ({ label: `Level ${i + 1}`, text: "+1" }));
    const weapon = slot("scimitar", 60, 8, {
        statLines: [
            {
                label: "Damage",
                value: "60",
                breakdown: { title: "Damage", lines: [{ parts, total: "60" }] },
            },
        ],
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    const cell = view.container.querySelector(".ui-loadout-cell")!;
    mouse(cell, "pointerover");
    const box = screen.getByRole("tooltip").querySelector<HTMLElement>(".ui-breakdown-scroll")!;
    // jsdom has no layout, so say the list is taller than its box
    Object.defineProperty(box, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(box, "clientHeight", { value: 260, configurable: true });
    const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    cell.dispatchEvent(wheel);
    expect(box.scrollTop).toBe(100);
    expect(wheel.defaultPrevented).toBe(true);
});

test("a weapon at its last level with nothing to evolve into glows, and wears the MAX badge", () => {
    const view = render(
        <PauseLoadout
            hud={hud([slot("scimitar", 8, 8), slot("knives", 3, 8)], [slot("piety", 5, 5)])}
        />,
    );
    const cards = view.container.querySelectorAll(".ui-loadout-card");
    expect(cards[0].querySelector(".ui-glow")).not.toBeNull();
    expect(cards[0].classList.contains("ui-loadout-card-final")).toBe(true);
    // Lit up: the glow, the bracketed corners, the embers, and the MAX badge
    expect(cards[0].querySelector(".ui-loadout-corners")).not.toBeNull();
    expect(cards[0].querySelector(".ui-loadout-embers")).not.toBeNull();
    expect(cards[0].querySelector(".ui-max > b")?.textContent).toBe("MAX");
    expect(cards[1].querySelector(".ui-glow")).toBeNull();
    expect(cards[1].querySelector(".ui-max")).toBeNull();
    expect(cards[1].querySelector(".ui-loadout-corners")).toBeNull();
    // A passive at its last level too
    expect(view.container.querySelectorAll(".ui-glow")).toHaveLength(2);
    // The badge says what it is
    expect(cards[0].querySelector(".ui-max")?.getAttribute("title")).toBe("Fully upgraded");
});

test("it doesn't glow while it can still evolve, or in an endless run, which goes on levelling", () => {
    const evolving = slot("scimitar", 8, 8, {
        evolution: { ...missing, hasPassive: true, ready: true },
    });
    const view = render(<PauseLoadout hud={hud([evolving])} />);
    expect(view.container.querySelector(".ui-glow")).toBeNull();
    cleanup();
    const endless = render(<PauseLoadout hud={{ ...hud([slot("scimitar", 8, 8)]), round: 3 }} />);
    expect(endless.container.querySelector(".ui-glow")).toBeNull();
});

test("an evolved weapon has a violet frame and a star, and says it is one", () => {
    const view = render(
        <PauseLoadout
            hud={hud([slot("whip", 2, 3, { evolved: true, examine: "x" }), slot("knives", 2, 3)])}
        />,
    );
    const cards = view.container.querySelectorAll(".ui-loadout-card");
    expect(cards[0].querySelector(".ui-loadout-slot-evolved")).not.toBeNull();
    expect(cards[0].querySelector(".ui-loadout-star")).not.toBeNull();
    expect(cards[1].querySelector(".ui-loadout-star")).toBeNull();
    mouse(cards[0].querySelector(".ui-loadout-slot")!.parentElement!, "pointerover");
    expect(screen.getByRole("tooltip").textContent).toContain("Made by evolving another weapon");
    // An evolved one that's at its last level burns too
    cleanup();
    const done = render(<PauseLoadout hud={hud([slot("whip", 3, 3, { evolved: true })])} />);
    expect(done.container.querySelector(".ui-loadout-star")).not.toBeNull();
    expect(done.container.querySelector(".ui-glow")).not.toBeNull();
});

// The page the loadout is in scrolls when it's taller than the room it has. jsdom has no layout, so
// the page's heights are made up: its room is this tall, and the loadout makes it taller the roomier
// it is (900 at the roomiest, 100 less for each tighter layout).
let roomHeight = 400;
const realHeights = {
    scroll: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight"),
    client: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get(this: HTMLElement) {
            return this.classList.contains("ui-pause-page") ? roomHeight : 0;
        },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get(this: HTMLElement) {
            if (!this.classList.contains("ui-pause-page")) {
                return 0;
            }
            const page = this.querySelector<HTMLElement>(".ui-loadout");
            const density = Number(page?.className.match(/ui-loadout-d([0-9])/)?.[1] ?? 0);
            return Math.max(roomHeight, 900 - density * 100);
        },
    });
});

afterEach(() => {
    for (const [name, real] of [
        ["scrollHeight", realHeights.scroll],
        ["clientHeight", realHeights.client],
    ] as const) {
        if (real) {
            Object.defineProperty(HTMLElement.prototype, name, real);
        }
    }
});

function inPage(page: JSX.Element): JSX.Element {
    return <div className="ui-pause-page">{page}</div>;
}

test("the page tightens as far as it can, and then scrolls in its page, never shrunk", () => {
    roomHeight = 400;
    const view = render(inPage(<PauseLoadout hud={hud([slot("a", 1, 8)])} />));
    const page = view.container.querySelector<HTMLElement>(".ui-loadout")!;
    expect(page.className).toContain("ui-loadout-d3");
    expect(page.getAttribute("style")).toBeNull();
    expect(view.container.querySelectorAll(".ui-loadout-empty").length).toBeGreaterThan(0);
});

test("a page with room has the roomiest layout, as it is", () => {
    roomHeight = 1000;
    const view = render(inPage(<PauseLoadout hud={hud([slot("a", 1, 8)])} />));
    const page = view.container.querySelector<HTMLElement>(".ui-loadout")!;
    expect(page.className).toContain("ui-loadout-d0");
});

test("an empty slot says what it is and where one comes from", () => {
    roomHeight = 1000;
    const view = render(inPage(<PauseLoadout hud={hud([slot("a", 1, 8)])} />));
    const empty = view.container.querySelector(".ui-loadout-empty")!;
    expect(empty.querySelector(".ui-loadout-ghost")).not.toBeNull();
    expect(empty.querySelector(".ui-loadout-empty-hint")?.textContent).toBeTruthy();
});

test("the mouse over an item's icon says what it is and where it stands", () => {
    const weapon = slot("scimitar", 3, 8, {
        examine: "A vicious, curved blade. It slashes the nearest foe.",
        form: {
            kind: "evolve",
            text: "Can evolve into Abyssal whip, with Piety and its last level.",
        },
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    mouse(view.container.querySelector(".ui-loadout-slot")!.parentElement!, "pointerover");
    const tip = screen.getByRole("tooltip");
    expect(tip.querySelector(".ui-examine-name")?.textContent).toBe("scimitar");
    expect(tip.querySelector(".ui-examine-text")?.textContent).toBe(
        "A vicious, curved blade. It slashes the nearest foe.",
    );
    const form = tip.querySelector(".ui-examine-form")!;
    expect(form.textContent).toBe("Can evolve into Abyssal whip, with Piety and its last level.");
    expect(form.classList.contains("ui-examine-form-evolve")).toBe(true);
});

test("each way an item can stand has its own colour, and an evolved one says what made it", () => {
    for (const kind of ["best", "ready", "evolve", "unknown", "levelling"] as const) {
        const view = render(
            <PauseLoadout
                hud={hud([slot("w", 3, 8, { examine: "x", form: { kind, text: kind } })])}
            />,
        );
        mouse(view.container.querySelector(".ui-loadout-slot")!.parentElement!, "pointerover");
        expect(
            screen.getByRole("tooltip").querySelector(`.ui-examine-form-${kind}`)?.textContent,
        ).toBe(kind);
        cleanup();
    }
    const view = render(
        <PauseLoadout
            hud={hud([
                slot("whip", 2, 3, {
                    examine: "x",
                    evolved: true,
                    form: { kind: "levelling", text: "Still levelling up: 2 of 3." },
                }),
            ])}
        />,
    );
    mouse(view.container.querySelector(".ui-loadout-slot")!.parentElement!, "pointerover");
    expect(screen.getByRole("tooltip").querySelector(".ui-examine-note")?.textContent).toBe(
        "Made by evolving another weapon",
    );
});

test("a passive has its examine tooltip too, and an item with no text has none", () => {
    const view = render(
        <PauseLoadout
            hud={{
                ...hud(
                    [slot("a", 1, 8)],
                    [
                        slot("piety", 5, 5, {
                            examine: "A prayer of the pious.",
                            form: { kind: "best", text: "At its best form." },
                        }),
                    ],
                ),
            }}
        />,
    );
    const slots = view.container.querySelectorAll(".ui-loadout-slot");
    mouse(slots[0].parentElement!, "pointerover");
    expect(screen.queryByRole("tooltip")).toBeNull();
    mouse(slots[1].parentElement!, "pointerover");
    expect(screen.getByRole("tooltip").textContent).toContain("A prayer of the pious.");
    expect(screen.getByRole("tooltip").textContent).toContain("At its best form.");
});

test("a finished item glows with motes of light over its icon", () => {
    const view = render(<PauseLoadout hud={hud([slot("scimitar", 8, 8)])} />);
    expect(view.container.querySelectorAll(".ui-loadout-slot .ui-glow > i")).toHaveLength(9);
});

test("an evolution shows the passive it still needs beside its square, red while it's missing", () => {
    const view = render(
        <PauseLoadout hud={hud([slot("scimitar", 8, 8, { evolution: missing })])} />,
    );
    const need = view.container.querySelector(".ui-loadout-need")!;
    expect(need.classList.contains("ui-loadout-need-missing")).toBe(true);
    expect(need.getAttribute("title")).toBe("Piety");
    cleanup();
    const owned = render(
        <PauseLoadout
            hud={hud([
                slot("scimitar", 8, 8, {
                    evolution: { ...missing, hasPassive: true, ready: true },
                }),
            ])}
        />,
    );
    expect(
        owned.container
            .querySelector(".ui-loadout-need")!
            .classList.contains("ui-loadout-need-met"),
    ).toBe(true);
});

test("a tooltip can say what the number means, how it's worked out and how strong it is", () => {
    const weapon = slot("scimitar", 3, 8, {
        statLines: [
            {
                label: "Damage",
                value: "13",
                breakdown: {
                    ...breakdown,
                    about: {
                        what: "How hard each hit lands.",
                        calc: "Grows with levels.",
                        from: "More from: passives (Piety).",
                        power: "1.6× its level 1 size.",
                    },
                },
            },
        ],
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    mouse(view.container.querySelector(".ui-loadout-cell")!, "pointerover");
    const about = screen.getByRole("tooltip").querySelector(".ui-breakdown-about")!;
    expect([...about.children].map((line) => line.textContent)).toEqual([
        "How hard each hit lands.",
        "Grows with levels.",
        "More from: passives (Piety).",
        "1.6× its level 1 size.",
    ]);
});

test("a line of a tooltip can wear the icons of what gives it, each named by its title", () => {
    const weapon = slot("scimitar", 3, 8, {
        statLines: [
            {
                label: "Damage",
                value: "13",
                breakdown: {
                    title: "Damage",
                    lines: [
                        {
                            label: "Magic damage",
                            parts: [{ text: "+34%" }],
                            icons: [
                                { name: "Augury", spriteId: 99 },
                                { name: "Magic potion", objId: 3040 },
                            ],
                        },
                    ],
                },
            },
        ],
    });
    const view = render(<PauseLoadout hud={hud([weapon])} />);
    mouse(view.container.querySelector(".ui-loadout-cell")!, "pointerover");
    const icons = [...screen.getByRole("tooltip").querySelectorAll(".ui-breakdown-icon")];
    expect(icons.map((icon) => icon.getAttribute("title"))).toEqual(["Augury", "Magic potion"]);
});
