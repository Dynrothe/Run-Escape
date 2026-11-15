// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { DamageView } from "../client/GameStore";
import { CombatReport } from "./CombatBreakdown";
import { PauseChat } from "./PauseChat";

afterEach(cleanup);

const totals = {
    damageDealt: 900,
    highestHit: 32,
    damageTaken: 24,
    healed: 21,
    damageBlocked: 77,
    revives: { left: 1, given: 2, coop: true },
};

function sources(count: number): DamageView[] {
    return Array.from({ length: count }, (_, i) => ({
        name: `Weapon ${i + 1}`,
        damage: 100 - i * 10,
        kills: 0,
        color: "#fff",
    }));
}

function ranks(count: number): string[] {
    const view = render(
        <CombatReport kinds={[]} sources={sources(count)} kills={[]} totals={totals} />,
    );
    return [...view.container.querySelectorAll(".ui-cr-rank > li")].map((row) => {
        const kinds = ["gold", "silver", "bronze", "worst"].filter((kind) =>
            row.classList.contains(`ui-cr-rank-${kind}`),
        );
        return kinds.join("") || "-";
    });
}

test("the top two weapons wear a medal, only the best with four, the top three past four", () => {
    expect(ranks(3)).toEqual(["gold", "silver", "worst"]);
    cleanup();
    expect(ranks(4)).toEqual(["gold", "-", "-", "worst"]);
    cleanup();
    expect(ranks(5)).toEqual(["gold", "silver", "bronze", "-", "worst"]);
});

test("the worst weapon has a plank and falling lights, but never when it's one of the medals", () => {
    const view = render(
        <CombatReport kinds={[]} sources={sources(5)} kills={[]} totals={totals} />,
    );
    const worst = view.container.querySelectorAll(".ui-cr-rank-worst");
    expect(worst).toHaveLength(1);
    expect(worst[0].querySelector(".ui-cr-rank-plank")).not.toBeNull();
    expect(view.container.querySelectorAll(".ui-cr-rank-medal .ui-sparks")).toHaveLength(3);
    cleanup();
    const two = render(<CombatReport kinds={[]} sources={sources(2)} kills={[]} totals={totals} />);
    expect(two.container.querySelector(".ui-cr-rank-worst")).toBeNull();
    cleanup();
    const one = render(<CombatReport kinds={[]} sources={sources(1)} kills={[]} totals={totals} />);
    expect(one.container.querySelectorAll(".ui-cr-rank-gold")).toHaveLength(1);
    expect(one.container.querySelector(".ui-cr-rank-worst")).toBeNull();
});

test("zero damage has no MVP medal, star or plank", () => {
    const rows = sources(3).map((source) => ({ ...source, damage: 0 }));
    const view = render(
        <CombatReport
            kinds={[]}
            sources={rows}
            kills={[]}
            totals={{ ...totals, damageDealt: 0, highestHit: 0 }}
        />,
    );
    expect(view.container.querySelector(".ui-cr-rank-medal")).toBeNull();
    expect(view.container.querySelector(".ui-cr-rank-worst")).toBeNull();
    expect(
        [...view.container.querySelectorAll(".ui-cr-rank-no")].map((place) => place.textContent),
    ).toEqual(["1", "2", "3"]);
});

test("the tiles have icons, the damage blocked and the revives left", () => {
    const view = render(<CombatReport kinds={[]} sources={[]} kills={[]} totals={totals} />);
    const tiles = [...view.container.querySelectorAll(".ui-cr-tile")];
    expect(tiles.map((tile) => tile.querySelector(".ui-cr-tile-name")?.textContent)).toEqual([
        "Damage dealt",
        "Biggest hit",
        "Damage taken",
        "Damage blocked",
        "Hitpoints healed",
        "Revives left",
    ]);
    expect(
        tiles.every((tile) => tile.querySelector(".ui-cr-tile-icon .ui-icon, .ui-cr-tile-icon")),
    ).toBe(true);
    expect(tiles[5].querySelector(".ui-cr-tile-value")?.textContent).toBe("1");
    expect(tiles[5].querySelector(".ui-cr-tile-sub")?.textContent).toBe("2 given");
});

test("with no revive left the tile is the red last stand", () => {
    const view = render(
        <CombatReport
            kinds={[]}
            sources={[]}
            kills={[]}
            totals={{ ...totals, revives: { left: 0, given: 0, coop: false } }}
        />,
    );
    const tile = view.container.querySelector(".ui-cr-tile-revives")!;
    expect(tile.classList.contains("ui-cr-tile-alert")).toBe(true);
    expect(tile.querySelector(".ui-cr-tile-name")?.textContent).toBe("Last stand");
});

