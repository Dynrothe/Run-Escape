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
// desync: a guest's game found its run no longer matches the host's, and
// left. Logged for each guest, never a strike: they've gone already.
export const RUN_CHECKS = [...Object.keys(STRIKES), "desync"];

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

// ---- What the run analytics collector keeps (server/analytics, run_checks) ----

// The collector's formats. Whatever a host sends fits them, so a host can't
// keep its run's row out by sending something the collector refuses.
const ID = /^[a-z0-9_]{1,40}$/;
const BUILD = /^[a-zA-Z0-9._-]{1,80}$/;
const fits = (format, value) =>
    typeof value === "string" && format.test(value) ? value : "unknown";

// The run as the host's start says it is (the same as its run report says, if
// the host's honest), for the entries and the collector's row
export function runOf(game) {
    const heroes = Array.isArray(game?.heroes) ? game.heroes : [];
    return {
        map: fits(ID, game?.mapId),
        mode: game?.hard === true ? "hard" : "normal",
        endless: game?.endless === true,
        characters: heroes.map((hero) => fits(ID, hero?.characterId)).sort(),
    };
}

// A run's summary entry as the collector's row, without names or the room.
// ended: the checks ended the run.
export function checkReport(summary, relay, ended) {
    const party = summary.party;
    const characters = Array.isArray(summary.characters) ? summary.characters : [];
    return {
        schemaVersion: 1,
        checkId: crypto.randomUUID(),
        relay,
        build: fits(BUILD, summary.build),
        mapId: fits(ID, summary.map),
        mode: summary.mode === "hard" ? "hard" : "normal",
        endless: summary.endless === true,
        partySize: party,
        characters:
            characters.length === party
                ? characters.map((id) => fits(ID, id))
                : Array(party).fill("unknown"),
        runSeconds: summary.runSeconds,
        counts: summary.counts,
        caught: summary.caught,
        ended,
    };
}

// What sends a row to the collector, if the relay's set up for it: once, and
// a row that doesn't arrive is only missed (its summary's in the log)
export function checkReporter({ url, token, fetch }) {
    if (!url || !fetch || typeof token !== "string" || token.length < 32) {
        return undefined;
    }
    return async (report) => {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(report),
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
                console.warn(`Run checks: the collector refused a run's row (${response.status})`);
            }
        } catch (error) {
            console.warn(`Run checks: a run's row wasn't sent (${error?.message ?? error})`);
        }
    };
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

// A frame as seconds into the run, to a tenth
function runSeconds(frame) {
    return Math.round((frame / TICKS_PER_SECOND) * 10) / 10;
}

// The newest few of what a guest sent, for a log entry to compare with
const SHOWN_SENT = 5;

export class RunWatch {
    // log(entry) hears of each finding (a kind once a minute at most, with a
    // count of all), of the host being caught, and of the run's summary.
    // caught(kind) hears once, when a kind has had its STRIKES. run: what each
    // entry says the run is (room, map, build); names: player id -> name.
    // resumed: made again mid-run.
    constructor(
        heroIds,
        hostId,
        { log, caught, run = {}, names = new Map(), now = Date.now(), resumed = false },
    ) {
        this.heroIds = heroIds;
        this.hostId = hostId;
        this.log = log;
        this.caught = caught;
        this.run = run;
        this.names = names;
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
        this.caughtFor = undefined;
        this.finished = false;
    }

    // An entry for the log: the same fields from both relays, for a log
    // that's searched by them
    entry(kind, fields) {
        const guest = fields.hero === undefined ? undefined : this.heroIds[fields.hero];
        return {
            event: "coop_run_check",
            kind,
            ...this.run,
            party: this.heroIds.length,
            host: this.names.get(this.hostId),
            ...(guest !== undefined && { guest: this.names.get(guest) }),
            ...(fields.frame !== undefined && { runSeconds: runSeconds(fields.frame) }),
            ...fields,
        };
    }

    flag(kind, fields, now) {
        const count = (this.counts[kind] ?? 0) + 1;
        this.counts[kind] = count;
        const last = this.reportedAt.get(kind);
        if (last === undefined || now - last >= REPORT_EVERY_MS) {
            this.reportedAt.set(kind, now);
            this.log?.(this.entry(kind, { ...fields, count }));
        }
        if (this.caughtFor === undefined && count >= STRIKES[kind]) {
            this.caughtFor = kind;
            this.log?.(this.entry("caught", { by: kind, counts: { ...this.counts } }));
            this.caught?.(kind);
        }
    }

    // The run's over: what was found in it, if anything was. Once.
    finish() {
        if (this.finished) {
            return;
        }
        this.finished = true;
        if (Object.keys(this.counts).length > 0) {
            this.log?.(
                this.entry("summary", {
                    counts: { ...this.counts },
                    caught: this.caughtFor ?? null,
                    runSeconds: runSeconds(this.checkedUpTo),
                }),
            );
        }
    }

    // A guest's input. delivered: the host has it (not while its connection's
    // down).
    up(id, d, now = Date.now(), delivered = true) {
        const guest = this.guests.get(id);
        if (!guest || !d || typeof d !== "object") {
            return;
        }
        if ("outOfStep" in d) {
            this.outOfStep(id, guest, d.outOfStep);
        } else if (!delivered) {
            return;
        } else if ("move" in d) {
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

    // Each guest says so once. Two or more at the same frame point at the host.
    outOfStep(id, guest, frame) {
        if (!Number.isSafeInteger(frame) || guest.outOfStep !== undefined) {
            return;
        }
        guest.outOfStep = frame;
        const guests = [...this.guests.values()].filter((g) => g.outOfStep === frame).length;
        this.counts.desync = (this.counts.desync ?? 0) + 1;
        this.log?.(
            this.entry("desync", {
                hero: this.heroIds.indexOf(id),
                frame,
                guests,
                of: this.guests.size,
            }),
        );
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
            const ahead = this.zeroAt - zeroAt;
            this.flag("ahead", { frame: upTo, aheadSeconds: Math.round(ahead / 100) / 10 }, now);
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
        const at = { hero: event.hero, frame: event.frame };
        if (event.move !== undefined) {
            const key = moveKey(event.move);
            const sentAt = guest.moves.get(key);
            if (sentAt === undefined || now - sentAt > KEEP_MS) {
                this.flag(
                    "move",
                    {
                        ...at,
                        move: cleanMove(event.move) ?? null,
                        sent: [...guest.moves.keys()]
                            .slice(-SHOWN_SENT)
                            .reverse()
                            .map((sent) => sent.split(",").map(Number)),
                    },
                    now,
                );
            }
        }
        if (event.action === undefined) {
            return;
        }
        if (event.auto === true) {
            if (now - guest.autoAt < AUTO_AFTER_MS) {
                const since = now - guest.autoAt;
                this.flag(
                    "auto",
                    {
                        ...at,
                        // Since the run began, for its first
                        secondsSinceLast: Math.round(since / 100) / 10,
                    },
                    now,
                );
            }
            guest.autoAt = now;
            return;
        }
        const key = actionKey(event.action);
        const seq = isSeq(event.actionSeq) ? event.actionSeq : undefined;
        const found = guest.actions.findIndex(
            (a) => a.key === key && (seq === undefined || a.seq === seq),
        );
        if (found < 0) {
            this.flag(
                "action",
                {
                    ...at,
                    action: key ?? null,
                    sent: guest.actions
                        .slice(-SHOWN_SENT)
                        .reverse()
                        .map((a) => a.key),
                },
                now,
            );
        } else {
            guest.actions.splice(found, 1);
        }
    }
}
