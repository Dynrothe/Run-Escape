import { describe, expect, test } from "vitest";

import { isMapOut } from "./acts";
import { ENEMIES } from "./enemies";
import { ALL_MAPS } from "./maps";
import {
    MECHANIC_NAMES,
    diaryKills,
    getDiaryEntries,
    getDiaryMaps,
    isDiaryKnown,
    mapAppearances,
} from "./monsterDiary";
import { MONSTER_DROPS, MONSTER_LORE } from "./monsterLore";

describe("the Monster diary", () => {
    const entries = getDiaryEntries();

    test("lists every enemy on a map that's out, one entry for each name", () => {
        const onMaps = new Set(
            ALL_MAPS.filter((map) => !map.dev && isMapOut(map)).flatMap((map) => [
                ...mapAppearances(map).keys(),
            ]),
        );
        const names = new Set(entries.map((entry) => entry.name));
        expect(names.size).toBe(entries.length);
        const listed = new Set(entries.flatMap((entry) => entry.variants.map((v) => v.def.id)));
        for (const id of onMaps) {
            expect(listed.has(id), id).toBe(true);
        }
    });

    test("reads only maps that are out, and no dev map", () => {
        for (const map of getDiaryMaps()) {
            expect(isMapOut(map) && !map.dev, map.id).toBe(true);
        }
    });

    test("writes nothing for a monster that isn't there", () => {
        const names = new Set(ENEMIES.map((enemy) => enemy.name));
        for (const name of Object.keys(MONSTER_LORE)) {
            expect(names.has(name), `lore for "${name}", which no enemy is called`).toBe(true);
        }
    });

    test("writes each monster's lore in full, with no placeholder left in it", () => {
        for (const [name, lore] of Object.entries(MONSTER_LORE)) {
            expect(lore.about.length, `${name}: about`).toBeGreaterThan(15);
            expect(lore.where.length, `${name}: where`).toBeGreaterThan(5);
            const text = [lore.about, lore.where, ...lore.trivia].join(" ");
            expect(text, name).not.toMatch(/\b(TODO|TBD|FIXME|XXX)\b|\?\?|\\'/);
            // A line that's said twice in one entry is a slip
            expect(new Set(lore.trivia).size, `${name}: trivia`).toBe(lore.trivia.length);
        }
    });

    test("knows a map for every monster", () => {
        for (const entry of entries) {
            expect(entry.mapIds.length, entry.name).toBeGreaterThan(0);
        }
    });

    test("names only mechanics that are enemies", () => {
        const names = new Set(ENEMIES.map((enemy) => enemy.name));
        for (const name of MECHANIC_NAMES) {
            expect(names.has(name), name).toBe(true);
        }
    });

    test("puts monsters before bosses and bosses before a fight's mechanics", () => {
        const rank = { monster: 0, boss: 1, mechanic: 2 };
        const ranks = entries.map((entry) => rank[entry.kind]);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });

    test("reads when a monster comes from the map's own waves", () => {
        const lumbridge = ALL_MAPS.find((map) => map.id === "lumbridge")!;
        const found = mapAppearances(lumbridge);
        const goblin = found.get("goblin")!.find((a) => a.how === "wave")!;
        const first = Math.min(
            ...lumbridge.waves
                .filter((w) => w.enemies.some((e) => e.id === "goblin"))
                .map((w) => w.start),
        );
        expect(goblin.from).toBe(first);
    });

    test("reads a final boss's time from the map's events", () => {
        const lumbridge = ALL_MAPS.find((map) => map.id === "lumbridge")!;
        const event = lumbridge.events.find((e) => e.kind === "finalBoss")!;
        const wise = mapAppearances(lumbridge).get(event.enemyId)!;
        expect(wise.find((a) => a.how === "finalBoss")?.from).toBe(event.at);
    });

    test("lists a map only if someone is on it", () => {
        const used = new Set(entries.flatMap((entry) => entry.mapIds));
        const maps = getDiaryMaps();
        expect(maps.length).toBeGreaterThan(0);
        for (const map of maps) {
            expect(used.has(map.id), map.id).toBe(true);
        }
    });

    test("knows a monster once it's killed, and a fight's mechanic once its map is beaten", () => {
        const none = { enemyKills: {}, mapVictories: {} };
        const goblin = entries.find((entry) => entry.name === "Goblin")!;
        expect(isDiaryKnown(goblin, none)).toBe(false);
        const killed = { enemyKills: { [goblin.variants[0].def.id]: 1 }, mapVictories: {} };
        expect(isDiaryKnown(goblin, killed)).toBe(true);
        // A boss isn't known for beating its map: it has to be killed
        const boss = entries.find((entry) => entry.kind === "boss")!;
        expect(isDiaryKnown(boss, { enemyKills: {}, mapVictories: { [boss.mapIds[0]]: 1 } })).toBe(
            false,
        );
        const mechanic = entries.find((entry) => entry.kind === "mechanic")!;
        expect(isDiaryKnown(mechanic, none)).toBe(false);
        const won = { enemyKills: {}, mapVictories: { [mechanic.mapIds[0]]: 1 } };
        expect(isDiaryKnown(mechanic, won)).toBe(true);
    });

    test("adds up kills over every form of a monster", () => {
        const scarab = entries.find((entry) => entry.variants.length > 1)!;
        const kills = Object.fromEntries(scarab.variants.map((v, i) => [v.def.id, i + 1]));
        const total = scarab.variants.reduce((sum, _v, i) => sum + i + 1, 0);
        expect(diaryKills(scarab, kills)).toBe(total);
        expect(diaryKills(scarab, {})).toBe(0);
    });

    test("lists unique drops only for monsters that exist, each said once and in full", () => {
        const names = new Set(ENEMIES.map((enemy) => enemy.name));
        for (const [name, drops] of Object.entries(MONSTER_DROPS)) {
            expect(names.has(name), `drops for "${name}", which no enemy is called`).toBe(true);
            expect(drops.length, name).toBeGreaterThan(0);
            expect(new Set(drops).size, name).toBe(drops.length);
            for (const drop of drops) {
                expect(drop, name).not.toMatch(/\?|TODO|TBD/);
            }
        }
        const vorkath = entries.find((entry) => entry.name === "Vorkath")!;
        expect(vorkath.drops.length).toBeGreaterThan(0);
        expect(entries.find((entry) => entry.name === "Chicken")!.drops).toEqual([]);
    });
});
