// The Tombs of Amascut's own sim: a puzzle room, a boss or the whole raid, played by the Tombs'
// bot (tombsBot.ts) over seeds, and what happened in it. Puzzle rooms are what the rest of the
// game hasn't got, so each has its own account: Apmeken's issues fixed and missed, Het's mirror
// turns, beam pulses and seal openings, Scabaras's boards and wrong steps, Crondis's trips, spills
// and growth.
//
//   DEV_MAPS=1 bun run tsx scripts/game/simulate-tombs.ts                  # the whole raid, warrior, 3 seeds
//   DEV_MAPS=1 ROOM=scabaras bun run tsx scripts/game/simulate-tombs.ts wizard 10   # one puzzle room
//   DEV_MAPS=1 ROOM=zebak KIT=max bun run tsx scripts/game/simulate-tombs.ts        # a boss, best of everything
//   ROOM=     apmeken het scabaras crondis (puzzle rooms), baba akkha kephri zebak (bosses),
//             wardens, raid (the default: Nexus to chest)
//   LEVEL=2   the path level: as many other paths done first (0 to 3)
//   PATHS=het,crondis   the order the paths are taken in (the raid's, or the ones before a room's)
//   Without KIT=max, a boss or a room with LEVEL paths before it is reached by playing the raid
//   up to it from the Nexus, so the adventurer has the levels and gear they'd really have
//   (LEADIN=0 jumps straight there, at level one)
//   INVOCATIONS=walk_for_it,insanity   or INVOCATIONS=all, or INVOCATIONS=level:300 (a raid level
//             made up as people tend to: the bosses' own first, then the rest; never Attempts
//             or a time limit, so the sim's tries are endless)
//   PARTY=2   a co-op party, each played by the bot
//   KIT=max   the dev kit (every weapon style, the best gear) rather than the adventurer's start
//   META=max ARMOURY=max   as simulate-run.ts
//   MINUTES=15   how long a room gets before it counts as failed (the raid gets 90)
//   VERBOSE=1    the run's log as it goes (tombsBot's TombsLog)
import { getUpgradeLine } from "../../src/game/content/armoury";
import { CHARACTERS } from "../../src/game/content/characters";
import { INVOCATIONS, cleanInvocations, getRaidLevel } from "../../src/game/content/invocations";
import { CASKET_GEAR } from "../../src/game/content/items";
import { getMap } from "../../src/game/content/maps";
import { SHOP_UPGRADES } from "../../src/game/content/shop";
import { CombatStyle, emptyStats } from "../../src/game/content/types";
import { getWeapon, getWeaponStyle } from "../../src/game/content/weapons";
import { Sim, TICKS_PER_SECOND } from "../../src/game/core/Sim";
import { UpgradeChoice } from "../../src/game/core/Upgrades";
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { loadRegionData } from "./collision-snapshot";
import {
    DEFAULT_PATH_ORDER,
    TombsLog,
    chestAction,
    kite,
    setPathOrder,
    tombsMove,
    useItems,
} from "./tombsBot";

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
const PATH_ORDER = process.env.PATHS
    ? [
          ...process.env.PATHS.split(","),
          ...DEFAULT_PATH_ORDER.filter((id) => !process.env.PATHS!.split(",").includes(id)),
      ]
    : DEFAULT_PATH_ORDER;

const [characterArg, seedsArg] = process.argv.slice(2);
const characterId = characterArg || "warrior";
const seeds = parseInt(seedsArg ?? "3");
const roomArg = process.env.ROOM ?? "raid";
const level = parseInt(process.env.LEVEL ?? "0");
const partySize = parseInt(process.env.PARTY ?? "1");
const kit = process.env.KIT === "max";
const verbose = process.env.VERBOSE === "1";
const minutes = parseFloat(process.env.MINUTES ?? (roomArg === "raid" ? "90" : "15"));
// The order a raid level's made up in for INVOCATIONS=level:N
const LADDER = [
    "jungle_japes",
    "lively_larvae",
    "blood_thinners",
    "mind_the_gap",
    "gotta_have_faith",
    "keep_back",
    "blowing_mud",
    "arterial_spray",
    "aerial_assault",
    "need_some_help",
    "quiet_prayers",
    "shaking_things_up",
    "boulderdash",
    "stay_vigilant",
    "more_overlords",
    "not_just_a_head",
    "upset_stomach",
    "medic",
    "pathseeker",
    "double_trouble",
    "feeling_special",
    "ancient_haste",
    "acceleration",
    "penetration",
    "overclocked",
    "overclocked_2",
    "need_less_help",
    "deadly_prayers",
    "on_a_diet",
    "pathfinder",
    "no_help_needed",
    "overly_draining",
    "dehydration",
    "pathmaster",
    "walk_the_path",
    "insanity",
];

