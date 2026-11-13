// Plays runs with a simple bot on the real arena (collision from a snapshot of
// the cache, see collision-snapshot.ts) and prints how they go, for balancing waves, weapons and the XP curve.
//
//   bun run tsx scripts/game/simulate-run.ts                 # every character once
//   bun run tsx scripts/game/simulate-run.ts wizard 3        # one character, 3 seeds
//   bun run tsx scripts/game/simulate-run.ts wizard,monk 3   # some characters
//   bun run tsx scripts/game/simulate-run.ts "" 2 5          # everyone, 2 seeds, 5 minutes
//   MAP=barrows bun run tsx scripts/game/simulate-run.ts     # another map (Lumbridge by default)
//   UNLOCKS=none bun run tsx scripts/game/simulate-run.ts    # nothing from map tasks (all by default)
//   META=max bun run tsx scripts/game/simulate-run.ts        # every shop upgrade bought (none by default)
//   ARMOURY=max bun run tsx scripts/game/simulate-run.ts     # all gear upgraded in the Armoury (none by default)
//   ENDLESS=1 bun run tsx scripts/game/simulate-run.ts       # an endless run (up to 90 minutes)
//   HARD=1 bun run tsx scripts/game/simulate-run.ts          # on hard mode
//   PET=butch bun run tsx scripts/game/simulate-run.ts       # with a fighting pet along
//   EXPERT=1 MAP=theatre_of_blood ...  # a raid's expert mode (hard, and the Nylocas's colours)
//   WEAPON=crystal_bow bun run tsx scripts/game/simulate-run.ts ranger  # start with this weapon instead
//   FINAL_BOSS=the_nightmare BOSS_ARENA=48 bun run tsx ...   # another final boss, on a square of the map
//   FRESH=1 ...                                          # straight to it with nothing upgraded
//   DODGE=1 ...     # also keeps off what any boss marks on the ground, sidesteps its bullets and
//                   # makes for a closing ring's way out
//   FLAT=1 ...      # the map's arena with nothing in it: no walls in the bot's way, no cache needed
//   STAGE=1 ...     # a fight in parts (MapDef.stages): the second, as a run that's won the first
//   SAFE_WAVES=1 ... # can't die before the final boss: it gets there with what the run earned
//   GOD=1 ...        # can't die at all: with ENDLESS=1, how damage keeps up with the rounds
//   FUNNEL=1 ...     # always takes its best weapon's next level when it's offered
//   SMITE=0 ...      # never presses a fight's button (MapDef.fight.ability); by default it does
//                    # whenever the boss's guard is down (BossDef.guard) and it's in reach
//   MAP=tombs_of_amascut ...   # the Tombs of Amascut, the whole raid (tombsBot.ts)
//   INVOCATIONS=run_glass_cannon,run_blood_moon MAP=desert ...  # a run's invocations, on a map
//                                          # from the Desert on (INVOCATIONS=all for all nine;
//                                          # HARD=1 is hard mode's preset)
//   RELICS=trickster,globetrotter ...      # relics on (content/relics.ts)
//   INVOCATIONS=walk_for_it,insanity ...   # its invocations (INVOCATIONS=all for every one the
//                                          # board allows: one of a group that's one at a time)
//   GAUNTLET=1 DODGE=1 ...  # the Forgotten Four, all four fights chained (runGauntlet: ORDER=,
//                           # RETRIES=3, HARD=1, BLESS=best|none); the seeds are runs
//   SLOPPY=1 ...     # plays a phased fight as a less careful person: backs off from the boss 3 s
//                    # in every 10 (out of a reach-limited weapon's reach), and misses about
//                    # half the chances to use the fight's button
//   REACT=0.25 ...   # moves as a person reacts: each step it decides is taken this many seconds
//                    # later (by default the tick a boss's windup starts)
//   FROM=101 ...     # the first seed (1 by default), to split a long sweep across processes
import { getUpgradeLine } from "../../src/game/content/armoury";
import { CHARACTERS } from "../../src/game/content/characters";
import { getEnemy } from "../../src/game/content/enemies";
import {
    BLESSINGS,
    BLESSING_BY_ID,
    BlessingId,
    GAUNTLET_FIGHTS,
    GauntletFightOptions,
} from "../../src/game/content/gauntlet";
import { INVOCATIONS, RUN_INVOCATIONS } from "../../src/game/content/invocations";
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
import {
    GauntletRun,
    chooseBlessing,
    gauntletFightId,
    gauntletFightOptions,
    gauntletRetries,
    gauntletSeconds,
    isGauntletClean,
    leaveGauntletCamp,
    loseGauntletFight,
    retryGauntletFight,
    startGauntlet,
    winGauntletFight,
} from "../../src/game/core/gauntlet";
import { ColdRule } from "../../src/game/core/rules/ColdRule";
import { RealmRule } from "../../src/game/core/rules/RealmRule";
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { canWalkStraight } from "../../src/game/core/world/FlowField";
import { makeGrid } from "../../src/game/core/world/testGrid";
import {
    buttonMove,
    cageGap,
    coneStep,
    darkFightMove,
    dodgeOrbs,
    dodgeShots,
    fanStep,
    inSquare,
    kindleMove,
    laneStep,
    lungeStep,
    offMarks,
    offTether,
    openWay,
    otherBlasts,
    outOfPool,
    pressButton,
    realmMove,
    shelter,
    sidestepBullets,
    stripStep,
    wallGap,
} from "./bossReads";
import { loadRegionData } from "./collision-snapshot";
import { TombsLog, chestAction, kerisPickRank, tombsMove, useItems } from "./tombsBot";

