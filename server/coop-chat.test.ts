import {
    CHAT_BURST,
    CHAT_PER_SECOND,
    MAX_CHAT_BYTES,
    MAX_CHAT_CHARS,
    chatAllowed,
    chatLine,
    cleanChat,
} from "./coop-chat.mjs";

describe("co-op chat", () => {
    it("keeps a line to one line of plain text", () => {
        expect(cleanChat("  hi\n\tthere  ")).toBe("hi there");
        // Control characters, and ones that turn the text after them round
        expect(cleanChat("a\u0000b\u202Ec\u2066d")).toBe("a b c d");
        expect(cleanChat("   ")).toBe("");
        expect(cleanChat(42)).toBe("");
    });

    it("cuts a long line, by the characters a player sees", () => {
        expect(Array.from(cleanChat("x".repeat(500)))).toHaveLength(MAX_CHAT_CHARS);
        // An emoji is one character, not two halves
        const emoji = cleanChat("\u{1F600}".repeat(MAX_CHAT_CHARS + 5));
        expect(Array.from(emoji)).toHaveLength(MAX_CHAT_CHARS);
        expect(emoji.endsWith("\u{1F600}")).toBe(true);
    });

    it("keeps accents but not a pile of them on one letter", () => {
        expect(cleanChat("cafe\u0301")).toBe("cafe\u0301");
        expect(cleanChat(`a${"\u0301".repeat(50)}`)).toBe(`a${"\u0301".repeat(3)}`);
    });

    it("lets a player say a few lines at once, then one at the relay's pace", () => {
        const client: Record<string, unknown> = {};
        const now = 1_000_000;
        const gap = 1000 / CHAT_PER_SECOND;
        for (let i = 0; i < CHAT_BURST; i++) {
            expect(chatAllowed(client, now)).toBe(true);
        }
        expect(chatAllowed(client, now)).toBe(false);
        expect(chatAllowed(client, now + gap / 2)).toBe(false);
        expect(chatAllowed(client, now + gap)).toBe(true);
        expect(chatAllowed(client, now + gap)).toBe(false);
    });

    it("says who it's from, and drops what says nothing", () => {
        const client = { id: "p1", name: "Brave Goblin" };
        expect(chatLine(client, { t: "chat", text: " gl " }, 20, 0)).toEqual({
            t: "chat",
            from: "p1",
            name: "Brave Goblin",
            text: "gl",
        });
        expect(chatLine(client, { t: "chat", quick: "ready" }, 20, 0)).toEqual({
            t: "chat",
            from: "p1",
            name: "Brave Goblin",
            quick: "ready",
        });
        expect(chatLine(client, { t: "chat", text: "  " }, 20, 0)).toBeUndefined();
        expect(chatLine(client, { t: "chat", quick: "Not An Id" }, 20, 0)).toBeUndefined();
        expect(chatLine(client, { t: "chat", text: "hi" }, MAX_CHAT_BYTES + 1, 0)).toBeUndefined();
    });
});
