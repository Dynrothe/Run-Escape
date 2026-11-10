import type { RunRuleDef } from "../../content/types";
import type { ArenaGrid } from "../world/ArenaGrid";
import { ColdRule } from "./ColdRule";
import { RealmRule } from "./RealmRule";
import { RootRule } from "./RootRule";

// A map's rule (MapDef.rule, RunRuleDef): something that changes how the map's played, run by the
// sim every tick. Each is map-agnostic: it reads the grid it's given and its def, never a map's own
// data, so any rule can go on any map. It keeps its own seeded Rng, so a map without one plays
// exactly as it did, and one with one plays the same from the same seed, on every co-op player's
// copy. What it leaves on the ground is the party's; what it does to a player is worked out per
// hero by the sim, from what the rule says is where they stand.

// What a rule can ask of the run it's in
export interface RuleHost {
    readonly tick: number;
    // Seconds of the map's clock (the waves' time), what a rule ramps by
    readonly mapSeconds: number;
    // Where the heroes who are up are, x then y
    heroPositions(): number[];
    // An enemy of the rule's own brought in at a spot (a root heart; elite, as an elite, casket and
    // all): its uid, or undefined when it can't be
    spawnRuleEnemy(enemyId: string, x: number, y: number, elite?: boolean): number | undefined;
    isEnemyAlive(uid: number): boolean;
    // The heroes who are up: index, x, y, and the next's
    upHeroes(): number[];
    // The final boss is up
    readonly finalBossUp: boolean;
    // The party turns to the other world (RealmRule): what the sim keeps of each, swapped. lapse:
    // the hero thrown back, out of sanity
    turnWorld(to: 0 | 1, lapse?: number): void;
}

export interface RunRule {
    readonly def: RunRuleDef;
    step(host: RuleHost): void;
    // How fast someone goes standing at x, y: a player, or an enemy (1 when the rule does nothing)
    playerPace(x: number, y: number): number;
    enemyPace(x: number, y: number): number;
    // Whether standing here wears a player down (RootsRuleDef.hurt)
    hurtsAt(x: number, y: number): boolean;
    // A player's hit landed on an enemy standing at x, y
    onHit(x: number, y: number): void;
    // A player's melee swing: an arc of reach tiles either side of dir by arc radians, or (width > 0)
    // a strip that wide
    onSwing(
        x: number,
        y: number,
        dirX: number,
        dirY: number,
        reach: number,
        arc: number,
        width: number,
    ): void;
    // A kill at x, y (heart: whether it was one of the rule's own)
    onKill(uid: number, x: number, y: number): void;
    // Something lays the rule's stuff round x, y (a bear's trail, a charge's lane; under the cold,
    // braziers snuffed)
    plant(x: number, y: number, radius: number): void;
    // A root heart (or the like) at x, y, at once
    plantHeart(host: RuleHost, x: number, y: number): void;
    // Up to count spots of what the rule's laid within reach of x, y, for a boss to use (roots
    // erupting), picked by the rule's own Rng
    pickSpots(x: number, y: number, reach: number, count: number): { x: number; y: number }[];
    // For co-op's check that copies agree, and the seeded runs' pins
    hash(): number;
}

export function createRunRule(
    def: RunRuleDef,
    grid: ArenaGrid,
    seed: number,
    ticksPerSecond: number,
): RunRule {
    switch (def.kind) {
        case "roots":
            return new RootRule(def, grid, seed, ticksPerSecond);
        case "realm":
            return new RealmRule(def, grid, seed, ticksPerSecond);
        case "cold":
            return new ColdRule(def, grid, ticksPerSecond);
    }
}
