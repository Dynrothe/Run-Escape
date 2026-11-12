// The balance bot's Tombs of Amascut: where to go in the Nexus, each path's puzzle room and
// boss, and the Wardens, as a person who knows the raid plays it. It only moves (weapons fire on
// their own), reading the sim as it likes. Nothing here touches the DOM or Node, so the game's
// dev console can drive a run with it too (see docs/design/tombs-of-amascut.md).
import { getItem } from "../../src/game/content/items";
import { getRaidSupply } from "../../src/game/content/raids";
import {
    BA_BA,
    CRONDIS,
    HET,
    JUNGLE_JAPES,
    TOMBS_ENEMIES,
    WARDENS,
    ZEBAK,
} from "../../src/game/content/tombs";
import { getWeapon, getWeaponStyle } from "../../src/game/content/weapons";
import { ChestAction, shouldWear } from "../../src/game/core/Loot";
import { PLAYER_SPEED, type Sim, wardenFrontRow } from "../../src/game/core/Sim";
import { type UpgradeChoice } from "../../src/game/core/Upgrades";
import { isCircleFree } from "../../src/game/core/world/Collision";
import { FlowField, canStep } from "../../src/game/core/world/FlowField";
import {
    buttonMove,
    cageGap,
    coneStep,
    laneStep,
    lungeStep,
    offTether,
    pressButton,
    wallGap,
} from "./bossReads";

type Point = { x: number; y: number };

// The order the bot takes the paths in (as a person picks theirs: setPathOrder), and the flow
// field it walks by (a window this many tiles across round its target, which holds any one room)
export const DEFAULT_PATH_ORDER = ["apmeken", "het", "scabaras", "crondis"];
let PATH_ORDER = DEFAULT_PATH_ORDER;

// The order the bot takes the paths in from now on; any left out come after, in the default's
export function setPathOrder(order: string[]): void {
    PATH_ORDER = [...order, ...DEFAULT_PATH_ORDER.filter((id) => !order.includes(id))];
}
const FIELD_SIZE = 128;

const fields = new WeakMap<Sim, FlowField>();

// A step towards a tile by the flow field, round walls; straight at it once close, and straight
// at it too if it can't be reached (a target in a wall)
export function walkTo(sim: Sim, x: number, y: number): Point {
    const player = sim.player;
    const dx = x - player.x;
    const dy = y - player.y;
    const away = Math.hypot(dx, dy);
    if (away < 0.15) {
        return { x: 0, y: 0 };
    }
    if (away < 1.5) {
        return { x: dx / away, y: dy / away };
    }
    let field = fields.get(sim);
    if (!field) {
        field = new FlowField(FIELD_SIZE);
        fields.set(sim, field);
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const grid = sim.grid;
    if (field.targetX !== tx || field.targetY !== ty || field.gridVersion !== (grid.version ?? 0)) {
        field.update(grid, tx, ty);
    }
    const step = { x: 0, y: 0 };
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    if (!field.getStep(grid, px, py, step)) {
        return { x: dx / away, y: dy / away };
    }
    // To the next tile's middle, so the bot doesn't clip corners
    const nx = px + step.x + 0.5 - player.x;
    const ny = py + step.y + 0.5 - player.y;
    const len = Math.hypot(nx, ny) || 1;
    return { x: nx / len, y: ny / len };
}

// walkTo, keeping a tile clear round each of these spots (mirrors it mustn't brush, plates it
// mustn't step on): they're walls to its flow field
const avoidFields = new WeakMap<Sim, { field: FlowField; key: string }>();

export function walkAvoiding(
    sim: Sim,
    x: number,
    y: number,
    avoid: Point[],
    around = 1,
    // With no way round, the plain way (false: stand still instead)
    fallBack = true,
): Point {
    const player = sim.player;
    const dx = x - player.x;
    const dy = y - player.y;
    const away = Math.hypot(dx, dy);
    if (away < 1.5) {
        return nudge(sim, x, y);
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    const blocked = new Set<number>();
    for (const spot of avoid) {
        const sx = Math.floor(spot.x);
        const sy = Math.floor(spot.y);
        for (let ox = -around; ox <= around; ox++) {
            for (let oy = -around; oy <= around; oy++) {
                const bx = sx + ox;
                const by = sy + oy;
                // Never the target's tile, nor the one the bot's on (brushing an edge of what
                // it's keeping clear of mustn't have it give up and walk straight through)
                if ((bx !== tx || by !== ty) && (bx !== px || by !== py)) {
                    blocked.add(bx * 100000 + by);
                }
            }
        }
    }
    const grid = sim.grid;
    const walls = {
        isSolid: (gx: number, gy: number) => blocked.has(gx * 100000 + gy) || grid.isSolid(gx, gy),
        getFlags: (gx: number, gy: number) => grid.getFlags(gx, gy),
    };
    const key = `${tx},${ty},${grid.version ?? 0},${[...blocked].join(",")}`;
    let cached = avoidFields.get(sim);
    if (!cached || cached.key !== key) {
        const field = cached?.field ?? new FlowField(FIELD_SIZE);
        field.update(walls, tx, ty);
        cached = { field, key };
        avoidFields.set(sim, cached);
    }
    const step = { x: 0, y: 0 };
    if (!cached.field.getStep(walls, px, py, step)) {
        // Boxed in by what it's keeping clear of (standing in it): the plain way
        return fallBack ? walkTo(sim, x, y) : { x: 0, y: 0 };
    }
    const nx = px + step.x + 0.5 - player.x;
    const ny = py + step.y + 0.5 - player.y;
    const len = Math.hypot(nx, ny) || 1;
    return { x: nx / len, y: ny / len };
}

// Where the bot's going in the Tombs, or undefined to leave it to the usual bot (fighting waves)
export function tombsMove(sim: Sim): Point | undefined {
    const tombs = sim.map.tombs;
    if (!tombs) {
        return undefined;
    }
    if (sim.tombsWardens) {
        // Food spilled as a phase ends, picked up when it's wanted
        return foodMove(sim) ?? wardensMove(sim);
    }
    if (sim.tombsPath === undefined) {
        return casketMove(sim) ?? nexusMove(sim);
    }
    const path = tombs.paths.find((p) => p.id === sim.tombsPath);
    const room = sim.tombsRoom;
    const def = path?.room;
    if (!path || !def || !room) {
        return undefined;
    }
    if (room.boss && def.boss) {
        const quiet = room.boss.uid === -1 || room.boss.beatenTick !== undefined;
        return (quiet ? casketMove(sim) : undefined) ?? bossMove(sim, def.boss, room.boss.uid);
    }
    // Through the barrier into the room: a few tiles past its line, away from the safe corridor
    if (!room.started && def.gate) {
        if (def.gate.x === undefined) {
            return walkTo(sim, def.arrive.x, (def.gate.y ?? def.arrive.y) + 3);
        }
        const into = def.gate.x < def.arrive.x ? -3 : 3;
        return walkTo(sim, def.gate.x + into, def.arrive.y);
    }
    return puzzleMove(sim, def);
}

// The raid's fight button (TombsDef.ability), pressed whenever what it'd land on has its guard
// down, as the quest's bot does (bossReads)
export function tombsButton(sim: Sim): void {
    if (sim.map.tombs && SMITES) {
        pressButton(sim);
    }
}

// Whether the bot uses the button at all (a sim's SMITE=0: a person won't press it on every
// window, so a fight's length without it is worth knowing)
let SMITES = true;
export function setSmites(on: boolean): void {
    SMITES = on;
}

// In to the boss whose guard is down while the button's ready (bossReads), if it uses it
function punishMove(sim: Sim): Point | undefined {
    return SMITES ? buttonMove(sim) : undefined;
}

// Wears gear unless what's worn is better (counting sets, like the casket's
// advice), keeps utility items when they fit
export function chestAction(sim: Sim): ChestAction {
    const chest = sim.chest!;
    const item = getItem(chest.itemId);
    if (item.kind === "utility") {
        return sim.canStash(item.id) ? "take" : "use";
    }
    return shouldWear(sim.gear, sim.gearUpgrades, item, chest.upgrades) ? "take" : "alch";
}

// For both bots' level ups: a keris pick's place in its list (the plain one 0, Amascut's last), so
// the bot sets the best jewel it has, as a player would. 0 for anything else, so the Ancient spell
// and hilt picks go as they always have.
export function kerisPickRank(choice: UpgradeChoice): number {
    if (choice.kind !== "hilt" || getWeapon(choice.into).family !== "keris") {
        return 0;
    }
    return getWeapon(choice.weaponId).hilts?.into.findIndex((i) => i.weaponId === choice.into) ?? 0;
}

// Eats when hurt, throws chinchompas into crowds, drinks antidotes when
// poisoned or drained, uses everything else straight away
export function useItems(sim: Sim): void {
    const player = sim.player;
    let near = 0;
    for (const enemy of sim.enemies) {
        if (!enemy.dead && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 5) {
            near++;
        }
    }
    sim.inventory.forEach((slot, index) => {
        const item = slot && getItem(slot.itemId);
        if (!item || item.kind !== "utility") {
            return;
        }
        const use = item.use.kind;
        // The Helpful Spirit's supplies: heals when hurt, Tears when poisoned or drained, the
        // rest once a boss is out
        if (item.use.kind === "supply") {
            const effect = getRaidSupply(item.use.supplyId).effect;
            const boss = sim.enemies.some((enemy) => enemy.boss && !enemy.dead);
            if (
                effect.kind === "heal"
                    ? player.hp < player.maxHp * 0.5
                    : effect.cures
                      ? player.poisonEnd !== -1 || sim.debuffs.length > 0
                      : boss
            ) {
                sim.useItem(index);
            }
            return;
        }
        if (
            (use === "heal" && player.hp < player.maxHp * 0.5) ||
            (use === "blast" && near >= 15) ||
            (use === "cure" && (player.poisonEnd !== -1 || sim.debuffs.length > 0)) ||
            use === "buff" ||
            use === "bones" ||
            use === "xp"
        ) {
            sim.useItem(index);
        }
    });
}

// A casket on the floor near enough, at a moment there's nothing else to do (in the Nexus, or a
// boss's arena before it's up or once it's down): caskets aren't pulled in as bones are, so a
// person walks over to one
const CASKET_REACH = 12;

function casketMove(sim: Sim): Point | undefined {
    const player = sim.player;
    let best: Point | undefined;
    let bestDistance = CASKET_REACH;
    for (const pickup of sim.pickups) {
        if (
            pickup.kind !== "casket" ||
            sim.grid.isSolid(Math.floor(pickup.x), Math.floor(pickup.y))
        ) {
            continue;
        }
        const distance = Math.hypot(pickup.x - player.x, pickup.y - player.y);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = pickup;
        }
    }
    return best && walkTo(sim, best.x, best.y);
}

// The Nexus: the Helpful Spirit while it has a bundle for this hero, the next path's door, then
// the way to the Wardens
function nexusMove(sim: Sim): Point {
    const tombs = sim.map.tombs!;
    const self = sim.heroes.find((hero) => hero.player === sim.player)!;
    if (tombs.spirit && sim.tombsSpiritBundles(self.index) > 0) {
        return walkTo(sim, tombs.spirit.x, tombs.spirit.y);
    }
    const next = PATH_ORDER.map((id) => tombs.paths.find((p) => p.id === id)).find(
        (path) => path?.room && !sim.tombsPathsDone.includes(path.id),
    );
    const to = openNear(sim, next?.door ?? tombs.wardensDoor ?? tombs.nexus, 2.5, tombs.nexus);
    // Every path done: the Wardens' first phase opens with their shots, each a share of your
    // hitpoints, so a hero that's low waits by their door for its hitpoints to come back (while
    // they do: Dehydration stops that), as a player would before stepping in
    if (
        !next &&
        sim.player.hp < sim.player.maxHp * 0.9 &&
        sim.stats.regen > 0 &&
        !sim.invocations.includes("dehydration")
    ) {
        const player = sim.player;
        if (Math.hypot(to.x - player.x, to.y - player.y) < 4) {
            // Not for ever, should something keep them down
            const since = doorWait.get(sim) ?? sim.tick;
            doorWait.set(sim, since);
            if (sim.tick - since < DOOR_WAIT_TICKS) {
                return { x: 0, y: 0 };
            }
        }
    }
    return walkTo(sim, to.x, to.y);
}

const doorWait = new WeakMap<Sim, number>();
const DOOR_WAIT_TICKS = 180 * 50;

// The open tile within reach of a spot (a door set in a wall) nearest another (where the bot's
// coming from); the spot itself if it's open
function openNear(sim: Sim, spot: Point, reach: number, from: Point): Point {
    if (!sim.grid.isSolid(Math.floor(spot.x), Math.floor(spot.y))) {
        return spot;
    }
    let best = spot;
    let bestAway = Infinity;
    const r = Math.ceil(reach);
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const x = Math.floor(spot.x) + dx + 0.5;
            const y = Math.floor(spot.y) + dy + 0.5;
            if (
                Math.hypot(x - spot.x, y - spot.y) > reach ||
                sim.grid.isSolid(Math.floor(x), Math.floor(y))
            ) {
                continue;
            }
            const away = Math.hypot(x - from.x, y - from.y);
            if (away < bestAway) {
                bestAway = away;
                best = { x, y };
            }
        }
    }
    return best;
}

type PathRoom = NonNullable<NonNullable<Sim["map"]["tombs"]>["paths"][number]["room"]>;
type CrondisPlaces = NonNullable<PathRoom["crondis"]>;
type PathBoss = NonNullable<PathRoom["boss"]>;

// How hard to push towards a point close by, so the bot stops on it rather than past it (input
// below 1 walks slower)
export function nudge(sim: Sim, x: number, y: number): Point {
    const dx = x - sim.player.x;
    const dy = y - sim.player.y;
    const away = Math.hypot(dx, dy);
    if (away < 0.04) {
        return { x: 0, y: 0 };
    }
    const k = Math.min(1, away / 0.3) / away;
    return { x: dx * k, y: dy * k };
}

