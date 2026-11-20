// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { GameClient } from "../client/GameClient";
import { GamePads, PAD } from "../client/GamePad";
import { GameStore } from "../client/GameStore";
import {
    REWARD_MAPS,
    getLogEntries,
    getLogTotal,
    getMapTab,
    getTrophyMap,
} from "../content/collectionLog";
import { EVOLUTIONS } from "../content/evolutions";
import { getMap, mapName } from "../content/maps";
import { TROPHIES, trophyName } from "../content/trophies";
import { weaponName } from "../content/weapons";
import { createSave } from "../core/save";
import { t } from "../i18n";
import { GameUi } from "./GameUi";
import { iconCache } from "./ItemIcon";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// The log open on a new save, each item's icon its object id
function openLog(): {
    leaveMenu: ReturnType<typeof vi.fn>;
    getRunLogSaves: ReturnType<typeof vi.fn>;
    log: HTMLElement;
} {
    vi.spyOn(iconCache, "get").mockImplementation((objId: number) => `obj:${objId}`);
    vi.spyOn(iconCache, "request").mockImplementation(() => {});
    vi.spyOn(iconCache, "requestFrame").mockImplementation(() => {});
    const store = new GameStore(createSave());
    store.set({ screen: "collectionLog" });
    const leaveMenu = vi.fn();
    // A run's finds, which the title's log never asks for
    const withRun = createSave();
    withRun.trophies.push(...TROPHIES.map((trophy) => trophy.id));
    const getRunLogSaves = vi.fn(() => ({ saved: createSave(), withRun }));
    const client = new Proxy(
        { leaveMenu, getRunLogSaves },
        { get: (target, key) => target[key as keyof typeof target] ?? vi.fn() },
    );
    render(<GameUi store={store} client={client as unknown as GameClient} />);
    return { leaveMenu, getRunLogSaves, log: screen.getByRole("dialog") };
}

function pageTitle(log: HTMLElement): string | null {
    return within(log).getByRole("heading", { level: 3 }).textContent;
}

describe("the Collection log's screen", () => {
    test("closes with Back, to where it was opened (the title, or a co-op room)", () => {
        const { leaveMenu, log } = openLog();
        fireEvent.click(within(log).getByRole("button", { name: "Back" }));
        expect(leaveMenu).toHaveBeenCalled();
    });

    test("gives a pad's first highlight to the open tab, so pressing A twice stays in the log", () => {
        const { leaveMenu, log } = openLog();
        // jsdom lays nothing out, so give everything a size
        for (const el of log.querySelectorAll<HTMLElement>("button, select")) {
            el.getBoundingClientRect = () =>
                ({ left: 0, top: 0, width: 10, height: 10 }) as DOMRect;
        }
        let down: number[] = [];
        const pad = () => ({
            id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)",
            index: 0,
            connected: true,
            mapping: "standard",
            axes: [0, 0],
            buttons: Array.from({ length: 17 }, (_, i) => ({
                pressed: down.includes(i),
                touched: down.includes(i),
                value: down.includes(i) ? 1 : 0,
            })),
        });
        Object.defineProperty(navigator, "getGamepads", {
            value: () => [pad()],
            configurable: true,
        });
        const pads = new GamePads();
        for (const now of [0, 32]) {
            down = [PAD.south];
            pads.poll(now, "menu");
            down = [];
            pads.poll(now + 16, "menu");
        }
        pads.dispose();
        expect(document.activeElement).toHaveClass("ui-log-tab");
        expect(document.activeElement).toHaveAttribute("aria-pressed", "true");
        expect(leaveMenu).not.toHaveBeenCalled();
    });

    test("keeps each tab's entry, and the dropdown picks one as the list does", () => {
        const { log } = openLog();
        const tombs = mapName(getMap("tombs_of_amascut"));
        const theatre = mapName(getMap("theatre_of_blood"));
        fireEvent.click(within(log).getByRole("button", { name: "Raids" }));
        fireEvent.click(within(log).getByRole("button", { name: tombs }));
        expect(pageTitle(log)).toBe(tombs);
        fireEvent.click(within(log).getByRole("button", { name: "Bosses" }));
        expect(pageTitle(log)).not.toBe(tombs);
        fireEvent.click(within(log).getByRole("button", { name: "Raids" }));
        expect(pageTitle(log)).toBe(tombs);
        fireEvent.change(within(log).getByRole("combobox"), {
            target: { value: "theatre_of_blood" },
        });
        expect(pageTitle(log)).toBe(theatre);
    });

    test("shows an evolution not made yet as the weapon that evolves, keeping what it makes", () => {
        const { log } = openLog();
        fireEvent.click(within(log).getByRole("button", { name: "Other" }));
        const [first] = within(log).getAllByRole("button", { name: "???, Not obtained" });
        expect(first.querySelector("img")?.getAttribute("src")).toBe(
            `obj:${EVOLUTIONS[0].iconObjId}`,
        );
        fireEvent.mouseEnter(first);
        expect(within(log).getByText("???")).toBeInTheDocument();
        expect(within(log).queryByText(weaponName(EVOLUTIONS[0].into))).toBeNull();
    });
});

