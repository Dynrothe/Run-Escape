import readme from "../../README.md?raw";
import { GAME_CACHE_NAME } from "./cache";

describe("the game's cache", () => {
    test("is the one the README's Cache version section names", () => {
        const start = readme.indexOf("## Cache version");
        expect(start).not.toBe(-1);
        const section = readme.slice(start, readme.indexOf("\n## ", start + 1));
        expect(section).toContain("`" + GAME_CACHE_NAME + "`");
        // osrs-<revision>_<date>
        const [, revision, date] = /^osrs-(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(GAME_CACHE_NAME)!;
        expect(section).toContain(`OSRS revision ${revision}`);
        const day = new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        });
        expect(section).toContain(day);
    });
});