// Fighting a room's waves round a spot: away from enemies close by, back towards the spot
export function kite(sim: Sim, anchor: Point, keep = 3): Point {
    const player = sim.player;
    let ax = 0;
    let ay = 0;
    for (const enemy of sim.enemies) {
        if (enemy.dead || enemy.def.stationary) {
            continue;
        }
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < keep * keep * 4) {
            const w = 1 / Math.max(d2, 0.25);
            ax += dx * w;
            ay += dy * w;
        }
    }
    const len = Math.hypot(ax, ay);
    const fx = anchor.x - player.x;
    const fy = anchor.y - player.y;
    const far = Math.hypot(fx, fy);
    if (len < 1e-6 || far > keep * 2) {
        return far < 0.5 ? { x: 0, y: 0 } : walkTo(sim, anchor.x, anchor.y);
    }
    // A point a few tiles away from the crowd, pulled towards the spot, walked to round walls
    return walkTo(
        sim,
        player.x + (ax / len) * keep + fx * 0.3,
        player.y + (ay / len) * keep + fy * 0.3,
    );
}

function puzzleMove(sim: Sim, def: PathRoom): Point | undefined {
    const room = sim.tombsRoom!;
    if (room.doneTick !== undefined) {
        return { x: 0, y: 0 };
    }
    // Co-op: one player works a puzzle that two would undo between them (mirrors, plates); the
    // rest fight beside them, clear of what they'd set off. Water's each player's own to carry.
    if (def.puzzle !== "crondis" && !isLeader(sim)) {
        return helperMove(sim, def);
    }
    switch (def.puzzle) {
        case "apmeken":
            return apmekenMove(sim, def);
        case "het":
            return room.het ? hetMove(sim, def) : undefined;
        case "scabaras":
            return room.scabaras ? scabarasMove(sim, def) : undefined;
        case "crondis":
            return room.crondis ? crondisMove(sim, def) : undefined;
    }
    return undefined;
}

// The party's first player up, who works the puzzles
function isLeader(sim: Sim): boolean {
    const leader = sim.heroes.find((hero) => !hero.down && !hero.left);
    return leader === sim["hero"];
}

// A player helping the puzzle's worker: near them, off the mirrors and plates, fighting
function helperMove(sim: Sim, def: PathRoom): Point {
    const leader = sim.heroes.find((hero) => !hero.down && !hero.left)!;
    const room = sim.tombsRoom!;
    const avoid: Point[] = [
        ...(room.het?.mirrors ?? []),
        ...(def.scabaras
            ? [
                  ...def.scabaras.sequence,
                  ...def.scabaras.lights,
                  ...def.scabaras.addition,
                  ...def.scabaras.matching.north,
                  ...def.scabaras.matching.south,
              ]
            : []),
    ];
    const near = (p: Point) =>
        avoid.some((a) => Math.abs(a.x - p.x) < 1.6 && Math.abs(a.y - p.y) < 1.6);
    const player = sim.player;
    // A spot of its own a few tiles off the worker, on open floor clear of all of it: round them,
    // each helper starting from its own side
    const index = sim["hero"].index;
    let to: Point | undefined;
    for (let r = 3; r <= 9 && !to; r++) {
        for (let k = 0; k < 8 && !to; k++) {
            const angle = ((index * 3 + k) / 8) * Math.PI * 2;
            const spot = {
                x: Math.floor(leader.player.x + Math.cos(angle) * r) + 0.5,
                y: Math.floor(leader.player.y + Math.sin(angle) * r) + 0.5,
            };
            if (!near(spot) && !sim.grid.isSolid(Math.floor(spot.x), Math.floor(spot.y))) {
                to = spot;
            }
        }
    }
    if (!to || Math.hypot(to.x - player.x, to.y - player.y) < 1.2) {
        return near(player) ? { x: 0, y: 0 } : dodging(sim, { x: 0, y: 0 });
    }
    return walkAvoiding(sim, to.x, to.y, avoid, 1, false);
}

// Apmeken: the issue that's up, stood at till it's fixed; the waves fought round the room's middle
function apmekenMove(sim: Sim, def: PathRoom): Point {
    const issue = sim.tombsIssue;
    if (issue) {
        const spot = def.spots!.find((s) => s.x === issue.x && s.y === issue.y);
        const reach = (spot?.reach ?? 2) - 0.6;
        const away = Math.hypot(issue.x - sim.player.x, issue.y - sim.player.y);
        return away <= reach ? { x: 0, y: 0 } : walkTo(sim, issue.x, issue.y);
    }
    const spots = def.spots ?? [];
    const middle =
        spots.length > 0
            ? {
                  x: spots.reduce((sum, s) => sum + s.x, 0) / spots.length,
                  y: spots.reduce((sum, s) => sum + s.y, 0) / spots.length,
              }
            : def.arrive;
    // Round the room's middle, out of the baboons' shots
    return dodging(sim, kite(sim, middle));
}

// Het: every loose mirror picked up, each set on a spot the beam's way wants (the room's own
// answer, as a person works it out) and turned there, whatever stops the beam cleaned, each worn
// barrier's circle stood in till it breaks, then the seal's ring while it's open; out of an Orb
// of Darkness's line whatever it's doing
function hetMove(sim: Sim, def: PathRoom): Point {
    const het = sim.tombsRoom!.het!;
    const hero = sim["hero"].index;
    const player = sim.player;
    const lying = het.mirrors.filter((m) => m.carrier === undefined);
    const solids = (but?: { x: number; y: number }) =>
        [...lying, ...het.barriers].filter((thing) => thing !== but);
    // Round what's solid, but first off anything it's against that it isn't going for: the
    // tiles round each are walls to its way, its own tile walled in with them
    const walkHet = (x: number, y: number, avoid: Point[]): Point => {
        // Its way round what's solid, unless there's none from here (walled in its own tile by
        // what's beside it): then a step off whatever it's against first
        const way = walkAvoiding(sim, x, y, avoid);
        if (Math.hypot(way.x, way.y) > 0.05 || Math.hypot(x - player.x, y - player.y) <= 1.5) {
            return way;
        }
        const against = avoid.find(
            (thing) =>
                Math.hypot(thing.x - player.x, thing.y - player.y) < 1.5 &&
                Math.hypot(thing.x - x, thing.y - y) > 0.5,
        );
        if (against) {
            const away = Math.hypot(player.x - against.x, player.y - against.y) || 1;
            const step = { x: (player.x - against.x) / away, y: (player.y - against.y) / away };
            // Only onto open floor, and not back over the way in's barrier
            const to = { x: player.x + step.x, y: player.y + step.y };
            const gate = sim.tombsPathRoom?.gate;
            const back = gate?.y !== undefined && player.y >= gate.y && to.y < gate.y + 0.5;
            if (!back && !sim.grid.isSolid(Math.floor(to.x), Math.floor(to.y))) {
                return step;
            }
        }
        return way;
    };
    // Onto a spot or into a circle, and still there
    const standOn = (at: Point, avoid: Point[]): Point =>
        Math.hypot(at.x - player.x, at.y - player.y) < 0.3
            ? { x: 0, y: 0 }
            : walkHet(at.x, at.y, avoid);
    // Into a mirror once, stepping back to go in again
    const bump = (mirror: { x: number; y: number; touching: boolean[] }): Point => {
        const away = Math.hypot(mirror.x - player.x, mirror.y - player.y) || 1;
        if (mirror.touching[hero]) {
            return walkHet(
                mirror.x + ((player.x - mirror.x) / away) * 2.2,
                mirror.y + ((player.y - mirror.y) / away) * 2.2,
                solids(mirror as never),
            );
        }
        return walkHet(mirror.x, mirror.y, solids(mirror as never));
    };
    // An Orb of Darkness coming at it: out of its line, whatever it was doing
    for (const orb of het.orbs) {
        const speed = Math.hypot(orb.vx, orb.vy) || 1;
        const ux = orb.vx / speed;
        const uy = orb.vy / speed;
        const ahead = (player.x - orb.x) * ux + (player.y - orb.y) * uy;
        const side = (player.x - orb.x) * -uy + (player.y - orb.y) * ux;
        if (ahead > -0.3 && ahead < 3 && Math.abs(side) < 1) {
            const sign = side >= 0 ? 1 : -1;
            return { x: -uy * sign, y: ux * sign };
        }
    }
    // Every loose mirror, the nearest first
    const loose = lying
        .filter((m) => !m.fixed && m.spot === undefined)
        .sort(
            (a, b) =>
                Math.hypot(a.x - player.x, a.y - player.y) -
                Math.hypot(b.x - player.x, b.y - player.y),
        )[0];
    if (loose) {
        return walkHet(loose.x, loose.y, solids(loose));
    }
    // Each carried onto a spot that wants one
    const carried = het.mirrors.some((m) => m.carrier === hero);
    const wanted = het.solution.find((want) => !het.mirrors.some((m) => m.spot === want.spot));
    if (carried && wanted) {
        return standOn(het.spots[wanted.spot], solids());
    }
    // A mirror on the way turned wrong, or one dirty where the beam stops
    const traced = sim["traceHetBeam"](het, def.het!);
    const end = traced.points[traced.points.length - 1];
    const stopping = lying.find(
        (m) =>
            m.dirty &&
            Math.floor(m.x) === Math.floor(end.x) &&
            Math.floor(m.y) === Math.floor(end.y),
    );
    const wrong = het.solution
        .map((want) => ({ want, mirror: het.mirrors.find((m) => m.spot === want.spot) }))
        .find(({ want, mirror }) => mirror && (mirror.dirty || mirror.turn !== want.turn))?.mirror;
    const fix = stopping ?? wrong;
    if (fix) {
        return bump(fix);
    }
    // A worn barrier: its circle stood in till it breaks
    const barrier = het.barriers.find((b) => b.worn && b.stand);
    if (barrier) {
        return standOn(barrier.stand!, solids());
    }
    // The way's right: the nearest tile of the seal's ring, stood in while it's open
    const ring = [...het.ring].sort(
        (a, b) =>
            Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
    )[0];
    if (!ring) {
        return { x: 0, y: 0 };
    }
    if (het.openUntil !== -1) {
        return standOn(ring, solids());
    }
    return dodging(sim, kite(sim, ring, 1.5));
}

// Scabaras: a plate stepped on round every other plate on the boards, so none's pressed on the way
function stepOn(sim: Sim, plate: Point, boards: NonNullable<PathRoom["scabaras"]>): Point {
    const player = sim.player;
    if (Math.hypot(plate.x - player.x, plate.y - player.y) < 1.2) {
        return nudge(sim, plate.x, plate.y);
    }
    const plates = [
        ...boards.sequence,
        ...boards.lights,
        ...boards.addition,
        ...boards.matching.north,
        ...boards.matching.south,
    ].filter((p) => p.x !== plate.x || p.y !== plate.y);
    return walkAvoiding(sim, plate.x, plate.y, plates, 0);
}

// Every plate on the room's boards
function allPlates(boards: NonNullable<PathRoom["scabaras"]>): Point[] {
    return [
        ...boards.sequence,
        ...boards.lights,
        ...boards.addition,
        ...boards.matching.north,
        ...boards.matching.south,
    ];
}

