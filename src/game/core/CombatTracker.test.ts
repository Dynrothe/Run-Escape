import { getEnemy } from "../content/enemies";
import { emptyStats } from "../content/types";
import { CombatTracker } from "./CombatTracker";
import { HeroOptions, Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import { PassiveState, SimEvent } from "./entities";
import { fm } from "./fmath";
import { syncHash } from "./lockstep";
import { SaveData, createSave } from "./save";
import { makeGrid } from "./world/testGrid";

// The Combat Achievements tracker: what completes a task and what spoils it, that it's only ever
// there for a solo run that counts, and that it watches without changing anything (the run's
// hash is the same with it as without).

function openField(): string[] {
    const size = 72;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
        let row = "";
        for (let x = 0; x < size; x++) {
            const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
            row += edge ? "#" : ".";
        }
        rows.push(row);
    }
    return rows;
}

function createSim(mapId: string, options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(openField(), 1000, 1000),
        mapId,
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        ...options,
    });
}

function track(sim: Sim, save: SaveData = createSave()): CombatTracker {
    const tracker = CombatTracker.forRun(sim, save);
    expect(tracker).toBeDefined();
    return tracker!;
}

const at = { x: 0, y: 0 };
const spawned = (enemyId: string): SimEvent => ({
    type: "bossSpawned",
    enemyId,
    name: enemyId,
    message: "",
    finalBoss: false,
    ...at,
});
const killed = (enemyId: string): SimEvent => ({
    type: "kill",
    enemyUid: 1,
    enemyId,
    boss: true,
    ...at,
});
const hit = (enemyId: string): SimEvent => ({
    type: "playerHit",
    amount: 3,
    enemyId,
    elite: false,
});
const stage = (enemyId: string, phase: number, s: "hp" | "finale" = "hp"): SimEvent => ({
    type: "bossStage",
    enemyId,
    phase,
    stage: s,
    message: "",
    ...at,
});

const ids = (tasks: readonly { id: string }[]) => tasks.map((t) => t.id);

describe("which runs it follows", () => {
    test("a solo run, for the tasks on its map not done yet", () => {
        const save = createSave();
        save.combatTasks.push("wise_guy");
        const tasks = ids(track(createSim("lumbridge"), save).tasks);
        expect(tasks).toContain("bite_proof");
        expect(tasks).toContain("first_blood");
        expect(tasks).not.toContain("wise_guy");
        // Another map's, and the ones the run's mode can't do
        expect(tasks).not.toContain("objection");
        expect(tasks).not.toContain("hardened");
        expect(tasks).not.toContain("round_two");
        expect(tasks).not.toContain("bare_essentials");
    });

    test("never a co-op run", () => {
        const party: HeroOptions[] = ["warrior", "wizard"].map((characterId) => ({
            name: characterId,
            characterId,
            metaStats: emptyStats(),
        }));
        expect(CombatTracker.forRun(createSim("lumbridge", { party }), createSave())).toBe(
            undefined,
        );
        expect(CombatTracker.forRun(createSim("zachariah", { party }), createSave())).toBe(
            undefined,
        );
    });

    test("nor the raid test, or a fun map", () => {
        const testing = createSim("theatre_of_blood", { testing: { raidRoomSeconds: 120 } });
        expect(CombatTracker.forRun(testing, createSave())).toBe(undefined);
        expect(
            CombatTracker.forRun(createSim("grand_exchange", { endless: true }), createSave()),
        ).toBe(undefined);
    });
});

