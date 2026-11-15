// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DescriptionButton, zoomedRects } from "./DescriptionButton";

function pointer(button: HTMLElement, type: string, x = 20, pointerType = "touch") {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x });
    Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
    });
    fireEvent(button, event);
}

function renderButton() {
    const onUse = vi.fn();
    const view = render(
        <DescriptionButton itemId="gear" description="Gear stats" onUse={onUse}>
            Gear
        </DescriptionButton>,
    );
    const button = screen.getByRole("button", { name: "Gear" });
    button.setPointerCapture = vi.fn();
    return { ...view, button, onUse };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    zoomedRects.value = undefined;
});

test("a hold reads a tile without selecting it; a later tap still selects once", () => {
    const { button, onUse } = renderButton();
    pointer(button, "pointerdown");
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Gear stats");
    pointer(button, "pointerup");
    fireEvent.click(button);
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    pointer(button, "pointerdown");
    pointer(button, "pointerup");
    fireEvent.click(button);
    expect(onUse).toHaveBeenCalledTimes(1);
});

test.each(["scroll", "blur", "Escape"])("%s dismisses and cancels a held tile", (event) => {
    const { button, onUse } = renderButton();
    pointer(button, "pointerdown");
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    if (event === "Escape") {
        fireEvent.keyDown(window, { key: event });
    } else {
        fireEvent(window, new Event(event));
    }
    pointer(button, "pointerup");
    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
});

test("dragging a tile before the hold cancels selection and its description", () => {
    const { button, onUse } = renderButton();
    pointer(button, "pointerdown");
    pointer(button, "pointermove", 40);
    act(() => vi.advanceTimersByTime(500));
    pointer(button, "pointerup", 40);
    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
});

test("unmount clears the hold and click-suppression timers", () => {
    const { button, unmount } = renderButton();
    pointer(button, "pointerdown");
    pointer(button, "pointerup");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
});

test("descriptions escape clipped parents and stay within the viewport at UI zoom", () => {
    zoomedRects.value = true;
    const { button } = renderButton();
    button.style.setProperty("--ui-scale", "2");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
    ) {
        return this === button
            ? new DOMRect(window.innerWidth - 40, window.innerHeight - 40, 30, 30)
            : new DOMRect(0, 0, 520, 160);
    });
    fireEvent.focus(button);
    const tip = screen.getByRole("tooltip");
    expect(tip.parentElement).toBe(document.body);
    expect(tip.style.zoom).toBe("2");
    expect(parseFloat(tip.style.left) * 2 + 520).toBe(window.innerWidth - 12);
    expect(parseFloat(tip.style.top) * 2 + 160).toBe(window.innerHeight - 46);
});

test("unscaled browser rectangles still keep zoomed descriptions on screen", () => {
    zoomedRects.value = false;
    const { button } = renderButton();
    button.style.setProperty("--ui-scale", "2");
    button.style.zoom = "2";
    const computedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
        const style = computedStyle(element);
        Object.defineProperty(style, "zoom", {
            value: element === button || element.getAttribute("role") === "tooltip" ? "2" : "1",
        });
        return style;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
    ) {
        return this === button
            ? new DOMRect(window.innerWidth / 2 - 40, window.innerHeight / 2 - 40, 30, 30)
            : new DOMRect(0, 0, 260, 80);
    });
    fireEvent.focus(button);
    const tip = screen.getByRole("tooltip");
    expect(parseFloat(tip.style.left) * 2 + 520).toBe(window.innerWidth - 12);
    expect(parseFloat(tip.style.top) * 2 + 160).toBe(window.innerHeight - 86);
});

test("whether rectangles include zoom is measured once, on a zoomed element", () => {
    const { button } = renderButton();
    const probes: HTMLElement[] = [];
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
    ) {
        if (this.style.zoom === "2") {
            probes.push(this);
            return new DOMRect(0, 0, 20, 20);
        }
        return new DOMRect(0, 0, 30, 30);
    });
    fireEvent.focus(button);
    fireEvent.blur(button);
    fireEvent.focus(button);
    expect(zoomedRects.value).toBe(true);
    expect(probes).toHaveLength(1);
    expect(probes[0].isConnected).toBe(false);
});

test("the focus a tap gives doesn't open its description, but keys still do", () => {
    const { button, onUse } = renderButton();
    pointer(button, "pointerdown");
    pointer(button, "pointerup");
    expect(onUse).toHaveBeenCalledTimes(1);
    fireEvent.focus(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.blur(button);
    act(() => vi.advanceTimersByTime(400));
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
});

test("a scroll ends a hover, but a focused tile keeps its description", () => {
    const { button } = renderButton();
    pointer(button, "pointerover", 20, "mouse");
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent(window, new Event("scroll"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    // A controller focuses a tile, then scrolls its list to it
    fireEvent.focus(button);
    fireEvent(window, new Event("scroll"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
});

test("a button listens on the window only while it's described or pressed", () => {
    const listen = vi.spyOn(window, "addEventListener");
    const { button } = renderButton();
    const types = () => listen.mock.calls.map(([type]) => type);
    expect(types()).not.toContain("scroll");
    expect(types()).not.toContain("keydown");
    fireEvent.focus(button);
    expect(types()).toContain("scroll");
    expect(types()).toContain("keydown");
});
