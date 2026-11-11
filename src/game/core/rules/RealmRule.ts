import type { RealmRuleDef } from "../../content/types";
import { Rng } from "../Rng";
import { fm } from "../fmath";
import type { ArenaGrid } from "../world/ArenaGrid";
import type { RuleHost, RunRule } from "./RunRule";

// The city and its Shadow Realm (RealmRuleDef, the Lassar Undercity's): black puddles open near the
// party in the city, and walking into one pulls the whole party into the realm a moment later.
// There each player's sanity drains, and catching the realm's lost souls opens a portal back. At no
// sanity a player's thrown back, hurt. The world the party isn't in waits, as it was: the sim keeps
// its enemies and drops aside (Sim.turnWorld), so this only says when the world turns, and keeps
// what's the rule's own (the puddle, the souls, the portal, each player's sanity). Everything's on
// its own Rng, so a run plays the same from the same seed on every co-op player's copy.

// The city, and the realm
export type RealmLayer = 0 | 1;

// A dark pool on the ground, or the portal home: where it is, and the ticks it's open between
export type RealmHole = { x: number; y: number; openTick: number; closeTick: number };

// Tries at a spot before giving up for a tick
const SPOT_TRIES = 12;
// Seconds a portal takes to open before it can be stepped through: one at your feet doesn't take
// you the moment the last soul's caught, so there's a moment to choose to stay
const PORTAL_STEP = 1;

export class RealmRule implements RunRule {
    // Which world the party's in
    layer: RealmLayer = 0;
    // The tick it last turned (-1 never), for the view's ripple
    turnedTick = -1;
    puddle?: RealmHole;
    portal?: RealmHole;
    // The tick the party's pulled in, once someone's walked into the puddle (-1 when not)
    pullTick = -1;
    // Each hero's sanity, by their index (max when unset)
    private readonly sanity: number[] = [];
    // The souls loose in the realm, and how many of this lot have been caught
    private souls: number[] = [];
    caught = 0;
    // Caskets opened in the realm this run, for the Treasure hunter's task
    realmCaskets = 0;
    private nextPuddleTick: number;
    private nextRiserTick = 0;
    private risers: number[] = [];
    private readonly rng: Rng;

    constructor(
        readonly def: RealmRuleDef,
        readonly grid: ArenaGrid,
        seed: number,
        private readonly tps: number,
    ) {
        this.rng = new Rng((seed ^ 0x5ad0f00) >>> 0);
        this.nextPuddleTick = Math.round(def.puddles.from * tps);
    }

    get soulsLeft(): number {
        return this.def.souls.count - this.caught;
    }

    sanityOf(hero: number): number {
        return this.sanity[hero] ?? this.def.sanity.max;
    }

    // What a drop's worth here (RealmRuleDef.drops): as it is in the city
    get drops(): RealmRuleDef["drops"] | undefined {
        return this.layer === 1 ? this.def.drops : undefined;
    }

    step(host: RuleHost): void {
        const tick = host.tick;
        const tuning = this.def.sanity;
        const heroes = host.upHeroes();
        // Sanity: back up in the city, down in the realm
        for (let i = 0; i < heroes.length; i += 3) {
            const index = heroes[i];
            const change = this.layer === 1 ? -tuning.drain : tuning.refill;
            this.sanity[index] = Math.min(
                tuning.max,
                Math.max(0, this.sanityOf(index) + change / this.tps),
            );
        }
        if (this.layer === 0) {
            this.stepCity(host, heroes, tick);
        } else {
            this.stepRealm(host, heroes, tick);
            // Out of sanity: thrown back, the first who is
            for (let i = 0; i < heroes.length && this.layer === 1; i += 3) {
                if (this.sanityOf(heroes[i]) <= 0) {
                    this.turn(host, 0, heroes[i]);
                }
            }
        }
        if (this.puddle && tick >= this.puddle.closeTick && this.pullTick < 0) {
            this.puddle = undefined;
        }
    }

