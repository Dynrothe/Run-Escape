import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { xpForLevel } from "./xp";

// Co-op copies of a run have to agree to the bit, so the sim's trigonometry
// goes through fm (fmath.ts), never the browser's own Math
describe("the sim's maths", () => {
    it("goes through fm, not Math's trigonometry", () => {
        const dir = join(__dirname);
        const banned =
            /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|hypot|pow|exp|log|log2|log10|cbrt)\(/;
        const offenders: string[] = [];
        for (const file of readdirSync(dir, { recursive: true }) as string[]) {
            if (!/\.ts$/.test(file) || /\.test\.ts$/.test(file) || file.endsWith("fmath.ts")) {
                continue;
            }
            readFileSync(join(dir, file), "utf8")
                .split("\n")
                .forEach((line, i) => {
                    if (banned.test(line)) {
                        offenders.push(`${file}:${i + 1}: ${line.trim()}`);
                    }
                });
        }
        expect(offenders).toEqual([]);
    });

    it("has the OSRS experience table", () => {
        expect(xpForLevel(2)).toBe(83);
        expect(xpForLevel(50)).toBe(101_333);
        expect(xpForLevel(99)).toBe(13_034_431);
    });
});
