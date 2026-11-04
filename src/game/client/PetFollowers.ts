import { PET_BY_ID, PetDef } from "../content/pets";
import { walkSpeed, walkToward } from "../core/PlayerMovement";
import { PLAYER_SPEED, Sim } from "../core/Sim";
import { moveCircle } from "../core/world/Collision";

// Pets follow their players about, a tick at a time on the sim's ticks, but only on screen: the
// sim knows nothing of them, so they can't change a run or a co-op party's agreement on it.
// Each walks to just behind its player as they're drawn (a co-op guest's own hero is drawn ahead
// of the sim, where prediction has them), inside the thralls (which stand fanned out to either
// side further back), and keeps clear of them.

// Tiles behind the player a pet stands
export const PET_FOLLOW_DISTANCE = 1.3;
// A bit quicker than its player, however fast they're going, so it catches up
const PET_SPEED = 1.15;
// Left this far behind (stuck behind a wall, or the party moved), it's back beside its player
export const PET_LEASH = 12;
export const PET_RADIUS = 0.3;
// How close a pet comes to a thrall before it's pushed aside
export const PET_THRALL_GAP = 0.9;
// How far short of its spot it stops
const PET_STOP = 0.25;
// Moved less than this in a tick, it's standing: pressed against a wall it can't get through,
// it doesn't walk on the spot
const PET_STILL = 0.01;
// Ticks caught up at once: past this (the tab was away), they're put back beside their players
const MAX_CATCH_UP = 20;

// Where a player is drawn, and the way they face (RS yaw)
export type PetLeader = { x: number; y: number; yaw: number };

export type PetFollower = {
    def: PetDef;
    hero: number;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    yaw: number;
    moving: boolean;
};

export class PetFollowers {
    pets: PetFollower[] = [];
    private tick = -1;

    // Each hero's pet id (or none), in the run's hero order. An id this game doesn't know is
    // left out: another player's newer game could send one.
    setPets(petIds: readonly (string | undefined)[]): void {
        this.pets = [];
        this.tick = -1;
        petIds.forEach((id, hero) => {
            const def = id === undefined ? undefined : PET_BY_ID.get(id);
            if (def) {
                this.pets.push({
                    def,
                    hero,
                    x: 0,
                    y: 0,
                    prevX: 0,
                    prevY: 0,
                    yaw: 0,
                    moving: false,
                });
            }
        });
    }

    // Up to the sim's tick, following each hero where they're drawn (by default, the sim's
    // players)
    update(
        sim: Sim,
        leader: (hero: number) => PetLeader | undefined = (hero) => sim.heroes[hero]?.player,
    ): void {
        if (this.tick === -1 || sim.tick < this.tick || sim.tick - this.tick > MAX_CATCH_UP) {
            for (const pet of this.pets) {
                this.place(sim, pet, leader(pet.hero));
            }
            this.tick = sim.tick;
            return;
        }
        for (; this.tick < sim.tick; this.tick++) {
            for (const pet of this.pets) {
                this.step(sim, pet, leader(pet.hero), this.tick);
            }
        }
    }

    // Whether it's drawn: not once its player's left the party
    shown(sim: Sim, pet: PetFollower): boolean {
        const hero = sim.heroes[pet.hero];
        return hero !== undefined && !hero.left;
    }

    private place(sim: Sim, pet: PetFollower, leader: PetLeader | undefined): void {
        if (!leader) {
            return;
        }
        const [x, y] = goal(leader);
        // Out from where its player stands, so it's never put in a wall or on the far side of one
        pet.x = leader.x;
        pet.y = leader.y;
        moveCircle(sim.grid, pet, x - leader.x, y - leader.y, PET_RADIUS);
        pet.prevX = pet.x;
        pet.prevY = pet.y;
        pet.yaw = leader.yaw;
        pet.moving = false;
    }

    private step(sim: Sim, pet: PetFollower, leader: PetLeader | undefined, tick: number): void {
        pet.prevX = pet.x;
        pet.prevY = pet.y;
        const hero = sim.heroes[pet.hero];
        if (!leader || !hero) {
            return;
        }
        let [goalX, goalY] = goal(leader);
        // Out of a thrall's way
        for (const thrall of sim.thralls) {
            const dx = goalX - thrall.x;
            const dy = goalY - thrall.y;
            const apart = Math.hypot(dx, dy);
            if (apart < PET_THRALL_GAP) {
                const push = (PET_THRALL_GAP - apart) / Math.max(apart, 0.01);
                goalX += apart > 0.01 ? dx * push : PET_THRALL_GAP;
                goalY += apart > 0.01 ? dy * push : 0;
            }
        }
        // As fast as its player can go (the sled, boots, a potion), and never slower than walking
        const playerSpeed = walkSpeed({
            baseSpeed: PLAYER_SPEED,
            moveSpeed: hero.stats.moveSpeed,
            tick,
            sledEndTick: hero.sledEndTick,
            sledSpeed: hero.sledSpeed,
        });
        const speed = Math.max(PLAYER_SPEED, playerSpeed) * PET_SPEED;
        walkToward(sim.grid, pet, goalX, goalY, PET_STOP, speed, PET_RADIUS);
        pet.moving = Math.hypot(pet.x - pet.prevX, pet.y - pet.prevY) > PET_STILL;
        if (!pet.moving) {
            pet.yaw = leader.yaw;
        }
        if (Math.hypot(leader.x - pet.x, leader.y - pet.y) > PET_LEASH) {
            this.place(sim, pet, leader);
        }
    }
}

// Just behind the player, from the way they're facing: yaw 0 faces south (0, -1), 512 west
function goal(leader: PetLeader): [number, number] {
    const angle = (leader.yaw / 2048) * 2 * Math.PI;
    const facingX = -Math.sin(angle);
    const facingY = -Math.cos(angle);
    return [leader.x - facingX * PET_FOLLOW_DISTANCE, leader.y - facingY * PET_FOLLOW_DISTANCE];
}
