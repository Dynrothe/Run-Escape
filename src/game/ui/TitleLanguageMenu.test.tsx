// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLang, setLang } from "../i18n";
import { TitleLanguageMenu } from "./TitleLanguageMenu";

describe("TitleLanguageMenu", () => {
    beforeEach(() => {
        setLang("en");
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        setLang("en");
        vi.useRealTimers();
    });

    it("renders the language button without opening the menu initially", () => {
        render(<TitleLanguageMenu />);
        const btn = screen.getByRole("button", { name: "Language" });
        expect(btn).toBeInTheDocument();
        expect(btn.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByText("English")).toBeNull();
    });

    it("opens the language tooltip menu on hover (mouseEnter) and transitions out on mouseLeave", () => {
        const { container } = render(<TitleLanguageMenu />);
        const wrapper = container.querySelector(".ui-title-language-wrapper")!;
        expect(wrapper).toBeInTheDocument();

        // Hover in
        act(() => {
            fireEvent.mouseEnter(wrapper);
        });

        const btn = screen.getByRole("button", { name: "Language" });
        expect(btn.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByText("English")).toBeInTheDocument();
        expect(screen.getByText("Português (BR)")).toBeInTheDocument();

        // Hover out
        act(() => {
            fireEvent.mouseLeave(wrapper);
        });

        // Still open during leave delay
        expect(screen.getByText("English")).toBeInTheDocument();

        // Advance past delay and animation duration
        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(screen.queryByText("English")).toBeNull();
    });

    it("toggles open/close on button click with smooth exit", () => {
        render(<TitleLanguageMenu />);
        const btn = screen.getByRole("button", { name: "Language" });

        act(() => {
            fireEvent.click(btn);
        });
        expect(screen.getByText("English")).toBeInTheDocument();

        act(() => {
            fireEvent.click(btn);
        });
        // Starts closing transition
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(screen.queryByText("English")).toBeNull();
    });

    it("switches language when an option is clicked, shows active check and transitions out", () => {
        render(<TitleLanguageMenu />);
        const btn = screen.getByRole("button", { name: "Language" });

        act(() => {
            fireEvent.click(btn);
        });

        const ptOption = screen.getByRole("button", { name: /Português/i });
        act(() => {
            fireEvent.click(ptOption);
        });

        expect(getLang()).toBe("pt-BR");

        // Finished exit animation
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(screen.queryByText("English")).toBeNull();
    });

    it("stays closed when the browser re-fires mouseenter after a pick", () => {
        const { container } = render(<TitleLanguageMenu />);
        const wrapper = container.querySelector(".ui-title-language-wrapper")!;

        act(() => {
            fireEvent.mouseEnter(wrapper);
        });
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: /Português/i }));
        });
        // The view transition makes the pointer leave and enter again
        act(() => {
            fireEvent.mouseLeave(wrapper);
            fireEvent.mouseEnter(wrapper);
            vi.advanceTimersByTime(500);
        });
        expect(screen.queryByText("English")).toBeNull();

        // Hover works again after the button is clicked
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Idioma" }));
        });
        expect(screen.getByText("English")).toBeInTheDocument();
    });

    it("closes on Escape key with exit transition", () => {
        render(<TitleLanguageMenu />);
        const btn = screen.getByRole("button", { name: "Language" });

        act(() => {
            fireEvent.click(btn);
        });
        expect(screen.getByText("English")).toBeInTheDocument();

        act(() => {
            fireEvent.keyDown(window, { key: "Escape" });
            vi.advanceTimersByTime(200);
        });
        expect(screen.queryByText("English")).toBeNull();
    });
});
