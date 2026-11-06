// One co-op room, as its own Durable Object. Cloudflare starts it near the
// first request for it, which is the host making it, so the host's frames
// and the guests' inputs go through a relay close to the host rather than one
// fixed place. What it does is server/coop-relay.mjs's rooms, one room at a
// time: players come with a ticket from the lobby (lobby.mjs) and send their
// create or join first.
//
// Its connections hibernate, so it's billed only while it's handling
// something, not for every second a socket's open: mid-run that's a sliver of
// each second. A pending setTimeout or setInterval would keep it billed all
// the time, so everything it waits for goes through one alarm (later()).
// After 10 seconds with nothing to do, Cloudflare can take it out of memory
// and keep the connections open. It's made again for the next message or
// alarm, from storage and what each socket carries (remember()).
//
// Cloudflare restarts Durable Objects now and then (runtime updates, moving
// them), which drops every connection and what's in memory. So the room keeps
// itself in storage, and a player whose connection drops is held for
// RESUME_GRACE_MS: their game reconnects with the token the room gave them
// (coop/room/<code>?resume=<token>) and carries on. The host's game resends
// frames a guest missed meanwhile (see CoopRun).
import { DurableObject } from "cloudflare:workers";

import {
    RunWatch,
    checkReport,
    checkReporter,
    endsCaughtRuns,
    heroIdsOf,
    runOf,
} from "../../coop-checks.mjs";
import { playerName } from "../../name-gen.mjs";
import {
    IDLE_MS,
    MAX_LOADOUT_BYTES,
    MAX_ME_BYTES,
    MAX_PARTY,
    MAX_UPS_PER_SECOND,
    MAX_UP_BYTES,
    MEMBER_UPDATE_MS,
    OTHER_BUILD_TEXT,
    RateLimit,
    answerClose,
    cleanId,
    cleanUnlocks,
    countryCode,
    isAnyMapOn,
    lobbyStub,
    missingMap,
    parseMessage,
    randomToken,
} from "./shared.mjs";

// How often a room tells the lobby it's still there. Each one is a billed
// request to the lobby, whatever it says.
const ROOM_HEARTBEAT_MS = 60_000;
// How long a player whose connection dropped keeps their place: longer than
// their game keeps trying (RESUME_WINDOW_MS in CoopLobby.ts)
const RESUME_GRACE_MS = 15_000;
// A connection that hasn't made or joined the room by now is closed. The
// lobby forgets a room that never got made, so nothing else would end it.
const ENTER_MS = 10_000;
// The room's saved, and the lobby told, this often at most
const SAVE_MS = 1000;

// A player's country, for their flag, unless they've hidden it. An open
// room's host shows theirs anyway: it's where the room is, for whoever's
// picking one from the list.
function shownCountry(member, room) {
    const openHost = room.open && room.hostId === member.id;
    return member.hideCountry && !openHost ? undefined : member.country;
}

