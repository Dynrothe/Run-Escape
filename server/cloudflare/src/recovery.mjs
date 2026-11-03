import { randomToken } from "./shared.mjs";

export const RECOVERY_WINDOW_MS = 60_000;
export const GUEST_HOLD_MS = 15_000;
const MAX_SEAT_EPISODES = 3;
const MAX_RUN_EPISODES = 12;
const EPISODE_COOLDOWN_MS = 30_000;
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
        this.epoch = undefined;
    }

    start() {
        this.clear();
        const room = this.owner.room;
        if (!room.members.every((m) => m.recoveryVersion === 1 && typeof m.build === "string"))
            return;
        room.recovery = {
            protocol: 1,
            runId: randomToken(),
            build: room.members[0].build,
            episodes: 0,
        };
        for (const member of room.members) {
            member.recoveryEpisodes = 0;
            member.recoveryAt = undefined;
            member.forwardedUpTo = 0;
            member.gap = undefined;
        }
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

    // A client can cause only a bounded number of pauses. Real object resets
    // (no initiator) do not consume this allowance, including in long endless runs.
    pause(initiator) {
        const record = this.record;
        if (!record) return false;
        if (!record.deadline) {
            if (
                initiator &&
                ((record.episodes ?? 0) >= MAX_RUN_EPISODES ||
                    (initiator.recoveryEpisodes ?? 0) >= MAX_SEAT_EPISODES ||
                    Date.now() - (initiator.recoveryAt ?? -Infinity) < EPISODE_COOLDOWN_MS)
            ) {
                this.reject(initiator);
                return false;
            }
            if (initiator) {
                record.episodes = (record.episodes ?? 0) + 1;
                initiator.recoveryEpisodes = (initiator.recoveryEpisodes ?? 0) + 1;
                initiator.recoveryAt = Date.now();
            }
            record.deadline = Date.now() + RECOVERY_WINDOW_MS;
            this.owner.persist();
        }
        if (Date.now() >= record.deadline) {
            this.expire();
            return false;
        }
        if (!this.epoch) {
            this.epoch = randomToken(8);
            this.bytes = 128 * 1024;
            this.bytesAt = Date.now();
            for (const member of this.owner.room.members) this.synchronize(member);
        }
        this.arm();
        return true;
    }

    synchronize(member) {
        if (!member.socket || !this.record?.deadline) return;
        this.owner.send(member, {
            t: "recovering",
            runId: this.record.runId,
            epoch: this.epoch,
            remainingMs: Math.max(0, this.record.deadline - Date.now()),
        });
        this.owner.send(member, { t: "recoverySync", runId: this.record.runId, epoch: this.epoch });
    }

    forget(member) {
        this.states.delete(member.id);
        this.flights.delete(member.id);
        clearTimeout(this.retries.get(member.id));
        this.retries.delete(member.id);
    }

    disconnected(member) {
        this.forget(member);
        if (!this.pause(member)) return;
        const host = this.owner.room.members.find((m) => m.id === this.owner.room.hostId);
        if (member.awayUntil === undefined) {
            member.awayUntil = Math.min(
                this.record.deadline,
                Date.now() + (member !== host && host.socket ? GUEST_HOLD_MS : RECOVERY_WINDOW_MS),
            );
            this.owner.persist();
        }
        this.arm();
    }

    restored() {
        if (!this.pause()) return;
        for (const member of this.owner.room.members) member.awayUntil ??= this.record.deadline;
        this.arm();
    }

    resumed(member) {
        this.forget(member);
        const wasPaused = !!this.epoch;
        if (!this.pause(member)) return;
        if (wasPaused) this.synchronize(member);
    }

    removed(member) {
        this.forget(member);
        if (this.record?.deadline) {
            this.progress();
            this.arm();
        }
    }

    reject(member) {
        if (member.id === this.owner.room.hostId) this.fail();
        else this.owner.leaveRoom(member, "recoveryFailed");
    }

    matches(member, host = this.states.get(this.owner.room.hostId)) {
        const state = this.states.get(member.id);
        return !!(
            host &&
            member.socket &&
            state &&
            state.frame === host.frame &&
            state.hash === host.hash
        );
    }

    arm() {
        clearTimeout(this.timer);
        const record = this.record;
        if (!record?.deadline) return;
        const now = Date.now();
        // Leave a small delivery margin for removing stalled guests and sending
        // Done before clients' fixed deadline. The host still has the full window.
        const deadlines = [record.deadline];
        if (record.deadline - 1000 > now) deadlines.push(record.deadline - 1000);
        for (const m of this.owner.room.members)
            if (m.id !== this.owner.room.hostId && m.awayUntil !== undefined && !this.matches(m))
                deadlines.push(Math.max(now, m.awayUntil));
        this.timer = setTimeout(
            () =>
                this.owner.atomic(() => {
                    if (this.record === record && record.deadline) this.expire();
                }),
            Math.max(0, Math.min(...deadlines) - now),
        );
    }

    expire() {
        const room = this.owner.room;
        const record = this.record;
        if (!record?.deadline) return;
        const host = room.members.find((m) => m.id === room.hostId);
        const now = Date.now();
        if (now >= record.deadline && (!host.socket || !this.states.has(host.id))) {
            this.fail();
            return;
        }
        for (const member of [...room.members]) {
            if (member === host || this.matches(member)) continue;
            if (
                (member.awayUntil && now >= member.awayUntil) ||
                (now >= record.deadline - 1000 && host.socket && this.states.has(host.id))
            )
                this.reject(member);
            if (this.owner.room !== room || !record.deadline) return;
        }
        this.progress();
        this.arm();
    }

    progress() {
        const room = this.owner.room;
        const record = this.record;
        if (!record?.deadline || this.progressing) return;
        const host = this.states.get(room.hostId);
        if (!host || !room.members.find((m) => m.id === room.hostId)?.socket) return;
        this.progressing = true;
        try {
            for (const member of [...room.members]) {
                if (member.id === room.hostId) continue;
                const state = this.states.get(member.id);
                if (!state || !member.socket) continue;
                if (
                    state.frame > host.frame ||
                    (state.frame === host.frame && state.hash !== host.hash)
                ) {
                    this.reject(member);
                } else if (
                    state.frame < host.frame &&
                    !this.flights.has(member.id) &&
                    !this.retries.has(member.id)
                ) {
                    this.next(member);
                }
            }
            this.finish();
        } finally {
            this.progressing = false;
        }
    }

    // A request must match a gap the relay itself observed in the host stream.
    // Clients cannot prove socket delivery; arbitrary claims must not pause peers.
    forwarded(member, d) {
        if (!this.record || !validFrame(d?.from) || !validFrame(d?.upTo)) return;
        const previous = member.forwardedUpTo ?? 0;
        if (d.from > previous) member.gap = { frame: previous, from: d.from, upTo: d.upTo };
        member.forwardedUpTo = Math.max(previous, d.upTo);
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
        for (const member of room.members) {
            member.awayUntil = undefined;
            member.forwardedUpTo = host.frame;
            member.gap = undefined;
        }
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
            if (!record.deadline) {
                const gap = client.gap;
                if (
                    client.id === this.owner.room.hostId ||
                    !gap ||
                    message.frame !== gap.frame ||
                    message.from !== gap.from ||
                    message.upTo !== gap.upTo
                )
                    this.reject(client);
                else {
                    client.gap = undefined;
                    this.pause(client);
                }
            }
            return true;
        }
        if (!record.deadline || message.epoch !== this.epoch) return true;
        if (Date.now() >= record.deadline) {
            this.expire();
            return true;
        }
        const room = this.owner.room;
        if (message.t === "recoveryAbort") {
            const target =
                client.id === room.hostId && typeof message.to === "string"
                    ? room.members.find((m) => m.id === message.to && m !== client)
                    : client;
            if (target) this.reject(target);
            return true;
        }
        if (message.t === "recoveryState") {
            if (!validFrame(message.frame) || !validHash(message.hash)) {
                this.reject(client);
                return true;
            }
            if (this.states.has(client.id)) return true;
            this.states.set(client.id, { frame: message.frame, hash: message.hash });
            this.progress();
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
            this.progress();
        }
        return true;
    }
}
