// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";

import { CountryFlag } from "./CountryFlag";
import { iconCache } from "./ItemIcon";

vi.mock("./ItemIcon", () => ({
    iconCache: {
        getFrame: vi.fn((_sprite: number, frame: number) => `/flags/${frame}.png`),
        requestFrame: vi.fn(),
    },
}));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

it.each([
    ["UK", "United Kingdom", 1],
    ["GB", "United Kingdom", 1],
    ["FX", "France", 19],
])("renders the flag for a saved %s country", (country, name, frame) => {
    render(<CountryFlag country={country} label="Server in" />);

    const flag = screen.getByRole("img", { name: `Server in ${name}` });
    expect(flag.tagName).toBe("IMG");
    expect(flag).toHaveAttribute("src", `/flags/${frame}.png`);
    expect(iconCache.requestFrame).toHaveBeenCalledWith(815, frame, expect.any(Function));
});

it("keeps the canonical letters when the country has no flag sprite", () => {
    render(<CountryFlag country="YU" label="Server in" />);

    expect(screen.getByRole("img", { name: "Server in Serbia" })).toHaveTextContent("RS");
    expect(iconCache.requestFrame).not.toHaveBeenCalled();
});

it("keeps an invalid code as text without crashing", () => {
    render(<CountryFlag country="?" label="Server in" />);

    expect(screen.getByRole("img", { name: "Server in ?" })).toHaveTextContent("?");
    expect(iconCache.requestFrame).not.toHaveBeenCalled();
});
