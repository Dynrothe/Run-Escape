import { describe, expect, it } from "vitest";

import { formatVolume, volumeFromDrag, volumeFromKey } from "./volume";

describe("volumeFromDrag", () => {
    it("follows the pointer in whole percents", () => {
        expect(volumeFromDrag(60.4, undefined)).toBe(0.6);
        expect(volumeFromDrag(60.6, undefined)).toBe(0.61);
    });

    it("moves a tenth as far with Shift, from where it took over", () => {
        const fine = { position: 50, value: 0.6 };
        expect(volumeFromDrag(50, fine)).toBe(0.6);
        expect(volumeFromDrag(55, fine)).toBe(0.605);
        expect(volumeFromDrag(42, fine)).toBe(0.592);
    });

    it("stays between silent and full", () => {
        expect(volumeFromDrag(-5, undefined)).toBe(0);
        expect(volumeFromDrag(100, { position: 0, value: 0.999 })).toBe(1);
        expect(volumeFromDrag(0, { position: 100, value: 0.004 })).toBe(0);
    });
});

describe("volumeFromKey", () => {
    it("steps a percent, or a tenth of one with Shift", () => {
        expect(volumeFromKey(0.6, 1, false)).toBe(0.61);
        expect(volumeFromKey(0.6, -1, true)).toBe(0.599);
        expect(volumeFromKey(0.6, 10, false)).toBe(0.7);
    });

    it("lands a whole step on a whole percent", () => {
        expect(volumeFromKey(0.605, 1, false)).toBe(0.61);
        expect(volumeFromKey(0.605, -1, false)).toBe(0.6);
        // 0.29 * 100 isn't quite 29
        expect(volumeFromKey(0.29, 1, false)).toBe(0.3);
        expect(volumeFromKey(0.29, -1, false)).toBe(0.28);
    });

    it("stays between silent and full", () => {
        expect(volumeFromKey(0.95, 10, false)).toBe(1);
        expect(volumeFromKey(0.0005, -1, true)).toBe(0);
    });
});

describe("formatVolume", () => {
    it("shows a tenth only when there is one", () => {
        expect(formatVolume(0.6)).toBe("60%");
        expect(formatVolume(0.605)).toBe("60.5%");
        expect(formatVolume(0.29)).toBe("29%");
    });
});
