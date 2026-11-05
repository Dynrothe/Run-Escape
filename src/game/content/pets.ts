import { TROPHY_BY_ID } from "./trophies";

// Pets: a trophy that follows its finder around once it's taken along (SaveData.pet). They're
// looks only, drawn by the game (client/PetFollowers.ts) and nothing to do with the run, so a
// pet never changes how a run plays, solo or in co-op.
export type PetDef = {
    // Its trophy's id: finding the trophy is what earns it
    id: string;
    // The follower NPC, and its animations (scripts/cache/find-npcs.ts). A pet has two NPCs in
    // the cache: the follower is the one marked "follower", with the Metamorphosis option.
    npcId: number;
    idleSeq: number;
    walkSeq: number;
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
