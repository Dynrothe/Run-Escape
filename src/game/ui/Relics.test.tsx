// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { GameClient } from "../client/GameClient";
import { GameStore } from "../client/GameStore";
import { ACT_MAPS } from "../content/maps";
import { createSave } from "../core/save";
import { RelicRow } from "./Relics";

vi.mock("@foxglove/wasm-bz2/wasm/module.wasm?url", () => ({ default: "" }));

afterEach(cleanup);

function renderRelics(relics?: string[], tiers = 4) {
    const save = createSave();
    save.relics = relics;
    save.mapVictories = Object.fromEntries(ACT_MAPS.slice(0, tiers).map((map) => [map.id, 1]));
    const store = new GameStore(save);
    const persist = vi.fn(() => store.set({ save: { ...save } }));
    const setMe = vi.fn();
    const client: GameClient = Object.create(GameClient.prototype);
    Object.assign(client, {
        save,
        store,
        persist,
        getLoadout: () => ({ relics: save.relics }),
        coop: { setMe },
    });
    const draw = () => <RelicRow ui={store.getSnapshot()} client={client} />;
    const { rerender } = render(draw());
    return { save, persist, setMe, redraw: () => rerender(draw()) };
}

test("remove all clears every tier, saves once and updates the co-op loadout", () => {
    const { save, persist, setMe, redraw } = renderRelics([
        "trickster",
        "bankers_note",
        "specialist",
        "last_recall",
    ]);
    save.pet = "butch";
    save.runInvocations = ["run_glass_cannon"];
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    expect(save.relics).toBeUndefined();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(setMe).toHaveBeenCalledExactlyOnceWith({ loadout: { relics: undefined } });
    expect(save.pet).toBe("butch");
    expect(save.runInvocations).toEqual(["run_glass_cannon"]);
    redraw();
    expect(screen.getAllByRole("button", { name: /^Tier \d: None$/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Remove all" })).toBeDisabled();
});

test("remove all works with only the first tier unlocked", () => {
    const { save, redraw } = renderRelics(["trickster"], 1);
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    redraw();
    expect(save.relics).toBeUndefined();
    expect(screen.getByRole("button", { name: "Tier 1: None" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Tier 2: beat/ })).toBeDisabled();
});

test.each([undefined, []])("remove all is disabled with no relics picked (%s)", (relics) => {
    const { persist, setMe } = renderRelics(relics);
    const removeAll = screen.getByRole("button", { name: "Remove all" });
    expect(removeAll).toBeDisabled();
    fireEvent.click(removeAll);
    expect(persist).not.toHaveBeenCalled();
    expect(setMe).not.toHaveBeenCalled();
});
