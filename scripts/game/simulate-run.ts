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
//   SAFE_WAVES=1 ... # can't die outside a boss fight: it gets there with what the run earned
//   GOD=1 ...        # can't die at all: with ENDLESS=1, how damage keeps up with the rounds;
//                    # with LAIR=, how long its fight takes a hero who's never hurt (only Yama's
//                    # meteor, unstopped, still kills)
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
//   GAZE=never ...   # a hero with their own buttons (the Battle for Varrock's Justiciar) never
//                    # casts the Owl's gaze; GAZE=waste casts it whenever it's ready, not only at
//                    # the meteor it stops (Yama's). A map with one lair to retry at starts there
//                    # (getRetryLair).
//   LAIR=xarth FARM=480 ...  # a map with lairs (MapDef.lairs): the hordes for FARM seconds, kept
//                    # out of every lair, then that lair's fight (Yama's generals beaten for him);
//                    # EMPOWERED=1 as if its rival were beaten first (LairDef.empowered)
import { getUpgradeLine } from "../../src/game/content/armoury";
import { CHARACTERS, getCharacter } from "../../src/game/content/characters";
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
import { getMap, getRetryLair } from "../../src/game/content/maps";
import { RARITY_ORDER } from "../../src/game/content/rarity";
import { SHOP_UPGRADES } from "../../src/game/content/shop";
import { HeroAbilityDef, emptyStats } from "../../src/game/content/types";
import { RUN_LENGTH } from "../../src/game/content/waves";
import { Sim, TICKS_PER_SECOND } from "../../src/game/core/Sim";
import { UpgradeChoice } from "../../src/game/core/Upgrades";
import { behindPillar } from "../../src/game/core/arena";
import { BossWindup, Enemy, Lair, SimEvent } from "../../src/game/core/entities";
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
import { CELL, RootRule } from "../../src/game/core/rules/RootRule";
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
// A map with lairs (MapDef.lairs: the Battle for Varrock's generals and Yama): the lair LAIR the
// bot goes for, after FARM seconds of the map's hordes (kept out of every lair meanwhile), and
// with EMPOWERED=1 as if its rival were beaten first (LairDef.empowered). Yama's generals are
// beaten for him. The run's over when it's beaten, or the party's dead.
const lairTarget = process.env.LAIR;
const farmSeconds = parseFloat(process.env.FARM ?? "0");
const empoweredLair = process.env.EMPOWERED === "1";
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
    // Only ever offered on their own, ranked by BLESSING_RANK
    blessing: 0,
};

// Blessings (MapDef.blessings), as a player might take them: the ranged weapon first (most of the
// damage against a general alone), hitpoints and armour beside damage (with those last, the bot
// lost to Xarth at 12 minutes), then the sword and the buttons
const BLESSING_RANK = [
    "crossbow",
    "brew",
    "strength",
    "ward",
    "light",
    "blade",
    "bracers",
    "staff",
    "will",
    "elixir",
    "platebody",
    "zeal",
    "halo",
    "mjolnir",
    "holy_water",
    "crozier",
    "sandals",
    "wisdom",
];

