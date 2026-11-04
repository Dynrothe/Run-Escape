// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { InventorySlotView } from "../client/GameStore";
import { getItemView } from "../client/ItemViews";
import { getItem } from "../content/items";
import { InventoryItem } from "./InventoryItem";

const slot = { item: getItemView(getItem("shark")), count: 2 };

function pointer(
    button: HTMLElement,
    type: string,
    { id = 1, x = 20, y = 20, pointerType = "touch" } = {},
) {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
    });
    Object.defineProperties(event, {
        pointerId: { value: id },
        pointerType: { value: pointerType },
    });
    fireEvent(button, event);
}

function renderItem(touch = true) {
    const onUse = vi.fn();
    const view = render(<InventoryItem slot={slot} index={0} touch={touch} onUse={onUse} />);
    const button = screen.getByRole("button", { name: slot.item.name });
    button.setPointerCapture = vi.fn();
    return { ...view, button, onUse };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

test("hover and keyboard focus show exactly the description used by the reward card", () => {
    const { button, onUse } = renderItem(false);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    pointer(button, "pointerover", { pointerType: "mouse" });
    const tip = screen.getByRole("tooltip");
    expect([...tip.children].map((line) => line.textContent)).toEqual([
        slot.item.name,
        ...slot.item.lines,
    ]);
    expect(button).toHaveAttribute("aria-describedby", tip.id);
    pointer(button, "pointerout", { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onUse).toHaveBeenCalledTimes(1);
});

test.each([true, false])("a 500 ms hold inspects without consuming (touch layout: %s)", (touch) => {
    const { button, onUse } = renderItem(touch);
    pointer(button, "pointerdown");
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toHaveTextContent(slot.item.lines[0]);
    pointer(button, "pointerup");
    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
});

test.each([true, false])(
    "a quick touch uses an item once, not on press (touch layout: %s)",
    (touch) => {
        const { button, onUse } = renderItem(touch);
        pointer(button, "pointerdown", { id: 2 });
        expect(button.setPointerCapture).toHaveBeenCalledWith(2);
        expect(onUse).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(100));
        pointer(button, "pointerup", { id: 2 });
        // Both the browser and SharedTaps can send a click after pointerup.
        fireEvent.click(button);
        fireEvent.click(button, { detail: 0 });
        expect(onUse).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    },
);

test.each(["pointercancel", "lostpointercapture", "blur", "move"])(
    "%s cancels both the hold and use",
    (type) => {
        const { button, onUse } = renderItem();
        pointer(button, "pointerdown");
        if (type === "blur") {
            fireEvent(window, new Event("blur"));
        } else if (type === "move") {
            pointer(button, "pointermove", { x: 40 });
        } else {
            pointer(button, type);
        }
        act(() => vi.advanceTimersByTime(600));
        pointer(button, "pointerup");
        fireEvent.click(button);
        expect(onUse).not.toHaveBeenCalled();
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    },
);

test("a second finger cannot end the first finger's hold", () => {
    const { button, onUse } = renderItem();
    pointer(button, "pointerdown");
    pointer(button, "pointerdown", { id: 2 });
    pointer(button, "pointercancel", { id: 2 });
    pointer(button, "pointerup", { id: 2 });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    pointer(button, "pointerup");
    expect(onUse).not.toHaveBeenCalled();
});

test("releasing outside the tap area never consumes the item", () => {
    const { button, onUse } = renderItem();
    pointer(button, "pointerdown");
    pointer(button, "pointerup", { x: 100 });
    expect(onUse).not.toHaveBeenCalled();
});

test.each(["replace", "empty", "disable", "unmount"])(
    "%s cancels an outstanding hold",
    (change) => {
        const { button, onUse, rerender, unmount } = renderItem();
        pointer(button, "pointerdown");
        if (change === "unmount") {
            unmount();
        } else {
            const next: InventorySlotView =
                change === "empty"
                    ? null
                    : change === "replace"
                      ? { item: getItemView(getItem("anglerfish")), count: 1 }
                      : slot;
            rerender(
                <InventoryItem
                    slot={next}
                    index={0}
                    touch
                    onUse={onUse}
                    disabled={change === "disable"}
                />,
            );
        }
        act(() => vi.advanceTimersByTime(600));
        pointer(button, "pointerup");
        expect(onUse).not.toHaveBeenCalled();
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    },
);

test("empty slots are disabled and have no description", () => {
    render(<InventoryItem slot={null} index={1} onUse={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Empty item slot 2" })).toBeDisabled();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
