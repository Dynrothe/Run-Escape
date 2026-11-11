import { TROPHY_BY_ID } from "./trophies";

// Pets: a trophy that follows its finder around once it's taken along (SaveData.pet), drawn by
// the game (client/PetFollowers.ts). Most are looks only. Act II's Awakened fights' pets fight
// (PetDef.power): the sim plays that for the hero who took it, on its own ticks, in co-op too,
// and never in a boss fight. A run with a looks-only pet, or none, plays exactly as without.
export type PetDef = {
    // Its trophy's id: finding the trophy is what earns it
    id: string;
    // The follower NPC, and its animations (scripts/cache/find-npcs.ts). A pet has two NPCs in
    // the cache: the follower is the one marked "follower", with the Metamorphosis option.
    npcId: number;
    idleSeq: number;
    walkSeq: number;
    // What it does in a run (act-2-fallen-empire.md, 8.4). leap: every `every` seconds, when an
    // enemy's within reach tiles of its hero, it leaps on the nearest and hits everything within
    // cleave tiles of where it lands for damage, scaled as power-ups' damage is. call: every
    // `every` seconds it calls the bones and coins within reach tiles to its hero (as a magnet
    // does), and every soul seconds, once its hero's hurt, sends them a soul that heals heal of
    // their hitpoints as it reaches them, travel seconds later
    power?: PetPowerDef;
};

export type PetPowerDef =
    | { kind: "leap"; every: number; reach: number; cleave: number; damage: number }
    | { kind: "call"; every: number; reach: number; soul: number; heal: number; travel: number }
    // gas: asleep till crowd enemies are within reach tiles of its hero, then it spits a cloud
    // size tiles across round them for seconds: what's in it is slow slower and poisoned, poison
    // a second (scaled as power-ups' damage is) for poisonSeconds; then asleep every seconds
    | {
          kind: "gas";
          every: number;
          crowd: number;
          reach: number;
          size: number;
          seconds: number;
          slow: number;
          poison: number;
          poisonSeconds: number;
      };

export const PETS: PetDef[] = [
    { id: "little_nightmare", npcId: 9399, idleSeq: 8593, walkSeq: 8634 },
    { id: "lil_zik", npcId: 8337, idleSeq: 13135, walkSeq: 8122 },
    { id: "lil_maiden", npcId: 10870, idleSeq: 14520, walkSeq: 14520 },
    { id: "lil_bloat", npcId: 10871, idleSeq: 8080, walkSeq: 9031 },
    { id: "lil_nylo", npcId: 10872, idleSeq: 8002, walkSeq: 8003 },
    { id: "lil_sot", npcId: 10873, idleSeq: 8137, walkSeq: 9032 },
    { id: "lil_xarp", npcId: 10874, idleSeq: 9033, walkSeq: 9033 },
    { id: "dark_squirrel", npcId: 9637, idleSeq: 7309, walkSeq: 7310 },
    { id: "tumekens_guardian", npcId: 11812, idleSeq: 9655, walkSeq: 9651 },
    // Awakened Vardorvis's: his own model, small, and he leaps in with an axe
    {
        id: "butch",
        npcId: 12158,
        idleSeq: 10337,
        walkSeq: 10339,
        power: { kind: "leap", every: 6, reach: 5, cleave: 1.5, damage: 20 },
    },
    // The Awakened Whisperer's: her own model, small. It calls your drops to you, and now and then
    // a lost soul that heals
    {
        id: "wisp",
        npcId: 12157,
        idleSeq: 10230,
        walkSeq: 10233,
        power: { kind: "call", every: 10, reach: 8, soul: 60, heal: 0.05, travel: 1 },
    },
    // The Awakened Duke's: his own model, small. He naps till a crowd's round you, then spits
    // his gas at them
    {
        id: "baron",
        npcId: 12159,
        idleSeq: 10217,
        walkSeq: 10218,
        power: {
            kind: "gas",
            every: 15,
            crowd: 6,
            reach: 3,
            size: 3,
            seconds: 4,
            slow: 0.45,
            poison: 3,
            poisonSeconds: 4,
        },
    },
];

export const PET_BY_ID: Map<string, PetDef> = new Map(PETS.map((p) => [p.id, p]));

// Its name and icon are its trophy's
export function getPetTrophy(pet: PetDef) {
    return TROPHY_BY_ID.get(pet.id)!;
}

// Whether this is a pet, and its trophy's been found: what it takes to be taken along
export function isPetFound(trophies: readonly string[], id: string): boolean {
    return PET_BY_ID.has(id) && trophies.includes(id);
}

// The pets a save has found, in PETS' order
export function getFoundPets(trophies: readonly string[]): PetDef[] {
    return PETS.filter((pet) => isPetFound(trophies, pet.id));
}

// The key a pet's model is baked under
export function getPetModelKey(id: string): string {
    return "pet:" + id;
}
