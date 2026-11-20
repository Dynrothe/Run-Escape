import * as relay from "../../../../server/coop-chat.mjs";
import {
    CHAT_BURST,
    CHAT_PER_SECOND,
    ChatLimiter,
    ChatLine,
    MAX_CHAT_CHARS,
    cleanChatText,
    showsLine,
} from "./chat";

const line = (changes: Partial<ChatLine>): ChatLine => ({
    seq: 1,
    from: "p1",
    name: "Brave Goblin",
    at: 0,
    ...changes,
});

describe("co-op chat", () => {
    it("sends one line of text, cut as the relay cuts it", () => {
        expect(cleanChatText("  hi\n there ")).toBe("hi there");
        expect(cleanChatText("a\u202Eb")).toBe("a b");
        expect(Array.from(cleanChatText("\u{1F600}".repeat(300)))).toHaveLength(MAX_CHAT_CHARS);
    });

    it.each([
        "  hi\n there ",
        "a‮b⁦c",
        "zero​width⁠word﻿",
        "ㅤㅤ",
        "⠀ ᅟᅠ",
        "​‍",
        "é́́́́́",
        "\u{1F469}‍\u{1F467} and \u{1F1EB}\u{1F1EE}",
        "x".repeat(250),
        "\u{1F600}".repeat(300),
    ])("cleans %j as the relay does", (text) => {
        expect(cleanChatText(text)).toBe(relay.cleanChat(text));
    });

    it("says nothing for a line of what can't be seen", () => {
        expect(cleanChatText("ㅤ​⠀")).toBe("");
        expect(cleanChatText("a​b")).toBe("a b");
        // The joiners stay in an emoji
        expect(cleanChatText("\u{1F469}‍\u{1F467}")).toBe("\u{1F469}‍\u{1F467}");
    });

    it("keeps within the relay's limits, so a line it would drop isn't sent", () => {
        expect([MAX_CHAT_CHARS, CHAT_BURST, CHAT_PER_SECOND]).toEqual([
            relay.MAX_CHAT_CHARS,
            relay.CHAT_BURST,
            relay.CHAT_PER_SECOND,
        ]);
        const limiter = new ChatLimiter();
        const sent = Array.from({ length: CHAT_BURST + 2 }, () => limiter.take(0));
        expect(sent.filter(Boolean)).toHaveLength(CHAT_BURST);
        expect(sent.slice(CHAT_BURST)).toEqual([false, false]);
        // A little after the relay would take one again, so one held up on the way still fits
        const gap = 1000 / CHAT_PER_SECOND;
        expect(limiter.take(gap)).toBe(false);
        expect(limiter.take(gap * 1.25)).toBe(true);
        expect(limiter.take(gap * 1.25)).toBe(false);
        const client = {};
        expect(Array.from({ length: CHAT_BURST }, () => relay.chatAllowed(client, 0))).toEqual(
            Array(CHAT_BURST).fill(true),
        );
        expect(relay.chatAllowed(client, gap)).toBe(true);
    });

    it("shows what the player's setting and mutes let through", () => {
        const words = line({ text: "hello" });
        const phrase = line({ quick: "gg" });
        expect(showsLine(words, "all", [])).toBe(true);
        expect(showsLine(words, "quick", [])).toBe(false);
        expect(showsLine(phrase, "quick", [])).toBe(true);
        expect(showsLine(phrase, "off", [])).toBe(false);
        expect(showsLine(words, "all", ["p1"])).toBe(false);
    });
});
