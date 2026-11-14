import { describe, expect, test } from "vitest";

import {
    COIN_BONUS_CAP,
    HARD_PRESET,
    RUN_INVOCATIONS,
    RUN_SET,
    TOMBS_SET,
    cleanInvocations,
    getInvocationBadge,
    getInvocationCoins,
    getInvocationPoints,
    getRaidLevel,
    toggleInvocation,
} from "../content/invocations";
import { MAPS, getMap, takesInvocations, takesRelics } from "../content/maps";
import { RELICS, cleanRelics, getOpenRelicTiers, pickRelic } from "../content/relics";
import { emptyStats } from "../content/types";
import { getWeapon, getWeaponStyle } from "../content/weapons";
import { Sim, SimOptions } from "./Sim";
import { applyAction, cleanAction } from "./lockstep";
import { createSave, isHardRecord, migrateSave, recordRun } from "./save";
import { makeGrid } from "./world/testGrid";

function openField(): string[] {
    const size = 72;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
        let row = "";
        for (let x = 0; x < size; x++) {
            row += x === 0 || y === 0 || x === size - 1 || y === size - 1 ? "#" : ".";
        }
        rows.push(row);
    }
    return rows;
}

function sim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(openField(), 1000, 1000),
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        mapId: "desert",
        ...options,
    });
}

describe("which maps take invocations and relics", () => {
    test("invocations from the Desert on and on Act II maps; relics on every campaign map", () => {
        const taking = MAPS.filter((map) => takesInvocations(map)).map((map) => map.id);
        expect(taking).toContain("desert");
        expect(taking).toContain("inferno");
        expect(taking).toContain("stranglewood");
        expect(taking).toContain("scar");
        for (const id of ["lumbridge", "barrows", "wilderness", "awakened_vardorvis"]) {
            expect(taking).not.toContain(id);
        }
        // A remix (later) takes them on any campaign map
        expect(takesInvocations(getMap("lumbridge"), true)).toBe(true);
        expect(takesRelics(getMap("lumbridge"))).toBe(true);
        expect(takesRelics(getMap("ghorrock"))).toBe(true);
        for (const map of MAPS.filter((m) => m.fight || m.stages || m.seasonal)) {
            expect(takesInvocations(map), map.id).toBe(false);
            expect(takesRelics(map), map.id).toBe(false);
        }
        expect(takesRelics(getMap("tombs_of_amascut"))).toBe(false);
        expect(takesInvocations(getMap("tombs_of_amascut"))).toBe(false);
    });
});

describe("the boards", () => {
    test("the Tombs' board cleans and levels as it did", () => {
        expect(cleanInvocations(["try_again", "persistence", "run_glass_cannon"])).toEqual([
            "persistence",
        ]);
        expect(getRaidLevel(["persistence", "walk_the_path"])).toBe(60);
        expect(toggleInvocation(["try_again"], "softcore_run")).toEqual(["softcore_run"]);
    });

    test("a run's board keeps only its own, and adds up points and coins", () => {
        expect(cleanInvocations(["try_again", "run_glass_cannon"], RUN_SET)).toEqual([
            "run_glass_cannon",
        ]);
        const all = RUN_INVOCATIONS.filter((i) => !i.hard).map((i) => i.id);
        expect(getInvocationPoints(all)).toBe(120);
        expect(getInvocationPoints(HARD_PRESET)).toBe(180);
        expect(getInvocationPoints([...all, ...HARD_PRESET])).toBe(300);
        // Hard mode's preset pays what hard mode always has, exactly
        expect(getInvocationCoins(HARD_PRESET)).toBe(0.25);
        expect(getInvocationCoins(["run_glass_cannon"])).toBeCloseTo(0.3);
        expect([0, 99, 100, 250, 300].map(getInvocationBadge)).toEqual([0, 0, 100, 200, 300]);
        expect(TOMBS_SET.byId.has("run_glass_cannon")).toBe(false);
    });
});

describe("hard mode as a preset of invocations", () => {
    test("the Hard switch turns on the preset where the map has the board", () => {
        const hard = sim({ hard: true });
        expect(hard.hard).toBe(true);
        expect(hard.invocations).toEqual(HARD_PRESET);
        expect(hard.invocationPoints).toBe(180);
        // The preset by itself is hard mode, with or without the switch
        const preset = sim({ invocations: [...HARD_PRESET] });
        expect(preset.hard).toBe(true);
        expect(preset.getResult()).toMatchObject({ hard: true, points: 180 });
        // Part of it isn't
        expect(sim({ invocations: ["run_hard_foes"] }).hard).toBe(false);
        // Off the board's maps it's still the switch
        const lumbridge = sim({ mapId: "lumbridge", hard: true });
        expect(lumbridge.hard).toBe(true);
        expect(lumbridge.invocations).toEqual([]);
        expect(lumbridge.getResult().points).toBeUndefined();
        // and a run's invocations do nothing there
        expect(sim({ mapId: "lumbridge", invocations: ["run_glass_cannon"] }).invocations).toEqual(
            [],
        );
    });

    test("coins: the bonuses add together, up to the cap", () => {
        expect(sim().coinScale).toBe(1);
        expect(sim({ hard: true }).coinScale).toBe(1.25);
        expect(sim({ mapId: "lumbridge", hard: true }).coinScale).toBe(1.25);
        expect(sim({ invocations: ["run_glass_cannon"] }).coinScale).toBeCloseTo(1.3);
        const everything = RUN_INVOCATIONS.map((i) => i.id);
        // +180% and +25%, and an act's last step on top: the cap
        expect(sim({ invocations: everything }).coinScale).toBeCloseTo(3.05);
        expect(
            sim({ mapId: "stranglewood", invocations: everything, actStep: 3 }).coinScale,
        ).toBeLessThanOrEqual(1 + COIN_BONUS_CAP);
    });
});

