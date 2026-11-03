import { Sim } from "../../core/Sim";
import {
    CoopAction,
    FrameEvent,
    applyFrameEvent,
    cleanAction,
    cleanFrameEvent,
    cleanMove,
    cleanMoveSeq,
    quantizeMove,
    syncHash,
} from "../../core/lockstep";
import { MovementPrediction } from "./MovementPrediction";
import { DownMessage, UpMessage } from "./protocol";

// How often the host sends a check of its run, in frames
const HASH_FRAMES = 50;
// The host sends the frames that pass with nothing in them this many at a
// time (25 messages a second instead of 50), and anything with an event in
// it straight away
const QUIET_FRAMES = 2;
// A guest keeps about this many frames in hand, so a late message from the
// host doesn't stop it; with more than that it catches up
export const GUEST_BUFFER_FRAMES = 4;
// The host waits this long at most for everyone's map to load
const LOAD_WAIT_MS = 20_000;
// A move goes out this often at most: a touch stick changes nearly every
// frame, and each one sent is a message from the host to everyone
const MOVE_INTERVAL_MS = 66;
// Someone the run's waited on this long (a hidden tab, gone to make tea) has
// it decided for them: the first reward, taking the casket, or walking away
export const DECIDE_AFTER_MS = 20_000;
// The most a hero's actions can queue for one frame. It's more than a player
// can do, and with moves kept to the latest it keeps what the host sends small
// however much a guest sends while it waits.
const MAX_QUEUED_ACTIONS = 8;
// Actions that answer a decision (a level up, a casket, a random event), sent
// once for each: a double click or a second key press before the host's frame
// comes back is dropped
const DECISIONS: ReadonlySet<CoopAction["kind"]> = new Set([
    "choose",
    "reroll",
    "skip",
    "chest",
    "event",
    "leaveEvent",
]);
// After this long with the decision unchanged (the host turned the action
// away, or it was lost), it can be sent again: longer than a host stalls for
// (a tab in the background catching up), so a second answer in the wait
// can't land on the next decision, and well short of DECIDE_AFTER_MS
const DECISION_RESEND_MS = 10_000;
const RESEND_FRAMES = 1000;
const RESEND_ASK_MS = 1000;

export type CoopLink = {
    sendUp(message: UpMessage): void;
    sendDown(message: DownMessage): void;
    recoveryRequest?(): void;
    recoveryState?(frame: number, hash: number): void;
    recoveryFrames?(to: string, from: number, d: DownMessage): void;
    recoveryAck?(frame: number, hash: number): void;
    recoveryAbort?(): void;
};

// Plays a co-op run in lockstep (see core/lockstep.ts). The host steps when
// it likes and says what happened at each frame; a guest steps only as far as
// the host has said, sending what its player does to the host to go in.
export class CoopRun {
    recovering = false;
    private recoveryEnabled = false;
    private pausedAt = 0;
    private restorePrediction = false;
    private replayUntil?: number;
    private history: { from: number; message: DownMessage; bytes: number }[] = [];
    private historyHead = 0;
    private historyBytes = 0;
    private sent: DownMessage[] = [];
    private askedAt = -Infinity;
    private resendAsked?: number;
    private departed = new Set<string>();
    private actionSeq = 0;
    private actionRetryAt = 0;
    private pendingActions = new Map<number, CoopAction>();
    private acceptedActions = new Map<number, number>();
    // A guest's, while it's turned on (setPrediction)
    prediction?: MovementPrediction;
    // Frames stepped
    frame = 0;
    // The frames that are out (for a guest, what the host has sent so far)
    private upTo = 0;
    // A guest's events from the host still to apply, in order
    private incoming: FrameEvent[] = [];
    // The host's events for the next frame, and those to send
    private next: FrameEvent[] = [];
    private outgoing: FrameEvent[] = [];
    private outgoingHash?: [number, number];
    // The host's: the frames it's said are out
    private sentUpTo = 0;
    // A guest's checks from the host still to compare
    private hashes = new Map<number, number>();
    private lastMove: [number, number] = [0, 0];
    private moveSentAt = -Infinity;
    private moveSeqSent = 0;
    // The decision the local player last answered, and when
    private sentDecision?: { on: object; itemId?: string; at: number };
    // The host's: since when the run's been waiting on each hero
    private readonly waitingSince = new Map<number, number>();
    // The copies have gone apart (it's said once)
    desynced = false;
    // The host's: the guests whose map is still loading, and since when
    private readonly loading: Set<string>;
    private loadStart: number;