function choiceScore(choice: UpgradeChoice): number {
    if (choice.kind === "blessing") {
        const rank = BLESSING_RANK.indexOf(choice.blessingId);
        // The fallback, and one the list hasn't got, last
        return rank < 0 ? BLESSING_RANK.length : rank;
    }
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
    // Round the fires that burn (MapDef.burns), and out of one at once
    const fire = firesToAvoid(sim);
    ax += fire.x;
    ay += fire.y;
    // Out of the lairs it isn't going for yet, as a person keeps out of a fight they aren't
    // ready for
    const keepOut = lairsToAvoid(sim);
    ax += keepOut.x;
    ay += keepOut.y;
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

// A push away from the burning scenery round the bot (MapDef.burns), the nearer the more, and
// hard once it's standing in one
const FIRE_LOOK = 2;

function firesToAvoid(sim: Sim): { x: number; y: number } {
    if (!sim.map.burns) {
        return { x: 0, y: 0 };
    }
    const player = sim.player;
    const tx = Math.floor(player.x);
    const ty = Math.floor(player.y);
    let x = 0;
    let y = 0;
    for (let dy = -FIRE_LOOK; dy <= FIRE_LOOK; dy++) {
        for (let dx = -FIRE_LOOK; dx <= FIRE_LOOK; dx++) {
            if (!sim.grid.burnsAt(tx + dx, ty + dy)) {
                continue;
            }
            const ox = player.x - (tx + dx + 0.5);
            const oy = player.y - (ty + dy + 0.5);
            const d2 = Math.max(0.25, ox * ox + oy * oy);
            x += ox / d2;
            y += oy / d2;
        }
    }
    const len = Math.hypot(x, y);
    if (len < 1e-6) {
        return { x: 0, y: 0 };
    }
    const push = sim.grid.burnsAt(tx, ty) ? 3 : 0.5;
    return { x: (x / len) * push, y: (y / len) * push };
}

// A push away from each lair that's asleep, harder the nearer its edge: from its middle, as far
// as its box's half and three tiles more (MapDef.lairs)
function lairsToAvoid(sim: Sim): { x: number; y: number } {
    const player = sim.player;
    let x = 0;
    let y = 0;
    for (const lair of sim.lairs) {
        if (lair.state !== "asleep") {
            continue;
        }
        const floor = sim.floor;
        const half = lair.def.area
            ? Math.max(lair.def.area.x1 - lair.def.area.x0, lair.def.area.y1 - lair.def.area.y0) /
                  2 +
              1
            : floor
              ? Math.max(floor.sizeX, floor.sizeY) / 2
              : 12;
        const dx = player.x - lair.def.at.x;
        const dy = player.y - lair.def.at.y;
        const away = Math.max(0.001, Math.hypot(dx, dy));
        if (away < half + 3) {
            const push = 3 / Math.max(0.5, away - half + 1);
            x += (dx / away) * push;
            y += (dy / away) * push;
        }
    }
    return { x, y };
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
        const pillars = sim.coverPillars(boss);
        if (state.windup?.attack.cover && pillars && pillars.length > 0) {
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

// A hero with buttons of their own (CharacterDef.abilities: Justiciar Zachariah's) against a boss
// whose meteor only their gaze stops (BossAttackDef.interruptedBy: Yama), as a careful person
// plays it: off his claw, the floor's rising slabs and his fireballs, turned to him whenever a
// button's ready and reaches him, and the gaze kept for the meteor, walked into its reach to cast
// (GAZE says otherwise). Undefined outside such a fight; slot is the button to let go once
// they're turned to him, or -1.
const gazePlay = process.env.GAZE ?? "meteor";
// Tiles from his middle it keeps: out of his claw (Yama's reaches 5.5), in its buttons' reach
const KIT_STANDOFF = 7.5;
// How soon a slab's coming up for it to step off it, in ticks
const FLOOR_LOOK = Math.round(1.2 * TICKS_PER_SECOND);

function kitReach(ability: HeroAbilityDef, boss: Enemy): number {
    const length = ability.length ?? 0;
    return ability.kind === "lunge" || ability.kind === "gaze"
        ? length + boss.radius - 0.5
        : length;
}

type KitPlan = { move: { x: number; y: number }; slot: number; dodge?: boolean };

function kitPlan(sim: Sim): KitPlan | undefined {
    const plan = kitChoice(sim);
    // Never onto a slab that's about to come up, when where it stands isn't, unless it's getting
    // out of something worse (its dodges look where they go)
    const player = sim.player;
    const length = Math.hypot(plan?.move.x ?? 0, plan?.move.y ?? 0);
    if (plan && !plan.dodge && length > 0.5 && !floorDanger(sim, player.x, player.y, FLOOR_LOOK)) {
        const aheadX = player.x + (plan.move.x / length) * 1.2;
        const aheadY = player.y + (plan.move.y / length) * 1.2;
        if (crossesSlab(sim, aheadX, aheadY)) {
            return { move: { x: 0, y: 0 }, slot: -1 };
        }
    }
    return plan;
}

function kitChoice(sim: Sim): KitPlan | undefined {
    // As the map's blessings have them (MapDef.blessings): longer, wider, sooner
    const kit = getCharacter(sim.characterId).abilities?.map(
        (ability, slot) => sim.kitAbility(slot)?.ability ?? ability,
    );
    const boss = sim.shownBoss;
    if (kit && sim.lair === undefined) {
        return hordeKit(sim, kit);
    }
    if (!kit || !boss || boss.dead || sim.lair?.state !== "fighting" || sim.tick < boss.risingEnd) {
        return undefined;
    }
    const player = sim.player;
    const away = Math.max(0.001, Math.hypot(boss.x - player.x, boss.y - player.y));
    const towards = { x: (boss.x - player.x) / away, y: (boss.y - player.y) / away };
    const gaze = kit.findIndex((ability) => ability.kind === "gaze");
    const ready = (slot: number) => sim.kitSecondsLeft(slot) === 0;
    const reaches = (slot: number) => away <= kitReach(kit[slot], boss);
    const windup = boss.bossState?.windup;
    // Behind a pillar from a boss's flames (BossAttackDef.cover): fightMove finds the spot
    if (windup?.attack.cover && dodges) {
        const hide = fightMove(sim);
        if (hide) {
            return { move: hide, slot: -1, dodge: true };
        }
    }
    // The dead walking to him (BossDef walkers): each cut down before it's there, the buttons
    // turned on the nearest
    const walker = nearestWalker(sim, boss);
    if (walker) {
        const reach = Math.max(0.001, Math.hypot(walker.x - player.x, walker.y - player.y));
        const at = { x: (walker.x - player.x) / reach, y: (walker.y - player.y) / reach };
        for (let slot = 0; slot < kit.length; slot++) {
            if (slot !== gaze && ready(slot) && reach <= kitReach(kit[slot], walker)) {
                return { move: { x: at.x * 0.01, y: at.y * 0.01 }, slot };
            }
        }
        return { move: reach > 2 ? at : { x: 0, y: 0 }, slot: -1 };
    }
    // The meteor: into the gaze's reach, and cast it
    if (windup?.attack.interruptedBy && gaze >= 0 && gazePlay !== "never") {
        return { move: towards, slot: reaches(gaze) && ready(gaze) ? gaze : -1 };
    }
    // Away from a loose flare about to reach them (EnemyDef.bursts), its burst worse than a slab
    const flee = flareDodge(sim, boss);
    if (flee) {
        return { move: flee, slot: -1, dodge: true };
    }
    // Out of reach of a swing he's winding up (his claw): out of its wedge the quickest way
    if (
        windup?.attack.kind === "swing" &&
        (windup.attack.radius ?? 0) > 0 &&
        away < (windup.attack.radius ?? 0) + player.radius + 0.5
    ) {
        return { move: swingDodge(sim, boss) ?? backOff(sim, towards), slot: -1, dodge: true };
    }
    const dodge = floorDodge(sim) ?? blastDodge(sim);
    if (dodge) {
        return { move: dodge, slot: -1, dodge: true };
    }
    const flare = flareChoice(sim, kit);
    if (flare) {
        return flare;
    }
    // A cast roots them, so not in reach of his claw, nor a lunge into it, unless his guard's down
    const open = sim.isExposed(boss);
    // nor with his fireballs coming, which a person keeps moving under
    const volley = windup?.attack.kind === "blast" || boss.bossState?.chain !== undefined;
    // nor on a slab that's coming up soon, nor a long cast (his lightning) unless he's open
    const floor = sim.floor;
    const tile = floor ? floor.index(Math.floor(player.x), Math.floor(player.y)) : -1;
    const rising = tile >= 0 && floor!.riseAt[tile] >= 0;
    const clear = away >= KIT_STANDOFF - 0.5 && !volley && !rising;
    // With the lunge ready, into reach of the swing that leaves him open when it misses (his
    // claw), to step out of it (swingDodge) and punish him
    const attacks = boss.def.boss?.attacks ?? [];
    const bait = attacks.findIndex((attack) => attack.opens !== undefined && attack.cone);
    const lunge = kit.findIndex((ability) => ability.kind === "lunge");
    if (
        !open &&
        bait >= 0 &&
        lunge >= 0 &&
        sim.kitSecondsLeft(lunge) < 0.5 &&
        (boss.bossState?.cooldowns[bait] ?? 0) < TICKS_PER_SECOND &&
        !volley &&
        !rising
    ) {
        const near = (attacks[bait].range ?? 0) - 0.7;
        return away > near
            ? { move: towards, slot: -1 }
            : { move: { x: towards.x * 0.01, y: towards.y * 0.01 }, slot: -1 };
    }
    for (let slot = 0; slot < kit.length; slot++) {
        const ability = kit[slot];
        if (
            (slot !== gaze || gazePlay === "waste") &&
            (open || (clear && ability.kind !== "lunge" && ability.windup < 1)) &&
            ready(slot) &&
            reaches(slot)
        ) {
            // Turned to him where they stand, a nudge of the stick, unless he's open to a lunge
            const nudge = ability.kind === "lunge" ? 1 : 0.01;
            return { move: { x: towards.x * nudge, y: towards.y * nudge }, slot };
        }
    }
    if (away < KIT_STANDOFF - 1) {
        return { move: backOff(sim, towards), slot: -1 };
    }
    if (away > KIT_STANDOFF + 0.5) {
        return { move: towards, slot: -1 };
    }
    // Round him, one way and then the other
    const side = Math.floor(sim.tick / (6 * TICKS_PER_SECOND)) % 2 === 0 ? 1 : -1;
    return { move: { x: -towards.y * side, y: towards.x * side }, slot: -1 };
}

// Against the hordes (no lair's fight on): each button that's ready turned on the nearest enemy
// it reaches, the gaze too, as a person farming would. Undefined with nothing in reach.
function hordeKit(sim: Sim, kit: HeroAbilityDef[]): KitPlan | undefined {
    const player = sim.player;
    let nearest: Enemy | undefined;
    let away = Infinity;
    for (const enemy of sim.enemies) {
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (!enemy.dead && !enemy.leaving && distance < away) {
            nearest = enemy;
            away = distance;
        }
    }
    if (!nearest) {
        return undefined;
    }
    const towards = {
        x: (nearest.x - player.x) / Math.max(0.001, away),
        y: (nearest.y - player.y) / Math.max(0.001, away),
    };
    for (let slot = 0; slot < kit.length; slot++) {
        if (sim.kitSecondsLeft(slot) === 0 && away <= kitReach(kit[slot], nearest)) {
            return { move: { x: towards.x * 0.01, y: towards.y * 0.01 }, slot };
        }
    }
    return undefined;
}

// The nearest of a boss's walkers still on its way to it (BossDef walkTo), if any
function nearestWalker(sim: Sim, boss: Enemy): Enemy | undefined {
    const player = sim.player;
    let nearest: Enemy | undefined;
    let away = Infinity;
    for (const enemy of boss.bossState?.walkers?.enemies ?? []) {
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (!enemy.dead && distance < away) {
            nearest = enemy;
            away = distance;
        }
    }
    return nearest;
}

// Tiles from a loose flare (EnemyDef.bursts) that it steps away from it, past touching
const FLARE_KEEP = 1.2;

// The way a step and a half takes it furthest from a loose flare that's nearly on it, minding
// the slabs coming up and a swing he's winding up; undefined with none that near
function flareDodge(sim: Sim, boss: Enemy): { x: number; y: number } | undefined {
    const player = sim.player;
    const flares = sim.enemies.filter(
        (e) =>
            !e.dead &&
            e.def.bursts &&
            e.frozen === 0 &&
            Math.hypot(e.x - player.x, e.y - player.y) < e.radius + player.radius + FLARE_KEEP,
    );
    if (flares.length === 0) {
        return undefined;
    }
    const windup = boss.bossState?.windup;
    const swing = windup?.attack.kind === "swing" ? (windup.attack.radius ?? 0) : 0;
    let best: { x: number; y: number } | undefined;
    let bestScore = Infinity;
    for (let i = 0; i < 8; i++) {
        const dx = Math.cos((i * Math.PI) / 4);
        const dy = Math.sin((i * Math.PI) / 4);
        const x = player.x + dx * 1.5;
        const y = player.y + dy * 1.5;
        if (!canWalkStraight(sim.grid, player.x, player.y, x, y)) {
            continue;
        }
        const near = Math.min(...flares.map((f) => Math.hypot(f.x - x, f.y - y)));
        const slab = floorDanger(sim, x, y, FLOOR_LOOK) ? 1 : 0;
        const clawed = swing > 0 && Math.hypot(boss.x - x, boss.y - y) < swing + player.radius;
        const score = -near * 10 + slab * 25 + (clawed ? 40 : 0);
        if (score < bestScore) {
            best = { x: dx, y: dy };
            bestScore = score;
        }
    }
    return best;
}

// His flares (EnemyDef.bursts), as a careful person deals with them: the heal one leaves picked
// up while they're hurt, a loose one held with the button that holds it (or kept away from), and
// a held one broken with the button that breaks it, from a cell of the other colour (a checker's
// cells, HeroAbilityDef kind "checker"). Undefined with nothing to do about them.
function flareChoice(sim: Sim, kit: HeroAbilityDef[]): KitPlan | undefined {
    const player = sim.player;
    // Pressed where it stands: these don't go by where it faces
    const press = (slot: number): KitPlan => ({
        move: { x: player.facingX * 0.01, y: player.facingY * 0.01 },
        slot,
    });
    // Food in the lair: what the hordes dropped outside it is out of reach behind its seal
    const lair = sim.lair;
    const heal = sim.pickups.find(
        (pickup) => pickup.kind === "food" && (lair === undefined || sim.inLair(lair, pickup)),
    );
    if (heal && player.hp < player.maxHp) {
        const dx = heal.x - player.x;
        const dy = heal.y - player.y;
        const length = Math.max(0.001, Math.hypot(dx, dy));
        return { move: { x: dx / length, y: dy / length }, slot: -1 };
    }
    let flare: Enemy | undefined;
    let nearest = Infinity;
    for (const enemy of sim.enemies) {
        const away = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (!enemy.dead && enemy.def.bursts?.shatter && away < nearest) {
            flare = enemy;
            nearest = away;
        }
    }
    if (!flare || sim.isCasting()) {
        return undefined;
    }
    const shatter = flare.def.bursts!.shatter!;
    const hold = kit.findIndex((ability) => ability.id === shatter.frozenBy);
    const breaks = kit.findIndex((ability) => ability.id === shatter.shatteredBy);
    const ready = (slot: number) => slot >= 0 && sim.kitSecondsLeft(slot) === 0;
    if (flare.frozen === 0) {
        // Rooted while it lands, so not with the flare about to get there first; and only with
        // the heal wanted and the button that breaks it ready in time, or those buttons are
        // better spent on him
        const lands = (kit[hold]?.windup ?? 0) * flare.def.speed + flare.radius + player.radius;
        const wanted = player.hp <= player.maxHp - shatter.heal;
        const inTime =
            breaks >= 0 &&
            sim.kitSecondsLeft(breaks) + kit[breaks].windup + 0.5 <
                (kit[hold]?.windup ?? 0) + shatter.frozen;
        if (
            wanted &&
            inTime &&
            ready(hold) &&
            nearest <= kit[hold].length &&
            nearest > lands + 0.5
        ) {
            return press(hold);
        }
        // Out of its way, or it bursts on them
        if (nearest < 3.5) {
            const length = Math.max(0.001, nearest);
            return {
                move: { x: (player.x - flare.x) / length, y: (player.y - flare.y) / length },
                slot: -1,
                dodge: true,
            };
        }
        return undefined;
    }
    if (breaks < 0) {
        return undefined;
    }
    const ability = kit[breaks];
    // Too late to break it before it's loose again
    const left = flare.frozen / TICKS_PER_SECOND;
    if (left < ability.windup + sim.kitSecondsLeft(breaks) + 0.1) {
        return undefined;
    }
    const size = ability.size ?? 3;
    const cell = (v: number) => Math.floor(v / size);
    const colour = (x: number, y: number) => (cell(x) + cell(y)) & 1;
    const middleX = (cell(flare.x) + 0.5) * size;
    const middleY = (cell(flare.y) + 0.5) * size;
    const struck =
        colour(player.x, player.y) !== colour(flare.x, flare.y) &&
        Math.hypot(middleX - player.x, middleY - player.y) <= ability.length;
    if (struck) {
        return ready(breaks) ? press(breaks) : { move: { x: 0, y: 0 }, slot: -1 };
    }
    // Into the nearest cell beside its own, which is the other colour
    let to = { x: 0, y: 0 };
    let best = Infinity;
    for (const [cx, cy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ]) {
        const x = middleX + cx * size;
        const y = middleY + cy * size;
        const d = Math.hypot(x - player.x, y - player.y);
        if (d < best) {
            best = d;
            to = { x: (x - player.x) / Math.max(d, 0.001), y: (y - player.y) / Math.max(d, 0.001) };
        }
    }
    return { move: to, slot: -1 };
}

// The way out of a cone swing's reach (BossAttackDef.cone) that gets out soonest: walked for
// what's left of its windup, wherever that ends up out of it, the way the floor's safe
function swingDodge(sim: Sim, boss: Enemy): { x: number; y: number } | undefined {
    const windup = boss.bossState!.windup!;
    const attack = windup.attack;
    const player = sim.player;
    const reach = (attack.radius ?? 0) + player.radius + 0.3;
    const under = (attack.underRadius ?? 0) + player.radius + 0.3;
    const out = (x: number, y: number) => {
        const dx = x - boss.x;
        const dy = y - boss.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= reach) {
            return true;
        }
        if (attack.cone === undefined || distance <= under) {
            return false;
        }
        // The wedge's edge, with the player's width to spare
        const along = (dx * windup.dirX + dy * windup.dirY) / distance;
        const spare = Math.asin(Math.min(1, (player.radius + 0.3) / distance));
        return Math.acos(Math.max(-1, Math.min(1, along))) >= attack.cone / 2 + spare;
    };
    const speed = (2 / 0.6) * (1 + sim.stats.moveSpeed);
    const left = Math.max(0, windup.landTick - sim.tick) / TICKS_PER_SECOND;
    let best: { x: number; y: number } | undefined;
    let bestSteps = Infinity;
    for (let i = 0; i < 16; i++) {
        const dx = Math.cos((i * Math.PI) / 8);
        const dy = Math.sin((i * Math.PI) / 8);
        // The first step along it that's out, if it gets there in time
        for (let step = 1; step <= 12; step++) {
            const travel = (step / 12) * speed * left;
            const x = player.x + dx * travel;
            const y = player.y + dy * travel;
            if (!canWalkStraight(sim.grid, player.x, player.y, x, y)) {
                break;
            }
            if (out(x, y) && !floorDanger(sim, x, y, FLOOR_LOOK) && !crossesSlab(sim, x, y)) {
                if (step < bestSteps) {
                    best = { x: dx, y: dy };
                    bestSteps = step;
                }
                break;
            }
        }
    }
    return best;
}

// Whether walking straight to a point from where the player is crosses a slab (MapDef.floor) as
// it comes up, or one that's up and hurting
function crossesSlab(sim: Sim, x: number, y: number): boolean {
    const floor = sim.floor;
    if (!floor) {
        return false;
    }
    const player = sim.player;
    const away = Math.hypot(x - player.x, y - player.y);
    // Ticks a tile of walking takes
    const pace = TICKS_PER_SECOND / ((2 / 0.6) * (1 + sim.stats.moveSpeed));
    for (let s = 0.25; s <= away + 0.01; s += 0.25) {
        const tx = Math.floor(player.x + ((x - player.x) * Math.min(s, away)) / away);
        const ty = Math.floor(player.y + ((y - player.y) * Math.min(s, away)) / away);
        const i = floor.index(tx, ty);
        const rise = i >= 0 ? floor.riseAt[i] : -1;
        if (floor.isHurting(tx, ty, sim.tick) || (rise >= 0 && rise <= sim.tick + s * pace + 15)) {
            return true;
        }
    }
    return false;
}

// Whether the slab at a point (MapDef.floor) comes up within look ticks, or is up and hurting
function floorDanger(sim: Sim, x: number, y: number, look: number): boolean {
    const floor = sim.floor;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const i = floor ? floor.index(tx, ty) : -1;
    if (i < 0) {
        return false;
    }
    const rise = floor!.riseAt[i];
    return (rise >= 0 && rise <= sim.tick + look) || floor!.isHurting(tx, ty, sim.tick);
}

// Off a tile whose slab's about to come up (MapDef.floor), to the nearest that isn't, by a way
// that crosses no slab as it comes up
function floorDodge(sim: Sim): { x: number; y: number } | undefined {
    const floor = sim.floor;
    if (!floor) {
        return undefined;
    }
    const player = sim.player;
    const danger = (tx: number, ty: number) => floorDanger(sim, tx, ty, FLOOR_LOOK);
    const tx = Math.floor(player.x);
    const ty = Math.floor(player.y);
    if (!danger(tx, ty)) {
        return undefined;
    }
    // Nor beside a flare that's loose (EnemyDef.bursts), which bursts on them there
    const flares = sim.enemies.filter((e) => !e.dead && e.def.bursts && e.frozen === 0);
    const byFlare = (x: number, y: number) =>
        flares.some((f) => Math.hypot(f.x - x, f.y - y) < f.radius + player.radius + 0.8);
    let best: { x: number; y: number } | undefined;
    let bestAway = Infinity;
    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
            const x = tx + dx;
            const y = ty + dy;
            const i = floor.index(x, y);
            const away = Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y);
            if (
                away >= bestAway ||
                i < 0 ||
                !floor.layout.mask[i] ||
                danger(x, y) ||
                byFlare(x + 0.5, y + 0.5) ||
                !canWalkStraight(sim.grid, player.x, player.y, x + 0.5, y + 0.5) ||
                crossesSlab(sim, x + 0.5, y + 0.5)
            ) {
                continue;
            }
            best = { x: x + 0.5, y: y + 0.5 };
            bestAway = away;
        }
    }
    if (!best) {
        return undefined;
    }
    return { x: (best.x - player.x) / bestAway, y: (best.y - player.y) / bestAway };
}

