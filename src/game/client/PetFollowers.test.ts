import { describe, expect, it } from "vitest";

import { PETS } from "../content/pets";
import { getPowerUp } from "../content/powerups";
import { TROPHY_BY_ID } from "../content/trophies";
import { emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { makeGrid } from "../core/world/testGrid";
import { GameAssets } from "./GameAssets";
import { PET_FOLLOW_DISTANCE, PET_LEASH, PET_THRALL_GAP, PetFollowers } from "./PetFollowers";

function field(): string[] {
    return Array.from({ length: 72 }, (_, y) =>
        Array.from({ length: 72 }, (_, x) =>
            x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".",
        ).join(""),
    );
}

function createSim(): Sim {
    const sim = new Sim({
        grid: makeGrid(field(), 1000, 1000),
        mapId: "lumbridge",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
    });
    sim.weapons = [];
    sim.player.invulnerable = 1e6;
    return sim;
}

// Walks the player east for so many seconds, the pets keeping up as the game draws them
function walk(sim: Sim, pets: PetFollowers, seconds: number, dx = 1, dy = 0): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
        if (sim.state === "levelUp") {
            sim.choose(0);
        }
        if (sim.state === "event") {
            sim.leaveEvent();
        }
        sim.player.invulnerable = 1e6;
        sim.step(dx, dy);
        pets.update(sim);
    }
}

function apart(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("pets", () => {
    it("are each a trophy, baked with their animations", () => {
        const keys = GameAssets.getBaseRequests().map((r) => r.key);
        for (const pet of PETS) {
            expect(TROPHY_BY_ID.has(pet.id), pet.id).toBe(true);
            expect(keys).toContain("pet:" + pet.id);
        }
        expect(new Set(PETS.map((p) => p.id)).size).toBe(PETS.length);
    });

    it("follow just behind their player, and catch up when they walk off", () => {
        const sim = createSim();
        const pets = new PetFollowers();
        pets.setPets(["lil_zik"]);
        pets.update(sim);
        const pet = pets.pets[0];
        walk(sim, pets, 4);
        expect(apart(pet, sim.player)).toBeLessThan(PET_FOLLOW_DISTANCE + 0.5);
        // Behind them: west of a player walking east
        expect(pet.x).toBeLessThan(sim.player.x);
        expect(pet.moving).toBe(true);
        walk(sim, pets, 2, 0, 0);
        expect(pet.moving).toBe(false);
    });

    it("leave the sim as it was: a run plays the same with a pet", () => {
        const plain = createSim();
        const withPet = createSim();
        const pets = new PetFollowers();
        pets.setPets(["little_nightmare"]);
        walk(plain, new PetFollowers(), 10);
        walk(withPet, pets, 10);
        expect(withPet.player.x).toBe(plain.player.x);
        expect(withPet.player.y).toBe(plain.player.y);
        expect(withPet.tick).toBe(plain.tick);
    });

    it("keep out of a thrall's way while it's out", () => {
        const sim = createSim();
        const pets = new PetFollowers();
        pets.setPets(["lil_bloat"]);
        sim.usePowerUp(getPowerUp("thrall"));
        sim.usePowerUp(getPowerUp("thrall"));
        expect(sim.thralls.length).toBe(2);
        pets.update(sim);
        let closest = Infinity;
        for (let i = 0; i < 8; i++) {
            walk(sim, pets, 1, Math.cos(i), Math.sin(i));
            walk(sim, pets, 1, 0, 0);
            for (const thrall of sim.thralls) {
                closest = Math.min(closest, apart(pets.pets[0], thrall));
            }
            expect(apart(pets.pets[0], sim.player)).toBeLessThan(PET_LEASH);
        }
        // Standing still, it's settled clear of both, still out
        expect(sim.thralls.length).toBe(2);
        expect(closest).toBeGreaterThan(PET_THRALL_GAP * 0.5);
        for (const thrall of sim.thralls) {
            expect(apart(pets.pets[0], thrall)).toBeGreaterThan(PET_THRALL_GAP * 0.8);
        }
    });

    it("are put back beside a player who's moved far off", () => {
        const sim = createSim();
        const pets = new PetFollowers();
        pets.setPets(["lil_sot"]);
        pets.update(sim);
        sim.player.x = sim.player.prevX = sim.player.x + 25;
        walk(sim, pets, 0.2, 0, 0);
        expect(apart(pets.pets[0], sim.player)).toBeLessThan(PET_FOLLOW_DISTANCE + 0.5);
    });

    it("leave out an id this game doesn't know, and a hero without one", () => {
        const pets = new PetFollowers();
        pets.setPets([undefined, "not_a_pet", "lil_xarp"]);
        expect(pets.pets.map((p) => [p.hero, p.def.id])).toEqual([[2, "lil_xarp"]]);
    });
});
