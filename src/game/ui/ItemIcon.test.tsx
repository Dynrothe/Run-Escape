// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";

import { IconCache, ItemIcon, SpriteIcon, iconCache } from "./ItemIcon";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ItemIcon", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    test("keeps the coin icon visible while a new stack size loads", () => {
        expect.hasAssertions();
        const previous = "data:image/png;base64,previous";
        const next = "data:image/png;base64,next";
        vi.spyOn(iconCache, "get").mockImplementation((objId, count) =>
            objId === 995 && count === 1 ? previous : undefined,
        );
        let loaded: ((url: string) => void) | undefined;
        vi.spyOn(iconCache, "request").mockImplementation((_objId, count, callback) => {
            if (count === 1000) {
                loaded = callback;
            }
        });
        const { container, rerender } = render(<ItemIcon objId={995} count={1} />);
        expect(container.querySelector("img")).toHaveAttribute("src", previous);
        rerender(<ItemIcon objId={995} count={1000} />);
        expect(container.querySelector("img")).toHaveAttribute("src", previous);
        act(() => loaded!(next));
        expect(container.querySelector("img")).toHaveAttribute("src", next);
    });

    test("does not keep a coin icon when the item changes", () => {
        expect.hasAssertions();
        vi.spyOn(iconCache, "get").mockImplementation((objId) =>
            objId === 995 ? "data:image/png;base64,coins" : undefined,
        );
        vi.spyOn(iconCache, "request").mockImplementation(() => {});
        const { container, rerender } = render(<ItemIcon objId={995} />);
        expect(container.querySelector("img")).not.toBeNull();
        rerender(<ItemIcon objId={4151} />);
        expect(container.querySelector("img")).toBeNull();
    });

    test("shows the item when the cache hasn't got its sprite", () => {
        const scroll = "data:image/png;base64,scroll";
        let sprite: string | undefined;
        let spriteLoaded: ((url: string) => void) | undefined;
        let itemLoaded: ((url: string) => void) | undefined;
        vi.spyOn(iconCache, "getSprite").mockImplementation(() => sprite);
        vi.spyOn(iconCache, "get").mockImplementation(() => undefined);
        vi.spyOn(iconCache, "requestSprite").mockImplementation((_id, callback) => {
            spriteLoaded = callback;
        });
        const request = vi
            .spyOn(iconCache, "request")
            .mockImplementation((_id, _count, callback) => {
                itemLoaded = callback;
            });
        const { container } = render(<ItemIcon objId={21034} spriteId={1420} />);
        expect(request).not.toHaveBeenCalled();
        sprite = "";
        act(() => spriteLoaded!(""));
        expect(request).toHaveBeenCalledWith(21034, 1, expect.any(Function));
        act(() => itemLoaded!(scroll));
        expect(container.querySelector("img")).toHaveAttribute("src", scroll);
    });
});

