// Co-op's relay: players find each other in rooms here, and the host's game
// reaches everyone else through it. It runs no game of its own (every player's
// browser runs the same sim from the same inputs) and keeps nothing once a
// room's empty. Plain Node with no packages, so it runs anywhere Node 20 does:
//
//   node server/coop-relay.mjs            # on port 8787, or PORT
//
// The dev server and `vite preview` run one too, at /coop (vite.config.ts),
// and so does server/serve.mjs, which serves a build along with it. A plain
// GET of the relay's path says it's there, which is how the game knows to
// offer co-op.
// The messages are JSON; src/game/client/coop/protocol.ts has their shapes.
import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

export const RELAY_PATH = "/coop";

const MAX_PARTY = 4;
const MAX_ROOMS = 1000;
// Bigger than any message the game sends (a start with everyone's loadout)
const MAX_MESSAGE_BYTES = 256 * 1024;
// A client sending more than this many messages a second is dropped
const MAX_MESSAGES_PER_SECOND = 400;
const PING_MS = 20_000;
const NAME_LENGTH = 16;
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
                    const text = Buffer.concat(this.fragments).toString("utf8");
                    this.fragments = [];
                    if (this.overLimit()) {
                        this.close(1008);
                        return;
                    }
                    let message;
                    try {
                        message = JSON.parse(text);
                    } catch {
                        return;
                    }
                    if (message && typeof message === "object") {
                        this.onMessage(message);
                    }
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

    overLimit() {
        const second = Math.floor(Date.now() / 1000);
        if (second !== this.second) {
            this.second = second;
            this.sentThisSecond = 0;
        }
        return ++this.sentThisSecond > MAX_MESSAGES_PER_SECOND;
    }

    sendFrame(opcode, payload) {
        if (this.closed) {
            return;
        }
        const length = payload.length;
        let header;
        if (length < 126) {
            header = Buffer.from([0x80 | opcode, length]);
        } else if (length < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x80 | opcode;
            header[1] = 126;
            header.writeUInt16BE(length, 2);
        } else {
            header = Buffer.alloc(10);
            header[0] = 0x80 | opcode;
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(length), 2);
        }
        this.socket.write(Buffer.concat([header, payload]));
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

function acceptKey(key) {
    return createHash("sha1")
        .update(key + WS_GUID)
        .digest("base64");
}

// ---- Rooms ----

function cleanName(name) {
    const clean = typeof name === "string" ? name.replace(/[^\p{L}\p{N} _'-]/gu, "").trim() : "";
    return clean.slice(0, NAME_LENGTH) || "Adventurer";
}

function cleanId(id) {
    return typeof id === "string" ? id.replace(/[^a-z0-9_]/g, "").slice(0, 40) : "";
}

export function createRelay() {
    const rooms = new Map();
    const clients = new Set();
    let nextId = 1;

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
            })),
        };
    }

    function broadcastRoom(room) {
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
        for (const member of room.members) {
            member.room = undefined;
            member.ready = false;
            member.connection.send({ t: "gone", reason });
        }
        room.members = [];
    }

    function setMember(client, message) {
        if (message.name !== undefined) {
            client.name = cleanName(message.name);
        }
        if (message.characterId !== undefined) {
            client.characterId = cleanId(message.characterId);
        }
        if (message.ready !== undefined) {
            client.ready = message.ready === true;
        }
        if (message.loadout !== undefined) {
            client.loadout = message.loadout;
        }
    }

    function handle(client, message) {
        const room = client.room;
        const isHost = room !== undefined && room.hostId === client.id;
        const error = (text) => client.connection.send({ t: "error", message: text });
        switch (message.t) {
            case "ping":
                client.connection.send({ t: "pong" });
                return;
            case "list":
                client.connection.send({
                    t: "rooms",
                    rooms: [...rooms.values()]
                        .filter((r) => r.open && !r.started && r.members.length < MAX_PARTY)
                        .slice(0, 50)
                        .map(listing),
                });
                return;
            case "create": {
                if (rooms.size >= MAX_ROOMS) {
                    error("The co-op server is full. Try again in a bit.");
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
                    setMember(client, message);
                    broadcastRoom(room);
                }
                return;
            case "settings":
                if (isHost && !room.started) {
                    if (message.open !== undefined) {
                        room.open = message.open === true;
                    }
                    if (message.mapId !== undefined) {
                        room.mapId = cleanId(message.mapId) || room.mapId;
                    }
                    if (message.endless !== undefined) {
                        room.endless = message.endless === true;
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
            case "up":
                // A guest's input, for the host
                if (room?.started && !isHost) {
                    const host = room.members.find((m) => m.id === room.hostId);
                    host?.connection.send({ t: "up", from: client.id, d: message.d });
                }
                return;
            case "down":
                // The host's frames, for everyone else
                if (isHost && room.started) {
                    const forwarded = { t: "down", d: message.d };
                    for (const member of room.members) {
                        if (member !== client) {
                            member.connection.send(forwarded);
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
        socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
        );
        const client = {
            id: `p${nextId++}`,
            name: "Adventurer",
            characterId: "",
            ready: false,
            loadout: undefined,
            room: undefined,
            connection: undefined,
        };
        client.connection = new Connection(
            socket,
            (message) => handle(client, message),
            () => {
                clients.delete(client);
                leaveRoom(client);
            },
        );
        clients.add(client);
        client.connection.send({ t: "welcome", id: client.id });
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
            res.end(JSON.stringify({ coop: true, players: clients.size, rooms: rooms.size }));
            return true;
        },
        close() {
            clearInterval(pinger);
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
    const path = process.env.COOP_PATH ?? RELAY_PATH;
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
