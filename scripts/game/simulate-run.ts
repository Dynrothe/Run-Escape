// Plays runs with a simple bot on the real arena (collision from a snapshot of
// the cache, see collision-snapshot.ts) and prints how they go, for balancing waves, weapons and the XP curve.
//
//   bun run tsx scripts/game/simulate-run.ts                 # every character once
//   bun run tsx scripts/game/simulate-run.ts wizard 3        # one character, 3 seeds
//   bun run tsx scripts/game/simulate-run.ts "" 2 5          # everyone, 2 seeds, 5 minutes
//   MAP=barrows bun run tsx scripts/game/simulate-run.ts     # another map (Lumbridge by default)
//   UNLOCKS=none bun run tsx scripts/game/simulate-run.ts    # nothing from map tasks (all by default)
//   META=max bun run tsx scripts/game/simulate-run.ts        # every shop upgrade bought (none by default)
//   ARMOURY=max bun run tsx scripts/game/simulate-run.ts     # all gear upgraded in the Armoury (none by default)
//   ENDLESS=1 bun run tsx scripts/game/simulate-run.ts       # an endless run (up to 90 minutes)
//   HARD=1 bun run tsx scripts/game/simulate-run.ts          # on hard mode
//   EXPERT=1 MAP=theatre_of_blood ...  # a raid's expert mode (hard, and the Nylocas's colours)
//   WEAPON=crystal_bow bun run tsx scripts/game/simulate-run.ts ranger  # start with this weapon instead
//   FINAL_BOSS=the_nightmare BOSS_ARENA=48 bun run tsx ...   # another final boss, on a square of the map
//   FRESH=1 ...                                          # straight to it with nothing upgraded
//   DODGE=1 ...     # also keeps off what any boss marks on the ground, and sidesteps its bullets
//   FLAT=1 ...      # the map's arena with nothing in it, as the bot walks straight into walls
//   STAGE=1 ...     # a fight in parts (MapDef.stages): the second, as a run that's won the first
//   SAFE_WAVES=1 ... # can't die before the final boss: it gets there with what the run earned
//   GOD=1 ...        # can't die at all: with ENDLESS=1, how damage keeps up with the rounds
//   FUNNEL=1 ...     # always takes its best weapon's next level when it's offered
//   SMITE=0 ...      # never presses a fight's button (MapDef.fight.ability); by default it does
//                    # whenever the boss's guard is down (BossDef.guard) and it's in reach
//   MAP=tombs_of_amascut DEV_MAPS=1 ...   # the Tombs of Amascut, the whole raid (tombsBot.ts)
//   INVOCATIONS=walk_for_it,insanity ...   # its invocations (INVOCATIONS=all for every one the
//                                          # board allows: one of a group that's one at a time)
//   SLOPPY=1 ...     # plays a phased fight as a less careful person: backs off from the boss 3 s
//                    # in every 10 (out of a reach-limited weapon's reach), and misses about
//                    # half the chances to use the fight's button
import { getUpgradeLine } from "../../src/game/content/armoury";
import { CHARACTERS } from "../../src/game/content/characters";
import { getEnemy } from "../../src/game/content/enemies";
import { INVOCATIONS } from "../../src/game/content/invocations";
import { CASKET_GEAR, getGear } from "../../src/game/content/items";
import { getMap } from "../../src/game/content/maps";
import { RARITY_ORDER } from "../../src/game/content/rarity";
import { SHOP_UPGRADES } from "../../src/game/content/shop";
import { emptyStats } from "../../src/game/content/types";
import { RUN_LENGTH } from "../../src/game/content/waves";
import { Sim, TICKS_PER_SECOND } from "../../src/game/core/Sim";
import { UpgradeChoice } from "../../src/game/core/Upgrades";
import { behindPillar } from "../../src/game/core/arena";
import { BossWindup, Enemy, SimEvent } from "../../src/game/core/entities";
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { makeGrid } from "../../src/game/core/world/testGrid";
import { loadRegionData } from "./collision-snapshot";
import { TombsLog, chestAction, tombsMove, useItems } from "./tombsBot";

const [characterArg, seedsArg, minutesArg] = process.argv.slice(2);
// The Tombs' invocations
const invocations =
    process.env.INVOCATIONS === "all"
        ? INVOCATIONS.map((i) => i.id)
        : (process.env.INVOCATIONS ?? "").split(",").filter(Boolean);
const characters = characterArg ? [characterArg] : CHARACTERS.map((c) => c.id);
const seeds = parseInt(seedsArg ?? "1");
// How often to print progress (REPORT=15 for every 15 seconds)
const REPORT_SECONDS = parseInt(process.env.REPORT ?? "60");

const map = getMap(process.env.MAP ?? "lumbridge");
const endless = process.env.ENDLESS === "1";
const hard = process.env.HARD === "1";
const expert = process.env.EXPERT === "1";
// The weapons, passives and items brought in by map tasks: all of them, or none
const unlockedItems = process.env.UNLOCKS === "none" ? new Set<string>() : undefined;
// The shop's permanent upgrades: none, or all of them, as a player has by the
// later maps
const metaStats = emptyStats();
if (process.env.META === "max") {
    for (const upgrade of SHOP_UPGRADES) {
        metaStats[upgrade.stat] += upgrade.perRank * upgrade.maxRank;
    }
}
// The Armoury's upgrades: none, or every piece as far as it goes
const armoury =
    process.env.ARMOURY === "max"
        ? Object.fromEntries(CASKET_GEAR.map((g) => [g.id, getUpgradeLine(g.id).length - 1]))
        : undefined;
const ARENA = map.arena;
// Her map's not on every branch, so she can be tried on any map, in a square
// around its spawn
const finalBoss = process.env.FINAL_BOSS;
const fresh = process.env.FRESH === "1";
const dodges = process.env.DODGE === "1";
const smites = process.env.SMITE !== "0";
const sloppy = process.env.SLOPPY === "1";
// A sloppy bot's lapses: these seconds in every SLOPPY_EVERY it backs off from the boss
const SLOPPY_EVERY = 10;
const SLOPPY_LAPSE = 3;
// A co-op party of this many of the adventurer, each played by the bot on its
// own (it doesn't play as a team: no regrouping, no waiting for the others)
const partySize = parseInt(process.env.PARTY ?? "1");
if (finalBoss) {
    map.events = map.events.map((e) =>
        e.kind === "finalBoss" ? { at: e.at, kind: e.kind, enemyId: finalBoss, hp: e.hp } : e,
    );
    const size = parseInt(process.env.BOSS_ARENA ?? "0");
    if (size > 0) {
        map.bossArena = {
            baseX: Math.round(map.spawn.x - size / 2),
            baseY: Math.round(map.spawn.y - size / 2),
            size,
        };
    }
}
console.time(`${map.name} arena`);
const grid =
    process.env.FLAT === "1"
        ? makeGrid(new Array(ARENA.sizeY).fill(".".repeat(ARENA.sizeX)), ARENA.baseX, ARENA.baseY)
        : new ArenaGrid(loadRegionData(map));
console.timeEnd(`${map.name} arena`);

// Like a person might: take evolutions, fill the weapon slots, then upgrade;
// between two of the same kind, the rarer roll
const CHOICE_PRIORITY: Record<UpgradeChoice["kind"], number> = {
    evolve: 0,
    // Only ever offered on their own
    hilt: 0,
    newWeapon: 1,
    weaponLevel: 2,
    newPassive: 3,
    passiveLevel: 4,
    food: 5,
    coins: 6,
};

function choiceScore(choice: UpgradeChoice): number {
    const quality = "quality" in choice ? RARITY_ORDER.indexOf(choice.quality) : 0;
    // A Rare or better roll beats a Common pick of a better kind
    return CHOICE_PRIORITY[choice.kind] * 10 - quality * 15;
}