function invocationsForLevel(target: number): string[] {
    let picked: string[] = [];
    for (const id of LADDER) {
        if (getRaidLevel(picked) >= target) {
            break;
        }
        picked = cleanInvocations([...picked, id]);
    }
    return picked;
}

const invocationsArg = process.env.INVOCATIONS ?? "";
const invocations =
    invocationsArg === "all"
        ? INVOCATIONS.map((i) => i.id)
        : invocationsArg.startsWith("level:")
          ? invocationsForLevel(parseInt(invocationsArg.slice(6)))
          : invocationsArg.split(",").filter(Boolean);
if (roomArg !== "raid" && roomArg !== "wardens" && !PUZZLES[roomArg] && !BOSSES[roomArg]) {
    throw new Error(`ROOM=${roomArg}: not a room (${Object.keys({ ...PUZZLES, ...BOSSES })})`);
}
// Played up to from the Nexus (the levels a run really has by then), or jumped to
const leadIn =
    !kit &&
    process.env.LEADIN !== "0" &&
    (BOSSES[roomArg] !== undefined ||
        roomArg === "wardens" ||
        (PUZZLES[roomArg] !== undefined && level > 0));
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

// The styles the Wardens' second phase takes, one at a time (WARDENS.two.forms): a hero without a
// weapon of each gets nowhere on the other's form, so a new weapon of a style it lacks comes first,
// as a player who's read "Only ranged hurts it" picks
const WARDENS_STYLES: CombatStyle[] = ["ranged", "magic"];

function coversWardensStyle(sim: Sim, choice: UpgradeChoice): boolean {
    if (choice.kind !== "newWeapon") {
        return false;
    }
    const style = getWeaponStyle(getWeapon(choice.weaponId));
    return (
        WARDENS_STYLES.includes(style) &&
        !sim.weapons.some((weapon) => getWeaponStyle(weapon.def) === style)
    );
}

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
    setPathOrder(PATH_ORDER);
    if (roomArg === "raid") {
        return;
    }
    const tombs = map.tombs!;
    if (roomArg === "wardens" && leadIn) {
        // The whole raid up to them
        return;
    }
    if (roomArg === "wardens") {
        sim.tombsPathsDone.push(...tombs.paths.map((p) => p.id));
        sim["enterWardens"]();
        return;
    }
    const pathId = PUZZLES[roomArg] ?? BOSSES[roomArg];
    const others = PATH_ORDER.filter((id) => id !== pathId).slice(0, level);
    if (leadIn) {
        // The paths before it, then its own
        setPathOrder([...others, pathId]);
        return;
    }
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

