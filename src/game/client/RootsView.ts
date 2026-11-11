import { ActorModel, ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import { yawFromVector } from "../core/PlayerMovement";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { CELL, CELL_EMPTY, CELL_ROOTED, CELL_SPROUT, RootRule } from "../core/rules/RootRule";
import { GameAssets, getRootLookKey } from "./GameAssets";

// The Stranglewood's roots (MapDef.rule roots, core/rules/RootRule.ts), drawn by the game over
// whatever ground the map has with the wood's own Tendrils, nothing painted on it. Each rooted
// cell has a point near its middle, and a runner laid along the ground to it from the point of the
// neighbour it grew from (the oldest rooted one beside it), so the cells' runners join up into
// roots spreading out of the wood; some cells have a loop standing up out of the ground as well.
// A cell about to take root (the warning) has its runner creeping in towards it from where it
// grows from, and tips pushing up through the ground; as it takes root the runner reaches it and
// the loop heaves up. A cut cell's runner snaps in two, the pieces kicked up and sinking back into
// the ground with a puff of dust. Roots near a root heart breathe while it lives. A player on roots
// has tendrils round their legs. All of it's worked out from the rule's arrays and the clock, so
// there's nothing to keep; and only the cells round the camera are drawn, two models a cell at most.

// Cells this far from the camera's player are drawn (tiles): the play camera's view on a desktop,
// a little north of the player more than south
const VIEW_X = 17;
const VIEW_SOUTH = 11;
const VIEW_NORTH = 15;
// A cell's in view if this far round the line its runner lies along is (tiles): its loop and
// what stands up off the ground
const CULL_REACH = 1.2;
// A cell's point is this far off its middle at most, either way (tiles)
const NODE_JITTER = 0.35;
// A runner: tipped over this far (RS angle units, 512 lying flat), give or take the spread, so it
// lies along the ground arching a little; its foot this far under it; scaled to reach this share
// of the way, within these
const RUN_PITCH = 462;
const RUN_PITCH_SPREAD = 40;
const RUN_SINK = 0.05;
const RUN_REACH = 1.1;
const RUN_SCALE_MIN = 0.95;
const RUN_SCALE_MAX = 1.7;
// One with no older neighbour grows in from the wood beside it, this far (tiles), or from its own
// cell's edge
const RUN_FROM_WOOD = CELL;
const RUN_FROM_EDGE = CELL / 2;
// Loops: on this share of the cells, this big, tipped this far at most, with this much of
// themselves under the ground (a root arching up out of it)
const LOOP_SHARE = 0.3;
const LOOP_SCALE = 0.55;
const LOOP_SCALE_SPREAD = 0.3;
const LOOP_PITCH = 140;
const LOOP_SINK = 0.35;
// The warning: the runner creeps this share of the way in, and a tip pushes up, this big
const CREEP = 0.6;
const TIPS = 1;
const TIP_SCALE = 0.35;
// Taking root: the runner reaches the rest of the way and the loop heaves up out of the ground from
// this far down, over this long, overshooting a little
const RISE_SECONDS = 0.5;
const RISE_DEPTH = 0.9;
const RISE_OVERSHOOT = 0.08;
// Cut: the runner snaps in two, each piece this big, kicked up this high and turned this far
// apart as they sink this far into the ground, over this long; the puff this big
const CUT_SECONDS = 0.45;
const PIECE_SCALE = 0.6;
const PIECE_KICK = 0.3;
const PIECE_TURN = 220;
const PIECE_TIP = 200;
const CUT_DEPTH = 0.7;
const PUFF_SCALE = 0.9;
// A puff on one cut cell in this many, a big cut's dust enough without one on each
const PUFF_EVERY = 3;
// Cells this near the camera's player have loops (tiles), sunk away over this much further
const NEAR = 8;
const NEAR_FADE = 2;
// Near a heart: breathing this much bigger and this much redder, this many times a second
const PULSE = 0.08;
const PULSE_RATE = 1.1;
const PULSE_TINT = 0xffb0a8;
// Round a player's legs: tendrils this big, this far off their middle
const WRAP_SCALE = 0.42;
const WRAP_OFFSET = 0.22;

const NEIGHBOURS_8: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];

// Where a cell's runner runs from (fromX, fromY) to (x, y), and what it's drawn with
type Runner = {
    fromX: number;
    fromY: number;
    x: number;
    y: number;
    yaw: number;
    scale: number;
    pitch: number;
};

export class RootsView {
    constructor(private readonly assets: GameAssets) {}

