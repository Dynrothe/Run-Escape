import { getEnemy } from "../content/enemies";
import {
    BOSS_EVERY,
    BOSS_GROUP_HP,
    BOSS_PAIRS_AT,
    BOSS_PATIENCE,
    BOSS_TRIOS_AT,
    ELITE_EVERY,
    EVENT_EVERY,
    FIRST_BOSS_AT,
    FIRST_EVENT_AT,
    MAYHEM_BOSSES,
    MAYHEM_ENEMIES,
    MAYHEM_EVENTS,
    MAYHEM_MODIFIERS,
    MAYHEM_REGEN,
    MAYHEM_STAT_CAPS,
    MODIFIERS,
    MayhemEventDef,
    ModifierDef,
    ModifierTier,
    ROSTER_EVERY,
    ROSTER_SIZE,
    getEnemyTier,
    getTierChances,
    getTierWeights,
    mayhemBossHp,
    mayhemDifficulty,
    mayhemWave,
} from "../content/mayhem";
import { canLevelPassive, getPassive } from "../content/passives";
import { getPowerUp } from "../content/powerups";
import { EnemyDef, Stats, WaveDef } from "../content/types";
import { getWeapon } from "../content/weapons";
import type { Sim } from "./Sim";
import { DamageSource, Enemy } from "./entities";

// How often the Modifiers that act on their own act, in seconds
const WRATH_EVERY = 3;
const WRATH_TARGETS = 3;
const WRATH_RANGE = 10;
const WRATH_HP = 0.2;
const CANNON_EVERY = 45;
const THRALL_EVERY = 40;
const OVERLOAD_EVERY = 30;
const OVERLOAD_SECONDS = 10;
const SURGE_EVERY = 30;
const SURGE_SECONDS = 8;
const CASKET_EVERY = 40;
const STOPWATCH_EVERY = 40;
const PRAYER_FLICK_EVERY = 10;
const PHOENIX_EVERY = 60;

const GUTHANS_KILLS = 25;
const VENGEANCE_HP = 1 / 3;
const VENGEANCE_RADIUS = 3;
const INFERNAL_HP = 0.25;
const INFERNAL_RADIUS = 2;
const FURY_DAMAGE = 0.4;
const FURY_RADIUS = 1.6;
const FREEZE_RADIUS = 3;
const FREEZE_TICKS = 2 * 50;
// A blast takes this fraction of its share from a boss (it'd melt otherwise)
const BLAST_BOSS_SHARE = 0.06;
// Blasts set off in a tick; more wait for the next, so a chain reaction spreads
const BLASTS_A_TICK = 30;
// Saradomin Strike's lightning and a sweeping hit's flash, both baked already
const LIGHTNING_SPOTANIM = 76;
const BLAST_SPOTANIM = 559;

const GOBLIN_RAID_COUNT = 24;
const GIANTS_COUNT = 10;
const GIANT_SCALE = 1.9;
const CASKET_RAIN = 3;

function isMeleeSource(source: DamageSource): boolean {
    if (!source.startsWith("weapon:")) {
        return false;
    }
    const kind = getWeapon(source.slice("weapon:".length)).kind;
    return kind === "slash" || kind === "sweep";
}

type Blast = {
    x: number;
    y: number;
    radius: number;
    // A fraction of what's hit's hitpoints, or an amount
    share?: number;
    damage?: number;
    freezeTicks?: number;
    uid?: number;
};

// A Mayhem run's own state and rules, with what the sim asks of it (see the
// content in content/mayhem.ts). The sim stays as it is without one.
export class MayhemRun {
    readonly modifiers: ModifierDef[] = [];
    // The cards on offer, while the sim's in its "modifier" state
    choices: ModifierDef[] = [];
    rerolled = false;
    // Picks earned and not made yet: the first is there from the start
    pendingPicks = 1;
    event?: { def: MayhemEventDef; endTick: number };

