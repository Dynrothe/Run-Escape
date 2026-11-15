import { GHORROCK_COLD } from "../../content/ghorrock";
import type { PocketKind } from "../../content/invaders";
import { INVASION, type Invasion } from "../../content/invasions";
import { LASSAR_REALM } from "../../content/lassar";
import { SCAR_LIGHTING } from "../../content/scar";
import { STRANGLEWOOD_ROOTS } from "../../content/stranglewood";
import type {
    ColdRuleDef,
    LightingDef,
    RealmRuleDef,
    RootsRuleDef,
    RunRuleDef,
} from "../../content/types";
import { fm } from "../fmath";

// An Awakened invader's pocket (content/invasions.ts): its Act II map's rule, kept to a circle
// INVASION.size across round where it came, for as long as it lives. Each is the map's own rule with
// a place to keep to: roots creeping in from the circle's edge (RootsRuleDef.ring, as Vardorvis's
// clearing), a puddle into the realm opening in it (RealmRuleDef.area), the cold rising only in it
// (ColdRuleDef.area), and the dark only in it (the sim's darkPocket, LightingDef). What the sim
// does with them is Sim.startPocket and Sim.endPocket.

export type PocketPlace = { x: number; y: number; radius: number };

// Root cells 3 tiles across, as the remixes' (phones), their spreads that much slower so a front
// moves as many tiles a second
const ROOT_CELL = 3;
const CELL_GROW = ROOT_CELL / 2;

// The cold in it rises this many times Ghorrock's (there are no braziers in it), and falls
// outside it as by a brazier
const COLD_RISE = 1.5;

// Ice pools in the cold's circle, and a ring of ice round its edge (drawn, it shows where the
// cold is), a pool every so many tiles of it
const ICE_POOLS = 3;
const ICE_RING_EVERY = 2;

// The rule a pocket brings (none for the dark, which is lighting): seconds is the map's clock as it
// comes, tick the run's
export function pocketRule(
    kind: PocketKind,
    at: PocketPlace,
    seconds: number,
    tps: number,
    tick: number,
): RunRuleDef | undefined {
    switch (kind) {
        case "roots":
            return pocketRoots(at, seconds);
        case "realm":
            return pocketRealm(at, tick / tps);
        case "cold":
            return pocketCold(at);
        case "dark":
            return undefined;
    }
}

// What a run's invasion brings in, for the loading screen to bake: its invader, and the realm's
// enemies for the Whisperer's (mapEnemies goes by the ids in it)
export function invasionContent(invasion: Invasion | undefined): unknown[] {
    if (!invasion) {
        return [];
    }
    const kind = invasion.invader.pocket;
    return [invasion.invader.id, kind === "realm" ? LASSAR_REALM : undefined];
}

export function pocketPlace(x: number, y: number): PocketPlace {
    return { x, y, radius: INVASION.size / 2 };
}

// The Stranglewood's roots, creeping in from the circle's edge from now, quickly: in a minute the
// fronts are all out. No hearts: the boss is the pocket's heart.
function pocketRoots(at: PocketPlace, seconds: number): RootsRuleDef {
    const def = STRANGLEWOOD_ROOTS;
    return {
        ...def,
        cell: ROOT_CELL,
        start: seconds,
        lateBy: seconds + 60,
        fronts: [4, 6],
        every: [def.every[0] * CELL_GROW * 0.6, def.every[1] * CELL_GROW * 0.6],
        safe: undefined,
        ring: { x: at.x, y: at.y, radius: at.radius },
        hearts: { ...def.hearts, from: Number.MAX_SAFE_INTEGER, max: 0 },
    };
}

// Lassar's realm, its puddles opening only in the circle (every 20 s, from 2 s in); the realm's
// own as it is on Lassar, as a palette (the remix's)
function pocketRealm(at: PocketPlace, runSeconds: number): RealmRuleDef {
    const def = LASSAR_REALM;
    return {
        ...def,
        puddles: { ...def.puddles, from: runSeconds + 2, every: 20, open: 15 },
        area: { x: at.x, y: at.y, radius: at.radius - 2 },
        // Every dive has one: the invader's realm is the realm at its worst
        elite: def.elite && { ...def.elite, from: 0 },
        look: { ...def.look, brightness: 0.7 },
    };
}

// Ghorrock's cold, rising only in the circle and falling out of it; a few pools of ice in it, no
// braziers or vents
function pocketCold(at: PocketPlace): ColdRuleDef {
    const def = GHORROCK_COLD;
    const pools = Array.from({ length: ICE_POOLS }, (_, i) => {
        const angle = (i / ICE_POOLS) * Math.PI * 2 + 0.4;
        const off = at.radius * 0.5;
        return {
            x: Math.round(at.x + fm.cos(angle) * off),
            y: Math.round(at.y + fm.sin(angle) * off),
            rx: 2.5,
            ry: 1.5,
        };
    });
    // The ring: single tiles of ice, ICE_RING_EVERY apart (each tile's a model: a phone's view of a
    // solid ring cost too much)
    const around = Math.round((Math.PI * 2 * at.radius) / ICE_RING_EVERY);
    for (let i = 0; i < around; i++) {
        const angle = (i / around) * Math.PI * 2;
        pools.push({
            x: Math.floor(at.x + fm.cos(angle) * (at.radius - 0.5)) + 0.5,
            y: Math.floor(at.y + fm.sin(angle) * (at.radius - 0.5)) + 0.5,
            rx: 0.6,
            ry: 0.6,
        });
    }
    return {
        ...def,
        cold: { ...def.cold, rise: def.cold.rise * COLD_RISE, fast: def.cold.fast * COLD_RISE },
        braziers: { ...def.braziers, at: [] },
        vents: { ...def.vents, at: [] },
        ice: { ...def.ice, pools },
        // Washed blue only in it (GameClient): the map's own colours out of it
        look: { ...def.look, wash: undefined },
        area: { x: at.x, y: at.y, radius: at.radius, thaw: def.braziers.warm },
    };
}

// An invading Duke's pocket is washed with Ghorrock's cold light, seen from in it (GameClient)
export const POCKET_COLD_WASH = GHORROCK_COLD.look.wash;

// A run that'll have a Leviathan's pocket is lit from the start (the lit programs are picked as a
// run starts): as bright as ever out of the pocket, the Scar's dark in it (Sim.darkPocket), the
// player's light the Scar's. Weapons only aim at what's lit in the pocket, once it's come
// (Sim.litTargetsOnly goes on and off with it).
export const POCKET_LIGHTING: LightingDef = {
    ambient: 1,
    player: SCAR_LIGHTING.player,
    lanternWeight: 0,
};
// How dark it is in the pocket, and the seconds it takes to come and go
export const POCKET_DARK = { ambient: SCAR_LIGHTING.ambient ?? 0.3, fade: 2 };