// Runs a set was started in (a piece worn), and finished in (its bonus), for
// the summary at the end
const setsStarted = new Map<string, number>();
const setsFinished = new Map<string, number>();
let runs = 0;

// Steers away from nearby enemies (closer counts more) and towards bones when
// nothing is close; slides along walls by trying a few nearby directions.
function botMove(sim: Sim): { x: number; y: number } {
    const player = sim.player;
    let ax = 0;
    let ay = 0;
    let threat = 0;
    for (const enemy of sim.enemies) {
        if (enemy.dead) {
            continue;
        }
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distSq = dx * dx + dy * dy;
        if (enemy.boss && (enemy.def.stationary || sim.isNapping(enemy))) {
            // One that can't come to you (the Maiden, Xarpus), or that's down for a moment (the
            // Bloat), a person walks up to, to about 2.5 tiles, or nothing but a ranged weapon
            // would ever reach it
            const w = distSq > 6.25 ? -2 / Math.sqrt(distSq) : 1 / Math.max(distSq, 0.25);
            ax += dx * w;
            ay += dy * w;
            threat += Math.abs(w);
            continue;
        }
        if (distSq < (enemy.boss ? 144 : 64)) {
            // A person keeps well away from the boss
            const w = (enemy.boss ? 8 : 1) / Math.max(distSq, 0.25);
            ax += dx * w;
            ay += dy * w;
            threat += w;
        }
    }
    // Bones nearby are worth a detour unless enemies are right on top, and
    // power-ups and random events' visitors twice as far
    let best = Infinity;
    let bx = 0;
    let by = 0;
    if (sim.visitor) {
        bx = sim.visitor.x - player.x;
        by = sim.visitor.y - player.y;
        best = (bx * bx + by * by) / 4;
    }
    for (const pickup of sim.pickups) {
        const dx = pickup.x - player.x;
        const dy = pickup.y - player.y;
        const d = (dx * dx + dy * dy) / (pickup.kind === "powerUp" ? 4 : 1);
        if (d < best && d < 144) {
            best = d;
            bx = dx;
            by = dy;
        }
    }
    if (best < Infinity) {
        const len = Math.hypot(bx, by);
        const pull = threat < 0.08 ? 1 : 0.6 / (1 + threat * 4);
        ax += (bx / len) * pull;
        ay += (by / len) * pull;
    }
    // Drift back towards the middle of the arena so the bot doesn't pin itself
    // against its edge
    const cx = ARENA.baseX + ARENA.sizeX / 2 - player.x;
    const cy = ARENA.baseY + ARENA.sizeY / 2 - player.y;
    ax += cx * 0.002;
    ay += cy * 0.002;
    const len = Math.hypot(ax, ay);
    if (len < 1e-6) {
        return { x: 0, y: 0 };
    }
    return { x: ax / len, y: ay / len };
}

// A wall of a boss's bullets (BulletPatternDef shape "wall") coming at it: across to the nearest
// spot in line with the way through (or past its end), as a person walks to the gap. Undefined
// when there's none coming, or it's in line with a way through already.
function wallGap(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    const { bullets } = sim;
    // The nearest rank on its way: its heading, and how far off it is
    let dirX = 0;
    let dirY = 0;
    let ahead = Infinity;
    const isWall = (slot: number) =>
        sim.bulletSources[bullets.source[slot]]?.attack.pattern?.shape === "wall";
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (!isWall(slot)) {
            continue;
        }
        const speed = Math.hypot(bullets.vx[slot], bullets.vy[slot]);
        if (speed < 1e-6) {
            continue;
        }
        const ux = bullets.vx[slot] / speed;
        const uy = bullets.vy[slot] / speed;
        const along = (player.x - bullets.x[slot]) * ux + (player.y - bullets.y[slot]) * uy;
        if (along > -1 && along < 5 && along < ahead) {
            ahead = along;
            dirX = ux;
            dirY = uy;
        }
    }
    if (ahead === Infinity) {
        return undefined;
    }
    // Where along the rank its guards are, across the way it's going
    const blocked: { at: number; radius: number }[] = [];
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (!isWall(slot)) {
            continue;
        }
        const dx = player.x - bullets.x[slot];
        const dy = player.y - bullets.y[slot];
        const along = dx * dirX + dy * dirY;
        const speed = Math.hypot(bullets.vx[slot], bullets.vy[slot]);
        const same = (bullets.vx[slot] * dirX + bullets.vy[slot] * dirY) / speed > 0.99;
        if (same && Math.abs(along - ahead) < 0.8) {
            blocked.push({ at: -(dx * -dirY + dy * dirX), radius: bullets.radius[slot] });
        }
    }
    const clear = (at: number) =>
        blocked.every((b) => Math.abs(b.at - at) > b.radius + player.radius + 0.25);
    if (clear(0)) {
        // In line with the way through: on through it, before anything else moves it off
        return ahead < 2 ? { x: -dirX, y: -dirY } : undefined;
    }
    const square = sim.map.bossArena;
    const inside = (at: number) => {
        const x = player.x - dirY * at;
        const y = player.y + dirX * at;
        return (
            !square ||
            (x > square.baseX + 0.6 &&
                x < square.baseX + square.size - 0.6 &&
                y > square.baseY + 0.6 &&
                y < square.baseY + square.size - 0.6)
        );
    };
    for (let step = 1; step <= 120; step++) {
        for (const at of [step * 0.1, -step * 0.1]) {
            if (clear(at) && inside(at)) {
                const side = at > 0 ? 1 : -1;
                // Across, and back from it a little if it's close
                const back = ahead < 1.5 ? 0.5 : 0;
                const x = -dirY * side - dirX * back;
                const y = dirX * side - dirY * back;
                const length = Math.hypot(x, y);
                return { x: x / length, y: y / length };
            }
        }
    }
    return undefined;
}

// A closing ring of a boss's bullets round it (BulletPatternDef shape "closing"): towards the
// widest way between them, while it's inside. Undefined when there's none, or it's out.
function cageGap(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    const { bullets } = sim;
    const angles: number[] = [];
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (sim.bulletSources[bullets.source[slot]]?.attack.pattern?.shape !== "closing") {
            continue;
        }
        angles.push(Math.atan2(bullets.y[slot] - player.y, bullets.x[slot] - player.x));
    }
    if (angles.length < 3) {
        return undefined;
    }
    angles.sort((a, b) => a - b);
    let widest = 0;
    let at = 0;
    angles.forEach((angle, i) => {
        const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
        if (next - angle > widest) {
            widest = next - angle;
            at = angle + (next - angle) / 2;
        }
    });
    // Over half the way round empty: it's out already
    if (widest > Math.PI) {
        return undefined;
    }
    return { x: Math.cos(at), y: Math.sin(at) };
}

// Orbs that follow it (a boss's projectiles with homing): across the way the nearest is going,
// once it's close, as a sharp turn beats one that turns slowly
function dodgeOrbs(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    let nearest: (typeof sim.enemyProjectiles)[number] | undefined;
    let away = 2.5;
    for (const projectile of sim.enemyProjectiles) {
        if (projectile.homing <= 0 || projectile.hit) {
            continue;
        }
        const distance = Math.hypot(player.x - projectile.x, player.y - projectile.y);
        if (distance < away) {
            away = distance;
            nearest = projectile;
        }
    }
    if (!nearest) {
        return undefined;
    }
    const speed = Math.max(0.001, Math.hypot(nearest.vx, nearest.vy));
    const dx = player.x - nearest.x;
    const dy = player.y - nearest.y;
    const side = dx * nearest.vy - dy * nearest.vx >= 0 ? 1 : -1;
    // Across it, and away from it a little
    return openWay(
        sim,
        (nearest.vy / speed) * side * 0.8 + (dx / Math.max(away, 0.001)) * 0.6,
        (-nearest.vx / speed) * side * 0.8 + (dy / Math.max(away, 0.001)) * 0.6,
    );
}