// Out of where a boss's blast is coming down, and off the fire it leaves
function blastDodge(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    const spots: { x: number; y: number; radius: number }[] = [...sim.pools];
    for (const enemy of sim.enemies) {
        const windup = enemy.bossState?.windup;
        if (windup?.attack.kind === "blast" && !enemy.dead) {
            const radius = windup.attack.radius ?? 2;
            spots.push(...windup.targets.map((spot) => ({ ...spot, radius })));
        }
    }
    // and the map's fires that burn (MapDef.burns)
    const burning = (x: number, y: number) =>
        sim.map.burns && sim.grid.burnsAt(Math.floor(x), Math.floor(y)) ? 1 : 0;
    const inside = (x: number, y: number) =>
        spots.filter((s) => Math.hypot(x - s.x, y - s.y) < s.radius + player.radius + 0.3).length +
        burning(x, y);
    if (inside(player.x, player.y) === 0) {
        return undefined;
    }
    // The way a step and a half takes it out of the fewest, on open floor: the way it was
    // already going if that does, or else the way it's going towards the middle
    const arena = sim.bossArena;
    const middleX = (arena.minX + arena.maxX) / 2;
    const middleY = (arena.minY + arena.maxY) / 2;
    let best: { x: number; y: number } | undefined;
    let bestScore = Infinity;
    for (let i = 0; i < 8; i++) {
        const dx = Math.cos((i * Math.PI) / 4);
        const dy = Math.sin((i * Math.PI) / 4);
        const x = player.x + dx * 1.5;
        const y = player.y + dy * 1.5;
        if (!canWalkStraight(sim.grid, player.x, player.y, x, y)) {
            continue;
        }
        const kept = lastDodge ? dx * lastDodge.x + dy * lastDodge.y : 0;
        const slab = floorDanger(sim, x, y, FLOOR_LOOK) ? 1 : 0;
        const score =
            inside(x, y) * 100 + slab * 150 + Math.hypot(x - middleX, y - middleY) * 0.2 - kept * 3;
        if (score < bestScore) {
            best = { x: dx, y: dy };
            bestScore = score;
        }
    }
    lastDodge = best;
    return best;
}
let lastDodge: { x: number; y: number } | undefined;

