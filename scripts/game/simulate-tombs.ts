// The Tombs of Amascut's own sim: a puzzle room, a boss or the whole raid, played by the Tombs'
// bot (tombsBot.ts) over seeds, and what happened in it. Puzzle rooms are what the rest of the
// game hasn't got, so each has its own account: Apmeken's issues fixed and missed, Het's mirror
// turns, beam pulses and seal openings, Scabaras's boards and wrong steps, Crondis's trips, spills
// and growth.
//
//   DEV_MAPS=1 npx tsx scripts/game/simulate-tombs.ts                  # the whole raid, warrior, 3 seeds
//   DEV_MAPS=1 ROOM=scabaras npx tsx scripts/game/simulate-tombs.ts wizard 10   # one puzzle room
//   DEV_MAPS=1 ROOM=zebak KIT=max npx tsx scripts/game/simulate-tombs.ts        # a boss, best of everything
//   ROOM=     apmeken het scabaras crondis (puzzle rooms), baba akkha kephri zebak (bosses),
//             wardens, raid (the default: Nexus to chest)
//   LEVEL=2   the path level: as many other paths done first (0 to 3)
//   INVOCATIONS=walk_for_it,insanity   or INVOCATIONS=all
//   PARTY=2   a co-op party, each played by the bot
//   KIT=max   the dev kit (every weapon style, the best gear) rather than the adventurer's start
//   META=max ARMOURY=max   as simulate-run.ts
//   MINUTES=15   how long a room gets before it counts as failed (the raid gets 90)
//   VERBOSE=1    the run's log as it goes (tombsBot's TombsLog)
import { getUpgradeLine } from "../../src/game/content/armoury";
import { CHARACTERS } from "../../src/game/content/characters";
import { INVOCATIONS } from "../../src/game/content/invocations";
import { CASKET_GEAR } from "../../src/game/content/items";
import { getMap } from "../../src/game/content/maps";
import { SHOP_UPGRADES } from "../../src/game/content/shop";
import { emptyStats } from "../../src/game/content/types";
import { Sim, TICKS_PER_SECOND } from "../../src/game/core/Sim";
import { UpgradeChoice } from "../../src/game/core/Upgrades";
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { loadRegionData } from "./collision-snapshot";
import { TombsLog, kite, tombsMove } from "./tombsBot";

const PUZZLES: Record<string, string> = {
    apmeken: "apmeken",
    het: "het",
    scabaras: "scabaras",
    crondis: "crondis",
};
const BOSSES: Record<string, string> = {
    baba: "apmeken",
    akkha: "het",
    kephri: "scabaras",
    zebak: "crondis",
};
const PATH_ORDER = ["apmeken", "het", "scabaras", "crondis"];

const [characterArg, seedsArg] = process.argv.slice(2);
const characterId = characterArg || "warrior";
const seeds = parseInt(seedsArg ?? "3");
const roomArg = process.env.ROOM ?? "raid";
const level = parseInt(process.env.LEVEL ?? "0");
const partySize = parseInt(process.env.PARTY ?? "1");
const kit = process.env.KIT === "max";
const verbose = process.env.VERBOSE === "1";
const minutes = parseFloat(process.env.MINUTES ?? (roomArg === "raid" ? "90" : "15"));
const invocations =
    process.env.INVOCATIONS === "all"
        ? INVOCATIONS.map((i) => i.id)
        : (process.env.INVOCATIONS ?? "").split(",").filter(Boolean);
if (roomArg !== "raid" && roomArg !== "wardens" && !PUZZLES[roomArg] && !BOSSES[roomArg]) {
    throw new Error(`ROOM=${roomArg}: not a room (${Object.keys({ ...PUZZLES, ...BOSSES })})`);
}
if (!CHARACTERS.some((c) => c.id === characterId)) {
    throw new Error(`No adventurer ${characterId}`);
}