describe("SpriteIcon", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    test("loads a standalone sprite without requesting an item model", () => {
        vi.spyOn(iconCache, "getFrame").mockReturnValue(undefined);
        let loaded: ((url: string) => void) | undefined;
        const request = vi
            .spyOn(iconCache, "requestFrame")
            .mockImplementation((_id, _frame, callback) => {
                loaded = callback;
            });
        const itemRequest = vi.spyOn(iconCache, "request").mockImplementation(() => {});
        const { container } = render(<SpriteIcon spriteId={156} size={22} />);
        expect(container.querySelector("img")).toBeNull();
        expect(request).toHaveBeenCalledWith(156, 0, expect.any(Function));
        act(() => loaded!("data:image/png;base64,head"));
        const image = container.querySelector("img");
        expect(image).toHaveAttribute("src", "data:image/png;base64,head");
        expect(image).toHaveAttribute("width", "22");
        expect(image).toHaveAttribute("height", "22");
        expect(image).toHaveAttribute("alt", "");
        expect(itemRequest).not.toHaveBeenCalled();
    });

    test("changing slots never shows the previous or late-loading sprite", () => {
        vi.spyOn(iconCache, "getFrame").mockImplementation((id) =>
            id === 156 ? "data:image/png;base64,head" : undefined,
        );
        const callbacks = new Map<number, (url: string) => void>();
        vi.spyOn(iconCache, "requestFrame").mockImplementation((id, _frame, callback) => {
            callbacks.set(id, callback);
        });
        const { container, rerender } = render(<SpriteIcon spriteId={156} />);
        expect(container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,head");
        rerender(<SpriteIcon spriteId={157} />);
        expect(container.querySelector("img")).toBeNull();
        act(() => callbacks.get(156)!("data:image/png;base64,late-head"));
        expect(container.querySelector("img")).toBeNull();
        act(() => callbacks.get(157)!("data:image/png;base64,cape"));
        expect(container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,cape");
    });
});

describe("IconCache", () => {
    test("icons whose load failed are asked for again next time", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        // The first batch's worker fails; later ones are still drawing
        const queueLoad = vi
            .fn()
            .mockRejectedValueOnce(new Error("worker gone"))
            .mockReturnValue(new Promise(() => {}));
        const cache = new IconCache();
        cache.setWorkerPool({ queueLoad } as never);
        const callback = vi.fn();
        cache.request(4151, 1, callback);
        cache.requestSprite(7, callback);
        await tick();
        await tick();
        // Items and sprites each went to the worker once
        expect(queueLoad).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledTimes(1);
        expect(callback).not.toHaveBeenCalled();
        expect(cache.get(4151, 1)).toBeUndefined();

        cache.request(4151, 1, callback);
        cache.requestSprite(7, callback);
        await tick();
        expect(queueLoad).toHaveBeenCalledTimes(4);
        error.mockRestore();
    });

    test("a sprite's frames are asked for with the frame, and kept apart from its icon", async () => {
        const blank = (id: number) => ({ id, width: 0, height: 0, pixels: new Int32Array(0) });
        const queueLoad = vi.fn().mockResolvedValue([blank(815), blank(815)]);
        const cache = new IconCache();
        cache.setWorkerPool({ queueLoad } as never);
        const flag = vi.fn();
        cache.requestFrame(815, 6, flag);
        cache.requestFrame(815, 7, vi.fn());
        await tick();
        await tick();
        expect(queueLoad).toHaveBeenCalledTimes(1);
        expect(queueLoad.mock.calls[0][1]).toEqual({ spriteIds: [815, 815], frames: [6, 7] });
        // A frame the cache hasn't got is "", for the flag's letters instead
        expect(flag).toHaveBeenCalledWith("");
        expect(cache.getFrame(815, 6)).toBe("");
        expect(cache.getSprite(815)).toBeUndefined();
    });

    test("a sprite the cache hasn't got is kept as an empty url, for the item instead", async () => {
        const queueLoad = vi
            .fn()
            .mockResolvedValue([{ id: 1420, width: 0, height: 0, pixels: new Int32Array(0) }]);
        const cache = new IconCache();
        cache.setWorkerPool({ queueLoad } as never);
        const callback = vi.fn();
        cache.requestSprite(1420, callback);
        await tick();
        await tick();
        expect(callback).toHaveBeenCalledWith("");
        expect(cache.getSprite(1420)).toBe("");
    });

    test("icons on screen when a load failed are asked for again in a moment", async () => {
        vi.useFakeTimers();
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const queueLoad = vi
            .fn()
            .mockRejectedValueOnce(new Error("worker gone"))
            .mockReturnValue(new Promise(() => {}));
        const cache = new IconCache();
        cache.setWorkerPool({ queueLoad } as never);
        cache.request(4151, 1, vi.fn());
        await vi.advanceTimersByTimeAsync(1);
        expect(queueLoad).toHaveBeenCalledTimes(1);
        // Nothing asked for it again, and the worker still hears of it
        await vi.advanceTimersByTimeAsync(1100);
        expect(queueLoad).toHaveBeenCalledTimes(2);
        error.mockRestore();
        vi.useRealTimers();
    });
});
