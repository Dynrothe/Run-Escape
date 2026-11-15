import { HSL_RGB_MAP } from "./ColorUtil";

describe("the HSL palette", () => {
    // HSL colours are 16 bits, so 0xffff (the last hue at full saturation and lightness) is one
    test("has a colour for every HSL colour", () => {
        expect(HSL_RGB_MAP).toHaveLength(0x10000);
        expect(HSL_RGB_MAP[0xffff]).toBeGreaterThan(0);
        expect(HSL_RGB_MAP.every((rgb) => rgb > 0)).toBe(true);
    });
});
