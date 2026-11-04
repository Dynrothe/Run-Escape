import { describe, expect, it } from "vitest";

import { PETS, getPetModelKey } from "../content/pets";
import { getPowerUp } from "../content/powerups";
import { TROPHY_BY_ID } from "../content/trophies";
import { emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { syncHash } from "../core/lockstep";
import { isCircleFree } from "../core/world/Collision";
import { makeGrid } from "../core/world/testGrid";
import { GameAssets } from "./GameAssets";
import {
    PET_FOLLOW_DISTANCE,
    PET_LEASH,
    PET_RADIUS,
    PET_THRALL_GAP,
    PetFollowers,
    PetLeader,
} from "./PetFollowers";

// The east edge of the tiles of the wall across the field, which is solid from x 1020 to 1021
// (its block a little in from the tile's edges)
const WALL_EAST = 1021;

// A field walled round, with a wall from north to south across it
function field(): string[] {
    return Array.from({ length: 72 }, (_, y) =>
        Array.from({ length: 72 }, (_, x) =>
            x === 0 || y === 0 || x === 71 || y === 71 || x === WALL_EAST - 1001 ? "#" : ".",
        ).join(""),
    );
}

// Overlapping nothing, the wall least of all
function clearOfWall(pet: { x: number; y: number }, sim: Sim): boolean {
    return isCircleFree(sim.grid, pet.x, pet.y, PET_RADIUS);
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

// What the pets could touch, were they to: the players and thralls
function snapshot(sim: Sim): string {
    return JSON.stringify([sim.tick, sim.heroes.map((hero) => hero.player), sim.thralls]);
}

type Walk = {
    leader?: (hero: number) => PetLeader | undefined;
    // After every tick
    each?: () => void;
};

// Walks the player so many ticks, the pets keeping up as the game walks them, and checks
// they leave the sim as it was
function steps(sim: Sim, pets: PetFollowers, ticks: number, dx = 1, dy = 0, walk: Walk = {}) {
    for (let i = 0; i < ticks; i++) {
        if (sim.state === "levelUp") {
            sim.choose(0);
        }
        if (sim.state === "event") {
            sim.leaveEvent();
        }
        sim.player.invulnerable = 1e6;
        sim.step(dx, dy);
        const before = snapshot(sim);
        pets.update(sim, walk.leader);
        expect(snapshot(sim)).toBe(before);
        walk.each?.();
    }
}

function walk(sim: Sim, pets: PetFollowers, seconds: number, dx = 1, dy = 0, options?: Walk) {
    steps(sim, pets, Math.round(seconds * TICKS_PER_SECOND), dx, dy, options);
}

function apart(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("pets", () => {
    it("are each a trophy, baked when they're wanted rather than in every run's bake", () => {
        const base = GameAssets.getBaseRequests().map((r) => r.key);
        const keys = GameAssets.getPetRequests(PETS).map((r) => r.key);
        for (const pet of PETS) {
            expect(TROPHY_BY_ID.has(pet.id), pet.id).toBe(true);
            expect(keys).toContain(getPetModelKey(pet.id));
            expect(base).not.toContain(getPetModelKey(pet.id));
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

    it("keep up with a player on the sled, faster than they could walk", () => {
        const sim = createSim();
        const pets = new PetFollowers();
        pets.setPets(["lil_nylo"]);
        pets.update(sim);
        const hero = sim.heroes[0];
        hero.sledEndTick = sim.tick + 10 * TICKS_PER_SECOND;
        hero.sledSpeed = 2.2;
        const startX = sim.player.x;
        let farthest = 0;
        walk(sim, pets, 3, 1, 0, {
            each: () => (farthest = Math.max(farthest, apart(pets.pets[0], sim.player))),
        });
        // Well past where walking would have taken them, the pet still right behind
        expect(sim.player.x - startX).toBeGreaterThan(15);
        expect(farthest).toBeLessThan(PET_FOLLOW_DISTANCE + 0.6);
    });

    it("leave the sim as it was: a run plays the same with a pet", () => {
        const plain = createSim();
        const withPet = createSim();
        for (const sim of [plain, withPet]) {
            sim.usePowerUp(getPowerUp("thrall"));
        }
        const pets = new PetFollowers();
        pets.setPets(["little_nightmare"]);
        // Into the wall and along it, where the pet's pushed about
        walk(plain, new PetFollowers(), 10, -1, 0.3);
        walk(withPet, pets, 10, -1, 0.3);
        expect(snapshot(withPet)).toBe(snapshot(plain));
        expect(syncHash(withPet)).toBe(syncHash(plain));
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

    it("stand, rather than walk on the spot, when the spot behind their player's in a wall", () => {
        const sim = createSim();
        const pets = new PetFollowers();
        pets.setPets(["lil_sot"]);
        sim.player.x = sim.player.prevX = WALL_EAST + 2;
        pets.update(sim);
        const pet = pets.pets[0];
        // Up to the wall, then a step back east: behind them is the wall
        walk(sim, pets, 1, -1, 0);
        steps(sim, pets, 1, 1, 0);
        walk(sim, pets, 3, 0, 0);
        expect(sim.player.x).toBeLessThan(WALL_EAST + 1);
        expect(pet.moving).toBe(false);
        expect(clearOfWall(pet, sim)).toBe(true);
        expect(pet.x).toBeLessThan(sim.player.x);
    });

    it("are never put inside a wall", () => {
        const sim = createSim();
        const pets = new PetFollowers();
        // Facing east with the wall a tile behind them
        sim.player.x = sim.player.prevX = WALL_EAST + 0.6;
        steps(sim, pets, 1, 1, 0);
        sim.player.x = sim.player.prevX = WALL_EAST + 0.6;
        pets.setPets(["lil_maiden"]);
        pets.update(sim);
        const pet = pets.pets[0];
        expect(clearOfWall(pet, sim)).toBe(true);
        expect(pet.x).toBeLessThan(sim.player.x);
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

    it("follow where their player's drawn, which for a co-op guest is ahead of the sim", () => {
        const sim = createSim();
        const pets = new PetFollowers();
        pets.setPets(["lil_zik"]);
        // Drawn 4 tiles on from where the sim has them
        const leader = () => ({ x: sim.player.x + 4, y: sim.player.y, yaw: sim.player.yaw });
        pets.update(sim, leader);
        walk(sim, pets, 2, 1, 0, { leader });
        expect(apart(pets.pets[0], leader())).toBeLessThan(PET_FOLLOW_DISTANCE + 0.5);
        expect(pets.pets[0].x).toBeGreaterThan(sim.player.x);
    });

    it("leave out an id this game doesn't know, and a hero without one", () => {
        const pets = new PetFollowers();
        pets.setPets([undefined, "not_a_pet", "lil_xarp"]);
        expect(pets.pets.map((p) => [p.hero, p.def.id])).toEqual([[2, "lil_xarp"]]);
    });
});
