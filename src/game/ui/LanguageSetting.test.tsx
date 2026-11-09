// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getLang, setLang } from "../i18n";
import { LanguageSetting } from "./LanguageSetting";

afterEach(() => {
    cleanup();
    setLang("en");
});

// The button that shows the language picked and opens the list
const dropdown = () => document.querySelector<HTMLButtonElement>(".ui-language-current")!;
const open = () => act(() => void fireEvent.click(dropdown()));

describe("LanguageSetting", () => {
    it("shows the language picked, and the list only once it's opened", () => {
        render(<LanguageSetting />);
        expect(dropdown().textContent).toBe("English");
        expect(dropdown().getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByRole("listbox")).toBeNull();

        open();
        expect(dropdown().getAttribute("aria-expanded")).toBe("true");
        const options = screen.getAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual([
            "English",
            "Português (BR)Translated by Giordano Souza",
        ]);
        expect(options[0].getAttribute("aria-selected")).toBe("true");
        expect(screen.queryByRole("option", { name: /Español/ })).toBeNull();
    });

    it("credits the translator under the language's name, picked or not", () => {
        render(<LanguageSetting />);
        open();
        const credit = screen.getByText("Translated by Giordano Souza");
        expect(credit.className).toBe("ui-language-credit");
        expect(credit.previousElementSibling?.textContent).toBe("Português (BR)");

        act(() => void fireEvent.click(screen.getByRole("option", { name: /Português/ })));
        expect(dropdown().textContent).toContain("Translated by Giordano Souza");
    });

    it("switches the language when one's picked, and closes", () => {
        render(<LanguageSetting />);
        open();
        act(() => void fireEvent.click(screen.getByRole("option", { name: /Português/ })));
        expect(getLang()).toBe("pt-BR");
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(dropdown().textContent).toContain("Português (BR)");

        open();
        act(() => void fireEvent.click(screen.getByRole("option", { name: "English" })));
        expect(getLang()).toBe("en");
    });

    it("closes on Escape without the menu it's in hearing it, and on a press outside", () => {
        const menuKeys = vi.fn();
        window.addEventListener("keydown", menuKeys);
        try {
            render(<LanguageSetting />);
            open();
            act(() => void fireEvent.keyDown(window, { key: "Escape" }));
            expect(screen.queryByRole("listbox")).toBeNull();
            expect(menuKeys).not.toHaveBeenCalled();
            // Closed, Escape is the menu's again
            act(() => void fireEvent.keyDown(window, { key: "Escape" }));
            expect(menuKeys).toHaveBeenCalledTimes(1);

            open();
            act(() => void fireEvent.pointerDown(document.body));
            expect(screen.queryByRole("listbox")).toBeNull();
            expect(getLang()).toBe("en");
        } finally {
            window.removeEventListener("keydown", menuKeys);
        }
    });

    it("follows a language changed elsewhere", () => {
        render(<LanguageSetting />);
        act(() => setLang("pt-BR"));
        expect(dropdown().textContent).toContain("Português (BR)");
    });
});