const [characterArg, seedsArg, minutesArg] = process.argv.slice(2);
// The Tombs' invocations, or a run's (all: every one but hard mode's, which HARD=1 is)
const invocations =
    process.env.INVOCATIONS === "all"
        ? process.env.MAP === "tombs_of_amascut"
            ? INVOCATIONS.map((i) => i.id)
            : RUN_INVOCATIONS.filter((i) => !i.hard).map((i) => i.id)
        : (process.env.INVOCATIONS ?? "").split(",").filter(Boolean);
const relics = (process.env.RELICS ?? "").split(",").filter(Boolean);
// Remixes (content/remixes.ts) on the map: REMIX=overgrown,shadow,frozen,dark (or all)
const remixes =
    process.env.REMIX === "all"
        ? ["overgrown", "shadow", "frozen", "dark"]
        : (process.env.REMIX ?? "").split(",").filter(Boolean);
// Awakened invasions (content/invasions.ts): INVADE=1 rolls by the seed as a run does once
// they're open; INVADE=invading_duke@400 makes that one come at 6:40
const invade = process.env.INVADE;
const invadeAt = invade?.includes("@") ? invade.split("@") : undefined;
const invasionOptions = invade
    ? {
          invasions: true,
          ...(invadeAt && {
              testing: { invasion: { invader: invadeAt[0], at: parseFloat(invadeAt[1]) } },
          }),
      }
    : {};
// An Awakener's orb on the final boss (AWAKEN=1)
const awakened = process.env.AWAKEN === "1";
const characters = characterArg ? characterArg.split(",") : CHARACTERS.map((c) => c.id);
const seeds = parseInt(seedsArg ?? "1");
// Cells round it, each way, the bot looks at for roots to keep off
const ROOT_LOOK = 3;
// How often to print progress (REPORT=15 for every 15 seconds)
const REPORT_SECONDS = parseInt(process.env.REPORT ?? "60");

// The map being played (GAUNTLET=1 changes it fight by fight, with ARENA and grid)
let map = getMap(
    process.env.GAUNTLET === "1" ? "awakened_vardorvis" : (process.env.MAP ?? "lumbridge"),
);
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
let ARENA = map.arena;
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
// A person's reaction time (REACT, in seconds): the bot otherwise steps out of a windup on the tick
// it starts, so a shorter warning costs it far less than it costs a person
const reactTicks = Math.round(parseFloat(process.env.REACT ?? "0") * TICKS_PER_SECOND);
const firstSeed = parseInt(process.env.FROM ?? "1");
// A co-op party of this many of the adventurer, each played by the bot on its
// own (it doesn't play as a team: no regrouping, no waiting for the others)
const partySize = parseInt(process.env.PARTY ?? "1");
// An act's map's step (content/acts.ts)
const actStep = parseInt(process.env.STEP ?? "0");
// A map of two worlds (RealmRule): whether the bot dives into puddles (REALM=0 never), and how well
// it has to be to
const REALM_DIVES = process.env.REALM !== "0";
const REALM_DIVE_HP = 0.6;
// Under the cold (ColdRule): the bot goes to warm itself from this cold (COLD=0 never), until it's
// down to the next, and steps out of a vent's gas
const COLD_SEEKS = process.env.COLD !== "0";
// In the dark (LightingDef.litTargetsOnly): the bot keeps clear of Persten's false lanterns,
// goes for a light leech when there's nothing lit to fight, by a fire when it's dimmed, and stays
// in the pathfinder's circle through the Leviathan's last third (DARK=0 none of it)
const DARK_SEEKS = process.env.DARK !== "0";
const COLD_GO = 45;
const COLD_DONE = 15;
// Whether it's on its way to warm itself, by hero
const warming = new Map<number, boolean>();
// A pet taken along (PET=butch): a fighting one's power plays (PetDef.power)
const pet = process.env.PET || undefined;
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
function loadGrid(): ArenaGrid {
    console.time(`${map.name} arena`);
    const loaded =
        process.env.FLAT === "1"
            ? makeGrid(
                  new Array(ARENA.sizeY).fill(".".repeat(ARENA.sizeX)),
                  ARENA.baseX,
                  ARENA.baseY,
              )
            : new ArenaGrid(loadRegionData(map));
    console.timeEnd(`${map.name} arena`);
    return loaded;
}
let grid = loadGrid();
const grids = new Map<string, ArenaGrid>([[map.id, grid]]);

// To another map (the gauntlet's next fight), its grid loaded once
function useMap(id: string): void {
    map = getMap(id);
    ARENA = map.arena;
    let loaded = grids.get(id);
    if (!loaded) {
        loaded = loadGrid();
        grids.set(id, loaded);
    }
    grid = loaded;
}

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
    // A keris pick: the best jewel found (kerisPickRank stays under one kind's step)
    return CHOICE_PRIORITY[choice.kind] * 10 - quality * 15 - kerisPickRank(choice);
}

// Runs a set was started in (a piece worn), and finished in (its bonus), for
// the summary at the end
const setsStarted = new Map<string, number>();
const setsFinished = new Map<string, number>();
let runs = 0;

