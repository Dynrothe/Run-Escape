// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { GameClient } from "../client/GameClient";
import { GameStore } from "../client/GameStore";
import { CombatStyle } from "../content/types";
import { buyUpgrade, createSave, refundUpgrade, refundUpgrades } from "../core/save";
import { GameUi } from "./GameUi";

vi.mock("@foxglove/wasm-bz2/wasm/module.wasm?url", () => ({ default: "" }));

const device = vi.hoisted(() => ({ coarse: false }));

vi.mock("../../util/DeviceUtil", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../util/DeviceUtil")>()),
    get isCoarsePointer() {
        return device.coarse;
    },
}));

afterEach(() => {
    cleanup();
    device.coarse = false;
});

function renderShop(upgrades: Record<string, number>, coins = 0, characterId = "warrior") {
    const save = createSave();
    save.coins = 1000000;
    for (const [id, ranks] of Object.entries(upgrades)) {
        for (let rank = 0; rank < ranks; rank++) {
            expect(buyUpgrade(save, id)).toBe(true);
        }
    }
    save.coins = coins;
    const store = new GameStore(save);
    store.set({ screen: "shop", characterId });
    const refresh = () => store.set({ save: { ...save } });
    const actions = {
        buyUpgrade: vi.fn((id: string, style: CombatStyle) => {
            buyUpgrade(save, id, style);
            refresh();
        }),
        refundUpgrade: vi.fn((id: string, style: CombatStyle) => {
            refundUpgrade(save, id, style);
            refresh();
        }),
        refundUpgrades: vi.fn((style: CombatStyle) => {
            refundUpgrades(save, style);
            refresh();
        }),
        playClick: vi.fn(),
    };
    render(<GameUi store={store} client={actions as unknown as GameClient} />);
    return { ...actions, save };
}

// Says yes to the question Refund all asks first
async function refundAll(): Promise<void> {
    fireEvent.click(screen.getByRole("button", { name: "Refund all" }));
    const dialog = await screen.findByRole("alertdialog");
    await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Refund all" }));
    });
}

test("skills explain how combat-style presets are used", () => {
    renderShop({});
    expect(screen.getByRole("tablist", { name: "Skill presets" })).toBeInTheDocument();
    expect(screen.getByText(/^Melee, Ranged and Magic are separate skill presets/)).toBeVisible();
    expect(screen.getByText(/^Each preset has its own balance/)).toBeVisible();
});

test("switching class pages keeps purchases and single-rank refunds isolated", async () => {
    expect.hasAssertions();
    const actions = renderShop({}, 50000);
    fireEvent.click(screen.getByRole("button", { name: /^Strength\b/ }));
    const melee = structuredClone(actions.save.skillPages.melee);
    fireEvent.click(screen.getByRole("tab", { name: "Ranged preset" }));
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Ranged preset");
    fireEvent.click(screen.getByRole("button", { name: /^Strength\b/ }));
    const ranged = structuredClone(actions.save.skillPages.ranged);
    fireEvent.click(screen.getByRole("tab", { name: "Magic preset" }));
    expect(screen.getByRole("button", { name: "Refund all" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Strength\b/ }));
    fireEvent.contextMenu(screen.getByRole("button", { name: /^Strength\b/ }));
    expect(actions.refundUpgrade).toHaveBeenLastCalledWith("strength", "magic");
    expect(actions.save.skillPages.magic.upgrades).toEqual({});
    expect(actions.save.skillPages.melee).toEqual(melee);
    expect(actions.save.skillPages.ranged).toEqual(ranged);
    fireEvent.click(screen.getByRole("tab", { name: "Ranged preset" }));
    await refundAll();
    expect(actions.refundUpgrades).toHaveBeenLastCalledWith("ranged");
    expect(actions.save.skillPages.melee).toEqual(melee);
    fireEvent.click(screen.getByRole("tab", { name: "Melee preset" }));
    expect(screen.getByRole("button", { name: "Refund all" })).toBeEnabled();
}, 30000);