    constructor(
        readonly sim: Sim,
        readonly isHost: boolean,
        private readonly link: CoopLink,
        // Hero index by player id
        private readonly heroes: Map<string, number>,
        // The host's own id
        hostId: string,
        private readonly now: () => number = Date.now,
    ) {
        this.loading = new Set(isHost ? [...heroes.keys()].filter((id) => id !== hostId) : []);
        this.loadStart = now();
        if (!isHost) {
            this.prediction = new MovementPrediction(sim, now);
        }
    }

    // A guest's: whether its own movement is predicted on screen. Off, it sends
    // and shows only what the host confirms. Back on, it starts afresh.
    setPrediction(on: boolean): void {
        if (this.recovering) {
            this.restorePrediction = on && !this.isHost;
            return;
        }
        if (this.isHost || on === (this.prediction !== undefined)) {
            return;
        }
        this.prediction = on ? new MovementPrediction(this.sim, this.now) : undefined;
        this.moveSeqSent = 0;
    }

    // The host's: this hero's move or action for the next frame, with the
    // latest move replacing one that's waiting
    private queue(event: FrameEvent): boolean {
        if (event.move) {
            const waiting = this.next.find((e) => e.hero === event.hero && e.move);
            if (waiting) {
                waiting.move = event.move;
                waiting.moveSeq = event.moveSeq;
                return true;
            }
        } else if (
            this.next.filter((e) => e.hero === event.hero && e.action).length >= MAX_QUEUED_ACTIONS
        ) {
            return false;
        }
        this.next.push(event);
        return true;
    }

    // The host's: whether it's still waiting for someone's map to load
    get waitingForLoad(): boolean {
        if (
            !this.recovering &&
            this.loading.size > 0 &&
            this.now() - this.loadStart > LOAD_WAIT_MS
        ) {
            this.loading.clear();
        }
        return this.loading.size > 0;
    }

    // What the local player's pressing, sent on when it changes
    setMove(x: number, y: number): void {
        if (this.recovering) return;
        const move = quantizeMove(x, y);
        const moveSeq = this.prediction?.sample(move);
        const now = this.now();
        if (
            (move[0] === this.lastMove[0] &&
                move[1] === this.lastMove[1] &&
                (moveSeq === undefined || moveSeq === this.moveSeqSent)) ||
            now - this.moveSentAt < MOVE_INTERVAL_MS
        ) {
            return;
        }
        this.lastMove = move;
        this.moveSentAt = now;
        this.moveSeqSent = moveSeq ?? 0;
        if (this.isHost) {
            this.queue({ frame: 0, hero: this.sim.focus, move });
        } else {
            this.link.sendUp({ move, ...(moveSeq && { moveSeq }) });
        }
    }

    // Something the local player did, applied when the frame it's in comes.
    // False when it's a second answer to a decision already answered: the
    // first resolves it, and the second would land on the next one unseen.
    act(action: CoopAction): boolean {
        if (this.recovering || (!this.isHost && this.pendingActions.size >= MAX_QUEUED_ACTIONS))
            return false;
        if (DECISIONS.has(action.kind)) {
            const decision = this.decision();
            const now = this.now();
            const sent = this.sentDecision;
            if (
                decision &&
                sent &&
                sent.on === decision.on &&
                sent.itemId === decision.itemId &&
                now - sent.at < DECISION_RESEND_MS
            ) {
                return false;
            }
            this.sentDecision = decision && { ...decision, at: now };
        }
        if (this.isHost) {
            this.queue({ frame: 0, hero: this.sim.focus, action });
        } else {
            if (this.recoveryEnabled) {
                const actionSeq = ++this.actionSeq;
                if (this.pendingActions.size === 0) this.actionRetryAt = this.now() + 1000;
                this.pendingActions.set(actionSeq, action);
                this.link.sendUp({ action, actionSeq });
            } else this.link.sendUp({ action });
        }
        return true;
    }

    // What the local player is deciding on now: their level up's choices, the
    // casket in front of them (and its item, which a reroll changes), or a
    // random event's offer. Each is a new object once it's been answered.
    private decision(): { on: object; itemId?: string } | undefined {
        const sim = this.sim;
        switch (sim.state) {
            case "levelUp":
                return { on: sim.choices };
            case "chest":
                return sim.chest && { on: sim.chest, itemId: sim.chest.itemId };
            case "event":
                return sim.offer && { on: sim.offer };
            default:
                return undefined;
        }
    }

