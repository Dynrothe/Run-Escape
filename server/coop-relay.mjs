// Co-op's relay: players find each other in rooms here, and the host's game
// reaches everyone else through it. It runs no game of its own (every player's
// browser runs the same sim from the same inputs) and keeps nothing once a
// room's empty. Plain Node with no packages, so it runs anywhere Node 20 does:
//
//   node server/coop-relay.mjs            # on port 8787, or PORT
//   PROXY=cloudflare node server/coop-relay.mjs    # behind a proxy (client-ip.mjs)
//
// The dev server and `vite preview` run one too, at /coop (vite.config.ts),
// and so does server/serve.mjs, which serves a build along with it. A plain
// GET of the relay's path says it's there, which is how the game knows to
// offer co-op.
// The messages are JSON; src/game/client/coop/protocol.ts has their shapes.
import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { clientAddress, proxyMode, viaProxy } from "./client-ip.mjs";
import { DEFAULT_NAME, playerName } from "./names.mjs";

export const RELAY_PATH = "/coop";

// Whether a server that has the relay in it (serve.mjs, and the dev and
// preview servers) runs it. On unless it's turned off: MULTIPLAYER=off, the
// :singleplayer npm scripts, or --no-multiplayer. Off, the game hides co-op.
export function isMultiplayerOn(env = process.env, argv = process.argv) {
    return !(
        ["off", "0", "false", "no"].includes((env.MULTIPLAYER ?? "").trim().toLowerCase()) ||
        (env.npm_lifecycle_event ?? "").endsWith(":singleplayer") ||
        argv.includes("--no-multiplayer")
    );
}

// Whether players can join rooms on maps they haven't unlocked (and so open
// them by winning there): MULTIPLAYER_ANY_MAP=on or --any-map. Off by default, so nobody
// skips ahead: a room only takes players with its map unlocked (and its
// endless, for an endless room), and the host can only pick maps everyone in
// it has. Each player's game says which maps it has; with no accounts that's
// its word, so this keeps fair players fair rather than stopping a cheat.
export function isAnyMapOn(env = process.env, argv = process.argv) {
    return (
        ["on", "1", "true"].includes((env.MULTIPLAYER_ANY_MAP ?? "").toLowerCase()) ||
        argv.includes("--any-map")
    );
}

// Rooms on the relay at once: MULTIPLAYER_MAX_ROOMS=1000 or --max-rooms=1000,
// or MAX_ROOMS. Each room of four is about 12 KB/s each way through the relay.
export function maxRoomsSetting(env = process.env, argv = process.argv) {
    const flag = argv.find((arg) => arg.startsWith("--max-rooms="))?.slice("--max-rooms=".length);
    const value = flag ?? env.MULTIPLAYER_MAX_ROOMS;
    if (value === undefined || value.trim() === "") {
        return MAX_ROOMS;
    }
    const rooms = Number(value);
    if (!Number.isInteger(rooms) || rooms < 1) {
        console.warn(
            `MULTIPLAYER_MAX_ROOMS "${value}" isn't a whole number of rooms: taking ${MAX_ROOMS}.`,
        );
        return MAX_ROOMS;
    }
    return rooms;
}

const MAX_PARTY = 4;
// No game has more maps than this
const MAX_UNLOCKED_MAPS = 200;
// Rooms on the relay at once unless the server sets it (see maxRoomsSetting);
// past that, a new one waits for one to go
const MAX_ROOMS = 500;
// Limits on each address (see client-ip.mjs for who a connection's from), so
// one machine can't take the relay over. Generous enough for a household or
// a LAN party behind one address.
const MAX_CONNECTIONS_PER_ADDRESS = 16;
const MAX_ROOMS_PER_ADDRESS = 4;
const MAX_CREATES_PER_MINUTE = 10;
// A room nobody's done anything in for this long is closed
const IDLE_MS = 30 * 60_000;
// Bigger than any real loadout (the shop's bonuses, unlocked items and
// Armoury); a bigger one is dropped rather than sent round the room
export const MAX_LOADOUT_BYTES = 16 * 1024;
const FULL_TEXT = "All rooms are taken right now. Try again when one opens.";
// The open rooms list comes a page at a time: this many to a page unless the
// game asks for another size, up to the most
const LIST_PAGE_SIZE = 8;
const MAX_LIST_PAGE_SIZE = 20;
// Bigger than any message the game sends (a start with everyone's loadout)
const MAX_MESSAGE_BYTES = 256 * 1024;
// A client sending more than this many messages a second is dropped
const MAX_MESSAGES_PER_SECOND = 400;
const PING_MS = 20_000;
// Room codes leave out letters and digits that look alike
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// ---- WebSocket (RFC 6455): just what browsers send ----

