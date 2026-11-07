// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getLang, setLang } from "../i18n";
import { LanguageSetting } from "./LanguageSetting";

afterEach(() => {
    cleanup();
    setLang("en");
});

describe("LanguageSetting", () => {
    it("renders the language setting with all language options", () => {
        render(<LanguageSetting />);
        expect(screen.getByText("Language")).toBeDefined();
        expect(screen.getByRole("button", { name: "English" })).toBeDefined();
        expect(screen.getByRole("button", { name: "Português (BR)" })).toBeDefined();
        expect(screen.getByRole("button", { name: "Español" })).toBeDefined();
    });

    it("has the current language pressed and switches when clicked", () => {
        render(<LanguageSetting />);
        const enButton = screen.getByRole("button", { name: "English" });
        const ptButton = screen.getByRole("button", { name: "Português (BR)" });
        const esButton = screen.getByRole("button", { name: "Español" });

        expect(enButton.getAttribute("aria-pressed")).toBe("true");
        expect(ptButton.getAttribute("aria-pressed")).toBe("false");
        expect(esButton.getAttribute("aria-pressed")).toBe("false");

        act(() => {
            fireEvent.click(ptButton);
        });

        expect(getLang()).toBe("pt-BR");
        expect(enButton.getAttribute("aria-pressed")).toBe("false");
        expect(ptButton.getAttribute("aria-pressed")).toBe("true");

        act(() => {
            fireEvent.click(esButton);
        });

        expect(getLang()).toBe("es");
        expect(esButton.getAttribute("aria-pressed")).toBe("true");
        expect(ptButton.getAttribute("aria-pressed")).toBe("false");
    });

    it("blurs the button on click and responds to external setLang", () => {
        render(<LanguageSetting />);
        const ptButton = screen.getByRole("button", { name: "Português (BR)" });
        const blurSpy = vi.spyOn(ptButton, "blur");

        act(() => {
            fireEvent.click(ptButton);
        });

        expect(blurSpy).toHaveBeenCalled();

        act(() => {
            setLang("en");
        });

        const enButton = screen.getByRole("button", { name: "English" });
        expect(enButton.getAttribute("aria-pressed")).toBe("true");
    });
});