    // The host's: a guest's input, checked before it goes in, as every
    // copy applies it
    receiveUp(from: string, message: UpMessage): void {
        const hero = this.heroes.get(from);
        if (
            this.recovering ||
            !this.isHost ||
            hero === undefined ||
            !message ||
            typeof message !== "object"
        ) {
            return;
        }
        const move = "move" in message ? cleanMove(message.move) : undefined;
        const action = "action" in message ? cleanAction(message.action) : undefined;
        if ("loaded" in message) {
            this.loading.delete(from);
        } else if ("resend" in message) {
            const after = message.resend;
            // Nobody honest is further behind than what's kept, and an ask from
            // before it would only hold back the rest
            if (
                Number.isSafeInteger(after) &&
                this.sent.length > 0 &&
                (after as number) >= this.sent[0].from!
            ) {
                this.resendAsked = Math.min(this.resendAsked ?? Infinity, after as number);
                this.resendIfDue();
            }
        } else if (move) {
            const moveSeq = "moveSeq" in message ? cleanMoveSeq(message.moveSeq) : undefined;
            this.queue({ frame: 0, hero, move, ...(moveSeq !== undefined && { moveSeq }) });
        } else if (action) {
            if (this.recoveryEnabled) {
                const seq = "actionSeq" in message ? cleanMoveSeq(message.actionSeq) : undefined;
                if (seq === undefined || seq !== (this.acceptedActions.get(hero) ?? 0) + 1) return;
                if (this.queue({ frame: 0, hero, action, actionSeq: seq }))
                    this.acceptedActions.set(hero, seq);
            } else this.queue({ frame: 0, hero, action });
        }
    }

    // The host's: anyone the run's waited on for DECIDE_AFTER_MS has it
    // decided for them, and again each time after that
    private decideForTheSlow(): void {
        const sim = this.sim;
        const now = this.now();
        const waiting = new Set(sim.waitingOn.map((hero) => hero.index));
        for (const index of this.waitingSince.keys()) {
            if (!waiting.has(index)) {
                this.waitingSince.delete(index);
            }
        }
        for (const index of waiting) {
            const since = this.waitingSince.get(index) ?? now;
            this.waitingSince.set(index, since);
            if (now - since < DECIDE_AFTER_MS) {
                continue;
            }
            this.waitingSince.set(index, now);
            const action: CoopAction =
                sim.state === "levelUp"
                    ? { kind: "choose", index: 0 }
                    : sim.state === "chest"
                      ? { kind: "chest", action: "take" }
                      : { kind: "leaveEvent" };
            this.next.push({ frame: 0, hero: index, action, auto: true });
        }
    }

    // The host's: a guest left the game
    playerLeft(id: string): void {
        if (this.departed.has(id)) return;
        this.departed.add(id);
        this.loading.delete(id);
        const hero = this.heroes.get(id);
        if (this.isHost && hero !== undefined) {
            this.next.push({ frame: 0, hero, leave: true });
        }
    }

    // A guest's: the host's frames
    receiveDown(message: DownMessage): void {
        if (this.recovering) return;
        if (
            this.isHost ||
            !message ||
            !Array.isArray(message.events) ||
            !Number.isSafeInteger(message.upTo)
        ) {
            return;
        }
        if (message.upTo <= this.upTo) {
            // Had it already (sent again for someone else)
            return;
        }
        if (Number.isSafeInteger(message.from) && message.from! > this.upTo) {
            // Some went missing: these come again with them
            if (this.recoveryEnabled) {
                this.link.recoveryRequest?.();
                return;
            }
            const now = this.now();
            if (now - this.askedAt >= RESEND_ASK_MS) {
                this.askedAt = now;
                this.link.sendUp({ resend: this.upTo });
            }
            return;
        }
        for (const raw of message.events) {
            const event = cleanFrameEvent(raw, this.sim.heroes.length);
            // A resend asked for by a guest further behind starts before this
            // one's frames: those it has already (and may have applied)
            if (event && event.frame > this.upTo) {
                this.incoming.push(event);
            }
        }
        const hash: unknown = message.hash;
        if (Array.isArray(hash) && Number.isSafeInteger(hash[0]) && Number.isFinite(hash[1])) {
            this.hashes.set(hash[0], hash[1]);
        }
        this.upTo = Math.max(this.upTo, message.upTo);
    }