// Whether a lead-in's got to the room asked for (a boss's fight, or a puzzle room)
function reached(sim: Sim): boolean {
    if (roomArg === "wardens") {
        return sim.tombsWardens !== undefined;
    }
    const pathId = PUZZLES[roomArg] ?? BOSSES[roomArg];
    if (sim.tombsPath !== pathId || !sim.tombsRoom) {
        return false;
    }
    return BOSSES[roomArg] ? sim.tombsRoom.boss !== undefined : sim.tombsRoom.started;
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

// A boss fight's account: how far down each try got it (the least of its hitpoints left, as a
// share), so a fight that's lost tells whether it was the damage or the dodging
class BossWatch {
    private uid = -1;
    private least = 1;
    tries: number[] = [];

    step(sim: Sim): void {
        const uid = sim.tombsRoom?.boss?.uid ?? -1;
        if (uid !== this.uid) {
            if (this.uid >= 0) {
                this.tries.push(this.least);
            }
            this.uid = uid;
            this.least = 1;
        }
        const boss = sim.enemies.find((e) => e.uid === uid);
        if (boss && !boss.dead && boss.maxHp > 0) {
            this.least = Math.min(this.least, boss.hp / boss.maxHp);
        }
    }

    notes(): string[] {
        const tries = [...this.tries, ...(this.uid >= 0 ? [this.least] : [])].filter((t) => t < 1);
        if (tries.length === 0) {
            return [];
        }
        const best = Math.min(...tries);
        const mean = tries.reduce((a, b) => a + b, 0) / tries.length;
        return [
            `boss tries ${tries.length}: best ${Math.round(best * 100)}% left, ` +
                `mean ${Math.round(mean * 100)}% left`,
        ];
    }
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
    const bossWatch = new BossWatch();
    const hits = new Map<string, number>();
    const moves = sim.heroes.map(() => ({ x: 0, y: 0 }));
    let start = sim.tick;
    let limit = start + minutes * 60 * TICKS_PER_SECOND;
    let wipesBefore = sim.tombsDeaths;
    let leading = leadIn;
    const leadNotes: string[] = [];
    if (leading) {
        limit = start + 90 * 60 * TICKS_PER_SECOND;
    }
    let downs = 0;
    // The furthest the run got: the Wardens' phase reached (0 for not yet)
    let wardensPhase = 0;
    while (sim.tick < limit && !sim.runOver && (leading || !isDone(sim))) {
        if (leading && sim.state === "playing" && reached(sim)) {
            leading = false;
            leadNotes.push(
                `reached in ${clock((sim.tick - start) / TICKS_PER_SECOND)} after ` +
                    `${sim.tombsDeaths} wipes, at level ` +
                    sim.heroes.map((hero) => sim.as(hero.index, () => sim.level)).join("/") +
                    ` (${sim.weapons.map((w) => `${w.def.id} ${w.level}`).join(", ")}), ` +
                    `${sim.player.maxHp} hp, wearing ${Object.values(sim.gear).join(", ") || "nothing"}, ` +
                    `carrying ${sim.inventory.filter(Boolean).length}`,
            );
            start = sim.tick;
            limit = start + minutes * 60 * TICKS_PER_SECOND;
            wipesBefore = sim.tombsDeaths;
            hits.clear();
            downs = 0;
            for (const hero of sim.heroes) {
                hero.damageTaken = 0;
                hero.damageByAttack = {};
            }
        }
        if (sim.state !== "playing") {
            for (const hero of sim.waitingOn) {
                sim.as(hero.index, () => {
                    if (sim.state === "levelUp") {
                        const ranked = sim.choices
                            .map((choice, index) => ({ choice, index }))
                            .sort(
                                (a, b) =>
                                    Number(coversWardensStyle(sim, b.choice)) -
                                        Number(coversWardensStyle(sim, a.choice)) ||
                                    CHOICE_ORDER.indexOf(a.choice.kind) -
                                        CHOICE_ORDER.indexOf(b.choice.kind),
                            );
                        sim.choose(ranked[0].index);
                    } else if (sim.state === "chest") {
                        // Wears it if it's better, keeps food and the like, as simulate-run's bot
                        sim.resolveChest(chestAction(sim));
                    } else {
                        // The Helpful Spirit: the dearest supply it can afford, as simulate-run's
                        // bot buys
                        const options = sim.offer?.options ?? [];
                        let best = -1;
                        let bestPrice = -1;
                        options.forEach((option, index) => {
                            if (
                                option.kind === "supply" &&
                                !option.sold &&
                                option.price <= sim.raidPoints &&
                                option.price > bestPrice
                            ) {
                                best = index;
                                bestPrice = option.price;
                            }
                        });
                        if (best === -1 || !sim.chooseEventOption(best)) {
                            sim.leaveEvent();
                        }
                    }
                });
            }
            continue;
        }
        log?.step(sim);
        wardensPhase = Math.max(wardensPhase, sim.tombsWardens?.phase ?? 0);
        watch.step(sim);
        if (!leading) {
            bossWatch.step(sim);
        }
        for (const hero of sim.heroes) {
            if (hero.down || hero.left) {
                continue;
            }
            sim.as(hero.index, () => {
                // Where tombsBot has nothing to say (a boss it doesn't know yet), away from what's close
                // Eats when hurt, and uses what it's carrying, as a person does
                useItems(sim);
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
    if (leading) {
        leadNotes.push(`never got there (${sim.tombsPathsDone.join(", ") || "no paths"} done)`);
    }
    const done = !leading && isDone(sim);
    return {
        done,
        seconds: (sim.tick - start) / TICKS_PER_SECOND,
        wipes: sim.tombsDeaths - wipesBefore,
        downs,
        taken: sim.heroes.reduce((sum, hero) => sum + hero.damageTaken, 0),
        hits,
        notes: [
            ...leadNotes,
            // How far it got, for a raid that's lost: paths cleared, then the Wardens' phase
            `got to: ${sim.tombsPathsDone.length} paths` +
                (wardensPhase > 0 ? `, Wardens phase ${wardensPhase}` : "") +
                (done ? ", won" : ""),
            ...watch.notes(sim),
            ...bossWatch.notes(),
            ...attackNotes(sim),
            ...(roomArg === "raid" || roomArg === "wardens" ? boardNotes(sim) : []),
        ],
    };
}

// Which boss attacks did the damage, every hero's together
function attackNotes(sim: Sim): string[] {
    const byAttack = new Map<string, number>();
    for (const hero of sim.heroes) {
        for (const [name, amount] of Object.entries(hero.damageByAttack)) {
            byAttack.set(name, (byAttack.get(name) ?? 0) + amount);
        }
    }
    const top = [...byAttack.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return top.length > 0
        ? [`boss attacks: ${top.map(([k, v]) => `${k} ${Math.round(v)}`).join(", ")}`]
        : [];
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
