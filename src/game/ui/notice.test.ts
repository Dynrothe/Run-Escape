import { parseNotice } from "./notice";

describe("notice", () => {
    it("reads a title, paragraphs and lists, leaving comments out", () => {
        const notice = parseNotice(
            [
                "<!--",
                "How to write it.",
                "",
                "# An example",
                "-->",
                "# Patch notes",
                "",
                "The **Wilderness** is open",
                "again.",
                "",
                "- Thrownaxes",
                "- Elemental runes, which",
                "  circle you",
                "",
                "Thanks for playing!",
            ].join("\r\n"),
        );
        expect(notice?.title).toBe("Patch notes");
        expect(notice?.blocks).toEqual([
            { kind: "paragraph", text: "The **Wilderness** is open again." },
            { kind: "list", items: ["Thrownaxes", "Elemental runes, which circle you"] },
            { kind: "paragraph", text: "Thanks for playing!" },
        ]);
    });

    it("is nothing with nothing but a comment", () => {
        expect(parseNotice("<!--\n# Patch notes\n-->\n")).toBeUndefined();
        expect(parseNotice("")).toBeUndefined();
    });

    it("has a key that changes with the text but not its line endings", () => {
        const notice = parseNotice("# Hi\n\nOne")!;
        expect(parseNotice("# Hi\r\n\r\nOne")!.key).toBe(notice.key);
        expect(parseNotice("# Hi\n\nTwo")!.key).not.toBe(notice.key);
        expect(parseNotice("<!-- edited -->\n# Hi\n\nOne")!.key).toBe(notice.key);
    });
});
