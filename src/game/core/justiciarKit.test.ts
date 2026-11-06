import { describe, expect, it } from "vitest";

import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { JUSTICIAR_ABILITIES } from "../content/justiciarKit";
import { getMap, getMapCharacter } from "../content/maps";
import { emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { applyAction, cleanAction, syncHash } from "./lockstep";
import { makeGrid } from "./world/testGrid";

// Justiciar Zachariah as the player in the Battle for Varrock (content/justiciarKit.ts): his own
// buttons go off where he faces with nothing to hit, land as they're timed, hit what's there,
// and play the same on every copy of a run.

const MAP = getMap("battle_for_varrock");
const SIZE = 48;
// An open square round the map's spawn, with a wall along its north edge
const ROWS = Array.from({ length: SIZE }, (_, row) => (row === 0 ? "#" : ".").repeat(SIZE));
const BASE_X = Math.floor(MAP.spawn.x) - SIZE / 2;
const BASE_Y = Math.floor(MAP.spawn.y) - SIZE / 2;

function createSim(seed = 1): Sim {
    return new Sim({
        grid: makeGrid(ROWS, BASE_X, BASE_Y),
        mapId: MAP.id,
        characterId: getMapCharacter(MAP)!,
        metaStats: emptyStats(),
        seed,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
    });
}

function run(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
    const ticks = Math.round(seconds * TICKS_PER_SECOND);
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step(moveX, moveY);
    }
}

const slot = (id: string) => JUSTICIAR_ABILITIES.findIndex((a) => a.id === id);

describe("the Battle for Varrock's Justiciar Zachariah", () => {
    it("is the map's hero, drawn as his NPC, kept to the map", () => {
        const hero = getCharacter(getMapCharacter(MAP)!);
        expect(hero.only).toBe(MAP.id);
        expect(hero.npcLook?.npcId).toBe(7858);
        expect(hero.abilities?.map((a) => a.id)).toEqual([
            "lunge",
            "shock_wave",
            "ice_barrage",
            "lightning",
            "owls_gaze",
        ]);
    });

    it("walks round a map with nothing in it, and nothing hurts", () => {
        const sim = createSim();
        run(sim, 60, 0, 1);
        expect(sim.enemies.length).toBe(0);
        expect(sim.state).toBe("playing");
        expect(sim.player.hp).toBe(sim.player.maxHp);
    });

    it("uses every button with nothing to hit: its animation, its effects, then its cooldown", () => {
        const sim = createSim();
        run(sim, 0.2, 1, 0);
        for (const ability of JUSTICIAR_ABILITIES) {
            const i = slot(ability.id);
            const effects = sim.effects.length;
            expect(sim.useAbility(i)).toBe(true);
            expect(sim.player.attackSeq).toBe(ability.seq);
            // Charging now
            expect(sim.useAbility(i)).toBe(false);
            run(sim, ability.windup + 0.4);
            expect(sim.effects.length, ability.id).toBeGreaterThan(effects);
            run(sim, ability.cooldown);
            expect(sim.kitSecondsLeft(i)).toBe(0);
        }
    });

    it("lunges six tiles the way he faces, and a wall stops him", () => {
        const sim = createSim();
        run(sim, 0.1, 1, 0);
        const from = sim.player.x;
        sim.useAbility(slot("lunge"));
        run(sim, 1.2);
        expect(sim.player.x - from).toBeCloseTo(5.8, 1);
        // North, into the wall along the top
        run(sim, 2.5, 0, 1);
        const y = sim.player.y;
        sim.useAbility(slot("lunge"));
        run(sim, 1.2);
        expect(sim.player.y).toBeLessThan(BASE_Y + SIZE - 1);
        expect(sim.player.y).toBeGreaterThanOrEqual(y - 0.01);
    });

    it("hits what's in the way, once, and the wave and the ice hold it", () => {
        const sim = createSim();
        run(sim, 0.1, 0, -1);
        const goblin = getEnemy("goblin");
        const p = sim.player;
        const wave = sim.spawnEnemy(goblin, "normal", { x: p.x, y: p.y - 6 })!;
        const hp = wave.hp;
        sim.useAbility(slot("shock_wave"));
        run(sim, 0.7);
        wave.x = p.x;
        wave.y = p.y - 2;
        run(sim, 1);
        expect(wave.dead || wave.hp < hp).toBe(true);
        const judged = sim.spawnEnemy(goblin, "normal", { x: p.x + 4, y: p.y })!;
        sim.useAbility(slot("owls_gaze"));
        run(sim, 2);
        expect(judged.dead || judged.hp < judged.maxHp).toBe(true);
    });

    it("plays the same on every copy, pressed through co-op's actions", () => {
        const play = () => {
            const sim = createSim(7);
            const hashes: number[] = [];
            for (let i = 0; i < JUSTICIAR_ABILITIES.length * 2; i++) {
                sim.spawnEnemy(getEnemy("goblin"), "normal", {
                    x: sim.player.x + 3,
                    y: sim.player.y + (i % 3) - 1,
                });
                const action = cleanAction({ kind: "ability", index: i % 5 });
                expect(action).toEqual({ kind: "ability", index: i % 5 });
                applyAction(sim, action!);
                run(sim, 0.9, i % 2 === 0 ? 1 : -1, 0);
                hashes.push(syncHash(sim));
            }
            return hashes;
        };
        expect(play()).toEqual(play());
    });

    it("keeps a fight's own button as it was", () => {
        expect(cleanAction({ kind: "ability" })).toEqual({ kind: "ability" });
        expect(cleanAction({ kind: "ability", index: -1 })).toBeUndefined();
    });
});
