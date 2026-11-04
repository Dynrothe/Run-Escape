import { PET_BY_ID, PetDef } from "../content/pets";
import { yawFromVector } from "../core/PlayerMovement";
import { PLAYER_SPEED, Sim } from "../core/Sim";
import { moveCircle } from "../core/world/Collision";

// Pets follow their players about, a tick at a time on the sim's ticks, but only on screen: the
// sim knows nothing of them, so they can't change a run or a co-op party's agreement on it.
// Each walks to just behind its player, inside the thralls (which stand fanned out to either
// side further back), and keeps clear of them.

// Tiles behind the player a pet stands
export const PET_FOLLOW_DISTANCE = 1.3;
// A bit quicker than the player, so it catches up
const PET_SPEED = PLAYER_SPEED * 1.15;
// Left this far behind (stuck behind a wall, or the party moved), it's back beside its player
export const PET_LEASH = 12;
const PET_RADIUS = 0.3;
// How close a pet comes to a thrall before it's pushed aside
export const PET_THRALL_GAP = 0.9;
// Ticks caught up at once: past this (the tab was away), they're put back beside their players
const MAX_CATCH_UP = 20;

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

    // Up to the sim's tick
    update(sim: Sim): void {
        if (this.tick === -1 || sim.tick < this.tick || sim.tick - this.tick > MAX_CATCH_UP) {
            for (const pet of this.pets) {
                this.place(sim, pet);
            }
            this.tick = sim.tick;
            return;
        }
        for (; this.tick < sim.tick; this.tick++) {
            for (const pet of this.pets) {
                this.step(sim, pet);
            }
        }
    }

    // Whether it's drawn: not once its player's left the party
    shown(sim: Sim, pet: PetFollower): boolean {
        const hero = sim.heroes[pet.hero];
        return hero !== undefined && !hero.left;
    }

    private place(sim: Sim, pet: PetFollower): void {
        const player = sim.heroes[pet.hero]?.player;
        if (!player) {
            return;
        }
        const [x, y] = goal(player);
        pet.x = pet.prevX = x;
        pet.y = pet.prevY = y;
        pet.yaw = player.yaw;
        pet.moving = false;
    }

    private step(sim: Sim, pet: PetFollower): void {
        const player = sim.heroes[pet.hero]?.player;
        pet.prevX = pet.x;
        pet.prevY = pet.y;
        if (!player) {
            return;
        }
        let [goalX, goalY] = goal(player);
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
        const dx = goalX - pet.x;
        const dy = goalY - pet.y;
        const distance = Math.hypot(dx, dy);
        const stop = 0.25;
        pet.moving = distance > stop;
        if (pet.moving) {
            const move = Math.min(PET_SPEED, distance - stop);
            moveCircle(sim.grid, pet, (dx / distance) * move, (dy / distance) * move, PET_RADIUS);
            pet.yaw = yawFromVector(dx, dy);
        } else {
            pet.yaw = player.yaw;
        }
        if (Math.hypot(player.x - pet.x, player.y - pet.y) > PET_LEASH) {
            this.place(sim, pet);
        }
    }
}

// Just behind the player, from the way they're facing
function goal(player: {
    x: number;
    y: number;
    facingX: number;
    facingY: number;
}): [number, number] {
    const length = Math.hypot(player.facingX, player.facingY);
    const [fx, fy] = length > 0 ? [player.facingX / length, player.facingY / length] : [0, 1];
    return [player.x - fx * PET_FOLLOW_DISTANCE, player.y - fy * PET_FOLLOW_DISTANCE];
}
