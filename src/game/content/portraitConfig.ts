import type { NpcHeadRequest, NpcPortrait } from "../../mapviewer/worker/NpcHeadLoader";

// How a monster's portrait is framed (its kill row in the Combat tabs), as saved in
// portraits.json. Only what differs from the game's own fit is kept, so a monster with no
// entry looks as it always has.

export type EnemyPortrait = NpcPortrait & {
    // Another NPC to draw instead of the enemy's own (a form with a better head, say)
    npcId?: number;
};

export type FullPortrait = Required<Omit<NpcPortrait, "model">> & {
    npcId: number;
    model: "head" | "body" | number;
};

const DEFAULTS = {
    model: "head",
    seqId: -1,
    tick: 0,
    yaw: 0,
    pitch: 0,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    mirror: false,
} as const;

const NUMBERS = ["seqId", "tick", "yaw", "pitch", "zoom", "offsetX", "offsetY"] as const;

function round(value: number, places: number): number {
    const scale = 10 ** places;
    return Math.round(value * scale) / scale;
}

// A portrait from JSON, or undefined when it isn't one: unknown keys are dropped
export function cleanPortrait(value: unknown): EnemyPortrait | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const portrait: EnemyPortrait = {};
    if (raw.npcId !== undefined) {
        if (!Number.isInteger(raw.npcId) || (raw.npcId as number) < 0) {
            return undefined;
        }
        portrait.npcId = raw.npcId as number;
    }
    if (raw.model !== undefined) {
        const model = raw.model;
        if (
            model !== "head" &&
            model !== "body" &&
            !(typeof model === "number" && Number.isInteger(model) && model >= 0)
        ) {
            return undefined;
        }
        portrait.model = model as EnemyPortrait["model"];
    }
    if (raw.mirror !== undefined) {
        if (typeof raw.mirror !== "boolean") {
            return undefined;
        }
        portrait.mirror = raw.mirror;
    }
    for (const key of NUMBERS) {
        if (raw[key] === undefined) {
            continue;
        }
        if (typeof raw[key] !== "number" || !Number.isFinite(raw[key])) {
            return undefined;
        }
        portrait[key] = raw[key] as number;
    }
    if (portrait.zoom !== undefined && portrait.zoom <= 0) {
        return undefined;
    }
    return portrait;
}

// Every field, the game's defaults filled in
export function fullPortrait(enemy: { npcId: number }, portrait?: EnemyPortrait): FullPortrait {
    return { ...DEFAULTS, npcId: enemy.npcId, ...portrait };
}

// Only what differs from the defaults, for the file
export function compactPortrait(enemy: { npcId: number }, full: FullPortrait): EnemyPortrait {
    const portrait: EnemyPortrait = {};
    if (full.npcId !== enemy.npcId) {
        portrait.npcId = full.npcId;
    }
    if (full.model !== DEFAULTS.model) {
        portrait.model = full.model;
        // A chathead isn't posed
        if (full.seqId >= 0) {
            portrait.seqId = full.seqId;
            if (full.tick !== 0) {
                portrait.tick = Math.round(full.tick);
            }
        }
    }
    if (full.mirror) portrait.mirror = true;
    if (round(full.yaw, 0) !== 0) portrait.yaw = round(full.yaw, 0);
    if (round(full.pitch, 0) !== 0) portrait.pitch = round(full.pitch, 0);
    if (round(full.zoom, 3) !== 1) portrait.zoom = round(full.zoom, 3);
    if (round(full.offsetX, 2) !== 0) portrait.offsetX = round(full.offsetX, 2);
    if (round(full.offsetY, 2) !== 0) portrait.offsetY = round(full.offsetY, 2);
    return portrait;
}

// What the head loader is asked to draw for an enemy
export function portraitRequest(
    enemy: { npcId: number },
    portrait?: EnemyPortrait,
): NpcHeadRequest {
    if (!portrait) {
        return { npcId: enemy.npcId };
    }
    const { npcId = enemy.npcId, ...pose } = portrait;
    return Object.keys(pose).length > 0 ? { npcId, portrait: pose } : { npcId };
}