test("recent messages are a chat: oldest first, with the run's clock and who said it", () => {
    const view = render(
        <PauseChat
            log={[
                { text: "Power-up: Cannon", seconds: 187, source: "powerup" },
                { text: "Ada went down!", seconds: 95, source: "player:Ada" },
                { text: "The boss wakes", seconds: 5, source: "boss" },
                { text: "Welcome", source: undefined },
            ]}
        />,
    );
    const lines = [...view.container.querySelectorAll(".ui-chat-line")].map(
        (line) => line.textContent,
    );
    expect(lines).toEqual([
        "Game:Welcome",
        "[0:05]Boss:The boss wakes",
        "[1:35]Ada:Ada went down!",
        "[3:07]Power-up:Power-up: Cannon",
    ]);
    expect(view.container.querySelector(".ui-chat-source-player")).not.toBeNull();
});

function mouseOver(element: Element): void {
    const event = new MouseEvent("pointerover", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(element, event);
}

test("the last stand says it means no revives left", () => {
    const view = render(
        <CombatReport
            kinds={[]}
            sources={[]}
            kills={[]}
            totals={{ ...totals, revives: { left: 0, given: 0, coop: false } }}
        />,
    );
    const tile = view.container.querySelector(".ui-cr-tile-revives")!;
    expect(tile.querySelector(".ui-cr-tile-sub")?.textContent).toBe("No revives left");
    mouseOver(tile);
    expect(screen.getByRole("tooltip").textContent).toContain(
        "No revive left: the next fall is the end.",
    );
});

test("the mouse over a weapon's row says what it is, where it stands and its recipe", () => {
    const weapon: DamageView = {
        name: "Bronze scimitar",
        iconObjId: 1321,
        color: "#fff",
        damage: 100,
        kills: 3,
        about: {
            examine: "A vicious, curved blade.",
            form: {
                kind: "evolve",
                text: "Can evolve into Abyssal whip, with Piety and its last level.",
            },
            level: 8,
            maxLevel: 8,
            evolution: {
                passive: "Piety",
                passiveIconObjId: 1,
                into: "Abyssal whip",
                intoIconObjId: 4151,
                maxed: true,
                hasPassive: false,
                ready: false,
            },
        },
    };
    const other: DamageView = { name: "Recoil", damage: 5, kills: 0 };
    const view = render(
        <CombatReport kinds={[]} sources={[weapon, other]} kills={[]} totals={totals} />,
    );
    const rows = view.container.querySelectorAll(".ui-cr-rank-row");
    // Only a weapon has a tooltip
    expect(rows[1].classList.contains("ui-breakdown-anchor")).toBe(false);
    mouseOver(rows[0]);
    const tip = screen.getByRole("tooltip");
    expect(tip.querySelector(".ui-examine-name")?.textContent).toBe("Bronze scimitar");
    expect(tip.querySelector(".ui-examine-text")?.textContent).toBe("A vicious, curved blade.");
    expect(tip.querySelector(".ui-examine-form-evolve")).not.toBeNull();
    expect(tip.querySelector(".ui-recipe-title b")?.textContent).toBe("Abyssal whip");
    const needs = [...tip.querySelectorAll(".ui-recipe-need")];
    expect(needs.map((need) => need.classList.contains("ui-recipe-met"))).toEqual([true, false]);
});

test("the worst one's place is a plank, and the plank and the star each say something", () => {
    const view = render(
        <CombatReport kinds={[]} sources={sources(5)} kills={[]} totals={totals} />,
    );
    const places = [...view.container.querySelectorAll(".ui-cr-rank-no")];
    expect(places[0].textContent).toBe("★");
    expect(places[2].textContent).toBe("3");
    // The plank is in place of the number
    expect(places[4].textContent).toBe("");
    expect(places[4].querySelector(".ui-cr-rank-plank")).not.toBeNull();
    // Only the star and the plank have a tooltip
    expect(places.map((place) => place.classList.contains("ui-breakdown-anchor"))).toEqual([
        true,
        false,
        false,
        false,
        true,
    ]);
    mouseOver(places[0]);
    expect(screen.getByRole("tooltip").querySelector(".ui-examine-name")?.textContent).toBe("MVP");
    cleanup();
    const again = render(
        <CombatReport kinds={[]} sources={sources(5)} kills={[]} totals={totals} />,
    );
    mouseOver(again.container.querySelectorAll(".ui-cr-rank-no")[4]);
    expect(screen.getByRole("tooltip").querySelector(".ui-examine-name")?.textContent).toBe(
        "Plank",
    );
});

test("each tile says what its number is", () => {
    const view = render(<CombatReport kinds={[]} sources={[]} kills={[]} totals={totals} />);
    const tiles = [...view.container.querySelectorAll(".ui-cr-tile")];
    for (const tile of tiles) {
        mouseOver(tile);
        const tip = screen.getByRole("tooltip");
        expect(tip.querySelector(".ui-examine-name")?.textContent).toBe(
            tile.querySelector(".ui-cr-tile-name")?.textContent,
        );
        expect(tip.querySelector(".ui-examine-text")?.textContent).not.toMatch(/^combat./);
        const out = new MouseEvent("pointerout", { bubbles: true, cancelable: true });
        Object.defineProperty(out, "pointerType", { value: "mouse" });
        fireEvent(tile, out);
    }
});
