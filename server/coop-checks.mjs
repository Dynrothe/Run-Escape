// What both co-op relays (coop-relay.mjs and cloudflare/) check of a run's
// frames: what no honest host's game sends, and that lag, a slow device, a
// dropped connection or a restart can't explain.

// Sim.ts's TICKS_PER_SECOND. An honest host steps in real time at most: it
// loses time on a stall rather than making it up.
const TICKS_PER_SECOND = 50;
const TICK_MS = 1000 / TICKS_PER_SECOND;

// Each kind, and how many of it in a run is enough to end the run, when the
// relay's set to (see endsCaughtRuns)
const STRIKES = { ahead: 25, move: 3, action: 3, auto: 3 };
export const RUN_CHECKS = Object.keys(STRIKES);

const AHEAD_MS = 5000;
const CLOCK_MS = 10_000;
// Well short of DECIDE_AFTER_MS in CoopRun.ts
const AUTO_AFTER_MS = 10_000;
const KEEP_MS = 60_000;
const KEEP_MOVES = 512;
const KEEP_ACTIONS = 64;
// A watch made again mid-run (a restart or a deploy) doesn't know what came
// before, which frames the host held meanwhile still carry: longer than a
// dropped player's place is held, and their game's retries
const RESUMED_MS = 25_000;
const REPORT_EVERY_MS = 60_000;

// MULTIPLAYER_RUN_CHECKS=end: a run whose host is caught ends. Otherwise
// it's only logged.
export function endsCaughtRuns(env) {
    return (env?.MULTIPLAYER_RUN_CHECKS ?? "").toLowerCase() === "end";
}

// The run's heroes' ids from the host's start, in the order every game
// numbers them, or undefined for one no game would play
export function heroIdsOf(game, maxParty) {
    const heroes = game && typeof game === "object" ? game.heroes : undefined;
    if (!Array.isArray(heroes) || heroes.length === 0 || heroes.length > maxParty) {
        return undefined;
    }
    const ids = heroes.map((hero) => (hero && typeof hero === "object" ? hero.id : undefined));
    return ids.every((id) => typeof id === "string" && id.length <= 64) ? ids : undefined;
}

// ---- What a guest sent, as the host takes it (core/lockstep.ts) ----

const MOVE_STEPS = 127;

function quantize(v) {
    return Math.max(-MOVE_STEPS, Math.min(MOVE_STEPS, Math.round(v * MOVE_STEPS)));
}

// cleanMove's
export function cleanMove(value) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
        return undefined;
    }
    const length = Math.sqrt(value[0] * value[0] + value[1] * value[1]);
    const scale = length > MOVE_STEPS + 2 ? MOVE_STEPS / length : 1;
    return [quantize((value[0] * scale) / MOVE_STEPS), quantize((value[1] * scale) / MOVE_STEPS)];
}

const INDEXED = new Set(["choose", "item", "event", "banish"]);
const PLAIN = new Set(["reroll", "skip", "banishChest", "leaveEvent", "ability"]);
const CHEST_ACTIONS = new Set(["take", "use", "alch"]);

// cleanAction's, as a key to compare by
export function actionKey(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const { kind, index, action } = value;
    if (INDEXED.has(kind)) {
        return Number.isInteger(index) && index >= 0 && index < 64 ? `${kind}:${index}` : undefined;
    }
    if (PLAIN.has(kind)) {
        return kind;
    }
    if (kind === "chest") {
        return CHEST_ACTIONS.has(action) ? `chest:${action}` : undefined;
    }
    return undefined;
}

function moveKey(move) {
    const clean = cleanMove(move);
    return clean && `${clean[0]},${clean[1]}`;
}

function isSeq(value) {
    return Number.isSafeInteger(value) && value > 0;
}

// ---- Watching the host's frames ----

export class RunWatch {
    // report(kind, detail) hears of a kind once a minute at most; caught(kind)
    // once, when a kind has had its STRIKES. resumed: made again mid-run.
    constructor(heroIds, hostId, { report, caught, now = Date.now(), resumed = false }) {
        this.heroIds = heroIds;
        this.report = report;
        this.caught = caught;
        this.from = resumed ? now + RESUMED_MS : now;
        this.guests = new Map();
        for (const id of heroIds) {
            if (id !== hostId && !this.guests.has(id)) {
                this.guests.set(id, {
                    // Each direction sent, by when it last was
                    moves: new Map(),
                    actions: [],
                    // When they were last decided for. Not timed from their
                    // answers: a banish or reroll leaves the host waiting.
                    autoAt: resumed ? -Infinity : now,
                });
            }
        }
        // When frame 0 was, by the frames' word, until it's fixed
        this.zeroAt = undefined;
        this.clockFrom = undefined;
        // Frames sent again repeat ones already seen
        this.checkedUpTo = 0;
        this.reportedAt = new Map();
        this.counts = {};
        this.isCaught = false;
    }