    picksMade = 0;
    private bossesCounted = 0;
    private nextBossSeconds = FIRST_BOSS_AT;
    private nextEliteSeconds = ELITE_EVERY;
    private nextEventSeconds = FIRST_EVENT_AT;
    private nextRosterSeconds = 0;
    private roster: WaveDef["enemies"] = [];
    private eventOrder: MayhemEventDef[] = [];
    private lastBoss?: string;
    private blasts: Blast[] = [];
    private kills = 0;
    // Tick each timed Modifier next acts, by id
    private readonly due: Record<string, number> = {};
    private flickReadyTick = 0;
    private phoenixReadyTick = 0;
    private overloadEndTick = 0;
    private surgeEndTick = 0;

    constructor(private readonly sim: Sim) {}

    has(id: string): boolean {
        return this.modifiers.some((m) => m.id === id);
    }

    // ---- Picks ----

    // Called with the run in a state to show them
    openPick(): void {
        this.choices = this.rollChoices();
        this.rerolled = false;
        if (this.choices.length > 0) {
            this.sim.state = "modifier";
        } else {
            this.pendingPicks = 0;
        }
    }

    get canReroll(): boolean {
        return !this.rerolled;
    }

    reroll(): boolean {
        if (this.rerolled || this.sim.state !== "modifier") {
            return false;
        }
        this.choices = this.rollChoices();
        this.rerolled = true;
        return true;
    }

    choose(index: number): void {
        const def = this.choices[index];
        if (!def) {
            return;
        }
        this.modifiers.push(def);
        this.choices = [];
        this.pendingPicks--;
        this.picksMade++;
        const sim = this.sim;
        sim.state = "playing";
        this.applyNow(def);
        sim.updateStats();
    }

    private rollChoices(): ModifierDef[] {
        const rng = this.sim.rng;
        const left = MODIFIERS.filter((m) => !this.has(m.id));
        const { prismatic, gold } = getTierChances(this.picksMade);
        const cards: ModifierDef[] = [];
        for (let i = 0; i < 3 && left.length > 0; i++) {
            const roll = rng.next();
            const tier: ModifierTier =
                roll < prismatic ? "prismatic" : roll < prismatic + gold ? "gold" : "silver";
            const ofTier = left.filter((m) => m.tier === tier);
            const pool = ofTier.length > 0 ? ofTier : left;
            const card = pool[rng.int(pool.length)];
            cards.push(card);
            left.splice(left.indexOf(card), 1);
        }
        return cards;
    }

    // What a Modifier does the moment it's picked
    private applyNow(def: ModifierDef): void {
        const sim = this.sim;
        if (def.id === "ring_of_life") {
            sim.revivesLeft += 2;
        } else if (def.id === "max_cape") {
            for (const weapon of sim.weapons) {
                sim.apply({
                    kind: "weaponLevel",
                    weaponId: weapon.def.id,
                    level: weapon.level + 1,
                    quality: "common",
                });
            }
            for (const passive of sim.passives) {
                if (canLevelPassive(getPassive(passive.id), passive.level, true)) {
                    sim.apply({
                        kind: "passiveLevel",
                        passiveId: passive.id,
                        level: passive.level + 1,
                        quality: "common",
                        currentValue: passive.value,
                    });
                }
            }
        }
    }

    // ---- What the sim asks ----

    get difficulty(): { hp: number; damage: number } {
        return mayhemDifficulty(this.sim.seconds);
    }

    // The next lot of bosses, in seconds
    get bossIn(): number {
        return Math.max(0, this.nextBossSeconds - this.sim.seconds);
    }

    get wave(): WaveDef {
        const wave = mayhemWave(this.sim.seconds, this.roster);
        if (this.has("lure")) {
            wave.spawnRate *= 1.5;
            wave.minAlive = Math.round(wave.minAlive * 1.5);
            wave.maxAlive = Math.round(wave.maxAlive * 1.5);
        }
        return wave;
    }

    get enemySpeed(): number {
        return this.eventIs("speedrun") ? 1.5 : 1;
    }

    get evolvesAtAnyLevel(): boolean {
        return this.has("evolution_chamber");
    }

    get firesTwice(): boolean {
        return this.has("double_agent");
    }

    private eventIs(id: string): boolean {
        return this.event?.def.id === id;
    }