// A tile beside a plate that isn't one (a diagonal one first, then the sides)
function besidePlate(plate: Point, boards: NonNullable<PathRoom["scabaras"]>): Point {
    const plates = allPlates(boards);
    const offsets = [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    for (const [dx, dy] of offsets) {
        const x = plate.x + dx;
        const y = plate.y + dy;
        if (
            !plates.some(
                (p) => Math.floor(p.x) === Math.floor(x) && Math.floor(p.y) === Math.floor(y),
            )
        ) {
            return { x, y };
        }
    }
    return { x: plate.x + 2, y: plate.y };
}

// Off a plate, to a gap beside it
function stepOff(sim: Sim, plate: Point, boards: NonNullable<PathRoom["scabaras"]>): Point {
    const to = besidePlate(plate, boards);
    return nudge(sim, to.x, to.y);
}

function scabarasMove(sim: Sim, def: PathRoom): Point {
    const scab = sim.tombsRoom!.scabaras!;
    const boards = def.scabaras!;
    const hero = sim["hero"].index;
    const on = scab.standing[hero];
    const solved = (p: string) => (scab.solved as string[]).includes(p);
    // Matching, once the other three are done
    if (solved("sequence") && solved("lights") && solved("addition")) {
        const m = scab.matching;
        if (m.hideTick !== -1) {
            return { x: 0, y: 0 };
        }
        if (m.up.north !== undefined) {
            const symbol = m.north[m.up.north];
            const j = m.south.findIndex((s) => s === symbol);
            return stepOn(sim, boards.matching.south[j], boards);
        }
        const i = m.north.findIndex((s) => !m.matched[s]);
        return i === -1 ? { x: 0, y: 0 } : stepOn(sim, boards.matching.north[i], boards);
    }
    // Sequence: the Ancient button pushed (walked up to) for its order, then its plates in it
    if (!solved("sequence")) {
        const seq = scab.sequence;
        if (seq.order.length === 0) {
            const button = boards.button;
            // Pushed as it's come up to: off it and back, when it's to be pushed again
            return on === "b0" ? nudge(sim, button.x + 2.5, button.y) : stepOn(sim, button, boards);
        }
        const shown = sim["scabarasShowEnd"](seq);
        const index = seq.order[seq.step];
        const plate = boards.sequence[index];
        if (sim.tick < shown + 5) {
            return stepOn(sim, besidePlate(plate, boards), boards);
        }
        return on === `s${index}` ? stepOff(sim, plate, boards) : stepOn(sim, plate, boards);
    }
    // Lights out: the fewest presses that light them all, nearest first
    if (!solved("lights")) {
        const player = sim.player;
        const next = lightsPresses(scab.lights)
            .map((i) => ({ i, plate: boards.lights[i] }))
            .sort(
                (a, b) =>
                    Math.hypot(a.plate.x - player.x, a.plate.y - player.y) -
                    Math.hypot(b.plate.x - player.x, b.plate.y - player.y),
            )[0];
        if (!next) {
            return { x: 0, y: 0 };
        }
        return on === `l${next.i}`
            ? stepOff(sim, next.plate, boards)
            : stepOn(sim, next.plate, boards);
    }
    // Addition: a way across the board, tile to touching tile, that makes up exactly what's left
    // (the wiki's chart is such ways), from the plate it's on or onto the board from its edge
    const add = scab.addition;
    const current = on?.startsWith("a") ? Number(on.slice(1)) : undefined;
    const path = additionPath(
        boards.addition,
        add.values,
        add.stepped,
        add.target - add.sum,
        current,
    );
    if (path.length === 0) {
        // No way on from here: off the board, to come on again elsewhere
        if (current !== undefined) {
            return stepOff(sim, boards.addition[current], boards);
        }
        // None from the edge either: onto its biggest left, to go past and start over
        let biggest = -1;
        add.values.forEach((value, i) => {
            if (!add.stepped[i] && (biggest === -1 || value > add.values[biggest])) {
                biggest = i;
            }
        });
        return stepOn(sim, boards.addition[biggest], boards);
    }
    const next = boards.addition[path[0]];
    if (current === undefined) {
        return stepOn(sim, next, boards);
    }
    // Square on the plate it's on first, so a diagonal step crosses no other
    const here = boards.addition[current];
    const player = sim.player;
    // (once on its way to the next, it keeps going)
    const along =
        ((player.x - here.x) * (next.x - here.x) + (player.y - here.y) * (next.y - here.y)) /
        Math.hypot(next.x - here.x, next.y - here.y);
    if (along < 0.05 && Math.hypot(here.x - player.x, here.y - player.y) > 0.2) {
        return nudge(sim, here.x, here.y);
    }
    return nudge(sim, next.x, next.y);
}

// Addition's way across: plates not stepped on, each touching the last (sides or corners), that
// add up to exactly what's left, from the plate it's on, or from one on the board's edge
export function additionPath(
    plates: Point[],
    values: number[],
    stepped: boolean[],
    left: number,
    from?: number,
): number[] {
    // The same board, stepped the same, has the same answer: worked out once, not every tick
    const key = `${from}|${left}|${stepped.map(Number).join("")}|${values.join(",")}`;
    const known = additionPaths.get(key);
    if (known) {
        return known;
    }
    if (additionPaths.size > 2000) {
        additionPaths.clear();
    }
    const path = searchAdditionPath(plates, values, stepped, left, from);
    additionPaths.set(key, path);
    return path;
}

const additionPaths = new Map<string, number[]>();
// How many plates the search tries before it gives up
const ADDITION_SEARCH_LIMIT = 200_000;

function searchAdditionPath(
    plates: Point[],
    values: number[],
    stepped: boolean[],
    left: number,
    from?: number,
): number[] {
    let tried = 0;
    const touching = (a: number, b: number) =>
        a !== b &&
        Math.abs(plates[a].x - plates[b].x) < 1.5 &&
        Math.abs(plates[a].y - plates[b].y) < 1.5;
    const edge = (i: number) => plates.filter((_, j) => touching(i, j)).length < 8;
    let found: number[] | undefined;
    const search = (at: number, sum: number, path: number[]) => {
        if (found || ++tried > ADDITION_SEARCH_LIMIT) {
            return;
        }
        if (sum === left) {
            found = [...path];
            return;
        }
        for (let j = 0; j < plates.length; j++) {
            if (!stepped[j] && !path.includes(j) && touching(at, j) && sum + values[j] <= left) {
                path.push(j);
                search(j, sum + values[j], path);
                path.pop();
            }
        }
    };
    if (from !== undefined) {
        search(from, 0, []);
        return found ?? [];
    }
    for (let i = 0; i < plates.length && !found; i++) {
        if (!stepped[i] && edge(i) && values[i] <= left) {
            search(i, values[i], [i]);
        }
    }
    return found ?? [];
}

// Lights out's presses: pressing i toggles i - 1, i and i + 1 round the ring; the fewest that
// light every one
export function lightsPresses(lights: boolean[]): number[] {
    const n = lights.length;
    let best: number[] | undefined;
    for (let mask = 0; mask < 1 << n; mask++) {
        const lit = [...lights];
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) {
                for (const k of [i - 1, i, i + 1]) {
                    const at = (k + n) % n;
                    lit[at] = !lit[at];
                }
            }
        }
        if (lit.every(Boolean)) {
            const presses = [...Array(n).keys()].filter((i) => mask & (1 << i));
            if (!best || presses.length < best.length) {
                best = presses;
            }
        }
    }
    return best ?? [];
}

// Crondis: water fetched from a corridor's waterfall to the palm, again till it's grown. A
// corridor's poison band comes down it from the waterfall faster than you walk, so a trip in
// starts once the last band's out of it, with time to fill and be off before the next; a spear
// thrusting across your rows is stepped round to the corridor's other half
const CLOUD_SPEED = 3.5;
const CLOUD_BEHIND = 1.1;
const CLOUD_LENGTH = 3;
const FILL_SECONDS = 1;

function crondisMove(sim: Sim, def: PathRoom): Point {
    const crondis = sim.tombsRoom!.crondis!;
    const places = def.crondis!;
    const hero = sim["hero"].index;
    const player = sim.player;
    const lane = places.lanes.findIndex(
        (l) =>
            player.x >= l.x0 - 0.5 &&
            player.x <= l.x1 + 1.5 &&
            player.y >= l.y0 - 2 &&
            player.y <= l.y1 + 2,
    );
    let to: Point;
    if (crondis.water[hero] >= 100) {
        to = places.palm;
    } else if (lane !== -1 && crondis.water[hero] > 0 && crondis.filling[hero] > 0) {
        // Filling: stay till it's full
        to = places.falls[places.lanes[lane].fall].fill;
    } else {
        to = crondisFall(sim, def);
    }
    // A crocodile at its heels: a bite spills the water. Weapons that reach keep away from it, to
    // the palm's side, while they see to it (they're slower than you); a melee hero carrying
    // nothing stands and swings
    const biting = sim.enemies.some(
        (e) =>
            !e.dead &&
            e.def.id === "crondis_crocodile" &&
            Math.hypot(e.x - player.x, e.y - player.y) < CROC_NEAR,
    );
    const melee = heroReach(sim) < 4;
    const carrying = crondis.water[hero] > 0;
    // Hungry crocodiles at the palm eat what's been poured: with more of them than the trips
    // outrun (higher path levels), they're seen to first, a melee hero up to them and a thrower
    // from across the palm, before another trip's made
    // (and a crocodile loose in the palm room bites the next trip's water out of you, so a melee
    // hero with nothing in hand sees to one of those too)
    const hungry = sim.enemies
        .filter(
            (e) =>
                !e.dead &&
                ((e.def.id === "crondis_crocodile_hungry" &&
                    Math.hypot(e.x - places.palm.x, e.y - places.palm.y) < 5) ||
                    (e.def.id === "crondis_crocodile" &&
                        melee &&
                        Math.hypot(e.x - player.x, e.y - player.y) < 7)),
        )
        .sort(
            (a, b) =>
                Math.hypot(a.x - player.x, a.y - player.y) -
                Math.hypot(b.x - player.x, b.y - player.y),
        );
    const move =
        hungry.length > 0 && !carrying
            ? melee
                ? Math.hypot(hungry[0].x - player.x, hungry[0].y - player.y) <
                  hungry[0].radius + heroReach(sim) - 0.3
                    ? { x: 0, y: 0 }
                    : walkTo(sim, hungry[0].x, hungry[0].y)
                : kite(sim, places.palm, CROC_NEAR)
            : biting
              ? melee && !carrying
                  ? { x: 0, y: 0 }
                  : kite(sim, places.palm, CROC_NEAR)
              : Math.hypot(to.x - player.x, to.y - player.y) < 1.2
                ? nudge(sim, to.x, to.y)
                : walkTo(sim, to.x, to.y);
    return clearOfSpears(sim, places, move);
}

// How near a crocodile comes before the bot backs off from it
const CROC_NEAR = 3.5;

// How far ahead the bot plays the spears forward (ticks, in steps of SPEAR_STEP)
const SPEAR_LOOK = 60;
const SPEAR_STEP = 2;

// The move (the one wanted if no spear it'd walk into is coming, or the nearest way to it that's
// clear: sixteen headings and standing still) that every thrust about to come misses. The
// statues keep time, so what's coming is known: each corridor's next pair, side and when, on down
// the corridor and round again after its rest.
function clearOfSpears(sim: Sim, places: CrondisPlaces, want: Point): Point {
    const crondis = sim.tombsRoom!.crondis!;
    const tell = Math.round(CRONDIS.spearTell * 50);
    const hold = Math.round(CRONDIS.spearHold * 50);
    const step = Math.round(CRONDIS.spearStep * 50);
    const rest = Math.round(CRONDIS.spearRest * 50);
    const now = sim.tick;
    const end = now + SPEAR_LOOK;
    // Every thrust out at some point from now till the end of the look: its tiles, and when
    const coming: { area: { x0: number; x1: number; y0: number; y1: number }; from: number }[] = [];
    const add = (thrust: Parameters<Sim["crondisSpearArea"]>[1]) => {
        const from = thrust.startTick + tell;
        if (from + hold > now && from < end) {
            coming.push({ area: sim.crondisSpearArea(places, thrust), from });
        }
    };
    for (const thrust of crondis.thrusts) {
        add(thrust);
    }
    places.lanes.forEach((lane, i) => {
        const pairs = Math.floor((lane.y1 - lane.y0 + 1) / 2);
        let tick = crondis.spears[i].nextTick;
        let pair = crondis.spears[i].pair;
        while (tick < end) {
            const side = (pair + i) % 2 === 0 ? "low" : "high";
            add({ lane: i, pair, side, startTick: tick, hit: [] });
            pair++;
            if (pair >= pairs) {
                pair = 0;
                tick += rest;
            } else {
                tick += step;
            }
        }
    });
    if (coming.length === 0) {
        return want;
    }
    const player = sim.player;
    const speed = PLAYER_SPEED * (1 + (sim.stats.moveSpeed ?? 0));
    const margin = 0.2;
    const cost = (dir: Point): number => {
        let px = player.x;
        let py = player.y;
        const caught = new Set<number>();
        let total = 0;
        for (let t = 0; t <= SPEAR_LOOK; t += SPEAR_STEP) {
            if (t > 0) {
                const nx = px + dir.x * speed * SPEAR_STEP;
                const ny = py + dir.y * speed * SPEAR_STEP;
                if (!sim.grid.isSolid(Math.floor(nx), Math.floor(ny))) {
                    px = nx;
                    py = ny;
                }
            }
            const at = now + t;
            coming.forEach((thrust, k) => {
                if (
                    !caught.has(k) &&
                    at >= thrust.from &&
                    at < thrust.from + hold &&
                    px >= thrust.area.x0 - margin &&
                    px <= thrust.area.x1 + margin &&
                    py >= thrust.area.y0 - margin &&
                    py <= thrust.area.y1 + margin
                ) {
                    caught.add(k);
                    // Sooner is worse: there's less time to do anything else about it
                    total += 1 + (SPEAR_LOOK - t) / SPEAR_LOOK;
                }
            });
        }
        return total;
    };
    const wantCost = cost(want);
    if (wantCost === 0) {
        return want;
    }
    let best = want;
    let bestScore = wantCost * 10;
    for (const dir of HEADINGS) {
        const score = cost(dir) * 10 + (1 - (dir.x * want.x + dir.y * want.y)) * 0.3;
        if (score < bestScore) {
            bestScore = score;
            best = dir;
        }
    }
    return best;
}

// Standing still, and sixteen ways round
const HEADINGS: Point[] = [
    { x: 0, y: 0 },
    ...Array.from({ length: 16 }, (_, i) => ({
        x: Math.cos((i / 16) * Math.PI * 2),
        y: Math.sin((i / 16) * Math.PI * 2),
    })),
];

// Tiles a second the bot walks
function walkPerSecond(sim: Sim): number {
    return (2 / 0.6) * (1 + (sim.stats.moveSpeed ?? 0));
}

// Where to go for water: the waterfall that's soonest running. A band only spills what you're
// carrying, so the way in's walked empty whatever's coming; at the fall it waits a step off (where
// it won't fill) for a band to go by, and fills only with time to be well ahead of the next
function crondisFall(sim: Sim, def: PathRoom): Point {
    const crondis = sim.tombsRoom!.crondis!;
    const places = def.crondis!;
    const player = sim.player;
    const speed = walkPerSecond(sim);
    const now = sim.tick / 50;
    let best: { at: Point; wait: number } | undefined;
    places.lanes.forEach((lane, i) => {
        const fall = places.falls[lane.fall];
        const walkIn = Math.hypot(fall.fill.x - player.x, fall.fill.y - player.y) / speed;
        const dry = Math.max(0, crondis.dryUntil[lane.fall] / 50 - now - walkIn);
        // A band's over the fall from CLOUD_BEHIND after it's let go till its back's past (half a
        // second later): filling starts once it's gone by, and ends far enough ahead of the next
        // (three quarters of a second) that it never catches up
        const arrive = now + walkIn;
        const recent = crondis.clouds.some(
            (cloud) => cloud.lane === i && arrive - cloud.startTick / 50 < CLOUD_BEHIND + 0.6,
        );
        const nextRelease = crondis.nextCloudTick[i] / 50;
        const soon = arrive + FILL_SECONDS > nextRelease + CLOUD_BEHIND - 0.75;
        const cloudWait = recent ? 0.6 : soon ? nextRelease + CLOUD_BEHIND + 0.6 - arrive : 0;
        const wait = walkIn + Math.max(dry, cloudWait);
        const toPalm = lane.fromLow ? 1 : -1;
        const at =
            dry > 0 || recent || soon
                ? { x: fall.fill.x, y: fall.fill.y + toPalm * 1.8 }
                : fall.fill;
        if (!best || wait < best.wait) {
            best = { at, wait };
        }
    });
    return best!.at;
}

