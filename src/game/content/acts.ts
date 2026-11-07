import type { MapDef } from "./types";

// An act after the first campaign (MapDef.act): its maps open together once the map it requires is
// beaten, and are played in any order, each harder the more of the act's other maps have been
// beaten. The Fallen Empire is Act II, Desert Treasure II's four (docs/design/act-2-fallen-empire.md).

// A step of an act's toughness: what its map's enemies' hitpoints and damage are (MapDef.difficulty
// is the first step's), and what more its coins are worth
export type ActStepDef = { hp: number; damage: number; coins: number };

// A place on the act's screen: one of its maps, or one still to come (its name, boss and rule
// shown, locked)
export type ActSlotDef = {
    // The map, once it's in the game
    mapId?: string;
    name: string;
    boss: string;
    // Its rule, in a line
    rule: string;
    // An item for its card, as a map's icon is
    iconObjId: number;
};

export type ActDef = {
    id: string;
    name: string;
    // The map whose win opens the act
    requires: string;
    // Index: how many of the act's other maps were beaten when the run started (the host's in co-op)
    steps: ActStepDef[];
    slots: ActSlotDef[];
};

export const FALLEN_EMPIRE: ActDef = {
    id: "fallen_empire",
    name: "The Fallen Empire",
    requires: "inferno",
    // The Inferno is 3.75 and 2.7: the first step's a small one up from it, and the last map
    // played is always the hardest
    steps: [
        { hp: 3.9, damage: 2.8, coins: 0 },
        { hp: 4.05, damage: 2.9, coins: 0.1 },
        { hp: 4.2, damage: 3.0, coins: 0.2 },
        { hp: 4.35, damage: 3.1, coins: 0.3 },
    ],
    slots: [
        {
            mapId: "stranglewood",
            name: "The Stranglewood",
            boss: "Vardorvis",
            rule: "Roots creep in from the wood. Cut them back.",
            // The Executioner's axe head
            iconObjId: 28319,
        },
        {
            name: "The Lassar Undercity",
            boss: "The Whisperer",
            rule: "Black puddles open into the Shadow Realm.",
            // The Siren's staff
            iconObjId: 28323,
        },
        {
            name: "Ghorrock",
            boss: "Duke Sucellus",
            rule: "The cold rises. Stay by the braziers.",
            // The Eye of the Duke
            iconObjId: 28321,
        },
        {
            name: "The Scar",
            boss: "The Leviathan",
            rule: "Darkness, with a light round you.",
            // The Leviathan's lure
            iconObjId: 28325,
        },
    ],
};

export const ACTS: ActDef[] = [FALLEN_EMPIRE];

export const ACT_BY_ID: Map<string, ActDef> = new Map(ACTS.map((act) => [act.id, act]));

export function getAct(id: string): ActDef {
    const act = ACT_BY_ID.get(id);
    if (!act) {
        throw new Error("Unknown act " + id);
    }
    return act;
}

// The act's maps that are in the game
export function getActMapIds(act: ActDef): string[] {
    return act.slots.flatMap((slot) => (slot.mapId ? [slot.mapId] : []));
}

// A map's toughness at a step of its act; the map's own without one
export function getStepDifficulty(map: MapDef, step: number): { hp: number; damage: number } {
    if (!map.act) {
        return map.difficulty;
    }
    const steps = getAct(map.act.id).steps;
    const at = steps[Math.min(Math.max(Math.floor(step), 0), steps.length - 1)];
    return { hp: at.hp, damage: at.damage };
}

// What more a run's coins are worth at a step (0 off an act's maps)
export function getStepCoins(map: MapDef, step: number): number {
    if (!map.act) {
        return 0;
    }
    const steps = getAct(map.act.id).steps;
    return steps[Math.min(Math.max(Math.floor(step), 0), steps.length - 1)].coins;
}

// The step a run on an act's map starts at: how many of the act's other maps have been beaten
// (wins: map id to times beaten). A map gone back to after the act's done is at the last step,
// as every map is by then.
export function getActStep(
    map: MapDef,
    wins: Record<string, number>,
    act = map.act && getAct(map.act.id),
): number {
    if (!act) {
        return 0;
    }
    const beaten = getActMapIds(act).filter((id) => id !== map.id && (wins[id] ?? 0) > 0).length;
    return Math.min(beaten, act.steps.length - 1);
}