    // Stats from Modifiers and what's running now
    addStats(stats: Stats): void {
        stats.regen += MAYHEM_REGEN;
        for (const def of this.modifiers) {
            for (const [key, value] of Object.entries(def.stats ?? {})) {
                stats[key as keyof Stats] += value ?? 0;
            }
        }
        const tick = this.sim.tick;
        if (tick < this.overloadEndTick) {
            stats.might += 0.6;
        }
        if (tick < this.surgeEndTick) {
            stats.cooldown += 0.5;
        }
        if (this.eventIs("speedrun")) {
            stats.moveSpeed += 0.5;
        }
        if (this.eventIs("double_bones")) {
            stats.growth += 1;
        }
        if (this.has("blood_money")) {
            stats.regen = Math.min(stats.regen, 0);
        }
        for (const [key, cap] of Object.entries(MAYHEM_STAT_CAPS)) {
            stats[key as keyof Stats] = Math.min(stats[key as keyof Stats], cap ?? Infinity);
        }
    }

    // What the player's hits on this enemy are multiplied by
    hitScale(enemy: Enemy): number {
        const player = this.sim.player;
        let scale = 1;
        if (this.has("dharoks_set")) {
            scale *= 2 - Math.max(0, player.hp / player.maxHp);
        }
        if (this.has("veracs_set") && this.sim.rng.chance(0.25)) {
            scale *= 2;
        }
        if (this.has("slayer_helmet") && enemy.elite) {
            scale *= 1.5;
        }
        return scale;
    }

    // A hit landed on an enemy, for damage
    onHit(enemy: Enemy, damage: number, source: DamageSource): void {
        if (this.has("bandos_fury") && isMeleeSource(source)) {
            this.blasts.push({
                x: enemy.x,
                y: enemy.y,
                radius: FURY_RADIUS,
                damage: damage * FURY_DAMAGE,
                uid: enemy.uid,
            });
        }
    }

    // What a hit on the player comes to, after armour
    onPlayerHit(amount: number, boss: boolean): number {
        const sim = this.sim;
        const player = sim.player;
        if (this.has("prayer_flick") && sim.tick >= this.flickReadyTick) {
            this.flickReadyTick = sim.tick + sim.secondsToTicks(PRAYER_FLICK_EVERY);
            return 0;
        }
        let scale = 1;
        if (this.has("torags_set")) {
            scale *= 0.75;
        }
        if (this.has("stamina_potion") && player.moving) {
            scale *= 0.8;
        }
        if (boss && this.has("super_antifire")) {
            scale *= 0.6;
        }
        if (this.has("pk_skull")) {
            scale *= 1.4;
        }
        if (this.has("double_agent")) {
            scale *= 1.5;
        }
        if (this.eventIs("power_hour")) {
            scale *= 2;
        }
        const hit = Math.max(1, Math.round(amount * scale));
        if (this.has("vengeance")) {
            this.blasts.push({
                x: player.x,
                y: player.y,
                radius: VENGEANCE_RADIUS,
                share: VENGEANCE_HP,
            });
        }
        if (hit >= player.hp && this.has("phoenix_necklace") && sim.tick >= this.phoenixReadyTick) {
            this.phoenixReadyTick = sim.tick + sim.secondsToTicks(PHOENIX_EVERY);
            player.hp = Math.ceil(player.maxHp / 2);
            sim.pushNotice("Your phoenix necklace saves you!");
            return 0;
        }
        return hit;
    }

    onKill(enemy: Enemy): void {
        const sim = this.sim;
        this.kills++;
        if (enemy.boss && this.bossesCounted < MAYHEM_MODIFIERS - 1) {
            this.bossesCounted++;
            this.pendingPicks++;
        }
        if (this.has("guthans_set") && this.kills % GUTHANS_KILLS === 0) {
            sim.heal(sim.player.maxHp / 10);
        }
        if (this.has("infernal_cape")) {
            this.blasts.push({
                x: enemy.x,
                y: enemy.y,
                radius: INFERNAL_RADIUS,
                share: INFERNAL_HP,
                uid: enemy.uid,
            });
        }
        if (this.has("ancient_magicks") && sim.rng.chance(1 / 6)) {
            this.blasts.push({
                x: enemy.x,
                y: enemy.y,
                radius: FREEZE_RADIUS,
                freezeTicks: FREEZE_TICKS,
                uid: enemy.uid,
            });
        }
        if (this.has("blood_money") && !enemy.boss && sim.rng.chance(0.04)) {
            sim.dropPickup("coins", enemy.x + 0.3, enemy.y + 0.2, 1 + sim.rng.int(3));
        }
    }