class Connection {
    constructor(socket, onMessage, onClose) {
        this.socket = socket;
        this.onMessage = onMessage;
        this.onClose = onClose;
        this.buffer = Buffer.alloc(0);
        // A message in pieces (continuation frames)
        this.fragments = [];
        this.closed = false;
        this.alive = true;
        this.second = 0;
        this.sentThisSecond = 0;
        socket.setNoDelay(true);
        socket.on("data", (data) => this.receive(data));
        socket.on("close", () => this.finish());
        socket.on("error", () => this.finish());
    }

    receive(data) {
        this.buffer = this.buffer.length === 0 ? data : Buffer.concat([this.buffer, data]);
        while (!this.closed) {
            const frame = this.readFrame();
            if (!frame) {
                return;
            }
            this.handleFrame(frame);
        }
    }

    // The next whole frame in the buffer, or undefined until there is one
    readFrame() {
        const buffer = this.buffer;
        if (buffer.length < 2) {
            return undefined;
        }
        const fin = (buffer[0] & 0x80) !== 0;
        const opcode = buffer[0] & 0x0f;
        const masked = (buffer[1] & 0x80) !== 0;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
            if (buffer.length < 4) {
                return undefined;
            }
            length = buffer.readUInt16BE(2);
            offset = 4;
        } else if (length === 127) {
            if (buffer.length < 10) {
                return undefined;
            }
            const big = buffer.readBigUInt64BE(2);
            if (big > BigInt(MAX_MESSAGE_BYTES)) {
                this.close(1009);
                return undefined;
            }
            length = Number(big);
            offset = 10;
        }
        if (!masked || length > MAX_MESSAGE_BYTES) {
            // Browsers always mask what they send
            this.close(1002);
            return undefined;
        }
        if (buffer.length < offset + 4 + length) {
            return undefined;
        }
        const mask = buffer.subarray(offset, offset + 4);
        const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i & 3];
        }
        this.buffer = buffer.subarray(offset + 4 + length);
        return { fin, opcode, payload };
    }

    handleFrame({ fin, opcode, payload }) {
        switch (opcode) {
            case 0x0:
            case 0x1: {
                if (opcode === 0x1 && fin) {
                    // The whole message in one frame, as nearly all are
                    this.fragments = [];
                    this.receiveMessage(payload);
                    return;
                }
                if (opcode === 0x1) {
                    this.fragments = [];
                }
                this.fragments.push(payload);
                const size = this.fragments.reduce((total, part) => total + part.length, 0);
                if (size > MAX_MESSAGE_BYTES) {
                    this.close(1009);
                    return;
                }
                if (fin) {
                    const whole = Buffer.concat(this.fragments);
                    this.fragments = [];
                    this.receiveMessage(whole);
                }
                return;
            }
            case 0x8:
                this.close(1000);
                return;
            case 0x9:
                this.sendFrame(0xa, payload);
                return;
            case 0xa:
                this.alive = true;
                return;
            default:
                // Binary and anything else: not something the game sends
                this.close(1003);
        }
    }

    // A whole message: its JSON, with the bytes it came as (to pass on as they
    // are, rather than encoding it again)
    receiveMessage(payload) {
        if (this.overLimit()) {
            this.close(1008);
            return;
        }
        let message;
        try {
            message = JSON.parse(payload.toString("utf8"));
        } catch {
            return;
        }
        if (message && typeof message === "object" && !Array.isArray(message)) {
            this.onMessage(message, payload);
        }
    }

    overLimit() {
        const second = Math.floor(Date.now() / 1000);
        if (second !== this.second) {
            this.second = second;
            this.sentThisSecond = 0;
        }
        return ++this.sentThisSecond > MAX_MESSAGES_PER_SECOND;
    }

    sendFrame(opcode, payload) {
        this.write(encodeFrame(opcode, payload));
    }

    // A frame from encodeFrame, which can go to any number of connections
    write(frame) {
        if (!this.closed) {
            this.socket.write(frame);
        }
    }

    send(message) {
        this.sendFrame(0x1, Buffer.from(JSON.stringify(message), "utf8"));
    }

    ping() {
        if (!this.alive) {
            // Nothing back since the last ping
            this.close(1001);
            return;
        }
        this.alive = false;
        this.sendFrame(0x9, Buffer.alloc(0));
    }

    close(code) {
        if (this.closed) {
            return;
        }
        const payload = Buffer.alloc(2);
        payload.writeUInt16BE(code, 0);
        this.sendFrame(0x8, payload);
        this.closed = true;
        this.socket.end();
        this.finish();
    }

    finish() {
        this.closed = true;
        if (this.onClose) {
            const onClose = this.onClose;
            this.onClose = undefined;
            onClose();
        }
    }
}