    private stepCity(host: RuleHost, heroes: number[], tick: number): void {
        const puddles = this.def.puddles;
        if (this.pullTick >= 0) {
            if (tick >= this.pullTick) {
                this.turn(host, 1);
            }
            return;
        }
        const puddle = this.puddle;
        if (puddle) {
            if (tick >= puddle.openTick && this.anyWithin(heroes, puddle, puddles.radius)) {
                this.pullTick = tick + Math.round(puddles.pull * this.tps);
            }
            return;
        }
        // None once the final boss is up: the last fight's where it is
        if (tick < this.nextPuddleTick || heroes.length === 0 || host.finalBossUp) {
            return;
        }
        // In its circle (an invader's pocket), or near one of the party
        const area = this.def.area;
        const pick = this.rng.int(heroes.length / 3) * 3;
        const spot = area
            ? this.findSpot(area.x, area.y, [0, area.radius])
            : this.findSpot(heroes[pick + 1], heroes[pick + 2], puddles.distance);
        if (!spot) {
            return;
        }
        this.puddle = {
            ...spot,
            openTick: tick,
            closeTick: tick + Math.round(puddles.open * this.tps),
        };
        this.nextPuddleTick = tick + Math.round(puddles.every * this.tps);
    }

    private stepRealm(host: RuleHost, heroes: number[], tick: number): void {
        const portal = this.portal;
        if (portal) {
            // Stepped through: stood in it a moment once it's open
            const open = tick >= portal.openTick + Math.round(PORTAL_STEP * this.tps);
            if (open && this.anyWithin(heroes, portal, this.def.portal.radius)) {
                this.turn(host, 0);
                return;
            }
            if (tick >= portal.closeTick) {
                // Missed: the souls come again
                this.portal = undefined;
                this.releaseSouls(host, heroes);
            }
        } else if (this.souls.length === 0 && this.caught === 0) {
            this.releaseSouls(host, heroes);
        }
        const risers = this.def.risers;
        if (risers && tick >= this.nextRiserTick && heroes.length > 0) {
            this.nextRiserTick = tick + Math.round(risers.every * this.tps);
            this.risers = this.risers.filter((uid) => host.isEnemyAlive(uid));
            if (this.risers.length < risers.max) {
                const pick = this.rng.int(heroes.length / 3) * 3;
                const spot = this.findSpot(heroes[pick + 1], heroes[pick + 2], risers.distance);
                const uid = spot && host.spawnRuleEnemy(risers.enemyId, spot.x, spot.y);
                if (typeof uid === "number") {
                    this.risers.push(uid);
                }
            }
        }
    }

    // The party turns to the other world (the sim's swap, then what's the rule's). lapse: the hero
    // whose sanity ran out, thrown back
    turn(host: RuleHost, to: RealmLayer, lapse?: number): void {
        if (to === this.layer) {
            return;
        }
        this.layer = to;
        this.turnedTick = host.tick;
        this.pullTick = -1;
        this.puddle = undefined;
        this.portal = undefined;
        this.souls = [];
        this.caught = 0;
        host.turnWorld(to, lapse);
        if (to === 1) {
            for (let i = 0; i < this.sanity.length; i++) {
                this.sanity[i] = this.def.sanity.max;
            }
            this.nextRiserTick = host.tick + Math.round((this.def.risers?.every ?? 0) * this.tps);
            const heroes = host.upHeroes();
            this.releaseSouls(host, heroes);
            // Later on, one of the realm's elites comes with each dive
            const elite = this.def.elite;
            if (elite && host.mapSeconds >= elite.from && heroes.length > 0) {
                const pick = this.rng.int(heroes.length / 3) * 3;
                const spot = this.findSpot(heroes[pick + 1], heroes[pick + 2], elite.distance);
                if (spot) {
                    host.spawnRuleEnemy(elite.enemyId, spot.x, spot.y, true);
                }
            }
        } else {
            this.risers = [];
            // The next puddle's a while off, from coming back
            this.nextPuddleTick = Math.max(
                this.nextPuddleTick,
                host.tick + Math.round(this.def.puddles.every * this.tps),
            );
        }
    }