describe("the Collection log during a run", () => {
    const trophy = TROPHIES.find((def) => REWARD_MAPS.includes(getTrophyMap(def)))!;
    const mapId = getTrophyMap(trophy);

    // A paused run's menu, with a client whose run has found the trophy, not saved yet, on its
    // Collection log's page or not (the menu opens on the page it was left on)
    function pauseRun(open = false) {
        vi.spyOn(iconCache, "get").mockImplementation((objId: number) => `obj:${objId}`);
        vi.spyOn(iconCache, "request").mockImplementation(() => {});
        vi.spyOn(iconCache, "requestFrame").mockImplementation(() => {});
        const save = createSave();
        const store = new GameStore(save);
        const withRun = createSave();
        withRun.trophies.push(trophy.id);
        const calls = {
            getRunLogSaves: vi.fn(() => ({ saved: save, withRun })),
            resume: vi.fn(() => store.set({ overlay: "none" })),
        };
        const client = new Proxy(
            { store, input: { stick: {} }, ...calls },
            {
                get: (target, key) =>
                    key in target ? target[key as keyof typeof target] : () => {},
            },
        );
        store.set({
            screen: "run",
            overlay: "paused",
            hud: {
                mapId: "lumbridge",
                level: 1,
                maxWeapons: 6,
                maxPassives: 6,
                weapons: [],
                passives: [],
                stats: [],
                statRows: [],
                gear: [],
                inventory: [null, null, null, null],
                rerolls: 0,
                banishes: 0,
            },
        });
        render(<GameUi store={store} client={client as unknown as GameClient} />);
        if ((queryRunLog() !== null) !== open) {
            act(() => {
                fireEvent.click(logButton());
            });
        }
        return { store, calls };
    }

    function queryRunLog(): HTMLElement | null {
        return screen.queryByRole("region", { name: /^Collection log/ });
    }

    function runLog(): HTMLElement {
        return screen.getByRole("region", { name: /^Collection log/ });
    }

    // The menu's Collection log button, along its bottom
    function logButton(): HTMLElement {
        const pause = screen.getByRole("dialog", { name: "Paused" });
        return within(pause).getByRole("button", { name: "Collection log" });
    }

    // A pad's button pressed once in the menus, and the keys the pad sent for it (GameInput
    // passes them to the client)
    function pressPad(button: number): string[] {
        // jsdom lays nothing out, so give everything a size
        for (const el of document.querySelectorAll<HTMLElement>("button, select")) {
            el.getBoundingClientRect = () =>
                ({ left: 0, top: 0, width: 10, height: 10 }) as DOMRect;
        }
        let down: number[] = [];
        Object.defineProperty(navigator, "getGamepads", {
            value: () => [
                {
                    id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)",
                    index: 0,
                    connected: true,
                    mapping: "standard",
                    axes: [0, 0],
                    buttons: Array.from({ length: 17 }, (_, i) => ({
                        pressed: down.includes(i),
                        touched: down.includes(i),
                        value: down.includes(i) ? 1 : 0,
                    })),
                },
            ],
            configurable: true,
        });
        const pads = new GamePads();
        const keys: string[] = [];
        pads.onKeyDown = (code) => keys.push(code);
        pads.poll(0, "menu");
        down = [button];
        act(() => pads.poll(16, "menu"));
        down = [];
        pads.poll(32, "menu");
        pads.dispose();
        return keys;
    }

    test("opens as a page of the pause menu, in place of its tab, and its button goes back", () => {
        const { store } = pauseRun();
        const pause = screen.getByRole("dialog", { name: "Paused" });
        const loadout = within(pause).getByRole("tab", { name: "Loadout" });
        expect(loadout).toHaveAttribute("aria-selected", "true");
        act(() => {
            fireEvent.click(logButton());
        });
        const log = runLog();
        // In the menu, not a window over it: no X of its own, and the menu stays in reach
        expect(pause).toContainElement(log);
        expect(pause).not.toHaveAttribute("inert");
        expect(within(log).queryByRole("button", { name: "Close" })).toBeNull();
        expect(logButton()).toHaveAttribute("aria-pressed", "true");
        expect(loadout).toHaveAttribute("aria-selected", "false");
        act(() => {
            fireEvent.click(logButton());
        });
        expect(queryRunLog()).toBeNull();
        expect(loadout).toHaveAttribute("aria-selected", "true");
        expect(store.getSnapshot().overlay).toBe("paused");
    });

    test("goes back to the tab it came from, through the settings too", () => {
        pauseRun();
        const pause = screen.getByRole("dialog", { name: "Paused" });
        act(() => {
            fireEvent.click(within(pause).getByRole("tab", { name: "Combat" }));
        });
        act(() => {
            fireEvent.click(logButton());
        });
        act(() => {
            fireEvent.click(within(pause).getByRole("button", { name: "Settings" }));
        });
        expect(queryRunLog()).toBeNull();
        act(() => {
            fireEvent.click(within(pause).getByRole("button", { name: "Settings" }));
        });
        expect(within(pause).getByRole("tab", { name: "Combat" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        // Left on the Loadout for the tests after
        act(() => {
            fireEvent.click(within(pause).getByRole("tab", { name: "Loadout" }));
        });
    });

    test("leaves Escape to the client, whose pause key it is in a run", () => {
        const { calls } = pauseRun(true);
        fireEvent.keyDown(window, { code: "Escape", key: "Escape" });
        expect(calls.resume).not.toHaveBeenCalled();
        expect(runLog()).toBeInTheDocument();
    });

    test("leaves a pad's Start to the menu's Resume, as on its other pages", () => {
        const { calls } = pauseRun(true);
        expect(pressPad(PAD.start)).toEqual([]);
        expect(calls.resume).toHaveBeenCalledOnce();
    });

    test("opens where it was left once a co-op run's level up or casket has taken it away", () => {
        const { store } = pauseRun(true);
        const theatre = mapName(getMap("theatre_of_blood"));
        fireEvent.click(within(runLog()).getByRole("button", { name: "Raids" }));
        fireEvent.click(within(runLog()).getByRole("button", { name: theatre }));
        expect(pageTitle(runLog())).toBe(theatre);
        // The menu goes for a moment, and the log with it; the run's still on the log
        act(() => store.set({ overlay: "none" }));
        expect(queryRunLog()).toBeNull();
        act(() => store.set({ overlay: "paused" }));
        expect(pageTitle(runLog())).toBe(theatre);
        expect(within(runLog()).getByRole("button", { name: "Raids" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    test("marks what the run's found and not saved yet, in words", () => {
        pauseRun(true);
        const log = runLog();
        fireEvent.click(
            within(log).getByRole("button", { name: t(`collection.tab.${getMapTab(mapId)}`) }),
        );
        const entry = within(log)
            .getAllByText(mapName(getMap(mapId)), { selector: ".ui-log-entry-name" })[0]
            .closest("button")!;
        expect(within(entry).getByText("New")).toBeInTheDocument();
        fireEvent.click(entry);
        const slot = within(log).getByRole("button", {
            name: `${trophyName(trophy)}, Found this run`,
        });
        expect(within(slot).getByText("New")).toBeInTheDocument();
        fireEvent.mouseEnter(slot);
        expect(within(log).getByText(/\(Found this run\)/)).toBeInTheDocument();
        // Counted in the title's total, as it's kept however the run ends in the game
        const total = getLogTotal(getLogEntries(createSave()));
        expect(within(log).getByRole("heading", { level: 2 })).toHaveTextContent(
            `Collection log - 1/${total.total}`,
        );
    });

    test("marks nothing on the title's log", () => {
        const { getRunLogSaves, log } = openLog();
        expect(getRunLogSaves).not.toHaveBeenCalled();
        expect(within(log).queryByText("New")).toBeNull();
    });
});
