import { randomToken } from "./shared.mjs";

export const RECOVERY_WINDOW_MS = 60_000;
const validFrame = (n) => Number.isSafeInteger(n) && n >= 0;
const validHash = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

// The relay retains identities and the deadline, never game state. The host's
// open tab supplies bounded frame history; every tab must agree before resuming.
export class RunRecovery {
    constructor(owner) {
        this.owner = owner;
        this.states = new Map();
        this.flights = new Map();
        this.retries = new Map();
    }

    get record() {
        return this.owner.room?.recovery;
    }

    clear() {
        clearTimeout(this.timer);
        for (const timer of this.retries.values()) clearTimeout(timer);
        this.retries.clear();
        this.flights.clear();
        this.states.clear();
    }

    start() {
        this.clear();
        const room = this.owner.room;
        if (!room.members.every((m) => m.recoveryVersion === 1 && typeof m.build === "string"))
            return;
        room.recovery = { protocol: 1, runId: randomToken(), build: room.members[0].build };
    }

    credentials(member) {
        const record = this.record;
        return (
            record && {
                protocol: 1,
                runId: record.runId,
                token: member.token,
                windowMs: RECOVERY_WINDOW_MS,
            }
        );
    }

    broadcast(message) {
        for (const member of this.owner.room.members) this.owner.send(member, message);
    }

    fail() {
        this.owner.disband("recoveryFailed");
    }

    pause() {
        const record = this.record;
        if (!record) return;
        this.clear();
        record.deadline ??= Date.now() + RECOVERY_WINDOW_MS;
        if (Date.now() >= record.deadline) {
            this.fail();
            return;
        }
        this.epoch = randomToken(8);
        this.bytes = 128 * 1024;
        this.bytesAt = Date.now();
        this.timer = setTimeout(
            () => this.owner.atomic(() => this.fail()),
            record.deadline - Date.now(),
        );
        this.owner.persist();
        this.broadcast({
            t: "recovering",
            runId: record.runId,
            epoch: this.epoch,
            remainingMs: record.deadline - Date.now(),
        });
        if (this.owner.room.members.every((m) => m.socket))
            this.broadcast({ t: "recoverySync", runId: record.runId, epoch: this.epoch });
    }

    next(member) {
        const room = this.owner.room;
        const host = room.members.find((m) => m.id === room.hostId);
        this.owner.send(host, {
            t: "recoveryReplay",
            runId: this.record.runId,
            epoch: this.epoch,
            to: member.id,
            frame: this.states.get(member.id).frame,
            target: this.states.get(room.hostId).frame,
        });
    }

    finish() {
        const room = this.owner.room;
        const host = this.states.get(room.hostId);
        if (
            !host ||
            this.states.size !== room.members.length ||
            room.members.some((m) => {
                const state = this.states.get(m.id);
                return !m.socket || state.frame !== host.frame || state.hash !== host.hash;
            })
        )
            return;
        const message = { t: "recoveryDone", runId: this.record.runId, epoch: this.epoch };
        this.record.deadline = undefined;
        this.clear();
        this.owner.persist();
        this.broadcast(message);
    }

    handle(client, message, text) {
        if (typeof message.t !== "string" || !message.t.startsWith("recovery")) return false;
        const record = this.record;
        if (!record || message.runId !== record.runId) return true;
        if (message.t === "recoveryRequest") {
            if (!record.deadline) this.pause();
            return true;
        }
        if (!record.deadline || message.epoch !== this.epoch) return true;
        if (Date.now() >= record.deadline || message.t === "recoveryAbort") {
            this.fail();
            return true;
        }
        const room = this.owner.room;
        // A report is meaningful only after all connections have been fenced
        // and the same epoch's synchronization request has been sent.
        if (!room.members.every((m) => m.socket)) return true;
        if (message.t === "recoveryState") {
            if (
                !validFrame(message.frame) ||
                !validHash(message.hash) ||
                this.states.has(client.id)
            )
                return true;
            this.states.set(client.id, { frame: message.frame, hash: message.hash });
            if (this.states.size !== room.members.length) return true;
            const host = this.states.get(room.hostId);
            for (const member of room.members) {
                const state = this.states.get(member.id);
                if (
                    state.frame > host.frame ||
                    (state.frame === host.frame && state.hash !== host.hash)
                ) {
                    this.fail();
                    return true;
                }
                if (state.frame < host.frame) this.next(member);
            }
            this.finish();
        } else if (message.t === "recoveryFrames" && client.id === room.hostId) {
            const member = room.members.find((m) => m.id === message.to && m.id !== room.hostId);
            const state = member && this.states.get(member.id);
            const host = this.states.get(room.hostId);
            if (
                !state ||
                !host ||
                this.flights.has(member.id) ||
                this.retries.has(member.id) ||
                text.length * 2 > 32 * 1024 ||
                message.from !== state.frame ||
                !validFrame(message.d?.upTo) ||
                message.d.upTo <= state.frame ||
                message.d.upTo > host.frame ||
                message.d.upTo - state.frame > 3000 ||
                !Array.isArray(message.d.events)
            )
                return true;
            const now = Date.now();
            this.bytes = Math.min(
                128 * 1024,
                this.bytes + ((now - this.bytesAt) * 64 * 1024) / 1000,
            );
            this.bytesAt = now;
            const bytes = text.length * 2;
            if (bytes > this.bytes) {
                const epoch = this.epoch;
                this.retries.set(
                    member.id,
                    setTimeout(() => {
                        this.retries.delete(member.id);
                        if (this.record === record && this.epoch === epoch && record.deadline)
                            this.next(member);
                    }, 250),
                );
                return true;
            }
            this.bytes -= bytes;
            this.flights.set(member.id, message.d.upTo);
            this.owner.send(member, {
                t: "recoveryFrames",
                runId: record.runId,
                epoch: this.epoch,
                from: state.frame,
                d: message.d,
            });
        } else if (message.t === "recoveryAck" && client.id !== room.hostId) {
            if (
                !this.flights.has(client.id) ||
                message.frame !== this.flights.get(client.id) ||
                !validHash(message.hash)
            )
                return true;
            this.flights.delete(client.id);
            this.states.set(client.id, { frame: message.frame, hash: message.hash });
            const host = this.states.get(room.hostId);
            if (message.frame === host.frame) {
                if (message.hash !== host.hash) this.fail();
                else this.finish();
            } else this.next(client);
        }
        return true;
    }
}