// Off a boss's tether (BossAttackDef.tether), once it's about to hurt: straight out from the
// beam, on the side it's on, as a person keeps their side of it
function offTether(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const tether of sim.tethers) {
        const ends = sim.tetherEnds(tether);
        if (!ends || sim.tick < tether.armTick - TICKS_PER_SECOND / 2) {
            continue;
        }
        const { boss, partner } = ends;
        const dx = partner.x - boss.x;
        const dy = partner.y - boss.y;
        const lengthSq = Math.max(0.001, dx * dx + dy * dy);
        const t = Math.max(
            0,
            Math.min(1, ((player.x - boss.x) * dx + (player.y - boss.y) * dy) / lengthSq),
        );
        const ox = player.x - (boss.x + dx * t);
        const oy = player.y - (boss.y + dy * t);
        const away = Math.hypot(ox, oy);
        if (away < tether.attack.tether!.width / 2 + player.radius + 0.7) {
            return away > 0.001 ? openWay(sim, ox / away, oy / away) : openWay(sim, -dy, dx);
        }
    }
    return undefined;
}

// Across a boss's aimed shot that's coming straight at it (not a homing one: dodgeOrbs), once
// it's close, as a person steps off a bolt's line
function dodgeShots(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const projectile of sim.enemyProjectiles) {
        if (projectile.homing > 0 || projectile.hit) {
            continue;
        }
        const speed = Math.max(0.001, Math.hypot(projectile.vx, projectile.vy));
        const ux = projectile.vx / speed;
        const uy = projectile.vy / speed;
        const dx = player.x - projectile.x;
        const dy = player.y - projectile.y;
        const along = dx * ux + dy * uy;
        const side = dx * -uy + dy * ux;
        if (along > 0 && along < 3.5 && Math.abs(side) < projectile.radius + player.radius + 0.3) {
            const sign = side >= 0 ? 1 : -1;
            return openWay(sim, -uy * sign, ux * sign);
        }
    }
    return undefined;
}

// Out of a boss's pool (BossAttackDef.pool: the elder's sinking sand), the short way
function outOfPool(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const pool of sim.pools) {
        const dx = player.x - pool.x;
        const dy = player.y - pool.y;
        const away = Math.hypot(dx, dy);
        if (pool.endTick > sim.tick && away < pool.radius + player.radius + 0.2) {
            return away > 0.001 ? openWay(sim, dx / away, dy / away) : { x: 1, y: 0 };
        }
    }
    return undefined;
}

// Off where another boss's blast will land than the one on the bar (two at once: the Scarab
// Mages), as fightMove does for that one's
function otherBlasts(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const enemy of sim.enemies) {
        const windup = enemy.bossState?.windup;
        if (enemy.dead || enemy === sim.shownBoss || windup?.attack.kind !== "blast") {
            continue;
        }
        const reach = (windup.attack.radius ?? 1) + player.radius + 0.5;
        for (const spot of windup.targets) {
            const dx = player.x - spot.x;
            const dy = player.y - spot.y;
            const away = Math.hypot(dx, dy);
            if (away < reach) {
                return away > 0.001 ? { x: dx / away, y: dy / away } : { x: 1, y: 0 };
            }
        }
    }
    return undefined;
}

// Sidesteps what's about to reach it, the nearer the more. A person reads
// the arms of a spiral far sooner than this does. A wall's left to wallGap.
function sidestepBullets(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    let awayX = 0;
    let awayY = 0;
    const { bullets } = sim;
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (sim.bulletSources[bullets.source[slot]]?.attack.pattern?.shape === "wall") {
            continue;
        }
        const dx = player.x - bullets.x[slot];
        const dy = player.y - bullets.y[slot];
        const distSq = dx * dx + dy * dy;
        // Only those coming this way
        if (distSq < 9 && dx * bullets.vx[slot] + dy * bullets.vy[slot] > 0) {
            const weight = 1 / Math.max(distSq, 0.1);
            // Across its path, to whichever side it's already nearer
            const side = dx * bullets.vy[slot] - dy * bullets.vx[slot] >= 0 ? 1 : -1;
            awayX += bullets.vy[slot] * side * weight;
            awayY += -bullets.vx[slot] * side * weight;
        }
    }
    if (awayX === 0 && awayY === 0) {
        return undefined;
    }
    const length = Math.hypot(awayX, awayY);
    return { x: awayX / length, y: awayY / length };
}

// Away that way, or as near it as there's room (round the side, not into a wall or the boss
// square's edge), as a person circles out rather than backing into a corner
function openWay(sim: Sim, x: number, y: number): { x: number; y: number } {
    const player = sim.player;
    const square = sim.map.bossArena;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
        const cx = x * Math.cos(turn) - y * Math.sin(turn);
        const cy = x * Math.sin(turn) + y * Math.cos(turn);
        const tx = player.x + cx * 1.6;
        const ty = player.y + cy * 1.6;
        const inside =
            !square ||
            (tx > square.baseX + 0.6 &&
                tx < square.baseX + square.size - 0.6 &&
                ty > square.baseY + 0.6 &&
                ty < square.baseY + square.size - 0.6);
        if (inside && !sim.grid.isSolid(Math.floor(tx), Math.floor(ty))) {
            return { x: cx, y: cy };
        }
    }
    return { x, y };
}

type Strip = { x: number; y: number; dirX: number; dirY: number; half: number; length: number };

// Every lunge's strip winding up: the boss's (BossAttackDef.line), and what's copying it from
// where it stands (EnemyDef.echoes)
function lungeStrips(sim: Sim, boss: Enemy): Strip[] {
    const strips: Strip[] = [];
    const add = (enemy: Enemy, windup: BossWindup | undefined) => {
        const line = windup?.attack.line;
        if (windup && line) {
            const { dirX, dirY } = windup;
            strips.push({
                x: enemy.x,
                y: enemy.y,
                dirX,
                dirY,
                half: line.width / 2,
                length: line.length,
            });
        }
    };
    add(boss, boss.bossState?.windup);
    for (const enemy of sim.enemies) {
        if (!enemy.dead && enemy.echo) {
            add(enemy, enemy.echo);
        }
    }
    return strips;
}

// Out of two strips or more at once, to the nearest spot none reaches, as a person finds the
// pocket between them: nothing when it's in none already, or there's nowhere
function sharedPocket(
    sim: Sim,
    strips: Strip[],
    room: (x: number, y: number) => boolean,
): { x: number; y: number } | undefined {
    const player = sim.player;
    const inAny = (x: number, y: number, margin: number) =>
        strips.some((strip) => {
            const along = (x - strip.x) * strip.dirX + (y - strip.y) * strip.dirY;
            const side = (x - strip.x) * -strip.dirY + (y - strip.y) * strip.dirX;
            return (
                along > -1 &&
                along < strip.length + 0.5 &&
                Math.abs(side) < strip.half + player.radius + margin
            );
        });
    if (!inAny(player.x, player.y, 0.3)) {
        return undefined;
    }
    for (const reach of [0.8, 1.4, 2, 2.6, 3.4]) {
        for (let i = 0; i < 16; i++) {
            const angle = (i * Math.PI) / 8;
            const x = player.x + Math.cos(angle) * reach;
            const y = player.y + Math.sin(angle) * reach;
            if (
                room(x, y) &&
                !sim.grid.isSolid(Math.floor(x), Math.floor(y)) &&
                !inAny(x, y, 0.5)
            ) {
                return { x: Math.cos(angle), y: Math.sin(angle) };
            }
        }
    }
    return undefined;
}

