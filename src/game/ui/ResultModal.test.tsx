// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { GameClient } from "../client/GameClient";
import { GameStore, PlayerResultView, UiSnapshot } from "../client/GameStore";
import { createSave } from "../core/save";
import { ResultModal } from "./GameUi";

vi.mock("@foxglove/wasm-bz2/wasm/module.wasm?url", () => ({ default: "" }));

function createUi(solo = false, hard = false, expert = false): UiSnapshot {
    const players: PlayerResultView[] = ["Alice", "Bob", "Charlie", "Dana"].map((name, i) => ({
        name,
        characterName: ["Warrior", "Wizard", "Ranger", "Monk"][i],
        isLocal: i === 1,
        down: i === 2,
        left: i === 3,
        kills: i + 1,
        damageDealt: (i + 1) * 100,
        caskets: i,
        highestHit: i + 30,
        damageTaken: i + 10,
        healed: i + 20,
        rerollsUsed: i,
        skips: i,
        damage: [{ name: `${name}'s weapon`, damage: (i + 1) * 100, kills: i + 1, perSecond: 5 }],
        kinds: [],
        killsByEnemy: [],
    }));
    const ui = new GameStore(createSave()).getSnapshot();
    return {
        ...ui,
        screen: "run",
        overlay: "dead",
        coop: {
            ...ui.coop,
            room: solo
                ? undefined
                : {
                      code: "TESTROOM",
                      name: "Party",
                      open: true,
                      hostId: "alice",
                      mapId: "lumbridge",
                      endless: false,
                      hard: false,
                      started: true,
                      members: [],
                  },
        },
        result: {
            mapId: "lumbridge",
            endless: false,
            hard,
            expert,
            round: 1,
            victory: false,
            seconds: 123,
            level: 10,
            kills: solo ? 2 : 10,
            coins: 250,
            bossesKilled: [],
            gearFound: [],
            evolutionsMade: [],
            trophies: [],
            enemyKills: {},
            caskets: solo ? 1 : 6,
            stats: {
                sources: [],
                damageByKind: {},
                killsByEnemy: {},
                damageTaken: 11,
                damageBlocked: 0,
                healed: 21,
                highestHit: 31,
                rerollsUsed: 1,
                skips: 1,
                bossKills: [],
            },
            players: solo ? [players[1]] : players,
            bossKills: [],
            endlessRecord: false,
            firstHardWin: false,
            unlockedCharacters: [],
            unlockedItems: [],
            newGear: ["Rune platebody"],
            newTrophies: [],
            quests: [],
            combatTasks: [],
            ...(!solo && { coop: true }),
        },
    };
}

function stat(table: string, label: string): string | null {
    const row = within(screen.getByRole("table", { name: table }))
        .getByText(label)
        .closest("tr")!;
    return within(row).getAllByRole("cell")[1].textContent;
}

const client = { leaveRun: vi.fn(), retry: vi.fn() } as unknown as GameClient;

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
});

test("on your own, Play again is the main button", () => {
    render(<ResultModal ui={createUi(true)} client={client} />);
    const again = screen.getByRole("button", { name: /Play again/ });
    expect(again).toHaveClass("ui-button-go");
    expect(screen.getByRole("button", { name: "Back to the title" })).not.toHaveClass(
        "ui-button-go",
    );
    fireEvent.click(again);
    expect(client.retry).toHaveBeenCalledOnce();
});