    // Whether the next frame can be stepped: always for the host, and for a
    // guest once the host has sent it
    canStep(): boolean {
        if (this.recovering)
            return !this.isHost && this.replayUntil !== undefined && this.frame < this.replayUntil;
        return this.isHost ? !this.waitingForLoad : this.frame < this.upTo;
    }

    // A guest's frames in hand
    get behind(): number {
        return this.upTo - this.frame;
    }

    // Steps a frame, applying what happened at it first. Returns the events
    // applied, for the client to follow up the local player's.
    stepFrame(): FrameEvent[] {
        const frame = this.frame + 1;
        let events: FrameEvent[];
        if (this.isHost) {
            this.decideForTheSlow();
            events = this.next.map((event) => ({ ...event, frame }));
            this.next = [];
            this.outgoing.push(...events);
        } else {
            let count = 0;
            while (count < this.incoming.length && this.incoming[count].frame <= frame) {
                count++;
            }
            events = this.incoming.splice(0, count);
        }
        for (const event of events) {
            applyFrameEvent(this.sim, event);
            if (event.hero === this.sim.focus && event.actionSeq)
                this.pendingActions.delete(event.actionSeq);
        }
        this.sim.step();
        this.prediction?.confirm(events);
        this.frame = frame;
        if (this.isHost) {
            this.upTo = frame;
            if (frame % HASH_FRAMES === 0) {
                this.outgoingHash = [frame, syncHash(this.sim)];
            }
        } else {
            const expected = this.hashes.get(frame);
            if (expected !== undefined) {
                this.hashes.delete(frame);
                if (expected !== syncHash(this.sim) && !this.desynced) {
                    this.desynced = true;
                    console.warn(`Co-op run out of step with the host at frame ${frame}`);
                }
            }
        }
        if (this.recovering && this.frame === this.replayUntil) {
            this.replayUntil = undefined;
            this.link.recoveryAck?.(this.frame, syncHash(this.sim));
        }
        return events;
    }

    // The host's: sends the frames stepped since last time (quiet ones once
    // there are a couple, unless everything's to go now)
    flush(everything = false): void {
        if (!this.recovering) this.resendIfDue();
        // The relay may shed a burst of guest input without closing the socket.
        // Retry only unacknowledged actions, so a sequence gap cannot wedge input.
        if (
            !this.isHost &&
            !this.recovering &&
            this.pendingActions.size &&
            this.now() >= this.actionRetryAt
        ) {
            this.resendActions();
        }
        if (
            !this.isHost ||
            this.upTo === this.sentUpTo ||
            (!everything && this.outgoing.length === 0 && this.upTo - this.sentUpTo < QUIET_FRAMES)
        ) {
            return;
        }
        const message: DownMessage = {
            from: this.sentUpTo,
            upTo: this.upTo,
            events: this.outgoing,
            ...(this.outgoingHash && { hash: this.outgoingHash }),
        };
        if (this.recoveryEnabled) {
            const bytes = JSON.stringify(message).length * 2;
            this.history.push({ from: this.sentUpTo, message, bytes });
            this.historyBytes += bytes;
            while (
                this.historyHead < this.history.length &&
                (this.historyBytes > 2 * 1024 * 1024 ||
                    this.history[this.historyHead].message.upTo < this.frame - 3000)
            ) {
                this.historyBytes -= this.history[this.historyHead].bytes;
                // Release events immediately, before the occasional array compaction.
                delete this.history[this.historyHead++];
            }
            if (this.historyHead > 1024) {
                this.history = this.history.slice(this.historyHead);
                this.historyHead = 0;
            }
        }
        this.link.sendDown(message);
        if (!this.recoveryEnabled) {
            this.sent.push(message);
            while (this.sent.length > 0 && this.upTo - this.sent[0].upTo > RESEND_FRAMES)
                this.sent.shift();
        }
        this.outgoing = [];
        this.outgoingHash = undefined;
        this.sentUpTo = this.upTo;
    }

    enableRecovery(): void {
        this.recoveryEnabled = true;
    }

    private resendActions(): void {
        this.actionRetryAt = this.now() + 1000;
        for (const [actionSeq, action] of this.pendingActions)
            this.link.sendUp({ action, actionSeq });
    }