// Off sparks about to land under it, in a fight in parts (Static, a lattice, a trail of its own
// steps, quicksand), or a rift still open: to the nearest spot clear of them all, or where it
// stands, just clear of one about to land. Undefined when it's clear of them.
function offMarks(
    sim: Sim,
    room: (x: number, y: number) => boolean,
): { x: number; y: number } | undefined {
    const player = sim.player;
    const marks = sim.hazards.filter(
        (hazard) =>
            hazard.attack.ground &&
            !hazard.attack.ground.smother &&
            (hazard.landTick >= sim.tick ||
                (hazard.lingerEnd > sim.tick && (hazard.attack.ground.lingers?.damage ?? 0) > 0)) &&
            !hazard.half,
    );
    const inMark = (x: number, y: number, margin: number) =>
        marks.some(
            (hazard) =>
                Math.hypot(x - hazard.x, y - hazard.y) < hazard.radius + player.radius + margin,
        );
    const under = marks.find(
        (hazard) =>
            Math.hypot(player.x - hazard.x, player.y - hazard.y) <
            hazard.radius + player.radius + 0.3,
    );
    if (under) {
        // Straight out of the one it's in first, then round from there
        const base = Math.atan2(player.y - under.y, player.x - under.x);
        for (const reach of [1.6, 2.4]) {
            for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
                const angle = base + turn;
                const x = player.x + Math.cos(angle) * reach;
                const y = player.y + Math.sin(angle) * reach;
                if (room(x, y) && !inMark(x, y, 0.5)) {
                    return { x: Math.cos(angle), y: Math.sin(angle) };
                }
            }
        }
    } else if (
        marks.some(
            (hazard) =>
                hazard.landTick >= sim.tick &&
                Math.hypot(player.x - hazard.x, player.y - hazard.y) <
                    hazard.radius + player.radius + 0.8,
        )
    ) {
        // Just clear of one about to land: wait for it here, rather than circle back in
        // (one that's landed and lingers is only to be kept out of)
        return { x: 0, y: 0 };
    }
    return undefined;
}

// Inside the boss's square, off its edges
function inSquare(sim: Sim): (x: number, y: number) => boolean {
    const square = sim.map.bossArena;
    return (x, y) =>
        !square ||
        (x > square.baseX + 0.6 &&
            x < square.baseX + square.size - 0.6 &&
            y > square.baseY + 0.6 &&
            y < square.baseY + square.size - 0.6);
}