    submitActors(actors: ActorRenderer, sim: Sim, focusX: number, focusY: number): void {
        // The map's or a remix's; the realm has none (RuleSet)
        const rule = sim.roots;
        if (!rule || sim.realm?.layer === 1) {
            return;
        }
        const look = rule.def.look;
        const runners = look.runners.map((id) => this.assets.get(getRootLookKey(id, look)));
        const loops = look.loops.map((id) => this.assets.get(getRootLookKey(id, look)));
        const puff = this.assets.get("spot:" + look.cutSpotAnim);
        const tick = sim.tick;
        const riseTicks = RISE_SECONDS * TICKS_PER_SECOND;
        const cutTicks = CUT_SECONDS * TICKS_PER_SECOND;
        const sproutTicks = Math.max(1, rule.def.sprout * TICKS_PER_SECOND);
        const hearts = rule.hearts;
        const reach = rule.def.hearts.reach;
        const cx0 = Math.max(0, Math.floor((focusX - VIEW_X - rule.baseX) / CELL));
        const cx1 = Math.min(rule.cellsX - 1, Math.floor((focusX + VIEW_X - rule.baseX) / CELL));
        const cy0 = Math.max(0, Math.floor((focusY - VIEW_SOUTH - rule.baseY) / CELL));
        const cy1 = Math.min(
            rule.cellsY - 1,
            Math.floor((focusY + VIEW_NORTH - rule.baseY) / CELL),
        );
        const ground = (x: number, y: number) => sim.grid.getHeight(x, y) / 128;
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const i = cx + cy * rule.cellsX;
                const state = rule.state[i];
                const cut = rule.cutAt[i];
                if (state === CELL_EMPTY && (cut < 0 || tick - cut > cutTicks + 40)) {
                    continue;
                }
                // The same look for a cell every time
                const hash = cellHash(i);
                // Loops only round the player, sinking away into the ground further out: a
                // phone's view at full cover is over a hundred cells
                const cellX = rule.baseX + cx * CELL + CELL / 2;
                const cellY = rule.baseY + cy * CELL + CELL / 2;
                const away = Math.hypot(cellX - focusX, cellY - focusY) - NEAR;
                const sunk = Math.min(1, Math.max(0, away / NEAR_FADE));
                const model = runners[hash % runners.length];
                const loop = loops[(hash >>> 9) % loops.length];
                if (!model || !loop) {
                    continue;
                }
                const since = tick - rule.changedAt[i];
                const runner = this.runnerOf(rule, i, cx, cy, hash, model);
                // Culled as the line it lies along, not as the model's reach all round its foot,
                // which would draw a ring of cells round the view for nothing
                const midX = (runner.x + runner.fromX) / 2;
                const midY = (runner.y + runner.fromY) / 2;
                const half = Math.hypot(runner.x - runner.fromX, runner.y - runner.fromY) / 2;
                if (!actors.inView(midX, ground(midX, midY), midY, half + CULL_REACH)) {
                    continue;
                }
                const runnerYaw = runner.yaw;
                const hasLoop = sunk < 1 && ((hash >>> 20) & 1023) / 1024 < LOOP_SHARE;
                const loopX = runner.x + ((hash >>> 12) & 1 ? 0.3 : -0.3);
                const loopY = runner.y + ((hash >>> 13) & 1 ? 0.3 : -0.3);
                const loopScale = LOOP_SCALE + (((hash >>> 24) & 15) / 15) * LOOP_SCALE_SPREAD;
                const loopYaw = (hash >>> 3) & 2047;
                const loopPitch = (((hash >>> 14) & 63) / 63) * LOOP_PITCH;
                const loopSink =
                    ((loop.height * loopScale) / 128) * (LOOP_SINK + (1 - LOOP_SINK) * sunk);
                if (state === CELL_ROOTED) {
                    // Reaching the rest of the way in, a touch past and back; the loop heaving up
                    let grow = 1;
                    let lift = 0;
                    if (since < riseTicks) {
                        const t = since / riseTicks;
                        grow = CREEP + (1 - CREEP) * t + Math.sin(t * Math.PI) * RISE_OVERSHOOT;
                        lift =
                            (1 - t) * (1 - t) * RISE_DEPTH - Math.sin(t * Math.PI) * RISE_OVERSHOOT;
                    }
                    let pulse = 1;
                    let tint: number | undefined;
                    if (hearts.length > 0) {
                        const near = hearts.some(
                            (h) => Math.hypot(h.x - runner.x, h.y - runner.y) <= reach,
                        );
                        if (near) {
                            const beat =
                                0.5 +
                                0.5 *
                                    Math.sin(
                                        (tick / TICKS_PER_SECOND) * PULSE_RATE * Math.PI * 2 -
                                            (runner.x + runner.y) * 0.15,
                                    );
                            pulse = 1 + PULSE * beat;
                            tint = beat > 0.5 ? PULSE_TINT : undefined;
                        }
                    }
                    actors.draw(
                        model,
                        model.anims[0],
                        0,
                        runner.fromX,
                        ground(runner.fromX, runner.fromY) + RUN_SINK,
                        runner.fromY,
                        runnerYaw,
                        {
                            scale: runner.scale * grow * pulse,
                            pitch: runner.pitch,
                            ...(tint !== undefined && { tint }),
                        },
                    );
                    if (hasLoop) {
                        actors.draw(
                            loop,
                            loop.anims[0],
                            0,
                            loopX,
                            ground(loopX, loopY) + loopSink + lift,
                            loopY,
                            loopYaw,
                            {
                                scale: loopScale * pulse,
                                pitch: loopPitch,
                                ...(tint !== undefined && { tint }),
                            },
                        );
                    }
                } else if (state === CELL_SPROUT) {
                    // The warning: the runner creeping in from where it grows from, and tips
                    // pushing up through the ground where it's going
                    const t = Math.min(1, since / sproutTicks);
                    const ease = 1 - (1 - t) * (1 - t);
                    actors.draw(
                        model,
                        model.anims[0],
                        0,
                        runner.fromX,
                        ground(runner.fromX, runner.fromY) + RUN_SINK,
                        runner.fromY,
                        runnerYaw,
                        { scale: runner.scale * CREEP * Math.max(0.05, ease), pitch: runner.pitch },
                    );
                    for (let k = 0; k < TIPS; k++) {
                        const ox = (((hash >>> (k * 5)) & 15) / 15 - 0.5) * CELL * 0.6;
                        const oy = (((hash >>> (k * 5 + 4)) & 15) / 15 - 0.5) * CELL * 0.6;
                        const tipHeight = (loop.height * TIP_SCALE) / 128;
                        const x = runner.x + ox;
                        const y = runner.y + oy;
                        actors.draw(
                            loop,
                            loop.anims[0],
                            0,
                            x,
                            ground(x, y) + tipHeight * (1 - 0.7 * ease),
                            y,
                            (loopYaw + k * 683) & 2047,
                            { scale: TIP_SCALE },
                        );
                    }
                } else if (cut >= 0) {
                    const t = (tick - cut) / cutTicks;
                    if (t < 1) {
                        // Snapped in two, the pieces kicked up and apart, tipping as they sink
                        const sink = t * t * CUT_DEPTH - Math.sin(t * Math.PI) * PIECE_KICK;
                        const dx = runner.x - runner.fromX;
                        const dy = runner.y - runner.fromY;
                        for (let k = 0; k < 2; k++) {
                            const along = k === 0 ? 0.15 : 0.6;
                            const x = runner.fromX + dx * along;
                            const y = runner.fromY + dy * along;
                            const turn = Math.round(PIECE_TURN * t) * (k === 0 ? -1 : 1);
                            actors.draw(
                                model,
                                model.anims[0],
                                0,
                                x,
                                ground(x, y) + RUN_SINK + sink,
                                y,
                                (runnerYaw + turn) & 2047,
                                {
                                    scale: runner.scale * PIECE_SCALE * (1 - 0.3 * t),
                                    pitch: runner.pitch + Math.round(PIECE_TIP * t),
                                },
                            );
                        }
                        if (hasLoop) {
                            actors.draw(
                                loop,
                                loop.anims[0],
                                0,
                                loopX,
                                ground(loopX, loopY) + loopSink + t * t * CUT_DEPTH,
                                loopY,
                                loopYaw,
                                { scale: loopScale * (1 - 0.3 * t), pitch: loopPitch },
                            );
                        }
                    }
                    if (puff && hash % PUFF_EVERY === 0) {
                        const anim = puff.anims[0];
                        if (tick - cut < anim.totalTicks) {
                            actors.draw(
                                puff,
                                anim,
                                anim.getFrame(tick - cut, false),
                                runner.x,
                                ground(runner.x, runner.y),
                                runner.y,
                                loopYaw,
                                { scale: PUFF_SCALE },
                            );
                        }
                    }
                }
            }
        }
        // Tendrils round a player's legs, turning slowly
        const wrap = loops[0];
        if (wrap) {
            const wrapSink = ((wrap.height * WRAP_SCALE) / 128) * 0.3;
            for (const hero of sim.heroes) {
                const player = hero.player;
                if (hero.left || hero.down || !rule.isRooted(player.x, player.y)) {
                    continue;
                }
                for (let k = 0; k < 2; k++) {
                    const yaw = (tick * 3 + k * 1024) & 2047;
                    const angle = (yaw / 2048) * Math.PI * 2;
                    const x = player.x + Math.sin(angle) * WRAP_OFFSET;
                    const y = player.y + Math.cos(angle) * WRAP_OFFSET;
                    actors.draw(wrap, wrap.anims[0], 0, x, ground(x, y) + wrapSink, y, yaw, {
                        scale: WRAP_SCALE,
                    });
                }
            }
        }
    }

    // A cell's point, and the runner to it from the point of the neighbour it grew from: the oldest
    // rooted one beside it that's older than it (so no two cells run to each other), or for one
    // without, from the wood beside it (blocked ground) or a way of its own
    private runnerOf(
        rule: RootRule,
        i: number,
        cx: number,
        cy: number,
        hash: number,
        model: ActorModel,
    ): Runner {
        const [x, y] = nodeOf(rule, i, cx, cy, hash);
        const own = rule.state[i] === CELL_EMPTY ? rule.cutAt[i] : rule.changedAt[i];
        let parent = -1;
        let parentAt = Infinity;
        let wood = -1;
        for (const [dx, dy] of NEIGHBOURS_8) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= rule.cellsX || ny >= rule.cellsY) {
                continue;
            }
            const j = nx + ny * rule.cellsX;
            if (rule.state[j] === CELL_ROOTED) {
                const at = rule.changedAt[j];
                // Cells that took root at once (a patch planted) are ordered by their hashes, not
                // their places, so their runners don't all point the same way
                const older = at < own || (at === own && cellHash(j) < hash);
                if (
                    older &&
                    (at < parentAt || (at === parentAt && cellHash(j) < cellHash(parent)))
                ) {
                    parent = j;
                    parentAt = at;
                }
            } else if (wood < 0 && !rule.open[j] && (dx === 0 || dy === 0)) {
                // Not open for being in the safe circle isn't the wood
                const middle = rule.cellMiddle(j);
                if (rule.grid.isSolid(Math.floor(middle.x), Math.floor(middle.y))) {
                    wood = j;
                }
            }
        }
        let fromX: number;
        let fromY: number;
        if (parent >= 0) {
            const px = parent % rule.cellsX;
            [fromX, fromY] = nodeOf(
                rule,
                parent,
                px,
                (parent - px) / rule.cellsX,
                cellHash(parent),
            );
        } else {
            let angle = (((hash >>> 5) & 1023) / 1024) * Math.PI * 2;
            let from = RUN_FROM_EDGE;
            if (wood >= 0) {
                const wx = wood % rule.cellsX;
                angle = Math.atan2(wx - cx, (wood - wx) / rule.cellsX - cy);
                from = RUN_FROM_WOOD;
            }
            fromX = x + Math.sin(angle) * from;
            fromY = y + Math.cos(angle) * from;
        }
        const pitch = RUN_PITCH + (((hash >>> 16) & 15) / 15 - 0.5) * RUN_PITCH_SPREAD;
        const length = Math.hypot(x - fromX, y - fromY);
        const flat = Math.sin((pitch / 2048) * Math.PI * 2);
        const scale = Math.min(
            RUN_SCALE_MAX,
            Math.max(RUN_SCALE_MIN, (length * RUN_REACH * 128) / Math.max(1, model.height * flat)),
        );
        return {
            fromX,
            fromY,
            x,
            y,
            yaw: yawFromVector(x - fromX, y - fromY),
            scale,
            pitch: Math.round(pitch),
        };
    }
}

function cellHash(i: number): number {
    return Math.imul(i + 1, 2654435761) >>> 0;
}

// A cell's point: near its middle, the same every time
function nodeOf(rule: RootRule, i: number, cx: number, cy: number, hash: number): [number, number] {
    const jx = ((Math.imul(hash, 7) >>> 4) & 255) / 255 - 0.5;
    const jy = ((Math.imul(hash, 13) >>> 12) & 255) / 255 - 0.5;
    return [
        rule.baseX + cx * CELL + CELL / 2 + jx * 2 * NODE_JITTER,
        rule.baseY + cy * CELL + CELL / 2 + jy * 2 * NODE_JITTER,
    ];
}