describe("a run's invocations", () => {
    test("Glass Cannon, Overly Draining and Hardcore", () => {
        const base = sim();
        const glass = sim({ invocations: ["run_glass_cannon"] });
        expect(glass.player.maxHp).toBe(Math.round(base.player.maxHp / 2));
        const metaStats = { ...emptyStats(), reroll: 2, banish: 2, revival: 1 };
        const drained = sim({ metaStats, invocations: ["run_overly_draining"] });
        expect([drained.rerollsLeft, drained.banishesLeft]).toEqual([0, 0]);
        expect(sim({ metaStats }).rerollsLeft).toBeGreaterThan(0);
        expect(sim({ metaStats, invocations: ["run_hardcore"] }).revivesLeft).toBe(0);
        expect(sim({ metaStats }).revivesLeft).toBe(1);
    });

    test("Ancient Haste runs the map's clock fast; Blood Moon brings bosses a minute early", () => {
        const haste = sim({ invocations: ["run_ancient_haste"] });
        for (let i = 0; i < 40; i++) {
            haste.step();
        }
        expect(haste.mapSeconds).toBeCloseTo(haste.seconds * 1.25);
        const moon = sim({ invocations: ["run_blood_moon"] });
        const plain = sim();
        const bossAt = (s: Sim) =>
            s.mapEvents.filter((e) => e.kind === "finalBoss" || e.kind === "boss").map((e) => e.at);
        expect(bossAt(moon)).toEqual(bossAt(plain).map((at) => Math.max(0, at - 60)));
        const times = moon.mapEvents.map((e) => e.at);
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });
});