// A phased boss's fight, as a careful person plays it, or undefined outside one. With DODGE it
// also keeps out of any boss's ground marks that hurt, phased or not.
// Without DODGE it only goes where the fight needs it to: the totems and the
// sleepwalkers, without which it can't be won at all.
function fightMove(sim: Sim): { x: number; y: number } | undefined {
    const boss = sim.shownBoss;
    const state = boss?.bossState;
    const phase = state?.phase;
    const player = sim.player;
    // Xarpus's exhumeds: stood on until they're smothered, or he can't be hurt (BossDef.exhumes)
    let mark: { x: number; y: number } | undefined;
    let markAway = Infinity;
    // And Verzik's yellows: into a pool before the ball gets there (GroundPatternDef.safe)
    for (const hazard of sim.hazards) {
        const away = Math.hypot(hazard.x - player.x, hazard.y - player.y);
        const ground = hazard.attack.ground;
        if ((ground?.smother || ground?.safe) && hazard.endTick !== -1 && away < markAway) {
            mark = hazard;
            markAway = away;
        }
    }
    if (mark) {
        return markAway < 0.5
            ? { x: 0, y: 0 }
            : { x: (mark.x - player.x) / markAway, y: (mark.y - player.y) / markAway };
    }
    // Out of the marks that hurt of a boss that isn't phased (the Maiden's blood, a slam about to
    // land), as a person steps out of them: a phased boss's are read below, lanes and all
    if (dodges && !phase) {
        for (const hazard of sim.hazards) {
            const ground = hazard.attack.ground;
            if (!ground || ground.safe || ground.smother) {
                continue;
            }
            const lingering = hazard.lingerEnd > sim.tick;
            const landing = hazard.landTick >= sim.tick;
            const dx = player.x - hazard.x;
            const dy = player.y - hazard.y;
            const away = Math.hypot(dx, dy);
            if ((lingering || landing) && away < hazard.radius + player.radius + 0.3) {
                return away > 0.001 ? { x: dx / away, y: dy / away } : { x: 1, y: 0 };
            }
        }
    }
    if (dodges && boss && !boss.dead && !phase) {
        const sidestep = sidestepBullets(sim);
        if (sidestep) {
            return sidestep;
        }
    }
    if (!boss || !state || !phase || boss.dead) {
        return undefined;
    }
    const towards = (x: number, y: number) => {
        const length = Math.max(0.001, Math.hypot(x - player.x, y - player.y));
        return { x: (x - player.x) / length, y: (y - player.y) / length };
    };
    if (dodges) {
        // A sandstorm over the room but at a boss's feet (BossAttackDef.outside): in to it first
        const storm = shelter(sim);
        if (storm) {
            return storm;
        }
        const lane = state.windup?.lane ?? state.surge?.lane;
        if (lane) {
            const dx = lane.toX - lane.fromX;
            const dy = lane.toY - lane.fromY;
            const length = Math.max(0.001, Math.hypot(dx, dy));
            const across = ((player.x - lane.fromX) * dy - (player.y - lane.fromY) * dx) / length;
            if (Math.abs(across) < lane.halfWidth + 1) {
                const side = across >= 0 ? 1 : -1;
                return { x: (dy / length) * side, y: (-dx / length) * side };
            }
        }
        const gap = wallGap(sim) ?? cageGap(sim);
        if (gap) {
            return gap;
        }
        // A pair of bosses fought together (enrage.partner: the Scarab Mages): the beam between
        // them, the other's blasts, the elder's sinking sand, the bolts they aim. A caster on its
        // own that keeps its distance (the Champion): the bolts it aims.
        const clear = boss.def.boss?.enrage.partner
            ? (offTether(sim) ??
              offMarks(sim, inSquare(sim)) ??
              otherBlasts(sim) ??
              outOfPool(sim) ??
              dodgeShots(sim))
            : boss.def.boss?.keepDistance !== undefined
              ? dodgeShots(sim)
              : undefined;
        if (clear) {
            return clear;
        }
        const quarters = sim.quarters;
        if (quarters) {
            return towards(
                quarters.x + (quarters.safe & 1 ? 3 : -3),
                quarters.y + (quarters.safe & 2 ? 3 : -3),
            );
        }
        // Off a lunge's strip, out of a square blast, off a wave's or a thrown sword's line, as a
        // person reads them (BossAttackDef.line, square, wave, boomerang): the near side, unless
        // that's into the square's edge
        const windup = state.windup;
        const square = sim.map.bossArena;
        const room = (x: number, y: number) =>
            !square ||
            (x > square.baseX + 0.6 &&
                x < square.baseX + square.size - 0.6 &&
                y > square.baseY + 0.6 &&
                y < square.baseY + square.size - 0.6);
        const across = (x: number, y: number, dirX: number, dirY: number, half: number) => {
            const along = (player.x - x) * dirX + (player.y - y) * dirY;
            const side = (player.x - x) * -dirY + (player.y - y) * dirX;
            if (along <= -1 || Math.abs(side) >= half + 0.8) {
                return undefined;
            }
            let sign = side >= 0 ? 1 : -1;
            const clear = half + 0.8 - Math.abs(side);
            if (!room(player.x - dirY * sign * clear, player.y + dirX * sign * clear)) {
                sign = -sign;
            }
            return { x: -dirY * sign, y: dirX * sign };
        };
        // A lunge or a thrown line first: they hit harder than a bullet. With a copy of it coming
        // too (EnemyDef.echoes: the Akh's shadow), two strips at once: to where neither reaches
        const strips = lungeStrips(sim, boss);
        if (strips.length > 1) {
            const step = sharedPocket(sim, strips, room);
            if (step) {
                return step;
            }
        } else if (strips.length === 1) {
            const strip = strips[0];
            const step = across(strip.x, strip.y, strip.dirX, strip.dirY, strip.half);
            if (step) {
                return step;
            }
        }
        if (windup && (windup.attack.wave || windup.attack.boomerang)) {
            const half = windup.attack.radius ?? 0.35;
            const lines = windup.from
                ? windup.from.map((s) => {
                      const x = s.x + (s.size ?? 1) / 2;
                      const y = s.y + (s.size ?? 1) / 2;
                      const t = windup.targets[0];
                      const l = Math.max(0.001, Math.hypot(t.x - x, t.y - y));
                      return { x, y, dirX: (t.x - x) / l, dirY: (t.y - y) / l };
                  })
                : [{ x: boss.x, y: boss.y, dirX: windup.dirX, dirY: windup.dirY }];
            for (const line of lines) {
                const step = across(line.x, line.y, line.dirX, line.dirY, half);
                if (step) {
                    return step;
                }
            }
        }
        const sidestep = dodgeOrbs(sim) ?? sidestepBullets(sim);
        if (sidestep) {
            return sidestep;
        }
        if (windup?.attack.square) {
            const half = windup.attack.square / 2 + 0.7;
            for (const spot of windup.targets) {
                const dx = player.x - spot.x;
                const dy = player.y - spot.y;
                if (Math.abs(dx) < half && Math.abs(dy) < half) {
                    return Math.abs(dx) > Math.abs(dy)
                        ? { x: Math.sign(dx) || 1, y: 0 }
                        : { x: 0, y: Math.sign(dy) || 1 };
                }
            }
        }
        // Out of a long wedge sideways, not back down it (BossAttackDef.cone): beside the boss is
        // nearer than its end
        const cone = windup?.attack.kind === "swing" ? windup.attack.cone : undefined;
        if (windup && cone !== undefined && (windup.attack.radius ?? 2) > 4) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const away = Math.max(0.001, Math.hypot(dx, dy));
            const along = (dx * windup.dirX + dy * windup.dirY) / away;
            if (away < (windup.attack.radius ?? 2) + 0.8 && along > Math.cos(cone / 2 + 0.35)) {
                const side = dx * -windup.dirY + dy * windup.dirX >= 0 ? 1 : -1;
                return openWay(sim, -windup.dirY * side, windup.dirX * side);
            }
        }
        // Off sparks about to land under it, in a fight in parts (Static, a lattice, a trail of
        // its own steps), or a rift still open, before anything that keeps it moving round the
        // boss: to the nearest spot clear of them all
        if (sim.map.stages) {
            const step = offMarks(sim, room);
            if (step) {
                return step;
            }
        }
        // Out of a swing's reach round the boss, and off where a blast's to land, as it winds up:
        // what anyone steps out of
        if (windup?.attack.kind === "swing") {
            const reach = (windup.attack.radius ?? 2) + player.radius + 0.5;
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const away = Math.hypot(dx, dy);
            if (away < reach) {
                return openWay(sim, away > 0.001 ? dx / away : 1, away > 0.001 ? dy / away : 0);
            }
        }
        if (windup?.attack.kind === "blast") {
            const reach = (windup.attack.radius ?? 1) + player.radius + 0.5;
            for (const spot of windup.targets) {
                const dx = player.x - spot.x;
                const dy = player.y - spot.y;
                const away = Math.hypot(dx, dy);
                if (away < reach) {
                    return away > 0.001 ? { x: dx / away, y: dy / away } : { x: 1, y: 0 };
                }
            }
        }
        for (const projectile of sim.enemyProjectiles) {
            if (!projectile.hit) {
                continue;
            }
            const speed = Math.max(0.001, Math.hypot(projectile.vx, projectile.vy));
            const step = across(
                projectile.x,
                projectile.y,
                projectile.vx / speed,
                projectile.vy / speed,
                projectile.radius,
            );
            if (step) {
                return step;
            }
        }
        // Out of the boss's sight behind a pillar, as it gazes (BossAttackDef.cover): the nearest
        // spot within reach that's hidden from it
        const pillars = sim.map.features?.pillars;
        if (state.windup?.attack.cover && pillars) {
            let best: { x: number; y: number } | undefined;
            let bestDistance = Infinity;
            for (let dy = -10; dy <= 10; dy++) {
                for (let dx = -10; dx <= 10; dx++) {
                    const x = Math.floor(player.x) + dx + 0.5;
                    const y = Math.floor(player.y) + dy + 0.5;
                    const distance = Math.hypot(dx, dy);
                    if (
                        distance < bestDistance &&
                        !sim.grid.isSolid(Math.floor(x), Math.floor(y)) &&
                        !pillars.some(
                            (p) =>
                                x > p.x - 0.5 &&
                                x < p.x + p.size + 0.5 &&
                                y > p.y - 0.5 &&
                                y < p.y + p.size + 0.5,
                        ) &&
                        behindPillar(pillars, boss.x, boss.y, x, y)
                    ) {
                        best = { x, y };
                        bestDistance = distance;
                    }
                }
            }
            if (best) {
                return Math.hypot(best.x - player.x, best.y - player.y) < 0.3
                    ? { x: 0, y: 0 }
                    : towards(best.x, best.y);
            }
        }
        // A fight in parts (Beneath Cursed Sands): round a boss that's close, not straight away from
        // it, pulled back towards the square's middle, as a ranged player kites a melee boss and
        // never backs into a corner
        const close = Math.hypot(player.x - boss.x, player.y - boss.y);
        if (sim.map.stages && square && close < 5) {
            const ax = (player.x - boss.x) / Math.max(close, 0.001);
            const ay = (player.y - boss.y) / Math.max(close, 0.001);
            const mx = square.baseX + square.size / 2 - player.x;
            const my = square.baseY + square.size / 2 - player.y;
            const middle = Math.max(Math.hypot(mx, my), 0.001);
            const x = ax * 0.7 - ay * 0.8 + (mx / middle) * 0.6;
            const y = ay * 0.7 + ax * 0.8 + (my / middle) * 0.6;
            const length = Math.max(Math.hypot(x, y), 0.001);
            return { x: x / length, y: y / length };
        }
        for (const hazard of sim.hazards) {
            // A checker's cell (GroundHazard.half), once it's shown: off it the short way
            const half = hazard.half;
            if (half) {
                const dx = player.x - hazard.x;
                const dy = player.y - hazard.y;
                if (
                    sim.tick >= hazard.startTick &&
                    Math.abs(dx) < half + 0.6 &&
                    Math.abs(dy) < half + 0.6
                ) {
                    return Math.abs(dx) > Math.abs(dy)
                        ? { x: Math.sign(dx) || 1, y: 0 }
                        : { x: 0, y: Math.sign(dy) || 1 };
                }
                continue;
            }
            const away = Math.hypot(player.x - hazard.x, player.y - hazard.y);
            if (away < hazard.radius + 1.2) {
                return towards(
                    player.x + (player.x - hazard.x) / Math.max(0.001, away),
                    player.y + (player.y - hazard.y) / Math.max(0.001, away),
                );
            }
        }
    }
    // A less careful person: now and then backs off and loses reach
    if (sloppy && (sim.tick / TICKS_PER_SECOND) % SLOPPY_EVERY < SLOPPY_LAPSE) {
        const away = towards(boss.x, boss.y);
        return { x: -away.x, y: -away.y };
    }
    // In to use the fight's button while the boss's guard is down (BossDef.guard), if it's ready:
    // of two fought together (the Scarab Mages), the nearer one with its guard down, a spell it's
    // channelling to break (BossAttackDef.channel)
    const ability = sim.map.fight?.ability;
    const open = exposedBoss(sim);
    if (
        smites &&
        ability &&
        open &&
        sim.abilitySecondsLeft() === 0 &&
        Math.hypot(open.x - player.x, open.y - player.y) > ability.reach - 0.5
    ) {
        return towards(open.x, open.y);
    }
    // A weapon that reaches only so far (MapDef.fight.strikeReach): back in reach of him
    const reach = sim.map.fight?.strikeReach;
    if (reach !== undefined && Math.hypot(boss.x - player.x, boss.y - player.y) > reach - 1.5) {
        return towards(boss.x, boss.y);
    }
    // A fight in parts: back from the square's edges before they're a corner to be caught in,
    // away from the boss as it goes, as a person keeps room to step either way
    const square = sim.map.bossArena;
    if (dodges && sim.map.stages && square) {
        const mx = square.baseX + square.size / 2 - player.x;
        const my = square.baseY + square.size / 2 - player.y;
        const middle = Math.hypot(mx, my);
        if (middle > square.size * 0.3) {
            const away = Math.max(0.001, Math.hypot(player.x - boss.x, player.y - boss.y));
            const x = mx / middle + ((player.x - boss.x) / away) * 0.5;
            const y = my / middle + ((player.y - boss.y) / away) * 0.5;
            const length = Math.max(0.001, Math.hypot(x, y));
            return { x: x / length, y: y / length };
        }
    }
    let target: { x: number; y: number } | undefined;
    let nearest = Infinity;
    const consider = (enemy: { x: number; y: number }) => {
        // Under the rule (LightingDef.litTargetsOnly), only what's lit; everywhere else, everything
        if (!sim.isLit(enemy.x, enemy.y)) {
            return;
        }
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance < nearest) {
            nearest = distance;
            target = enemy;
        }
    };
    if (state.walkers) {
        state.walkers.enemies.filter((e) => !e.dead).forEach(consider);
    } else if (phase.stage === "totems") {
        phase.totems.filter((t) => t.hp > 0).forEach(consider);
    } else if (sim.weapons.every((w) => w.def.kind === "slash" || w.def.kind === "sweep")) {
        // With nothing but melee (the Inquisitor against Phosani's Nightmare) the
        // shield has to be hit from up close, so it walks up to her and takes
        // what comes
        consider(boss);
    }
    if (target) {
        // Close enough for short weapons, then it just stays there
        return nearest < 2 ? { x: 0, y: 0 } : towards(target.x, target.y);
    }
    return undefined;
}

