// The balance bot's Tombs of Amascut: where to go in the Nexus, each path's puzzle room and
// boss, and the Wardens, as a person who knows the raid plays it. It only moves (weapons fire on
// their own), reading the sim as it likes. Nothing here touches the DOM or Node, so the game's
// dev console can drive a run with it too (see docs/design/tombs-of-amascut.md).
import type { Sim } from "../../src/game/core/Sim";
import { FlowField } from "../../src/game/core/world/FlowField";

type Point = { x: number; y: number };

// The order the bot takes the paths in, and the flow field it walks by (a window this many tiles
// across round its target, which holds any one room)
const PATH_ORDER = ["apmeken", "het", "scabaras", "crondis"];
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

export function walkAvoiding(sim: Sim, x: number, y: number, avoid: Point[], around = 1): Point {
    const player = sim.player;
    const dx = x - player.x;
    const dy = y - player.y;
    const away = Math.hypot(dx, dy);
    if (away < 1.5) {
        return nudge(sim, x, y);
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const blocked = new Set<number>();
    for (const spot of avoid) {
        const sx = Math.floor(spot.x);
        const sy = Math.floor(spot.y);
        for (let ox = -around; ox <= around; ox++) {
            for (let oy = -around; oy <= around; oy++) {
                if (sx + ox !== tx || sy + oy !== ty) {
                    blocked.add((sx + ox) * 100000 + sy + oy);
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
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    if (!cached.field.getStep(walls, px, py, step)) {
        // Boxed in by what it's keeping clear of (standing in it): the plain way
        return walkTo(sim, x, y);
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
        return wardensMove(sim);
    }
    if (sim.tombsPath === undefined) {
        return nexusMove(sim);
    }
    const path = tombs.paths.find((p) => p.id === sim.tombsPath);
    const room = sim.tombsRoom;
    const def = path?.room;
    if (!path || !def || !room) {
        return undefined;
    }
    if (room.boss && def.boss) {
        return bossMove(sim, def.boss, room.boss.uid);
    }
    // Through the barrier into the room: a few tiles past its line, away from the safe corridor
    if (!room.started && def.gate) {
        const into = def.gate.x < def.arrive.x ? -3 : 3;
        return walkTo(sim, def.gate.x + into, def.arrive.y);
    }
    return puzzleMove(sim, def);
}

// The Nexus: the next path's door, then the way to the Wardens
function nexusMove(sim: Sim): Point {
    const tombs = sim.map.tombs!;
    const next = PATH_ORDER.map((id) => tombs.paths.find((p) => p.id === id)).find(
        (path) => path?.room && !sim.tombsPathsDone.includes(path.id),
    );
    const to = openNear(sim, next?.door ?? tombs.wardensDoor ?? tombs.nexus, 2.5, tombs.nexus);
    return walkTo(sim, to.x, to.y);
}

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
    return kite(sim, middle);
}

// Het: each of the route's four mirrors turned its way and clean (walked into once each, stepping
// back between), then beside the seal while the beam holds it open
function hetMove(sim: Sim, def: PathRoom): Point {
    const het = sim.tombsRoom!.het!;
    const hero = sim["hero"].index;
    const route = het.mirrors.slice(0, 4);
    const turns = hetTurns(sim, def);
    const player = sim.player;
    const wrong = route
        .map((mirror, i) => ({ mirror, i }))
        .filter(({ mirror, i }) => mirror.dirty || mirror.turn !== turns[i])
        .sort(
            (a, b) =>
                Math.hypot(a.mirror.x - player.x, a.mirror.y - player.y) -
                Math.hypot(b.mirror.x - player.x, b.mirror.y - player.y),
        );
    if (wrong.length > 0) {
        const { mirror } = wrong[0];
        const away = Math.hypot(mirror.x - player.x, mirror.y - player.y);
        if (mirror.touching[hero]) {
            // Touched it: back off past its reach before going in again
            const len = away || 1;
            return walkAvoiding(
                sim,
                mirror.x + ((player.x - mirror.x) / len) * 2.2,
                mirror.y + ((player.y - mirror.y) / len) * 2.2,
                het.mirrors.filter((m) => m !== mirror),
            );
        }
        // Round the others, which it would turn brushing past
        const others = het.mirrors.filter((m) => m !== mirror);
        return walkAvoiding(sim, mirror.x, mirror.y, others);
    }
    // The way's right: fight beside the seal
    const seal = def.het!.seal;
    return kite(sim, { x: seal.x, y: seal.y - 2 }, 2);
}

// The route's mirrors' turns that get the beam to the statue: each way tried on a clean copy of
// the room through the sim's own tracer (the route's four are the first mirrors)
function hetTurns(sim: Sim, def: PathRoom): number[] {
    const het = sim.tombsRoom!.het!;
    const mirrors = het.mirrors.map((m, i) => ({ ...m, dirty: i < 4 ? false : m.dirty }));
    const trial = { ...het, mirrors };
    for (let turns = 0; turns < 16; turns++) {
        for (let i = 0; i < 4; i++) {
            mirrors[i].turn = ((turns >> i) & 1) as 0 | 1;
        }
        if (sim["traceHetBeam"](trial, def.het!).hit) {
            return mirrors.slice(0, 4).map((m) => m.turn);
        }
    }
    return het.mirrors.slice(0, 4).map((m) => m.turn);
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

// Off a plate, to the gap beside it
function stepOff(sim: Sim, plate: Point): Point {
    return nudge(sim, plate.x + 1, plate.y + 1);
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
    // Sequence: its plates in order, once it's been shown
    if (!solved("sequence")) {
        const seq = scab.sequence;
        const shown = seq.showFrom + seq.order.length * Math.round(0.85 * 50);
        const index = seq.order[seq.step];
        const plate = boards.sequence[index];
        if (sim.tick < shown + 5) {
            return stepOn(sim, { x: plate.x + 1, y: plate.y + 1 }, boards);
        }
        return on === `sequence:${index}` ? stepOff(sim, plate) : stepOn(sim, plate, boards);
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
        return on === `lights:${next.i}`
            ? stepOff(sim, next.plate)
            : stepOn(sim, next.plate, boards);
    }
    // Addition: plates that make up exactly what's left
    const add = scab.addition;
    const pick = additionPick(add.values, add.stepped, add.target - add.sum);
    return pick.length === 0 ? { x: 0, y: 0 } : stepOn(sim, boards.addition[pick[0]], boards);
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

// Addition's plates not stepped on yet that make up exactly what's left, fewest first
export function additionPick(values: number[], stepped: boolean[], left: number): number[] {
    let best: number[] | undefined;
    const search = (from: number, sum: number, chosen: number[]) => {
        if (sum === left) {
            if (!best || chosen.length < best.length) {
                best = [...chosen];
            }
            return;
        }
        if (sum > left || (best && chosen.length >= best.length)) {
            return;
        }
        for (let i = from; i < values.length; i++) {
            if (!stepped[i]) {
                chosen.push(i);
                search(i + 1, sum + values[i], chosen);
                chosen.pop();
            }
        }
    };
    search(0, 0, []);
    return best ?? [];
}

// Crondis: water fetched from a corridor's waterfall to the palm, again till it's grown. A
// corridor's poison band comes down it from the waterfall faster than you walk, so a trip in
// starts once the last band's out of it, with time to fill and be off before the next; a spear
// thrusting across your rows is stepped round to the corridor's other half
const CLOUD_SPEED = 3.5;
const CLOUD_BEHIND = 1.1;
const CLOUD_LENGTH = 3;
const CLOUD_EVERY = 9;
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
    const dodge = spearDodge(sim, def, to);
    if (dodge) {
        return dodge;
    }
    return Math.hypot(to.x - player.x, to.y - player.y) < 1.2
        ? nudge(sim, to.x, to.y)
        : walkTo(sim, to.x, to.y);
}

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
        // The last band's still over the fall, or the next comes before it'd be filled and away
        const recent = crondis.clouds.some(
            (cloud) => cloud.lane === i && now - cloud.startTick / 50 < CLOUD_BEHIND + 0.8,
        );
        const release = crondis.nextCloudTick[i] / 50 - now - walkIn;
        const soon = release < FILL_SECONDS + 0.7;
        const cloudWait = recent ? 1 : soon ? release + CLOUD_BEHIND + 0.8 : 0;
        const wait = walkIn + Math.max(dry, cloudWait);
        const toPalm = lane.fromLow ? 1 : -1;
        const at =
            dry > 0 || recent || soon
                ? { x: fall.fill.x, y: fall.fill.y + toPalm * 2.4 }
                : fall.fill;
        if (!best || wait < best.wait) {
            best = { at, wait };
        }
    });
    return best!.at;
}

// A spear thrusting, or about to, across rows the bot's in or going into: to the corridor's other
// half, or, with both halves out, back out of those rows
function spearDodge(sim: Sim, def: PathRoom, to: Point): Point | undefined {
    const crondis = sim.tombsRoom!.crondis!;
    const places = def.crondis!;
    const player = sim.player;
    const sides = new Set<string>();
    let rows: { y0: number; y1: number } | undefined;
    let lane: (typeof places.lanes)[number] | undefined;
    for (const thrust of crondis.thrusts) {
        if (sim.tick - thrust.startTick >= 50) {
            continue;
        }
        const area = sim.crondisSpearArea(places, thrust);
        if (
            player.x >= area.x0 - 1 &&
            player.x <= area.x1 + 1 &&
            player.y >= area.y0 - 1.2 &&
            player.y <= area.y1 + 1.2
        ) {
            sides.add(thrust.side);
            rows = area;
            lane = places.lanes[thrust.lane];
        }
    }
    if (!rows) {
        return undefined;
    }
    if (sides.size === 1 && lane) {
        // The half it isn't thrusting across, carrying on along the corridor
        const x = sides.has("low") ? lane.high - 1.5 : lane.low + 1.5;
        const dy = Math.sign(to.y - player.y);
        return nudge(sim, x, player.y + dy * (Math.abs(player.x - x) < 0.3 ? 1 : 0.2));
    }
    // Both halves: out of their rows, whichever way's nearer
    const y = player.y > (rows.y0 + rows.y1) / 2 ? rows.y1 + 1.4 : rows.y0 - 1.4;
    return nudge(sim, player.x, y);
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
        return zebakMove(sim, def, boss);
    }
    if (sim.tombsAkkha) {
        return akkhaMove(sim, def, boss);
    }
    if (def.boulders) {
        return babaMove(sim, def, boss);
    }
    // Kephri, and anything else: near enough for every weapon, off what's close
    return kite(sim, { x: boss.x, y: boss.y - (boss.radius + 3) }, 2.5);
}

// Ba-Ba: up to her altar while her stones roll (round the edges, where the gap isn't), beside a
// boulder's rocks whenever there are some (her avalanche hits everyone not beside one), and never
// into the pit
function babaMove(sim: Sim, def: PathBoss, boss: Sim["enemies"][number]): Point {
    const player = sim.player;
    const boulders = def.boulders!;
    const pit = boulders.pit;
    const avoid: Point[] = [];
    if (sim.tombsPit) {
        for (let y = Math.floor(pit.y0) - 1; y <= pit.y1 + 1; y++) {
            for (let x = Math.floor(pit.x0) - 1; x <= pit.x1 + 1; x++) {
                avoid.push({ x: x + 0.5, y: y + 0.5 });
            }
        }
    }
    if (boss.bossState?.ordeal) {
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

// Akkha: the quadrant his Memory Blast spares at each burst; with his shadows up, the quadrant of
// one that's dead (he walks after you, and only there can he be hurt), off his trailing orbs
function akkhaMove(sim: Sim, def: PathBoss, boss: Sim["enemies"][number]): Point {
    const fight = sim.tombsAkkha!;
    const q = def.quadrants!;
    const corner = (quadrant: number): Point => {
        const sx = quadrant === 1 || quadrant === 2 ? 1 : -1;
        const sy = quadrant === 0 || quadrant === 1 ? 1 : -1;
        return { x: q.middle.x + sx * q.half * 0.45, y: q.middle.y + sy * q.half * 0.45 };
    };
    const orbs = fight.orbs.map((o) => ({ x: o.x, y: o.y }));
    const go = (to: Point) =>
        Math.hypot(to.x - sim.player.x, to.y - sim.player.y) < 1
            ? nudge(sim, to.x, to.y)
            : walkAvoiding(sim, to.x, to.y, orbs, 0);
    const memory = fight.memory;
    if (memory && memory.step < memory.order.length) {
        return go(corner(memory.order[memory.step]));
    }
    if (fight.shadows.length > 0) {
        const dead = fight.shadows.filter((s) => {
            const e = sim.enemies.find((x) => x.uid === s.uid);
            return !e || e.dead;
        });
        if (dead.length > 0) {
            return go(corner(dead[0].quadrant));
        }
        // None down yet: beside the nearest, out of its quadrant's flood when one's due
        const live = fight.shadows
            .map((s) => sim.enemies.find((x) => x.uid === s.uid))
            .filter((e): e is NonNullable<typeof e> => !!e && !e.dead)
            .sort(
                (a, b) =>
                    Math.hypot(a.x - sim.player.x, a.y - sim.player.y) -
                    Math.hypot(b.x - sim.player.x, b.y - sim.player.y),
            )[0];
        if (live) {
            return go({ x: (live.x + q.middle.x) / 2, y: (live.y + q.middle.y) / 2 });
        }
    }
    return kite(sim, { x: boss.x, y: boss.y - 3 }, 2.5);
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
    const go = (to: Point) =>
        Math.hypot(to.x - player.x, to.y - player.y) < 1
            ? nudge(sim, to.x, to.y)
            : walkAvoiding(sim, to.x, to.y, acid, 0);
    if (fight.roar) {
        const shelter = sim.tombsCover
            .filter((c) => c.look === "zebak_boulder" && c.endTick > sim.tick)
            .map((c) => {
                const dx = c.x - boss.x;
                const dy = c.y - boss.y;
                const len = Math.hypot(dx, dy) || 1;
                return {
                    x: c.x + (dx / len) * (c.radius + 1.2),
                    y: c.y + (dy / len) * (c.radius + 1.2),
                };
            })
            .sort(
                (a, b) =>
                    Math.hypot(a.x - player.x, a.y - player.y) -
                    Math.hypot(b.x - player.x, b.y - player.y),
            )[0];
        if (shelter) {
            return go(shelter);
        }
    }
    for (const wave of fight.waves) {
        const coming = (player.y - wave.y) * wave.dir;
        if (coming > -0.6 && coming < 4) {
            return go({ x: (wave.gapX0 + wave.gapX1) / 2 + 0.5, y: player.y });
        }
    }
    // As near him as the island goes
    const anchor = { x: boss.x, y: Math.min(island.y1 - 1, boss.y - boss.radius - 3) };
    return go(anchor);
}

// The Wardens. The first phase from a side's gap (beside the obelisk, so every weapon reaches it,
// and blocking that side, so the other Warden wakes); the second near the Warden, by its core when
// it's out, off the obelisk's marks; the last at the floor's north end, off rising slabs, stepping
// on its siphons, off its lightning
function wardensMove(sim: Sim): Point | undefined {
    const fight = sim.tombsWardens!;
    const places = sim.map.tombs!.wardens!;
    const player = sim.player;
    if (fight.phase === 1) {
        const gap = places.sides.tumeken.gap;
        return Math.hypot(gap.x - player.x, gap.y - player.y) < 1
            ? nudge(sim, gap.x, gap.y)
            : walkTo(sim, gap.x, gap.y);
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
        let to = target ? { x: target.x, y: target.y - (target.radius + 2.5) } : places.arrive;
        to = clampTo(to, places.floor);
        if (onMark || marks.length > 0) {
            return safeStep(sim, to, (x, y) =>
                marks.some((m) => Math.floor(m.x) === x && Math.floor(m.y) === y),
            );
        }
        return Math.hypot(to.x - player.x, to.y - player.y) < 1
            ? nudge(sim, to.x, to.y)
            : walkTo(sim, to.x, to.y);
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
    // The floor's middle columns, which its slams leave alone (or a step from it), at its north
    // end, near the Warden
    // Where the next slam won't reach: east, west, then both but the middle three columns, in turn
    // (a column west of the middle for the east one, east of it for the west)
    const middle = floor.x0 + Math.floor(floor.sizeX / 2);
    // The count goes up as a slam starts: that one's safe column is kept till it's down (its
    // warning, a row a tenth of a second from the north, and its hurt)
    let seen = slamSeen.get(sim);
    if (!seen || seen.slam !== three.slam) {
        seen = { slam: three.slam, tick: sim.tick };
        slamSeen.set(sim, seen);
    }
    const landing = three.slam > 0 && sim.tick - seen.tick < 50 * (1 + floor.sizeY * 0.1 + 0.4);
    const next = (["east", "west", "both"] as const)[(three.slam - (landing ? 1 : 0)) % 3];
    const column = next === "east" ? middle - 1 : next === "west" ? middle + 1 : middle;
    let to: Point = { x: column + 0.5, y: last.floor.y1 - 1.5 };
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
    return safeStep(sim, to, danger);
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
                    `${Math.round(player.chance * 100)}% purple` +
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