    onCoins(value: number): void {
        if (this.has("blood_money")) {
            this.sim.heal(value * this.sim.healScale);
        }
    }

    // A boss's hitpoints when it's one of several
    private bossHp(group: number): number {
        return Math.round(mayhemBossHp(this.sim.seconds) * (group > 1 ? BOSS_GROUP_HP : 1));
    }

    // ---- Every tick ----

    direct(): void {
        const sim = this.sim;
        const seconds = sim.seconds;
        if (seconds >= this.nextRosterSeconds) {
            this.nextRosterSeconds = seconds + ROSTER_EVERY;
            this.pickRoster(seconds);
        }
        const bossUp = sim.enemies.some((enemy) => enemy.boss && !enemy.dead);
        if (
            seconds >= this.nextBossSeconds &&
            (!bossUp || seconds >= this.nextBossSeconds + BOSS_PATIENCE)
        ) {
            this.nextBossSeconds = seconds + BOSS_EVERY;
            this.spawnBosses(seconds);
        }
        if (seconds >= this.nextEliteSeconds) {
            this.nextEliteSeconds = seconds + ELITE_EVERY;
            const pick = this.roster[sim.rng.int(this.roster.length)];
            sim.spawnEnemy(getEnemy(pick.id), "elite");
        }
        if (seconds >= this.nextEventSeconds) {
            this.nextEventSeconds = seconds + EVENT_EVERY;
            this.startEvent();
        }
        if (this.event && sim.tick >= this.event.endTick) {
            this.event = undefined;
            sim.updateStats();
        }
    }

    // A new mix of enemies, weighted to the tiers due now
    private pickRoster(seconds: number): void {
        const rng = this.sim.rng;
        const tiers = getTierWeights(seconds);
        // Shooters wear you down from afar, so a mix has few of them
        const weight = (def: EnemyDef) => tiers[getEnemyTier(def)] * (def.shot ? 0.2 : 1);
        const pool = MAYHEM_ENEMIES.filter((def) => weight(def) > 0);
        const roster: WaveDef["enemies"] = [];
        for (let i = 0; i < ROSTER_SIZE && pool.length > 0; i++) {
            const index = rng.weightedIndex(pool.map(weight));
            roster.push({ id: pool[index].id, weight: 1 });
            pool.splice(index, 1);
        }
        this.roster = roster;
    }

    private spawnBosses(seconds: number): void {
        const sim = this.sim;
        const group = seconds >= BOSS_TRIOS_AT ? 3 : seconds >= BOSS_PAIRS_AT ? 2 : 1;
        const pool: EnemyDef[] = MAYHEM_BOSSES.filter((def) => def.id !== this.lastBoss);
        for (let i = 0; i < group; i++) {
            const def = pool.splice(sim.rng.int(pool.length), 1)[0];
            this.lastBoss = def.id;
            sim.spawnBoss(def, "boss", this.bossHp(group));
        }
    }

    private startEvent(): void {
        const sim = this.sim;
        if (this.eventOrder.length === 0) {
            this.eventOrder = [...MAYHEM_EVENTS];
        }
        const def = this.eventOrder.splice(sim.rng.int(this.eventOrder.length), 1)[0];
        this.event = { def, endTick: sim.tick + sim.secondsToTicks(def.seconds) };
        sim.events.push({ type: "mayhemEvent", name: def.name, text: def.text });
        const { x, y } = sim.player;
        switch (def.id) {
            case "goblin_raid":
                sim.spawnRing(getEnemy("goblin"), GOBLIN_RAID_COUNT);
                break;
            case "rain_of_caskets":
                for (let i = 0; i < CASKET_RAIN; i++) {
                    const angle = (i / CASKET_RAIN) * Math.PI * 2;
                    sim.dropCasket(x + Math.cos(angle) * 2.5, y + Math.sin(angle) * 2.5, false);
                }
                break;
            case "giant_mode":
                this.spawnGiants();
                break;
            case "boss_rush":
                this.nextBossSeconds = sim.seconds;
                break;
        }
        sim.updateStats();
    }