const metaStats = emptyStats();
if (process.env.META === "max") {
    for (const upgrade of SHOP_UPGRADES) {
        metaStats[upgrade.stat] += upgrade.perRank * upgrade.maxRank;
    }
}
const armoury =
    process.env.ARMOURY === "max"
        ? Object.fromEntries(CASKET_GEAR.map((g) => [g.id, getUpgradeLine(g.id).length - 1]))
        : undefined;

const map = getMap("tombs_of_amascut");
if (!map.tombs) {
    throw new Error("The Tombs aren't on this map list: run with DEV_MAPS=1");
}
const grid = new ArenaGrid(loadRegionData(map));

// Level-up choices as a person makes them: evolutions, new weapons, levels, then the rest
const CHOICE_ORDER: UpgradeChoice["kind"][] = [
    "evolve",
    "hilt",
    "newWeapon",
    "weaponLevel",
    "newPassive",
    "passiveLevel",
    "food",
    "coins",
];

// What one run came to
type Outcome = {
    done: boolean;
    seconds: number;
    wipes: number;
    downs: number;
    taken: number;
    hits: Map<string, number>;
    notes: string[];
};

function newSim(seed: number): Sim {
    return new Sim({
        grid,
        characterId,
        metaStats,
        seed,
        mapId: map.id,
        spawnX: map.spawn.x,
        spawnY: map.spawn.y,
        armoury,
        invocations,
        ...(partySize > 1 && {
            party: Array.from({ length: partySize }, (_, i) => ({
                name: "bot" + (i + 1),
                characterId,
                metaStats,
                armoury,
            })),
        }),
    });
}

// Straight into the room asked for, with LEVEL paths done before it
function setUp(sim: Sim): void {
    if (kit) {
        sim.devWardensKit();
    }
    if (roomArg === "raid") {
        return;
    }
    const tombs = map.tombs!;
    if (roomArg === "wardens") {
        sim.tombsPathsDone.push(...tombs.paths.map((p) => p.id));
        sim["enterWardens"]();
        return;
    }
    const pathId = PUZZLES[roomArg] ?? BOSSES[roomArg];
    const others = PATH_ORDER.filter((id) => id !== pathId).slice(0, level);
    sim.tombsPathsDone.push(...others);
    const path = tombs.paths.find((p) => p.id === pathId)!;
    sim["enterTombsPath"](path.id, path.room!.arrive);
    if (BOSSES[roomArg]) {
        // Through the room to the boss: the run's room started, then skipped as the dev button does
        const room = sim.tombsRoom!;
        room.started = true;
        sim.devSkipToTombsBoss();
        // The dev skip hands over a bow; the sim plays the adventurer's own kit unless KIT=max
        if (!kit) {
            sim.weapons = sim.weapons.filter((w) => w.def.id !== "corrupted_twisted_bow");
        }
    }
}

// Whether the room asked for is done
function isDone(sim: Sim): boolean {
    if (roomArg === "raid" || roomArg === "wardens") {
        return sim.state === "victory";
    }
    const room = sim.tombsRoom;
    if (PUZZLES[roomArg]) {
        return room?.doneTick !== undefined || room?.boss !== undefined;
    }
    return room?.boss?.beatenTick !== undefined || sim.tombsPath === undefined;
}

// Each puzzle's own account, kept as the run goes
class PuzzleWatch {
    private issue: string | undefined;
    private missed = 0;
    fixed = 0;
    missedIssues = 0;
    private turns = new Map<number, string>();
    mirrorTurns = 0;
    private beamTick = -1;
    pulses = 0;
    pulsesHit = 0;
    private open = false;
    openings = 0;
    private solved = 0;
    boards: string[] = [];
    private sequence = "";
    reorders = 0;
    private additionSum = 0;
    additionResets = 0;
    private water: number[] = [];
    trips = 0;
    spills = 0;
    fills = 0;
    private growth = 0;