    flag(kind, detail, now) {
        const count = (this.counts[kind] ?? 0) + 1;
        this.counts[kind] = count;
        const last = this.reportedAt.get(kind);
        if (last === undefined || now - last >= REPORT_EVERY_MS) {
            this.reportedAt.set(kind, now);
            this.report?.(kind, { ...detail, count });
        }
        if (!this.isCaught && count >= STRIKES[kind]) {
            this.isCaught = true;
            this.caught?.(kind);
        }
    }

    // A guest's input, once the host has it (not while its connection's down)
    up(id, d, now = Date.now()) {
        const guest = this.guests.get(id);
        if (!guest || !d || typeof d !== "object") {
            return;
        }
        if ("move" in d) {
            const key = moveKey(d.move);
            if (key) {
                // Newest last, so the oldest goes first
                guest.moves.delete(key);
                guest.moves.set(key, now);
                if (guest.moves.size > KEEP_MOVES) {
                    guest.moves.delete(guest.moves.keys().next().value);
                }
            }
        } else if ("action" in d) {
            const key = actionKey(d.action);
            if (!key) {
                return;
            }
            const seq = isSeq(d.actionSeq) ? d.actionSeq : undefined;
            // Sent again after a dropped connection: the host takes it once
            if (seq !== undefined && guest.actions.some((a) => a.seq === seq)) {
                return;
            }
            guest.actions.push({ key, seq, at: now });
            if (guest.actions.length > KEEP_ACTIONS) {
                guest.actions.shift();
            }
        }
    }

    // The host's frames, as they went to the guests
    down(d, now = Date.now()) {
        if (!d || typeof d !== "object" || !Number.isSafeInteger(d.upTo)) {
            return;
        }
        if (d.upTo <= this.checkedUpTo) {
            return;
        }
        if (now >= this.from) {
            this.checkClock(d.upTo, now);
            if (Array.isArray(d.events)) {
                for (const event of d.events) {
                    if (
                        event &&
                        typeof event === "object" &&
                        Number.isSafeInteger(event.frame) &&
                        event.frame > this.checkedUpTo
                    ) {
                        this.checkEvent(event, now);
                    }
                }
            }
        }
        this.checkedUpTo = d.upTo;
    }

    // Each message says when frame 0 was, give or take how long it took to
    // come and any time the host lost. The earliest is the closest; frames
    // running fast say ever earlier.
    checkClock(upTo, now) {
        const zeroAt = now - upTo * TICK_MS;
        this.clockFrom ??= now;
        if (now - this.clockFrom < CLOCK_MS) {
            this.zeroAt = Math.min(this.zeroAt ?? Infinity, zeroAt);
        } else if (this.zeroAt - zeroAt > AHEAD_MS) {
            this.flag("ahead", { frames: Math.round((this.zeroAt - zeroAt) / TICK_MS) }, now);
        }
    }

    checkEvent(event, now) {
        const id = this.heroIds[event.hero];
        const guest = id === undefined ? undefined : this.guests.get(id);
        if (!guest || event.leave === true) {
            return;
        }
        while (guest.actions.length > 0 && now - guest.actions[0].at > KEEP_MS) {
            guest.actions.shift();
        }
        if (event.move !== undefined) {
            const sentAt = guest.moves.get(moveKey(event.move));
            if (sentAt === undefined || now - sentAt > KEEP_MS) {
                this.flag("move", { hero: event.hero, frame: event.frame }, now);
            }
        }
        if (event.action === undefined) {
            return;
        }
        if (event.auto === true) {
            if (now - guest.autoAt < AUTO_AFTER_MS) {
                this.flag("auto", { hero: event.hero, frame: event.frame }, now);
            }
            guest.autoAt = now;
            return;
        }
        const key = actionKey(event.action);
        const seq = isSeq(event.actionSeq) ? event.actionSeq : undefined;
        const at = guest.actions.findIndex(
            (a) => a.key === key && (seq === undefined || a.seq === seq),
        );
        if (at < 0) {
            this.flag("action", { hero: event.hero, frame: event.frame }, now);
        } else {
            guest.actions.splice(at, 1);
        }
    }
}
