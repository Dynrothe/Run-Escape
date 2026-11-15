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
    showScreen: ReturnType<typeof vi.fn>;
    getRunLogSaves: ReturnType<typeof vi.fn>;
    log: HTMLElement;
} {
    vi.spyOn(iconCache, "get").mockImplementation((objId: number) => `obj:${objId}`);
    vi.spyOn(iconCache, "request").mockImplementation(() => {});
    vi.spyOn(iconCache, "requestFrame").mockImplementation(() => {});
    const store = new GameStore(createSave());
    store.set({ screen: "collectionLog" });
    const showScreen = vi.fn();
    // A run's finds, which the title's log never asks for
    const withRun = createSave();
    withRun.trophies.push(...TROPHIES.map((trophy) => trophy.id));
    const getRunLogSaves = vi.fn(() => ({ saved: createSave(), withRun }));
    const client = new Proxy(
        { showScreen, getRunLogSaves },
        { get: (target, key) => target[key as keyof typeof target] ?? vi.fn() },
    );
    render(<GameUi store={store} client={client as unknown as GameClient} />);
    return { showScreen, getRunLogSaves, log: screen.getByRole("dialog") };
}

function pageTitle(log: HTMLElement): string | null {
    return within(log).getByRole("heading", { level: 3 }).textContent;
}

describe("the Collection log's screen", () => {
    test("closes with its X, back to the title", () => {
        const { showScreen, log } = openLog();
        fireEvent.click(within(log).getByRole("button", { name: "Close" }));
        expect(showScreen).toHaveBeenCalledWith("title");
    });

    test("gives a pad's first highlight to the open tab, so pressing A twice stays in the log", () => {
        const { showScreen, log } = openLog();
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
        expect(showScreen).not.toHaveBeenCalled();
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

    // A paused run's menu, with a client whose run has found the trophy, not saved yet
    function pauseRun(runLog = false) {
        vi.spyOn(iconCache, "get").mockImplementation((objId: number) => `obj:${objId}`);
        vi.spyOn(iconCache, "request").mockImplementation(() => {});
        vi.spyOn(iconCache, "requestFrame").mockImplementation(() => {});
        const save = createSave();
        const store = new GameStore(save);
        const withRun = createSave();
        withRun.trophies.push(trophy.id);
        const calls = {
            openRunLog: vi.fn(() => store.set({ runLog: true })),
            closeRunLog: vi.fn(() => store.set({ runLog: false })),
            getRunLogSaves: vi.fn(() => ({ saved: save, withRun })),
            resume: vi.fn(() => store.set({ overlay: "none", runLog: false })),
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
            runLog,
            hud: {
                mapId: "lumbridge",
                level: 1,
                maxWeapons: 6,
                maxPassives: 6,
                weapons: [],
                passives: [],
                stats: [],
                gear: [],
                inventory: [null, null, null, null],
                rerolls: 0,
                banishes: 0,
            },
        });
        render(<GameUi store={store} client={client as unknown as GameClient} />);
        return { store, calls };
    }

    function runLog(): HTMLElement {
        return screen.getByRole("dialog", { name: /^Collection log/ });
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

    test("opens from the pause menu, over it, and its X goes back to the menu", () => {
        const { store, calls } = pauseRun();
        const pause = screen.getByRole("dialog", { name: "Paused" });
        expect(screen.queryByRole("dialog", { name: /^Collection log/ })).toBeNull();
        act(() => {
            fireEvent.click(within(pause).getByRole("button", { name: "Collection log" }));
        });
        expect(calls.openRunLog).toHaveBeenCalled();
        const log = runLog();
        // A window over the menu, which is out of reach meanwhile
        expect(log.closest(".ui-modal")?.parentElement?.closest(".ui-modal")).toBe(
            pause.closest(".ui-modal"),
        );
        expect(pause).toHaveAttribute("inert");
        act(() => {
            fireEvent.click(within(log).getByRole("button", { name: "Close" }));
        });
        expect(calls.closeRunLog).toHaveBeenCalled();
        expect(store.getSnapshot().overlay).toBe("paused");
        expect(screen.queryByRole("dialog", { name: /^Collection log/ })).toBeNull();
        expect(screen.getByRole("dialog", { name: "Paused" })).not.toHaveAttribute("inert");
    });

    test("leaves Escape to the client, whose pause key it is in a run", () => {
        const { calls } = pauseRun(true);
        fireEvent.keyDown(window, { code: "Escape", key: "Escape" });
        expect(calls.closeRunLog).not.toHaveBeenCalled();
    });

    test("sends a pad's Start and back to the client as P and Escape, not to the menu's Resume", () => {
        const { calls } = pauseRun();
        // On the menu alone, Start presses its Resume
        expect(pressPad(PAD.start)).toEqual([]);
        expect(calls.resume).toHaveBeenCalledOnce();
        cleanup();
        const run = pauseRun(true);
        // The log has no main button of its own, so Start is P (GameClient.pressPauseKey)
        expect(pressPad(PAD.start)).toEqual(["KeyP"]);
        expect(pressPad(PAD.east)).toEqual(["Escape"]);
        expect(run.calls.resume).not.toHaveBeenCalled();
    });

    test("opens where it was left once a co-op run's level up or casket has taken it away", () => {
        const { store } = pauseRun(true);
        const theatre = mapName(getMap("theatre_of_blood"));
        fireEvent.click(within(runLog()).getByRole("button", { name: "Raids" }));
        fireEvent.click(within(runLog()).getByRole("button", { name: theatre }));
        expect(pageTitle(runLog())).toBe(theatre);
        // The menu goes for a moment, and the log with it; the run's still on the log
        act(() => store.set({ overlay: "none" }));
        expect(screen.queryByRole("dialog", { name: /^Collection log/ })).toBeNull();
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
