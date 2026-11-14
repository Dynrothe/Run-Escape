// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { GameClient } from "../client/GameClient";
import { CAPE_PARTS, DEFAULT_CAPE_COLOURS, unpackHsl } from "../content/maxCape";
import { iconCache } from "./ItemIcon";
import { CapeColours } from "./WardrobeScreen";

function fakeClient() {
    return {
        setCapeColours: vi.fn(),
        previewCapeColours: vi.fn(),
        setLook: vi.fn(),
        previewLook: vi.fn(),
    };
}

describe("the customisable max cape's colours", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(iconCache, "get").mockImplementation(() => undefined);
        vi.spyOn(iconCache, "request").mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const dragHue = (container: HTMLElement, hue: number) => {
        const slider = container.querySelector<HTMLInputElement>(".ui-wardrobe-dye-slider")!;
        fireEvent.change(slider, { target: { value: String(hue) } });
    };

    test("shows a slider's colours, then keeps them once it's still", () => {
        const client = fakeClient();
        const { container } = render(
            <CapeColours look={{}} client={client as unknown as GameClient} />,
        );
        dragHue(container, 40);
        act(() => vi.advanceTimersByTime(300));
        expect(client.previewCapeColours).toHaveBeenCalledTimes(1);
        expect(client.setCapeColours).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(400));
        expect(client.setCapeColours).toHaveBeenCalledTimes(1);
        const [kept] = client.setCapeColours.mock.calls[0];
        expect(unpackHsl(kept[0]).hue).toBe(40);
        expect(kept.slice(1)).toEqual(DEFAULT_CAPE_COLOURS.slice(1));
        expect(kept).toHaveLength(CAPE_PARTS.length);
    });

    // Closed by a click that changed the outfit, the colours alone go: a whole look from before
    // the click would put the cape back on
    test("keeps colours not kept yet as it closes, without a look of its own", () => {
        const client = fakeClient();
        const { container, unmount } = render(
            <CapeColours
                look={{ outfit: { 1: 13342 } }}
                client={client as unknown as GameClient}
            />,
        );
        dragHue(container, 12);
        unmount();
        expect(client.setCapeColours).toHaveBeenCalledTimes(1);
        expect(unpackHsl(client.setCapeColours.mock.calls[0][0][0]).hue).toBe(12);
        expect(client.setLook).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1000));
        expect(client.setCapeColours).toHaveBeenCalledTimes(1);
    });
});
