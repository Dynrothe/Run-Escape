import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import { isCoarsePointer } from "../../util/DeviceUtil";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { CinematicPlayer, getActorState, getSaying } from "./Cinematic";
import { GameAssets, getPropKey } from "./GameAssets";
import { Overlay, ScreenPoint } from "./Overlay";

// A cinematic's bars, top and bottom, as a share of the screen's height, and the seconds they
// take to come in at the start and go at the end
const BAR_SHARE = 0.085;
const BAR_SECONDS = 0.5;
// A spot animation playing in a cinematic, where it is, for its light (SceneLights)
export type CinematicSpot = { x: number; y: number; spotAnim: number };

// The skip hint fades in after this long and is gone this long before the end
const HINT_FROM = 0.6;
const HINT_UNTIL = 1.5;

// Draws a cinematic (MapDef.cinematic, LairDef.opening) as it plays: its cast, their spot
// animations and overhead chat, and the bars across the screen. client/Cinematic.ts says what's
// happening.
export class CinematicView {
    private readonly screen: ScreenPoint = { x: 0, y: 0, visible: false };

    constructor(readonly assets: GameAssets) {}

    // Whether the map's prop at index is stood in for by one of the cast, until they're gone
    hidesProp(player: CinematicPlayer, index: number): boolean {
        return player.def.cast.some(
            (actor) =>
                actor.prop === index && !getActorState(player.def, actor, player.seconds).gone,
        );
    }

    // The spot animations playing now, each on whoever it's on
    getSpots(player: CinematicPlayer): CinematicSpot[] {
        const spots: CinematicSpot[] = [];
        for (const cue of player.def.cues) {
            const model =
                cue.spotAnim === undefined ? undefined : this.assets.get("spot:" + cue.spotAnim);
            const actor = player.def.cast.find((a) => a.id === cue.actor);
            const ticks = (player.seconds - cue.at) * TICKS_PER_SECOND;
            if (model && actor && ticks >= 0 && ticks < model.anims[0].totalTicks) {
                spots.push({ x: actor.x, y: actor.y, spotAnim: cue.spotAnim! });
            }
        }
        return spots;
    }

    submitActors(actors: ActorRenderer, sim: Sim, player: CinematicPlayer): void {
        const { def, seconds } = player;
        for (const actor of def.cast) {
            const state = getActorState(def, actor, seconds);
            const model = this.assets.get(getPropKey(actor.npcId));
            if (state.gone || !model) {
                continue;
            }
            const anim = model.getAnim(state.seq);
            const ticks = (seconds - state.start) * TICKS_PER_SECOND;
            const ground = sim.grid.getHeight(actor.x, actor.y) / 128;
            actors.draw(
                model,
                anim,
                anim.getFrame(ticks, state.loop),
                actor.x,
                ground,
                actor.y,
                actor.yaw ?? 0,
                { scale: actor.scale ?? 1 },
            );
        }
        // Spot animations, each played out once on whoever it's on
        for (const cue of def.cues) {
            if (cue.spotAnim === undefined || cue.at > seconds) {
                continue;
            }
            const actor = def.cast.find((a) => a.id === cue.actor);
            const model = this.assets.get("spot:" + cue.spotAnim);
            if (!actor || !model) {
                continue;
            }
            const anim = model.anims[0];
            const ticks = (seconds - cue.at) * TICKS_PER_SECOND;
            if (ticks >= anim.totalTicks) {
                continue;
            }
            const ground = sim.grid.getHeight(actor.x, actor.y) / 128 - (cue.lift ?? 0);
            actors.draw(
                model,
                anim,
                anim.getFrame(ticks, false),
                actor.x,
                ground,
                actor.y,
                actor.yaw ?? 0,
                { scale: cue.scale ?? 1, unlit: 1 },
            );
        }
    }

    drawScreen(overlay: Overlay, sim: Sim, player: CinematicPlayer): void {
        const { def, seconds } = player;
        const ctx = overlay.ctx;
        const scale = overlay.uiScale;
        // Overhead chat: yellow over the speaker's head, as GameView's shouts
        const pixel = Math.max(1, Math.round(scale));
        ctx.font = `${16 * pixel}px "OSRS Bold", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        for (const actor of def.cast) {
            const text = getSaying(def, actor.id, seconds);
            const model = this.assets.get(getPropKey(actor.npcId));
            if (text === undefined || getActorState(def, actor, seconds).gone) {
                continue;
            }
            const height = actor.head ?? ((model?.height ?? 200) * (actor.scale ?? 1)) / 128;
            const top = sim.grid.getHeight(actor.x, actor.y) / 128 - height;
            const p = overlay.project(actor.x, top, actor.y, this.screen);
            if (!p.visible) {
                continue;
            }
            // Kept on the screen, however close the camera is
            const half = ctx.measureText(text).width / 2 + 4 * pixel;
            const x = Math.min(Math.max(p.x, half), overlay.width - half);
            const y = Math.max(p.y - 4 * pixel, overlay.height * BAR_SHARE + 20 * pixel);
            ctx.fillStyle = "#000000";
            ctx.fillText(text, x + pixel, y + pixel);
            ctx.fillStyle = "#ffff00";
            ctx.fillText(text, x, y);
        }

        // The bars, in at the start and out as the camera comes down behind the player
        const left = def.seconds - seconds;
        const bars = Math.min(1, seconds / BAR_SECONDS, left / BAR_SECONDS);
        const bar = Math.round(overlay.height * BAR_SHARE * Math.max(0, bars));
        if (bar > 0) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, overlay.width, bar);
            ctx.fillRect(0, overlay.height - bar, overlay.width, bar);
        }
        // How to skip, faint, in the bottom bar
        const hint = Math.min(1, (seconds - HINT_FROM) / 0.5, (left - HINT_UNTIL) / 0.5);
        if (hint > 0 && bar > 12 * pixel) {
            ctx.font = `${12 * pixel}px "OSRS Small", sans-serif`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillStyle = `rgba(200, 190, 170, ${0.6 * hint})`;
            ctx.fillText(
                isCoarsePointer ? "Tap to skip" : "Press any key to skip",
                overlay.width - 12 * pixel,
                overlay.height - bar / 2,
            );
        }
    }
}