// A whole, unmasked frame (as a server sends them), header and payload in
// one buffer
function encodeFrame(opcode, payload) {
    const length = payload.length;
    const headerLength = length < 126 ? 2 : length < 65536 ? 4 : 10;
    const frame = Buffer.allocUnsafe(headerLength + length);
    frame[0] = 0x80 | opcode;
    if (length < 126) {
        frame[1] = length;
    } else if (length < 65536) {
        frame[1] = 126;
        frame.writeUInt16BE(length, 2);
    } else {
        frame[1] = 127;
        frame.writeBigUInt64BE(BigInt(length), 2);
    }
    payload.copy(frame, headerLength);
    return frame;
}

// A message as it came (a JSON object), with one more field put last, so it
// wins over any field of that name already in it (JSON.parse keeps the last)
function withField(payload, name, value) {
    let end = payload.length - 1;
    while (end > 0 && payload[end] !== 0x7d) {
        end--;
    }
    return Buffer.concat([
        payload.subarray(0, end),
        Buffer.from(`,${JSON.stringify(name)}:${JSON.stringify(value)}}`, "utf8"),
    ]);
}

function acceptKey(key) {
    return createHash("sha1")
        .update(key + WS_GUID)
        .digest("base64");
}

// ---- Rooms ----

// The maps a player's game says it has unlocked, and has endless for
function cleanUnlocks(unlocks) {
    const list = (ids) =>
        Array.isArray(ids) ? ids.slice(0, MAX_UNLOCKED_MAPS).map(cleanId).filter(Boolean) : [];
    return { maps: list(unlocks?.maps), endless: list(unlocks?.endless) };
}

function hasUnlocked(unlocks, mapId, endless) {
    return unlocks.maps.includes(mapId) && (!endless || unlocks.endless.includes(mapId));
}

// A whole number from a message, kept within min and max
function clampInt(value, min, max, fallback) {
    const n = Number.isInteger(value) ? value : fallback;
    return Math.max(min, Math.min(max, n));
}

function cleanId(id) {
    return typeof id === "string" ? id.replace(/[^a-z0-9_]/g, "").slice(0, 40) : "";
}