// A fight's button (MapDef.fight.ability), pressed while the boss's guard is down and it'd land
function useAbility(sim: Sim): void {
    // A sloppy one only sees the chance every other second
    const sees = !sloppy || Math.floor(sim.tick / TICKS_PER_SECOND) % 2 === 0;
    const target = sees && smites && sim.map.fight?.ability ? sim.abilityTarget() : undefined;
    if (target && sim.isExposed(target)) {
        sim.useAbility();
    }
}

// The nearest boss with its guard down, or undefined
function exposedBoss(sim: Sim): Enemy | undefined {
    const player = sim.player;
    let best: Enemy | undefined;
    let away = Infinity;
    for (const enemy of sim.enemies) {
        if (!enemy.boss || enemy.dead || !sim.isExposed(enemy)) {
            continue;
        }
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance < away) {
            best = enemy;
            away = distance;
        }
    }
    return best;
}

// In under a boss's sandstorm, to the shelter at its feet (BossAttackDef.outside), and there
// stepping only round the bullets that stay inside it; undefined with none coming
function shelter(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const enemy of sim.enemies) {
        const outside = enemy.bossState?.windup?.attack.outside;
        if (enemy.dead || outside === undefined) {
            continue;
        }
        const away = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        const safe = outside - 1;
        if (away > safe) {
            return { x: (enemy.x - player.x) / away, y: (enemy.y - player.y) / away };
        }
        const step = sidestepBullets(sim);
        if (
            step &&
            Math.hypot(player.x + step.x - enemy.x, player.y + step.y - enemy.y) < outside - 0.6
        ) {
            return step;
        }
        return { x: 0, y: 0 };
    }
    return undefined;
}

// Works out what to press for a shuffled direction, as a person soon does
function uncursed(sim: Sim, move: { x: number; y: number }): { x: number; y: number } {
    const curse = sim.curse;
    if (!curse) {
        return move;
    }
    // They're all rotations and mirrors, so the inverse is the transpose
    const [a, b, c, d] = curse.matrix;
    return { x: move.x * a + move.y * c, y: move.x * b + move.y * d };
}

// Buys the dearest power-up it can until there's none it can, and knows the
// answer to every question
// How long a run can go: two minutes past the final boss's time
function runSeconds(): number {
    // The Tombs: as long as a slow raid takes
    if (map.tombs) {
        return 90 * 60;
    }
    const rooms = map.raid?.rooms;
    return (rooms ? rooms[rooms.length - 1].at : RUN_LENGTH) + 120;
}

function eventChoice(sim: Sim): number {
    const options = sim.offer?.options ?? [];
    let best = -1;
    let bestPrice = -1;
    options.forEach((option, index) => {
        if (option.kind === "teleport" || option.kind === "bundle") {
            return;
        }
        if (option.kind === "answer") {
            if (option.correct) {
                best = index;
            }
        } else if (
            !option.sold &&
            option.price <= (option.kind === "supply" ? sim.raidPoints : sim.coins) &&
            option.price > bestPrice
        ) {
            best = index;
            bestPrice = option.price;
        }
    });
    return best;
}

