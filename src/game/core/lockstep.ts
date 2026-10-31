// Co-op runs in lockstep: every player's browser runs the same Sim, and only
// what the players do goes over the network. The host numbers the ticks
// (frames) and says what happened at each: who changed what they're pressing,
// who chose what. Everyone applies the same events at the same frames, so
// their copies of the run stay the same to the bit (see fmath.ts). No DOM
// here; client/coop sends the frames about.
import { ChestAction } from "./Loot";
import { Sim } from "./Sim";

// What a player can do besides moving
export type CoopAction =
    | { kind: "choose"; index: number }
    | { kind: "reroll" }
    | { kind: "skip" }
    | { kind: "chest"; action: ChestAction }
    | { kind: "item"; index: number }
    // A random event's offer: take one of its options, or walk away
    | { kind: "event"; index: number }
    | { kind: "leaveEvent" };

// Something that happens to a hero just before frame `frame` is stepped:
// what they're pressing now (as whole numbers, -127 to 127), what they did,
// or that they've left the game
export type FrameEvent = {
    frame: number;
    hero: number;
    move?: [number, number];
    action?: CoopAction;
    leave?: true;
};

const MOVE_STEPS = 127;

// A move vector as the network carries it. Everyone's copy (the host's too)
// uses this rather than what was pressed, so they all move alike.
export function quantizeMove(x: number, y: number): [number, number] {
    const q = (v: number) =>
        Math.max(-MOVE_STEPS, Math.min(MOVE_STEPS, Math.round(v * MOVE_STEPS)));
    return [q(x), q(y)];
}

export function applyFrameEvent(sim: Sim, event: FrameEvent): void {
    const { hero, move, action } = event;
    if (move) {
        sim.setInput(hero, move[0] / MOVE_STEPS, move[1] / MOVE_STEPS);
    }
    if (action) {
        sim.as(hero, () => applyAction(sim, action));
    }
    if (event.leave) {
        sim.leave(hero);
    }
}

// Returns whether it did anything (a reroll with none left doesn't)
export function applyAction(sim: Sim, action: CoopAction): boolean {
    switch (action.kind) {
        case "choose":
            if (!sim.isChoosing()) {
                return false;
            }
            sim.choose(action.index);
            return true;
        case "reroll":
            return sim.reroll();
        case "skip":
            return sim.skip();
        case "chest":
            if (sim.state !== "chest" || !sim.chest) {
                return false;
            }
            sim.resolveChest(action.action);
            return true;
        case "item":
            return sim.useItem(action.index);
        case "event":
            return sim.chooseEventOption(action.index);
        case "leaveEvent":
            if (sim.state !== "event") {
                return false;
            }
            sim.leaveEvent();
            return true;
    }
}

// A number that changes with nearly anything in the run, for the copies to
// check they still agree
export function syncHash(sim: Sim): number {
    const values = [sim.tick, sim.xp, sim.kills, sim.coins, sim.level, sim.enemies.length];
    for (const hero of sim.heroes) {
        values.push(hero.player.x, hero.player.y, hero.player.hp, hero.weapons.length);
    }
    let x = 0;
    let y = 0;
    let hp = 0;
    for (const enemy of sim.enemies) {
        x += enemy.x;
        y += enemy.y;
        hp += enemy.hp;
    }
    values.push(x, y, hp, sim.projectiles.length, sim.pickups.length);
    const words = new Uint32Array(new Float64Array(values).buffer);
    // FNV-1a
    let hash = 0x811c9dc5;
    for (const word of words) {
        hash = Math.imul(hash ^ word, 0x01000193) >>> 0;
    }
    return hash;
}
