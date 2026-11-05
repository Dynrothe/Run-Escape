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
    const to = next?.door ?? tombs.wardensDoor ?? tombs.nexus;
    return walkTo(sim, to.x, to.y);
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

// Scabaras: a plate stepped on by the lines between the board's plates (they're 2 apart), so no
// other plate's crossed on the way: across to the column beside it, along to the row beside it,
// over, then onto it
function stepOn(sim: Sim, plate: Point): Point {
    const player = sim.player;
    if (Math.abs(player.x - plate.x) < 0.3 && Math.abs(player.y - plate.y) < 1.3) {
        return nudge(sim, plate.x, plate.y);
    }
    const between = (at: number, p: number) => p + 1 + 2 * Math.round((at - p - 1) / 2);
    const cx = between(player.x, plate.x);
    const cy = player.y < plate.y ? plate.y - 1 : plate.y + 1;
    if (Math.hypot(plate.x - player.x, plate.y - player.y) > 9) {
        // Off the board: round walls to beside it
        return walkTo(sim, plate.x, cy);
    }
    if (Math.abs(player.y - cy) < 0.2) {
        return nudge(sim, plate.x, cy);
    }
    if (Math.abs(player.x - cx) < 0.2) {
        return nudge(sim, cx, cy);
    }
    return nudge(sim, cx, player.y);
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
            return stepOn(sim, boards.matching.south[j]);
        }
        const i = m.north.findIndex((s) => !m.matched[s]);
        return i === -1 ? { x: 0, y: 0 } : stepOn(sim, boards.matching.north[i]);
    }
    // Sequence: its plates in order, once it's been shown
    if (!solved("sequence")) {
        const seq = scab.sequence;
        const shown = seq.showFrom + seq.order.length * Math.round(0.85 * 50);
        const index = seq.order[seq.step];
        const plate = boards.sequence[index];
        if (sim.tick < shown + 5) {
            return stepOn(sim, { x: plate.x + 1, y: plate.y + 1 });
        }
        return on === `sequence:${index}` ? stepOff(sim, plate) : stepOn(sim, plate);
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
        return on === `lights:${next.i}` ? stepOff(sim, next.plate) : stepOn(sim, next.plate);
    }
    // Addition: plates that make up exactly what's left
    const add = scab.addition;
    const pick = additionPick(add.values, add.stepped, add.target - add.sum);
    return pick.length === 0 ? { x: 0, y: 0 } : stepOn(sim, boards.addition[pick[0]]);
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

// Crondis: fill up at a waterfall that's running, carry it to the palm, again till it's grown;
// out of a spear's way while it thrusts
function crondisMove(sim: Sim, def: PathRoom): Point {
    const crondis = sim.tombsRoom!.crondis!;
    const places = def.crondis!;
    const hero = sim["hero"].index;
    const player = sim.player;
    const dodge = spearDodge(sim, def);
    if (dodge) {
        return dodge;
    }
    if (crondis.water[hero] >= 100) {
        return walkTo(sim, places.palm.x, places.palm.y);
    }
    // The fall that'll be running soonest by the time it's reached
    const speed = 0.12;
    let best: { at: Point; cost: number } | undefined;
    places.falls.forEach((fall, k) => {
        const away = Math.hypot(fall.fill.x - player.x, fall.fill.y - player.y);
        const wait = Math.max(0, crondis.dryUntil[k] - sim.tick) * speed;
        const cost = Math.max(away, wait);
        if (!best || cost < best.cost) {
            best = { at: fall.fill, cost };
        }
    });
    const at = best!.at;
    return Math.hypot(at.x - player.x, at.y - player.y) < 1.2
        ? nudge(sim, at.x, at.y)
        : walkTo(sim, at.x, at.y);
}

// A spear thrusting (or about to) where the bot stands: along its lane out of the box
function spearDodge(sim: Sim, def: PathRoom): Point | undefined {
    const crondis = sim.tombsRoom!.crondis!;
    const places = def.crondis!;
    const player = sim.player;
    for (const thrust of crondis.thrusts) {
        if (sim.tick - thrust.startTick > 50) {
            continue;
        }
        const area = sim.crondisSpearArea(places, thrust);
        const inside =
            player.x >= area.x0 - 0.4 &&
            player.x <= area.x1 + 0.4 &&
            player.y >= area.y0 - 0.4 &&
            player.y <= area.y1 + 0.4;
        if (inside) {
            const lane = places.lanes[thrust.lane];
            const up = player.y >= (area.y0 + area.y1) / 2;
            const y = up ? area.y1 + 0.9 : area.y0 - 0.9;
            return walkTo(sim, player.x, Math.max(lane.y0 + 0.5, Math.min(lane.y1 + 0.5, y)));
        }
    }
    return undefined;
}

function bossMove(sim: Sim, def: PathBoss, uid: number): Point | undefined {
    // Not up yet: north past the line, where it rises
    if (uid === -1) {
        return walkTo(sim, def.at.x, def.line.y + 4);
    }
    return undefined;
}

function wardensMove(sim: Sim): Point | undefined {
    void sim;
    return undefined;
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
