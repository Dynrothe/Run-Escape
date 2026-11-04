// The lobby: one for the whole relay. Every player's first connection comes
// here, for their name, the open rooms list, and making or joining a room.
// It doesn't hold rooms: each room is its own Durable Object (room.mjs),
// started near whoever made it. To make or join one, the lobby checks the
// limits and hands the player a ticket ("goto"), which they take to the
// room's own connection.
//
// It hibernates between messages (WebSocket hibernation), so it costs next to
// nothing while players sit in menus. What it must not forget, the rooms
// list, is in its storage; the per-minute limits are fine to lose. Changes to
// the list are sent to everyone looking at it (outgoing messages are free),
// so the game needn't keep asking.
import { DurableObject } from "cloudflare:workers";

import { playerName, roomName } from "../../name-gen.mjs";
import {
    FULL_TEXT,
    IDLE_CONNECTION_MS,
    LIST_PAGE_SIZE,
    MAX_CONNECTIONS_PER_ADDRESS,
    MAX_CREATES_PER_MINUTE,
    MAX_JOINS_PER_MINUTE,
    MAX_LIST_PAGE_SIZE,
    MAX_PARTY,
    MAX_ROOMS,
    MAX_ROOMS_PER_ADDRESS,
    MAX_WRONG_CODES_PER_MINUTE,
    RateLimit,
    answerClose,
    clampInt,
    cleanId,
    cleanUnlocks,
    countryCode,
    guesserKey,
    isAnyMapOn,
    missingMap,
    newCode,
    parseMessage,
    randomToken,
    underLimit,
} from "./shared.mjs";

// A room that hasn't said it's there for this long is gone (it says so every
// ROOM_HEARTBEAT_MS, in room.mjs)
const ROOM_STALE_MS = 180_000;
// When a room last said so is stored this often at most (a write each), as
// waking from hibernation forgets it. A room silent since its stored time for
// ROOM_LOST_MS is gone however often the lobby wakes: one that ended without
// the lobby hearing (its call failed) can't stay on the list, or hold its
// slot toward the room limits, for ever.
const SEEN_SAVE_MS = 30 * 60_000;
const ROOM_LOST_MS = SEEN_SAVE_MS + ROOM_STALE_MS;
// A ticket's only good for a moment: the player goes straight to the room
const TICKET_MS = 30_000;
// A room asked for but never made (a second click of Make, say) is gone after
// this: its ticket's good for TICKET_MS, and the room waits ENTER_MS (in
// room.mjs) for its create
const PENDING_MS = 60_000;

const pageSize = (size) => clampInt(size, 1, MAX_LIST_PAGE_SIZE, LIST_PAGE_SIZE);

