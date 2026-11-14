import type { ColdRuleDef } from "../../content/types";
import { fm } from "../fmath";
import type { ArenaGrid } from "../world/ArenaGrid";
import { EffectMask, MASK_ICE } from "../world/EffectMask";
import type { RuleHost, RunRule } from "./RunRule";

// The cold (ColdRuleDef, Ghorrock's): each player's cold rises all the time, and braziers, fire
// elites' embers and fire weapons keep it down. This keeps what's the party's (the braziers, the
// embers, the vents' clocks, the ice) and each player's cold; what the cold does to a player (how
// fast it rises for their adventurer, the slow, the freeze, the gas's hurt) is the sim's, per hero.
// Nothing here rolls dice: the vents are on clocks and the braziers burn down, so a run plays the
// same on every co-op player's copy.

export type Brazier = {
    // South-west tile, and its middle
    x: number;
    y: number;
    midX: number;
    midY: number;
    // The tick it goes out (-1 out), and ticks someone's stood by it while it's out or guttering
    litUntil: number;
    tending: number;
    // The tick it was last lit (-1 never), for the view's flare
    litAt: number;
};

export type Embers = { x: number; y: number; until: number; from: number };

export type Vent = {
    // Its middle
    x: number;
    y: number;
    // Ticks into the cycle it's behind the first, and a puff it's been made to give (-1 none)
    offset: number;
    forced: number;
};

export class ColdRule implements RunRule {
    readonly braziers: Brazier[];
    readonly vents: Vent[];
    embers: Embers[] = [];
    readonly mask: EffectMask;
    // Each hero's cold, by their index (0 when unset)
    private readonly cold: number[] = [];
    // The final boss woke, and put every brazier out
    private woke = false;
    private readonly period: number;
    private readonly warnTicks: number;
    private readonly puffTicks: number;

    constructor(
        readonly def: ColdRuleDef,
        readonly grid: ArenaGrid,
        private readonly tps: number,
    ) {
        const { braziers, vents } = def;
        const half = braziers.size / 2;
        // Lit as the run starts, each a little longer than the last, so they don't all go out
        // together
        this.braziers = braziers.at.map(({ x, y }, i) => ({
            x,
            y,
            midX: x + half,
            midY: y + half,
            litUntil: Math.round(braziers.burn * (0.6 + (0.4 * i) / braziers.at.length) * tps),
            tending: 0,
            litAt: 0,
        }));
        this.period = Math.max(1, Math.round(vents.every * tps));
        this.warnTicks = Math.round(vents.warn * tps);
        this.puffTicks = Math.round(vents.puff * tps);
        this.vents = vents.at.map(({ x, y }, i) => ({
            x,
            y,
            offset: Math.round((this.period * i) / vents.at.length),
            forced: -1,
        }));
        this.mask = new EffectMask(grid.baseX, grid.baseY, grid.sizeX, grid.sizeY);
        for (const pool of def.ice.pools) {
            this.mask.paintEllipse(pool, MASK_ICE);
        }
    }

    coldOf(hero: number): number {
        return this.cold[hero] ?? 0;
    }

    setCold(hero: number, value: number): void {
        this.cold[hero] = Math.min(this.def.cold.max, Math.max(0, value));
    }

    step(host: RuleHost): void {
        const tick = host.tick;
        // He wakes, and every brazier goes out
        if (host.finalBossUp && !this.woke) {
            this.woke = true;
            for (const brazier of this.def.braziers.stayLit ? [] : this.braziers) {
                brazier.litUntil = -1;
                brazier.tending = 0;
            }
        }
        const { relight, gutter } = this.def.braziers;
        const heroes = host.upHeroes();
        const needed = Math.round(relight.seconds * this.tps);
        const gutterTicks = gutter * this.tps;
        for (const brazier of this.braziers) {
            if (brazier.litUntil >= 0 && tick >= brazier.litUntil) {
                brazier.litUntil = -1;
            }
            // Tended: out, or guttering, with someone stood by it
            const low = brazier.litUntil < 0 || brazier.litUntil - tick < gutterTicks;
            if (low && this.anyWithin(heroes, brazier.midX, brazier.midY, relight.reach)) {
                brazier.tending++;
                if (brazier.tending >= needed) {
                    this.light(brazier, tick);
                }
            } else {
                brazier.tending = 0;
            }
        }
        if (this.embers.length > 0) {
            this.embers = this.embers.filter((embers) => tick < embers.until);
        }
    }

    // The brazier whose middle's nearest x, y, within reach tiles of it
    brazierNear(x: number, y: number, reach: number): Brazier | undefined {
        let best: Brazier | undefined;
        let bestDistance = reach;
        for (const brazier of this.braziers) {
            const distance = fm.hypot(x - brazier.midX, y - brazier.midY);
            if (distance <= bestDistance) {
                best = brazier;
                bestDistance = distance;
            }
        }
        return best;
    }

    // Lit at once, for its full burn (FightAbilityDef.kindle)
    kindle(brazier: Brazier, tick: number): void {
        this.light(brazier, tick);
    }

    // Every lit brazier the boss can see goes out (BossAttackDef.rule snuff): hidden says which it
    // can't, from where it is. Which went out.
    snuffSeen(tick: number, hidden: (brazier: Brazier) => boolean): Brazier[] {
        const out: Brazier[] = [];
        for (const brazier of this.braziers) {
            if (this.isLit(brazier, tick) && !hidden(brazier)) {
                brazier.litUntil = -1;
                brazier.tending = 0;
                out.push(brazier);
            }
        }
        return out;
    }

