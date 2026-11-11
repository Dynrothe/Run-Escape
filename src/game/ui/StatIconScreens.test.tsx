// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";

import { GameClient } from "../client/GameClient";
import {
    ChestView,
    ChoiceView,
    EventView,
    GameStore,
    HudNumbers,
    HudView,
} from "../client/GameStore";
import { createSave } from "../core/save";
import { ChestModal } from "./ChestModal";
import { ItemDescription } from "./DescriptionButton";
import { EventModal } from "./EventModal";
import { GameUi } from "./GameUi";

afterEach(() => {
    cleanup();
});

function createHud(): HudView {
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

describe("stat icons on the screens that show stats", () => {
    test("level-up choice stats render StatLine icons, value diffs and spacers", () => {
        const store = new GameStore(createSave());
        const client = createMockClient(store);
        store.set({
            screen: "run",
            overlay: "levelUp",
            hud: createHud(),
            choices: [
                createChoice({
                    title: "Dragon scimitar",
                    stats: [
                        { label: "Damage", from: "10", value: "13", better: true },
                        { label: "Attacks", from: "2.00/s", value: "1.67/s", better: false },
                    ],
                }),
                createChoice({
                    title: "Strength passive",
                    stats: [{ label: "Damage", from: "+25%", value: "+30%", better: true }],
                }),
                createChoice({
                    title: "Mystery upgrade",
                    stats: [{ label: "Unknown bonus", value: "+10" }],
                }),
            ],
        });
        store.setNumbers(createNumbers());
        const view = render(<GameUi store={store} client={client} />);

        const choiceStats = view.container.querySelectorAll(".ui-choice-stat");
        expect(choiceStats.length).toBe(4);

        // Weapon level up: Damage 10 -> 13
        expect(choiceStats[0]).toHaveClass("ui-stat-line");
        expect(choiceStats[0].querySelector(".ui-icon")).not.toBeNull();
        expect(choiceStats[0].textContent).toContain("Damage 10 → 13");
        expect(choiceStats[0].querySelector(".ui-choice-stat-up")?.textContent).toBe("13");

        // Weapon level up: Attacks 2.00/s -> 1.67/s
        expect(choiceStats[1]).toHaveClass("ui-stat-line");
        expect(choiceStats[1].querySelector(".ui-icon")).not.toBeNull();
        expect(choiceStats[1].textContent).toContain("Attacks 2.00/s → 1.67/s");
        expect(choiceStats[1].querySelector(".ui-choice-stat-down")?.textContent).toBe("1.67/s");

        // Passive level up: Damage +25% -> +30%
        expect(choiceStats[2]).toHaveClass("ui-stat-line");
        expect(choiceStats[2].querySelector(".ui-icon")).not.toBeNull();
        expect(choiceStats[2].textContent).toContain("Damage +25% → +30%");
        expect(choiceStats[2].querySelector(".ui-choice-stat-up")?.textContent).toBe("+30%");

        // Unknown stat: renders spacer
        expect(choiceStats[3]).toHaveClass("ui-stat-line");
        expect(choiceStats[3].querySelector(".ui-stat-spacer")).not.toBeNull();
        expect(choiceStats[3].textContent).toContain("Unknown bonus +10");
    });

    test("ChestModal renders item lines, set progress and replacement diffs with StatLine", () => {
        vi.useFakeTimers();
        try {
            const store = new GameStore(createSave());
            const client = createMockClient(store, { playChestSound: vi.fn() });
            const chest: ChestView = {
                uid: 1,
                tierColor: "#ffd700",
                rarity: "rare",
                casketObjId: 2724,
                casketName: "Hard casket",
                coins: 100,
                alchCoins: 50,
                isGear: true,
                item: {
                    id: "void_top",
                    name: "Void knight top",
                    objId: 8839,
                    rarity: { name: "Rare", color: "#3fe03f" },
                    kindLabel: "Body slot",
                    lines: ["+10% damage", "+2 armour"],
                    set: { text: "Void knight 2/4: 3 worn give +10% damage", active: false },
                },
                replaces: {
                    item: {
                        id: "leather_body",
                        name: "Leather body",
                        objId: 1129,
                        rarity: { name: "Common", color: "#ffffff" },
                        kindLabel: "Body slot",
                        lines: ["+1 armour"],
                    },
                    alchCoins: 10,
                },
                changes: [
                    { text: "+10% damage", good: true },
                    { text: "-1 armour", good: false },
                ],
                carried: 0,
                canStash: true,
                instant: false,
                recommended: "take",
                queued: 0,
            };

            const view = render(
                <ChestModal chest={chest} rerolls={0} banishes={0} client={client} />,
            );

            // Advance timers to reveal phase
            act(() => {
                vi.advanceTimersByTime(2500);
            });

            // Item lines use StatLine
            const lines = view.container.querySelectorAll(".ui-chest-lines .ui-stat-line");
            expect(lines.length).toBe(2);
            expect(lines[0].textContent).toBe("+10% damage");
            expect(lines[0].querySelector(".ui-icon")).not.toBeNull();
            expect(lines[1].textContent).toBe("+2 armour");
            expect(lines[1].querySelector(".ui-icon")).not.toBeNull();

            // Set line uses StatLine
            const setLine = view.container.querySelector(".ui-chest-set .ui-stat-line");
            expect(setLine).not.toBeNull();
            expect(setLine?.textContent).toContain("Void knight 2/4");
            // Set line has spacer since "Void knight..." doesn't match an icon
            expect(setLine?.querySelector(".ui-stat-spacer")).not.toBeNull();

            // Gear changes use StatLine with good/bad coloring
            const changes = view.container.querySelectorAll(".ui-chest-changes .ui-stat-line");
            expect(changes.length).toBe(2);
            expect(changes[0].textContent).toBe("+10% damage");
            expect(changes[0].closest(".ui-good")).not.toBeNull();
            expect(changes[0].querySelector(".ui-icon")).not.toBeNull();
            expect(changes[1].textContent).toBe("-1 armour");
            expect(changes[1].closest(".ui-bad")).not.toBeNull();
            expect(changes[1].querySelector(".ui-icon")).not.toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    test("EventModal renders reward and effect lines with StatLine", () => {
        const store = new GameStore(createSave());
        const client = createMockClient(store);
        const event: EventView = {
            uid: 10,
            name: "Supply chest",
            speech: "Spend your raid points on supplies.",
            leaveLabel: "Leave",
            options: [
                {
                    title: "Divine magic potion",
                    text: "+25% magic damage for 3 minutes.",
                    iconObjId: 23745,
                    price: 80,
                    sold: false,
                    enabled: true,
                },
                {
                    title: "Dwarf multicannon",
                    text: "Sets up a cannon that shoots everything nearby for 20 seconds.",
                    iconObjId: 6,
                    price: 60,
                    sold: false,
                    enabled: true,
                },
            ],
        };

        const view = render(<EventModal event={event} coins={200} client={client} />);

        const statLines = view.container.querySelectorAll(".ui-card-text .ui-stat-line");
        expect(statLines.length).toBe(2);

        // First option (+25% magic damage) resolves to magic icon
        expect(statLines[0].textContent).toBe("+25% magic damage for 3 minutes.");
        expect(statLines[0].querySelector(".ui-icon")).not.toBeNull();

        // Second option has spacer
        expect(statLines[1].textContent).toContain("Sets up a cannon");
        expect(statLines[1].querySelector(".ui-stat-spacer")).not.toBeNull();
    });

    test("the pause menu lists each slot's, the player's and worn gear's stats a line each", () => {
        const store = new GameStore(createSave());
        const client = createMockClient(store);
        store.set({
            screen: "run",
            overlay: "paused",
            hud: {
                ...createHud(),
                weapons: [
                    {
                        id: "rune_scimitar",
                        name: "Rune scimitar",
                        level: 2,
                        maxLevel: 8,
                        iconObjId: 1333,
                        detail: "+15% damage",
                        stats: ["Damage 13", "Attacks 1.25/s"],
                        rarityColor: "#fff",
                    },
                ],
                stats: ["+10% damage", "+1 armour"],
                gear: [
                    {
                        slot: "head",
                        name: "Head",
                        item: {
                            id: "void_mage_helm",
                            name: "Void mage helm",
                            objId: 11663,
                            rarity: { name: "Rare", color: "#0f0" },
                            kindLabel: "Head slot",
                            lines: ["+10% magic damage", "+1 armour"],
                            set: { text: "Void knight 2/4", active: false },
                        },
                    },
                ],
            },
        });
        store.setNumbers(createNumbers());
        const view = render(<GameUi store={store} client={client} />);

        const leftColumn = view.container.querySelector(".ui-pause-column")!;
        expect(leftColumn.firstElementChild).toHaveTextContent("Your stats");
        expect(leftColumn.children[1]).toHaveClass("ui-pause-stats");
        expect(leftColumn.children[2]).toHaveClass("ui-pause-loadout");
        expect(leftColumn.children[2]).toHaveTextContent("Rune scimitar");
        expect(leftColumn.children[3]).toHaveTextContent("Worn equipment");

        const [weapon, gear] = view.container.querySelectorAll(".ui-pause-item");
        const weaponLines = weapon.querySelectorAll(".ui-pause-detail > .ui-stat-line");
        expect([...weaponLines].map((line) => line.textContent)).toEqual([
            "Damage 13",
            "Attacks 1.25/s",
            "+15% damage",
        ]);
        for (const line of weaponLines) {
            expect(line.querySelector(".ui-icon")).not.toBeNull();
        }

        const stats = view.container.querySelectorAll(".ui-pause-stats > .ui-stat-line");
        expect([...stats].map((line) => line.textContent)).toEqual(["+10% damage", "+1 armour"]);

        // The name and its lines sit together beside the icon, as a slot's do
        expect(gear.querySelector(":scope > .ui-pause-name")?.textContent).toContain(
            "Void mage helm",
        );
        const gearLines = gear.querySelectorAll(".ui-pause-detail > .ui-stat-line");
        expect([...gearLines].map((line) => line.textContent)).toEqual([
            "+10% magic damage",
            "+1 armour",
        ]);
        const set = gear.querySelector(".ui-pause-set .ui-stat-line");
        expect(set?.textContent).toBe("Void knight 2/4");
        expect(set?.querySelector(".ui-stat-spacer")).not.toBeNull();
    });

    test("a description's set line lines up with its stats", () => {
        const view = render(
            <ItemDescription
                item={{
                    id: "void_mage_helm",
                    name: "Void mage helm",
                    objId: 11663,
                    rarity: { name: "Rare", color: "#0f0" },
                    kindLabel: "Head slot",
                    lines: ["+10% magic damage"],
                    set: { text: "Void knight 2/4", active: true },
                }}
            />,
        );
        const lines = view.container.querySelectorAll(".ui-stat-line");
        expect([...lines].map((line) => line.textContent)).toEqual([
            "+10% magic damage",
            "Void knight 2/4",
        ]);
        expect(lines[1]).toHaveClass("ui-good");
        expect(lines[1].querySelector(".ui-stat-spacer")).not.toBeNull();
    });
});
