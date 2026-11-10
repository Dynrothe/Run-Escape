// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { GameClient } from "../client/GameClient";
import {
    ChestView,
    EventView,
    GameStore,
    HudNumbers,
    HudView,
    SlotView,
    UiSnapshot,
} from "../client/GameStore";
import { getItemView } from "../client/ItemViews";
import { getUpgradeLine } from "../content/armoury";
import { CASKET_GEAR, GEAR_SLOTS, getGear } from "../content/items";
import { describeUnlockTask } from "../content/unlocks";
import { createSave } from "../core/save";
import { GameUi } from "./GameUi";
import { iconCache } from "./ItemIcon";

vi.mock("@foxglove/wasm-bz2/wasm/module.wasm?url", () => ({ default: "" }));

vi.mock("../client/GameView", () => ({
    formatTime: (seconds: number) => {
        const s = Math.floor(seconds);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    },
}));

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

// The HUD with the client's store and nothing else of it, but for the methods given
function renderHud(methods: Record<string, unknown> = {}) {
    const store = new GameStore(createSave());
    const noop = () => {};
    const client = new Proxy(
        { store, input: { stick: {} }, ...methods },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ) as unknown as GameClient;
    store.set({ screen: "run", overlay: "none", hud: hud([slot("bow", 1)]) });
    store.setNumbers(numbers());
    const view = render(<GameUi store={store} client={client} />);
    return { store, view };
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("the run's HUD", () => {
    test("the sound's orb by the minimap turns it off and on, with the \"no\" sign while it's off", () => {
        // Its sprites as if drawn
        vi.spyOn(iconCache, "getFrame").mockReturnValue("data:image/png;base64,");
        vi.spyOn(iconCache, "requestFrame").mockImplementation(() => {});
        const toggleMute = vi.fn();
        const { store } = renderHud({ toggleMute });
        const orb = () => screen.getByRole("button", { name: /^Sound (on|off):/ });
        expect(orb()).toHaveAccessibleName("Sound on: turn it off");
        expect(orb().closest(".ui-minimap")).not.toBeNull();
        expect(orb().querySelector(".ui-sound-orb-music")).not.toBeNull();
        expect(orb().querySelector(".ui-sound-orb-off")).toBeNull();
        act(() => store.set({ audio: { ...store.getSnapshot().audio, muted: true } }));
        expect(orb()).toHaveAccessibleName("Sound off: turn it on");
        expect(orb().querySelector(".ui-sound-orb-off")).not.toBeNull();
        fireEvent.click(orb());
        expect(toggleMute).toHaveBeenCalledOnce();
    });

    test("empty equipment slots use cache silhouettes and equipped items keep their own icons", () => {
        vi.spyOn(iconCache, "getSprite").mockImplementation(
            (id) => `data:image/png;base64,slot${id}`,
        );
        vi.spyOn(iconCache, "requestSprite").mockImplementation(() => {});
        vi.spyOn(iconCache, "get").mockImplementation(() => "data:image/png;base64,equipped");
        vi.spyOn(iconCache, "request").mockImplementation(() => {});
        const { store } = renderHud();
        const emptyGear = GEAR_SLOTS.map(({ id, name }) => ({ slot: id, name }));
        act(() => store.set({ hud: { ...hud([]), gear: emptyGear } }));
        for (const slot of GEAR_SLOTS) {
            const button = screen.getByRole("button", { name: `${slot.name} (empty)` });
            expect(button).toBeDisabled();
            expect(button).toHaveClass("ui-gear-slot-empty");
            expect(button.textContent).toBe("");
            expect(button.querySelector("img")).toHaveAttribute(
                "src",
                `data:image/png;base64,slot${slot.iconSpriteId}`,
            );
            expect(button.querySelector("img")).toHaveAttribute("alt", "");
        }
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        const item = getItemView(CASKET_GEAR[0]);
        act(() =>
            store.set({
                hud: {
                    ...hud([]),
                    gear: emptyGear.map((slot) =>
                        slot.slot === CASKET_GEAR[0].slot ? { ...slot, item } : slot,
                    ),
                },
            }),
        );
        const equipped = screen.getByRole("button", { name: item.name });
        expect(equipped).toBeEnabled();
        expect(equipped).not.toHaveClass("ui-gear-slot-empty");
        expect(equipped.querySelector("img")).toHaveAttribute(
            "src",
            "data:image/png;base64,equipped",
        );
        act(() => store.set({ hud: { ...hud([]), gear: emptyGear } }));
        expect(
            screen.getByRole("button", { name: "Head (empty)" }).querySelector("img"),
        ).toHaveAttribute("src", "data:image/png;base64,slot156");
    });

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

    test("the DPS keeps out of the way of a fight button over the items, and only that", () => {
        const { store, view } = renderHud();
        const damage = () => view.container.querySelector(".ui-damage")!;
        const ability = (withItems: boolean) => ({
            name: "Amascut's bane",
            iconObjId: 1,
            charge: 1,
            inReach: false,
            opened: false,
            guide: false,
            withItems,
            hint: false,
        });
        expect(damage()).not.toHaveClass("ui-damage-beside-ability");
        act(() => store.setNumbers(numbers({ ability: ability(true) })));
        expect(damage()).toHaveClass("ui-damage-beside-ability");
        // A one-fight map's button is in the corner, below the HUD's column
        act(() => store.setNumbers(numbers({ ability: ability(false) })));
        expect(damage()).not.toHaveClass("ui-damage-beside-ability");
    });

    test("the boss's warning counts down in the last minute", () => {
        const { store, view } = renderHud();
        expect(view.container.querySelector(".ui-boss-warning")).toBeNull();
        act(() => store.setNumbers(numbers({ bossIn: 42 })));
        expect(view.container.querySelector(".ui-boss-warning")!.textContent).toMatch(/42s$/);
    });

    test("weapons and passives describe their current stats and evolution on focus", () => {
        const { store } = renderHud();
        const weapon: SlotView = {
            ...slot("bow", 8),
            stats: ["Damage: 20", "Cooldown: 1s"],
            detail: "Shoots an arrow.",
            evolution: { passive: "Piety", maxed: true, hasPassive: false, ready: false },
        };
        const passive: SlotView = { ...slot("Piety", 2), detail: "+10% damage" };
        act(() => store.set({ hud: { ...hud([weapon]), passives: [passive] } }));
        const bow = screen.getByRole("button", { name: "bow" });
        fireEvent.focus(bow);
        const tip = screen.getByRole("tooltip");
        expect(bow).toHaveAttribute("aria-describedby", tip.id);
        for (const text of ["Max level", ...weapon.stats!, weapon.detail, "Piety"]) {
            expect(tip).toHaveTextContent(text);
        }
        fireEvent.blur(bow);
        const prayer = screen.getByRole("button", { name: "Piety" });
        fireEvent.focus(prayer);
        expect(screen.getByRole("tooltip")).toHaveTextContent("Level 2 of 8");
        expect(screen.getByRole("tooltip")).toHaveTextContent(passive.detail);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        fireEvent.focus(prayer);
        act(() => store.set({ overlay: "paused" }));
        expect(prayer).toBeDisabled();
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    test("worn equipment shows the reward description and current set bonus", () => {
        const { store } = renderHud();
        const item = {
            ...getItemView(CASKET_GEAR[0], 2),
            set: { text: "Set bonus active", active: true },
        };
        act(() =>
            store.set({
                hud: { ...hud([]), gear: [{ slot: CASKET_GEAR[0].slot, name: "Head", item }] },
            }),
        );
        const button = screen.getByRole("button", { name: item.name });
        fireEvent.focus(button);
        const tip = screen.getByRole("tooltip");
        for (const text of [item.name, ...item.lines, item.set.text]) {
            expect(tip).toHaveTextContent(text);
        }
        // Its line is green, spaced to line up with the stats above it
        expect(within(tip).getByText(item.set.text).closest(".ui-stat-line")).toHaveClass(
            "ui-good",
        );
        expect(button).not.toHaveAttribute("title");
    });

    test("Armoury tiles and future upgrades describe the actual piece without buying it", () => {
        const { store, view } = renderHud();
        const base = CASKET_GEAR.find((g) => getUpgradeLine(g.id).length > 2)!;
        const line = getUpgradeLine(base.id);
        const save = createSave();
        save.foundGear = [base.id];
        save.armoury[base.id] = 1;
        act(() => store.set({ screen: "armoury", save }));
        const tile = within(
            view.container.querySelector<HTMLElement>(".ui-armoury-slots")!,
        ).getByRole("button", { name: getGear(line[1]).name });
        fireEvent.focus(tile);
        const current = getItemView(getGear(line[1]));
        for (const text of [current.name, ...current.lines]) {
            expect(screen.getByRole("tooltip")).toHaveTextContent(text);
        }
        fireEvent.blur(tile);
        const future = getItemView(getGear(line[2]));
        const step = within(
            view.container.querySelector<HTMLElement>(".ui-armoury-line")!,
        ).getByRole("button", { name: future.name });
        fireEvent.focus(step);
        for (const text of [future.name, ...future.lines]) {
            expect(screen.getByRole("tooltip")).toHaveTextContent(text);
        }
        fireEvent.blur(step);
        const locked = view.container.querySelector<HTMLElement>(
            ".ui-armoury-tile.ui-card-locked",
        )!;
        fireEvent.focus(locked);
        expect(screen.getByRole("tooltip")).toHaveTextContent("Not found yet");
        fireEvent.click(locked);
        expect(locked).toHaveAttribute("aria-pressed", "true");
        expect(save.armoury[base.id]).toBe(1);
    });

    test("an Armoury piece still behind a map task says what unlocks it", () => {
        const { store } = renderHud();
        const piece = CASKET_GEAR.find((g) => g.unlock)!;
        act(() => store.set({ screen: "armoury", save: createSave() }));
        const tile = screen.getByRole("button", { name: `${piece.name} (not found yet)` });
        fireEvent.focus(tile);
        const tip = screen.getByRole("tooltip");
        expect(tip).toHaveTextContent(
            `${describeUnlockTask(piece.unlock!)} to find it in caskets.`,
        );
        expect(tip).not.toHaveTextContent("find it in a casket to upgrade it");
    });

    test("the bag is only dimmed where it's empty, overlay or not", () => {
        const { store, view } = renderHud();
        const item = getItemView(CASKET_GEAR[0]);
        const bag = () => [...view.container.querySelectorAll(".ui-inv-slot")];
        for (const overlay of ["none", "levelUp"] as const) {
            act(() =>
                store.set({
                    overlay,
                    hud: { ...hud([]), inventory: [{ item, count: 1 }, null, null, null] },
                }),
            );
            const [full, ...empty] = bag();
            expect(full).not.toHaveClass("ui-inv-slot-empty");
            expect(full).toHaveProperty("disabled", overlay !== "none");
            for (const slot of empty) {
                expect(slot).toHaveClass("ui-inv-slot-empty");
            }
        }
    });

    test("shows co-op's countdown while choosing and after the local player answers", () => {
        const { store, view } = renderHud();
        expect(view.queryByRole("timer")).toBeNull();
        act(() => {
            store.set({ overlay: "levelUp" });
            store.setNumbers(numbers({ decisionSeconds: 20 }));
        });
        expect(view.getByRole("timer").textContent).toBe("Party choosingAuto-choice in 20s");
        expect(view.getByRole("timer").getAttribute("aria-label")).toContain("20 seconds");
        act(() => {
            store.set({ overlay: "none", waitingOn: ["Teammate"] });
            store.setNumbers(numbers({ decisionSeconds: 5 }));
        });
        expect(view.getByRole("timer").className).toContain("ui-choice-countdown-soon");
        expect(view.getByRole("timer").textContent).toContain("5s");
        act(() => store.setNumbers(numbers({ decisionSeconds: 0 })));
        expect(view.getByRole("timer").textContent).toContain("0s");
        act(() => {
            store.set({ waitingOn: [] });
            store.setNumbers(numbers());
        });
        expect(view.queryByRole("timer")).toBeNull();
    });

    test("keeps the countdown up over a casket, an event and co-op's menu", () => {
        const { store, view } = renderHud();
        const chest: ChestView = {
            uid: 1,
            casketName: "Easy casket",
            casketObjId: 20546,
            tierColor: "#3fe03f",
            rarity: "common",
            coins: 10,
            item: getItemView(CASKET_GEAR[0]),
            isGear: true,
            changes: [],
            canStash: false,
            carried: 0,
            instant: false,
            alchCoins: 5,
            recommended: "take",
            queued: 0,
        };
        const event: EventView = {
            uid: 2,
            name: "Drunken dwarf",
            speech: "Have a drink!",
            leaveLabel: "Leave",
            options: [{ title: "Beer", iconObjId: 1917, enabled: true }],
        };
        const overlays: Partial<UiSnapshot>[] = [
            { overlay: "chest", chest },
            { overlay: "event", event },
            { overlay: "paused" },
        ];
        for (const changes of overlays) {
            act(() => {
                store.set(changes);
                store.setNumbers(numbers({ decisionSeconds: 12 }));
            });
            const timer = view.getByRole("timer");
            expect(timer.textContent).toContain("12s");
            // GameUi.css makes room under it by the modal coming after it
            const modal = view.container.querySelector(".ui-modal")!;
            expect(modal.parentElement).toBe(timer.parentElement);
            expect(timer.compareDocumentPosition(modal)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        }
    });
});
