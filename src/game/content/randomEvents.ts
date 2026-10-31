import { CASKET_GEAR, UTILITY } from "./items";
import { SOUNDS } from "./sounds";
import { ItemDef, RandomEventDef } from "./types";

// OSRS's random events, turning up now and then during a run. Most are someone
// standing a few tiles away for a while: walk up to them to see what they want.
//
// Ids are from the cache: scripts/cache/find-npcs.ts.

// Run seconds the first one can turn up at, and seconds from when one's over
// until the next
export const RANDOM_EVENT_FIRST: [min: number, max: number] = [90, 150];
export const RANDOM_EVENT_EVERY: [min: number, max: number] = [120, 200];
// Seconds someone waits to be walked up to; they blink for the last few
export const VISITOR_LIFETIME = 30;
export const VISITOR_BLINK = 5;
// Tiles from the player they turn up at, and how close counts as walking up
export const VISITOR_DISTANCE: [min: number, max: number] = [7, 11];
export const VISITOR_REACH = 1.3;
// Seconds between what they say while they wait
export const VISITOR_SHOUT_EVERY = 5;
// Their loot beams and minimap dots
export const VISITOR_COLOR = "#ffb43c";
// A puff as they come and go, and teleport_vwoop as they come
export const VISITOR_SPOTANIM = 86;
export const VISITOR_SOUND = 200;

// What the Mysterious Old Man charges goes up by this for each minute of the
// run, as coins come in faster later on
export const OLD_MAN_PRICE_PER_MINUTE = 0.1;
export const OLD_MAN_OFFERS = 3;

export const RANDOM_EVENTS: RandomEventDef[] = [
    {
        id: "mysterious_old_man",
        name: "Mysterious Old Man",
        npcId: 6750,
        idleSeq: 808,
        weight: 3,
        arrive: "A mysterious old man appears nearby.",
        shouts: ["Psst! Over here!", "I've got just the thing...", "Coins for your troubles?"],
        leave: "The old man shrugs and wanders off.",
        speech: "I've got a few things that fell off the back of a cart. Interested?",
        effect: { kind: "shop", leaveLabel: "Not today" },
    },
    {
        id: "quiz_master",
        name: "Quiz Master",
        npcId: 379,
        idleSeq: 808,
        weight: 2,
        arrive: "The Quiz Master appears nearby.",
        shouts: ["Time for a quiz!", "Come on down!", "Who wants to win a prize?"],
        leave: "The Quiz Master goes looking for a brighter contestant.",
        speech: "Three of these go together. Which is the odd one out?",
        effect: {
            kind: "quiz",
            options: 4,
            right: "Correct! Here's your prize!",
            wrong: "Oh, bad luck! Better luck next time.",
            leaveLabel: "No thanks",
        },
    },
    {
        id: "genie",
        name: "Genie",
        npcId: 326,
        idleSeq: 792,
        weight: 2,
        arrive: "A genie appears nearby.",
        shouts: ["Greetings, master!", "Your wish, master?", "A gift for you, master!"],
        leave: "The genie grows tired of waiting and vanishes.",
        effect: {
            kind: "xp",
            levels: 0.75,
            message: "The genie grants you some experience!",
            sound: SOUNDS.lamp,
        },
    },
    {
        id: "sandwich_lady",
        name: "Sandwich lady",
        npcId: 5510,
        idleSeq: 3043,
        weight: 2,
        arrive: "The sandwich lady appears nearby.",
        shouts: ["Sandwiches!", "You look hungry!", "Hello? I made you a baguette!"],
        leave: "How rude! The sandwich lady throws a baguette at you.",
        effect: {
            kind: "heal",
            fraction: 0.4,
            // The classic: she doesn't take it well if she's ignored
            ignoredHit: 0.15,
            message: "The sandwich lady hands you a baguette. Delicious!",
            sound: SOUNDS.food,
        },
    },
    {
        id: "rick_turpentine",
        name: "Rick Turpentine",
        npcId: 375,
        idleSeq: 4591,
        weight: 2,
        arrive: "Rick Turpentine appears nearby.",
        shouts: ["Good day, squire!", "A gift, from one rogue to another!", "Over here, friend!"],
        leave: "Rick Turpentine tips his hat and rides off.",
        effect: {
            kind: "casket",
            message: "Rick Turpentine drops a casket at your feet!",
            sound: SOUNDS.casketDrop,
        },
    },
    {
        id: "strange_plant",
        name: "Strange plant",
        npcId: 323,
        idleSeq: 349,
        weight: 2,
        arrive: "A strange plant grows up nearby.",
        shouts: ["*rustle*", "*a fruit swells*"],
        leave: "The strange plant withers away.",
        effect: {
            kind: "buff",
            name: "Strange fruit",
            objId: 464,
            stats: { moveSpeed: 0.3 },
            seconds: 20,
            // Eating one cures poison in OSRS too
            cures: true,
            message: "You eat a strange fruit: +30% movement speed, and poison can't touch you.",
            sound: SOUNDS.food,
        },
    },
    {
        id: "highwayman",
        name: "Highwayman",
        weight: 2,
        // Not when there's next to nothing to steal
        minSeconds: 240,
        effect: { kind: "ambush", enemyId: "highwayman" },
    },
];

export const RANDOM_EVENT_BY_ID: Map<string, RandomEventDef> = new Map(
    RANDOM_EVENTS.map((event) => [event.id, event]),
);

export function getRandomEvent(id: string): RandomEventDef {
    const event = RANDOM_EVENT_BY_ID.get(id);
    if (!event) {
        throw new Error("Unknown random event " + id);
    }
    return event;
}

// What the Quiz Master's questions are made from: things that plainly go
// together. Nothing that's unlocked by a task, which would give it away early.
export function getQuizGroups(): ItemDef[][] {
    const groups = new Map<string, ItemDef[]>();
    const add = (key: string, item: ItemDef) => {
        groups.set(key, [...(groups.get(key) ?? []), item]);
    };
    for (const gear of CASKET_GEAR) {
        if (!gear.unlock) {
            add(gear.slot, gear);
        }
    }
    for (const item of UTILITY) {
        if (!item.unlock && item.use.kind === "heal") {
            add("food", item);
        }
    }
    return [...groups.values()].filter((group) => group.length >= 3);
}