test("each page can afford the full gold budget after another class spends it", () => {
    expect.hasAssertions();
    const actions = renderShop({}, 10000);
    for (const label of ["Melee preset", "Ranged preset", "Magic preset"]) {
        fireEvent.click(screen.getByRole("tab", { name: label }));
        const card = screen.getByRole("button", { name: /^Ring of life\b/ });
        expect(card).not.toHaveClass("ui-card-dim");
        expect(document.querySelector(".ui-shop > .ui-row:last-child .ui-coins")).toHaveTextContent(
            "10",
        );
        fireEvent.click(card);
        expect(actions.save.coins).toBe(0);
    }
    for (const page of Object.values(actions.save.skillPages)) {
        expect(page.upgrades.ring_of_life).toBe(1);
        expect(page.upgradesSpent).toBe(10000);
    }
}, 30000);

test.each([
    ["warrior", "Melee preset"],
    ["ranger", "Ranged preset"],
    ["wizard", "Magic preset"],
])("skills open on %s's class page", (characterId, label) => {
    expect.hasAssertions();
    renderShop({}, 0, characterId);
    expect(screen.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
});

test("class tabs support arrow keys and wrap without changing any skill pages", () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 1 }, 50000);
    const before = structuredClone(actions.save);
    const melee = screen.getByRole("tab", { name: "Melee preset" });
    melee.focus();
    fireEvent.keyDown(melee, { key: "ArrowLeft" });
    const magic = screen.getByRole("tab", { name: "Magic preset" });
    expect(magic).toHaveFocus();
    expect(magic).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(magic, { key: "ArrowRight" });
    expect(melee).toHaveFocus();
    expect(actions.save).toEqual(before);
});

test("right-clicking a bought skill refunds one rank even without coins", () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 2, hitpoints: 1 });
    const card = screen.getByRole("button", { name: /^Strength\b/ });
    expect(fireEvent.contextMenu(card)).toBe(false);
    expect(actions.refundUpgrade).toHaveBeenCalledExactlyOnceWith("strength", "melee");
    expect(actions.buyUpgrade).not.toHaveBeenCalled();
    expect(actions.refundUpgrades).not.toHaveBeenCalled();
});

test("maxed skills still accept right-clicks but cannot buy another rank", () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 5 }, 50000);
    const card = screen.getByRole("button", { name: /^Strength\b/ });
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).toHaveTextContent("Maxed");
    fireEvent.click(card);
    expect(actions.buyUpgrade).not.toHaveBeenCalled();
    expect(fireEvent.contextMenu(card)).toBe(false);
    expect(actions.refundUpgrade).toHaveBeenCalledExactlyOnceWith("strength", "melee");
});

test("right-clicking an unbought skill does not refund or purchase it", () => {
    expect.hasAssertions();
    const actions = renderShop({});
    expect(fireEvent.contextMenu(screen.getByRole("button", { name: /^Strength\b/ }))).toBe(true);
    expect(actions.refundUpgrade).not.toHaveBeenCalled();
    expect(actions.buyUpgrade).not.toHaveBeenCalled();
});

test("left-clicking still buys a rank", () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 1 }, 50000);
    fireEvent.click(screen.getByRole("button", { name: /^Strength\b/ }));
    expect(actions.buyUpgrade).toHaveBeenCalledExactlyOnceWith("strength", "melee");
    expect(actions.refundUpgrade).not.toHaveBeenCalled();
});

test("the visible refund button refunds one bought rank without purchasing", () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 2 });
    const refund = screen.getByRole("button", { name: "Refund one Strength rank" });
    expect(refund).toHaveAttribute("title", "Refund one Strength rank");
    expect(refund.closest(".ui-shop-card")).toBeNull();
    fireEvent.click(refund);
    expect(actions.refundUpgrade).toHaveBeenCalledExactlyOnceWith("strength", "melee");
    expect(actions.buyUpgrade).not.toHaveBeenCalled();
    expect(actions.refundUpgrades).not.toHaveBeenCalled();
});

test("maxed skills retain their visible refund button", () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Refund one Strength rank" }));
    expect(actions.refundUpgrade).toHaveBeenCalledExactlyOnceWith("strength", "melee");
    expect(actions.buyUpgrade).not.toHaveBeenCalled();
});

test("unbought skills have no refund button", () => {
    expect.hasAssertions();
    renderShop({});
    expect(screen.queryByRole("button", { name: "Refund one Strength rank" })).toBeNull();
});