// Bullets about to reach the bot, sidestepped (the nearer, the more), as the run sim's DODGE does;
// undefined with nothing coming
export function dodge(sim: Sim, withBullets = true): Point | undefined {
    const player = sim.player;
    let awayX = 0;
    let awayY = 0;
    const { bullets } = sim;
    for (let i = 0; i < (withBullets ? bullets.count : 0); i++) {
        const slot = bullets.order[i];
        const dx = player.x - bullets.x[slot];
        const dy = player.y - bullets.y[slot];
        const distSq = dx * dx + dy * dy;
        if (distSq < 9 && dx * bullets.vx[slot] + dy * bullets.vy[slot] > 0) {
            const weight = 1 / Math.max(distSq, 0.1);
            const side = dx * bullets.vy[slot] - dy * bullets.vx[slot] >= 0 ? 1 : -1;
            awayX += bullets.vy[slot] * side * weight;
            awayY += -bullets.vx[slot] * side * weight;
        }
    }
    // Out from under a boss's blast as it winds up, straight away from where it'll land
    let stripsRead = false;
    for (const enemy of sim.enemies) {
        const windup = enemy.bossState?.windup;
        if (enemy.dead || !windup) {
            continue;
        }
        // An avalanche is hidden from, not run from (BossAttackDef.takeCover)
        if (windup.attack.takeCover) {
            continue;
        }
        // A swing hits round the boss: out of its reach. A lunge's strip (and its echoes', two at
        // once to the pocket between) is stepped off sideways, and a long wedge out of its side,
        // as a person reads them, not backed away from down its length (bossReads)
        if (windup.attack.kind === "swing") {
            const open = (x: number, y: number) => !sim.grid.isSolid(Math.floor(x), Math.floor(y));
            const longCone =
                windup.attack.cone !== undefined && (windup.attack.radius ?? 2) > LONG_CONE;
            if (windup.attack.line || longCone) {
                stripsRead ||= windup.attack.line !== undefined;
                const side = windup.attack.line
                    ? lungeStep(sim, enemy, open)
                    : coneStep(sim, enemy, windup, LONG_CONE, open);
                if (side) {
                    awayX += side.x * 4;
                    awayY += side.y * 4;
                }
                continue;
            }
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const away = Math.hypot(dx, dy) || 0.01;
            const reach = (windup.attack.radius ?? 2) + enemy.radius + player.radius + 0.8;
            if (away < reach) {
                awayX += (dx / away) * 4;
                awayY += (dy / away) * 4;
            }
            continue;
        }
        if (windup.attack.kind !== "blast") {
            continue;
        }
        const reach = (windup.attack.radius ?? 2) + player.radius + 0.5;
        const under = windup.targets.filter(
            (spot) => Math.hypot(player.x - spot.x, player.y - spot.y) < reach,
        );
        if (under.length > 0) {
            // The way out that's soonest clear of every mark it's under, and open ground all the
            // way: a blast's aimed at where you stand, so "away from it" is no direction at all,
            // and against a wall it was a push into the wall for the whole windup
            const out = blastEscape(sim, under, reach);
            awayX += out.x * 4;
            awayY += out.y * 4;
        }
    }
    // What copies a lunge still winding up after the boss's own has landed (an echo's later):
    // off its strip too (Zebak's crocodiles snap a beat after his jaws)
    const echo = stripsRead ? undefined : sim.enemies.find((e) => !e.dead && e.echo);
    if (echo) {
        const open = (x: number, y: number) => !sim.grid.isSolid(Math.floor(x), Math.floor(y));
        const side = lungeStep(sim, echo, open);
        if (side) {
            awayX += side.x * 4;
            awayY += side.y * 4;
        }
    }
    // And out from under what's about to land (a ground mark), straight away from its middle
    for (const hazard of sim.hazards) {
        if (hazard.landTick < sim.tick || hazard.landTick > sim.tick + 75) {
            continue;
        }
        const dx = player.x - hazard.x;
        const dy = player.y - hazard.y;
        const away = Math.hypot(dx, dy);
        if (away < hazard.radius + player.radius + 0.6) {
            const len = away || 1;
            awayX += (away > 0.01 ? dx / len : 1) * 4;
            awayY += (away > 0.01 ? dy / len : 0) * 4;
        }
    }
    const length = Math.hypot(awayX, awayY);
    return length > 0 ? { x: awayX / length, y: awayY / length } : undefined;
}

// A wedge longer than this is stepped out of sideways (its side's nearer than its end); a shorter
// one's backed out of, as a swing round the boss is
const LONG_CONE = 4;

// The heading (of sixteen) out from under a blast's marks: the one that's clear of them all
// soonest, over ground that can be walked, the player's radius kept off the walls
function blastEscape(sim: Sim, marks: Point[], reach: number): Point {
    const player = sim.player;
    let best: Point | undefined;
    let bestSteps = Infinity;
    // Nothing clears them all: the heading with the most open ground, the furthest from the middle
    let farthest: Point = { x: 1, y: 0 };
    let farthestRoom = -1;
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        let steps = Infinity;
        let room = 0;
        let tx = Math.floor(player.x);
        let ty = Math.floor(player.y);
        for (let d = 0.5; d <= reach * 2 + 1; d += 0.5) {
            const x = player.x + dir.x * d + dir.x * player.radius;
            const y = player.y + dir.y * d + dir.y * player.radius;
            // Tile by tile, as the player's held by walls on tiles' edges, not only solid tiles
            const nx = Math.floor(x);
            const ny = Math.floor(y);
            if ((nx !== tx || ny !== ty) && !canStep(sim.grid, tx, ty, nx - tx, ny - ty)) {
                break;
            }
            tx = nx;
            ty = ny;
            room = d;
            if (marks.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= reach)) {
                steps = d;
                break;
            }
        }
        if (steps < bestSteps) {
            bestSteps = steps;
            best = dir;
        }
        if (room > farthestRoom) {
            farthestRoom = room;
            farthest = dir;
        }
    }
    return best ?? farthest;
}

// A move with a sidestep from what's coming mixed in, if anything is: out from under a boss's
// blast, swing or ground mark, then whichever way (that, or round it) the bullets miss
function dodging(
    sim: Sim,
    move: Point,
    avoid?: (x: number, y: number) => boolean,
    strips?: LandingStrip[],
): Point {
    // A shape with one way out first, as the quest's bot reads them (bossReads): out of a
    // charge's lane, to a wall's gap or a closing ring's, to its side of a tether. Not while
    // it's in a lunge's strip about to land (Zebak's jaws): the look ahead below weighs the two
    const player = sim.player;
    const inStrip = strips?.some((strip) => stripHas(strip, player.x, player.y, 0.3)) ?? false;
    const shape = inStrip ? undefined : shapeStep(sim);
    if (shape) {
        return shape;
    }
    const away = dodge(sim, false);
    let want = move;
    if (away) {
        const x = move.x * 0.35 + away.x;
        const y = move.y * 0.35 + away.y;
        const length = Math.hypot(x, y) || 1;
        want = { x: x / length, y: y / length };
    }
    return clearOfBullets(sim, want, avoid, strips);
}

// A lunge's strip winding up, and the tick it lands
type LandingStrip = {
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    half: number;
    length: number;
    land: number;
};

// Every lunge's strip winding up: the boss's (a chain's next link too, once it's begun) and what
// copies it (EnemyDef.echoes)
function landingStrips(sim: Sim): LandingStrip[] {
    const strips: LandingStrip[] = [];
    for (const enemy of sim.enemies) {
        const windup = enemy.dead ? undefined : (enemy.bossState?.windup ?? enemy.echo);
        const line = windup?.attack.kind === "swing" ? windup.attack.line : undefined;
        if (windup && line) {
            strips.push({
                x: enemy.x,
                y: enemy.y,
                dirX: windup.dirX,
                dirY: windup.dirY,
                half: line.width / 2,
                length: line.length,
                land: windup.landTick,
            });
        }
    }
    return strips;
}

function stripHas(strip: LandingStrip, x: number, y: number, margin: number): boolean {
    const along = (x - strip.x) * strip.dirX + (y - strip.y) * strip.dirY;
    const side = (x - strip.x) * -strip.dirY + (y - strip.y) * strip.dirX;
    return (
        along > -0.5 &&
        along < strip.length + 0.35 + margin &&
        Math.abs(side) < strip.half + 0.35 + margin
    );
}

// The one way out of a shape a boss is making (bossReads), or undefined with none coming
function shapeStep(sim: Sim): Point | undefined {
    for (const enemy of sim.enemies) {
        if (!enemy.dead && enemy.bossState) {
            const lane = laneStep(sim, enemy);
            if (lane) {
                return lane;
            }
        }
    }
    const open = (x: number, y: number) => !sim.grid.isSolid(Math.floor(x), Math.floor(y));
    return wallGap(sim, open) ?? cageGap(sim) ?? offTether(sim);
}

// How far ahead the bot looks for bullets (ticks, in steps of LOOK_STEP), and how near one has to
// be to count
const LOOK_TICKS = 30;
const LOOK_STEP = 3;
const LOOK_NEAR = 7;
const AVOID_COST = 2.5;

// The move (the one wanted if nothing it'd walk into is coming, or the nearest way to it that's
// clear: sixteen headings and standing still) that the bullets about now miss, played forward:
// each bullet on its line (and its turn, once it's stood its wait), the bot at its speed, stopped
// by walls
function clearOfBullets(
    sim: Sim,
    want: Point,
    avoid?: (x: number, y: number) => boolean,
    strips: LandingStrip[] = [],
): Point {
    const player = sim.player;
    const { bullets } = sim;
    // What's coming: the bullets, and a boss's projectiles (the Wardens' skulls, played forward
    // turning after the bot as far as they can each tick, as the Wardens' red skulls do, which a
    // sidestep at the last beats: they can't turn that sharply)
    const near: {
        x: number;
        y: number;
        vx: number;
        vy: number;
        cos: number;
        sin: number;
        radius: number;
        life: number;
        homing: number;
        // Ticks it stands where it is first (BulletPatternDef.hold), its life not running
        wait: number;
    }[] = [];
    const close = (x: number, y: number) =>
        Math.abs(x - player.x) < LOOK_NEAR && Math.abs(y - player.y) < LOOK_NEAR;
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (close(bullets.x[slot], bullets.y[slot])) {
            near.push({
                x: bullets.x[slot],
                y: bullets.y[slot],
                vx: bullets.vx[slot],
                vy: bullets.vy[slot],
                cos: bullets.turnCos[slot],
                sin: bullets.turnSin[slot],
                radius: bullets.radius[slot],
                life: bullets.life[slot],
                homing: 0,
                wait: bullets.wait[slot],
            });
        }
    }
    for (const shot of sim.enemyProjectiles) {
        if (close(shot.x, shot.y)) {
            near.push({ ...shot, cos: 1, sin: 0, wait: 0 });
        }
    }
    // A blast's marks still winding up: where it'd still be under one at the end of the look
    // costs too, or a heading that stands still among a blast's shards (the dodge wanted) is
    // taken as the one that misses them, right under the next blast
    const marks: { x: number; y: number; reach: number }[] = [];
    for (const enemy of sim.enemies) {
        const windup = enemy.bossState?.windup;
        if (enemy.dead || !windup || windup.attack.takeCover || windup.attack.kind !== "blast") {
            continue;
        }
        const reach = (windup.attack.radius ?? 2) + player.radius + 0.5;
        for (const spot of windup.targets) {
            if (close(spot.x, spot.y)) {
                marks.push({ x: spot.x, y: spot.y, reach });
            }
        }
    }
    if (near.length === 0 && marks.length === 0 && strips.length === 0 && !avoid) {
        return want;
    }
    const speed = PLAYER_SPEED * (1 + (sim.stats.moveSpeed ?? 0));
    const cost = (dir: Point): number => {
        let total = 0;
        let px = player.x;
        let py = player.y;
        const positions: Point[] = [];
        for (let t = LOOK_STEP; t <= LOOK_TICKS; t += LOOK_STEP) {
            const nx = px + dir.x * speed * LOOK_STEP;
            const ny = py + dir.y * speed * LOOK_STEP;
            if (!sim.grid.isSolid(Math.floor(nx), Math.floor(ny))) {
                px = nx;
                py = ny;
            }
            positions.push({ x: px, y: py });
        }
        // Still under a blast's mark at the end of the look: the deeper in, the worse
        const last = positions[positions.length - 1];
        for (const mark of marks) {
            const away = Math.hypot(last.x - mark.x, last.y - mark.y);
            if (away < mark.reach) {
                total += 1 + (mark.reach - away) / mark.reach;
            }
        }
        // Still in a lunge's strip as it lands (where the look has it then, or at its end): worse
        // than acid, as a jaw's a heavy hit and a pool can be stepped back out of
        for (const strip of strips) {
            const at = Math.min(
                positions.length - 1,
                Math.max(0, Math.ceil((strip.land - sim.tick) / LOOK_STEP) - 1),
            );
            if (stripHas(strip, positions[at].x, positions[at].y, 0.15)) {
                total += 3;
            }
        }
        // Ground to keep off (Zebak's acid, the Wardens' floor as it slams): a step on it costs
        // more than a bullet's hit, as it does (acid poisons, a slam's a share of your hitpoints)
        if (avoid) {
            for (const at of positions) {
                if (avoid(at.x, at.y)) {
                    total += AVOID_COST;
                    break;
                }
            }
        }
        for (const shot of near) {
            let bx = shot.x;
            let by = shot.y;
            let vx = shot.vx;
            let vy = shot.vy;
            const { cos, sin, life, homing } = shot;
            let wait = shot.wait;
            const speed = Math.hypot(vx, vy);
            const reach = shot.radius + player.radius + 0.15;
            for (let step = 0; step < positions.length; step++) {
                const t = (step + 1) * LOOK_STEP;
                if (t > shot.wait + life) {
                    break;
                }
                for (let k = 0; k < LOOK_STEP; k++) {
                    // Still where it stands, as BulletPool.step has it
                    if (wait > 0) {
                        wait--;
                        continue;
                    }
                    if (cos !== 1) {
                        const nvx = vx * cos - vy * sin;
                        vy = vx * sin + vy * cos;
                        vx = nvx;
                    }
                    if (homing > 0 && speed > 0) {
                        const heading = Math.atan2(vy, vx);
                        let turn =
                            Math.atan2(positions[step].y - by, positions[step].x - bx) - heading;
                        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
                        const angle = heading + Math.max(-homing, Math.min(homing, turn));
                        vx = Math.cos(angle) * speed;
                        vy = Math.sin(angle) * speed;
                    }
                    bx += vx;
                    by += vy;
                }
                const dx = positions[step].x - bx;
                const dy = positions[step].y - by;
                if (dx * dx + dy * dy <= reach * reach) {
                    // Sooner is worse: there's less time to do anything else about it
                    total += 1 + (LOOK_TICKS - t) / LOOK_TICKS;
                    break;
                }
            }
        }
        return total;
    };
    const wantCost = cost(want);
    if (wantCost === 0) {
        return want;
    }
    let best = want;
    let bestScore = wantCost * 10;
    const headings: Point[] = [{ x: 0, y: 0 }];
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        headings.push({ x: Math.cos(angle), y: Math.sin(angle) });
    }
    for (const dir of headings) {
        // The fewest hits, then the nearest to where it wanted to go
        const score = cost(dir) * 10 + (1 - (dir.x * want.x + dir.y * want.y)) * 0.3;
        if (score < bestScore) {
            bestScore = score;
            best = dir;
        }
    }
    return best;
}