    step(sim: Sim): void {
        const room = sim.tombsRoom;
        if (!room) {
            return;
        }
        const at = (sim.tick / TICKS_PER_SECOND).toFixed(0);
        // Apmeken: an issue gone is fixed, unless the room's misses went up
        const issue = room.issue ? `${room.issue.spot}:${room.issue.startTick}` : undefined;
        if (this.issue && issue !== this.issue) {
            if (room.missed > this.missed) {
                this.missedIssues++;
            } else {
                this.fixed++;
            }
        }
        this.issue = issue;
        this.missed = room.missed;
        const het = room.het;
        if (het) {
            het.mirrors.forEach((mirror, i) => {
                const key = `${mirror.turn}${mirror.dirty}`;
                if (this.turns.has(i) && this.turns.get(i) !== key) {
                    this.mirrorTurns++;
                }
                this.turns.set(i, key);
            });
            if (het.beam && het.beam.tick !== this.beamTick) {
                this.beamTick = het.beam.tick;
                this.pulses++;
                this.pulsesHit += het.beam.hit ? 1 : 0;
            }
            const open = het.openUntil > sim.tick;
            if (open && !this.open) {
                this.openings++;
            }
            this.open = open;
        }
        const scab = room.scabaras;
        if (scab) {
            if (scab.solved.length > this.solved) {
                this.boards.push(`${scab.solved[scab.solved.length - 1]} ${at}s`);
            }
            this.solved = scab.solved.length;
            const order = scab.sequence.order.join(",") + "@" + scab.sequence.showFrom;
            if (this.sequence && order !== this.sequence && !scab.solved.includes("sequence")) {
                this.reorders++;
            }
            this.sequence = order;
            if (scab.addition.sum < this.additionSum && scab.addition.sum === 0) {
                this.additionResets++;
            }
            this.additionSum = scab.addition.sum;
        }
        const crondis = room.crondis;
        if (crondis) {
            crondis.water.forEach((water, i) => {
                const before = this.water[i] ?? 0;
                if (water >= 100 && before < 100) {
                    this.fills++;
                }
                if (water === 0 && before > 0) {
                    this.trips++;
                } else if (water < before && water > 0) {
                    this.spills++;
                }
                this.water[i] = water;
            });
            this.growth = crondis.growth;
        }
    }

    notes(sim: Sim): string[] {
        const notes: string[] = [];
        if (this.fixed + this.missedIssues > 0) {
            notes.push(`issues ${this.fixed} fixed, ${this.missedIssues} missed`);
        }
        if (this.pulses > 0) {
            notes.push(
                `mirrors turned ${this.mirrorTurns}, beam ${this.pulsesHit}/${this.pulses} pulses through, ` +
                    `seal opened ${this.openings}`,
            );
        }
        if (this.boards.length > 0 || this.sequence) {
            notes.push(
                `boards: ${this.boards.join(", ") || "none"}; sequence redone ${this.reorders}, ` +
                    `addition reset ${this.additionResets}`,
            );
        }
        if (this.water.length > 0) {
            const goal = sim.tombsRoom?.crondis?.goal;
            notes.push(
                `crondis: ${this.fills} fills, ${this.trips} trips, ${this.spills} spills, ` +
                    `growth ${Math.round(this.growth)}${goal ? `/${goal}` : ""}`,
            );
        }
        return notes;
    }
}