describe("relics", () => {
    test("cleaned to one a tier, in open tiers only", () => {
        expect(cleanRelics(["trickster", "endless_harvest", "nope", "reloaded"])).toEqual([
            "endless_harvest",
            "reloaded",
        ]);
        expect(cleanRelics(["trickster", "globetrotter"], 1)).toEqual(["trickster"]);
        expect(pickRelic(["trickster", "globetrotter"], 1, "endless_harvest")).toEqual([
            "endless_harvest",
            "globetrotter",
        ]);
        expect(pickRelic(["trickster"], 1)).toEqual([]);
        expect(getOpenRelicTiers({})).toBe(0);
        expect(getOpenRelicTiers({ stranglewood: 1, inferno: 3 })).toBe(1);
        expect(
            getOpenRelicTiers({ stranglewood: 1, lassar_undercity: 1, ghorrock: 2, scar: 1 }),
        ).toBe(4);
        expect(RELICS.length).toBe(11);
    });

    test("on the hero only where the map takes them", () => {
        expect(sim({ relics: ["trickster"] }).hasRelic("trickster")).toBe(true);
        expect(
            sim({ mapId: "awakened_vardorvis", relics: ["trickster"] }).hasRelic("trickster"),
        ).toBe(false);
        expect(sim({ relics: ["trickster"] }).getResult().relics).toEqual(["trickster"]);
    });

    test("stats: Fairy's Flight, Globetrotter, Specialist", () => {
        const base = sim();
        expect(sim({ relics: ["fairys_flight"] }).stats.moveSpeed).toBeCloseTo(
            base.stats.moveSpeed + 0.1,
        );
        expect(sim({ relics: ["globetrotter"] }).stats.powerUpRate).toBeCloseTo(0.2);
        const specialist = sim({ relics: ["specialist"] });
        expect(specialist.maxWeapons).toBe(base.maxWeapons - 1);
        expect(specialist.stats.might).toBeCloseTo(base.stats.might + 0.25);
    });

    test("Grimoire starts with a Common of the class", () => {
        const grimoire = sim({ characterId: "wizard", relics: ["grimoire"] });
        expect(grimoire.weapons.length).toBe(2);
        const second = getWeapon(grimoire.weapons[1].def.id);
        expect(second.rarity).toBe("common");
        expect(getWeaponStyle(second)).toBe("magic");
    });

    test("Trickster misses a hit every 15 seconds", () => {
        const tricked = sim({ relics: ["trickster"] });
        const hp = tricked.player.hp;
        expect(tricked["damagePlayer"](10, "goblin", false)).toBe(0);
        expect(tricked.player.hp).toBe(hp);
        tricked.player.invulnerable = 0;
        expect(tricked["damagePlayer"](10, "goblin", false)).toBeGreaterThan(0);
        expect(tricked.takeEvents().some((e) => e.type === "playerHit" && e.missed)).toBe(true);
    });

    test("Last Recall: once, back to the start with half the hitpoints", () => {
        const recall = sim({ relics: ["last_recall"] });
        recall.player.x += 10;
        recall.player.hp = 1;
        recall["damagePlayer"](50, "goblin", false);
        expect(recall.runOver).toBe(false);
        expect(recall.player.hp).toBe(Math.round(recall.player.maxHp / 2));
        expect(Math.abs(recall.player.x - 1036.5)).toBeLessThan(1);
        recall.player.hp = 1;
        recall.player.invulnerable = 0;
        recall["damagePlayer"](50, "goblin", false);
        expect(recall.runOver).toBe(true);
    });

    test("Bloodthirsty heals every 50 kills", () => {
        const thirsty = sim({ relics: ["bloodthirsty"] });
        thirsty.player.hp = 10;
        for (let i = 0; i < 50; i++) {
            thirsty["countRelicKill"]();
        }
        expect(thirsty.player.hp).toBe(10 + thirsty.player.maxHp * 0.05);
    });

    test("Production Prodigy: a casket doesn't stop the run", () => {
        const prodigy = sim({ relics: ["production_prodigy"] });
        prodigy.openCasket("easy");
        expect(prodigy.state).toBe("playing");
        expect(prodigy.chests.length).toBe(0);
        const plain = sim();
        plain.openCasket("easy");
        expect(plain.state).toBe("chest");
    });

    test("Reloaded keeps an offer and gives it back at a later level up", () => {
        const reloaded = sim({ relics: ["reloaded"] });
        reloaded.state = "levelUp";
        reloaded.pendingLevelUps = 1;
        reloaded.choices = [{ kind: "coins", amount: 10 }];
        const kept = reloaded.choices;
        expect(applyAction(reloaded, cleanAction({ kind: "keep" })!)).toBe(true);
        expect(reloaded.pendingLevelUps).toBe(0);
        expect(reloaded.state).toBe("playing");
        // A later level up: the kept offer first, then this one's
        reloaded.state = "levelUp";
        reloaded.pendingLevelUps = 1;
        reloaded.choices = [{ kind: "food", amount: 5 }];
        const now = reloaded.choices;
        expect(applyAction(reloaded, cleanAction({ kind: "takeKept" })!)).toBe(true);
        expect(reloaded.pendingLevelUps).toBe(2);
        expect(reloaded.choices).toEqual(kept);
        reloaded.choose(0);
        expect(reloaded.choices).toBe(now);
        // Twice a run
        expect(reloaded["hero"].relics.keepsLeft).toBe(1);
        expect(sim().canKeepOffer).toBe(false);
    });
});

describe("records", () => {
    const win = {
        mapId: "desert",
        victory: true,
        seconds: 900,
        level: 30,
        kills: 1,
        coins: 0,
        bossesKilled: [],
    };

    test("a hard win with relics on counts, but sets no hard-mode record", () => {
        const save = createSave();
        recordRun(save, { ...win, hard: true, relics: ["trickster"], points: 180 });
        expect(save.mapVictories.desert).toBe(1);
        expect(save.hardVictories.desert).toBeUndefined();
        expect(isHardRecord({ ...win, hard: true })).toBe(true);
        recordRun(save, { ...win, hard: true, points: 180 });
        expect(save.hardVictories.desert).toBe(1);
    });

    test("the best at invocation points is kept, with its relics, and loads back", () => {
        const save = createSave();
        recordRun(save, { ...win, points: 45, relics: ["trickster"] });
        recordRun(save, { ...win, points: 30, seconds: 600 });
        expect(save.invocationBest?.desert).toEqual({
            points: 45,
            seconds: 900,
            relics: ["trickster"],
        });
        recordRun(save, { ...win, points: 45, seconds: 800 });
        expect(save.invocationBest?.desert).toEqual({ points: 45, seconds: 800 });
        save.runInvocations = ["run_glass_cannon"];
        save.relics = ["trickster", "reloaded"];
        const loaded = migrateSave(
            JSON.parse(
                JSON.stringify({
                    ...save,
                    runInvocations: ["run_glass_cannon", "run_hard_foes", "insanity"],
                    relics: ["trickster", "nope"],
                }),
            ),
        );
        expect(loaded.invocationBest).toEqual(save.invocationBest);
        // Hard mode's are the switch's, and the Tombs' aren't a run's
        expect(loaded.runInvocations).toEqual(["run_glass_cannon"]);
        expect(loaded.relics).toEqual(["trickster"]);
        // An old save has none of it
        const old = migrateSave({ coins: 5, invocations: ["insanity"] });
        expect(old.runInvocations).toBeUndefined();
        expect(old.relics).toBeUndefined();
        expect(old.invocations).toEqual(["insanity"]);
    });
});