function bossMove(sim: Sim, def: PathBoss, uid: number): Point | undefined {
    // Not up yet: north past the line, where it rises
    if (uid === -1) {
        return walkTo(sim, def.arrive.x, def.line.y + 2.5);
    }
    const boss = sim.enemies.find((e) => e.uid === uid);
    if (!boss || boss.dead) {
        return { x: 0, y: 0 };
    }
    if (sim.tombsZebak) {
        const roaring = sim.tombsZebak.roar !== undefined;
        const move = zebakMove(sim, def, boss);
        const fight = sim.tombsZebak;
        // A pool's edge is where the hero's middle counts as in it, so keep the body off it too
        const margin = 0.5 + sim.player.radius + 0.1;
        const inAcid = (x: number, y: number) =>
            fight.acid.some(
                (a) => Math.abs(a.x - x) <= a.half + margin && Math.abs(a.y - y) <= a.half + margin,
            );
        // Behind a boulder for his roar, but through a swell's gap if one's on it first
        return roaring
            ? (shapeStep(sim) ?? move)
            : dodging(sim, foodMove(sim) ?? punishMove(sim) ?? move, inAcid, landingStrips(sim));
    }
    if (sim.tombsAkkha) {
        const remembering = sim.tombsAkkha.memory !== undefined;
        const move = akkhaMove(sim, def, boss);
        return remembering ? move : dodging(sim, foodMove(sim) ?? punishMove(sim) ?? move);
    }
    if (def.boulders) {
        const player = sim.player;
        const move = babaMove(sim, def, boss);
        // In cover while her avalanche winds up, whatever's coming
        const avalanche = boss.bossState?.windup?.attack.takeCover !== undefined;
        // Never into her gap (Mind the Gap), dodging or not: it's a fall
        const pit = def.boulders.pit;
        const inPit = (x: number, y: number) =>
            sim.tombsPit !== undefined &&
            x >= pit.x0 - 0.8 &&
            x <= pit.x1 + 0.8 &&
            y >= pit.y0 - 0.8 &&
            y <= pit.y1 + 0.8;
        // Her rampage with one of her rocks in its lane: behind the rock, where she stops dead
        const cover = boss.bossState?.ordeal || avalanche ? undefined : rampageCover(sim, boss);
        const chosen =
            boss.bossState?.ordeal || avalanche
                ? move
                : (cover ?? dodging(sim, foodMove(sim) ?? punishMove(sim) ?? move, inPit));
        // Whatever it's after, never a step into the gap: north, away from it, instead
        const ahead = { x: player.x + chosen.x * 0.6, y: player.y + chosen.y * 0.6 };
        return inPit(ahead.x, ahead.y) ? { x: 0, y: 1 } : chosen;
    }
    if (sim.tombsKephri) {
        // Her soldier's reach is ground to keep off, as much as her bullets (at Expert a slash
        // is most of your hitpoints), and so are Jungle Japes' peels: a slip roots you for a
        // second and a half, as long as the soldier needs to come up and slash twice
        const soldiers = soldierThreats(sim, boss);
        const player = sim.player;
        const inReach = (x: number, y: number) =>
            soldiers.some(
                (e) =>
                    Math.hypot(e.x - x, e.y - y) <
                    e.radius + player.radius + 0.1 + SOLDIER_MARGIN / 2,
            ) || onPeel(sim, x, y);
        return dodging(
            sim,
            foodMove(sim) ?? punishMove(sim) ?? kephriMove(sim, def, boss, soldiers),
            soldiers.length > 0 || sim.tombsPeels.length > 0 ? inReach : undefined,
        );
    }
    // Anything else: near enough for every weapon, off what's close
    return dodging(sim, kite(sim, { x: boss.x, y: boss.y - (boss.radius + 3) }, 2.5));
}

// Food dropped near enough, when the bot's hurt enough to want it (as a person goes for it)
function foodMove(sim: Sim): Point | undefined {
    const player = sim.player;
    if (player.hp > player.maxHp * 0.65) {
        return undefined;
    }
    let best: Point | undefined;
    let bestDistance = 8;
    for (const pickup of sim.pickups) {
        if (pickup.kind !== "food") {
            continue;
        }
        const distance = Math.hypot(pickup.x - player.x, pickup.y - player.y);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = pickup;
        }
    }
    return best && walkTo(sim, best.x, best.y);
}

// Kephri's overlords, killed first, the Arcane Scarab before all (as the OSRS Wiki says: its
// charged swarm hits hardest), then the spitter (it shoots and poisons for as long as it's up),
// then the soldier (it heals her); none of her shield comes back till they're dead
const KEPHRI_OVERLORDS = ["kephri_arcane", "kephri_spitting", "kephri_soldier"];

// How far from Kephri's edge the bot waits: she's in the middle of her arena, so a Dung Strike's
// throw (KEPHRI.dung.knock) from further out puts it against a wall, stunned among the dung
const KEPHRI_KEEP = 1.5;

// Kephri: her overlords while they're up, as near as the weapons need (the soldier's slashes kept
// at arm's length if they reach further); otherwise close to her, off what's close
function kephriMove(
    sim: Sim,
    def: PathBoss,
    boss: Sim["enemies"][number],
    soldiers: SoldierThreat[],
): Point {
    const player = sim.player;
    const overlord = sim.enemies
        .filter((e) => !e.dead && KEPHRI_OVERLORDS.includes(e.def.id))
        .sort(
            (a, b) =>
                KEPHRI_OVERLORDS.indexOf(a.def.id) - KEPHRI_OVERLORDS.indexOf(b.def.id) ||
                Math.hypot(a.x - player.x, a.y - player.y) -
                    Math.hypot(b.x - player.x, b.y - player.y),
        )[0];
    // The soldier: the nearest, up or about to be (it hits as it comes in)
    const soldier = soldiers
        .slice()
        .sort(
            (a, b) =>
                Math.hypot(a.x - player.x, a.y - player.y) -
                Math.hypot(b.x - player.x, b.y - player.y),
        )[0];
    if (!overlord) {
        const wait = { x: boss.x, y: boss.y - (boss.radius + KEPHRI_KEEP) };
        if (
            soldier &&
            Math.hypot(player.x - soldier.x, player.y - soldier.y) < soldierClear(sim, soldier)
        ) {
            return offSoldier(sim, def, soldier, wait);
        }
        return kite(sim, wait, 2.5);
    }
    const reach = heroReach(sim);
    // Out of the soldier's slashes, whatever the weapons' reach
    const least = overlord.def.id === "kephri_soldier" ? 2.2 : 1;
    const keep = overlord.radius + Math.max(least, Math.min(4, reach - 0.6));
    const dx = player.x - overlord.x;
    const dy = player.y - overlord.y;
    const away = Math.hypot(dx, dy) || 1;
    let to = { x: overlord.x + (dx / away) * keep, y: overlord.y + (dy / away) * keep };
    // The soldier walks after you and hits whatever it touches, whichever overlord's being shot,
    // and burrows up beside you: never a spot it can reach, and off it at once when it's close
    if (soldier) {
        const clear = soldierClear(sim, soldier);
        const sx = to.x - soldier.x;
        const sy = to.y - soldier.y;
        const sd = Math.hypot(sx, sy) || 1;
        if (sd < clear + 0.5) {
            to = {
                x: soldier.x + (sx / sd) * (clear + 0.5),
                y: soldier.y + (sy / sd) * (clear + 0.5),
            };
        }
        if (Math.hypot(player.x - soldier.x, player.y - soldier.y) < clear) {
            return offSoldier(sim, def, soldier, to);
        }
    }
    return Math.hypot(to.x - player.x, to.y - player.y) < 1
        ? nudge(sim, to.x, to.y)
        : walkTo(sim, to.x, to.y);
}

// How much further than its touch the bot keeps from Kephri's Soldier Scarab: it walks at about
// half the bot's speed, so this is a second's head start on it
const SOLDIER_MARGIN = 1.5;

// Kephri's Soldier Scarab, up, or where it'll come in when her shield next breaks: it comes in
// slashing whoever's on its spot, with no warning, so the spot's kept clear before it's there
type SoldierThreat = { x: number; y: number; radius: number; soldier?: Sim["enemies"][number] };

const SOLDIER_DEF = TOMBS_ENEMIES.find((e) => e.id === "kephri_soldier")!;

function soldierThreats(sim: Sim, boss: Sim["enemies"][number]): SoldierThreat[] {
    const threats: SoldierThreat[] = sim.enemies
        .filter((e) => !e.dead && e.def.id === "kephri_soldier")
        .map((e) => ({ x: e.x, y: e.y, radius: e.radius, soldier: e }));
    const fight = sim.tombsKephri;
    const def = boss.def.boss?.kephri;
    if (fight && def && !fight.final && !fight.intermission) {
        const which = fight.phase;
        const coming = [
            ...(def.intermissions.overlords[which] ?? []),
            ...(sim.invocations.includes("more_overlords")
                ? (def.intermissions.moreOverlords[which] ?? [])
                : []),
        ];
        const at = def.overlordAt["kephri_soldier"];
        if (coming.includes("kephri_soldier") && at) {
            threats.push({ x: boss.x + at[0], y: boss.y + at[1], radius: SOLDIER_DEF.radius });
        }
    }
    return threats;
}

// On one of Jungle Japes' peels, or near enough to brush it
function onPeel(sim: Sim, x: number, y: number): boolean {
    const reach = JUNGLE_JAPES.radius + sim.player.radius + 0.15;
    return sim.tombsPeels.some(
        (peel) => peel.endTick > sim.tick && Math.hypot(peel.x - x, peel.y - y) < reach,
    );
}

// How near the soldier's too near
function soldierClear(sim: Sim, soldier: { radius: number }): number {
    return soldier.radius + sim.player.radius + 0.1 + SOLDIER_MARGIN;
}

// Off the soldier: of sixteen headings, the open one that gets furthest from it with the most room
// beyond (Kephri's body and the overlords that don't move are as much in the way as walls),
// leaning towards where the bot wants to be, so it isn't run into a corner
function offSoldier(sim: Sim, def: PathBoss, soldier: SoldierThreat, to: Point): Point {
    const player = sim.player;
    const bodies = [
        ...sim.enemies.filter(
            (e) => !e.dead && e !== soldier.soldier && (e.def.stationary || e.def.solid),
        ),
        // Her dung, while it's down
        ...sim.tombsCover.filter((c) => c.endTick > sim.tick),
    ];
    // Walls go by their edges, not only solid tiles (the arena's sides are edges), the line
    // behind the bot's a wall once she's up, and a peel's as good as one
    const blocked = (x: number, y: number) =>
        !isCircleFree(sim.grid, x, y, player.radius) ||
        y < def.line.y + player.radius ||
        onPeel(sim, x, y) ||
        bodies.some((e) => Math.hypot(e.x - x, e.y - y) < e.radius + player.radius);
    let best: Point | undefined;
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        // How far it's open along this heading, up to four tiles
        let room = 0;
        while (
            room < 4 &&
            !blocked(player.x + dir.x * (room + 0.5), player.y + dir.y * (room + 0.5))
        ) {
            room += 0.5;
        }
        if (room < 1) {
            continue;
        }
        const x = player.x + dir.x * 1;
        const y = player.y + dir.y * 1;
        const score =
            Math.hypot(x - soldier.x, y - soldier.y) +
            0.4 * room -
            0.3 * Math.hypot(x - to.x, y - to.y);
        if (score > bestScore) {
            bestScore = score;
            best = dir;
        }
    }
    return best ?? walkTo(sim, to.x, to.y);
}

// Ba-Ba: up to her altar while her stones roll (round the edges, where the gap isn't), beside a
// boulder's rocks whenever there are some (her avalanche hits everyone not beside one), and never
// into the pit
// How far one of Ba-Ba's rolling boulders knocks you
const BOULDER_KNOCK =
    BA_BA.boss!.attacks.find((attack) => attack.name === "Rolling boulders")!.pattern!.knockback ??
    0;

