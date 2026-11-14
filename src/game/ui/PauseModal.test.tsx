// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { GameClient } from "../client/GameClient";
import { GameStore, HudNumbers, HudView } from "../client/GameStore";
import { createSave } from "../core/save";
import { GameUi } from "./GameUi";

vi.mock("@foxglove/wasm-bz2/wasm/module.wasm?url", () => ({ default: "" }));

afterEach(cleanup);

function hud(): HudView {
    return {
        mapId: "lumbridge",
        level: 1,
        maxWeapons: 4,
        maxPassives: 4,
        weapons: [],
        passives: [],
        stats: [],
        statRows: [],
        gear: [],
        inventory: [null, null, null, null],
        rerolls: 0,
        banishes: 0,
    };
}

function numbers(): HudNumbers {
    return {
        bossIn: 600,
        hp: 25,
        maxHp: 25,
        poisoned: false,
        xpFraction: 0,
        seconds: 1,
        kills: 0,
        coins: 0,
        dps: 0,
        weaponDamage: {},
        otherDps: 0,
        buffs: [],
        quests: [],
    };
}

function paused() {
    const store = new GameStore(createSave());
    store.set({ screen: "run", overlay: "paused", hud: hud() });
    store.setNumbers(numbers());
    const noop = () => {};
    const client = new Proxy(
        { store, input: { stick: {} } },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ) as unknown as GameClient;
    return render(<GameUi store={store} client={client} />);
}

test("pause is a labelled modal, isolates the run and starts on its selected tab", () => {
    const view = paused();
    const dialog = screen.getByRole("dialog", { name: "Paused" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("tab", { name: "Loadout" })).toHaveFocus();

    const overlay = dialog.parentElement!;
    // The toasts stay out of it, so they're still announced
    const background = [...overlay.parentElement!.children].filter(
        (element) => element !== overlay && !element.matches(".ui-toasts"),
    );
    expect(background.length).toBeGreaterThan(0);
    expect(background.every((element) => element.hasAttribute("inert"))).toBe(true);
    expect(view.container.querySelector(".ui-run")).not.toBeNull();
});

test("Tab and Shift+Tab wrap inside the pause dialog", () => {
    paused();
    const loadout = screen.getByRole("tab", { name: "Loadout" });
    const resume = screen.getByRole("button", { name: "Resume" });

    resume.focus();
    fireEvent.keyDown(resume, { key: "Tab" });
    expect(loadout).toHaveFocus();

    fireEvent.keyDown(loadout, { key: "Tab", shiftKey: true });
    expect(resume).toHaveFocus();
});
