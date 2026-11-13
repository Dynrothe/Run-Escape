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

// The relays send current codes (the Cloudflare lobby maps a room's old one)
it.each([
    ["GB", "United Kingdom", 1],
    ["FR", "France", 19],
])("renders the flag for %s", (country, name, frame) => {
    render(<CountryFlag country={country} label="Server in" />);

    const flag = screen.getByRole("img", { name: `Server in ${name}` });
    expect(flag.tagName).toBe("IMG");
    expect(flag).toHaveAttribute("src", `/flags/${frame}.png`);
    expect(iconCache.requestFrame).toHaveBeenCalledWith(815, frame, expect.any(Function));
});

it("shows the letters for a country with no flag sprite", () => {
    render(<CountryFlag country="RS" label="Server in" />);

    expect(screen.getByRole("img", { name: "Server in Serbia" })).toHaveTextContent("RS");
    expect(iconCache.requestFrame).not.toHaveBeenCalled();
});

it("keeps an invalid code as text without crashing", () => {
    render(<CountryFlag country="?" label="Server in" />);

    expect(screen.getByRole("img", { name: "Server in ?" })).toHaveTextContent("?");
    expect(iconCache.requestFrame).not.toHaveBeenCalled();
});