function runOnce(characterId: string, seed: number) {
    const sim = new Sim({
        grid,
        characterId,
        metaStats,
        seed,
        mapId: map.id,
        spawnX: map.spawn.x,
        spawnY: map.spawn.y,
        unlockedItems,
        endless,
        hard,
        expert,
        armoury,
        invocations,
        // A fight in parts (MapDef.stages): which, STAGE=0 for the first
        stage: parseInt(process.env.STAGE ?? "0"),
    });
    // Another weapon to start with, to compare weapons on one character
    if (process.env.WEAPON) {
        sim.weapons = [];
        sim.addWeapon(process.env.WEAPON);
    }
    const maxTicks =
        (minutesArg ? parseFloat(minutesArg) * 60 : endless ? 90 * 60 : runSeconds()) *
        TICKS_PER_SECOND;
    // A raid's rooms: when each boss turned up and went down
    let raidStage = sim.raidStage;
    let bossTick = 0;
    let nextReport = REPORT_SECONDS;
    let stuckTicks = 0;
    let lastX = sim.player.x;
    let lastY = sim.player.y;
    let move = { x: 0, y: 0 };
    let chests = 0;
    let powerUps = 0;
    const started = new Set<string>();
    const finished = new Set<string>();
    const recentHits: { tick: number; event: SimEvent }[] = [];
    const startTime = performance.now();
    if (fresh && finalBoss) {
        sim.startIntro(getEnemy(finalBoss), "finalBoss");
    }
    let fightTicks = 0;
    // A boss's finale (its last stand), counted on its own, not in its last phase
    let finaleTicks = 0;
    // A phased fight's time in each phase, and how much of it the boss was in a reach-limited
    // weapon's reach (MapDef.fight.strikeReach)
    const phaseTicks: number[] = [];
    const reachTicks: number[] = [];
    const tombsLog = sim.map.tombs ? new TombsLog() : undefined;
    // Several bosses at once (the Scarab Mages): when each came, changed phase, was enraged and fell
    const bossLog = new Map<
        number,
        { id: string; from: number; phases: number[]; enraged?: number; down?: number }
    >();
    // How many of each walking swarm got to its boss (BossAttackDef summon.walkTo)
    const absorbed: number[] = [];
    const broken: string[] = [];
    // Each of the shown boss's exhumes (BossDef.exhumes): how long, and how many were left
    const ordeals: { from: number; seconds?: number; left?: number }[] = [];
    let ordealLeft = 0;
    while (sim.tick < maxTicks && !sim.runOver) {
        tombsLog?.step(sim);
        if (sim.state === "levelUp") {
            const ranked = sim.choices
                .map((choice, index) => ({ choice, index }))
                .sort((a, b) => choiceScore(a.choice) - choiceScore(b.choice));
            // As a player who's found their weapon: its next level whenever it's offered
            const best =
                process.env.FUNNEL === "1"
                    ? [...sim.weapons].sort((a, b) => b.bonus - a.bonus || b.level - a.level)[0]
                    : undefined;
            const funnel = sim.choices.findIndex(
                (choice) => choice.kind === "weaponLevel" && choice.weaponId === best?.def.id,
            );
            sim.choose(funnel >= 0 ? funnel : ranked[0].index);
            continue;
        }
        if (sim.state === "chest") {
            chests++;
            sim.resolveChest(chestAction(sim));
            for (const itemId of Object.values(sim.gear)) {
                const set = getGear(itemId).set;
                if (set !== undefined) {
                    started.add(set);
                }
            }
            for (const set of sim.activeSets) {
                finished.add(set);
            }
            continue;
        }
        if (sim.raidStage !== raidStage) {
            if (sim.raidStage === "boss") {
                bossTick = sim.tick;
            } else if (raidStage === "boss") {
                const seconds = Math.round((sim.tick - bossTick) / TICKS_PER_SECOND);
                console.log(
                    `  room ${sim.raidRoom + 1}: ${sim.map.raid!.rooms[sim.raidRoom].boss} down in ${seconds}s, ` +
                        `${sim.raidPoints} raid points`,
                );
            }
            raidStage = sim.raidStage;
        }
        if (sim.state === "event") {
            const choice = eventChoice(sim);
            if (choice === -1 || !sim.chooseEventOption(choice)) {
                sim.leaveEvent();
            }
            continue;
        }
        if (sim.tick % 25 === 0) {
            useItems(sim);
        }
        // The Tombs' bot steers every tick: plates and mirrors want it exact
        const planned = tombsMove(sim);
        if (planned) {
            move = planned;
        } else if (sim.tick % 5 === 0) {
            move = fightMove(sim) ?? botMove(sim);
            // Stuck against a wall: wiggle sideways for a moment
            if (Math.hypot(sim.player.x - lastX, sim.player.y - lastY) < 0.05) {
                stuckTicks += 5;
            } else {
                stuckTicks = 0;
            }
            if (stuckTicks > 15) {
                const side = (sim.tick / 50) % 2 < 1 ? 1 : -1;
                move = { x: -move.y * side, y: move.x * side };
            }
            lastX = sim.player.x;
            lastY = sim.player.y;
        }
        if (process.env.SAFE_WAVES === "1" && !sim.bossSpawned) {
            sim.player.hp = sim.player.maxHp;
        }
        if (process.env.GOD === "1") {
            // Untouchable, as a late endless round's hits are bigger than any health bar
            sim.player.invulnerable = 1e9;
        }
        useAbility(sim);
        const pressed = uncursed(sim, move);
        sim.step(pressed.x, pressed.y);
        for (const enemy of sim.enemies) {
            const state = enemy.bossState;
            if (!enemy.boss || !state || enemy.leaving) {
                continue;
            }
            let log = bossLog.get(enemy.uid);
            if (!log) {
                log = { id: enemy.def.id, from: sim.tick, phases: [] };
                bossLog.set(enemy.uid, log);
            }
            const index = state.phase?.index ?? 0;
            if (index > log.phases.length) {
                log.phases.push(sim.tick);
            }
            if (state.enraged && log.enraged === undefined) {
                log.enraged = sim.tick;
            }
            if (enemy.dead && log.down === undefined) {
                log.down = sim.tick;
            }
        }
        const ordeal = sim.shownBoss?.bossState?.ordeal;
        const lastOrdeal = ordeals[ordeals.length - 1];
        if (ordeal && sim.shownBoss?.def.boss?.exhumes) {
            if (!lastOrdeal || lastOrdeal.seconds !== undefined) {
                ordeals.push({ from: sim.tick });
            }
            ordealLeft = ordeal.left;
        } else if (lastOrdeal && lastOrdeal.seconds === undefined) {
            lastOrdeal.seconds = (sim.tick - lastOrdeal.from) / TICKS_PER_SECOND;
            lastOrdeal.left = ordealLeft;
        }
        const fighting = sim.shownBoss?.bossState?.phase;
        if (fighting) {
            fightTicks++;
            const at = fighting.index;
            if (fighting.stage === "finale") {
                finaleTicks++;
            } else {
                phaseTicks[at] = (phaseTicks[at] ?? 0) + 1;
            }
            const boss = sim.shownBoss!;
            const reach = sim.map.fight?.strikeReach;
            if (
                reach !== undefined &&
                Math.hypot(boss.x - sim.player.x, boss.y - sim.player.y) <= reach
            ) {
                reachTicks[at] = (reachTicks[at] ?? 0) + 1;
            }
        }
        for (const event of sim.takeEvents()) {
            if (event.type === "playerHit") {
                recentHits.push({ tick: sim.tick, event });
            } else if (event.type === "powerUp") {
                powerUps++;
            } else if (event.type === "bossAbsorbBlast") {
                absorbed.push(event.absorbed);
            } else if (event.type === "bossGuard" && event.cause.endsWith(" (broken)")) {
                // A channelled spell broken by the fight's button (BossAttackDef.channel)
                broken.push(event.cause.slice(0, -" (broken)".length));
            }
        }
        while (recentHits.length > 0 && recentHits[0].tick < sim.tick - 30 * TICKS_PER_SECOND) {
            recentHits.shift();
        }
        if (sim.seconds >= nextReport) {
            nextReport += REPORT_SECONDS;
            const alive = sim.enemies.filter((e) => !e.dead).length;
            const weapons = sim.weapons.map((w) => `${w.def.id}:${w.level}`).join(" ");
            const passives = sim.passives.map((p) => `${p.id}:${p.level}`).join(" ");
            const gear = Object.values(sim.gear).join(" ");
            console.log(
                `  ${formatClock(sim.seconds)}${endless ? ` r${sim.round}` : ""}  lvl ${String(sim.level).padStart(2)}  ` +
                    `hp ${String(Math.max(0, Math.round(sim.player.hp))).padStart(3)}/${sim.player.maxHp}  ` +
                    `kills ${String(sim.kills).padStart(5)}  alive ${String(alive).padStart(3)}  ` +
                    `coins ${String(sim.coins).padStart(4)}  ${weapons} | ${passives} | ${gear}`,
            );
            if (endless) {
                // How the best weapon's damage keeps up with the round's hitpoints: a
                // ratio that climbs round on round means the player outgrows the run
                const best = Math.max(...sim.weapons.map((w) => 1 + w.bonus));
                console.log(
                    `    best weapon x${best.toExponential(2)}, enemy hp x${sim.roundHp.toExponential(2)}, ` +
                        `ratio ${(best / sim.roundHp).toExponential(2)}`,
                );
            }
        }
    }
    if (sim.state === "dead") {
        // What did the damage in the last 30 seconds
        const byEnemy = new Map<string, number>();
        for (const { event } of recentHits) {
            if (event.type === "playerHit") {
                const key = event.enemyId + (event.elite ? " (elite)" : "");
                byEnemy.set(key, (byEnemy.get(key) ?? 0) + event.amount);
            }
        }
        const sorted = [...byEnemy.entries()].sort((a, b) => b[1] - a[1]);
        console.log(
            "  damage taken in the last 30s: " + sorted.map(([k, v]) => `${k} ${v}`).join(", "),
        );
    }
    const fight = sim.shownBoss?.bossState?.phase;
    if (fightTicks > 0) {
        console.log(
            `  fight: ${(fightTicks / TICKS_PER_SECOND).toFixed(0)}s, ` +
                (fight ? `phase ${fight.index + 1} ${fight.stage}, ` : "") +
                `maxHp ${sim.player.maxHp}, armour ${sim.stats.armor}, ` +
                `taken ${sim.damageTaken}, dps ${Math.round(sim.dps)}`,
        );
        if (phaseTicks.length > 1 || sim.map.fight?.strikeReach !== undefined) {
            console.log(
                "  phases: " +
                    phaseTicks
                        .map(
                            (ticks, i) =>
                                `${i + 1} ${(ticks / TICKS_PER_SECOND).toFixed(0)}s` +
                                (sim.map.fight?.strikeReach !== undefined
                                    ? ` (${Math.round((100 * (reachTicks[i] ?? 0)) / ticks)}% in reach)`
                                    : ""),
                        )
                        .join(", ") +
                    (finaleTicks > 0
                        ? `, last stand ${(finaleTicks / TICKS_PER_SECOND).toFixed(0)}s`
                        : ""),
            );
        }
        if (bossLog.size > 1) {
            const at = (tick: number) => `${(tick / TICKS_PER_SECOND).toFixed(0)}s`;
            console.log(
                "  bosses: " +
                    [...bossLog.values()]
                        .map(
                            (log) =>
                                `${log.id} from ${at(log.from)}` +
                                log.phases
                                    .map((tick, i) => `, phase ${i + 2} at ${at(tick)}`)
                                    .join("") +
                                (log.enraged !== undefined
                                    ? `, furious at ${at(log.enraged)}`
                                    : "") +
                                (log.down !== undefined ? `, down at ${at(log.down)}` : ""),
                        )
                        .join("; ") +
                    (absorbed.length > 0
                        ? `; walkers absorbed by each blast ${absorbed.join(", ")}`
                        : "") +
                    (broken.length > 0 ? `; spells broken: ${broken.join(", ")}` : ""),
            );
        }
        if (ordeals.length > 0) {
            console.log(
                "  exhumes: " +
                    ordeals
                        .map((o) =>
                            o.seconds === undefined
                                ? "unfinished"
                                : `${o.seconds.toFixed(0)}s, ${o.left} left`,
                        )
                        .join("; "),
            );
        }
        // Which of the boss's attacks did it, over the whole fight
        const byAttack = Object.entries(sim.damageByAttack).sort((a, b) => b[1] - a[1]);
        if (byAttack.length > 0) {
            console.log(
                "  boss attacks that hit: " + byAttack.map(([k, v]) => `${k} ${v}`).join(", "),
            );
        }
    }
    const result = sim.getResult();
    tombsLog?.report(sim);
    const ms = performance.now() - startTime;
    runs++;
    for (const set of started) {
        setsStarted.set(set, (setsStarted.get(set) ?? 0) + 1);
    }
    for (const set of finished) {
        setsFinished.set(set, (setsFinished.get(set) ?? 0) + 1);
    }
    if (started.size > 0) {
        console.log(
            `  sets: ${[...started].map((s) => s + (finished.has(s) ? " (bonus)" : "")).join(", ")}`,
        );
    }
    console.log(
        `${characterId} seed ${seed}: ${result.victory ? "VICTORY" : sim.state === "dead" ? "died" : "timed out"} at ` +
            `${Math.floor(result.seconds / 60)}:${String(Math.floor(result.seconds % 60)).padStart(2, "0")}, ` +
            (endless ? `round ${result.round}, ` : "") +
            `level ${result.level}, ${result.kills} kills, ${result.coins} coins, ${chests} caskets, ` +
            `${powerUps} power-ups ` +
            `(${(ms / sim.tick).toFixed(3)}ms per tick)`,
    );
    return result;
}

