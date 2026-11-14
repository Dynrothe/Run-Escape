// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { releaseFocus, resetFocusSource, useMenuKeys } from "./menuKeys";

afterEach(() => {
    cleanup();
    resetFocusSource();
    document.body.innerHTML = "";
    delete document.documentElement.dataset.input;
    vi.useRealTimers();
});

function Screen(props: Parameters<typeof useMenuKeys>[0]): JSX.Element {
    useMenuKeys(props);
    return (
        <>
            <button>A button</button>
            <input aria-label="A box" />
        </>
    );
}

function pressEnter(target: Element = document.body): void {
    fireEvent.keyDown(target, { code: "Enter", key: "Enter" });
}

test("Escape goes back", () => {
    const onBack = vi.fn();
    render(<Screen onBack={onBack} />);
    fireEvent.keyDown(document.body, { code: "Escape" });
    expect(onBack).toHaveBeenCalledOnce();
});

test("Escape in a box to type in is the box's", () => {
    const onBack = vi.fn();
    render(<Screen onBack={onBack} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { code: "Escape" });
    expect(onBack).not.toHaveBeenCalled();
});

test("Escape shuts an item's description before it goes back", () => {
    const onBack = vi.fn();
    render(<Screen onBack={onBack} />);
    const tip = document.createElement("div");
    tip.className = "ui-description-tip";
    document.body.appendChild(tip);
    fireEvent.keyDown(document.body, { code: "Escape" });
    expect(onBack).not.toHaveBeenCalled();
});

test("nothing while the panel saying nothing's being saved is up", () => {
    const onBack = vi.fn();
    render(<Screen onBack={onBack} />);
    const panel = document.createElement("div");
    panel.className = "ui-save-block";
    document.body.appendChild(panel);
    fireEvent.keyDown(document.body, { code: "Escape" });
    expect(onBack).not.toHaveBeenCalled();
});

test("a held key doesn't count", () => {
    const onBack = vi.fn();
    render(<Screen onBack={onBack} />);
    fireEvent.keyDown(document.body, { code: "Escape", repeat: true });
    expect(onBack).not.toHaveBeenCalled();
});

test("Enter presses the screen's main button", () => {
    const onConfirm = vi.fn();
    render(<Screen onConfirm={onConfirm} />);
    pressEnter();
    expect(onConfirm).toHaveBeenCalledOnce();
});

test("a controller's Enter doesn't: its south button presses what's highlighted", () => {
    const onConfirm = vi.fn();
    render(<Screen onConfirm={onConfirm} />);
    document.documentElement.dataset.input = "pad";
    pressEnter();
    expect(onConfirm).not.toHaveBeenCalled();
});

test("Enter on a button reached by Tab is that button's", () => {
    const onConfirm = vi.fn();
    render(<Screen onConfirm={onConfirm} />);
    fireEvent.keyDown(document.body, { code: "Tab" });
    pressEnter(screen.getByRole("button"));
    expect(onConfirm).not.toHaveBeenCalled();
});

test("Enter on a button that was only clicked is the screen's", () => {
    const onConfirm = vi.fn();
    render(<Screen onConfirm={onConfirm} />);
    fireEvent.keyDown(document.body, { code: "Tab" });
    fireEvent.pointerDown(screen.getByRole("button"));
    pressEnter(screen.getByRole("button"));
    expect(onConfirm).toHaveBeenCalledOnce();
});

test("keys ignored while the guard's on, then answered", () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    render(<Screen onBack={onBack} guardMs={600} />);
    fireEvent.keyDown(document.body, { code: "Escape" });
    expect(onBack).not.toHaveBeenCalled();
    vi.advanceTimersByTime(601);
    fireEvent.keyDown(document.body, { code: "Escape" });
    expect(onBack).toHaveBeenCalledOnce();
});

describe("releaseFocus", () => {
    function Button(): JSX.Element {
        return <button onClick={releaseFocus}>Press</button>;
    }

    test("a click gives the keys back to the screen", () => {
        render(<Button />);
        const button = screen.getByRole("button");
        button.focus();
        fireEvent.click(button, { detail: 1 });
        expect(button).not.toHaveFocus();
    });

    test("a press from the keyboard stays where it is", () => {
        render(<Button />);
        const button = screen.getByRole("button");
        button.focus();
        fireEvent.click(button, { detail: 0 });
        expect(button).toHaveFocus();
    });
});