// Backing off from the boss, or round it where there's a wall behind
function backOff(sim: Sim, towards: { x: number; y: number }): { x: number; y: number } {
    const player = sim.player;
    const open = (x: number, y: number) =>
        canWalkStraight(sim.grid, player.x, player.y, player.x + x * 1.5, player.y + y * 1.5) &&
        !floorDanger(sim, player.x + x, player.y + y, FLOOR_LOOK);
    if (open(-towards.x, -towards.y)) {
        return { x: -towards.x, y: -towards.y };
    }
    // Round it, whichever way's open (the way it was going first)
    const side = Math.floor(sim.tick / (6 * TICKS_PER_SECOND)) % 2 === 0 ? 1 : -1;
    for (const s of [side, -side]) {
        if (open(-towards.y * s, towards.x * s)) {
            return { x: -towards.y * s, y: towards.x * s };
        }
    }
    return { x: -towards.y * side, y: towards.x * side };
}

// Lets go of a kit's button once they're turned to the boss (it goes where they face)
function useKit(sim: Sim, plan: { move: { x: number; y: number }; slot: number }): void {
    const player = sim.player;
    const length = Math.hypot(plan.move.x, plan.move.y) || 1;
    const facing = (player.facingX * plan.move.x + player.facingY * plan.move.y) / length;
    if (plan.slot >= 0 && facing >= 0.9) {
        sim.useAbility(plan.slot);
    }
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

// Where a run starts: at a map's lair, as a retry does (getRetryLair), or its spawn; at LAIR's
// with no farming first
const START =
    (lairTarget !== undefined && farmSeconds === 0
        ? map.lairs?.find((lair) => lair.id === lairTarget)?.start
        : getRetryLair(map)?.start) ?? map.spawn;

// The lair the bot goes for (LAIR), set up as it asks: Yama's generals beaten for him, and its
// rival for an empowered one
function prepareLair(sim: Sim): Lair | undefined {
    if (lairTarget === undefined) {
        return undefined;
    }
    const lair = sim.lairById(lairTarget);
    if (!lair) {
        throw new Error(`No lair ${lairTarget} on ${map.id}`);
    }
    for (const id of lair.def.requires?.lairs ?? []) {
        sim.lairById(id)!.state = "beaten";
    }
    // and its unsealing's cinematic (LairUnsealingDef) as good as skipped: open at the first step
    if (lair.def.requires) {
        lair.unsealTick = lair.unsealLiftTick = lair.unsealEndTick = sim.tick;
    }
    if (empoweredLair) {
        if (!lair.def.empowered) {
            throw new Error(`Lair ${lairTarget} is never empowered`);
        }
        lair.empowered = true;
    }
    return lair;
}

function runOnce(characterId: string, seed: number, gauntlet?: GauntletFightOptions) {
    const sim = new Sim({
        grid,
        characterId,
        metaStats,
        seed,
        mapId: map.id,
        spawnX: START.x,
        spawnY: START.y,
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
    // The lair it's going for
    const lair = prepareLair(sim);
    let lairWoken = false;
    let wokenAt = { seconds: 0, level: 0 };
    // Its boss's share of hitpoints left, as last seen in the fight
    let lairHpLeft = 1;
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
    while (sim.tick < maxTicks && !sim.runOver && lair?.state !== "beaten") {
        tombsLog?.step(sim);
        // Done farming: into the lair it's going for, which wakes it
        if (lair && !lairWoken && lair.state === "asleep" && sim.seconds >= farmSeconds) {
            sim.player.x = lair.def.start.x;
            sim.player.y = lair.def.start.y;
        }
        if (lair && !lairWoken && lair.state === "fighting") {
            lairWoken = true;
            wokenAt = { seconds: sim.seconds, level: sim.level };
        }
        if (lair?.state === "fighting" && lair.boss && !lair.boss.dead) {
            lairHpLeft = Math.max(0, lair.boss.hp) / Math.max(1, lair.boss.maxHp);
        }
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
        // The Tombs' bot steers every tick: plates and mirrors want it exact; so does a hero with
        // buttons of their own (CharacterDef.abilities), turned to what each lands on
        const planned = tombsMove(sim);
        const kit = planned ? undefined : kitPlan(sim);
        if (planned) {
            move = planned;
        } else if (kit) {
            move = kit.move;
            useKit(sim, kit);
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
        if (process.env.SAFE_WAVES === "1" && !sim.bossSpawned && sim.lair === undefined) {
            sim.player.hp = sim.player.maxHp;
        }
        if (process.env.GOD === "1") {
            // Untouchable, as a late endless round's hits are bigger than any health bar, and
            // whole, as a rising floor's slabs hurt through that
            sim.player.invulnerable = 1e9;
            sim.player.hp = sim.player.maxHp;
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
            // A map with blessings has those for passives
            const passives = (
                sim.map.blessings
                    ? sim.blessings.map((b) => ({ id: b.id, level: b.count }))
                    : sim.passives
            )
                .map((p) => `${p.id}:${p.level}`)
                .join(" ");
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
    if (lair && lairWoken) {
        console.log(
            `  ${lair.def.id}${lair.empowered ? " (empowered)" : ""}: woken at ` +
                `${formatClock(wokenAt.seconds)}, level ${wokenAt.level}, ` +
                (lair.state === "beaten"
                    ? `beaten in ${Math.round(sim.seconds - wokenAt.seconds)}s`
                    : `${sim.state === "dead" ? "killed the bot" : "still up"} at ` +
                      `${Math.round(100 * lairHpLeft)}% ` +
                      `after ${Math.round(sim.seconds - wokenAt.seconds)}s`),
        );
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
        `${characterId} seed ${seed}: ${result.victory || lair?.state === "beaten" ? "VICTORY" : sim.state === "dead" ? "died" : "timed out"} at ` +
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
        spawnX: START.x,
        spawnY: START.y,
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
                const kit = planned ? undefined : kitPlan(sim);
                if (planned) {
                    moves[hero.index] = planned;
                } else if (kit) {
                    moves[hero.index] = kit.move;
                    useKit(sim, kit);
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
    const outcome =
        result.victory || sim.lair?.state === "beaten"
            ? "VICTORY"
            : sim.state === "dead"
              ? "died"
              : "timed out";
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