describe("boss kills", () => {
    test("Count Draynor killed without him hitting you is Bite-Proof; a hit spoils it", () => {
        const clean = createSim("lumbridge");
        const tracker = track(clean);
        expect(tracker.observe(clean, [spawned("count_draynor")])).toEqual([]);
        // Anyone else's hits don't count
        expect(tracker.observe(clean, [hit("zombie")])).toEqual([]);
        expect(ids(tracker.observe(clean, [killed("count_draynor")]))).toEqual(["bite_proof"]);
        expect(tracker.done).toEqual(["bite_proof"]);

        const hurt = createSim("lumbridge");
        const spoilt = track(hurt);
        spoilt.observe(hurt, [spawned("count_draynor")]);
        spoilt.observe(hurt, [hit("count_draynor")]);
        expect(spoilt.observe(hurt, [killed("count_draynor")])).toEqual([]);
        expect(spoilt.done).toEqual([]);
    });

    test("a speed kill counts from the boss's arrival, in the sim's ticks", () => {
        const sim = createSim("lumbridge");
        const tracker = track(sim);
        tracker.observe(sim, [spawned("wise_old_man")]);
        sim.tick += 61 * TICKS_PER_SECOND;
        expect(tracker.observe(sim, [killed("wise_old_man")])).toEqual([]);

        const quick = createSim("lumbridge");
        const fast = track(quick);
        fast.observe(quick, [spawned("wise_old_man")]);
        quick.tick += 59 * TICKS_PER_SECOND;
        expect(ids(fast.observe(quick, [killed("wise_old_man")]))).toEqual(["wise_guy"]);
    });

    test("Zachariah's tasks go by the damage each of his attacks did", () => {
        const sim = createSim("zachariah");
        const tracker = track(sim);
        const hero = sim.heroes[0];
        tracker.observe(sim, [spawned("justiciar_zachariah")]);
        expect(ids(tracker.observe(sim, [stage("justiciar_zachariah", 2)]))).toEqual([
            "court_in_session",
        ]);
        // A lunge lands, and his lightning; the rest of what he does never does
        hero.damageByAttack["Lunge (following)"] = 4;
        hero.damageByAttack["Lightning"] = 2;
        hero.damageByAttack["Crossbow rows"] = 5;
        tracker.observe(sim, []);
        const done = ids(tracker.observe(sim, [killed("justiciar_zachariah")]));
        expect(done).toContain("unbound");
        expect(done).toContain("in_the_owls_shadow");
        expect(done).not.toContain("objection");
        expect(done).not.toContain("checkmate");
    });

    test("Zachariah stuck in a pillar, and stunned by his own court three times", () => {
        const sim = createSim("zachariah");
        const tracker = track(sim);
        const guard = (cause: string, stunned = true): SimEvent => ({
            type: "bossGuard",
            enemyId: "justiciar_zachariah",
            stunned,
            cause,
            ...at,
        });
        tracker.observe(sim, [spawned("justiciar_zachariah")]);
        // A miss of his own only opens him up
        expect(ids(tracker.observe(sim, [guard("Lunge", false)]))).toEqual([]);
        expect(ids(tracker.observe(sim, [guard("Pillar")]))).toEqual(["stuck_in_the_stone"]);
        tracker.observe(sim, [guard("Lightning"), guard("Knight's sword")]);
        expect(ids(tracker.observe(sim, [guard("Lightning round you")]))).toEqual([
            "contempt_of_court",
        ]);
    });

    test("damage done before the boss arrived doesn't count against it", () => {
        const sim = createSim("zachariah");
        const tracker = track(sim);
        sim.heroes[0].damageByAttack["Lunge"] = 10;
        tracker.observe(sim, [spawned("justiciar_zachariah")]);
        expect(ids(tracker.observe(sim, [killed("justiciar_zachariah")]))).toContain("objection");
    });

    test("a sleepwalker reaching The Nightmare spoils Sweet Dreams, a curse Insomniac", () => {
        const sim = createSim("halloween");
        const tracker = track(sim);
        tracker.observe(sim, [spawned("the_nightmare")]);
        tracker.observe(sim, [{ type: "bossAbsorbBlast", absorbed: 0, ...at }]);
        tracker.observe(sim, [{ type: "playerCursed", cursed: true }]);
        expect(ids(tracker.observe(sim, [killed("the_nightmare")]))).toEqual(["sweet_dreams"]);

        const fed = createSim("halloween");
        const other = track(fed);
        other.observe(fed, [spawned("the_nightmare")]);
        other.observe(fed, [{ type: "bossAbsorbBlast", absorbed: 2, ...at }]);
        expect(ids(other.observe(fed, [killed("the_nightmare")]))).toEqual(["insomniac"]);
    });

    test("Wide Awake counts from her last stand, not her arrival", () => {
        const sim = createSim("phosani");
        const tracker = track(sim);
        const hero = sim.heroes[0];
        tracker.observe(sim, [spawned("phosanis_nightmare")]);
        hero.damageTaken += 20;
        tracker.observe(sim, [stage("phosanis_nightmare", 4, "finale")]);
        expect(ids(tracker.observe(sim, [killed("phosanis_nightmare")]))).toContain("wide_awake");

        const late = createSim("phosani");
        const hurt = track(late);
        hurt.observe(late, [stage("phosanis_nightmare", 4, "finale")]);
        late.heroes[0].damageTaken += 1;
        expect(ids(hurt.observe(late, [killed("phosanis_nightmare")]))).not.toContain("wide_awake");
    });

    test("Barrows brothers each killed before the next rises is Brotherly Haste", () => {
        const brothers = ["torag", "karil", "guthan", "ahrim", "verac"];
        const sim = createSim("barrows");
        const tracker = track(sim);
        let done: string[] = [];
        for (const id of brothers) {
            tracker.observe(sim, [spawned(id)]);
            done = ids(tracker.observe(sim, [killed(id)]));
        }
        expect(done).toEqual(["brotherly_haste"]);

        const slow = createSim("barrows");
        const late = track(slow);
        late.observe(slow, [spawned("torag")]);
        late.observe(slow, [spawned("karil")]);
        for (const id of brothers) {
            late.observe(slow, [killed(id)]);
        }
        expect(late.done).not.toContain("brotherly_haste");
    });

    test("the Inferno's three Jads must fall within seconds of each other", () => {
        const sim = createSim("inferno");
        const tracker = track(sim);
        tracker.observe(sim, [killed("jaltok_jad_finale")]);
        sim.tick += 4 * TICKS_PER_SECOND;
        tracker.observe(sim, [killed("jaltok_jad_finale")]);
        sim.tick += 4 * TICKS_PER_SECOND;
        expect(ids(tracker.observe(sim, [killed("jaltok_jad_finale")]))).toEqual([
            "triple_jeopardy",
        ]);
    });
});