    private spawnGiants(): void {
        const sim = this.sim;
        for (let i = 0; i < GIANTS_COUNT; i++) {
            const pick = this.roster[sim.rng.int(this.roster.length)];
            const giant = sim.spawnEnemy(getEnemy(pick.id), "normal");
            if (giant) {
                giant.scale *= GIANT_SCALE;
                giant.radius = Math.min(giant.radius * 1.3, 0.49);
                giant.speed *= 0.7;
                giant.hp = giant.maxHp = giant.maxHp * 3;
                giant.xp *= 5;
            }
        }
    }

    // Modifiers that act on their own, and the blasts due
    step(): void {
        const sim = this.sim;
        this.every("saradomins_wrath", WRATH_EVERY, () => this.wrath());
        this.every("dwarf_cannon", CANNON_EVERY, () => sim.usePowerUp(getPowerUp("cannon")));
        this.every("book_of_the_dead", THRALL_EVERY, () => sim.usePowerUp(getPowerUp("thrall")));
        this.every("time_stands_still", STOPWATCH_EVERY, () =>
            sim.usePowerUp(getPowerUp("stopwatch")),
        );
        this.every("clue_hunter", CASKET_EVERY, () =>
            sim.dropCasket(sim.player.x + 1.5, sim.player.y, false),
        );
        this.every("overload", OVERLOAD_EVERY, () => {
            this.overloadEndTick = sim.tick + sim.secondsToTicks(OVERLOAD_SECONDS);
            sim.player.hp = Math.max(1, sim.player.hp - sim.player.maxHp / 10);
            sim.updateStats();
        });
        this.every("power_surge", SURGE_EVERY, () => {
            this.surgeEndTick = sim.tick + sim.secondsToTicks(SURGE_SECONDS);
            sim.updateStats();
        });
        if (sim.tick === this.overloadEndTick || sim.tick === this.surgeEndTick) {
            sim.updateStats();
        }
        this.stepBlasts();
    }

    private every(id: string, seconds: number, act: () => void): void {
        if (!this.has(id)) {
            return;
        }
        const tick = this.sim.tick;
        const ticks = this.sim.secondsToTicks(seconds);
        this.due[id] ??= tick + ticks;
        if (tick >= this.due[id]) {
            this.due[id] = tick + ticks;
            act();
        }
    }

    private wrath(): void {
        const sim = this.sim;
        const { x, y } = sim.player;
        for (const enemy of sim.nearestEnemies(x, y, WRATH_RANGE, WRATH_TARGETS)) {
            sim.addEffect(LIGHTNING_SPOTANIM, enemy.x, enemy.y, 0, 60, enemy.uid);
            this.hit(enemy, WRATH_HP);
        }
    }

    private stepBlasts(): void {
        const blasts = this.blasts.splice(0, BLASTS_A_TICK);
        const sim = this.sim;
        for (const blast of blasts) {
            if (blast.share !== undefined || blast.freezeTicks !== undefined) {
                sim.addEffect(BLAST_SPOTANIM, blast.x, blast.y, 0, 30);
            }
            for (const enemy of sim.enemiesWithin(blast.x, blast.y, blast.radius)) {
                if (enemy.uid === blast.uid) {
                    continue;
                }
                if (blast.freezeTicks !== undefined && !enemy.boss) {
                    enemy.frozen = Math.max(enemy.frozen, blast.freezeTicks);
                } else if (blast.share !== undefined) {
                    this.hit(enemy, blast.share);
                } else if (blast.damage !== undefined) {
                    sim.damageFromModifier(enemy, blast.damage);
                }
            }
        }
    }

    // A share of an enemy's hitpoints, so it keeps up with the run
    private hit(enemy: Enemy, share: number): void {
        const amount = enemy.maxHp * share * (enemy.boss ? BLAST_BOSS_SHARE : 1);
        this.sim.damageFromModifier(enemy, amount);
    }
}
