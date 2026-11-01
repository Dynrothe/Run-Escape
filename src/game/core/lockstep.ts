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
// or that they've left the game. auto: the host did it for them, as they'd
// kept everyone waiting.
export type FrameEvent = {
    frame: number;
    hero: number;
    move?: [number, number];
    action?: CoopAction;
    auto?: true;
    leave?: true;
};

const CHEST_ACTIONS: readonly ChestAction[] = ["take", "use", "alch"];
// More than any list of choices, options or inventory slots
const MAX_INDEX = 64;

// An action as a guest sent it, made into a clean one, or undefined for
// anything that isn't one (it's applied on every copy, so nothing odd gets in)
export function cleanAction(value: unknown): CoopAction | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const { kind, index, action } = value as Record<string, unknown>;
    const isIndex = typeof index === "number" && Number.isInteger(index) && index >= 0;
    switch (kind) {
        case "choose":
        case "item":
        case "event":
            return isIndex && index < MAX_INDEX ? { kind, index } : undefined;
        case "reroll":
        case "skip":
        case "leaveEvent":
            return { kind };
        case "chest":
            return CHEST_ACTIONS.includes(action as ChestAction)
                ? { kind, action: action as ChestAction }
                : undefined;
        default:
            return undefined;
    }
}

// A move as a guest sent it, or undefined for one that isn't two numbers
export function cleanMove(value: unknown): [number, number] | undefined {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
        return undefined;
    }
    return quantizeMove(value[0] / MOVE_STEPS, value[1] / MOVE_STEPS);
}

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
            if (!sim.isChoosing() || !sim.choices[action.index]) {
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
    const values = [
        sim.tick,
        sim.xp,
        sim.kills,
        sim.coins,
        sim.level,
        sim.enemies.length,
        sim.rng.position,
        sim.eventRng.position,
    ];
    for (const hero of sim.heroes) {
        values.push(
            hero.player.x,
            hero.player.y,
            hero.player.hp,
            hero.weapons.length,
            hero.buffs.length,
            hero.debuffs.length,
            hero.inventory.filter((slot) => slot).length,
            hero.chests.length,
            hero.pendingLevelUps,
        );
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