export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.anyMap = isAnyMapOn(env);
        this.endsCaught = endsCaughtRuns(env);
        // The run analytics collector, through a service binding (README)
        this.reportCheck = checkReporter({
            url: "https://run-checks/v1/run-checks",
            token: env.RUN_CHECKS_TOKEN,
            fetch: env.RUN_CHECKS && ((url, init) => env.RUN_CHECKS.fetch(url, init)),
        });
        // The run's checks (coop-checks.mjs), made again from room.heroIds
        // after a restart
        this.watch = undefined;
        this.lobby = lobbyStub(env);
        this.code = "";
        // The room, once it's made, until it's empty or closed
        this.room = undefined;
        // Kicked addresses outlast a room's members, for the room's life
        this.kicked = new Set();
        // socket -> the member it's for
        this.sockets = new Map();
        // What's waiting for the alarm: key -> { at, run }
        this.due = new Map();
        this.alarmAt = undefined;
        // Each member's own keys in due
        this.serial = 0;
        // The room's lastActive as last saved (the heartbeat saves it again)
        this.savedActive = undefined;
        // The game's keep-alive, answered without waking the room, so
        // outside its RateLimit (see Cost from strangers in PR-REVIEW.md)
        ctx.setWebSocketAutoResponse(
            new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'),
        );
        // A room from before a restart, or from before it was out of memory
        ctx.blockConcurrencyWhile(async () => {
            await this.load();
            this.reconnect();
        });
    }

    async fetch(request) {
        const url = new URL(request.url);
        const code = url.pathname.split("/").pop() ?? "";
        const resume = url.searchParams.get("resume");
        if (resume) {
            return this.resume(resume);
        }
        const who = await this.lobby.redeem(url.searchParams.get("ticket"), code);
        if (!who) {
            return new Response(null, { status: 403 });
        }
        this.code = code;
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server);
        const member = this.newMember({
            id: who.id,
            name: who.name,
            address: request.headers.get("x-address") ?? who.address,
            country: countryCode(request.headers.get("x-country")),
            kind: who.kind,
            roomName: who.roomName,
            at: Date.now(),
        });
        this.attach(member, server);
        this.awaitEntry(member, ENTER_MS);
        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws, data) {
        // An alarm that couldn't be set (armAlarm), tried again
        if (this.alarmAt === undefined) {
            this.armAlarm();
        }
        const member = this.sockets.get(ws);
        if (member?.socket === ws) {
            this.receive(member, data);
        }
    }

    async webSocketClose(ws, code) {
        answerClose(ws, code);
        this.socketGone(ws);
    }

    async webSocketError(ws) {
        this.socketGone(ws);
    }

    socketGone(ws) {
        const member = this.sockets.get(ws);
        this.sockets.delete(ws);
        if (member) {
            this.lost(member, ws);
        }
    }

    newMember(fields) {
        return {
            characterId: "",
            ready: false,
            loadout: undefined,
            unlocks: cleanUnlocks(undefined),
            build: undefined,
            // For their flag (index.mjs), and whether they've hidden it
            country: undefined,
            hideCountry: false,
            // Given on making or joining the room, to come back with
            token: undefined,
            // When their connection dropped, while it's dropped
            awayAt: undefined,
            ...fields,
            serial: ++this.serial,
            // Undefined while their connection's dropped
            socket: undefined,
            limit: new RateLimit(),
            upSecond: 0,
            upsThisSecond: 0,
        };
    }

    attach(member, socket) {
        this.cancel(`away:${member.serial}`);
        member.awayAt = undefined;
        member.socket = socket;
        this.sockets.set(socket, member);
        this.remember(member);
    }

    // What a connection carries through the room being out of memory: who
    // it's for, the room's code (which isn't saved until it's made), and
    // when the next heartbeat's due
    remember(member) {
        try {
            member.socket?.serializeAttachment({
                id: member.id,
                name: member.name,
                address: member.address,
                country: member.country,
                kind: member.kind,
                roomName: member.roomName,
                at: member.at,
                token: member.token,
                code: this.code,
                beatAt: this.due.get("heartbeat")?.at,
            });
        } catch {
            // Closed
        }
    }

    // Closes a connection the room's done with. Cloudflare can still list it
    // until the other end answers, which a dead one never does, so it's
    // forgotten first: a room made again meanwhile mustn't take it for its
    // player's.
    shut(socket, code) {
        this.sockets.delete(socket);
        try {
            socket.serializeAttachment(null);
        } catch {
            // Closed
        }
        try {
            socket.close(code);
        } catch {
            // Already closed
        }
    }

    // A connection that has to make or join the room within ms
    awaitEntry(member, ms) {
        this.later(`enter:${member.serial}`, ms, () => {
            if (!member.closed && !this.room?.members.includes(member)) {
                this.closeSocket(member, 1008);
            }
        });
    }

    // A player's game coming back after its connection dropped
    resume(token) {
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server);
        const member = this.room?.members.find((m) => m.token === token && !m.closed);
        if (!member) {
            server.send(
                JSON.stringify({ t: "error", message: "The room closed while you were away." }),
            );
            server.close(1000);
            return new Response(null, { status: 101, webSocket: client });
        }
        const old = member.socket;
        const wasAway = member.awayAt !== undefined;
        this.attach(member, server);
        member.limit = new RateLimit();
        if (old) {
            this.shut(old, 1000);
        }
        // So the room made again doesn't hold their place a second time
        if (wasAway) {
            this.save();
        }
        this.send(member, {
            t: "room",
            room: this.roomView(),
            you: member.id,
            token: member.token,
        });
        return new Response(null, { status: 101, webSocket: client });
    }

    // A player's connection closed without them leaving: in a room, they're
    // held for a moment to come back
    lost(member, socket) {
        if (member.socket !== socket) {
            return;
        }
        member.socket = undefined;
        if (member.closed) {
            return;
        }
        if (member.token && this.room?.members.includes(member)) {
            this.holdPlace(member);
            // When they went, for a room made again meanwhile
            this.save();
        } else {
            this.dropped(member);
        }
    }

    holdPlace(member, since = Date.now()) {
        member.awayAt = since;
        this.later(`away:${member.serial}`, since + RESUME_GRACE_MS - Date.now(), () => {
            if (!member.socket) {
                this.dropped(member);
            }
        });
    }

    // ---- Waiting, with the one alarm ----

    // run, in ms (or the next alarm after), replacing whatever key had
    later(key, ms, run) {
        this.due.set(key, { at: Date.now() + Math.max(0, ms), run });
        this.armAlarm();
    }

    cancel(key) {
        // The alarm's left as it is: going off with nothing due is harmless
        this.due.delete(key);
    }

    armAlarm() {
        let next = Infinity;
        for (const { at } of this.due.values()) {
            next = Math.min(next, at);
        }
        if (next !== Infinity && (this.alarmAt === undefined || next < this.alarmAt)) {
            this.alarmAt = next;
            this.ctx.storage.setAlarm(next).catch((e) => {
                // Not set: the next message or wait sets it
                if (this.alarmAt === next) {
                    this.alarmAt = undefined;
                }
                console.warn("Co-op room: couldn't set its alarm:", e);
            });
        }
    }

    async alarm() {
        this.alarmAt = undefined;
        const now = Date.now();
        for (const [key, job] of [...this.due]) {
            if (job.at <= now && this.due.get(key) === job) {
                this.due.delete(key);
                try {
                    job.run();
                } catch (e) {
                    console.warn("Co-op room: something it waited for failed:", e);
                }
            }
        }
        if (this.due.size > 0) {
            this.armAlarm();
        } else if (!this.room) {
            await this.ctx.storage.deleteAll();
        }
    }

    // ---- Keeping the room through a restart, or being out of memory ----

    async load() {
        const saved = await this.ctx.storage.get("room");
        if (!saved) {
            return;
        }
        this.code = saved.code;
        this.kicked = new Set(saved.kicked);
        // alarmSet: from before the room had one alarm for everything
        const { members, kicked, alarmSet, ...fields } = saved;
        const room = { ...fields, members: [] };
        this.room = room;
        this.savedActive = room.lastActive;
        for (const memberFields of members) {
            room.members.push(this.newMember(memberFields));
        }
    }

    // The connections still open, after the room was out of memory (none
    // after a restart): back to whoever they're for, and the rest held for
    // their games to come back
    reconnect() {
        const now = Date.now();
        const room = this.room;
        const open = this.ctx.getWebSockets().map((ws) => [ws, ws.deserializeAttachment()]);
        // Read before attach() writes them again
        let beatAt;
        for (const [, seen] of open) {
            if (!this.code && seen?.code) {
                this.code = seen.code;
            }
            // The latest: one still to make or join the room isn't told
            // each beat
            if (seen?.beatAt > (beatAt ?? 0)) {
                beatAt = seen.beatAt;
            }
        }
        if (room) {
            // When it was due, not put off a minute by each time the room's
            // made again, nor said each time (after a restart, with no
            // connections left to say when, now)
            this.startHeartbeat(room, (beatAt ?? now) - now);
        }
        for (const [ws, seen] of open) {
            const member = seen?.token
                ? room?.members.find((m) => m.token === seen.token && !m.socket)
                : undefined;
            if (member) {
                this.attach(member, ws);
            } else if (seen && !seen.token) {
                // Still to make or join the room
                const { id, name, address, country, kind, roomName, at } = seen;
                const pending = this.newMember({ id, name, address, country, kind, roomName, at });
                this.attach(pending, ws);
                this.awaitEntry(pending, (seen.at ?? now) + ENTER_MS - now);
            } else {
                this.shut(ws, 1000);
            }
        }
        if (!room) {
            return;
        }
        for (const member of room.members) {
            if (!member.socket) {
                this.holdPlace(member, member.awayAt ?? now);
            }
        }
    }

    // Saves the room and tells the lobby, now or, if that was done in the
    // last SAVE_MS, once that's passed: a host flicking settings can't make
    // a storage write of every message. now: someone joining or leaving, or
    // the run starting or ending, saved at once and before anyone's told
    // (Cloudflare holds back what's sent after a write until it's stored), so
    // a restart straight after can't bring back the room as it was.
    persist(now = false) {
        const room = this.room;
        if (!room) {
            return;
        }
        if (this.due.has("save") && !now) {
            room.saveWaiting = true;
            return;
        }
        room.saveWaiting = false;
        this.tellLobby();
        this.save();
        this.later("save", SAVE_MS, () => {
            if (room.saveWaiting && this.room === room) {
                room.saveWaiting = false;
                this.persist();
            }
        });
    }

    save() {
        const room = this.room;
        if (!room) {
            return;
        }
        const { members, updateWaiting, saveWaiting, told, ...fields } = room;
        this.savedActive = room.lastActive;
        this.ctx.storage
            .put("room", {
                ...fields,
                members: members.map((m) => ({
                    id: m.id,
                    name: m.name,
                    address: m.address,
                    country: m.country,
                    hideCountry: m.hideCountry,
                    kind: m.kind,
                    characterId: m.characterId,
                    ready: m.ready,
                    loadout: m.loadout,
                    unlocks: m.unlocks,
                    build: m.build,
                    token: m.token,
                    awayAt: m.awayAt,
                })),
                kicked: [...this.kicked],
            })
            .catch((e) => console.warn("Co-op room: couldn't save the room:", e));
    }

    receive(member, data) {
        if (member.closed) {
            return;
        }
        if (!member.limit.allow(typeof data === "string" ? data.length : data.byteLength)) {
            this.closeSocket(member, 1008);
            this.dropped(member);
            return;
        }
        const message = parseMessage(data);
        if (!message) {
            return;
        }
        try {
            this.handle(member, message, data);
        } catch (e) {
            console.warn("Co-op room: dropped a connection over a message it couldn't handle:", e);
            this.closeSocket(member, 1011);
            this.dropped(member);
        }
    }

    send(member, message) {
        this.sendText(member, JSON.stringify(message));
    }

    sendText(member, text) {
        if (!member.closed && member.socket) {
            try {
                member.socket.send(text);
            } catch {
                // Gone; its close comes next
            }
        }
    }

    closeSocket(member, code = 1000) {
        if (!member.closed) {
            member.closed = true;
            this.cancel(`away:${member.serial}`);
            const socket = member.socket;
            member.socket = undefined;
            if (socket) {
                this.shut(socket, code);
            }
        }
    }

    // A player's out of the room for good
    dropped(member) {
        member.closed = true;
        this.cancel(`away:${member.serial}`);
        if (this.room?.members.includes(member)) {
            this.leaveRoom(member);
        }
    }

    // ---- The room, as coop-relay.mjs ----

    roomView() {
        const room = this.room;
        return {
            code: room.code,
            name: room.name,
            open: room.open,
            hostId: room.hostId,
            mapId: room.mapId,
            endless: room.endless,
            hard: room.hard === true,
            started: room.started,
            members: room.members.map((client) => ({
                id: client.id,
                name: client.name,
                characterId: client.characterId,
                ready: client.ready,
                loadout: client.loadout,
                unlocks: client.unlocks,
                country: shownCountry(client, room),
            })),
        };
    }

    // Saved first by whoever calls it (persist)
    broadcastRoom() {
        const view = this.roomView();
        for (const member of this.room.members) {
            this.send(member, { t: "room", room: view, you: member.id, token: member.token });
        }
    }

    broadcastMembers() {
        const room = this.room;
        if (room.started) {
            return;
        }
        if (this.due.has("update")) {
            room.updateWaiting = true;
            return;
        }
        this.persist();
        this.broadcastRoom();
        this.later("update", MEMBER_UPDATE_MS, () => {
            if (room.updateWaiting && this.room === room) {
                room.updateWaiting = false;
                this.broadcastMembers();
            }
        });
    }

    // What the lobby lists changes far less often than the room (players'
    // loadouts and ready don't show), so it's only told of a change, unless
    // it's the heartbeat saying the room's still there
    tellLobby(heartbeat = false) {
        const room = this.room;
        if (!room) {
            return;
        }
        const host = room.members.find((member) => member.id === room.hostId);
        const entry = {
            code: room.code,
            name: room.name,
            open: room.open,
            started: room.started,
            players: room.members.length,
            mapId: room.mapId,
            endless: room.endless,
            hard: room.hard === true,
            host: host?.name ?? "",
            country: host ? shownCountry(host, room) : undefined,
            hostAddress: host?.address ?? "",
            order: room.order,
        };
        const told = JSON.stringify(entry);
        if (!heartbeat && told === room.told) {
            return;
        }
        room.told = told;
        this.lobby.roomUpdate(entry).catch((e) => {
            // Said again with the next change, not only the next heartbeat
            if (room.told === told) {
                room.told = undefined;
            }
            console.warn("Co-op room: couldn't reach the lobby:", e);
        });
    }

    // The room's over: the lobby forgets it and its timers stop
    endRoom() {
        const room = this.room;
        if (!room) {
            return;
        }
        for (const key of ["heartbeat", "update", "save"]) {
            this.cancel(key);
        }
        this.watch?.finish();
        this.watch = undefined;
        this.room = undefined;
        this.kicked.clear();
        this.ctx.storage.deleteAll().catch(() => {});
        this.lobby.roomGone(room.code).catch(() => {});
    }

    leaveRoom(client, reason) {
        const room = this.room;
        room.members = room.members.filter((member) => member !== client);
        client.ready = false;
        if (reason) {
            this.send(client, { t: "gone", reason });
        }
        // Each room has its own connection, so leaving one closes it
        this.closeSocket(client);
        if (room.members.length === 0) {
            this.endRoom();
            return;
        }
        if (room.hostId === client.id) {
            if (room.started) {
                this.disband("hostLeft");
                return;
            }
            room.hostId = room.members[0].id;
        }
        this.persist(true);
        if (room.started) {
            for (const member of room.members) {
                this.send(member, { t: "left", id: client.id });
            }
        }
        this.broadcastRoom();
    }

    disband(reason) {
        const room = this.room;
        const members = room.members;
        room.members = [];
        for (const member of members) {
            member.ready = false;
            this.send(member, { t: "gone", reason });
            this.closeSocket(member);
        }
        this.endRoom();
    }

    setMember(client, message) {
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
        if (typeof message.build === "string") {
            client.build = message.build.slice(0, 64);
        }
        if (message.hideCountry !== undefined) {
            client.hideCountry = message.hideCountry === true;
        }
    }

    allowUp(client, text) {
        const second = Math.floor(Date.now() / 1000);
        if (second !== client.upSecond) {
            client.upSecond = second;
            client.upsThisSecond = 0;
        }
        return text.length <= MAX_UP_BYTES && ++client.upsThisSecond <= MAX_UPS_PER_SECOND;
    }

    handle(client, message, text) {
        const error = (message) => this.send(client, { t: "error", message });
        if (message.t === "ping") {
            this.send(client, { t: "pong" });
            return;
        }
        if (message.t === "create") {
            this.create(client, message);
            return;
        }
        if (message.t === "join") {
            this.join(client, message);
            return;
        }
        const room = this.room;
        if (!room || !room.members.includes(client)) {
            return;
        }
        if (message.t !== "me") {
            room.lastActive = Date.now();
        }
        const isHost = room.hostId === client.id;
        switch (message.t) {
            case "leave":
                this.leaveRoom(client, "left");
                return;
            case "me":
                if (text.length <= MAX_ME_BYTES) {
                    this.setMember(client, message);
                    this.broadcastMembers();
                }
                return;
            case "rename":
                if (!room.started) {
                    const taken = new Set(room.members.map((member) => member.name));
                    client.name = playerName((name) => taken.has(name));
                    this.send(client, { t: "named", name: client.name });
                    this.broadcastMembers();
                }
                return;
            case "settings":
                if (isHost && !room.started) {
                    const open = message.open !== undefined ? message.open === true : room.open;
                    const mapId =
                        message.mapId !== undefined
                            ? cleanId(message.mapId) || room.mapId
                            : room.mapId;
                    const endless =
                        message.endless !== undefined ? message.endless === true : room.endless;
                    const hard =
                        message.hard !== undefined ? message.hard === true : room.hard === true;
                    const missing = missingMap(
                        this.anyMap,
                        room.members.map((member) => ({ client: member })),
                        mapId,
                        endless,
                        hard,
                        client,
                    );
                    if (missing) {
                        this.send(client, missing);
                    }
                    const changed =
                        open !== room.open ||
                        (!missing &&
                            (mapId !== room.mapId ||
                                endless !== room.endless ||
                                hard !== (room.hard === true)));
                    room.open = open;
                    if (!missing) {
                        room.mapId = mapId;
                        room.endless = endless;
                        room.hard = hard;
                    }
                    // Nothing to save or send for a setting as it was, and
                    // as "me", only the latest of a burst every
                    // MEMBER_UPDATE_MS (a refused map still gets the room
                    // back, for the host's screen)
                    if (changed || missing) {
                        this.broadcastMembers();
                    }
                }
                return;
            case "kick": {
                if (!isHost) {
                    return;
                }
                const kicked = room.members.find((m) => m.id === message.id && m !== client);
                if (kicked) {
                    this.kicked.add(kicked.address);
                    this.leaveRoom(kicked, "kicked");
                }
                return;
            }
            case "disband":
                if (isHost) {
                    this.disband("disbanded");
                }
                return;
            case "start":
                if (isHost && !room.started) {
                    const missing = missingMap(
                        this.anyMap,
                        room.members.map((member) => ({ client: member })),
                        room.mapId,
                        room.endless,
                        room.hard === true,
                        client,
                    );
                    if (missing) {
                        this.send(client, missing);
                        return;
                    }
                    const odd = room.members.find((member) => member.build !== client.build);
                    if (odd) {
                        error(
                            odd === client
                                ? OTHER_BUILD_TEXT
                                : `${odd.name}'s game is another version. Everyone needs to reload the page.`,
                        );
                        return;
                    }
                    room.started = true;
                    room.heroIds = heroIdsOf(message.game, MAX_PARTY);
                    room.runInfo = room.heroIds && runOf(message.game);
                    this.watch = room.heroIds && this.newWatch(room, false);
                    for (const member of room.members) {
                        member.ready = false;
                    }
                    this.persist(true);
                    for (const member of room.members) {
                        this.send(member, { t: "start", game: message.game });
                    }
                    this.broadcastRoom();
                }
                return;
            case "end":
                if (isHost && room.started) {
                    room.started = false;
                    room.heroIds = undefined;
                    room.runInfo = undefined;
                    this.watch?.finish();
                    this.watch = undefined;
                    this.persist(true);
                    this.broadcastRoom();
                }
                return;
            case "up":
                // A guest's input for the host, saying who it's from: the
                // message as it came, with one more field last
                if (room.started && !isHost && this.allowUp(client, text)) {
                    const host = room.members.find((m) => m.id === room.hostId);
                    if (host) {
                        const end = text.lastIndexOf("}");
                        this.sendText(
                            host,
                            `${text.slice(0, end)},"from":${JSON.stringify(client.id)}}`,
                        );
                        this.runWatch()?.up(client.id, message.d, Date.now(), !!host.socket);
                    }
                }
                return;
            case "down":
                if (isHost && room.started) {
                    for (const member of room.members) {
                        if (member !== client) {
                            this.sendText(member, text);
                        }
                    }
                    const watch = this.runWatch();
                    watch?.down(message.d);
                    if (watch?.end) {
                        // Which ends the run for everyone, as the host leaving does
                        this.closeSocket(client, 1008);
                        this.dropped(client);
                    }
                }
                return;
        }
    }

    newWatch(room, resumed) {
        const host = room.members.find((m) => m.id === room.hostId);
        const watch = new RunWatch(room.heroIds, room.hostId, {
            resumed,
            // (a run started before rooms kept runInfo has only its map)
            run: { room: this.code, ...(room.runInfo ?? { map: room.mapId }), build: host?.build },
            names: new Map(room.members.map((m) => [m.id, m.name])),
            log: (entry) => {
                // An object, which Workers Logs keeps field by field
                console.warn(entry);
                if (entry.kind === "summary") {
                    const ended = this.endsCaught && entry.caught !== null;
                    this.reportCheck?.(checkReport(entry, "cloudflare", ended));
                }
            },
            caught: () => {
                watch.end = this.endsCaught;
            },
        });
        return watch;
    }

    // The run's checks, made again for a run already going (one started before
    // the room kept its heroes isn't checked)
    runWatch() {
        const room = this.room;
        if (!this.watch && room?.started && Array.isArray(room.heroIds)) {
            this.watch = this.newWatch(room, true);
        }
        return this.watch;
    }

    create(client, message) {
        if (client.kind !== "create" || this.room) {
            this.send(client, { t: "error", message: "Couldn't make that room. Try again." });
            this.closeSocket(client);
            return;
        }
        this.setMember(client, message.me ?? {});
        client.ready = false;
        client.token = randomToken();
        const now = Date.now();
        this.room = {
            code: this.code,
            name: client.roomName,
            open: message.open === true,
            hostId: client.id,
            mapId: cleanId(message.mapId) || "lumbridge",
            endless: message.endless === true,
            hard: message.hard === true,
            started: false,
            members: [client],
            order: now,
            lastActive: now,
        };
        this.startHeartbeat(this.room);
        this.remember(client);
        this.persist(true);
        this.broadcastRoom();
    }

    startHeartbeat(room, first = ROOM_HEARTBEAT_MS) {
        const beat = () => {
            if (this.room !== room) {
                return;
            }
            if (Date.now() - room.lastActive > IDLE_MS) {
                this.disband("idle");
                return;
            }
            this.tellLobby(true);
            // Mid-run nothing else saves it, and a room made again after a
            // restart would otherwise look idle since the run started
            if (room.lastActive !== this.savedActive) {
                this.save();
            }
            this.later("heartbeat", ROOM_HEARTBEAT_MS, beat);
            // When the next one's due, for the room made again after it's
            // been out of memory
            for (const member of room.members) {
                this.remember(member);
            }
        };
        this.later("heartbeat", first, beat);
    }

    join(client, message) {
        const room = this.room;
        const error = (text) => {
            this.send(client, { t: "error", message: text });
            this.closeSocket(client);
        };
        if (client.kind !== "join" || !room) {
            // A room the lobby still lists (it only sends players to one
            // that's said it's there), gone without telling it: off the list
            // now, rather than when it's gone quiet for long enough
            if (client.kind === "join" && !room) {
                this.lobby.roomGone(this.code).catch(() => {});
            }
            error(`There's no room ${this.code}.`);
            return;
        }
        if (this.kicked.has(client.address)) {
            error("The host has removed you from that room.");
            return;
        }
        if (room.started) {
            error("That room's run has already started.");
            return;
        }
        if (room.members.length >= MAX_PARTY) {
            error("That room is full.");
            return;
        }
        if (room.members.includes(client)) {
            return;
        }
        const missing = missingMap(
            this.anyMap,
            [{ client, unlocks: cleanUnlocks(message.me?.unlocks) }],
            room.mapId,
            room.endless,
            room.hard === true,
            client,
        );
        if (missing) {
            this.send(client, missing);
            this.closeSocket(client);
            return;
        }
        const host = room.members.find((member) => member.id === room.hostId);
        const build = typeof message.me?.build === "string" ? message.me.build.slice(0, 64) : "";
        if (host && build !== host.build) {
            error(OTHER_BUILD_TEXT);
            return;
        }
        this.setMember(client, message.me ?? {});
        client.ready = false;
        client.token = randomToken();
        this.remember(client);
        room.members.push(client);
        room.lastActive = Date.now();
        this.persist(true);
        this.broadcastRoom();
    }
}
