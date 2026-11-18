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

    it("keeps to the relay's limits, so a line it would drop isn't sent", () => {
        expect([MAX_CHAT_CHARS, CHAT_BURST, CHAT_PER_SECOND]).toEqual([
            relay.MAX_CHAT_CHARS,
            relay.CHAT_BURST,
            relay.CHAT_PER_SECOND,
        ]);
        const limiter = new ChatLimiter();
        const sent = Array.from({ length: CHAT_BURST + 2 }, () => limiter.take(0));
        expect(sent.filter(Boolean)).toHaveLength(CHAT_BURST);
        expect(sent.slice(CHAT_BURST)).toEqual([false, false]);
        const gap = 1000 / CHAT_PER_SECOND;
        expect(limiter.take(gap / 2)).toBe(false);
        expect(limiter.take(gap)).toBe(true);
        expect(limiter.take(gap)).toBe(false);
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
