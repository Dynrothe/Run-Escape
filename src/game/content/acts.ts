import { tr } from "../i18n";
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
    // Its Awakened fight (a fight map's id), once it's in the game: the act ends when all of them
    // are beaten
    fightId?: string;
};

// The act's ending (act-2-fallen-empire.md 8.6): its story, told a line at a time when the last
// of its Awakened fights falls, whichever is last, and again from its card
export type ActEndingDef = { title: string; lines: string[] };

export type ActDef = {
    id: string;
    name: string;
    // The map whose win opens the act
    requires: string;
    // Index: how many of the act's other maps were beaten when the run started (the host's in co-op)
    steps: ActStepDef[];
    slots: ActSlotDef[];
    ending?: ActEndingDef;
    // Out for players. Until it is, its maps stay locked and out of sight, and so do the
    // adventurers and finds they bring in (isActOut)
    released: boolean;
};

export const FALLEN_EMPIRE: ActDef = {
    id: "fallen_empire",
    name: "The Fallen Empire",
    requires: "inferno",
    released: true,
    // The Inferno is 3.75 and 2.7: the first step's harder than it (the bot wins fewer runs and
    // dies sooner, Kasonde at 5:00 its first wall), and the last map played is always the hardest
    steps: [
        { hp: 4.2, damage: 2.9, coins: 0 },
        { hp: 4.35, damage: 3.0, coins: 0.1 },
        { hp: 4.5, damage: 3.1, coins: 0.2 },
        { hp: 4.65, damage: 3.2, coins: 0.3 },
    ],
    slots: [
        {
            mapId: "stranglewood",
            fightId: "awakened_vardorvis",
            name: "The Stranglewood",
            boss: "Vardorvis",
            rule: "Roots creep in from the wood. Cut them back.",
            // The Executioner's axe head
            iconObjId: 28319,
        },
        {
            mapId: "lassar_undercity",
            fightId: "awakened_whisperer",
            name: "The Lassar Undercity",
            boss: "The Whisperer",
            rule: "Black puddles open into the Shadow Realm.",
            // The Siren's staff
            iconObjId: 28323,
        },
        {
            mapId: "ghorrock",
            fightId: "awakened_duke",
            name: "Ghorrock",
            boss: "Duke Sucellus",
            rule: "The cold rises. Stay by the braziers.",
            // The Eye of the Duke
            iconObjId: 28321,
        },
        {
            mapId: "scar",
            fightId: "awakened_leviathan",
            name: "The Scar",
            boss: "The Leviathan",
            rule: "Darkness, with a light round you.",
            // The Leviathan's lure
            iconObjId: 28325,
        },
    ],
    ending: {
        title: "The Forgotten Four",
        lines: [
            "Before the Empire fell, it set four to keep what it couldn't take with it: a general " +
                "in the wood, a voice under the sea, a prisoner in the ice and a sleeper in the dark.",
            "The Empire fell. The four forgot what they were keeping, and kept it anyway, awake " +
                "and angry, for longer than anyone remembers.",
            "Now the Stranglewood is still. Lassar sleeps. Ghorrock's cold has broken, and the " +
                "Scar's pool is dark.",
            "What they kept was never treasure. It was each other: four locks on one door, and " +
                "you've broken all four.",
            "Behind it, they wait to be fought again, together, one after another. They won't be " +
                "forgotten twice.",
        ],
    },
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

// The dev server with ?devtools on the address (GameClient.devTools): an act that isn't out yet
// is there all the same, to play and test
const SHOW_UNRELEASED =
    import.meta.env?.DEV === true &&
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("devtools");

// Whether an act is out for players (ActDef.released), or shown anyway on the dev server
export function isActOut(act: ActDef): boolean {
    return act.released || SHOW_UNRELEASED;
}

// Whether a map is out for players: not one of an act that isn't (isActOut)
export function isMapOut(map: MapDef): boolean {
    return !map.act || isActOut(getAct(map.act.id));
}

// The act's maps that are in the game
export function getActMapIds(act: ActDef): string[] {
    return act.slots.flatMap((slot) => (slot.mapId ? [slot.mapId] : []));
}

// The act's Awakened fights in the game (ActSlotDef.fightId)
export function getActFightIds(act: ActDef): string[] {
    return act.slots.flatMap((slot) => (slot.fightId ? [slot.fightId] : []));
}

// Whether the act's done: every one of its Awakened fights beaten (wins: map id to times beaten),
// all four of them in. What its ending's told on, and what opens what comes after it (the
// gauntlet, build order step 15).
export function isActEnded(act: ActDef, wins: Record<string, number>): boolean {
    const fights = getActFightIds(act);
    return fights.length === act.slots.length && fights.every((id) => (wins[id] ?? 0) > 0);
}

// How many of the act's Awakened fights are beaten
export function getActFightsBeaten(act: ActDef, wins: Record<string, number>): number {
    return getActFightIds(act).filter((id) => (wins[id] ?? 0) > 0).length;
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

// Names in the player's language (locales/<lang>/world.json, act.*): a slot's keys go by its name
export function actSlotKey(act: ActDef, slot: ActSlotDef): string {
    return `act.${act.id}.slot.${slot.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export function actName(act: ActDef): string {
    return tr(`act.${act.id}.name`, act.name);
}

export function actSlotName(act: ActDef, slot: ActSlotDef): string {
    return tr(actSlotKey(act, slot) + ".name", slot.name);
}

export function actSlotBoss(act: ActDef, slot: ActSlotDef): string {
    return tr(actSlotKey(act, slot) + ".boss", slot.boss);
}

// Its ending's title and lines, in the player's language (world.json, act.<id>.ending.*)
export function actEndingTitle(act: ActDef): string {
    return tr(`act.${act.id}.ending.title`, act.ending?.title ?? "");
}

export function actEndingLines(act: ActDef): string[] {
    return (act.ending?.lines ?? []).map((line, i) => tr(`act.${act.id}.ending.line${i}`, line));
}