test("Refund all asks first, and cancelling leaves everything as it was", async () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Refund all" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(actions.refundUpgrades).not.toHaveBeenCalled();
    await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(actions.refundUpgrades).not.toHaveBeenCalled();
    expect(actions.save.skillPages.melee.upgrades).toEqual({ strength: 2 });
});

test("an out-of-reach skill says how much it's short, and a maxed one doesn't look out of reach", () => {
    expect.hasAssertions();
    renderShop({ strength: 5 }, 0);
    const maxed = screen.getByRole("button", { name: /^Strength\b/ });
    expect(maxed).toHaveClass("ui-shop-card-maxed");
    expect(maxed).not.toHaveClass("ui-card-dim");
    const short = screen.getByRole("button", { name: /^Ring of life\b/ });
    expect(short).toHaveClass("ui-card-dim");
    expect(short).toHaveTextContent(/short/);
});

test("Refund all clears ranks that have no spending recorded", async () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 2 });
    actions.save.skillPages.melee.upgradesSpent = 0;
    fireEvent.click(screen.getByRole("tab", { name: "Ranged preset" }));
    fireEvent.click(screen.getByRole("tab", { name: "Melee preset" }));
    await refundAll();
    expect(actions.refundUpgrades).toHaveBeenCalledExactlyOnceWith("melee");
    expect(actions.save.skillPages.melee.upgrades).toEqual({});
    expect(screen.queryByRole("button", { name: "Refund one Strength rank" })).toBeNull();
});

test("touch long presses do not refund, but the refund button still works", () => {
    expect.hasAssertions();
    device.coarse = true;
    const actions = renderShop({ strength: 2 });
    const card = screen.getByRole("button", { name: /^Strength\b/ });
    expect(fireEvent.contextMenu(card)).toBe(false);
    expect(actions.refundUpgrade).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refund one Strength rank" }));
    expect(actions.refundUpgrade).toHaveBeenCalledExactlyOnceWith("strength", "melee");
    expect(actions.buyUpgrade).not.toHaveBeenCalled();
});

test("bought cards expose the desktop right-click shortcut in a tooltip", () => {
    expect.hasAssertions();
    renderShop({ strength: 1 });
    expect(screen.getByRole("button", { name: /^Strength\b/ })).toHaveAttribute(
        "title",
        "Right-click to refund one rank",
    );
});

test("unaffordable skills cannot purchase but can refund a bought rank", () => {
    expect.hasAssertions();
    const actions = renderShop({ strength: 1 });
    const card = screen.getByRole("button", { name: /^Strength\b/ });
    expect(card).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(card);
    expect(actions.buyUpgrade).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refund one Strength rank" }));
    expect(actions.refundUpgrade).toHaveBeenCalledExactlyOnceWith("strength", "melee");
});

function renderMaps(mapId = "lumbridge") {
    const store = new GameStore(createSave());
    store.set({ screen: "characters", mapId });
    const actions = {
        selectMap: vi.fn((id: string) => store.set({ mapId: id })),
        selectCharacter: vi.fn(),
        toggleFavouriteCharacter: vi.fn(),
        playClick: vi.fn(),
    };
    render(<GameUi store={store} client={actions as unknown as GameClient} />);
    return actions;
}

