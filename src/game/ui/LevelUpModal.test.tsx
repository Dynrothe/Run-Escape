// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";

import { GameClient } from "../client/GameClient";
import { BanishedView, ChoiceView, GameStore, HudNumbers, HudView } from "../client/GameStore";
import { createSave } from "../core/save";
import { GameUi } from "./GameUi";

afterEach(() => {
    cleanup();
});

function createHud(banished?: BanishedView[]): HudView {
    return {
        mapId: "lumbridge",
        level: 3,
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
        banished,
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
        platinum: 0,
        dps: 0,
        weaponDamage: {},
        otherDps: 0,
        buffs: [],
        quests: [],
        combatTasks: [],
    };
}

function createChoice(): ChoiceView {
    return {
        title: "Rune scimitar",
        text: "Fast slashing weapon",
        iconObjId: 1333,
        isNew: false,
        isEvolution: false,
        isHilt: false,
        isSpell: false,
        isBlessing: false,
        isKeris: false,
        banishable: false,
        banished: false,
    };
}

function renderLevelUp(banished?: BanishedView[]) {
    const store = new GameStore(createSave());
    const noop = () => {};
    const client = new Proxy({ store, input: { stick: {} } } as Record<string, unknown>, {
        get: (target, key) => (key in target ? target[key as string] : noop),
    }) as unknown as GameClient;
    store.set({
        screen: "run",
        overlay: "levelUp",
        hud: createHud(banished),
        choices: [createChoice(), createChoice(), createChoice()],
    });
    store.setNumbers(createNumbers());
    return render(<GameUi store={store} client={client} />);
}

describe("the level up's banished list", () => {
    test("lists each banished weapon and passive by name", () => {
        const view = renderLevelUp([
            {
                id: "crossbow",
                name: "Crossbow",
                description: "Fires bolts",
                iconObjId: 9174,
            },
            {
                id: "piety",
                name: "Piety",
                description: "More damage",
                iconObjId: 1718,
                iconSpriteId: 132,
            },
        ]);
        const list = view.getByRole("group", { name: "Banished:" });
        const slots = list.querySelectorAll(".ui-banished-slot");
        expect([...slots].map((slot) => slot.getAttribute("aria-label"))).toEqual([
            "Crossbow",
            "Piety",
        ]);
    });

    test("isn't there while nothing's been banished", () => {
        const view = renderLevelUp([]);
        expect(view.queryByRole("group", { name: "Banished:" })).toBeNull();
    });
});
