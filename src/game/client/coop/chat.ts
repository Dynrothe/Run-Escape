// A co-op room's chat, as this game keeps it: in memory only, for as long as
// the player's in the room. The relays pass lines on and keep none of them
// (server/coop-chat.mjs), so there's nothing anywhere to read back later.

// What the relay takes in a line, and how fast (server/coop-chat.mjs, which
// chat.test.ts holds these to): the game keeps within it (ChatLimiter)
export const MAX_CHAT_CHARS = 200;
export const CHAT_BURST = 3;
export const CHAT_PER_SECOND = 0.5;
// Lines kept, oldest dropped first
export const MAX_CHAT_LINES = 100;

// The quick-chat phrases, by id: the relay passes the id, and each game shows
// it in its own language (chat.quick.<id>). Ids only ever get added: an older
// game skips one it doesn't know.
export const QUICK_CHAT = ["ready", "wait", "go", "help", "nice", "thanks", "sorry", "gg"] as const;
export type QuickChatId = (typeof QUICK_CHAT)[number];

export function isQuickChat(id: string): id is QuickChatId {
    return (QUICK_CHAT as readonly string[]).includes(id);
}

// Who sees what: everything, the quick-chat phrases only (no one's own words,
// theirs or anyone's), or no chat at all
export const CHAT_MODES = ["all", "quick", "off"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export type ChatLine = {
    // In the order they came, for React's keys
    seq: number;
    from: string;
    name: string;
    text?: string;
    quick?: QuickChatId;
    // When it came (Date.now())
    at: number;
};

// What a line can be: one line, without what the relay strips, cut to its length. The same as
// the relay's cleanChat (chat.test.ts runs both over the same lines).
export function cleanChatText(text: string): string {
    const clean = text
        .replace(
            /[\p{Cc}\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu,
            " ",
        )
        .replace(/(\p{M}{3})\p{M}+/gu, "$1")
        .replace(/\s+/gu, " ")
        .trim();
    if (/^[\s\u115F\u1160\u200C\u200D\u2800\u3164\uFFA0]*$/u.test(clean)) {
        return "";
    }
    const chars = Array.from(clean);
    return chars.length > MAX_CHAT_CHARS ? chars.slice(0, MAX_CHAT_CHARS).join("").trim() : clean;
}

// The game fills its bucket this much slower than the relay's: a line sent the moment the game
// allows it, held up on the way longer than the one before it, is then still within the
// relay's limit
const CHAT_REFILL_MARGIN = 0.8;

// The relay's bucket of lines, kept here too, a little stricter
export class ChatLimiter {
    private tokens = CHAT_BURST;
    private at?: number;

    take(now = Date.now()): boolean {
        if (this.at !== undefined) {
            this.tokens = Math.min(
                CHAT_BURST,
                this.tokens + ((now - this.at) * CHAT_PER_SECOND * CHAT_REFILL_MARGIN) / 1000,
            );
        }
        this.at = now;
        if (this.tokens < 1) {
            return false;
        }
        this.tokens--;
        return true;
    }
}

// Whether a line shows, for this player's chat setting and who they've muted
export function showsLine(line: ChatLine, mode: ChatMode, muted: readonly string[]): boolean {
    if (mode === "off" || muted.includes(line.from)) {
        return false;
    }
    return mode === "all" || line.quick !== undefined;
}