// A co-op run, the bot deciding for each player whenever the run waits on
// them, and moving each as it would on their own
function runParty(characterId: string, seed: number) {
    const sim = new Sim({
        grid,
        characterId,
        metaStats,
        seed,
        mapId: map.id,
        spawnX: map.spawn.x,
        spawnY: map.spawn.y,
        endless,
        hard,
        expert,
        invocations,
        party: Array.from({ length: partySize }, (_, i) => ({
            name: "bot" + (i + 1),
            characterId,
            metaStats,
            unlockedItems,
            armoury,
        })),
    });
    const maxTicks = (endless ? 90 * 60 : runSeconds()) * TICKS_PER_SECOND;
    const moves = sim.heroes.map(() => ({ x: 0, y: 0 }));
    let firstDown: number | undefined;
    let fightTicks = 0;
    const tombsLog = sim.map.tombs ? new TombsLog() : undefined;
    while (sim.tick < maxTicks && !sim.runOver) {
        tombsLog?.step(sim);
        if (sim.state !== "playing") {
            for (const hero of sim.waitingOn) {
                sim.as(hero.index, () => {
                    if (sim.state === "levelUp") {
                        const ranked = sim.choices
                            .map((choice, index) => ({ choice, index }))
                            .sort((a, b) => choiceScore(a.choice) - choiceScore(b.choice));
                        sim.choose(ranked[0].index);
                    } else if (sim.state === "chest") {
                        sim.resolveChest(chestAction(sim));
                    } else {
                        const choice = eventChoice(sim);
                        if (choice === -1 || !sim.chooseEventOption(choice)) {
                            sim.leaveEvent();
                        }
                    }
                });
            }
            continue;
        }
        for (const hero of sim.heroes) {
            if (hero.down || hero.left) {
                continue;
            }
            sim.as(hero.index, () => {
                if (sim.tick % 25 === 0) {
                    useItems(sim);
                }
                const planned = tombsMove(sim);
                if (planned) {
                    moves[hero.index] = planned;
                } else if (sim.tick % 5 === 0) {
                    moves[hero.index] = fightMove(sim) ?? botMove(sim);
                }
                useAbility(sim);
                const pressed = uncursed(sim, moves[hero.index]);
                sim.setInput(hero.index, pressed.x, pressed.y);
            });
        }
        sim.step();
        if (sim.shownBoss?.bossState?.phase) {
            fightTicks++;
        }
        for (const event of sim.takeEvents()) {
            if (event.type === "heroDown") {
                firstDown ??= sim.seconds;
            }
        }
    }
    const result = sim.getResult();
    const gear = sim.heroes.map((hero) => Object.keys(hero.gear).length);
    const outcome = result.victory ? "VICTORY" : sim.state === "dead" ? "died" : "timed out";
    runs++;
    console.log(
        characterId +
            " seed " +
            seed +
            " party of " +
            partySize +
            ": " +
            outcome +
            " at " +
            formatClock(result.seconds) +
            ", level " +
            result.level +
            ", " +
            result.kills +
            " kills, first down " +
            (firstDown === undefined ? "never" : formatClock(firstDown)) +
            ", worn gear " +
            (gear.reduce((a, b) => a + b, 0) / gear.length).toFixed(1) +
            " each" +
            (fightTicks > 0 ? ", fight " + (fightTicks / TICKS_PER_SECOND).toFixed(0) + "s" : ""),
    );
}

for (const characterId of characters) {
    for (let seed = 1; seed <= seeds; seed++) {
        if (partySize > 1) {
            runParty(characterId, seed);
            continue;
        }
        console.log(`\n${characterId} seed ${seed}`);
        runOnce(characterId, seed);
    }
}
if (setsStarted.size > 0) {
    const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    console.log(
        `\nSets started in ${runs} runs: ${total(setsStarted)}, finished: ${total(setsFinished)} ` +
            `(${[...setsStarted].map(([set, n]) => `${set} ${setsFinished.get(set) ?? 0}/${n}`).join(", ")})`,
    );
}

function formatClock(seconds: number): string {
    const s = Math.round(seconds);
    return `${String(Math.floor(s / 60)).padStart(2)}:${String(s % 60).padStart(2, "0")}`;
}