export class Lobby extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.anyMap = isAnyMapOn(env);
        // code -> what the list shows, and who hosts it
        this.rooms = new Map();
        // ticket -> who it's for and where
        this.tickets = new Map();
        this.createdFrom = new Map();
        this.joinedFrom = new Map();
        this.wrongCodesFrom = new Map();
        this.limits = new WeakMap();
        this.openRooms = undefined;
        // What each connection was last sent of the list, so a change that
        // doesn't touch their page isn't sent again (forgotten on hibernating,
        // which only means sending it once more)
        this.sentRooms = new WeakMap();
        this.pushQueued = false;
        // The client's keep-alive, answered without waking the lobby
        ctx.setWebSocketAutoResponse(
            new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'),
        );
        ctx.blockConcurrencyWhile(async () => {
            const now = Date.now();
            for (const [, entry] of await ctx.storage.list({ prefix: "room:" })) {
                // Just woken: give each room time to say it's still there,
                // within ROOM_LOST_MS of when it last did (by its order, for
                // a room stored before seenAt was)
                this.rooms.set(entry.code, {
                    ...entry,
                    lastSeen: now,
                    seenAt: entry.seenAt ?? entry.order ?? now,
                });
            }
        });
    }

    // ---- Players' connections ----

    async fetch(request) {
        const address = request.headers.get("x-address") ?? "unknown";
        const sockets = this.ctx.getWebSockets();
        const fromHere = sockets.filter((ws) => ws.deserializeAttachment()?.address === address);
        if (fromHere.length >= MAX_CONNECTIONS_PER_ADDRESS) {
            return new Response(null, { status: 429 });
        }
        const [client, server] = Object.values(new WebSocketPair());
        const player = {
            id: `p${randomToken(6)}`,
            name: this.newPlayerName(),
            address,
        };
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment(player);
        // country: for their own flag, as others see it (rooms find it for
        // themselves, from their own connection)
        server.send(
            JSON.stringify({
                t: "welcome",
                id: player.id,
                name: player.name,
                anyMap: this.anyMap,
                country: countryCode(request.headers.get("x-country")),
                listUpdates: true,
            }),
        );
        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws, data) {
        let limit = this.limits.get(ws);
        if (!limit) {
            limit = new RateLimit();
            this.limits.set(ws, limit);
        }
        if (!limit.allow(typeof data === "string" ? data.length : data.byteLength)) {
            ws.close(1008, "Too much");
            return;
        }
        const message = parseMessage(data);
        if (!message) {
            return;
        }
        const player = ws.deserializeAttachment();
        const send = (m) => ws.send(JSON.stringify(m));
        const error = (text) => send({ t: "error", message: text });
        if (message.t === "create" || message.t === "join") {
            // Off to a room: no lists while they're in it (the game asks again
            // when it's out, on "gone" or the room being lost)
            if (player.page !== undefined) {
                delete player.page;
                delete player.size;
                delete player.listingSince;
                ws.serializeAttachment(player);
                this.sentRooms.delete(ws);
            }
        } else if (
            message.t !== "ping" &&
            message.t !== "list" &&
            player.listingSince !== undefined
        ) {
            // Doing something: no longer just waiting on the list
            player.listingSince = undefined;
            ws.serializeAttachment(player);
        }
        switch (message.t) {
            case "ping":
                send({ t: "pong" });
                return;
            case "list": {
                const rooms = this.list(message);
                const size = pageSize(message.size);
                const now = Date.now();
                // Asking for the same page again is waiting, not doing anything
                // (an older game asks every few seconds): a tab left open on
                // the list is closed in the end, as on the Node relay
                if (
                    player.page === rooms.page &&
                    player.size === size &&
                    player.listingSince !== undefined
                ) {
                    if (now - player.listingSince > IDLE_CONNECTION_MS) {
                        ws.close(1001, "Idle");
                        return;
                    }
                } else {
                    player.page = rooms.page;
                    player.size = size;
                    player.listingSince = now;
                    ws.serializeAttachment(player);
                }
                const text = JSON.stringify(rooms);
                this.sentRooms.set(ws, text);
                ws.send(text);
                return;
            }
            case "rename": {
                player.name = this.newPlayerName();
                ws.serializeAttachment(player);
                send({ t: "named", name: player.name });
                return;
            }
            case "create": {
                const live = this.liveRooms();
                if (live.length >= MAX_ROOMS) {
                    error(FULL_TEXT);
                    return;
                }
                const hosted = live.filter((room) => room.hostAddress === player.address).length;
                if (hosted >= MAX_ROOMS_PER_ADDRESS) {
                    error("There are too many rooms from your connection already.");
                    return;
                }
                const hostMissing = missingMap(
                    this.anyMap,
                    [{ client: player, unlocks: cleanUnlocks(message.me?.unlocks) }],
                    cleanId(message.mapId) || "lumbridge",
                    message.endless === true,
                    message.hard === true,
                    player,
                );
                if (hostMissing) {
                    send(hostMissing);
                    return;
                }
                if (!underLimit(this.createdFrom, player.address, MAX_CREATES_PER_MINUTE)) {
                    error("That's a lot of rooms. Wait a minute before making another.");
                    return;
                }
                const code = newCode((c) => this.rooms.has(c));
                const taken = new Set(live.map((room) => room.name));
                const name = roomName((n) => taken.has(n));
                // Held until the room says it's there (or goes stale)
                await this.putRoom({
                    code,
                    name,
                    pending: true,
                    hostAddress: player.address,
                    order: Date.now(),
                });
                send({ t: "goto", code, ticket: this.ticket(player, code, "create", name) });
                return;
            }
            case "join": {
                const guesser = guesserKey(player.address);
                const recentWrong = (this.wrongCodesFrom.get(guesser) ?? []).filter(
                    (t) => Date.now() - t < 60_000,
                );
                if (recentWrong.length >= MAX_WRONG_CODES_PER_MINUTE) {
                    error("That's a lot of wrong codes. Wait a minute and try again.");
                    return;
                }
                const code =
                    typeof message.code === "string" ? message.code.toUpperCase().slice(0, 16) : "";
                const room = this.liveRoom(code);
                if (!room || room.pending) {
                    underLimit(this.wrongCodesFrom, guesser, Infinity);
                    error(`There's no room ${code || "with that code"}.`);
                    return;
                }
                if (room.started) {
                    error("That room's run has already started.");
                    return;
                }
                if (room.players >= MAX_PARTY) {
                    error("That room is full.");
                    return;
                }
                if (!underLimit(this.joinedFrom, player.address, MAX_JOINS_PER_MINUTE)) {
                    error("That's a lot of joining. Wait a minute and try again.");
                    return;
                }
                // The room checks the rest (kicked, maps, version), as it knows
                // its players
                send({ t: "goto", code, ticket: this.ticket(player, code, "join") });
                return;
            }
        }
    }

    async webSocketClose(ws, code) {
        answerClose(ws, code);
    }

    // ---- What the rooms call ----

    // Who a ticket's for, used up, or undefined for one that's no good here
    redeem(ticket, code) {
        const entry = typeof ticket === "string" ? this.tickets.get(ticket) : undefined;
        this.tickets.delete(ticket);
        if (!entry || entry.code !== code || Date.now() > entry.expires) {
            return undefined;
        }
        return entry;
    }

    // A room saying it's there, and how it is now
    async roomUpdate(entry) {
        const previous = this.rooms.get(entry.code);
        const changed =
            !previous ||
            previous.pending ||
            [
                "name",
                "open",
                "started",
                "players",
                "mapId",
                "endless",
                "hard",
                "host",
                "country",
            ].some((key) => previous[key] !== entry[key]);
        if (changed) {
            await this.putRoom({ ...entry, order: previous?.order ?? entry.order });
        } else {
            previous.lastSeen = Date.now();
            if (previous.lastSeen - previous.seenAt > SEEN_SAVE_MS) {
                previous.seenAt = previous.lastSeen;
                await this.saveRoom(previous);
            }
        }
        // Clears out rooms gone quiet (which sends the list round), as nobody
        // asks for it often enough now to find them
        this.liveRooms();
    }

    async roomGone(code) {
        this.rooms.delete(code);
        this.listChanged();
        await this.ctx.storage.delete(`room:${code}`);
    }

    // ---- ----

    async putRoom(entry) {
        const now = Date.now();
        const room = { ...entry, lastSeen: now, seenAt: now };
        this.rooms.set(entry.code, room);
        this.listChanged();
        await this.saveRoom(room);
    }

    // All but lastSeen, which waking sets afresh
    saveRoom(room) {
        const { lastSeen, ...stored } = room;
        return this.ctx.storage.put(`room:${room.code}`, stored);
    }

    // The list's changed: everyone looking at it hears straight after
    // whatever changed it (changes made together go as one). Not on a timer,
    // which would keep the lobby awake, and billed, until it went off.
    listChanged() {
        this.openRooms = undefined;
        if (!this.pushQueued) {
            this.pushQueued = true;
            queueMicrotask(() => {
                this.pushQueued = false;
                this.pushRooms();
            });
        }
    }

    // Each page's worked out once, for everyone looking at it
    pushRooms() {
        const live = this.liveRooms();
        const pages = new Map();
        for (const ws of this.ctx.getWebSockets()) {
            const player = ws.deserializeAttachment();
            if (player?.page === undefined) {
                continue;
            }
            const size = pageSize(player.size);
            const key = `${player.page}/${size}`;
            let rooms = pages.get(key);
            if (!rooms) {
                const list = this.list({ page: player.page, size }, live);
                rooms = { page: list.page, text: JSON.stringify(list) };
                pages.set(key, rooms);
            }
            // The page they're on now, if theirs has gone (as the Node relay)
            if (rooms.page !== player.page) {
                player.page = rooms.page;
                ws.serializeAttachment(player);
            }
            if (this.sentRooms.get(ws) !== rooms.text) {
                this.sentRooms.set(ws, rooms.text);
                try {
                    ws.send(rooms.text);
                } catch {
                    // Closing
                }
            }
        }
    }

    liveRoom(code) {
        const room = this.rooms.get(code);
        if (!room) {
            return undefined;
        }
        // One never made goes by when it was asked for, which is stored (when
        // it was last seen isn't: waking from hibernation sets it to now). One
        // that's been made goes once it stops saying it's there: soon while
        // the lobby's awake, or ROOM_LOST_MS after the stored time it last
        // did, however often it wakes. Or when someone tries to join it.
        const now = Date.now();
        const gone = room.pending
            ? now - room.order > PENDING_MS
            : now - room.lastSeen > ROOM_STALE_MS || now - room.seenAt > ROOM_LOST_MS;
        if (gone) {
            this.roomGone(code);
            return undefined;
        }
        return room;
    }

    liveRooms() {
        return [...this.rooms.keys()].map((code) => this.liveRoom(code)).filter(Boolean);
    }

    // A page of the open rooms (the last, if the one asked for has gone)
    list(message, live = this.liveRooms()) {
        this.openRooms ??= live
            .filter((room) => !room.pending && room.open && !room.started)
            .filter((room) => room.players < MAX_PARTY)
            .sort((a, b) => b.players - a.players || a.order - b.order)
            .map((room) => ({
                code: room.code,
                name: room.name,
                host: room.host ?? "",
                country: room.country,
                players: room.players,
                max: MAX_PARTY,
                mapId: room.mapId,
                endless: room.endless,
                hard: room.hard === true,
            }));
        const all = this.openRooms;
        const size = pageSize(message.size);
        const pages = Math.max(1, Math.ceil(all.length / size));
        const page = clampInt(message.page, 0, pages - 1, 0);
        return {
            t: "rooms",
            rooms: all.slice(page * size, (page + 1) * size),
            page,
            pages,
            total: all.length,
            full: live.length >= MAX_ROOMS,
        };
    }

    ticket(player, code, kind, roomName) {
        const now = Date.now();
        for (const [token, entry] of this.tickets) {
            if (now > entry.expires) {
                this.tickets.delete(token);
            }
        }
        const token = randomToken();
        this.tickets.set(token, {
            id: player.id,
            name: player.name,
            address: player.address,
            code,
            kind,
            roomName,
            expires: now + TICKET_MS,
        });
        return token;
    }

    newPlayerName() {
        const taken = new Set(
            this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment()?.name),
        );
        return playerName((name) => taken.has(name));
    }
}
