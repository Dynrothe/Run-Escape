// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLang } from "../i18n";
import { LanguageNotice } from "./LanguageNotice";

const NOTICE = /English is the only officially supported language/;

// A storage of its own (Node 25 and up hide jsdom's)
const stored = new Map<string, string>();
beforeEach(() => {
    stored.clear();
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
    });
    setLang("en");
});
afterEach(() => {
    cleanup();
    setLang("en");
    vi.unstubAllGlobals();
});

describe("LanguageNotice", () => {
    it("says nothing in English", () => {
        render(<LanguageNotice />);
        expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it("comes up the first time another language is picked, with its translator", () => {
        render(<LanguageNotice />);
        act(() => setLang("pt-BR"));
        expect(screen.getByText(NOTICE)).toBeDefined();
        expect(screen.getByText(/Português \(BR\) was translated by Giordano Souza/)).toBeDefined();
    });

    it("goes once it's read, and doesn't come back", () => {
        setLang("pt-BR");
        render(<LanguageNotice />);
        act(() => {
            fireEvent.click(screen.getByRole("button"));
        });
        expect(screen.queryByText(NOTICE)).toBeNull();
        act(() => setLang("en"));
        act(() => setLang("pt-BR"));
        expect(screen.queryByText(NOTICE)).toBeNull();
        // Nor on the next load
        cleanup();
        render(<LanguageNotice />);
        expect(screen.queryByText(NOTICE)).toBeNull();
    });
});
