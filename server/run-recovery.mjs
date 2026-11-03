import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { RECOVERY_WINDOW_MS } from "./recovery-store.mjs";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const validFrame = (value) => Number.isSafeInteger(value) && value >= 0;
const validHash = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const OFFLINE = { send() {}, sendFrame() {}, write() {}, close() {} };
const fields = (member) => ({
    id: member.id,
    name: member.name,
    characterId: member.characterId,
    loadout: member.loadout,
    unlocks: member.unlocks,
    build: member.build,
    address: member.address,
    network: member.network,
});

export function createRunRecovery({
    store,
    rooms,
    playerNames,
    roomView,
    disband,
    hostCanSend,
    hostBurstBytes,
}) {
    const runs = new Map();
    let stopping = false;
    const send = (room, message) => {
        for (const member of room.members) if (member.connected) member.connection.send(message);
    };
    const save = (room) =>
        store.save({
            version: 1,
            runId: room.recovery.runId,
            build: room.recovery.build,
            deadline: room.recovery.deadline,
            room: { ...roomView(room), members: undefined, kicked: [...room.kicked] },
            members: room.members.map((m) => ({
                ...fields(m),
                tokenHash: room.recovery.tokens.get(m.id),
            })),
        });
    const forget = (room) => {
        const recovery = room.recovery;
        if (!recovery) return;
        clearTimeout(recovery.timer);
        for (const timer of recovery.retries.values()) clearTimeout(timer);
        runs.delete(recovery.runId);
        room.recovery = undefined;
        try {
            store.remove(recovery.runId);
        } catch (error) {
            console.error(`Co-op recovery record could not be removed: ${error.message}`);
        }
        for (const member of room.members) if (!member.connected) playerNames.delete(member.name);
    };
    const fail = (room) => disband(room, "recoveryFailed");
    const persist = (room) => {
        try {
            save(room);
            return true;
        } catch (error) {
            console.error(`Co-op recovery unavailable: ${error.message}`);
            fail(room);
            return false;
        }
    };
    const make = (runId, build, tokens) => ({
        runId,
        build,
        tokens,
        states: new Map(),
        flights: new Map(),
        retries: new Map(),
    });
    const arm = (room) => {
        clearTimeout(room.recovery.timer);
        room.recovery.timer = setTimeout(
            () => fail(room),
            Math.max(0, room.recovery.deadline - Date.now()),
        );
        room.recovery.timer.unref();
    };
    const synchronize = (room) => {
        if (room.members.every((m) => m.connected)) {
            send(room, {
                t: "recoverySync",
                runId: room.recovery.runId,
                epoch: room.recovery.epoch,
            });
        }
    };
    const pause = (room) => {
        const recovery = room.recovery;
        recovery.deadline ??= Date.now() + RECOVERY_WINDOW_MS;
        recovery.epoch = randomBytes(8).toString("hex");
        recovery.states.clear();
        recovery.flights.clear();
        for (const timer of recovery.retries.values()) clearTimeout(timer);
        recovery.retries.clear();
        arm(room);
        if (!persist(room)) return;
        send(room, {
            t: "recovering",
            runId: recovery.runId,
            epoch: recovery.epoch,
            remainingMs: Math.max(0, recovery.deadline - Date.now()),
        });
        synchronize(room);
    };
    const next = (room, member) => {
        const recovery = room.recovery;
        const state = recovery.states.get(member.id);
        const hostState = recovery.states.get(room.hostId);
        room.members
            .find((m) => m.id === room.hostId)
            ?.connection.send({
                t: "recoveryReplay",
                runId: recovery.runId,
                epoch: recovery.epoch,
                to: member.id,
                frame: state.frame,
                target: hostState.frame,
            });
    };
    const finish = (room) => {
        const recovery = room.recovery;
        const host = recovery.states.get(room.hostId);
        if (!host || recovery.states.size !== room.members.length) return;
        if (
            room.members.some((m) => {
                const state = recovery.states.get(m.id);
                return !m.connected || state.frame !== host.frame || state.hash !== host.hash;
            })
        )
            return;
        const epoch = recovery.epoch;
        recovery.deadline = undefined;
        clearTimeout(recovery.timer);
        if (persist(room)) send(room, { t: "recoveryDone", runId: recovery.runId, epoch });
    };

    // Restored seats do not count as connected sockets. Their tokens are never broadcast.
    let nextId = 1;
    for (const record of store.records) {
        const { room: view, members } = record;
        if (
            !view ||
            !/^[A-Z2-9]{8}$/.test(view.code) ||
            typeof view.name !== "string" ||
            typeof record.build !== "string" ||
            !Array.isArray(members) ||
            members.length < 1 ||
            members.length > 4 ||
            members.some((m) => !m || typeof m !== "object") ||
            new Set(members.map((m) => m.id)).size !== members.length ||
            !members.some((m) => m.id === view.hostId) ||
            members.some(
                (m) =>
                    !/^p\d{1,12}$/.test(m.id) ||
                    typeof m.name !== "string" ||
                    !/^[a-f0-9]{64}$/.test(m.tokenHash),
            )
        ) {
            throw new Error("Invalid persisted co-op room");
        }
    }
    for (const record of store.records) {
        const { room: view, members } = record;
        const room = {
            code: view.code,
            name: view.name,
            hostId: view.hostId,
            mapId: view.mapId,
            open: view.open === true,
            endless: view.endless === true,
            hard: view.hard === true,
            started: true,
            order: 0,
            lastActive: Date.now(),
            kicked: new Set(view.kicked),
            hostBytes: hostBurstBytes,
            hostBytesAt: Date.now(),
            members: members.map((m) => ({
                ...fields(m),
                ready: false,
                recoveryVersion: 1,
                connection: OFFLINE,
                connected: false,
            })),
            recovery: make(
                record.runId,
                record.build,
                new Map(members.map((m) => [m.id, m.tokenHash])),
            ),
        };
        room.recovery.deadline = record.deadline;
        for (const member of room.members) {
            member.room = room;
            playerNames.add(member.name);
            nextId = Math.max(nextId, Number(member.id.slice(1)) + 1);
        }
        rooms.set(room.code, room);
        runs.set(record.runId, room);
        arm(room);
    }

    return {
        nextId,
        start(room) {
            if (!room.members.every((m) => m.recoveryVersion === 1 && typeof m.build === "string"))
                return;
            const tokens = new Map(
                room.members.map((m) => [m.id, randomBytes(32).toString("hex")]),
            );
            room.recovery = make(
                randomBytes(16).toString("hex"),
                room.members[0].build,
                new Map([...tokens].map(([id, token]) => [id, hashToken(token)])),
            );
            try {
                save(room);
            } catch (error) {
                console.error(`Co-op recovery unavailable: ${error.message}`);
                room.recovery = undefined;
                return;
            }
            runs.set(room.recovery.runId, room);
            return tokens;
        },
        end: forget,
        changed(room) {
            if (!room.recovery) return;
            if (room.recovery.deadline) {
                fail(room);
                return;
            }
            for (const id of room.recovery.tokens.keys())
                if (!room.members.some((m) => m.id === id)) room.recovery.tokens.delete(id);
            persist(room);
        },
        disconnect(client) {
            const room = client.room;
            client.connected = false;
            if (!room?.recovery) return false;
            if (!stopping) pause(room);
            return true;
        },
        handle(client, message, payload) {
            if (message.t === "resume") {
                const reject = () => client.connection.send({ t: "resumeRejected" });
                client.resumeAttempts = (client.resumeAttempts ?? 0) + 1;
                if (client.resumeAttempts > 4) {
                    client.connection.close(1008);
                    return true;
                }
                const room = runs.get(message.runId);
                if (
                    client.room ||
                    !room?.recovery ||
                    message.protocol !== 1 ||
                    message.build !== room.recovery.build ||
                    typeof message.token !== "string" ||
                    !/^[a-f0-9]{64}$/.test(message.token) ||
                    (room.recovery.deadline && Date.now() >= room.recovery.deadline)
                ) {
                    reject();
                    return true;
                }
                const digest = Buffer.from(hashToken(message.token), "hex");
                const member = room.members.find((m) =>
                    timingSafeEqual(digest, Buffer.from(room.recovery.tokens.get(m.id), "hex")),
                );
                if (!member) {
                    reject();
                    return true;
                }
                const restored = fields(member);
                if (member.connected) {
                    member.room = undefined;
                    member.name = "";
                    member.connection.close(1000);
                }
                playerNames.delete(client.name);
                // Keep the new socket and network accounting; recover only the reserved identity.
                const { address, network, ...identity } = restored;
                Object.assign(client, identity, {
                    room,
                    connected: true,
                    ready: false,
                    recoveryVersion: 1,
                });
                room.members[room.members.indexOf(member)] = client;
                playerNames.add(client.name);
                client.connection.send({
                    t: "resumed",
                    runId: room.recovery.runId,
                    room: roomView(room),
                    you: client.id,
                });
                pause(room);
                return true;
            }
            if (
                !["recoveryState", "recoveryFrames", "recoveryAck", "recoveryAbort"].includes(
                    message.t,
                )
            )
                return false;
            const room = client.room;
            const recovery = room?.recovery;
            if (
                !recovery?.deadline ||
                message.runId !== recovery.runId ||
                message.epoch !== recovery.epoch
            )
                return true;
            if (Date.now() >= recovery.deadline) {
                fail(room);
                return true;
            }
            if (message.t === "recoveryAbort") {
                fail(room);
                return true;
            }
            if (message.t === "recoveryState") {
                if (
                    !validFrame(message.frame) ||
                    !validHash(message.hash) ||
                    recovery.states.has(client.id)
                )
                    return true;
                recovery.states.set(client.id, { frame: message.frame, hash: message.hash });
                if (recovery.states.size !== room.members.length) return true;
                const host = recovery.states.get(room.hostId);
                for (const member of room.members) {
                    const state = recovery.states.get(member.id);
                    if (
                        state.frame > host.frame ||
                        (state.frame === host.frame && state.hash !== host.hash)
                    ) {
                        fail(room);
                        return true;
                    }
                    if (state.frame < host.frame) next(room, member);
                }
                finish(room);
            } else if (message.t === "recoveryFrames" && client.id === room.hostId) {
                const member = room.members.find(
                    (m) => m.id === message.to && m.id !== room.hostId,
                );
                const state = member && recovery.states.get(member.id);
                const host = recovery.states.get(room.hostId);
                if (
                    !state ||
                    !host ||
                    recovery.flights.has(member.id) ||
                    recovery.retries.has(member.id) ||
                    payload.length > 16 * 1024 ||
                    message.from !== state.frame ||
                    !validFrame(message.d?.upTo) ||
                    message.d.upTo <= state.frame ||
                    message.d.upTo > host.frame ||
                    message.d.upTo - state.frame > 6000 ||
                    !Array.isArray(message.d.events)
                )
                    return true;
                if (!hostCanSend(room, payload.length)) {
                    const epoch = recovery.epoch;
                    const timer = setTimeout(() => {
                        recovery.retries.delete(member.id);
                        if (
                            room.recovery === recovery &&
                            recovery.epoch === epoch &&
                            recovery.deadline
                        )
                            next(room, member);
                    }, 250);
                    timer.unref();
                    recovery.retries.set(member.id, timer);
                    return true;
                }
                recovery.flights.set(member.id, message.d.upTo);
                member.connection.send({
                    t: "recoveryFrames",
                    runId: recovery.runId,
                    epoch: recovery.epoch,
                    from: state.frame,
                    d: message.d,
                });
            } else if (message.t === "recoveryAck" && client.id !== room.hostId) {
                if (
                    !recovery.flights.has(client.id) ||
                    message.frame !== recovery.flights.get(client.id) ||
                    !validHash(message.hash)
                )
                    return true;
                recovery.flights.delete(client.id);
                recovery.states.set(client.id, { frame: message.frame, hash: message.hash });
                const host = recovery.states.get(room.hostId);
                if (message.frame === host.frame) {
                    if (message.hash !== host.hash) fail(room);
                    else finish(room);
                } else next(room, client);
            }
            return true;
        },
        close() {
            stopping = true;
            for (const room of runs.values()) {
                clearTimeout(room.recovery.timer);
                for (const timer of room.recovery.retries.values()) clearTimeout(timer);
            }
            store.close();
        },
    };
}