function runOnce(seed: number): Outcome {
    const sim = newSim(seed);
    setUp(sim);
    const log = verbose ? new TombsLog() : undefined;
    const watch = new PuzzleWatch();
    const hits = new Map<string, number>();
    const start = sim.tick;
    const limit = start + minutes * 60 * TICKS_PER_SECOND;
    const wipesBefore = sim.tombsDeaths;
    let downs = 0;
    const moves = sim.heroes.map(() => ({ x: 0, y: 0 }));
    while (sim.tick < limit && !sim.runOver && !isDone(sim)) {
        if (sim.state !== "playing") {
            for (const hero of sim.waitingOn) {
                sim.as(hero.index, () => {
                    if (sim.state === "levelUp") {
                        const ranked = sim.choices
                            .map((choice, index) => ({ choice, index }))
                            .sort(
                                (a, b) =>
                                    CHOICE_ORDER.indexOf(a.choice.kind) -
                                    CHOICE_ORDER.indexOf(b.choice.kind),
                            );
                        sim.choose(ranked[0].index);
                    } else if (sim.state === "chest") {
                        sim.resolveChest("take");
                    } else {
                        sim.leaveEvent();
                    }
                });
            }
            continue;
        }
        log?.step(sim);
        watch.step(sim);
        for (const hero of sim.heroes) {
            if (hero.down || hero.left) {
                continue;
            }
            sim.as(hero.index, () => {
                // Where tombsBot has nothing to say (a boss it doesn't know yet), away from what's close
                moves[hero.index] = tombsMove(sim) ?? kite(sim, sim.player, 4);
                sim.setInput(hero.index, moves[hero.index].x, moves[hero.index].y);
            });
        }
        sim.step();
        for (const event of sim.takeEvents()) {
            if (event.type === "playerHit") {
                hits.set(event.enemyId, (hits.get(event.enemyId) ?? 0) + event.amount);
            } else if (event.type === "heroDown") {
                downs++;
            }
        }
    }
    log?.report(sim);
    const done = isDone(sim);
    return {
        done,
        seconds: (sim.tick - start) / TICKS_PER_SECOND,
        wipes: sim.tombsDeaths - wipesBefore,
        downs,
        taken: sim.heroes.reduce((sum, hero) => sum + hero.damageTaken, 0),
        hits,
        notes: [
            ...watch.notes(sim),
            ...(roomArg === "raid" || roomArg === "wardens" ? boardNotes(sim) : []),
        ],
    };
}

// The result screen's board, for a raid or the Wardens
function boardNotes(sim: Sim): string[] {
    const board = sim.getResult().tombs;
    if (!board) {
        return [];
    }
    return [
        `raid level ${board.level}: ` +
            board.paths.map((p) => `${p.id} ${clock(p.seconds)}`).join(", ") +
            (board.wardensSeconds !== undefined ? `, wardens ${clock(board.wardensSeconds)}` : ""),
        board.party
            .map((p) => `${p.name || "bot"} ${p.points} points ${Math.round(p.chance * 100)}%`)
            .join(", "),
    ];
}

function clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

console.log(
    `${map.name}: ${roomArg}, ${characterId}${partySize > 1 ? ` x${partySize}` : ""}, path level ` +
        `${level}, raid level ${newSim(1).raidLevel}${kit ? ", max kit" : ""}, ${seeds} seeds`,
);
const outcomes: Outcome[] = [];
for (let seed = 1; seed <= seeds; seed++) {
    const started = performance.now();
    const outcome = runOnce(seed);
    outcomes.push(outcome);
    const worst = [...outcome.hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(
        `seed ${seed}: ${outcome.done ? "done" : "FAILED"} in ${clock(outcome.seconds)}, ` +
            `${outcome.wipes} wipes, ${outcome.downs} downs, ${outcome.taken} taken` +
            (worst.length > 0 ? ` (${worst.map(([k, v]) => `${k} ${v}`).join(", ")})` : "") +
            ` [${((performance.now() - started) / 1000).toFixed(1)}s]`,
    );
    for (const note of outcome.notes) {
        console.log(`    ${note}`);
    }
}
const done = outcomes.filter((o) => o.done);
const times = done.map((o) => o.seconds).sort((a, b) => a - b);
console.log(
    `\n${done.length}/${outcomes.length} done` +
        (times.length > 0 ? `, median ${clock(times[Math.floor(times.length / 2)])}` : "") +
        `, wipes ${(outcomes.reduce((s, o) => s + o.wipes, 0) / outcomes.length).toFixed(1)} a run, ` +
        `taken ${Math.round(outcomes.reduce((s, o) => s + o.taken, 0) / outcomes.length)} a run`,
);
