import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { CELL, CELL_EMPTY, CELL_ROOTED, CELL_SPROUT, RootRule } from "../core/rules/RootRule";
import { GameAssets } from "./GameAssets";

// The Stranglewood's roots (MapDef.rule roots, core/rules/RootRule.ts), drawn by the game over
// whatever ground the map has, cell by cell, with the wood's own scenery: a cell about to take
// root shows a few small tendrils pushing up (the warning; nothing's painted on the ground), then
// its roots rise up out of the ground and settle. A cut cell's roots snap down into the ground with
// a puff of leaves. Roots near a root heart breathe while it lives. A player on roots has a tendril
// round their legs. All of it's worked out from the rule's arrays and the clock, so there's nothing
// to keep; and only the cells round the camera are drawn, each cell two models at most.

// Cells this far from the camera's player are drawn (tiles): the play camera's view on a desktop,
// a little north of the player more than south
const VIEW_X = 17;
const VIEW_SOUTH = 11;
const VIEW_NORTH = 15;
// A rooted cell's model, this big (a tile's decoration spread over the cell), lifted this far off
// the ground so it doesn't fight it, turned by the cell
const ROOT_SCALE = 2.1;
// A cell's second tangle: this much smaller, this far off its middle towards a corner
const SECOND_SCALE = 0.7;
const SECOND_OFFSET = 0.45;
const ROOT_LIFT = 0.025;
// Taking root: up out of the ground from this far down, over this long, overshooting a little
const RISE_SECONDS = 0.45;
const RISE_DEPTH = 0.55;
const RISE_OVERSHOOT = 0.06;
// A sprouting cell's tendrils: this many, this big at the end of the warning, from this small
const SPROUTS = 3;
const SPROUT_SCALE = 0.95;
const SPROUT_FROM = 0.25;
// Cut: snapped down into the ground over this long, the puff this big
const CUT_SECONDS = 0.3;
const CUT_DEPTH = 0.6;
const PUFF_SCALE = 0.9;
// Near a heart: breathing this much bigger and this much redder, this many times a second
const PULSE = 0.08;
const PULSE_RATE = 1.1;
const PULSE_TINT = 0xffb0a8;
// Round a player's legs: this big
const WRAP_SCALE = 0.75;

export class RootsView {
    constructor(private readonly assets: GameAssets) {}

