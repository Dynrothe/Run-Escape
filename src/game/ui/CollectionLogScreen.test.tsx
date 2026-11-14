// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { GameClient } from "../client/GameClient";
import { GameStore } from "../client/GameStore";
import { EVOLUTIONS } from "../content/evolutions";
import { getMap, mapName } from "../content/maps";
import { weaponName } from "../content/weapons";
import { createSave } from "../core/save";
import { GameUi } from "./GameUi";
import { iconCache } from "./ItemIcon";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// The log open on a new save, each item's icon its object id
function openLog(): { showScreen: ReturnType<typeof vi.fn>; log: HTMLElement } {
    vi.spyOn(iconCache, "get").mockImplementation((objId: number) => `obj:${objId}`);
    vi.spyOn(iconCache, "request").mockImplementation(() => {});
    vi.spyOn(iconCache, "requestFrame").mockImplementation(() => {});
    const store = new GameStore(createSave());
    store.set({ screen: "collectionLog" });
    const showScreen = vi.fn();
    const client = new Proxy(
        { showScreen },
        { get: (target, key) => target[key as keyof typeof target] ?? vi.fn() },
    );
    render(<GameUi store={store} client={client as unknown as GameClient} />);
    return { showScreen, log: screen.getByRole("dialog") };
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