test("a party goes back together: no Play again", () => {
    render(<ResultModal ui={createUi()} client={client} />);
    expect(screen.queryByRole("button", { name: /Play again/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to the party" })).toHaveClass("ui-button-go");
});

test("a party's results keep no Play again once the room has closed", () => {
    // Retry does nothing after a co-op run, so neither the button nor Enter offers it
    vi.useFakeTimers();
    const ui = createUi();
    render(<ResultModal ui={{ ...ui, coop: { ...ui.coop, room: undefined } }} client={client} />);
    expect(screen.queryByRole("button", { name: /Play again/ })).toBeNull();
    vi.advanceTimersByTime(700);
    fireEvent.keyDown(window, { key: "Enter", code: "Enter" });
    expect(client.retry).not.toHaveBeenCalled();
    expect(client.leaveRun).toHaveBeenCalledOnce();
});

test("Escape leaves the results, but not in the moment they come up", () => {
    vi.useFakeTimers();
    render(<ResultModal ui={createUi(true)} client={client} />);
    fireEvent.keyDown(window, { code: "Escape" });
    expect(client.leaveRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    fireEvent.keyDown(window, { code: "Escape" });
    expect(client.leaveRun).toHaveBeenCalledOnce();
});

test("starts on your own stats and cycles every player with themed buttons and arrow keys", () => {
    render(<ResultModal ui={createUi()} client={client} />);
    expect(screen.getByText("Bob (you)")).toBeInTheDocument();
    expect(stat("Individual stats", "Kills")).toBe("2");
    expect(stat("Individual stats", "Damage dealt")).toBe("200");
    expect(stat("Party totals", "Kills")).toBe("10");
    expect(stat("Party totals", "Damage dealt")).toBe("1,000");

    fireEvent.click(screen.getByRole("button", { name: "Next player's stats" }));
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("Player 3 of 4 · Down")).toBeInTheDocument();
    expect(stat("Individual stats", "Kills")).toBe("3");
    expect(stat("Individual stats", "Biggest hit")).toBe("32");
    expect(stat("Individual stats", "Damage taken")).toBe("12");
    expect(stat("Individual stats", "Hitpoints healed")).toBe("22");
    expect(stat("Individual stats", "Caskets opened")).toBe("2");
    // The damage by source is on the Combat tab
    fireEvent.click(screen.getByRole("tab", { name: "Combat" }));
    expect(screen.getByRole("table", { name: "Damage by source" })).toHaveTextContent(
        "Charlie's weapon",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Player 4 of 4 · Left the run")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Dana")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous player's stats" }));
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(stat("Party totals", "Kills")).toBe("10");
    expect(stat("Party totals", "Coins banked")).toBe("250");
    // What the run unlocked is on a tab of its own
    expect(screen.queryByText("New in the Armoury: Rune platebody")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Unlocks (1)" }));
    expect(screen.getByText("New in the Armoury: Rune platebody")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to the party" }));
    expect(client.leaveRun).toHaveBeenCalledOnce();
});

test("does not navigate while typing or holding a key, and starts a new result on you", () => {
    const { unmount } = render(<ResultModal ui={createUi()} client={client} />);
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    input.remove();
    expect(screen.getByText("Bob (you)")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    unmount();
    render(<ResultModal ui={createUi()} client={client} />);
    expect(screen.getByText("Bob (you)")).toBeInTheDocument();
});

test("solo results show personal totals without player navigation", () => {
    render(<ResultModal ui={createUi(true)} client={client} />);
    expect(
        screen.queryByRole("group", { name: "Player stats navigation" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(stat("Individual stats", "Kills")).toBe("2");
    expect(stat("Run totals", "Run time")).toBe("2:03");
    expect(screen.getByRole("button", { name: "Back to the title" })).toBeInTheDocument();
});

test("a run's unlocks are on their own tab, counted, and a run without any has no such tab", () => {
    const ui = createUi(true);
    render(
        <ResultModal
            ui={{
                ...ui,
                overlay: "victory",
                result: {
                    ...ui.result!,
                    victory: true,
                    unlockedMap: "Draynor Village",
                    unlockedCharacters: ["Ranger"],
                    quests: [{ name: "Goblin slayer", coins: 50 }],
                    // Came to nothing: a note over the tabs, not an unlock
                    invasion: { id: "invading_vardorvis", came: true, killed: false },
                },
            }}
            client={client}
        />,
    );
    // The stats come first, the unlocks a tab away with how many there are
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Draynor Village is open to you now!")).toBeNull();
    const tab = screen.getByRole("tab", { name: "Unlocks (4)" });
    expect(within(tab).getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/still stood when the run ended/)).toBeInTheDocument();
    fireEvent.click(tab);
    const page = screen.getByRole("tabpanel");
    expect(within(page).getByText("Draynor Village is open to you now!")).toBeInTheDocument();
    expect(within(page).getByText("The Ranger joins you!")).toBeInTheDocument();
    expect(within(page).getByText(/Quest complete: Goblin slayer/)).toBeInTheDocument();
    expect(within(page).getByText("New in the Armoury: Rune platebody")).toBeInTheDocument();
    cleanup();

    render(<ResultModal ui={{ ...ui, result: { ...ui.result!, newGear: [] } }} client={client} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Summary", "Combat"]);
});

test("hard mode shows with the run's totals", () => {
    render(<ResultModal ui={createUi(true, true)} client={client} />);
    expect(stat("Run totals", "Difficulty")).toBe("Hard");
    cleanup();
    render(<ResultModal ui={createUi(false, true)} client={client} />);
    expect(stat("Party totals", "Difficulty")).toBe("Hard");
    const individual = screen.getByRole("table", { name: "Individual stats" });
    expect(within(individual).queryByText("Difficulty")).toBeNull();
});

test("a raid's expert mode says so, not hard, dead or victorious", () => {
    // Expert is hard and more (Sim.hard is set too), so it's named for what it is
    render(<ResultModal ui={createUi(true, true, true)} client={client} />);
    expect(stat("Run totals", "Difficulty")).toBe("Expert");
    cleanup();
    const won = createUi(true, true, true);
    render(
        <ResultModal
            ui={{ ...won, overlay: "victory", result: { ...won.result!, victory: true } }}
            client={client}
        />,
    );
    expect(stat("Run totals", "Difficulty")).toBe("Expert");
});