    submitActors(actors: ActorRenderer, sim: Sim, focusX: number, focusY: number): void {
        const rule = sim.rule;
        if (!(rule instanceof RootRule)) {
            return;
        }
        const look = rule.def.look;
        const roots = look.roots.map((id) => this.assets.get("loc:" + id));
        const sprouts = look.sprouts.map((id) => this.assets.get("loc:" + id));
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
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const i = cx + cy * rule.cellsX;
                const state = rule.state[i];
                const cut = rule.cutAt[i];
                if (state === CELL_EMPTY && (cut < 0 || tick - cut > cutTicks + 40)) {
                    continue;
                }
                // The same look for a cell every time
                const hash = Math.imul(i + 1, 2654435761) >>> 0;
                const x = rule.baseX + cx * CELL + CELL / 2;
                const y = rule.baseY + cy * CELL + CELL / 2;
                const ground = sim.grid.getHeight(x, y) / 128 - ROOT_LIFT;
                const yaw = hash & 2047;
                const model = roots[hash % roots.length];
                const since = tick - rule.changedAt[i];
                if (state === CELL_ROOTED && model) {
                    let lift = 0;
                    if (since < riseTicks) {
                        const t = since / riseTicks;
                        // Up out of the ground, a touch past, and back
                        lift = (1 - t) * RISE_DEPTH - Math.sin(t * Math.PI) * RISE_OVERSHOOT;
                    }
                    let scale = ROOT_SCALE;
                    let tint: number | undefined;
                    if (hearts.length > 0) {
                        const near = hearts.some((h) => Math.hypot(h.x - x, h.y - y) <= reach);
                        if (near) {
                            const beat =
                                0.5 +
                                0.5 *
                                    Math.sin(
                                        (tick / TICKS_PER_SECOND) * PULSE_RATE * Math.PI * 2 -
                                            (x + y) * 0.15,
                                    );
                            scale *= 1 + PULSE * beat;
                            tint = beat > 0.5 ? PULSE_TINT : undefined;
                        }
                    }
                    // Two tangles a cell, the second smaller, turned across the first and
                    // towards a corner, so the cell's covered, as it hurts, and no two look alike
                    const options = {
                        scale: scale * (0.9 + ((hash >>> 11) & 7) / 28),
                        ...(tint !== undefined && { tint }),
                    };
                    actors.draw(model, model.anims[0], 0, x, ground + lift, y, yaw, options);
                    const second = roots[(hash >>> 7) % roots.length];
                    if (second) {
                        const cx2 = x + ((hash >>> 14) & 1 ? SECOND_OFFSET : -SECOND_OFFSET);
                        const cy2 = y + ((hash >>> 15) & 1 ? SECOND_OFFSET : -SECOND_OFFSET);
                        actors.draw(
                            second,
                            second.anims[0],
                            0,
                            cx2,
                            ground + lift,
                            cy2,
                            (yaw + 512 + ((hash >>> 16) & 255)) & 2047,
                            { ...options, scale: options.scale * SECOND_SCALE },
                        );
                    }
                } else if (state === CELL_SPROUT) {
                    // A few tendrils pushing up through the ground, growing through the warning
                    const t = Math.min(1, since / sproutTicks);
                    for (let k = 0; k < SPROUTS; k++) {
                        const sprout = sprouts[(hash >>> (k * 3)) % sprouts.length];
                        if (!sprout) {
                            continue;
                        }
                        const ox = (((hash >>> (k * 5)) & 15) / 15 - 0.5) * CELL * 0.7;
                        const oy = (((hash >>> (k * 5 + 4)) & 15) / 15 - 0.5) * CELL * 0.7;
                        const grow = SPROUT_FROM + (1 - SPROUT_FROM) * t;
                        actors.draw(
                            sprout,
                            sprout.anims[0],
                            0,
                            x + ox,
                            ground + (1 - t) * 0.2,
                            y + oy,
                            (yaw + k * 683) & 2047,
                            { scale: SPROUT_SCALE * grow },
                        );
                    }
                } else if (state === CELL_EMPTY && cut >= 0) {
                    const t = (tick - cut) / cutTicks;
                    if (t < 1 && model) {
                        // Snapped back down into the ground
                        actors.draw(
                            model,
                            model.anims[0],
                            0,
                            x,
                            ground + t * t * CUT_DEPTH,
                            y,
                            yaw,
                            {
                                scale: ROOT_SCALE * (1 - 0.3 * t),
                            },
                        );
                    }
                    if (puff && (hash & 1) === 0) {
                        const anim = puff.anims[0];
                        if (tick - cut < anim.totalTicks) {
                            actors.draw(
                                puff,
                                anim,
                                anim.getFrame(tick - cut, false),
                                x,
                                ground,
                                y,
                                yaw,
                                {
                                    scale: PUFF_SCALE,
                                },
                            );
                        }
                    }
                }
            }
        }
        // The roots round a player's legs
        const wrap = this.assets.get("loc:" + look.wrap);
        if (wrap) {
            for (const hero of sim.heroes) {
                const player = hero.player;
                if (hero.left || hero.down || !rule.isRooted(player.x, player.y)) {
                    continue;
                }
                const ground = sim.grid.getHeight(player.x, player.y) / 128 - ROOT_LIFT;
                actors.draw(wrap, wrap.anims[0], 0, player.x, ground, player.y, (tick * 3) & 2047, {
                    scale: WRAP_SCALE,
                });
            }
        }
    }
}
