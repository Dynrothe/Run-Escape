import { afterAll, describe, expect, it } from "vitest";

import { getEnemy } from "../content/enemies";
import {
    INVOCATIONS,
    INVOCATION_GROUPS,
    cleanInvocations,
    getRaidBand,
    getRaidLevel,
    getRaidLevelScale,
    toggleInvocation,
} from "../content/invocations";
import { MAP_BY_ID, getMap } from "../content/maps";
import { MapDef, emptyStats } from "../content/types";
import { Sim } from "./Sim";
import { createSave, migrateSave } from "./save";
import { makeGrid } from "./world/testGrid";

function field(): string[] {
    return Array.from({ length: 72 }, (_, y) =>
        Array.from({ length: 72 }, (_, x) =>
            x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".",
        ).join(""),
    );
}

const lumbridge = getMap("lumbridge");

// A Nexus in an open field, with a door 6 tiles east of where the party starts
const TEST_TOMBS: MapDef = {
    ...lumbridge,
    id: "test_tombs",
    waves: [],
    events: [],
    tombs: {
        paths: [{ id: "apmeken", name: "Path of Apmeken", door: { x: 1042.5, y: 1036.5 } }],
    },
};
MAP_BY_ID.set(TEST_TOMBS.id, TEST_TOMBS);
afterAll(() => {
    MAP_BY_ID.delete(TEST_TOMBS.id);
});

function tombs(invocations: string[], hard = false): Sim {
    return new Sim({
        grid: makeGrid(field(), 1000, 1000),
        mapId: TEST_TOMBS.id,
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        invocations,
        hard,
    });
}

describe("invocations", () => {
    it("are each in a group, with a raid level, and named once", () => {
        const groups = new Set(INVOCATION_GROUPS.map((group) => group.id));
        for (const invocation of INVOCATIONS) {
            expect(groups.has(invocation.group), invocation.id).toBe(true);
            expect(invocation.level, invocation.id).toBeGreaterThan(0);
        }
        expect(new Set(INVOCATIONS.map((i) => i.id)).size).toBe(INVOCATIONS.length);
    });

    it("allow one of a group that says so, the last picked, and stack the rest", () => {
        expect(cleanInvocations(["try_again", "hardcore_run"])).toEqual(["hardcore_run"]);
        expect(toggleInvocation(["try_again", "on_a_diet"], "persistence")).toEqual([
            "on_a_diet",
            "persistence",
        ]);
        expect(toggleInvocation(["on_a_diet", "dehydration"], "on_a_diet")).toEqual([
            "dehydration",
        ]);
        expect(cleanInvocations(["on_a_diet", "not_one", 4, "on_a_diet"])).toEqual(["on_a_diet"]);
    });

    it("add up to a raid level, in OSRS's bands", () => {
        expect(getRaidLevel([])).toBe(0);
        expect(getRaidLevel(["hardcore_run", "on_a_diet", "boulderdash"])).toBe(50);
        // Only the one attempts invocation counts
        expect(getRaidLevel(["try_again", "hardcore_run"])).toBe(25);
        expect([getRaidBand(0), getRaidBand(149), getRaidBand(150), getRaidBand(300)]).toEqual([
            "Entry",
            "Entry",
            "Normal",
            "Expert",
        ]);
    });

    it("make enemies 2% tougher every 5 levels, their damage to 150% more", () => {
        expect(getRaidLevelScale(0)).toEqual({ hp: 1, damage: 1 });
        expect(getRaidLevelScale(9).hp).toBeCloseTo(1.02);
        expect(getRaidLevelScale(150).hp).toBeCloseTo(1.6);
        expect(getRaidLevelScale(500).hp).toBeCloseTo(3);
        expect(getRaidLevelScale(500).damage).toBeCloseTo(2.5);
    });

    it("are kept in the save, as only what this game knows", () => {
        const save = createSave();
        expect(
            migrateSave({ ...save, invocations: ["hardcore_run", "nope", "try_again"] }),
        ).toMatchObject({ invocations: ["try_again"] });
        expect(migrateSave(save).invocations).toBeUndefined();
    });
});

describe("the Tombs of Amascut", () => {
    it("go by the raid level in place of hard mode", () => {
        const plain = tombs([], true);
        expect(plain.hard).toBe(false);
        expect(plain.raidLevel).toBe(0);
        const tough = tombs(["hardcore_run", "pathmaster", "dehydration"]);
        expect(tough.raidLevel).toBe(105);
        const goblin = getEnemy("goblin");
        const easy = plain.spawnEnemy(goblin, "normal")!;
        const hard = tough.spawnEnemy(goblin, "normal")!;
        expect(hard.maxHp / easy.maxHp).toBeCloseTo(getRaidLevelScale(105).hp, 1);
        expect(hard.damageScale).toBeGreaterThan(easy.damageScale);
    });

    it("ignore invocations anywhere else", () => {
        const sim = new Sim({
            grid: makeGrid(field(), 1000, 1000),
            mapId: "lumbridge",
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: 1036.5,
            spawnY: 1036.5,
            invocations: ["hardcore_run"],
        });
        expect(sim.invocations).toEqual([]);
        expect(sim.raidLevel).toBe(0);
    });

    it("say a path's door isn't open yet, once as you come up to it", () => {
        const sim = tombs([]);
        sim.weapons = [];
        const notices = () =>
            sim
                .takeEvents()
                .filter((e) => e.type === "notice" && e.message.includes("Path of Apmeken"));
        sim.step();
        expect(notices()).toHaveLength(0);
        sim.player.x = sim.player.prevX = 1041;
        sim.step();
        expect(notices()).toHaveLength(1);
        sim.step();
        sim.step();
        expect(notices()).toHaveLength(0);
        // Away and back: it says so again
        sim.player.x = sim.player.prevX = 1030;
        sim.step();
        sim.player.x = sim.player.prevX = 1041;
        sim.step();
        expect(notices()).toHaveLength(1);
    });
});