    pauseForRecovery(): void {
        if (!this.recoveryEnabled) {
            this.link.recoveryAbort?.();
            return;
        }
        if (!this.recovering) {
            this.pausedAt = this.now();
            this.restorePrediction = !!this.prediction;
            this.prediction = undefined;
            // Retain even the final packet whose socket write may have been lost.
            this.flush(true);
        }
        this.recovering = true;
        this.replayUntil = undefined;
        if (!this.isHost) {
            this.upTo = this.frame;
            this.incoming = [];
            this.hashes.clear();
        }
    }

    reportRecoveryState(): void {
        if (this.recovering) this.link.recoveryState?.(this.frame, syncHash(this.sim));
    }

    replayTo(to: string, from: number, target: number): void {
        if (
            !this.isHost ||
            !this.recovering ||
            target !== this.frame ||
            from >= target ||
            from < 0 ||
            from < (this.history[this.historyHead]?.from ?? this.frame)
        ) {
            this.link.recoveryAbort?.();
            return;
        }
        let message: DownMessage = { upTo: from, events: [] };
        for (let i = this.historyHead; i < this.history.length; i++) {
            const packet = this.history[i];
            if (packet.message.upTo <= from) continue;
            const candidate: DownMessage = {
                upTo: packet.message.upTo,
                events: [
                    ...message.events,
                    ...packet.message.events.filter((event) => event.frame > from),
                ],
                hash: packet.message.hash ?? message.hash,
            };
            if (JSON.stringify(candidate).length > 8 * 1024) break;
            message = candidate;
        }
        if (message.upTo === from) this.link.recoveryAbort?.();
        else this.link.recoveryFrames?.(to, from, message);
    }

    receiveRecoveryFrames(from: number, message: DownMessage): void {
        if (from < this.frame) return; // Already applied before a repeated delivery.
        if (
            this.isHost ||
            !this.recovering ||
            this.replayUntil !== undefined ||
            from !== this.frame ||
            !Number.isSafeInteger(message?.upTo) ||
            message.upTo <= from ||
            message.upTo - from > 3000 ||
            !Array.isArray(message.events)
        ) {
            this.link.recoveryAbort?.();
            return;
        }
        const events = message.events.map((e) => cleanFrameEvent(e, this.sim.heroes.length));
        let previous = from + 1;
        for (const event of events) {
            if (!event || event.frame < previous || event.frame > message.upTo) {
                this.link.recoveryAbort?.();
                return;
            }
            previous = event.frame;
        }
        this.incoming = events as FrameEvent[];
        this.upTo = this.replayUntil = message.upTo;
    }

    resumeAfterRecovery(): void {
        if (!this.recovering) return;
        const elapsed = this.now() - this.pausedAt;
        this.loadStart += elapsed;
        for (const [hero, since] of this.waitingSince) this.waitingSince.set(hero, since + elapsed);
        if (this.sentDecision) this.sentDecision.at += elapsed;
        this.recovering = false;
        if (this.restorePrediction) this.prediction = new MovementPrediction(this.sim, this.now);
        this.moveSentAt = -Infinity;
        this.lastMove = [NaN, NaN];
        this.moveSeqSent = 0;
        if (!this.isHost) {
            this.link.sendUp({ loaded: true });
            this.resendActions();
        }
    }
    // The host's: the frames asked for, once RESEND_ASK_MS has passed since
    // the last resend. However many guests ask, and however often, it's one
    // message a second from the earliest frame asked for.
    private resendIfDue(): void {
        const after = this.resendAsked;
        const now = this.now();
        if (!this.isHost || after === undefined || now - this.askedAt < RESEND_ASK_MS) {
            return;
        }
        this.askedAt = now;
        this.resendAsked = undefined;
        this.resend(after);
    }

    // The host's: everything sent after a frame, again, as one message. Every
    // guest gets it; those that had some of it already take only the rest.
    private resend(after: number): void {
        // An honest ask is where a message starts. One that isn't still gets the
        // next one on, so that it can't swallow the honest asks made with it.
        const start = this.sent.findIndex((m) => m.from! >= after);
        if (start < 0) {
            return;
        }
        const missed = this.sent.slice(start);
        const hash = missed.findLast((m) => m.hash)?.hash;
        this.link.sendDown({
            from: missed[0].from,
            upTo: missed[missed.length - 1].upTo,
            events: missed.flatMap((m) => m.events),
            ...(hash && { hash }),
        });
    }

    // After the connection's come back: the next move goes out whatever it
    // is, in case the last one didn't make it
    resumed(): void {
        this.lastMove = [NaN, NaN];
        this.moveSentAt = -Infinity;
    }
}