function babaMove(sim: Sim, def: PathBoss, boss: Sim["enemies"][number]): Point {
    const player = sim.player;
    const boulders = def.boulders!;
    const pit = boulders.pit;
    const avoid: Point[] = [];
    if (sim.tombsPit) {
        // The gap, and while her boulders roll, the strip north of it a boulder's knock back (four
        // tiles) would carry you into: a walk across it to the cracked lane ended in the gap
        const strip = boss.bossState?.ordeal ? BOULDER_KNOCK + 1 : 1;
        for (let y = Math.floor(pit.y0) - 1; y <= pit.y1 + strip; y++) {
            for (let x = Math.floor(pit.x0) - 1; x <= pit.x1 + 1; x++) {
                avoid.push({ x: x + 0.5, y: y + 0.5 });
            }
        }
    }
    if (boss.bossState?.ordeal) {
        // Each row's one cracked boulder is the way through: in its lane, the weapons break it as
        // it comes; edging north to her altar between rows ends her stones sooner
        const cracked = sim.enemies
            .filter((e) => !e.dead && e.def.id === "cracked_boulder" && e.y > player.y - 0.5)
            .sort((a, b) => a.y - b.y)[0];
        // With her gap open (Mind the Gap), a boulder's knock back over it is a fall: a lane
        // above it isn't worth the cracked boulder, so off to the side of it, where a knock
        // only hurts
        const overGap = (x: number) =>
            sim.tombsPit !== undefined && x > pit.x0 - 1.5 && x < pit.x1 + 1.5;
        if (cracked && !overGap(cracked.x)) {
            const near = cracked.y - player.y < 5;
            return walkAvoiding(sim, cracked.x, player.y + (near ? 0 : 1.5), avoid, 0);
        }
        if (overGap(player.x) || (cracked && overGap(cracked.x))) {
            const side =
                Math.abs(player.x - pit.x0) < Math.abs(player.x - pit.x1) ? pit.x0 - 3 : pit.x1 + 3;
            return walkAvoiding(sim, side, player.y, avoid, 0);
        }
        // Her altar, by the west side
        const side =
            Math.abs(player.x - pit.x0) < Math.abs(player.x - pit.x1) ? pit.x0 - 3 : pit.x1 + 3;
        const to =
            player.y < boulders.altar.y - 6 ? { x: side, y: boulders.altar.y - 2 } : boulders.altar;
        return walkAvoiding(sim, to.x, to.y, avoid, 0);
    }
    const rock = sim.tombsCover
        .filter((c) => c.endTick > sim.tick)
        .sort(
            (a, b) =>
                Math.hypot(a.x - player.x, a.y - player.y) -
                Math.hypot(b.x - player.x, b.y - player.y),
        )[0];
    if (rock) {
        // Beside it, on her side, so her stomp and shockwave still miss
        const dx = boss.x - rock.x;
        const dy = boss.y - rock.y;
        const len = Math.hypot(dx, dy) || 1;
        const reach = rock.radius + 1;
        const to = { x: rock.x - (dx / len) * reach, y: rock.y - (dy / len) * reach };
        return Math.hypot(to.x - player.x, to.y - player.y) < 1
            ? nudge(sim, to.x, to.y)
            : walkAvoiding(sim, to.x, to.y, avoid, 0);
    }
    const anchor = { x: boss.x, y: boss.y - (boss.radius + 4.5) };
    return avoid.length > 0
        ? walkAvoiding(sim, anchor.x, anchor.y, avoid, 0)
        : kite(sim, anchor, 2.5);
}

// Ba-Ba's rampage (a surge) coming down a lane that runs into one of her boulder's rocks: she's
// stopped dead against it, stunned, so behind the rock is as safe as out of the lane, and the
// stun's the window (a person baits her into it). Undefined unless the bot's in the lane past the
// rock and a short walk from behind it (otherwise it steps out of the lane: shapeStep).
function rampageCover(sim: Sim, boss: Sim["enemies"][number]): Point | undefined {
    const state = boss.bossState;
    const lane = state?.windup?.attack.kind === "surge" ? state.windup.lane : state?.surge?.lane;
    if (!lane) {
        return undefined;
    }
    const player = sim.player;
    const dx = lane.toX - lane.fromX;
    const dy = lane.toY - lane.fromY;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const along = (x: number, y: number) => (x - lane.fromX) * ux + (y - lane.fromY) * uy;
    const across = (x: number, y: number) => (x - lane.fromX) * uy - (y - lane.fromY) * ux;
    const from = along(boss.x, boss.y);
    // The first rock she'd run into, ahead of her
    const rock = sim.tombsCover
        .filter(
            (r) =>
                r.endTick > sim.tick &&
                Math.abs(across(r.x, r.y)) < r.radius + boss.radius &&
                along(r.x, r.y) > from,
        )
        .sort((a, b) => along(a.x, a.y) - along(b.x, b.y))[0];
    if (!rock || Math.abs(across(player.x, player.y)) >= lane.halfWidth + 1) {
        return undefined;
    }
    // Behind it: on the lane's line through the rock, its far side
    const spot = {
        x: rock.x + ux * (rock.radius + player.radius + 0.5),
        y: rock.y + uy * (rock.radius + player.radius + 0.5),
    };
    const away = Math.hypot(spot.x - player.x, spot.y - player.y);
    if (along(player.x, player.y) < along(rock.x, rock.y) - rock.radius || away > 3) {
        return undefined;
    }
    return away < 0.3 ? { x: 0, y: 0 } : walkTo(sim, spot.x, spot.y);
}

// Akkha: the quadrant his Memory Blast spares at each burst; with his shadows up, the quadrant of
// one that's dead (he walks after you, and only there can he be hurt), off his trailing orbs
// Where the bot stands for Akkha's Memory Blast: this far from the middle along the line the safe
// quadrant shares with the next, and this far across it into the safe one
const AKKHA_HOP_OUT = 3.4;
const AKKHA_HOP_IN = 0.7;

function akkhaMove(sim: Sim, def: PathBoss, boss: Sim["enemies"][number]): Point {
    const fight = sim.tombsAkkha!;
    const q = def.quadrants!;
    const corner = (quadrant: number): Point => {
        const sx = quadrant === 1 || quadrant === 2 ? 1 : -1;
        const sy = quadrant === 0 || quadrant === 1 ? 1 : -1;
        return { x: q.middle.x + sx * q.half * 0.45, y: q.middle.y + sy * q.half * 0.45 };
    };
    // Round his orbs, and round him: he's solid, and the flow field only knows the walls, so a
    // walk across the room (to a hop spot the other side of him in his Memory Blast) would push
    // against him till the burst landed
    const avoid = fight.orbs.map((o) => ({ x: o.x, y: o.y }));
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            const x = Math.floor(boss.x) + dx + 0.5;
            const y = Math.floor(boss.y) + dy + 0.5;
            if (Math.hypot(x - boss.x, y - boss.y) <= boss.radius + 0.6) {
                avoid.push({ x, y });
            }
        }
    }
    const go = (to: Point) =>
        Math.hypot(to.x - sim.player.x, to.y - sim.player.y) < 1
            ? nudge(sim, to.x, to.y)
            : walkAvoiding(sim, to.x, to.y, avoid, 0);
    // Marked for Detonate: off any teammate's row or column close by (two tiles off does it)
    if (fight.detonate) {
        const self = sim.player;
        const near = sim.heroes
            .filter((h) => h.player !== self && !h.down && !h.left)
            .map((h) => h.player)
            .filter((p) => Math.abs(p.x - self.x) < 2.2 && Math.abs(p.y - self.y) < 2.2)[0];
        if (near) {
            const away = Math.hypot(self.x - near.x, self.y - near.y) || 1;
            return go({
                x: self.x + ((self.x - near.x) / away) * 3,
                y: self.y + ((self.y - near.y) / away) * 3,
            });
        }
    }
    const memory = fight.memory;
    if (memory && memory.step < memory.order.length) {
        // The whole order's shown before the bursts come, so stand in the safe quadrant right by
        // its line with the next, and hop across as each burst lands: a step of a tile or so,
        // whatever the burst gap (Feeling Special makes it 1.2 s, far less than a walk between
        // corners). Out of Keep Back's reach of him in the middle, so 3.4 tiles out along the
        // line the two share.
        const safe = memory.order[memory.step];
        const next = memory.order[memory.step + 1];
        const sign = (quadrant: number) => ({
            x: quadrant === 1 || quadrant === 2 ? 1 : -1,
            y: quadrant === 0 || quadrant === 1 ? 1 : -1,
        });
        const s = sign(safe);
        const n = next === undefined ? s : sign(next);
        const along = AKKHA_HOP_OUT;
        const across = AKKHA_HOP_IN;
        const spot =
            next === undefined
                ? { x: q.middle.x + s.x * along * 0.75, y: q.middle.y + s.y * along * 0.75 }
                : n.x !== s.x
                  ? { x: q.middle.x + s.x * across, y: q.middle.y + s.y * along }
                  : { x: q.middle.x + s.x * along, y: q.middle.y + s.y * across };
        return go(spot);
    }
    if (fight.shadows.length > 0) {
        const dead = fight.shadows.filter((s) => {
            const e = sim.enemies.find((x) => x.uid === s.uid);
            return !e || e.dead;
        });
        if (dead.length > 0) {
            return go(corner(dead[0].quadrant));
        }
        // None down yet: beside the one struck (the rest are shielded once it is), or else the
        // nearest
        const live = fight.shadows
            .map((s) => sim.enemies.find((x) => x.uid === s.uid))
            .filter((e): e is NonNullable<typeof e> => !!e && !e.dead)
            .filter((e) => fight.shadowStruck === undefined || e.uid === fight.shadowStruck)
            .sort(
                (a, b) =>
                    Math.hypot(a.x - sim.player.x, a.y - sim.player.y) -
                    Math.hypot(b.x - sim.player.x, b.y - sim.player.y),
            )[0];
        if (live) {
            return go({ x: (live.x + q.middle.x) / 2, y: (live.y + q.middle.y) / 2 });
        }
    }
    // Out of his spear's reach, near enough for the rest: round him on the floor, not backed
    // into a wall (straight south of him is the way in, where a wipe puts you)
    // As far as his spear reaches when the hero's weapons reach that far; otherwise as near as
    // they need (dodging (bossMove) steps out of a thrust as it winds up)
    const spot = ringSpot(
        sim,
        boss,
        boss.radius + Math.min(6, Math.max(1.2, heroReach(sim) - 0.5)),
        q,
    );
    return walkAvoiding(sim, spot.x, spot.y, avoid, 0);
}

// How far the hero's weapons reach, the furthest of them: a slash's or sweep's reach, an aura's
// or orbit's ring, and about this far for what's thrown, shot or cast
const THROWN_REACH = 7;

export function heroReach(sim: Sim): number {
    let reach = 0;
    for (const weapon of sim.weapons) {
        const level = weapon.def.levels[Math.max(0, weapon.level - 1)];
        const kind = weapon.def.kind;
        reach = Math.max(
            reach,
            kind === "slash" || kind === "sweep" || kind === "aura" || kind === "orbit"
                ? (level?.area ?? 1)
                : THROWN_REACH,
        );
    }
    return reach;
}

// The open spot this far from a boss, inside its arena's square, nearest the player: where to
// stand clear of its reach without being pinned against a wall
function ringSpot(
    sim: Sim,
    boss: Point,
    distance: number,
    square: { middle: Point; half: number },
): Point {
    const player = sim.player;
    const inner = square.half - 1;
    let best: Point | undefined;
    let bestScore = Infinity;
    for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        const spot = {
            x: boss.x + Math.cos(angle) * distance,
            y: boss.y + Math.sin(angle) * distance,
        };
        if (
            Math.abs(spot.x - square.middle.x) > inner ||
            Math.abs(spot.y - square.middle.y) > inner ||
            sim.grid.isSolid(Math.floor(spot.x), Math.floor(spot.y))
        ) {
            continue;
        }
        const score = Math.hypot(spot.x - player.x, spot.y - player.y);
        if (score < bestScore) {
            bestScore = score;
            best = spot;
        }
    }
    // Nowhere far enough inside: the square's middle, the furthest from every wall
    return best ?? square.middle;
}

