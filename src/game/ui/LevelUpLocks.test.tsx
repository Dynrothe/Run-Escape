// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";

import { GameClient } from "../client/GameClient";
import { ChoiceView, GameStore, HudNumbers, HudView } from "../client/GameStore";
import { createSave } from "../core/save";
import { GameUi } from "./GameUi";

afterEach(() => {
    cleanup();
});

function createHud(locks?: number): HudView {
    return {
        mapId: "lumbridge",
        level: 3,
        maxWeapons: 6,
        maxPassives: 6,
        weapons: [],
        passives: [],
        stats: [],
        gear: [],
        inventory: [null, null, null, null],
        rerolls: 0,
        banishes: 0,
        locks,
    };
}

function createNumbers(): HudNumbers {
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
    };
}

function createChoice(changes: Partial<ChoiceView> = {}): ChoiceView {
    return {
        title: "Rune scimitar",
        text: "Fast slashing weapon",
        iconObjId: 1333,
        isNew: false,
        isEvolution: false,
        isHilt: false,
        isSpell: false,
        banishable: false,
        banished: false,
        lockable: false,
        locked: false,
        carried: false,
        ...changes,
    };
}

function createMockClient(store: GameStore, overrides: Record<string, unknown> = {}): GameClient {
    const noop = () => {};
    const base = { store, input: { stick: {} }, ...overrides };
    return new Proxy(base, {
        get: (target, key) => (key in target ? target[key as keyof typeof target] : noop),
    }) as unknown as GameClient;
}

function renderLevelUp(choices: ChoiceView[], locks: number | undefined, overrides = {}) {
    const store = new GameStore(createSave());
    const client = createMockClient(store, overrides);
    store.set({ screen: "run", overlay: "levelUp", hud: createHud(locks), choices });
    store.setNumbers(createNumbers());
    return render(<GameUi store={store} client={client} />);
}

describe("level up locks (Sailing's Set sail)", () => {
    test("the lock button shows only on lockable cards, and clicking it locks that card", () => {
        const lock = vi.fn();
        const view = renderLevelUp(
            [
                createChoice({ title: "Choice 1", lockable: true }),
                createChoice({ title: "Choice 2", lockable: false }),
            ],
            1,
            { lock },
        );

        const buttons = view.container.querySelectorAll(".ui-lock");
        expect(buttons).toHaveLength(1);
        expect(buttons[0].getAttribute("title")).toBe(
            "Lock Choice 1: it can't be picked now, and comes first at your next level up",
        );
        fireEvent.click(buttons[0]);
        expect(lock).toHaveBeenCalledWith(0);
    });

    test("a locked card is greyed out and can't be picked, and says why", () => {
        const choose = vi.fn();
        const view = renderLevelUp(
            [createChoice({ title: "Locked", locked: true }), createChoice({ title: "Open" })],
            1,
            { choose },
        );

        const cards = view.container.querySelectorAll<HTMLButtonElement>("button.ui-choice");
        expect(cards[0]).toBeDisabled();
        expect(cards[0]).toHaveClass("ui-choice-locked");
        expect(cards[0].querySelector(".ui-tag-locked")?.textContent).toContain("Locked");
        expect(cards[0].textContent).toContain("is locked and will show up next level up");
        fireEvent.click(cards[0]);
        expect(choose).not.toHaveBeenCalled();

        expect(cards[1]).not.toBeDisabled();
        fireEvent.click(cards[1]);
        expect(choose).toHaveBeenCalledWith(1);
    });

    test("a reward held over says why it's first, and can be picked", () => {
        const view = renderLevelUp(
            [createChoice({ title: "Rune scimitar", carried: true }), createChoice()],
            0,
        );

        const notes = view.container.querySelectorAll(".ui-card-locked-note");
        expect(notes).toHaveLength(1);
        expect(notes[0].textContent).toContain("locked it last level up");
        expect(view.container.textContent).toContain("Set sail");
        const cards = view.container.querySelectorAll<HTMLButtonElement>("button.ui-choice");
        expect(cards[0].disabled).toBe(false);
    });

    test("the locks left are counted under the cards, when there are any", () => {
        const view = renderLevelUp([createChoice()], 2);
        expect(view.container.querySelector(".ui-locks")?.textContent).toBe("2 locks left");

        cleanup();
        const none = renderLevelUp([createChoice()], undefined);
        expect(none.container.querySelector(".ui-locks")).toBeNull();
    });
});
