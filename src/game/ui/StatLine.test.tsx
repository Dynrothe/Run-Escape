// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { iconCache } from "./ItemIcon";
import { StatLine } from "./StatLine";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("StatLine", () => {
    it("renders a stat with its icon and identical text content", () => {
        const { container } = render(<StatLine text="+5% damage" />);
        const line = container.querySelector(".ui-stat-line");
        expect(line).not.toBeNull();
        expect(line?.textContent).toBe("+5% damage");
        expect(screen.getByText("+5% damage")).toBeInTheDocument();
        expect(container.querySelector(".ui-icon")).not.toBeNull();
        expect(container.querySelector(".ui-stat-spacer")).toBeNull();
    });

    it("renders a spacer when there is no icon for the text", () => {
        const { container } = render(<StatLine text="Rune scimitar" />);
        const line = container.querySelector(".ui-stat-line");
        expect(line).not.toBeNull();
        expect(line?.textContent).toBe("Rune scimitar");
        expect(screen.getByText("Rune scimitar")).toBeInTheDocument();
        const spacer = container.querySelector(".ui-stat-spacer") as HTMLElement | null;
        expect(spacer).not.toBeNull();
        expect(spacer?.style.width).toBe("18px");
        expect(spacer?.style.height).toBe("16px");
        expect(container.querySelector(".ui-icon")).toBeNull();
    });

    it("scales the spacer with the given size", () => {
        const { container } = render(<StatLine text="Plain line" size={32} />);
        const spacer = container.querySelector(".ui-stat-spacer") as HTMLElement | null;
        expect(spacer).not.toBeNull();
        expect(spacer?.style.width).toBe("36px");
        expect(spacer?.style.height).toBe("32px");
    });

    // A skill icon is a sprite alone: one the cache hasn't got shows nothing,
    // rather than asking for an item that doesn't exist
    it("never asks for an item for a sprite icon", () => {
        vi.spyOn(iconCache, "getSprite").mockReturnValue("");
        const request = vi.spyOn(iconCache, "request");
        const requestSprite = vi.spyOn(iconCache, "requestSprite");
        render(<StatLine text="+24% ranged damage" />);
        expect(requestSprite).toHaveBeenCalledWith(200, expect.any(Function));
        expect(request).not.toHaveBeenCalled();
    });

    it("renders children in place of the text, with the text's icon", () => {
        const { container } = render(
            <StatLine text="Damage 10 → 13" className="ui-choice-stat">
                <b>Damage</b> 10 → 13
            </StatLine>,
        );
        const line = container.querySelector(".ui-stat-line.ui-choice-stat");
        expect(line?.querySelector("b")?.textContent).toBe("Damage");
        expect(line?.textContent).toBe("Damage 10 → 13");
        expect(line?.querySelector(".ui-icon")).not.toBeNull();
    });

    it("renders stats with item objIds and interface sprites", () => {
        const coin = render(<StatLine text="+5% coins" />);
        expect(coin.container.querySelector(".ui-icon")).not.toBeNull();
        expect(coin.container.textContent).toBe("+5% coins");

        const ranged = render(<StatLine text="+24% ranged damage" />);
        expect(ranged.container.querySelector(".ui-icon")).not.toBeNull();
        expect(ranged.container.textContent).toBe("+24% ranged damage");
    });
});