// Zebak: on his island near enough for weapons to reach him; south of a boulder on the line
// from him before his roar; in a tidal wave's gap as it comes; off his acid
function zebakMove(sim: Sim, def: PathBoss, boss: Sim["enemies"][number]): Point {
    const fight = sim.tombsZebak!;
    const island = def.island!;
    const player = sim.player;
    const acid: Point[] = [];
    for (const pool of fight.acid) {
        for (let y = Math.floor(pool.y - pool.half); y <= pool.y + pool.half; y++) {
            for (let x = Math.floor(pool.x - pool.half); x <= pool.x + pool.half; x++) {
                acid.push({ x: x + 0.5, y: y + 0.5 });
            }
        }
    }
    // His boulders are solid: round them, not into them
    const boulders = sim.tombsCover.filter((c) => c.endTick > sim.tick);
    const go = (to: Point) =>
        Math.hypot(to.x - player.x, to.y - player.y) < 1
            ? nudge(sim, to.x, to.y)
            : walkAvoiding(sim, to.x, to.y, [...acid, ...boulders], 0);
    const inAcid = (x: number, y: number, margin = 0.5 + player.radius) =>
        fight.acid.some(
            (a) => Math.abs(a.x - x) <= a.half + margin && Math.abs(a.y - y) <= a.half + margin,
        );
    // His roar coming: straight behind a boulder, down the island from him (within its shelter:
    // zebakShelters), a spot off the acid if there is one, before anything (the roar's a share of
    // your hitpoints, acid or not)
    if (fight.roar) {
        const spots: (Point & { dry: boolean })[] = [];
        for (const c of sim.tombsCover) {
            if (c.look !== "zebak_boulder" || c.endTick <= sim.tick) {
                continue;
            }
            const away = c.y >= boss.y ? 1 : -1;
            for (const behind of [1.2, 1.9, 2.6]) {
                const x = c.x;
                const y = c.y + away * (c.radius + behind);
                spots.push({ x, y, dry: !inAcid(x, y) });
            }
        }
        const shelter = spots
            .filter(
                (p) =>
                    sim.grid.contains(p.x, p.y) &&
                    !sim.grid.isSolid(Math.floor(p.x), Math.floor(p.y)),
            )
            .sort(
                (a, b) =>
                    Number(b.dry) - Number(a.dry) ||
                    Math.hypot(a.x - player.x, a.y - player.y) -
                        Math.hypot(b.x - player.x, b.y - player.y),
            )[0];
        if (shelter) {
            return go(shelter);
        }
    }
    // His blood clouds (Not Just a Head) after you: a hit heals him, so a near one is walked away
    // from, dry ground and boulders in mind; they're slower than you and lose hitpoints a tile
    // they follow, so they die on the way
    const CLOUD_NEAR = 3;
    const cloud = fight.clouds
        .map((c) => sim.enemies.find((e) => e.uid === c.uid))
        .filter((e): e is NonNullable<typeof e> => !!e && !e.dead)
        .sort(
            (a, b) =>
                Math.hypot(a.x - player.x, a.y - player.y) -
                Math.hypot(b.x - player.x, b.y - player.y),
        )[0];
    if (cloud && Math.hypot(cloud.x - player.x, cloud.y - player.y) < CLOUD_NEAR + cloud.radius) {
        const dx = player.x - cloud.x;
        const dy = player.y - cloud.y;
        // The spot a few tiles further off, on the island, off the acid if it can be
        let best: Point | undefined;
        let bestScore = Infinity;
        for (let i = 0; i < 12; i++) {
            const angle =
                Math.atan2(dy, dx) + ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 6;
            const spot = {
                x: player.x + Math.cos(angle) * 3.5,
                y: player.y + Math.sin(angle) * 3.5,
            };
            if (
                spot.x < island.x0 + 0.5 ||
                spot.x > island.x1 + 0.5 ||
                spot.y < island.y0 + 0.5 ||
                spot.y > island.y1 + 0.5 ||
                sim.grid.isSolid(Math.floor(spot.x), Math.floor(spot.y)) ||
                boulders.some(
                    (b) => Math.hypot(b.x - spot.x, b.y - spot.y) < b.radius + player.radius + 0.4,
                )
            ) {
                continue;
            }
            const score = i + (inAcid(spot.x, spot.y) ? 20 : 0);
            if (score < bestScore) {
                bestScore = score;
                best = spot;
            }
        }
        if (best) {
            return go(best);
        }
    }
    // A wave coming: into its gap, at a dry spot in that column ahead of it if there's one near
    // (a wave hurts and shoves, and a pool and its gap pursuit mustn't have the bot bounce
    // between them)
    for (const wave of fight.waves) {
        const coming = (player.y - wave.y) * wave.dir;
        if (coming > -0.6 && coming < 4) {
            const x = (wave.gapX0 + wave.gapX1) / 2 + 0.5;
            const rows = [0, 1, 2, 3].map((k) => player.y + k * wave.dir);
            const dry = rows.find(
                (y) =>
                    sim.grid.contains(x, y) &&
                    !sim.grid.isSolid(Math.floor(x), Math.floor(y)) &&
                    !inAcid(x, y),
            );
            return go({ x, y: dry ?? player.y });
        }
    }
    // In a pool (spat onto you, or shoved in), or brushing its edge: straight out the nearest
    // side, before anything, till the body's clear of it (it hurts the moment you're back in)
    const inPool = fight.acid.find(
        (a) =>
            Math.abs(a.x - player.x) <= a.half + 0.5 + player.radius &&
            Math.abs(a.y - player.y) <= a.half + 0.5 + player.radius,
    );
    if (inPool) {
        const out = inPool.half + 0.5 + player.radius + 0.3;
        const exits = [
            { x: inPool.x - out, y: player.y },
            { x: inPool.x + out, y: player.y },
            { x: player.x, y: inPool.y - out },
            { x: player.x, y: inPool.y + out },
        ]
            .filter(
                (e) =>
                    sim.grid.contains(e.x, e.y) &&
                    !sim.grid.isSolid(Math.floor(e.x), Math.floor(e.y)) &&
                    !inAcid(e.x, e.y),
            )
            .sort(
                (a, b) =>
                    Math.hypot(a.x - player.x, a.y - player.y) -
                    Math.hypot(b.x - player.x, b.y - player.y),
            );
        const exit = exits[0];
        if (exit) {
            const dx = exit.x - player.x;
            const dy = exit.y - player.y;
            const length = Math.hypot(dx, dy) || 1;
            return { x: dx / length, y: dy / length };
        }
    }
    // As near him as the weapons need, as far as the island goes: melee has the row along its
    // north edge, and a thrower any dry spot within reach (the nearest, so it isn't forever
    // crossing the island), none a boulder's on
    const melee = heroReach(sim) < 4;
    const reach = Math.max(1, Math.min(3, heroReach(sim) - 0.6));
    const y = Math.min(island.y1 - 3, boss.y - boss.radius - reach);
    const clear = (x: number, y: number) =>
        sim.grid.contains(x, y) &&
        !sim.grid.isSolid(Math.floor(x), Math.floor(y)) &&
        !boulders.some((b) => Math.hypot(b.x - x, b.y - y) < b.radius + player.radius + 0.4) &&
        !inAcid(x, y, 0.5 + player.radius + 0.2);
    const within = boss.radius + heroReach(sim) - 0.3;
    // His jaws missed and his head's down at the island's edge: melee straight back in under it,
    // as close as his body lets (off the acid), for as long as it's down
    if (melee && sim.isExposed(boss)) {
        const close = boss.y - boss.radius - player.radius - 0.4;
        for (const dx of [0, -1, 1, -2, 2]) {
            const x = boss.x + dx;
            if (clear(x, close)) {
                return go({ x, y: close });
            }
        }
    }
    if (melee) {
        for (const dx of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
            const x = boss.x + dx;
            if (Math.hypot(dx, boss.y - y) <= Math.max(within, boss.y - y) && clear(x, y)) {
                return go({ x, y });
            }
        }
    } else {
        let best: Point | undefined;
        let bestAway = Infinity;
        for (let sy = y; sy >= island.y0 + 1 && boss.y - sy <= within; sy -= 1) {
            for (let dx = -6; dx <= 6; dx++) {
                const x = boss.x + dx;
                if (Math.hypot(dx, boss.y - sy) > within || !clear(x, sy)) {
                    continue;
                }
                // Where it stands, if that's still dry, before anywhere else
                const off = Math.hypot(x - player.x, sy - player.y);
                const away = off - (off < 1 ? 2 : 0);
                if (away < bestAway) {
                    bestAway = away;
                    best = { x, y: sy };
                }
            }
        }
        if (best) {
            return go(best);
        }
    }
    // Every spot in reach is acid: a jug at rest, rolled north to break at the island's edge by
    // the pool, clears it (its water takes any pool near where it breaks). Behind the jug, then
    // into it.
    const push = jugPush(sim, fight, island, { x: boss.x, y }, acid, boulders, inAcid);
    if (push) {
        return push;
    }
    return go({ x: boss.x, y });
}

// The move that rolls a jug to break by the acid on a spot: behind the jug on the line from the
// break, and a step into it; nothing if no resting jug can get there
function jugPush(
    sim: Sim,
    fight: NonNullable<Sim["tombsZebak"]>,
    island: { x0: number; y0: number; x1: number; y1: number },
    spot: Point,
    acid: Point[],
    boulders: { x: number; y: number; radius: number }[],
    inAcid: (x: number, y: number) => boolean,
): Point | undefined {
    const player = sim.player;
    const pool = fight.acid
        .filter(
            (a) => Math.abs(a.x - spot.x) <= a.half + 0.7 && Math.abs(a.y - spot.y) <= a.half + 0.7,
        )
        .sort(
            (a, b) =>
                Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y),
        )[0];
    if (!pool) {
        return undefined;
    }
    // Rolled this far, breaking at a boulder or the island's edge, its water clearing acid this
    // far each way from the break (less with Upset Stomach, when the pools are bigger)
    const water = sim.invocations.includes("upset_stomach")
        ? ZEBAK.jugs.upsetWater
        : ZEBAK.jugs.water;
    for (const jug of fight.jugs) {
        if (jug.left > 0) {
            continue;
        }
        const enemy = sim.enemies.find((e) => e.uid === jug.uid);
        if (!enemy || enemy.dead) {
            continue;
        }
        // One sitting in acid is pushed from inside it: leave it
        if (
            fight.acid.some(
                (a) =>
                    Math.abs(a.x - enemy.x) <= a.half + 0.5 + player.radius + enemy.radius &&
                    Math.abs(a.y - enemy.y) <= a.half + 0.5 + player.radius + enemy.radius,
            )
        ) {
            continue;
        }
        // Rolled at the island's north edge above the pool: where it'd break
        const aim = { x: pool.x, y: island.y1 + 1.2 };
        const dx = aim.x - enemy.x;
        const dy = aim.y - enemy.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.5 || dy <= 0) {
            continue;
        }
        const d = { x: dx / length, y: dy / length };
        let breakAt: Point | undefined;
        for (let t = 0.25; t <= ZEBAK.jugs.reach; t += 0.25) {
            const x = enemy.x + d.x * t;
            const y = enemy.y + d.y * t;
            const off = x < island.x0 || x > island.x1 + 1 || y < island.y0 || y > island.y1 + 1;
            if (
                off ||
                boulders.some((b) => Math.hypot(b.x - x, b.y - y) <= b.radius + enemy.radius)
            ) {
                breakAt = { x, y };
                break;
            }
            breakAt = { x, y };
        }
        if (
            !breakAt ||
            Math.abs(pool.x - breakAt.x) > water + pool.half ||
            Math.abs(pool.y - breakAt.y) > water + pool.half
        ) {
            continue;
        }
        const behind = {
            x: enemy.x - d.x * (enemy.radius + player.radius + 0.4),
            y: enemy.y - d.y * (enemy.radius + player.radius + 0.4),
        };
        // Somewhere to stand: on the island, dry, no boulder there
        if (
            behind.x < island.x0 ||
            behind.x > island.x1 + 1 ||
            behind.y < island.y0 ||
            behind.y > island.y1 + 1 ||
            sim.grid.isSolid(Math.floor(behind.x), Math.floor(behind.y)) ||
            inAcid(behind.x, behind.y) ||
            boulders.some(
                (b) => Math.hypot(b.x - behind.x, b.y - behind.y) < b.radius + player.radius + 0.4,
            )
        ) {
            continue;
        }
        if (Math.hypot(behind.x - player.x, behind.y - player.y) < 0.5) {
            return d;
        }
        return walkAvoiding(sim, behind.x, behind.y, [...acid, ...boulders], 0);
    }
    return undefined;
}