test("the map screen opens on the picked map's tab, and a map on another tab can be picked", () => {
    expect.hasAssertions();
    const actions = renderMaps();
    expect(screen.getByRole("tab", { name: "Campaign" })).toHaveAttribute("aria-selected", "true");
    // The other tabs' maps are laid out, but out of reach
    expect(screen.getByRole("button", { name: "Lumbridge" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Theatre of Blood" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Bosses" }));
    expect(screen.queryByRole("button", { name: "Lumbridge" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Theatre of Blood" }));
    expect(actions.selectMap).toHaveBeenCalledExactlyOnceWith("theatre_of_blood");
    expect(screen.getByRole("button", { name: /Enter Theatre of Blood/ })).toBeInTheDocument();
    cleanup();
    renderMaps("theatre_of_blood");
    expect(screen.getByRole("tab", { name: "Bosses" })).toHaveAttribute("aria-selected", "true");
}, 30000);

test("the favourite button is the shown adventurer's, and stays as focus moves to it", () => {
    expect.hasAssertions();
    const actions = renderMaps();
    const shown = () =>
        document.querySelector(".ui-select-adventurers .ui-card-title")?.textContent;
    // Focus on an adventurer who isn't the one picked shows theirs
    const ranger = screen.getByRole("button", { name: "Ranger" });
    fireEvent.focus(ranger);
    expect(shown()).toBe("Ranger");
    const favourite = screen.getByRole("button", { name: "Make favourite" });
    // Going on to their button keeps them, and the button with them
    fireEvent.focusOut(ranger, { relatedTarget: favourite });
    expect(shown()).toBe("Ranger");
    expect(favourite).toBeInTheDocument();
    fireEvent.click(favourite);
    expect(actions.toggleFavouriteCharacter).toHaveBeenCalledExactlyOnceWith("ranger");
    // Leaving the panel goes back to the one picked
    fireEvent.focusOut(favourite, { relatedTarget: screen.getByRole("tab", { name: "Campaign" }) });
    expect(shown()).toBe("Warrior");
    // None for one who isn't open yet
    fireEvent.focus(document.querySelector(".ui-select-adventurers .ui-card-locked")!);
    expect(screen.queryByRole("button", { name: "Make favourite" })).toBeNull();
});

test("a map's own adventurer has no favourite button", () => {
    expect.hasAssertions();
    renderMaps("falador");
    expect(document.querySelector(".ui-select-adventurers .ui-card-title")?.textContent).toBe(
        "Durial321",
    );
    expect(screen.queryByRole("button", { name: "Make favourite" })).toBeNull();
});

test("map tabs support arrow keys and wrap", () => {
    expect.hasAssertions();
    renderMaps();
    const campaign = screen.getByRole("tab", { name: "Campaign" });
    campaign.focus();
    fireEvent.keyDown(campaign, { key: "ArrowRight" });
    const bosses = screen.getByRole("tab", { name: "Bosses" });
    expect(bosses).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Bosses");
    fireEvent.keyDown(bosses, { key: "ArrowLeft" });
    fireEvent.keyDown(campaign, { key: "ArrowLeft" });
    expect(screen.getAllByRole("tab").at(-1)).toHaveFocus();
});

function renderTitle(runs: number, lastExported?: number) {
    const save = { ...createSave(), runs, lastExported };
    const store = new GameStore(save);
    store.set({ screen: "title" });
    const client = {
        // Stands in for GameClient once the file's kept: the stamp and the save's write are
        // GameClient.test.ts's to check, and this only that the bar goes by the store's save
        exportSave: vi.fn(() => {
            store.set({ save: { ...store.getSnapshot().save, lastExported: Date.now() } });
        }),
        playClick: vi.fn(),
    };
    render(<GameUi store={store} client={client as unknown as GameClient} />);
    return { client, store };
}

describe("the title's export reminder", () => {
    // Its own, as Node 25 and later have a localStorage that hides jsdom's
    beforeEach(() => {
        const items = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => items.get(key) ?? null,
            setItem: (key: string, value: string) => void items.set(key, value),
        });
    });

    afterEach(() => vi.unstubAllGlobals());

    test("isn't there for a new player, or once the save's been exported today", () => {
        expect.hasAssertions();
        renderTitle(0);
        expect(screen.queryByRole("button", { name: "Export save" })).toBeNull();
        cleanup();
        renderTitle(4, Date.now());
        expect(screen.queryByRole("button", { name: "Export save" })).toBeNull();
    });

    test("exports, and then goes", () => {
        expect.hasAssertions();
        const { client } = renderTitle(4);
        fireEvent.click(screen.getByRole("button", { name: "Export save" }));
        expect(client.exportSave).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("button", { name: "Export save" })).toBeNull();
    });

    test("put off, it stays gone for the day, here and after a reload", () => {
        expect.hasAssertions();
        const { client } = renderTitle(4, Date.now() - 3 * 24 * 60 * 60 * 1000);
        expect(screen.getByText(/^Last exported/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Not today" }));
        expect(screen.queryByRole("button", { name: "Export save" })).toBeNull();
        expect(client.exportSave).not.toHaveBeenCalled();
        cleanup();
        renderTitle(4);
        expect(screen.queryByRole("button", { name: "Export save" })).toBeNull();
    });

    test("waits while the game isn't saving", () => {
        expect.hasAssertions();
        const { store } = renderTitle(4);
        expect(screen.getByRole("button", { name: "Export save" })).toBeInTheDocument();
        act(() => store.set({ saveBlock: { kind: "otherTab" }, saveBlockClosed: true }));
        expect(screen.queryByRole("button", { name: "Export save" })).toBeNull();
    });

    test("has language button that opens settings with language controls", () => {
        expect.hasAssertions();
        renderTitle(0);
        const langBtn = screen.getByRole("button", { name: "Language" });
        expect(langBtn).toBeInTheDocument();
        fireEvent.click(langBtn);
        expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
        // With its translator under its name
        expect(
            screen.getByRole("button", { name: "Português (BR) Translated by Iakee" }),
        ).toBeInTheDocument();
    });

    test("goes while cloud save has a copy, and comes back when it stops keeping one", () => {
        expect.hasAssertions();
        const { store } = renderTitle(4);
        act(() => store.set({ cloud: { code: CLOUD_CODE, syncedAt: 5, working: false } }));
        expect(screen.queryByRole("button", { name: "Export save" })).toBeNull();
        // A code that's stopped working (unused for weeks, or replaced on another device)
        act(() =>
            store.set({
                cloud: { code: CLOUD_CODE, syncedAt: 5, working: false, problem: "unknownCode" },
            }),
        );
        expect(screen.getByRole("button", { name: "Export save" })).toBeInTheDocument();
        // On, but never synced
        act(() => store.set({ cloud: { code: CLOUD_CODE, working: false } }));
        expect(screen.getByRole("button", { name: "Export save" })).toBeInTheDocument();
    });
});

const CLOUD_CODE = "K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC";

describe("cloud save's choice on the title", () => {
    const choice = { cloud: { revision: 2 }, newer: false, closed: false };
    // The export reminder's, as above
    beforeEach(() => {
        const items = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => items.get(key) ?? null,
            setItem: (key: string, value: string) => void items.set(key, value),
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    function renderCloudTitle() {
        const store = new GameStore({ ...createSave(), runs: 4 });
        const view = { code: CLOUD_CODE, syncedAt: 5, working: false };
        store.set({ screen: "title", cloud: view });
        const setChoice = (closed: boolean) =>
            store.set({ cloud: { ...view, choice: { ...choice, closed } } });
        const sync = {
            later: vi.fn(() => setChoice(true)),
            reopenChoice: vi.fn(() => setChoice(false)),
            useCloud: vi.fn(),
            keepLocal: vi.fn(),
            check: vi.fn(),
        };
        const client = { cloud: sync, playClick: vi.fn() };
        render(<GameUi store={store} client={client as unknown as GameClient} />);
        return { setChoice, sync };
    }
    const asking = () => screen.queryByRole("heading", { name: "Which save do you want?" });
    const panel = () => screen.queryByRole("heading", { name: "Cloud save" });

    test("shows over cloud save's own panel, and Escape puts it off before closing that", () => {
        expect.hasAssertions();
        const { setChoice, sync } = renderCloudTitle();
        fireEvent.click(screen.getByRole("button", { name: /^Cloud save:/ }));
        expect(panel()).toBeInTheDocument();
        // A code linked there, or Sync now, finds a different save
        act(() => setChoice(false));
        expect(asking()).toBeInTheDocument();
        expect(panel()).toBeInTheDocument();
        fireEvent.keyDown(window, { code: "Escape" });
        expect(sync.later).toHaveBeenCalledTimes(1);
        expect(asking()).toBeNull();
        expect(panel()).toBeInTheDocument();
        // Choose, from the panel's Two saves row, shows it again
        fireEvent.click(screen.getByRole("button", { name: "Choose" }));
        expect(asking()).toBeInTheDocument();
        fireEvent.keyDown(window, { code: "Escape" });
        fireEvent.keyDown(window, { code: "Escape" });
        expect(panel()).toBeNull();
    });

    test("shows over Settings too", () => {
        expect.hasAssertions();
        const { setChoice } = renderCloudTitle();
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
        act(() => setChoice(false));
        expect(asking()).toBeInTheDocument();
    });
});