describe("the rest", () => {
    test("a kill count adds the run's kills to what's banked", () => {
        const save = createSave();
        save.combatProgress.recurring_nightmare = 4;
        const sim = createSim("phosani");
        const tracker = track(sim, save);
        expect(tracker.observe(sim, [killed("phosanis_nightmare")])).toEqual([]);
        sim.enemyKills.phosanis_nightmare = 1;
        expect(ids(tracker.observe(sim, [killed("phosanis_nightmare")]))).toContain(
            "recurring_nightmare",
        );
    });

    test("a won run's rules, checked as it's won, and nothing after", () => {
        const sim = createSim("lumbridge");
        const tracker = track(sim);
        const passive: PassiveState = { id: "attack", level: 1, value: 1 };
        sim.heroes[0].passives.push(passive);
        expect(tracker.observe(sim, [{ type: "equip", itemId: "x", coins: 0 }])).toEqual([]);
        sim.state = "victory";
        const done = ids(tracker.observe(sim, []));
        expect(done).toContain("first_blood");
        expect(done).toContain("one_track_mind");
        expect(done).toContain("no_take_backs");
        expect(done).not.toContain("purist");
        expect(done).not.toContain("naked_ambition");
        // Once it's over the tracker's done with it
        expect(tracker.observe(sim, [spawned("count_draynor"), killed("count_draynor")])).toEqual(
            [],
        );
    });

    test("the Highwayman's coins back, and three evolutions", () => {
        const sim = createSim("lumbridge");
        const tracker = track(sim);
        expect(
            ids(
                tracker.observe(sim, [{ type: "coinsReturned", enemyId: "highwayman", amount: 5 }]),
            ),
        ).toEqual(["stand_and_deliver"]);
        sim.heroes[0].evolutionsMade.push("a", "b", "c");
        expect(ids(tracker.observe(sim, []))).toEqual(["evolutionary"]);
    });
});

// Plays a seeded run in circles, taking every first choice, and folds the sim's hash and each
// tick's events into one number. With a tracker, it watches every tick's events as the game's
// would.
function play(sim: Sim, seconds: number, tracker?: CombatTracker): string[] {
    const hashes: string[] = [];
    for (let i = 0; i < seconds * TICKS_PER_SECOND && !sim.runOver; i++) {
        if (sim.pendingLevelUps > 0) {
            sim.choose(0);
        }
        if (sim.chests.length > 0) {
            sim.resolveChest("take");
        }
        if (sim.offer) {
            sim.leaveEvent();
        }
        const angle = (sim.tick / TICKS_PER_SECOND) * 0.5;
        sim.step(fm.cos(angle), fm.sin(angle));
        const events = sim.takeEvents();
        const before = JSON.stringify(events);
        tracker?.observe(sim, events);
        expect(JSON.stringify(events)).toBe(before);
        hashes.push(`${syncHash(sim)}:${before.length}`);
    }
    return hashes;
}

describe("watching only", () => {
    test("leaves a seeded run's hash as it is, tick for tick", () => {
        const options = { seed: 7, characterId: "wizard" };
        const make = () => {
            const sim = createSim("lumbridge", options);
            sim.metaStats.maxHp = 5;
            sim.metaStats.armor = 5;
            sim.updateStats();
            // A boss from the start, so the tracker has a fight to watch
            sim["spawnBoss"](getEnemy("wise_old_man"), "boss", 20);
            return sim;
        };
        const without = play(make(), 90);
        const sim = make();
        const tracker = track(sim);
        expect(tracker.tasks.length).toBeGreaterThan(3);
        expect(play(sim, 90, tracker)).toEqual(without);
        // It saw the fight through
        expect(sim.bossKills.map((k) => k.enemyId)).toContain("wise_old_man");
        expect(tracker.done).toContain("wise_guy");
    }, 60000);
});
