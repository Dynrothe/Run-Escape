// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { GameClient } from "../client/GameClient";
import { GameStore } from "../client/GameStore";
import { enemyName } from "../content/enemies";
import { getDiaryEntries } from "../content/monsterDiary";
import { createSave } from "../core/save";
import { GameUi } from "./GameUi";
import { iconCache } from "./ItemIcon";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// The diary open on a new save (or one with kills), every picture stubbed
function openDiary(kills: Record<string, number> = {}): {
    leaveMenu: ReturnType<typeof vi.fn>;
    diary: HTMLElement;
} {
    vi.spyOn(iconCache, "get").mockImplementation((objId: number) => `obj:${objId}`);
    vi.spyOn(iconCache, "request").mockImplementation(() => {});
    vi.spyOn(iconCache, "requestFrame").mockImplementation(() => {});
    vi.spyOn(iconCache, "getHead").mockImplementation(() => "head");
    vi.spyOn(iconCache, "requestHead").mockImplementation(() => {});
    const save = createSave();
    Object.assign(save.enemyKills, kills);
    const store = new GameStore(save);
    store.set({ screen: "monsterDiary" });
    const leaveMenu = vi.fn();
    const client = new Proxy(
        { leaveMenu },
        { get: (target, key) => target[key as keyof typeof target] ?? vi.fn() },
    );
    render(<GameUi store={store} client={client as unknown as GameClient} />);
    return { leaveMenu, diary: screen.getByRole("dialog") };
}

const pageName = (diary: HTMLElement): string | null =>
    within(diary).getByRole("heading", { level: 3 }).textContent;

describe("the Monster diary's screen", () => {
    test("closes with Back, to where it was opened", () => {
        const { leaveMenu, diary } = openDiary();
        fireEvent.click(within(diary).getByRole("button", { name: "Back" }));
        expect(leaveMenu).toHaveBeenCalled();
    });

    test("opens on the first monster, with its stats, where it turns up and what's written of it", () => {
        const { diary } = openDiary();
        const first = getDiaryEntries()[0];
        expect(pageName(diary)).toBe(enemyName(first.variants[0].def));
        expect(within(diary).getByText("Hitpoints")).toBeTruthy();
        expect(within(diary).getByText("Where and when")).toBeTruthy();
        expect(within(diary).getByText(first.lore!.about)).toBeTruthy();
        expect(within(diary).getByText(first.lore!.where)).toBeTruthy();
    });

    test("opens a monster's page from the list", () => {
        const { diary } = openDiary();
        const entry = getDiaryEntries().find((e) => e.name === "Dharok the Wretched")!;
        fireEvent.click(within(diary).getByRole("button", { name: /Dharok the Wretched/ }));
        expect(pageName(diary)).toBe(enemyName(entry.variants[0].def));
        // A boss shows what it attacks with
        expect(within(diary).getByText("Attacks:", { exact: false })).toBeTruthy();
    });

    test("finds a monster by name", () => {
        const { diary } = openDiary();
        fireEvent.change(within(diary).getByRole("searchbox"), { target: { value: "dharok" } });
        const rows = within(diary).getAllByRole("button", { pressed: true });
        expect(rows.some((row) => /Dharok/.test(row.textContent ?? ""))).toBe(true);
        expect(within(diary).queryByRole("button", { name: /^Goblin/ })).toBeNull();
    });

    test("says so when nothing matches", () => {
        const { diary } = openDiary();
        fireEvent.change(within(diary).getByRole("searchbox"), { target: { value: "zzzzzz" } });
        expect(within(diary).getByText("No monster matches.")).toBeTruthy();
    });

    test("filters by kind", () => {
        const { diary } = openDiary();
        fireEvent.click(within(diary).getByRole("button", { name: "Bosses" }));
        const bosses = getDiaryEntries().filter((e) => e.kind === "boss");
        expect(pageName(diary)).toBe(enemyName(bosses[0].variants[0].def));
        expect(within(diary).queryByRole("button", { name: /^Chicken/ })).toBeNull();
    });

    test("filters by map", () => {
        const { diary } = openDiary();
        fireEvent.change(within(diary).getByRole("combobox", { name: "Map" }), {
            target: { value: "barrows" },
        });
        expect(within(diary).getByRole("button", { name: /Dharok the Wretched/ })).toBeTruthy();
        expect(within(diary).queryByRole("button", { name: /^Chicken/ })).toBeNull();
    });

    test("counts the times a monster has been defeated", () => {
        const first = getDiaryEntries()[0];
        const { diary } = openDiary({ [first.variants[0].def.id]: 7 });
        expect(within(diary).getByText(/Defeated 7/)).toBeTruthy();
    });

    test("says a monster hasn't been defeated yet", () => {
        const { diary } = openDiary();
        expect(within(diary).getByText(/Not defeated yet/)).toBeTruthy();
    });

    test("turns the body, and goes back to the head", () => {
        const { diary } = openDiary();
        const left = within(diary).getByRole("button", { name: "Turn left" });
        expect((left as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(within(diary).getByRole("button", { name: "Body" }));
        expect((left as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(left);
        fireEvent.click(within(diary).getByRole("button", { name: "Head" }));
        expect((left as HTMLButtonElement).disabled).toBe(true);
    });

    test("shows a notable unique drop under the stats, and none for a monster without one", () => {
        const { diary } = openDiary();
        fireEvent.click(within(diary).getByRole("button", { name: /^Vorkath/ }));
        expect(within(diary).getByText("Notable unique drop")).toBeTruthy();
        fireEvent.click(within(diary).getByRole("button", { name: /^Chicken/ }));
        expect(within(diary).queryByText("Notable unique drop")).toBeNull();
    });

    test("puts the stats beside the portrait, in the header", () => {
        const { diary } = openDiary();
        const head = diary.querySelector(".ui-diary-head")!;
        expect(head.querySelector(".ui-diary-portrait")).not.toBeNull();
        expect(within(head as HTMLElement).getByText("Hitpoints")).toBeTruthy();
        // And not again in the text under it
        expect(diary.querySelector(".ui-diary-scroll")!.textContent).not.toContain("Hitpoints");
    });
});
