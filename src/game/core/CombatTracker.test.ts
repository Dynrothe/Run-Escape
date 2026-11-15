import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    COMBAT_TASK_BY_ID,
    CombatReason,
    canTrackOn,
    describeCombatReason,
} from "../content/combatTasks";
import { getEnemy } from "../content/enemies";
import { HARD_PRESET } from "../content/invocations";
import { TOMBS_SUPPLY_ITEMS } from "../content/items";
import { MAP_BY_ID } from "../content/maps";
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
const hit = (enemyId: string, attack?: string): SimEvent => ({
    type: "playerHit",
    amount: 3,
    enemyId,
    elite: false,
    attack,
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
        // A boss fight has no visitors to rob you
        expect(tasks).toContain("stand_and_deliver");
        expect(ids(track(createSim("zachariah")).tasks)).not.toContain("stand_and_deliver");
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

    test("the verdict's ice barrage isn't a lunge, though a lunge follows it", () => {
        const sim = createSim("zachariah");
        const tracker = track(sim);
        tracker.observe(sim, [spawned("justiciar_zachariah")]);
        sim.heroes[0].damageByAttack["Ice barrage, then lunge"] = 3;
        expect(ids(tracker.observe(sim, [killed("justiciar_zachariah")]))).toContain("objection");
    });

    test("Close Counsel's seconds are the sim's, however often it looks between ticks", () => {
        const counsel = (outFor: number) => {
            const sim = createSim("zachariah");
            const tracker = track(sim);
            const boss = sim["spawnBoss"](getEnemy("justiciar_zachariah"), "finalBoss", 20)!;
            tracker.observe(sim, sim.takeEvents());
            // Well out of Saradomin Strike's reach
            const player = sim.heroes[0].player;
            player.x = boss.x + 20;
            player.y = boss.y;
            // Caskets, items and the fight's button between ticks: no time goes by
            for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) {
                tracker.observe(sim, []);
            }
            sim.tick += outFor * TICKS_PER_SECOND;
            tracker.observe(sim, []);
            return ids(tracker.observe(sim, [killed("justiciar_zachariah")]));
        };
        expect(counsel(2)).toContain("close_counsel");
        expect(counsel(4)).not.toContain("close_counsel");
    });

    test("Zachariah stuck in a pillar, and three Smites while his guard's down", () => {
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
        const smite = (opened: boolean): SimEvent => ({
            type: "ability",
            abilityId: "smite",
            enemyId: "justiciar_zachariah",
            sound: -1,
            opened,
            ...at,
        });
        // One while his guard's up doesn't count
        tracker.observe(sim, [smite(true), smite(false), smite(true)]);
        expect(tracker.done).not.toContain("contempt_of_court");
        expect(ids(tracker.observe(sim, [smite(true)]))).toEqual(["contempt_of_court"]);
    });

    test("Zachariah's hard tasks only on hard mode, as the hard run's won", () => {
        const hard = (sim: Sim) => {
            const tracker = track(sim);
            tracker.observe(sim, [spawned("justiciar_zachariah")]);
            sim.state = "victory";
            return ids(tracker.observe(sim, [killed("justiciar_zachariah")]));
        };
        const normal = hard(createSim("zachariah"));
        expect(normal).toContain("objection");
        expect(normal).not.toContain("beyond_reproach");
        expect(normal).not.toContain("flawless_verdict");
        const onHard = hard(createSim("zachariah", { hard: true }));
        expect(onHard).toContain("beyond_reproach");
        expect(onHard).toContain("flawless_verdict");
    });

    test("damage done before the boss arrived doesn't count against it", () => {
        const sim = createSim("zachariah");
        const tracker = track(sim);
        sim.heroes[0].damageByAttack["Lunge"] = 10;
        tracker.observe(sim, [spawned("justiciar_zachariah")]);
        expect(ids(tracker.observe(sim, [killed("justiciar_zachariah")]))).toContain("objection");
    });

    // Hurt by this attack, by this much
    function hurt(sim: Sim, attack: string, amount: number): void {
        const hero = sim.heroes[0];
        hero.damageTaken += amount;
        hero.damageByAttack[attack] = (hero.damageByAttack[attack] ?? 0) + amount;
    }

    test("a sleepwalker reaching The Nightmare spoils Sweet Dreams, a hit while cursed Insomniac", () => {
        const sim = createSim("halloween");
        const tracker = track(sim);
        tracker.observe(sim, [spawned("the_nightmare")]);
        tracker.observe(sim, [{ type: "bossAbsorbBlast", absorbed: 0, ...at }]);
        // Cursed, and only what no one can dodge lands meanwhile; then a hit once it's worn off
        sim.applyPlayerEffect({ kind: "curse", attacks: 3 });
        tracker.observe(sim, sim.takeEvents());
        hurt(sim, "Sleepwalkers", 1);
        tracker.observe(sim, []);
        hurt(sim, "Parasites", 9);
        tracker.observe(sim, []);
        sim.heroes[0].curse = undefined;
        tracker.observe(sim, [{ type: "playerCursed", cursed: false }]);
        hurt(sim, "Melee", 10);
        tracker.observe(sim, []);
        expect(ids(tracker.observe(sim, [killed("the_nightmare")]))).toEqual([
            "sweet_dreams",
            "insomniac",
        ]);

        const fed = createSim("halloween");
        const other = track(fed);
        other.observe(fed, [spawned("the_nightmare")]);
        other.observe(fed, [{ type: "bossAbsorbBlast", absorbed: 2, ...at }]);
        fed.applyPlayerEffect({ kind: "curse", attacks: 3 });
        other.observe(fed, fed.takeEvents());
        hurt(fed, "Melee", 2);
        other.observe(fed, []);
        expect(ids(other.observe(fed, [killed("the_nightmare")]))).toEqual([]);
    });

    test("Wide Awake watches her last stand's claws and dream, from her last stand", () => {
        const sim = createSim("phosani");
        const tracker = track(sim);
        tracker.observe(sim, [spawned("phosanis_nightmare")]);
        hurt(sim, "Grasping Claws (random)", 12);
        tracker.observe(sim, [stage("phosanis_nightmare", 4, "finale")]);
        // The sleepwalkers she opens it with blast whatever's done
        hurt(sim, "Sleepwalkers (more)", 2);
        tracker.observe(sim, []);
        expect(ids(tracker.observe(sim, [killed("phosanis_nightmare")]))).toContain("wide_awake");

        const late = createSim("phosani");
        const clawed = track(late);
        clawed.observe(late, [stage("phosanis_nightmare", 4, "finale")]);
        hurt(late, "The dream's lattice", 4);
        clawed.observe(late, []);
        expect(ids(clawed.observe(late, [killed("phosanis_nightmare")]))).not.toContain(
            "wide_awake",
        );
    });

    test("Dreamless lets through only her sleepwalkers' blast and parasites, none let through", () => {
        const won = (sim: Sim, events: SimEvent[] = []) => {
            const tracker = track(sim);
            sim.state = "victory";
            return ids(tracker.observe(sim, events));
        };
        const clean = createSim("phosani", { hard: true });
        hurt(clean, "Sleepwalkers", 3);
        hurt(clean, "Parasites", 13);
        expect(won(clean)).toContain("dreamless");
        const grazed = createSim("phosani", { hard: true });
        hurt(grazed, "Parasites", 13);
        hurt(grazed, "Melee", 1);
        expect(won(grazed)).not.toContain("dreamless");
        const fed = createSim("phosani", { hard: true });
        expect(won(fed, [{ type: "bossAbsorbBlast", absorbed: 1, ...at }])).not.toContain(
            "dreamless",
        );
    });

    test("a parasite healing Phosani spoils Parasite-Free; anything else healed doesn't", () => {
        const heal = (enemyId: string): SimEvent => ({
            type: "enemyHealed",
            enemyId,
            healerId: "phosani_parasite",
        });
        const sim = createSim("phosani");
        const tracker = track(sim);
        tracker.observe(sim, [spawned("phosanis_nightmare")]);
        tracker.observe(sim, [heal("phosani_totem_charging")]);
        expect(ids(tracker.observe(sim, [killed("phosanis_nightmare")]))).toContain(
            "parasite_free",
        );

        const fed = createSim("phosani");
        const other = track(fed);
        other.observe(fed, [spawned("phosanis_nightmare")]);
        other.observe(fed, [heal("phosanis_nightmare")]);
        expect(ids(other.observe(fed, [killed("phosanis_nightmare")]))).not.toContain(
            "parasite_free",
        );
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

const status = (tracker: CombatTracker, sim: Sim, id: string) =>
    tracker.statuses(sim).find((s) => s.task.id === id)!;
// A status with its reason as the player reads it
const said = <T extends { reason?: CombatReason }>(s: T) => ({
    ...s,
    reason: s.reason && describeCombatReason(s.reason),
});

describe("where each task's got, for the HUD and pause menu", () => {
    test("a hit spoils Bite-Proof by name, once: it's failed, and said so once", () => {
        const sim = createSim("lumbridge");
        const tracker = track(sim);
        expect(status(tracker, sim, "bite_proof").state).toBe("on");
        tracker.observe(sim, [spawned("count_draynor")]);
        tracker.observe(sim, [hit("count_draynor")]);
        expect(said(status(tracker, sim, "bite_proof"))).toMatchObject({
            state: "failed",
            reason: "hit by Count Draynor",
        });
        expect(tracker.takeFailed().map(said)).toEqual([
            { task: expect.objectContaining({ id: "bite_proof" }), reason: "hit by Count Draynor" },
        ]);
        tracker.observe(sim, [hit("count_draynor")]);
        expect(tracker.takeFailed()).toEqual([]);
    });

    test("an attack avoided by name says which landed (playerHit's attack)", () => {
        const sim = createSim("zachariah");
        const tracker = track(sim);
        tracker.observe(sim, [spawned("justiciar_zachariah")]);
        sim.heroes[0].damageByAttack["Lunges"] = 4;
        tracker.observe(sim, [hit("justiciar_zachariah", "Lunges")]);
        expect(said(status(tracker, sim, "objection"))).toMatchObject({
            state: "failed",
            reason: "hit by Lunges",
        });
        expect(status(tracker, sim, "unbound").state).toBe("on");
    });

    test("a boss that comes again (an endless round) can be done again", () => {
        const sim = createSim("lumbridge", { endless: true });
        const tracker = track(sim);
        tracker.observe(sim, [spawned("count_draynor")]);
        tracker.observe(sim, [hit("count_draynor")]);
        tracker.observe(sim, [killed("count_draynor")]);
        expect(status(tracker, sim, "bite_proof").state).toBe("failed");
        tracker.observe(sim, [spawned("count_draynor")]);
        expect(status(tracker, sim, "bite_proof").state).toBe("on");
        expect(ids(tracker.observe(sim, [killed("count_draynor")]))).toContain("bite_proof");
        expect(status(tracker, sim, "bite_proof").state).toBe("done");
    });

    test("a win's rules fail as they're broken, not only once it's won", () => {
        const sim = createSim("lumbridge");
        const tracker = track(sim);
        sim.heroes[0].weapons.push({ ...sim.heroes[0].weapons[0] });
        sim.heroes[0].skips = 1;
        tracker.observe(sim, []);
        expect(said(status(tracker, sim, "one_track_mind"))).toMatchObject({
            state: "failed",
            reason: "took a second weapon",
        });
        expect(said(status(tracker, sim, "no_take_backs"))).toMatchObject({
            state: "failed",
            reason: "rerolled, skipped or banished",
        });
        expect(status(tracker, sim, "purist").state).toBe("on");
        expect(ids(tracker.takeFailed().map((f) => f.task)).sort()).toEqual([
            "no_take_backs",
            "one_track_mind",
        ]);
    });

    test("counts show how far they've got: Smites, kills", () => {
        const zach = createSim("zachariah");
        const tracker = track(zach);
        tracker.observe(zach, [
            {
                type: "ability",
                abilityId: "smite",
                enemyId: "justiciar_zachariah",
                sound: -1,
                opened: true,
                ...at,
            },
        ]);
        expect(status(tracker, zach, "contempt_of_court").progress).toEqual({ done: 1, of: 3 });
        expect(status(tracker, zach, "objection").progress).toBeUndefined();

        const save = createSave();
        save.combatProgress.recurring_nightmare = 2;
        const phosani = createSim("phosani");
        const nightmare = track(phosani, save);
        phosani.enemyKills.phosanis_nightmare = 1;
        expect(status(nightmare, phosani, "recurring_nightmare").progress).toEqual({
            done: 3,
            of: 5,
        });
    });
});

describe("Jack of All Styles, over runs", () => {
    test("a campaign win earns its adventurer's style, and the last style does it", () => {
        const sim = createSim("lumbridge");
        const tracker = track(sim);
        sim.state = "victory";
        expect(ids(tracker.observe(sim, []))).not.toContain("jack_of_all_styles");
        expect(tracker.earned).toEqual(["jack_of_all_styles:melee"]);
        expect(
            tracker.statuses(sim).find((s) => s.task.id === "jack_of_all_styles")!.progress,
        ).toEqual({ done: 1, of: 3 });

        const save = createSave();
        save.combatProgress["jack_of_all_styles:ranged"] = 1;
        save.combatProgress["jack_of_all_styles:magic"] = 1;
        const last = createSim("barrows");
        const lastTracker = track(last, save);
        last.state = "victory";
        expect(ids(lastTracker.observe(last, []))).toContain("jack_of_all_styles");
    });

    test("not from a loss, an endless run or a boss fight", () => {
        const lost = createSim("lumbridge");
        const tracker = track(lost);
        lost.state = "dead";
        tracker.observe(lost, []);
        expect(tracker.earned).toEqual([]);
        expect(ids(track(createSim("lumbridge", { endless: true })).tasks)).not.toContain(
            "jack_of_all_styles",
        );
        expect(ids(track(createSim("zachariah")).tasks)).not.toContain("jack_of_all_styles");
    });
});

describe("the Theatre's perfect tasks", () => {
    function hurt(sim: Sim, attack: string, amount: number): void {
        const hero = sim.heroes[0];
        hero.damageTaken += amount;
        hero.damageByAttack[attack] = (hero.damageByAttack[attack] ?? 0) + amount;
    }

    // A room's boss arriving and dying, hurt by this attack of its on the way if given
    function room(sim: Sim, tracker: CombatTracker, bossId: string, attack?: string): string[] {
        tracker.observe(sim, [spawned(bossId)]);
        if (attack) {
            hurt(sim, attack, 3);
            tracker.observe(sim, [hit(bossId, attack)]);
        }
        return ids(tracker.observe(sim, [killed(bossId)]));
    }

    test("Perfect Maiden: her kill with no damage at all, from anything", () => {
        const sim = createSim("theatre_of_blood");
        expect(room(sim, track(sim), "maiden_of_sugadinti")).toContain("perfect_maiden");

        const bitten = createSim("theatre_of_blood");
        const tracker = track(bitten);
        tracker.observe(bitten, [spawned("maiden_of_sugadinti")]);
        bitten.heroes[0].damageTaken += 1;
        tracker.observe(bitten, [hit("blood_spawn")]);
        expect(said(status(tracker, bitten, "perfect_maiden")).reason).toBe("hit by Blood spawn");
        expect(ids(tracker.observe(bitten, [killed("maiden_of_sugadinti")]))).not.toContain(
            "perfect_maiden",
        );
    });

    test("Theatre Perfectionist: each of them in one run, done before or not, and the win", () => {
        const save = createSave();
        // Done in earlier runs, but they count again here
        save.combatTasks.push("rain_check", "dry_feet");
        const sim = createSim("theatre_of_blood");
        const tracker = track(sim, save);
        expect(ids(tracker.tasks)).not.toContain("rain_check");
        room(sim, tracker, "maiden_of_sugadinti");
        room(sim, tracker, "tob_pestilent_bloat");
        room(sim, tracker, "tob_sotetseg");
        room(sim, tracker, "xarpus");
        const perfectionist = () =>
            tracker.statuses(sim).find((s) => s.task.id === "theatre_perfectionist")!;
        expect(perfectionist().progress).toEqual({ done: 4, of: 5 });
        expect(room(sim, tracker, "tob_verzik_vitur")).not.toContain("theatre_perfectionist");
        sim.state = "victory";
        expect(ids(tracker.observe(sim, []))).toContain("theatre_perfectionist");

        const hurtOnce = createSim("theatre_of_blood");
        const spoilt = track(hurtOnce);
        room(hurtOnce, spoilt, "maiden_of_sugadinti");
        room(hurtOnce, spoilt, "tob_pestilent_bloat", "Falling flesh");
        expect(said(status(spoilt, hurtOnce, "theatre_perfectionist"))).toMatchObject({
            state: "failed",
            reason: "Rain Check: hit by Falling flesh",
        });
    });
});

describe("Act II and after", () => {
    test("a button counts only where it lands on the boss", () => {
        const sim = createSim("awakened_duke");
        const tracker = track(sim);
        const kindle = (enemyId: string, opened: boolean): SimEvent => ({
            type: "ability",
            abilityId: "kindle",
            enemyId,
            sound: -1,
            opened,
            ...at,
        });
        // A flare that caught no one, twice, and one while his guard was up
        tracker.observe(sim, [kindle("", false), kindle("", false)]);
        tracker.observe(sim, [kindle("awakened_duke", false)]);
        expect(status(tracker, sim, "kindled_spirit").progress).toEqual({ done: 0, of: 3 });
        tracker.observe(sim, [kindle("awakened_duke", true), kindle("awakened_duke", true)]);
        expect(ids(tracker.observe(sim, [kindle("awakened_duke", true)]))).toEqual([
            "kindled_spirit",
        ]);
    });

    test("a win's set-up decides which runs follow it: remixes, points, an awakened boss", () => {
        const followed = (mapId: string, options: Partial<SimOptions> = {}) =>
            ids(track(createSim(mapId, options)).tasks);
        const plain = followed("lumbridge");
        expect(plain).not.toContain("remixed");
        expect(plain).not.toContain("rude_awakening");
        expect(plain).not.toContain("invoker");

        expect(followed("lumbridge", { remixes: ["overgrown"] })).toContain("remixed");
        expect(followed("lumbridge", { remixes: ["overgrown"] })).not.toContain(
            "four_on_the_floor",
        );
        const all = createSim("lumbridge", { remixes: ["overgrown", "shadow", "frozen", "dark"] });
        const tracker = track(all);
        all.state = "victory";
        const done = ids(tracker.observe(all, []));
        expect(done).toContain("remixed");
        expect(done).toContain("four_on_the_floor");

        expect(followed("lumbridge", { awakened: true })).toContain("rude_awakening");

        const hard = createSim("desert", { invocations: HARD_PRESET });
        expect(hard.invocationPoints).toBeGreaterThanOrEqual(100);
        expect(hard.invocationPoints).toBeLessThan(200);
        const onHard = ids(track(hard).tasks);
        expect(onHard).toContain("invoker");
        expect(onHard).not.toContain("raising_the_stakes");
    });

    test("freezing solid spoils Warm Blooded", () => {
        const sim = createSim("ghorrock");
        const tracker = track(sim);
        tracker.observe(sim, []);
        expect(status(tracker, sim, "warm_blooded").state).toBe("on");
        tracker.observe(sim, [{ type: "frozenSolid", hero: 0 }]);
        expect(said(status(tracker, sim, "warm_blooded"))).toMatchObject({
            state: "failed",
            reason: "froze solid",
        });
    });

    test("invaders count on the maps they invade, one of each over runs", () => {
        const guard = COMBAT_TASK_BY_ID.get("home_guard")!;
        expect(canTrackOn(guard, MAP_BY_ID.get("desert")!)).toBe(true);
        expect(canTrackOn(guard, MAP_BY_ID.get("lumbridge")!)).toBe(false);

        const save = createSave();
        save.combatProgress["home_guard:invading_vardorvis"] = 1;
        save.combatProgress["home_guard:invading_whisperer"] = 1;
        save.combatProgress["home_guard:invading_duke"] = 1;
        const sim = createSim("desert");
        const tracker = track(sim, save);
        // Another of one already counted is no further on
        sim.enemyKills.invading_duke = 1;
        tracker.observe(sim, [killed("invading_duke")]);
        expect(status(tracker, sim, "home_guard").progress).toEqual({ done: 3, of: 4 });
        sim.enemyKills.invading_leviathan = 1;
        expect(ids(tracker.observe(sim, [killed("invading_leviathan")]))).toContain("home_guard");
    });
});

describe("the Tombs of Amascut", () => {
    // On a path, in its room: beaten if done is set
    function enter(sim: Sim, path: string, done?: number): void {
        sim.tombsPath = path;
        sim.tombsRoom = { doneTick: done } as Sim["tombsRoom"];
    }

    test("a puzzle room beaten without a mistake is perfect; a mistake spoils it", () => {
        const sim = createSim("tombs_of_amascut");
        const tracker = track(sim);
        enter(sim, "het");
        // Another room's mistake isn't this one's
        tracker.observe(sim, [{ type: "tombsMistake", path: "crondis" }]);
        expect(status(tracker, sim, "perfect_het").state).toBe("on");
        enter(sim, "het", sim.tick);
        expect(ids(tracker.observe(sim, []))).toEqual(["perfect_het"]);

        const spilt = createSim("tombs_of_amascut");
        const spoilt = track(spilt);
        enter(spilt, "crondis");
        spoilt.observe(spilt, [{ type: "tombsMistake", path: "crondis" }]);
        enter(spilt, "crondis", spilt.tick);
        expect(ids(spoilt.observe(spilt, []))).not.toContain("perfect_crondis");
        expect(said(status(spoilt, spilt, "perfect_crondis"))).toMatchObject({
            state: "failed",
            reason: "made a mistake in the room",
        });
    });

    test("a path cleared, and a death or a supply spoiling the raid's rules", () => {
        const sim = createSim("tombs_of_amascut");
        const tracker = track(sim);
        expect(ids(tracker.tasks)).toContain("pathfinder");
        // Only at a raid level that high
        expect(ids(tracker.tasks)).not.toContain("movin_on_up");
        sim.tombsPathsDone.push("apmeken");
        expect(ids(tracker.observe(sim, []))).toContain("pathfinder");
        const supply = TOMBS_SUPPLY_ITEMS[0].id;
        tracker.observe(sim, [{ type: "itemUsed", itemId: supply, ...at }]);
        expect(said(status(tracker, sim, "spiritless")).reason).toBe("used a supply");
        expect(status(tracker, sim, "hardcore_tombs").state).toBe("on");
        sim.tombsDeaths = 1;
        tracker.observe(sim, []);
        expect(said(status(tracker, sim, "hardcore_tombs")).reason).toBe("died");
    });

    test("a mistake in a puzzle room is said, and changes nothing", () => {
        const sim = createSim("tombs_of_amascut");
        sim.tombsPath = "crondis";
        sim.tombsRoom = { crondis: { water: [0] } } as unknown as Sim["tombsRoom"];
        sim["crondisSpill"]();
        expect(sim.takeEvents()).toContainEqual({ type: "tombsMistake", path: "crondis" });
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

    // The game shows it every batch it drains, through handleEvents. One drained any other way
    // would hide what's in it, as a Smite's kill between ticks once was.
    test("is shown every batch of events the game drains", () => {
        const source = readFileSync(join(__dirname, "../client/GameClient.ts"), "utf8");
        const drains = source.split("\n").filter((line) => line.includes("takeEvents()"));
        expect(drains.length).toBeGreaterThan(0);
        for (const line of drains) {
            expect(line.trim()).toBe("this.handleEvents(sim, sim.takeEvents());");
        }
        expect(source).toMatch(/handleEvents\(sim: Sim, [^{]*\{[^}]*this\.observeCombat\(/);
    });
});