// Steers away from nearby enemies (closer counts more) and towards the nearest
// bones by the walk there when nothing is close; slides along walls by trying a
// few nearby directions.
function botMove(sim: Sim): { x: number; y: number } {
    const player = sim.player;
    let ax = 0;
    let ay = 0;
    let threat = 0;
    // A map's root hearts (MapDef.rule) are worth walking up to and cutting down, as a person
    // would: they make the roots round them grow
    const heart = sim.roots?.def.hearts.enemyId;
    for (const enemy of sim.enemies) {
        if (enemy.dead) {
            continue;
        }
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distSq = dx * dx + dy * dy;
        if (enemy.def.id === heart && distSq < 400) {
            const w = distSq > 9 ? -1.5 / Math.sqrt(distSq) : 1 / Math.max(distSq, 0.25);
            ax += dx * w;
            ay += dy * w;
            continue;
        }
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
    // power-ups and random events' visitors twice as far; with nothing close,
    // bones further off are worth fetching. Near is by the walk there, so a pile
    // behind a wall is as far as the way round it, and one there's no way to is
    // left where it lies. (Lumbridge's arena has its middle in a walled corner of
    // the castle's courtyard, where the drift below held the bot for minutes,
    // pushing into the wall towards bones on the other side.)
    const reach = threat < 0.08 ? FETCH_TILES * FETCH_TILES : 144;
    let best = Infinity;
    let target: { x: number; y: number } | undefined;
    // How far ahead to look for walls: no further than where it's walking to
    let look = SLIDE_LOOK;
    if (sim.visitor) {
        const walk = walkTiles(sim, sim.visitor.x, sim.visitor.y);
        if (walk !== undefined) {
            best = (walk * walk) / 4;
            target = sim.visitor;
        }
    }
    for (const pickup of sim.pickups) {
        const dx = pickup.x - player.x;
        const dy = pickup.y - player.y;
        const scale = pickup.kind === "powerUp" ? 4 : 1;
        // The walk's never shorter than the straight line, so only a pile that
        // might be nearer is worth looking up
        if ((dx * dx + dy * dy) / scale >= Math.min(best, reach)) {
            continue;
        }
        const walk = walkTiles(sim, pickup.x, pickup.y);
        const d = walk === undefined ? Infinity : (walk * walk) / scale;
        if (d < best && d < reach) {
            best = d;
            target = pickup;
        }
    }
    if (target) {
        const way = wayTo(sim, target.x, target.y);
        const bx = way.x - player.x;
        const by = way.y - player.y;
        const len = Math.hypot(bx, by);
        look = Math.min(look, len);
        if (len > 1e-6) {
            const pull = threat < 0.08 ? 1 : 0.6 / (1 + threat * 4);
            ax += (bx / len) * pull;
            ay += (by / len) * pull;
        }
    }
    // Off the roots (MapDef.rule): a person steps off what slows and hurts them, the nearer the
    // more, and harder once they're on it
    if (sim.roots && sim.realm?.layer !== 1) {
        const rule = sim.roots;
        const on = rule.isRooted(player.x, player.y);
        let rx = 0;
        let ry = 0;
        for (let dy = -ROOT_LOOK; dy <= ROOT_LOOK; dy++) {
            for (let dx = -ROOT_LOOK; dx <= ROOT_LOOK; dx++) {
                const x = player.x + dx * rule.cell;
                const y = player.y + dy * rule.cell;
                if ((dx !== 0 || dy !== 0) && rule.isRooted(x, y)) {
                    const d2 = dx * dx + dy * dy;
                    rx -= dx / d2;
                    ry -= dy / d2;
                }
            }
        }
        const len = Math.hypot(rx, ry);
        if (len > 1e-6) {
            const push = on ? 2 : 0.35;
            ax += (rx / len) * push;
            ay += (ry / len) * push;
        }
    }
    // A map of two worlds (RealmRule): as a person would, into a puddle that opens near them while
    // they're well (REALM=0 never), and in the realm after its lost souls, then into the portal
    const realm = sim.realm;
    if (realm && REALM_DIVES) {
        const goal = realmGoal(sim, realm);
        if (goal) {
            // Round walls, by the walk to it (an older map's puddle can be past one)
            const way = wayTo(sim, goal.x, goal.y);
            const gx = way.x - player.x;
            const gy = way.y - player.y;
            const d = Math.hypot(gx, gy);
            if (d > 0.05) {
                ax += (gx / d) * goal.pull;
                ay += (gy / d) * goal.pull;
            }
        }
    }
    // Under the cold (ColdRule): to a brazier when it's cold (lit, or out to relight), and out of
    // a vent's gas
    const cold = sim.cold;
    if (cold && COLD_SEEKS) {
        const goal = coldGoal(sim, cold);
        if (goal) {
            const way = wayTo(sim, goal.x, goal.y);
            const gx = way.x - player.x;
            const gy = way.y - player.y;
            const d = Math.hypot(gx, gy);
            if (d > 0.05) {
                ax += (gx / d) * goal.pull;
                ay += (gy / d) * goal.pull;
            }
        }
        // Off the embers (they burn), but by them
        for (const ember of cold.embers) {
            const ex = player.x - ember.x;
            const ey = player.y - ember.y;
            const d = Math.hypot(ex, ey);
            if (d < 2 && d > 0.01) {
                ax += (ex / d) * 2;
                ay += (ey / d) * 2;
            }
        }
        for (const vent of cold.vents) {
            const vx = player.x - vent.x;
            const vy = player.y - vent.y;
            const d = Math.hypot(vx, vy);
            if (d < 3 && d > 0.01 && cold.ventState(vent, sim.tick)) {
                ax += (vx / d) * 3;
                ay += (vy / d) * 3;
            }
        }
    }
    if (sim.litTargetsOnly && DARK_SEEKS) {
        const goal = darkGoal(sim);
        if (goal) {
            const gx = goal.x - player.x;
            const gy = goal.y - player.y;
            const d = Math.hypot(gx, gy);
            if (d > 0.05) {
                ax += (gx / d) * goal.pull;
                ay += (gy / d) * goal.pull;
            }
        }
        // A lantern with no beam is a false one: give it room
        for (const enemy of sim.enemies) {
            if (enemy.dead || !enemy.def.caught || !enemy.def.explodes) {
                continue;
            }
            const ex = player.x - enemy.x;
            const ey = player.y - enemy.y;
            const d = Math.hypot(ex, ey);
            if (d < enemy.def.explodes.radius + 1 && d > 0.01) {
                ax += (ex / d) * 3;
                ay += (ey / d) * 3;
            }
        }
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
    return slide(sim, { x: ax / len, y: ay / len }, look);
}

// Where a map of two worlds takes the bot (RealmRule), and how hard: the puddle while it's well,
// in the realm the nearest lost soul, then the portal home
function realmGoal(sim: Sim, realm: RealmRule): { x: number; y: number; pull: number } | undefined {
    const player = sim.player;
    if (realm.layer === 0) {
        const puddle = realm.puddle;
        const well = player.hp >= player.maxHp * REALM_DIVE_HP;
        if (puddle && well && Math.hypot(puddle.x - player.x, puddle.y - player.y) < 20) {
            return { ...puddle, pull: 3 };
        }
        return undefined;
    }
    if (realm.portal) {
        return { ...realm.portal, pull: 4 };
    }
    let best: { x: number; y: number; pull: number } | undefined;
    let bestD = Infinity;
    for (const enemy of sim.enemies) {
        if (!enemy.dead && enemy.def.caught) {
            const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            if (d < bestD) {
                bestD = d;
                best = { x: enemy.x, y: enemy.y, pull: 2.5 };
            }
        }
    }
    return best;
}

// Where the dark takes the bot (LightingDef.litTargetsOnly), and how hard: into the only light
// while there is one (the Leviathan's pathfinder), after a light leech within 9 tiles when nothing
// near's lit and it's well, by the nearest fire or left light while its own's dimmed
function darkGoal(sim: Sim): { x: number; y: number; pull: number } | undefined {
    const player = sim.player;
    const only = sim.onlyLightEnemy();
    if (only) {
        return { x: only.x, y: only.y, pull: 4 };
    }
    const own = sim.lights.find((l) => l.kind === "player" && l.id === sim.focus);
    const base = sim.lighting?.player?.radius ?? 0;
    const dimmed = own !== undefined && own.radius < base - 0.5;
    let litNear = false;
    let leech: { x: number; y: number } | undefined;
    let leechD = 9;
    for (const enemy of sim.enemies) {
        if (enemy.dead) {
            continue;
        }
        const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (enemy.def.light && !enemy.def.caught && !enemy.boss && d < leechD) {
            leechD = d;
            leech = enemy;
        } else if (d < 6 && sim.isEnemyLit(enemy) && !enemy.def.caught) {
            litNear = true;
        }
    }
    // Not when hurt: a leech runs, and a chase into the dark is a chase into the crowd
    if (leech && (!litNear || dimmed) && player.hp > player.maxHp * 0.5) {
        return { x: leech.x, y: leech.y, pull: 0.8 };
    }
    if (dimmed) {
        let best: { x: number; y: number; pull: number } | undefined;
        let bestD = 12;
        for (const light of sim.lights) {
            if (light.kind !== "map" && light.kind !== "left") {
                continue;
            }
            const d = Math.hypot(light.x - player.x, light.y - player.y);
            if (d < bestD) {
                bestD = d;
                best = { x: light.x, y: light.y, pull: d > light.radius - 1 ? 1.5 : 0 };
            }
        }
        return best;
    }
    return undefined;
}
let dimTicks = 0;

// Where the cold takes the bot (ColdRule), and how hard: once it's cold, to the nearest lit brazier
// (or the nearest out, to relight), staying until it's warm again
function coldGoal(sim: Sim, cold: ColdRule): { x: number; y: number; pull: number } | undefined {
    const player = sim.player;
    const level = cold.coldOf(sim.focus);
    let going = warming.get(sim.focus) ?? false;
    if (!going && level >= COLD_GO) {
        going = true;
    } else if (going && level <= COLD_DONE) {
        going = false;
    }
    warming.set(sim.focus, going);
    if (!going) {
        return undefined;
    }
    let best: { x: number; y: number; pull: number } | undefined;
    let bestD = Infinity;
    for (const brazier of cold.braziers) {
        // An out one costs a relight: count it further off
        const lit = cold.isLit(brazier, sim.tick);
        const walk = walkTiles(sim, brazier.midX, brazier.midY);
        if (walk === undefined) {
            continue;
        }
        const d = walk + (lit ? 0 : 10);
        if (d < bestD) {
            bestD = d;
            // Beside it, not into it
            const dx = player.x - brazier.midX;
            const dy = player.y - brazier.midY;
            const len = Math.hypot(dx, dy) || 1;
            best = {
                x: brazier.midX + (dx / len) * 1.8,
                y: brazier.midY + (dy / len) * 1.8,
                // Harder the colder it is: a melee bot otherwise fights on until it freezes
                pull: 3.5 + Math.max(0, level - COLD_GO) / 8,
            };
        }
    }
    return best;
}

// How far, walking, the bot goes to fetch bones when nothing's close: inside the
// flow field's window (FLOW_FIELD_SIZE in Sim.ts), where the walk's known
const FETCH_TILES = 40;

// Tiles to walk from the player to (x, y) round walls, by the flow field enemies
// follow to the player (ten to a tile), never less than the straight line; or
// undefined when there's no way there. Out of the field's window it's the
// straight line, as it always was.
function walkTiles(sim: Sim, x: number, y: number): number | undefined {
    const field = sim.flowField;
    const tileX = Math.floor(x);
    const tileY = Math.floor(y);
    const straight = Math.hypot(x - sim.player.x, y - sim.player.y);
    if (!field.contains(tileX, tileY)) {
        return straight;
    }
    if (!field.isReachable(tileX, tileY)) {
        return undefined;
    }
    return Math.max(straight, field.getCost(tileX, tileY) / 10);
}

// Where to head for to get to (x, y): straight there when nothing's in the way,
// or else the furthest tile back along the walk from it (the flow field's steps
// towards the player) that the player can walk to straight
function wayTo(sim: Sim, x: number, y: number): { x: number; y: number } {
    const player = sim.player;
    if (canWalkStraight(grid, player.x, player.y, x, y)) {
        return { x, y };
    }
    let tileX = Math.floor(x);
    let tileY = Math.floor(y);
    const step = { x: 0, y: 0 };
    // Far more steps than a walk to anything it'd go for
    for (let i = 0; i < 64 && sim.flowField.getStep(grid, tileX, tileY, step); i++) {
        tileX += step.x;
        tileY += step.y;
        if (canWalkStraight(grid, player.x, player.y, tileX + 0.5, tileY + 0.5)) {
            return { x: tileX + 0.5, y: tileY + 0.5 };
        }
    }
    return { x, y };
}

// How far ahead a wall turns the bot aside, in tiles: far enough that it goes
// along a building rather than into a nook one tile deep (Kourend's held it for
// minutes, fleeing enemies into one). And the turns it tries, nearest first,
// from either side of the way it wants to as far as straight back out.
const SLIDE_LOOK = 2;
const SLIDE_TURNS = [1, 2, 3, 4, 5, 6, 7]
    .flatMap((i) => [(i * Math.PI) / 8, (-i * Math.PI) / 8])
    .concat(Math.PI);

// Along a wall rather than into it, as a person does: the nearest turn from the
// way it wants to go that's open as far as it looks (less than SLIDE_LOOK when
// it's walking up to something nearer), or failing that for a tile, or that way
// if none is
function slide(sim: Sim, move: { x: number; y: number }, look: number): { x: number; y: number } {
    const { x, y } = sim.player;
    const open = (dx: number, dy: number, length: number) =>
        canWalkStraight(grid, x, y, x + dx * length, y + dy * length);
    if (open(move.x, move.y, look)) {
        return move;
    }
    for (const length of look > 1 ? [look, 1] : [look]) {
        for (const turn of SLIDE_TURNS) {
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);
            const dx = move.x * cos - move.y * sin;
            const dy = move.x * sin + move.y * cos;
            if (open(dx, dy, length)) {
                return { x: dx, y: dy };
            }
        }
    }
    return move;
}

// How far round itself a boss swings at whoever's close (a round swing it uses only within its
// own reach, as the Whisperer's lash), if a weapon reaching this far can hit it from outside that
function closeSwing(boss: Enemy, phaseIndex: number, reach: number): number | undefined {
    let close: number | undefined;
    for (const attack of boss.def.boss?.attacks ?? []) {
        const radius = attack.radius ?? 0;
        if (
            attack.kind === "swing" &&
            attack.weight > 0 &&
            !attack.line &&
            attack.cone === undefined &&
            !attack.cover &&
            attack.range <= radius &&
            radius + 1 < reach &&
            (!attack.phases || attack.phases.includes(phaseIndex + 1))
        ) {
            close = Math.max(close ?? 0, radius);
        }
    }
    return close;
}

// A phased boss's fight, as a careful person plays it, or undefined outside one. With DODGE it
// also keeps out of any boss's ground marks that hurt and makes for a closing ring's way out,
// phased or not.
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
        // A closing ring's way out first, as for a phased boss (the Theatre's rings): sidestepping
        // its bullets alone steps into the rest of it
        const way = cageGap(sim) ?? sidestepBullets(sim);
        if (way) {
            return way;
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
        // A fight of two worlds (the Awakened Whisperer's): her souls in the realm first, and
        // nothing to step out of for a blow the realm's out of (her screech)
        const realm = realmMove(sim);
        if (realm) {
            return realm;
        }
        // A sandstorm over the room but at a boss's feet (BossAttackDef.outside): in to it first
        const storm = shelter(sim);
        if (storm) {
            return storm;
        }
        const lane = laneStep(sim, boss);
        if (lane) {
            return lane;
        }
        const gap = wallGap(sim) ?? cageGap(sim);
        if (gap) {
            return gap;
        }
        // A pair of bosses fought together (enrage.partner: the Scarab Mages): the beam between
        // them, the other's blasts, the elder's sinking sand, the bolts they aim. A caster on its
        // own that keeps its distance in the quest (the Champion): the bolts it aims.
        const clear = boss.def.boss?.enrage.partner
            ? (offTether(sim) ??
              offMarks(sim, inSquare(sim)) ??
              otherBlasts(sim) ??
              outOfPool(sim) ??
              dodgeShots(sim))
            : boss.def.boss?.keepDistance !== undefined && !(sim.map.fight && !sim.map.stages)
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
        // Phosani's and Zachariah's fights are read as they always were: bullets before a lunge, no
        // orbs of their own, and the near side of a strip whatever the square says (their squares
        // are smaller than the floor they're fought on). Later fights get everything below.
        const older = sim.map.id === "phosani" || sim.map.id === "zachariah";
        const room = older ? () => true : inSquare(sim);
        const across = (x: number, y: number, dirX: number, dirY: number, half: number) =>
            stripStep(sim, x, y, dirX, dirY, half, room);
        // A lunge or a thrown line first: they hit harder than a bullet. With a copy of it coming
        // too (EnemyDef.echoes: the Akh's shadow), two strips at once: to where neither reaches
        const early = older ? sidestepBullets(sim) : undefined;
        if (early) {
            return early;
        }
        const lunge = lungeStep(sim, boss, room);
        if (lunge) {
            return lunge;
        }
        // A fanned wave (the Awakened Duke's spit): to where none of its lines reach
        const fan =
            windup?.attack.wave && !windup.from && (windup.attack.count ?? 1) > 1 && !older
                ? fanStep(sim, boss, windup, room)
                : undefined;
        if (fan) {
            return fan;
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
        const sidestep = (older ? undefined : dodgeOrbs(sim)) ?? sidestepBullets(sim);
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
        // Out of a long wedge sideways, not back down it (BossAttackDef.cone)
        const wedge = older ? undefined : coneStep(sim, boss, windup);
        if (wedge) {
            return wedge;
        }
        // Off sparks about to land under it, in a fight in parts (Static, a lattice, a trail of
        // its own steps), or a rift still open, before anything that keeps it moving round the
        // boss: to the nearest spot clear of them all
        if (sim.map.stages || sim.ability?.kindle) {
            const step = offMarks(sim, room);
            if (step) {
                return step;
            }
        }
        // Out of a swing's reach round the boss, and off where a blast's to land, as it winds up:
        // what anyone steps out of
        // (not Phosani's or Zachariah's: older, above)
        if (
            !older &&
            windup?.attack.kind === "swing" &&
            windup.attack.world === undefined &&
            !windup.attack.cover
        ) {
            const reach = (windup.attack.radius ?? 2) + player.radius + 0.5;
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const away = Math.hypot(dx, dy);
            if (away < reach) {
                return openWay(sim, away > 0.001 ? dx / away : 1, away > 0.001 ? dy / away : 0);
            }
        }
        if (!older && windup?.attack.kind === "blast") {
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
        // (and debris, which hides as a pillar does: Sim.coverPillars)
        const pillars = sim.coverPillars();
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
    // A fight under the cold with a button that lights braziers (the Awakened Duke's): its own read
    const kindle = dodges ? kindleMove(sim, boss) : undefined;
    if (kindle) {
        return kindle;
    }
    // A fight in the dark with a button that stuns (the Awakened Leviathan's): its own read
    const dark = dodges ? darkFightMove(sim, boss) : undefined;
    if (dark) {
        return dark;
    }
    // A less careful person: now and then backs off and loses reach
    if (sloppy && (sim.tick / TICKS_PER_SECOND) % SLOPPY_EVERY < SLOPPY_LAPSE) {
        const away = towards(boss.x, boss.y);
        return { x: -away.x, y: -away.y };
    }
    // In to use the fight's button while the boss's guard is down (BossDef.guard), if it's ready:
    // of two fought together (the Scarab Mages), the nearer one with its guard down, a spell it's
    // channelling to break (BossAttackDef.channel)
    const punish = smites ? buttonMove(sim) : undefined;
    if (punish) {
        return punish;
    }
    // A weapon that reaches only so far (MapDef.fight.strikeReach): back in reach of him, and out
    // of what he swings all round him if it reaches past that (the Whisperer's lash), as a person
    // who's learned it keeps to the ring between
    const reach = sim.map.fight?.strikeReach;
    if (reach !== undefined) {
        const away = Math.hypot(boss.x - player.x, boss.y - player.y);
        const close = closeSwing(boss, phase.index, reach);
        if (close !== undefined && away < close + player.radius + 0.5) {
            const to = towards(boss.x, boss.y);
            return { x: -to.x, y: -to.y };
        }
        if (away > reach - (close !== undefined ? 0.75 : 1.5)) {
            return towards(boss.x, boss.y);
        }
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

function runOnce(characterId: string, seed: number, gauntlet?: GauntletFightOptions) {
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
        actStep,
        expert,
        armoury,
        invocations,
        pet,
        relics,
        remixes,
        // A fight in parts (MapDef.stages): which, STAGE=0 for the first
        stage: parseInt(process.env.STAGE ?? "0"),
        gauntlet,
        ...invasionOptions,
        awakened,
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
    let pinnedTicks = 0;
    let lastX = sim.player.x;
    let lastY = sim.player.y;
    let move = { x: 0, y: 0 };
    // The moves decided and not yet taken (REACT), and the one being taken
    const reacting: { tick: number; move: { x: number; y: number } }[] = [];
    let taken = move;
    let chests = 0;
    let powerUps = 0;
    const started = new Set<string>();
    const finished = new Set<string>();
    const recentHits: { tick: number; event: SimEvent }[] = [];
    const invasionLog: { from?: number; down?: number } = {};
    const startTime = performance.now();
    if (fresh && finalBoss) {
        sim.startIntro(getEnemy(finalBoss), "finalBoss");
    }
    let fightTicks = 0;
    // Ticks stood on roots (MapDef.rule)
    let rootTicks = 0;
    // A map of two worlds' (RealmRule): times into the realm, thrown back out of sanity, and ticks
    // there
    let dives = 0;
    let lapses = 0;
    let realmTicks = 0;
    // Under the cold (ColdRule): times frozen solid, and ticks at 50 or over
    let freezes = 0;
    let coldTicks = 0;
    dimTicks = 0;
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
            const moved = Math.hypot(sim.player.x - lastX, sim.player.y - lastY);
            // Pressed on and got nowhere (against a wall, or held), for the summary
            if (moved < 0.05 && Math.hypot(move.x, move.y) > 0.5) {
                pinnedTicks += 5;
            }
            move = fightMove(sim) ?? botMove(sim);
            // Stuck against a wall: wiggle sideways for a moment
            if (moved < 0.05) {
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
        if (smites) {
            pressButton(sim, sloppy);
        }
        if (reacting[reacting.length - 1]?.move !== move) {
            reacting.push({ tick: sim.tick + reactTicks, move });
        }
        while (reacting.length > 0 && reacting[0].tick <= sim.tick) {
            taken = reacting.shift()!.move;
        }
        const pressed = uncursed(sim, taken);
        sim.step(pressed.x, pressed.y);
        if (sim.rule?.hurtsAt(sim.player.x, sim.player.y)) {
            rootTicks++;
        }
        if (sim.realm?.layer === 1) {
            realmTicks++;
        }
        if (sim.cold && sim.cold.coldOf(sim.focus) >= 50) {
            coldTicks++;
        }
        if (sim.lighting?.player) {
            const own = sim.lights.find((l) => l.kind === "player" && l.id === sim.focus);
            if (own && own.radius < sim.lighting.player.radius - 0.5) {
                dimTicks++;
            }
        }
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
            // An invader's coming and going (INVADE)
            if (event.type === "bossSpawned" && event.enemyId.startsWith("invading_")) {
                invasionLog.from = sim.seconds;
            } else if (event.type === "kill" && event.enemyId.startsWith("invading_")) {
                invasionLog.down = sim.seconds;
            }
            if (event.type === "playerHit") {
                recentHits.push({ tick: sim.tick, event });
            } else if (event.type === "powerUp") {
                powerUps++;
            } else if (event.type === "frozenSolid") {
                freezes++;
            } else if (event.type === "worldTurned") {
                if (event.layer === 1) {
                    dives++;
                } else if (event.lapse) {
                    lapses++;
                }
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
                    `coins ${String(sim.coins).padStart(4)}  ${weapons} | ${passives} | ${gear}` +
                    // How much of the ground's rooted (MapDef.rule), and how long the bot's spent
                    // on it
                    (sim.roots
                        ? `  roots ${Math.round(sim.roots.cover * 100)}% (on ${Math.round((100 * rootTicks) / Math.max(1, sim.tick))}%)`
                        : "") +
                    (sim.realm
                        ? `  realm ${dives} dives, ${lapses} lapses, ${Math.round((100 * realmTicks) / Math.max(1, sim.tick))}% there`
                        : "") +
                    (sim.cold
                        ? `  cold ${Math.round(sim.cold.coldOf(sim.focus))}, ${freezes} frozen, ${Math.round((100 * coldTicks) / Math.max(1, sim.tick))}% over 50`
                        : "") +
                    (sim.litTargetsOnly
                        ? `  dark ${Math.round((100 * dimTicks) / Math.max(1, sim.tick))}% dimmed`
                        : ""),
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
            `${powerUps} power-ups, stuck ${Math.round(pinnedTicks / TICKS_PER_SECOND)}s ` +
            (sim.realm
                ? `realm ${dives} dives ${lapses} lapses ${sim.realm.realmCaskets} caskets ` +
                  `${Math.round((100 * realmTicks) / Math.max(1, sim.tick))}% `
                : "") +
            (sim.cold
                ? `cold ${freezes} frozen ${Math.round((100 * coldTicks) / Math.max(1, sim.tick))}% over 50 `
                : "") +
            (sim.litTargetsOnly
                ? `dark ${Math.round((100 * dimTicks) / Math.max(1, sim.tick))}% dimmed `
                : "") +
            `(${(ms / sim.tick).toFixed(3)}ms per tick)`,
    );
    if (sim.invasion) {
        const { invader, at } = sim.invasion;
        console.log(
            `  invasion: ${invader.id} due ${formatClock(at)}, ` +
                (invasionLog.from === undefined
                    ? "never came"
                    : `came ${formatClock(invasionLog.from)}, ` +
                      (invasionLog.down !== undefined
                          ? `down ${formatClock(invasionLog.down)} (${Math.round(invasionLog.down - invasionLog.from)}s)`
                          : "still up")),
        );
    }
    if (result.awakened) {
        console.log(
            `  awakened: ${result.awakened.seen ? "came" : "never came"}` +
                (result.awakened.casketCoins !== undefined
                    ? `, master casket ${result.awakened.casketCoins} coins`
                    : ""),
        );
    }
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
        actStep,
        expert,
        invocations,
        party: Array.from({ length: partySize }, (_, i) => ({
            name: "bot" + (i + 1),
            characterId,
            metaStats,
            unlockedItems,
            armoury,
            pet,
            relics,
        })),
        remixes,
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
                if (smites) {
                    pressButton(sim, sloppy);
                }
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

// The Forgotten Four (GAUNTLET=1, content/gauntlet.ts), on core/gauntlet.ts as the game runs it:
// the four fights in ORDER (fight map ids, comma separated; the act's by default), each as its
// adventurer, wounds carried, the camp's blessing bought by gauntletBlessing, and a fight lost
// retried up to RETRIES times (3 by default) before the run's given up. Each seed is one run;
// each try of a fight plays on its own seed.
function runGauntlet(seed: number): void {
    const order = process.env.ORDER ? process.env.ORDER.split(",") : [...GAUNTLET_FIGHTS];
    const retries = parseInt(process.env.RETRIES ?? "3");
    let run = startGauntlet(order, hard);
    const bought: string[] = [];
    while (run.phase === "fight") {
        useMap(gauntletFightId(run));
        const options = gauntletFightOptions(run);
        const character = map.fight!.character;
        const trySeed = seed * 1000 + run.index * 10 + run.tries;
        console.log(
            `\ngauntlet seed ${seed}, fight ${run.index + 1} ${map.id} as ${character}, try ` +
                `${run.tries + 1}: climb x${options.climb}, starts at ` +
                `${Math.round(options.hp * 100)}% hp, blessing ${options.blessing ?? "none"}`,
        );
        const result = runOnce(character, trySeed, options);
        const end = result.gauntlet!;
        if (!result.victory) {
            run = loseGauntletFight(run);
            if (run.tries >= retries) {
                break;
            }
            run = retryGauntletFight(run);
            continue;
        }
        run = winGauntletFight(run, {
            seconds: result.seconds,
            hp: end.hp,
            maxHp: end.maxHp,
            damageTaken: result.stats.damageTaken,
            guardDowns: end.guardDowns,
        });
        const done = run.done[run.done.length - 1];
        console.log(
            `  won in ${formatClock(done.seconds)}: ${done.points.total} points ` +
                `(speed ${done.points.speed}, safe ${done.points.safe}, guard ${done.points.guard}), ` +
                `left at ${Math.round(end.hp)}/${end.maxHp} hp -> wounds ${Math.round(done.wound * 100)}%`,
        );
        if (run.phase === "camp") {
            const blessing = gauntletBlessing(run);
            if (blessing) {
                run = chooseBlessing(run, blessing);
                bought.push(blessing);
            }
            console.log(
                `  camp: ${run.points} points left, bought ${blessing ?? "nothing"}, next starts at ` +
                    `${Math.round((1 - run.wound) * 100)}% hp`,
            );
            run = leaveGauntletCamp(run);
        }
    }
    const cleared = run.phase === "cleared";
    console.log(
        `gauntlet seed ${seed}: ${cleared ? (isGauntletClean(run) ? "CLEARED clean" : "CLEARED with retries") : `stopped at fight ${run.index + 1} (${gauntletFightId(run)})`}, ` +
            `${run.done.length}/4 won, ${gauntletRetries(run)} retries, fight time ${formatClock(gauntletSeconds(run))}, ` +
            `order ${order.join(" ")}, blessings ${bought.join(" ") || "none"}, ` +
            `fights ${run.done.map((d) => `${d.fightId.replace("awakened_", "")} ${formatClock(d.seconds).trim()} r${d.retries}`).join(", ")}`,
    );
}

// The camp's pick, as a careful player might: Rest when the wounds are a tenth or more, else the
// dearest blessing the points run to (BLESS=best: never Rest, so the wounds carry; BLESS=none)
function gauntletBlessing(run: GauntletRun): BlessingId | undefined {
    const rest = BLESSING_BY_ID.get("rest")!;
    if (process.env.BLESS === "none") {
        return undefined;
    }
    if (process.env.BLESS !== "best" && run.wound >= 0.1 && run.points >= rest.price) {
        return "rest";
    }
    const affordable = BLESSINGS.filter((b) => b.id !== "rest" && b.price <= run.points);
    return affordable.sort((a, b) => b.price - a.price)[0]?.id;
}

if (process.env.GAUNTLET === "1") {
    for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
        runGauntlet(seed);
    }
} else {
    for (const characterId of characters) {
        for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
            if (partySize > 1) {
                runParty(characterId, seed);
                continue;
            }
            console.log(`\n${characterId} seed ${seed}`);
            runOnce(characterId, seed);
        }
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