    // A soul's been caught (EnemyDef.caught) by the hero at x, y: the last opens the portal there
    onCaught(host: RuleHost, uid: number, x: number, y: number): void {
        const at = this.souls.indexOf(uid);
        if (at >= 0) {
            this.souls.splice(at, 1);
        }
        this.caught++;
        // None of its own (a fight's realm, left by its button): no portal
        if (
            this.def.souls.count > 0 &&
            this.caught >= this.def.souls.count &&
            !this.portal &&
            this.layer === 1
        ) {
            this.portal = {
                x,
                y,
                openTick: host.tick,
                closeTick: host.tick + Math.round(this.def.portal.seconds * this.tps),
            };
        }
    }

    // A hero was hit in the realm
    onHurt(hero: number): void {
        if (this.layer === 1) {
            this.sanity[hero] = Math.max(0, this.sanityOf(hero) - this.def.sanity.hit);
        }
    }

    private releaseSouls(host: RuleHost, heroes: number[]): void {
        this.caught = 0;
        this.souls = [];
        if (heroes.length === 0) {
            return;
        }
        const { souls } = this.def;
        for (let i = 0; i < souls.count; i++) {
            const pick = this.rng.int(heroes.length / 3) * 3;
            const spot = this.findSpot(heroes[pick + 1], heroes[pick + 2], souls.distance);
            const uid = spot && host.spawnRuleEnemy(souls.enemyId, spot.x, spot.y);
            if (typeof uid === "number") {
                this.souls.push(uid);
            }
        }
    }

    private anyWithin(heroes: number[], hole: RealmHole, radius: number): boolean {
        for (let i = 0; i < heroes.length; i += 3) {
            if (fm.hypot(heroes[i + 1] - hole.x, heroes[i + 2] - hole.y) <= radius) {
                return true;
            }
        }
        return false;
    }

    // An open spot min to max tiles from x, y, on the rule's Rng
    private findSpot(
        x: number,
        y: number,
        [min, max]: [number, number],
    ): { x: number; y: number } | undefined {
        for (let i = 0; i < SPOT_TRIES; i++) {
            const angle = this.rng.next() * Math.PI * 2;
            const distance = this.rng.range(min, max);
            const sx = Math.floor(x + fm.cos(angle) * distance);
            const sy = Math.floor(y + fm.sin(angle) * distance);
            if (
                !this.grid.isSolid(sx, sy) &&
                !this.grid.isSolid(sx + 1, sy) &&
                !this.grid.isSolid(sx, sy + 1) &&
                !this.grid.isSolid(sx - 1, sy) &&
                !this.grid.isSolid(sx, sy - 1)
            ) {
                return { x: sx + 0.5, y: sy + 0.5 };
            }
        }
        return undefined;
    }

    // Nothing of roots here
    playerPace(): number {
        return 1;
    }
    enemyPace(): number {
        return 1;
    }
    hurtsAt(): boolean {
        return false;
    }
    onHit(): void {}
    onSwing(): void {}
    onKill(): void {}
    plant(): void {}
    plantHeart(): void {}
    pickSpots(): { x: number; y: number }[] {
        return [];
    }

    hash(): number {
        let hash = this.layer * 31 + this.caught + (this.puddle ? 7 : 0) + (this.portal ? 13 : 0);
        hash = (Math.imul(hash, 16777619) ^ this.souls.length) >>> 0;
        for (const sanity of this.sanity) {
            hash = (Math.imul(hash, 16777619) ^ Math.round(sanity * 100)) >>> 0;
        }
        return (Math.imul(hash, 16777619) ^ this.pullTick) >>> 0;
    }
}
