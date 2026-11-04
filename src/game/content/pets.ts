import { TROPHY_BY_ID } from "./trophies";

// Pets: a trophy that follows its finder around once it's taken along (SaveData.pet). They're
// looks only, drawn by the game (client/PetFollowers.ts) and nothing to do with the run, so a
// pet never changes how a run plays, solo or in co-op.
export type PetDef = {
    // Its trophy's id: finding the trophy is what earns it
    id: string;
    // The follower NPC, and its animations (scripts/cache/find-npcs.ts)
    npcId: number;
    idleSeq: number;
    walkSeq: number;
};

export const PETS: PetDef[] = [
    { id: "little_nightmare", npcId: 9398, idleSeq: 8593, walkSeq: 8634 },
    { id: "lil_zik", npcId: 8336, idleSeq: 8120, walkSeq: 8122 },
    { id: "lil_maiden", npcId: 10761, idleSeq: 14520, walkSeq: 14520 },
    { id: "lil_bloat", npcId: 10762, idleSeq: 8080, walkSeq: 8081 },
    { id: "lil_nylo", npcId: 10763, idleSeq: 8002, walkSeq: 8003 },
    { id: "lil_sot", npcId: 10764, idleSeq: 8137, walkSeq: 8136 },
    { id: "lil_xarp", npcId: 10765, idleSeq: 9033, walkSeq: 9033 },
];

export const PET_BY_ID: Map<string, PetDef> = new Map(PETS.map((p) => [p.id, p]));

// Its name and icon are its trophy's
export function getPetTrophy(pet: PetDef) {
    return TROPHY_BY_ID.get(pet.id)!;
}

// The pets a save has found, in PETS' order
export function getFoundPets(trophies: readonly string[]): PetDef[] {
    return PETS.filter((pet) => trophies.includes(pet.id));
}