// limits: any of the relay's limits to change (the tests' tighter or looser
// ones); the rest are as above
export function createRelay(limits = {}) {
    const {
        maxRooms = maxRoomsSetting(),
        connectionsPerAddress = MAX_CONNECTIONS_PER_ADDRESS,
        roomsPerAddress = MAX_ROOMS_PER_ADDRESS,
        createsPerMinute = MAX_CREATES_PER_MINUTE,
        idleMs = IDLE_MS,
        // The proxy in front (see client-ip.mjs), as the server's set it
        proxy = proxyMode(),
        // Rooms take players without their map (see isAnyMapOn)
        anyMap = isAnyMapOn(),
    } = limits;
    let warnedProxy = false;
    const rooms = new Map();
    const clients = new Set();
    let nextId = 1;
    // Connections from each address, and when each made its latest rooms
    const connectionsFrom = new Map();
    const createdFrom = new Map();
    let nextRoomOrder = 1;
    // The open rooms as the list shows them, worked out again only after a
    // room changes (everyone browsing asks every few seconds)
    let openRooms;

    function newCode() {
        for (;;) {
            let code = "";
            for (let i = 0; i < CODE_LENGTH; i++) {
                code += CODE_CHARS[randomInt(CODE_CHARS.length)];
            }
            if (!rooms.has(code)) {
                return code;
            }
        }
    }

    // What everyone in a room sees of it
    function roomView(room) {
        return {
            code: room.code,
            open: room.open,
            hostId: room.hostId,
            mapId: room.mapId,
            endless: room.endless,
            started: room.started,
            members: room.members.map((client) => ({
                id: client.id,
                name: client.name,
                characterId: client.characterId,
                ready: client.ready,
                loadout: client.loadout,
                unlocks: client.unlocks,
            })),
        };
    }

    function broadcastRoom(room) {
        openRooms = undefined;
        const view = roomView(room);
        for (const member of room.members) {
            member.connection.send({ t: "room", room: view, you: member.id });
        }
    }

    function listing(room) {
        const host = room.members.find((member) => member.id === room.hostId);
        return {
            code: room.code,
            host: host?.name ?? "",
            players: room.members.length,
            max: MAX_PARTY,
            mapId: room.mapId,
            endless: room.endless,
        };
    }

    // Rooms anyone can join: open, not under way and not full. The fullest
    // first (they'll start soonest), then the ones waiting longest, so the
    // order holds still while people browse.
    function getOpenRooms() {
        openRooms ??= [...rooms.values()]
            .filter((room) => room.open && !room.started && room.members.length < MAX_PARTY)
            .sort((a, b) => b.members.length - a.members.length || a.order - b.order)
            .map(listing);
        return openRooms;
    }

    // Takes a client out of their room. reason goes to them; the rest are
    // told who's gone.
    function leaveRoom(client, reason) {
        const room = client.room;
        if (!room) {
            return;
        }
        client.room = undefined;
        client.ready = false;
        room.members = room.members.filter((member) => member !== client);
        if (reason) {
            client.connection.send({ t: "gone", reason });
        }
        if (room.members.length === 0) {
            rooms.delete(room.code);
            openRooms = undefined;
            return;
        }
        if (room.hostId === client.id) {
            if (room.started) {
                // The host's game is the one everyone's follows, so the run
                // can't go on without them
                disband(room, "hostLeft");
                return;
            }
            room.hostId = room.members[0].id;
        }
        if (room.started) {
            for (const member of room.members) {
                member.connection.send({ t: "left", id: client.id });
            }
        }
        broadcastRoom(room);
    }

    function disband(room, reason) {
        rooms.delete(room.code);
        openRooms = undefined;
        for (const member of room.members) {
            member.room = undefined;
            member.ready = false;
            member.connection.send({ t: "gone", reason });
        }
        room.members = [];
    }

    // Someone else in a room already has this name. Names are a player's
    // own only while they're in a room: no accounts, so nothing's kept.
    function nameTaken(name, client) {
        for (const room of rooms.values()) {
            if (room.members.some((member) => member !== client && member.name === name)) {
                return true;
            }
        }
        return false;
    }

    // The name a player's after, or an error if it's taken
    function checkName(client, message) {
        const name = message.name !== undefined ? playerName(message.name) : client.name;
        return nameTaken(name, client)
            ? `Someone's already using ${name} right now. Pick another name.`
            : undefined;
    }

    // Rooms whose host is at this address
    function roomsHostedFrom(address) {
        let count = 0;
        for (const room of rooms.values()) {
            const host = room.members.find((member) => member.id === room.hostId);
            if (host?.address === address) {
                count++;
            }
        }
        return count;
    }

    // Whether this address may make another room now (and if so, notes it)
    function mayCreate(client) {
        const now = Date.now();
        const recent = (createdFrom.get(client.address) ?? []).filter((t) => now - t < 60_000);
        if (recent.length >= createsPerMinute) {
            createdFrom.set(client.address, recent);
            return false;
        }
        recent.push(now);
        createdFrom.set(client.address, recent);
        return true;
    }

    function setMember(client, message) {
        if (message.name !== undefined) {
            client.name = playerName(message.name);
        }
        if (message.characterId !== undefined) {
            client.characterId = cleanId(message.characterId);
        }
        if (message.ready !== undefined) {
            client.ready = message.ready === true;
        }
        if (message.loadout !== undefined) {
            const size = JSON.stringify(message.loadout)?.length ?? 0;
            client.loadout = size <= MAX_LOADOUT_BYTES ? message.loadout : undefined;
        }
        if (message.unlocks !== undefined) {
            client.unlocks = cleanUnlocks(message.unlocks);
        }
    }

    // What stops these players (with these unlocks, or their own) playing on a
    // map: the first one without it, as an error for whoever's asking, or
    // nothing. who: the player's name, said when it isn't the one asking.
    function missingMap(players, mapId, endless, asking) {
        if (anyMap) {
            return undefined;
        }
        for (const { client, unlocks = client.unlocks } of players) {
            if (!hasUnlocked(unlocks, mapId, endless)) {
                const need = { mapId, endless, ...(client !== asking && { who: client.name }) };
                const what = `${mapId}${endless ? " (endless)" : ""}`;
                return {
                    t: "error",
                    message:
                        client === asking
                            ? `You need ${what} unlocked to join this room.`
                            : `${client.name} hasn't got ${what} unlocked.`,
                    need,
                };
            }
        }
        return undefined;
    }

    // payload: the message's bytes as they came, for passing on
    function handle(client, message, payload) {
        const room = client.room;
        if (room) {
            room.lastActive = Date.now();
        }
        const isHost = room !== undefined && room.hostId === client.id;
        const error = (text) => client.connection.send({ t: "error", message: text });
        switch (message.t) {
            case "ping":
                client.connection.send({ t: "pong" });
                return;
            case "list": {
                const size = clampInt(message.size, 1, MAX_LIST_PAGE_SIZE, LIST_PAGE_SIZE);
                const list = getOpenRooms();
                const pages = Math.max(1, Math.ceil(list.length / size));
                // Past the last page (rooms filled up or went): the last one
                const page = clampInt(message.page, 0, pages - 1, 0);
                client.connection.send({
                    t: "rooms",
                    rooms: list.slice(page * size, (page + 1) * size),
                    page,
                    pages,
                    total: list.length,
                    // No room for another until one goes
                    full: rooms.size >= maxRooms,
                });
                return;
            }
            case "create": {
                if (rooms.size >= maxRooms) {
                    error(FULL_TEXT);
                    return;
                }
                if (roomsHostedFrom(client.address) >= roomsPerAddress) {
                    error("There are too many rooms from your connection already.");
                    return;
                }
                const taken = checkName(client, message.me ?? {});
                if (taken) {
                    error(taken);
                    return;
                }
                const hostMissing = missingMap(
                    [{ client, unlocks: cleanUnlocks(message.me?.unlocks ?? client.unlocks) }],
                    cleanId(message.mapId) || "lumbridge",
                    message.endless === true,
                    client,
                );
                if (hostMissing) {
                    client.connection.send(hostMissing);
                    return;
                }
                if (!mayCreate(client)) {
                    error("That's a lot of rooms. Wait a minute before making another.");
                    return;
                }
                leaveRoom(client);
                setMember(client, message.me ?? {});
                client.ready = false;
                const created = {
                    code: newCode(),
                    open: message.open === true,
                    hostId: client.id,
                    mapId: cleanId(message.mapId) || "lumbridge",
                    endless: message.endless === true,
                    started: false,
                    members: [client],
                    order: nextRoomOrder++,
                    lastActive: Date.now(),
                };
                rooms.set(created.code, created);
                client.room = created;
                broadcastRoom(created);
                return;
            }
            case "join": {
                const code = typeof message.code === "string" ? message.code.toUpperCase() : "";
                const target = rooms.get(code);
                if (!target) {
                    error(`There's no room ${code || "with that code"}.`);
                    return;
                }
                if (target.started) {
                    error("That room's run has already started.");
                    return;
                }
                if (target.members.length >= MAX_PARTY) {
                    error("That room is full.");
                    return;
                }
                if (target.members.includes(client)) {
                    return;
                }
                const nameError = checkName(client, message.me ?? {});
                if (nameError) {
                    error(nameError);
                    return;
                }
                const missing = missingMap(
                    [{ client, unlocks: cleanUnlocks(message.me?.unlocks ?? client.unlocks) }],
                    target.mapId,
                    target.endless,
                    client,
                );
                if (missing) {
                    client.connection.send(missing);
                    return;
                }
                leaveRoom(client);
                setMember(client, message.me ?? {});
                client.ready = false;
                target.members.push(client);
                client.room = target;
                broadcastRoom(target);
                return;
            }
            case "leave":
                leaveRoom(client, "left");
                return;
            case "me":
                if (room) {
                    const nameError = checkName(client, message);
                    if (nameError) {
                        error(nameError);
                        setMember(client, { ...message, name: undefined });
                    } else {
                        setMember(client, message);
                    }
                    broadcastRoom(room);
                }
                return;
            case "settings":
                if (isHost && !room.started) {
                    if (message.open !== undefined) {
                        room.open = message.open === true;
                    }
                    const mapId =
                        message.mapId !== undefined
                            ? cleanId(message.mapId) || room.mapId
                            : room.mapId;
                    const endless =
                        message.endless !== undefined ? message.endless === true : room.endless;
                    // Only a map everyone in the room has
                    const missing = missingMap(
                        room.members.map((member) => ({ client: member })),
                        mapId,
                        endless,
                        client,
                    );
                    if (missing) {
                        client.connection.send(missing);
                    } else {
                        room.mapId = mapId;
                        room.endless = endless;
                    }
                    broadcastRoom(room);
                }
                return;
            case "kick": {
                if (!isHost) {
                    return;
                }
                const kicked = room.members.find((m) => m.id === message.id && m !== client);
                if (kicked) {
                    leaveRoom(kicked, "kicked");
                }
                return;
            }
            case "disband":
                if (isHost) {
                    disband(room, "disbanded");
                }
                return;
            case "start":
                if (isHost && !room.started) {
                    const missing = missingMap(
                        room.members.map((member) => ({ client: member })),
                        room.mapId,
                        room.endless,
                        client,
                    );
                    if (missing) {
                        client.connection.send(missing);
                        return;
                    }
                    room.started = true;
                    for (const member of room.members) {
                        member.ready = false;
                        member.connection.send({ t: "start", game: message.game });
                    }
                    broadcastRoom(room);
                }
                return;
            case "end":
                // The host's back in the lobby: the room is again
                if (isHost && room.started) {
                    room.started = false;
                    broadcastRoom(room);
                }
                return;
            // The game's own traffic, nearly all of what comes through, goes on
            // as it came rather than encoded again: the same JSON, so every
            // player reads what the relay did
            case "up":
                // A guest's input, for the host, saying who it's from
                if (room?.started && !isHost) {
                    const host = room.members.find((m) => m.id === room.hostId);
                    host?.connection.write(encodeFrame(0x1, withField(payload, "from", client.id)));
                }
                return;
            case "down":
                // The host's frames, for everyone else: one frame for them all
                if (isHost && room.started) {
                    const frame = encodeFrame(0x1, payload);
                    for (const member of room.members) {
                        if (member !== client) {
                            member.connection.write(frame);
                        }
                    }
                }
                return;
        }
    }

    function handleUpgrade(req, socket, head) {
        const key = req.headers["sec-websocket-key"];
        if (
            typeof key !== "string" ||
            (req.headers.upgrade ?? "").toLowerCase() !== "websocket" ||
            req.headers["sec-websocket-version"] !== "13"
        ) {
            socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
            return;
        }
        const address = clientAddress(req, socket, proxy);
        if (proxy === "none" && !warnedProxy && viaProxy(req, socket)) {
            warnedProxy = true;
            console.warn(
                "Co-op players are coming through a proxy, so they all look like it to the " +
                    "relay's limits. Set PROXY=local (or PROXY=cloudflare behind Cloudflare).",
            );
        }
        const connections = connectionsFrom.get(address) ?? 0;
        if (connections >= connectionsPerAddress) {
            socket.end("HTTP/1.1 429 Too Many Requests\r\n\r\n");
            return;
        }
        connectionsFrom.set(address, connections + 1);
        socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
        );
        const client = {
            id: `p${nextId++}`,
            name: DEFAULT_NAME,
            characterId: "",
            ready: false,
            loadout: undefined,
            unlocks: cleanUnlocks(undefined),
            room: undefined,
            connection: undefined,
            address,
        };
        client.connection = new Connection(
            socket,
            (message, payload) => handle(client, message, payload),
            () => {
                clients.delete(client);
                const left = (connectionsFrom.get(address) ?? 1) - 1;
                if (left > 0) {
                    connectionsFrom.set(address, left);
                } else {
                    connectionsFrom.delete(address);
                }
                leaveRoom(client);
            },
        );
        clients.add(client);
        // anyMap: the game shows rooms on maps the player hasn't got as locked
        // unless it's on
        client.connection.send({ t: "welcome", id: client.id, anyMap });
        if (head && head.length > 0) {
            client.connection.receive(head);
        }
    }

    const pinger = setInterval(() => {
        for (const client of clients) {
            client.connection.ping();
        }
    }, PING_MS);
    pinger.unref?.();

    // Rooms nobody's done anything in for a long while are closed, and the
    // record of rooms made from each address is kept to the last minute
    const sweeper = setInterval(() => sweep(Date.now()), 60_000);
    sweeper.unref?.();

    function sweep(now) {
        for (const room of [...rooms.values()]) {
            if (now - room.lastActive > idleMs) {
                disband(room, "idle");
            }
        }
        for (const [address, times] of createdFrom) {
            if (times.every((t) => now - t >= 60_000)) {
                createdFrom.delete(address);
            }
        }
    }

    return {
        // Takes over an HTTP server's WebSocket upgrades to path (and leaves
        // the rest, like Vite's own, alone)
        attach(server, path = RELAY_PATH) {
            server.on("upgrade", (req, socket, head) => {
                const url = new URL(req.url ?? "/", "http://localhost");
                if (url.pathname === path) {
                    handleUpgrade(req, socket, head);
                }
            });
        },
        handleUpgrade,
        // Answers a plain GET of path with what's going on, for the game to
        // see co-op's there (from another site too, with VITE_COOP_URL).
        // False for any other request, to go to whatever else serves.
        handleRequest(req, res, path = RELAY_PATH) {
            const url = new URL(req.url ?? "/", "http://localhost");
            if (url.pathname !== path || (req.method !== "GET" && req.method !== "HEAD")) {
                return false;
            }
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
            });
            res.end(
                JSON.stringify({
                    coop: true,
                    players: clients.size,
                    rooms: rooms.size,
                    full: rooms.size >= maxRooms,
                }),
            );
            return true;
        },
        // Closes idle rooms as if it were this time (for the tests)
        sweep,
        close() {
            clearInterval(pinger);
            clearInterval(sweeper);
            for (const client of clients) {
                client.connection.close(1001);
            }
        },
        get roomCount() {
            return rooms.size;
        },
    };
}

// Run on its own
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const port = parseInt(process.env.PORT ?? "8787");
    const path = process.env.MULTIPLAYER_PATH ?? RELAY_PATH;
    const relay = createRelay();
    const server = createServer((req, res) => {
        if (!relay.handleRequest(req, res, path)) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Run Escape co-op relay\n");
        }
    });
    relay.attach(server, path);
    server.listen(port, () => {
        console.log(`Co-op relay on ws://localhost:${port}${path}`);
    });
}
