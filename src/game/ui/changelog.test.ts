import { CHANGELOG, GAME_VERSION, parseChangelog } from "./changelog";

describe("changelog", () => {
    it("reads versions, their kinds of change and wrapped items", () => {
        const versions = parseChangelog(
            [
                "# Changelog",
                "",
                "An intro that's left out.",
                "",
                "## Unreleased",
                "",
                "## 0.2.0 - 2026-10-27",
                "",
                "### Added",
                "",
                "- **Rerolls**: one a run, and one",
                "  more a rank.",
                "- Thrownaxes.",
                "",
                "### Fixed",
                "",
                "- Item icons.",
            ].join("\r\n"),
        );
        expect(versions).toEqual([
            { version: "Unreleased", date: undefined, sections: [] },
            {
                version: "0.2.0",
                date: "2026-10-27",
                sections: [
                    {
                        heading: "Added",
                        items: ["**Rerolls**: one a run, and one more a rank.", "Thrownaxes."],
                    },
                    { heading: "Fixed", items: ["Item icons."] },
                ],
            },
        ]);
    });

    // A release bumps package.json and moves Unreleased under its version
    it("has the game's version as its newest release", () => {
        const released = CHANGELOG.filter((v) => v.version !== "Unreleased");
        expect(released[0].version).toBe(GAME_VERSION);
        expect(released[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(released[0].sections.length).toBeGreaterThan(0);
    });
});