    private light(brazier: Brazier, tick: number): void {
        brazier.litUntil = tick + Math.round(this.def.braziers.burn * this.tps);
        brazier.litAt = tick;
        brazier.tending = 0;
    }

    isLit(brazier: Brazier, tick: number): boolean {
        return brazier.litUntil >= 0 && tick < brazier.litUntil;
    }

    // How fast the cold falls standing at x, y (a second): by a lit brazier, or embers, the
    // warmer; 0 when it's not warm there
    warmthAt(x: number, y: number, tick: number): number {
        let warmth = 0;
        const { braziers, embers } = this.def;
        for (const brazier of this.braziers) {
            if (
                this.isLit(brazier, tick) &&
                fm.hypot(x - brazier.midX, y - brazier.midY) <= braziers.reach
            ) {
                warmth = braziers.warm;
                break;
            }
        }
        for (const ember of this.embers) {
            if (fm.hypot(x - ember.x, y - ember.y) <= embers.reach) {
                warmth = Math.max(warmth, embers.warm);
            }
        }
        return warmth;
    }

    // On the embers themselves (they burn)
    onEmbers(x: number, y: number): boolean {
        const half = this.def.embers.size / 2;
        return this.embers.some(
            (ember) => Math.abs(x - ember.x) <= half && Math.abs(y - ember.y) <= half,
        );
    }

    iceAt(x: number, y: number): boolean {
        return this.mask.at(x, y) === MASK_ICE;
    }

    // Where a vent is in its cycle: "warn" as it frosts over, "puff" while its gas is out
    ventState(vent: Vent, tick: number): "warn" | "puff" | undefined {
        if (vent.forced >= 0) {
            const into = tick - vent.forced;
            if (into >= 0 && into < this.puffTicks) {
                return "puff";
            }
            if (into < 0 && into >= -this.warnTicks) {
                return "warn";
            }
        }
        const phase = (((tick - vent.offset) % this.period) + this.period) % this.period;
        if (phase < this.puffTicks) {
            return "puff";
        }
        return phase >= this.period - this.warnTicks ? "warn" : undefined;
    }

    // How far through its puff a vent is, from 0 as it starts to just under 1 as it stops
    // (undefined when it isn't puffing), so the view plays the cloud out over the time it hurts.
    // As ventState: a puff it's made to give over its own cycle's.
    puffProgress(vent: Vent, tick: number): number | undefined {
        if (vent.forced >= 0) {
            const into = tick - vent.forced;
            if (into >= 0 && into < this.puffTicks) {
                return into / this.puffTicks;
            }
        }
        const phase = (((tick - vent.offset) % this.period) + this.period) % this.period;
        return phase < this.puffTicks ? phase / this.puffTicks : undefined;
    }

    // In a vent's cloud while it's out
    gasAt(x: number, y: number, tick: number): boolean {
        const half = this.def.vents.size / 2;
        for (const vent of this.vents) {
            if (
                Math.abs(x - vent.x) <= half &&
                Math.abs(y - vent.y) <= half &&
                this.ventState(vent, tick) === "puff"
            ) {
                return true;
            }
        }
        return false;
    }

    // The vent nearest x, y puffs at once (a boss's spit landing, BossAttackDef.rule vent: its
    // windup was the warning)
    puffNearest(x: number, y: number, tick: number): Vent | undefined {
        let best: Vent | undefined;
        let bestDistance = Infinity;
        for (const vent of this.vents) {
            const distance = fm.hypot(x - vent.x, y - vent.y);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = vent;
            }
        }
        if (best) {
            best.forced = tick;
        }
        return best;
    }

    // A fire elite died at x, y: embers where it fell, and the braziers near it lit again
    onFireKill(x: number, y: number, tick: number): void {
        const { embers, braziers } = this.def;
        this.embers.push({ x, y, from: tick, until: tick + Math.round(embers.seconds * this.tps) });
        for (const brazier of this.braziers) {
            if (fm.hypot(x - brazier.midX, y - brazier.midY) <= braziers.relight.kill) {
                this.light(brazier, tick);
            }
        }
    }

    private anyWithin(heroes: number[], x: number, y: number, reach: number): boolean {
        for (let i = 0; i < heroes.length; i += 3) {
            if (fm.hypot(heroes[i + 1] - x, heroes[i + 2] - y) <= reach) {
                return true;
            }
        }
        return false;
    }

    // What the rule's own enemies lay as they go: under the cold, one snuffs the braziers it
    // passes within radius tiles of (Ketla)
    plant(x: number, y: number, radius: number): void {
        const reach = radius + this.def.braziers.size / 2;
        for (const brazier of this.braziers) {
            if (brazier.litUntil >= 0 && fm.hypot(x - brazier.midX, y - brazier.midY) <= reach) {
                brazier.litUntil = -1;
                brazier.tending = 0;
            }
        }
    }

    // The sim works out the player's own pace from their cold
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
    plantHeart(): void {}
    pickSpots(): { x: number; y: number }[] {
        return [];
    }

    hash(): number {
        let hash = (this.woke ? 1 : 0) + this.embers.length * 7;
        for (const brazier of this.braziers) {
            hash = (Math.imul(hash, 16777619) ^ (brazier.litUntil + brazier.tending * 3)) >>> 0;
        }
        for (const vent of this.vents) {
            hash = (Math.imul(hash, 16777619) ^ vent.forced) >>> 0;
        }
        for (const cold of this.cold) {
            hash = (Math.imul(hash, 16777619) ^ Math.round((cold ?? 0) * 100)) >>> 0;
        }
        return hash;
    }
}
