// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";

import { GameClient } from "../client/GameClient";
import { GameStore, HudNumbers, HudView, SlotView } from "../client/GameStore";
import { createSave } from "../core/save";
import { GameUi } from "./GameUi";

function slot(id: string, level: number): SlotView {
    return { id, name: id, level, maxLevel: 8, iconObjId: 1, detail: "", rarityColor: "#fff" };
}

function hud(weapons: SlotView[]): HudView {
    return {
        mapId: "lumbridge",
        level: 3,
        maxWeapons: 6,
        maxPassives: 6,
        weapons,
        passives: [],
        stats: [],
        gear: [],
        inventory: [null, null, null, null],
        rerolls: 0,
        banishes: 0,
    };
}

function numbers(changes: Partial<HudNumbers> = {}): HudNumbers {
    return {
        bossIn: 600,
        hp: 20,
        maxHp: 25,
        poisoned: false,
        xpFraction: 0.5,
        seconds: 61,
        kills: 7,
        coins: 3,
        dps: 0,
        weaponDamage: {},
        otherDps: 0,
        buffs: [],
        quests: [],
        ...changes,
    };
}

// The HUD with the client's store and nothing else of it
function renderHud() {
    const store = new GameStore(createSave());
    const noop = () => {};
    const client = new Proxy(
        { store, input: { stick: {} } },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ) as unknown as GameClient;
    store.set({ screen: "run", overlay: "none", hud: hud([slot("bow", 1)]) });
    store.setNumbers(numbers());
    const view = render(<GameUi store={store} client={client} />);
    return { store, view };
}

afterEach(cleanup);

describe("the run's HUD", () => {
    test("shows an untimed ring beside timed buffs, and removes it when spent", () => {
        const { store, view } = renderHud();
        const potion = {
            id: "potion",
            name: "Potion",
            objId: 2436,
            harmful: false,
            secondsLeft: 30,
            fraction: 0.5,
        };
        act(() =>
            store.setNumbers(
                numbers({
                    buffs: [
                        potion,
                        {
                            id: "ring_of_life",
                            name: "Ring of life",
                            objId: 2570,
                            harmful: false,
                        },
                    ],
                }),
            ),
        );
        const ring = view.getByTitle("Ring of life");
        expect(ring.querySelector(".ui-icon")).not.toBeNull();
        expect(ring).not.toHaveTextContent(/\ds/);
        expect(ring.querySelector(".ui-buff-bar")).toBeNull();
        const timed = view.getByTitle("Potion");
        expect(timed).toHaveTextContent("30s");
        expect(timed.querySelector(".ui-buff-bar")).toHaveStyle("transform: scaleX(0.5)");
        act(() => store.setNumbers(numbers({ buffs: [potion] })));
        expect(view.queryByTitle("Ring of life")).toBeNull();
        expect(view.getByTitle("Potion")).toHaveTextContent("30s");
    });

    test("shows its numbers as they change, apart from the rest of the UI", () => {
        const { store, view } = renderHud();
        const timer = () => view.container.querySelector(".ui-timer")!.textContent;
        expect(timer()).toBe("1:01");
        expect(view.container.querySelector(".ui-hp span")!.textContent).toBe("20 / 25");
        act(() => store.setNumbers(numbers({ seconds: 62, hp: 12 })));
        expect(timer()).toBe("1:02");
        expect(view.container.querySelector(".ui-hp span")!.textContent).toBe("12 / 25");
        const fill = view.container.querySelector<HTMLElement>(".ui-hp-fill")!;
        expect(fill.style.transform).toBe("scaleX(0.48)");
    });

    test("shows what the hero has when it changes", () => {
        const { store, view } = renderHud();
        const levels = () =>
            [...view.container.querySelectorAll(".ui-slot-level")].map((el) => el.textContent);
        expect(levels()).toEqual(["1"]);
        act(() => store.set({ hud: hud([slot("bow", 2), slot("staff", 1)]) }));
        expect(levels()).toEqual(["2", "1"]);
    });

    test("the boss's warning counts down in the last minute", () => {
        const { store, view } = renderHud();
        expect(view.container.querySelector(".ui-boss-warning")).toBeNull();
        act(() => store.setNumbers(numbers({ bossIn: 42 })));
        expect(view.container.querySelector(".ui-boss-warning")!.textContent).toMatch(/42s$/);
    });
});