// The Wardens. The first phase soaking one side's orbs along their troughs beside the obelisk
// (the side whose Warden the hero's own style can't hurt first, starved, so the other wakes),
// each one more against the obelisk, and off them once it holds the most; the second near the
// Warden, by its core when it's out, off the obelisk's marks; the last at the floor's north end,
// off rising slabs, stepping on its siphons, off its lightning
function wardensMove(sim: Sim): Point | undefined {
    const fight = sim.tombsWardens!;
    const places = sim.map.tombs!.wardens!;
    const player = sim.player;
    if (fight.phase === 1) {
        const soak = WARDENS.orbs.soak;
        const energy = sim.heroes[sim["hero"].index].wardenEnergy;
        // The side to starve: a magic hero wants Elidinis' (magic first) awake, so takes Tumeken's
        // orbs; a ranged one the other way round; melee, Tumeken's (the nearer trough to the way in)
        const style = sim.weapons[0] ? getWeaponStyle(sim.weapons[0].def) : "melee";
        const starve: "elidinis" | "tumeken" = style === "ranged" ? "elidinis" : "tumeken";
        const stepTicks = WARDENS.orbs.stepSeconds * 50;
        // Where each orb's heading next, and where it is
        const orbAt = (orb: (typeof fight.orbs)[number]) => {
            const t = Math.min(1, (sim.tick - orb.stepTick) / stepTicks);
            return {
                x: orb.fromX + (orb.x - orb.fromX) * t,
                y: orb.fromY + (orb.y - orb.fromY) * t,
            };
        };
        const full = energy >= soak.max;
        // The orb to take: the starved side's nearest to the hero that's left its spawn tile
        const prey = full
            ? undefined
            : fight.orbs
                  .filter(
                      (orb) =>
                          orb.side === starve && orb.step >= 1 && orb.step < WARDENS.orbs.steps,
                  )
                  .sort((a, b) => {
                      const pa = orbAt(a);
                      const pb = orbAt(b);
                      return (
                          Math.hypot(pa.x - player.x, pa.y - player.y) -
                          Math.hypot(pb.x - player.x, pb.y - player.y)
                      );
                  })[0];
        // Full: every orb's a hurt, kept a step off
        const nearAnOrb = (x: number, y: number) =>
            full &&
            fight.orbs.some((orb) => {
                const at = orbAt(orb);
                return Math.hypot(at.x - x, at.y - y) < soak.reach + player.radius + 0.4;
            });
        const gap = places.sides[starve].gap;
        // Off a pyramid that's hitting or about to (they're a checkerboard, so the next square
        // along is clear): one side's cells while the other's are still hitting is the place to
        // be, till its own hits are a step or two off
        const cell = WARDENS.pyramids.cell;
        const glowing = (x: number, y: number) =>
            fight.pyramids.some(
                (p) =>
                    p.startTick + WARDENS.pyramids.firstHit * 50 - sim.tick < 75 &&
                    sim.tick - p.startTick <= WARDENS.pyramids.lastHit * 50 &&
                    x >= p.x - 0.4 &&
                    x < p.x + cell + 0.4 &&
                    y >= p.y - 0.4 &&
                    y < p.y + cell + 0.4,
            );
        // To the orb's next tile (it's there within a step), else a spot by the starved side's
        // trough mouth, a tile or two off the troughs
        let to = prey ? { x: prey.x, y: prey.y } : { x: gap.x, y: gap.y - 2.5 };
        const danger = (x: number, y: number) => glowing(x, y) || nearAnOrb(x, y);
        if (!prey && danger(to.x, to.y)) {
            const clear = [
                { x: to.x, y: to.y - cell },
                { x: to.x - cell, y: to.y },
                { x: to.x + cell, y: to.y },
                { x: to.x, y: to.y + cell },
            ].filter(
                (p) => !danger(p.x, p.y) && !sim.grid.isSolid(Math.floor(p.x), Math.floor(p.y)),
            );
            to = clear[0] ?? to;
        }
        return dodging(
            sim,
            Math.hypot(to.x - player.x, to.y - player.y) < 1
                ? nudge(sim, to.x, to.y)
                : walkTo(sim, to.x, to.y),
            danger,
        );
    }
    // The marks about to land (hurts > 0 within the next second or so), tile by tile
    const soon = sim.tick + 60;
    const marks = fight.marks
        .filter((m) => m.hurts > 0 && m.from >= sim.tick && m.from <= soon)
        .map((m) => ({ x: Math.floor(m.x) + 0.5, y: Math.floor(m.y) + 0.5 }));
    const onMark = marks.some(
        (m) => Math.floor(m.x) === Math.floor(player.x) && Math.floor(m.y) === Math.floor(player.y),
    );
    if (fight.phase === 2) {
        const two = fight.two!;
        const core =
            two.kneel?.coreUid !== undefined
                ? sim.enemies.find((e) => e.uid === two.kneel!.coreUid)
                : undefined;
        const warden = sim.enemies.find((e) => e.uid === two.wardenUid);
        const target = core && !core.dead ? core : warden;
        // As near as the weapons need, no nearer: a melee hero right up to it, a thrower as far
        // off as its weapons reach, which Tumeken's walks up and slashes anyone nearer than (the
        // core, thrown out, doesn't fight: right up to it)
        const keep =
            target === core
                ? Math.max(1, Math.min(2.5, heroReach(sim) - 0.6))
                : Math.max(1, Math.min(6, heroReach(sim) - 1));
        let to = target ? { x: target.x, y: target.y - (target.radius + keep) } : places.arrive;
        // A thrower keeps the Warden at that distance all round, rather than backing to the
        // floor's end (it walks slower than you, so there's always a spot to go to)
        if (target && target === warden && heroReach(sim) >= 4) {
            const floor = places.floor;
            to = ringSpot(sim, target, target.radius + keep, {
                middle: { x: (floor.x0 + floor.x1 + 1) / 2, y: (floor.y0 + floor.y1 + 1) / 2 },
                half: Math.min(floor.x1 + 1 - floor.x0, floor.y1 + 1 - floor.y0) / 2,
            });
        }
        to = clampTo(to, places.floor);
        const onAMark = (x: number, y: number) =>
            marks.some(
                (m) => Math.floor(m.x) === Math.floor(x) && Math.floor(m.y) === Math.floor(y),
            );
        // The spot itself about to be struck: the nearest tile by it that isn't
        if (onAMark(to.x, to.y)) {
            let best: Point | undefined;
            let bestAway = Infinity;
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    const x = Math.floor(to.x) + dx + 0.5;
                    const y = Math.floor(to.y) + dy + 0.5;
                    const floor = places.floor;
                    if (
                        x < floor.x0 ||
                        x > floor.x1 + 1 ||
                        y < floor.y0 ||
                        y > floor.y1 + 1 ||
                        onAMark(x, y) ||
                        sim.grid.isSolid(Math.floor(x), Math.floor(y))
                    ) {
                        continue;
                    }
                    const away = Math.hypot(dx, dy) + Math.hypot(x - player.x, y - player.y) * 0.3;
                    if (away < bestAway) {
                        bestAway = away;
                        best = { x, y };
                    }
                }
            }
            to = best ?? to;
        }
        if (onMark || marks.length > 0) {
            // Still dodging its skulls on the way off them
            return dodging(
                sim,
                safeStep(sim, to, (x, y) =>
                    marks.some((m) => Math.floor(m.x) === x && Math.floor(m.y) === y),
                ),
                onAMark,
            );
        }
        // Its skulls and their storms dodged, off the obelisk's marks as it goes; in to it while
        // its guard's down and the button's ready
        const punish = punishMove(sim);
        if (punish) {
            return dodging(sim, punish, onAMark);
        }
        return dodging(
            sim,
            Math.hypot(to.x - player.x, to.y - player.y) < 1
                ? nudge(sim, to.x, to.y)
                : walkTo(sim, to.x, to.y),
            onAMark,
        );
    }
    // The last phase
    const three = fight.three!;
    const last = places.last!;
    const floor = sim.floor!;
    const danger = (x: number, y: number) => {
        const i = floor.index(x, y);
        if (i < 0) {
            return true;
        }
        const warned = floor.warnAt[i] !== -1 && floor.warnAt[i] <= sim.tick + 25;
        const rising = floor.riseAt[i] !== -1 && floor.riseAt[i] >= sim.tick - 15;
        return (
            warned ||
            rising ||
            floor.isHurting(x, y, sim.tick) ||
            floor.isFalling(x, y, sim.tick + 40) ||
            marks.some((m) => Math.floor(m.x) === x && Math.floor(m.y) === y)
        );
    };
    // The column the next slam leaves alone, in front of the Warden: east takes
    // x from the middle up and west from the middle down (a column west of the middle for the
    // east one, east of it for the west), both all but the middle three. The count goes up as a
    // slam starts: that one's safe column is kept till its rows are down and done hurting, or
    // till the next's a step away (enraged there are none: the lightning's dodged instead)
    const middle = floor.x0 + Math.floor(floor.sizeX / 2);
    let seen = slamSeen.get(sim);
    if (!seen || seen.slam !== three.slam) {
        seen = { slam: three.slam, tick: sim.tick };
        slamSeen.set(sim, seen);
    }
    const landingTicks = Math.min(
        50 * (1 + floor.sizeY * 0.1 + 0.4),
        Math.max(25, three.nextSlam - seen.tick - 15),
    );
    const landing = three.slam > 0 && sim.tick - seen.tick < landingTicks;
    const next = (["east", "west", "both"] as const)[(three.slam - (landing ? 1 : 0)) % 3];
    const column = next === "east" ? middle - 1 : next === "west" ? middle + 1 : middle;
    // In front of the Warden (it's in the floor's middle, the crater behind it), as near as the
    // weapons need: a melee hero on the row before it, anything that reaches further back, but
    // never on the rows the enrage has torn away
    const warden = sim.enemies.find((e) => e.uid === three.wardenUid);
    const front = wardenFrontRow(warden ?? { y: last.at.y, radius: 2.5 });
    const reachY = warden
        ? warden.y - warden.radius - Math.max(0.8, heroReach(sim) - 0.6)
        : front + 0.5;
    const y = Math.min(front + 0.5, Math.max(floor.y0 + floor.rowsDropped + 0.5, reachY));
    let to: Point = { x: column + 0.5, y };
    const siphons = three.siphons;
    if (siphons) {
        const left = siphons.uids
            .map((uid) => sim.enemies.find((e) => e.uid === uid))
            .filter(
                (e): e is NonNullable<typeof e> => !!e && !e.dead && e.def.id === "wardens_siphon",
            )
            .sort(
                (a, b) =>
                    Math.hypot(a.x - player.x, a.y - player.y) -
                    Math.hypot(b.x - player.x, b.y - player.y),
            );
        if (left.length > 0) {
            to = left[0];
        }
    }
    // The spot itself a danger (a bolt's shadow, a rising slab): the nearest tile
    // by it that isn't, the Warden's way first
    if (danger(Math.floor(to.x), Math.floor(to.y))) {
        let best: Point | undefined;
        let bestAway = Infinity;
        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                const tx = Math.floor(to.x) + dx;
                const ty = Math.floor(to.y) + dy;
                if (danger(tx, ty) || sim.grid.isSolid(tx, ty)) {
                    continue;
                }
                const away = Math.hypot(dx, dy) + (ty < Math.floor(to.y) ? 0.5 : 0);
                if (away < bestAway) {
                    bestAway = away;
                    best = { x: tx + 0.5, y: ty + 0.5 };
                }
            }
        }
        to = best ?? to;
    }
    // Off the floor's dangers tile by tile, and out of the phantoms' way (Zebak's fans, Kephri's
    // fireball and Ba-Ba's rock, aimed where you stand) as it goes
    return dodging(sim, safeStep(sim, to, danger), (x, y) => danger(Math.floor(x), Math.floor(y)));
}

const slamSeen = new WeakMap<Sim, { slam: number; tick: number }>();

function clampTo(to: Point, floor: { x0: number; y0: number; x1: number; y1: number }): Point {
    return {
        x: Math.max(floor.x0 + 0.5, Math.min(floor.x1 + 0.5, to.x)),
        y: Math.max(floor.y0 + 0.5, Math.min(floor.y1 + 0.5, to.y)),
    };
}

// Towards a spot by tiles that aren't dangerous: off a dangerous one first, to the nearest safe
// tile; then round the dangerous ones
function safeStep(sim: Sim, to: Point, danger: (x: number, y: number) => boolean): Point {
    const player = sim.player;
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    if (danger(px, py)) {
        let best: Point | undefined;
        let bestAway = Infinity;
        for (let r = 1; r <= 5 && !best; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (
                        Math.max(Math.abs(dx), Math.abs(dy)) !== r ||
                        danger(px + dx, py + dy) ||
                        sim.grid.isSolid(px + dx, py + dy)
                    ) {
                        continue;
                    }
                    const away = Math.hypot(px + dx + 0.5 - to.x, py + dy + 0.5 - to.y) * 0.2 + r;
                    if (away < bestAway) {
                        bestAway = away;
                        best = { x: px + dx + 0.5, y: py + dy + 0.5 };
                    }
                }
            }
        }
        if (best) {
            return walkTo(sim, best.x, best.y);
        }
    }
    const avoid: Point[] = [];
    for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
            if (danger(px + dx, py + dy)) {
                avoid.push({ x: px + dx + 0.5, y: py + dy + 0.5 });
            }
        }
    }
    if (
        Math.hypot(to.x - player.x, to.y - player.y) < 1 &&
        !danger(Math.floor(to.x), Math.floor(to.y))
    ) {
        return nudge(sim, to.x, to.y);
    }
    return walkAvoiding(sim, to.x, to.y, avoid, 0);
}

// The sim tool's account of a Tombs run: when each path was entered, its puzzle done and its boss
// beaten, the Wardens' phases, the party's deaths, and at the end the result screen's board
export class TombsLog {
    private path: string | undefined;
    private puzzleDone = false;
    private bossUp = false;
    private phase = 0;
    private deaths = 0;
    private since = 0;

    step(sim: Sim): void {
        const at = (sim.tick / 50).toFixed(0);
        if (sim.tombsPath !== this.path) {
            if (sim.tombsPath) {
                console.log(`  ${clock(sim)} into the ${sim.tombsPath} path`);
                this.since = sim.tick;
            } else if (this.path) {
                console.log(`  ${clock(sim)} ${this.path} done (${seconds(sim, this.since)})`);
            }
            this.path = sim.tombsPath;
            this.puzzleDone = false;
            this.bossUp = false;
        }
        const room = sim.tombsRoom;
        if (room?.boss && !this.puzzleDone) {
            this.puzzleDone = true;
            console.log(`  ${clock(sim)}   puzzle done (${seconds(sim, this.since)})`);
            this.since = sim.tick;
        }
        if (room?.boss && room.boss.uid !== -1 && !this.bossUp) {
            this.bossUp = true;
            const boss = sim.enemies.find((e) => e.uid === room.boss!.uid);
            console.log(`  ${clock(sim)}   ${boss?.def.name ?? "boss"} up, ${boss?.maxHp} hp`);
            this.since = sim.tick;
        }
        if (room?.boss?.beatenTick === sim.tick) {
            console.log(`  ${clock(sim)}   boss down (${seconds(sim, this.since)})`);
        }
        const phase = sim.tombsWardens?.phase ?? 0;
        if (phase !== this.phase) {
            console.log(`  ${clock(sim)} the Wardens, phase ${phase}`);
            this.phase = phase;
        }
        if (sim.tombsDeaths !== this.deaths) {
            this.deaths = sim.tombsDeaths;
            console.log(`  ${clock(sim)}   the party died (${this.deaths}), at tick ${at}`);
        }
    }

    report(sim: Sim): void {
        const board = sim.getResult().tombs;
        if (!board) {
            return;
        }
        const paths = board.paths.map((p) => `${p.id} ${formatSeconds(p.seconds)}`).join(", ");
        console.log(
            `  raid level ${board.level}; ${paths}` +
                (board.wardensSeconds !== undefined
                    ? `, wardens ${formatSeconds(board.wardensSeconds)}`
                    : "") +
                `; party died ${board.wipes} times`,
        );
        for (const player of board.party) {
            console.log(
                `  ${player.name || "bot"}: ${player.points} points, ${player.deaths} deaths, ` +
                    (player.chance === undefined
                        ? "no purple left"
                        : `${Math.round(player.chance * 100)}% purple`) +
                    (sim.heroes[0].raidChest
                        ? `, chest: ${sim.heroes[0].raidChest.found.join(" ") || "nothing"}`
                        : ""),
            );
        }
    }
}

function clock(sim: Sim): string {
    return formatSeconds(sim.tick / 50).padStart(5);
}

function seconds(sim: Sim, since: number): string {
    return formatSeconds((sim.tick - since) / 50);
}

function formatSeconds(s: number): string {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
