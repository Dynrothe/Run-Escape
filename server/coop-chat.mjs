// Co-op chat: what a player says to their room. Both relays (coop-relay.mjs and
// cloudflare/src/room.mjs) pass it on to everyone in the room, the sender too,
// and keep none of it: a room's chat lives only in its players' games.

// What one line can be: characters as a player sees them (code points), and
// the message's bytes as it came, checked before it's read further
export const MAX_CHAT_CHARS = 200;
export const MAX_CHAT_BYTES = 2048;
// A player can say this many lines at once, then one every two seconds: each
// line is a message the relay's billed for, and the room's woken for, so
// writing at length isn't encouraged. The game keeps to the same
// (src/game/client/coop/chat.ts, which a test holds to these), so a line over
// it is dropped without a word.
export const CHAT_BURST = 3;
export const CHAT_PER_SECOND = 0.5;

// Ids of the game's quick-chat phrases, which each game shows in its own
// language. Any id of this shape goes on: a game that doesn't know it skips it.
const QUICK_ID = /^[a-z][a-z0-9_]{0,31}$/;

// Text a line can't carry: control characters, the ones that reverse or
// isolate the text after them (which could make a line seem to be someone
// else's), and long runs of combining marks piled on one letter
const CONTROL = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
const MARK_PILE = /(\p{M}{3})\p{M}+/gu;

export function cleanChat(text) {
    if (typeof text !== "string") {
        return "";
    }
    const clean = text.replace(CONTROL, " ").replace(MARK_PILE, "$1").replace(/\s+/gu, " ").trim();
    const chars = Array.from(clean);
    return chars.length > MAX_CHAT_CHARS ? chars.slice(0, MAX_CHAT_CHARS).join("").trim() : clean;
}

// Whether this player can say another line now, and if so, takes it off what
// they can (a bucket of CHAT_BURST lines that fills at CHAT_PER_SECOND)
export function chatAllowed(client, now = Date.now()) {
    const tokens =
        client.chatAt === undefined
            ? CHAT_BURST
            : Math.min(
                  CHAT_BURST,
                  client.chatTokens + ((now - client.chatAt) * CHAT_PER_SECOND) / 1000,
              );
    client.chatAt = now;
    if (tokens < 1) {
        client.chatTokens = tokens;
        return false;
    }
    client.chatTokens = tokens - 1;
    return true;
}

// What the room hears from a player's chat message, or undefined for one that
// says nothing or is too much. size: the message's bytes (or characters) as
// it came.
export function chatLine(client, message, size, now = Date.now()) {
    if (size > MAX_CHAT_BYTES) {
        return undefined;
    }
    let said;
    if (typeof message.quick === "string") {
        if (!QUICK_ID.test(message.quick)) {
            return undefined;
        }
        said = { quick: message.quick };
    } else {
        const text = cleanChat(message.text);
        if (!text) {
            return undefined;
        }
        said = { text };
    }
    if (!chatAllowed(client, now)) {
        return undefined;
    }
    return { t: "chat", from: client.id, name: client.name, ...said };
}
