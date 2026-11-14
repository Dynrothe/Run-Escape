// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { CARDS, CARD_BY_ID, PACK_BY_ID, PACK_SIZE, PackDef, packName } from "../content/cards";
import { buyCardPack, openCardPack } from "../core/cards";
import { SaveData, createSave } from "../core/save";
import { CardsScreen } from "./CardsScreen";

afterEach(cleanup);

// The screen over a save that the client's packs change, as GameClient's do
function Harness({
    start,
    showScreen = vi.fn(),
}: {
    start: SaveData;
    showScreen?: () => void;
}): JSX.Element {
    const [save, setSave] = useState(start);
    const client = {
        showScreen,
        revealCard: vi.fn(),
        openCardPack: () => {
            const next = structuredClone(save);
            const cards = openCardPack(next, () => 0.5);
            setSave(next);
            return cards;
        },
        buyCardPack: (pack: PackDef) => {
            const next = structuredClone(save);
            const cards = buyCardPack(next, pack, () => 0.5);
            setSave(next);
            return cards;
        },
    };
    return (
        <CardsScreen
            ui={{ save } as unknown as UiSnapshot}
            client={client as unknown as GameClient}
        />
    );
}

const scimitar = CARD_BY_ID.get("weapon:scimitar")!;

test("keeps a card not found face down, and shows a found one with its versions in words", () => {
    render(
        <Harness
            start={{
                ...createSave(),
                cardPacks: 0,
                cards: { [scimitar.id]: 3, [`${scimitar.id}@rare`]: 1 },
            }}
        />,
    );
    expect(screen.getAllByRole("button", { name: /not found yet$/ })).toHaveLength(
        CARDS.length - 1,
    );
    fireEvent.click(screen.getByRole("button", { name: scimitar.name() }));
    expect(screen.getByText("Yours: Common x3 and Rare x1")).toBeInTheDocument();
    expect(screen.getByText("Collected 1 / " + CARDS.length)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /free pack/ })).not.toBeInTheDocument();
});

test("opens the free pack face down, turns its cards over, and puts them in the album", () => {
    render(<Harness start={createSave()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open your free pack (1)" }));
    const dialog = screen.getByRole("dialog");
    const faceDown = () => screen.queryAllByRole("button", { name: "A card, face down" });
    expect(faceDown()).toHaveLength(PACK_SIZE);
    fireEvent.click(faceDown()[0]);
    expect(faceDown()).toHaveLength(PACK_SIZE - 1);
    fireEvent.click(screen.getByRole("button", { name: "Turn all over" }));
    expect(faceDown()).toHaveLength(0);
    // The focus goes on to Done, for a keyboard or a controller
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done" }));
    expect(dialog).toHaveTextContent("New");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /free pack/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /not found yet$/ }).length).toBeLessThan(
        CARDS.length,
    );
});

test("sells each pack for platinum tokens, and says why one can't be bought", () => {
    const raids = PACK_BY_ID.get("raids")!;
    const basic = PACK_BY_ID.get("adventurer")!;
    render(
        <Harness
            start={{ ...createSave(), cardPacks: 0, coins: 1e6, platinum: basic.price + 10 }}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Card shop" }));
    const buyRaids = screen.getByRole("button", { name: `Buy the ${packName(raids)}` });
    expect(buyRaids).toBeDisabled();
    const offer = buyRaids.closest(".ui-cards-offer") as HTMLElement;
    expect(
        within(offer).getByText(
            `You need ${(raids.price - basic.price - 10).toLocaleString("en")} more platinum tokens.`,
        ),
    ).toBeInTheDocument();
    expect(within(offer).getByText("Rare 75%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Buy the ${packName(basic)}` }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn all over" }));
    // No platinum tokens left for another
    expect(screen.queryByRole("button", { name: /Buy another/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: `Buy the ${packName(basic)}` })).toBeDisabled();
});

test("shuts the pack's window on Escape before leaving the screen", () => {
    const showScreen = vi.fn();
    render(<Harness start={createSave()} showScreen={showScreen} />);
    fireEvent.click(screen.getByRole("button", { name: "Open your free pack (1)" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "Escape", key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(showScreen).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: "Escape", key: "Escape" });
    expect(showScreen).toHaveBeenCalledWith("title");
});

test("shows a found card big in a window where there's no room beside the grid", () => {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: true })),
    );
    try {
        render(<Harness start={{ ...createSave(), cards: { [scimitar.id]: 1 } }} />);
        fireEvent.click(screen.getByRole("button", { name: scimitar.name() }));
        expect(screen.getByRole("dialog", { name: scimitar.name() })).toHaveTextContent(
            "Yours: Common x1",
        );
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        // A card not found yet has nothing to show
        fireEvent.click(screen.getAllByRole("button", { name: /not found yet$/ })[0]);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
        vi.unstubAllGlobals();
    }
});
