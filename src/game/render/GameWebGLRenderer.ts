import { vec4 } from "gl-matrix";
import PicoGL, { Program, Texture } from "picogl";

import { Camera } from "../../mapviewer/Camera";
import { MapViewer } from "../../mapviewer/MapViewer";
import { Interactions } from "../../mapviewer/webgl/Interactions";
import { WebGLMapViewerRenderer } from "../../mapviewer/webgl/WebGLMapViewerRenderer";
import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import actorSilhouetteFragShader from "../../mapviewer/webgl/actor/actor-silhouette.frag.glsl";
import actorVertShader from "../../mapviewer/webgl/actor/actor.vert.glsl";
import { prependDefines } from "../../mapviewer/webgl/shaders/ShaderUtil";
import {
    createMainProgram,
    createNpcProgram,
    createProgram,
} from "../../mapviewer/webgl/shaders/Shaders";
import mainFragShader from "../../mapviewer/webgl/shaders/main.frag.glsl";
import { LIGHT_MAP_SIZE, LIGHT_MAP_TILES, LightMap } from "./LightMap";

// The programs a map's drawn with: every map's, or a lit map's with its lights (setLighting)
type ProgramSet = { main: Program; mainAlpha: Program; npc: Program; actor: Program };

// What the renderer calls into each frame, in this order.
export interface GameFrameHandler {
    // Before the camera matrices are built: advance the game and place the camera.
    update(deltaTimeMs: number, camera: Camera): void;
    // After the camera matrices are built: submit this frame's actors.
    submitActors(actors: ActorRenderer, camera: Camera): void;
    // Draw 2D overlays (health bars, hitsplats) with this frame's camera.
    drawOverlay(camera: Camera): void;
}

// A square is 64 tiles a side and the camera sees a small part of it, so its
// draws are cut up and culled by this many tiles. Without multi draw each one is
// a real draw call, so they stay fewer and bigger.
const CULL_CELL_SIZE = 8;
const CULL_CELL_SIZE_NO_MULTI_DRAW = 32;

// Tiles past the play area over which the world fades into the sky
// (PLAY_AREA_FADE in fog.glsl)
const PLAY_AREA_FADE = 6;
// Map squares keep this much more of the world than they need, to be safe
const KEEP_MARGIN = 2;

// How far past the play area the camera can get (tiles): behind the player,
// which is south (a run's camera faces north), and any way round (the title
// screen's spins)
export type CameraReach = {
    behind: number;
    around: number;
};

// The map viewer's WebGL renderer with the viewer's own controls, hover menus
// and map square NPCs taken out, and the game's actors drawn in the NPC passes.
export class GameWebGLRenderer extends WebGLMapViewerRenderer {
    game?: GameFrameHandler;

    // Dev: to compare frames with another cell size, or none (0)
    cullCellSizeOverride?: number;
    // Dev: off draws every actor, on screen or not
    cullActors = true;

    actorProgram?: Program;
    actorSilhouetteProgram?: Program;
    actorRenderer?: ActorRenderer;

    private readonly nextKeepArea = vec4.create();

    private readonly actorRendererReady: Promise<ActorRenderer>;
    private resolveActorRenderer!: (renderer: ActorRenderer) => void;

    constructor(mapViewer: MapViewer) {
        super(mapViewer);
        // One plane only, the arena's (setPlane): hides roofs and upper
        // floors (bridges still render), and the floors under a dungeon up
        // on a higher plane. scripts/cache/slim-cache.ts loads map squares
        // with the same settings.
        this.minLevel = 0;
        this.maxLevel = 0;
        // The game draws its own NPCs and items
        this.loadNpcs = false;
        this.loadObjs = false;
        // No hover menus, and a minimap of its own (Minimap.ts)
        this.useInteractTarget = false;
        this.skipMinimap = true;
        // The game's camera never sees a square three away, so low detail
        // draws are never used
        mapViewer.lodDistance = Infinity;
        this.actorRendererReady = new Promise((resolve) => {
            this.resolveActorRenderer = resolve;
        });
    }

    // Draws the map's plane, loading the map squares again if it's another
    setPlane(plane: number): void {
        if (this.minLevel !== plane || this.maxLevel !== plane) {
            this.minLevel = plane;
            this.maxLevel = plane;
            this.clearMaps();
        }
    }

    // Where the world fades out (world tiles), and with it how much of the world
    // the map squares keep. A ray from the camera only gets further from the play
    // area once it's past it, so past the fade, and past where the camera can be,
    // nothing's in front of anything but the sky: that's left out of the squares,
    // and a square that's all out there isn't loaded.
    setPlayArea(x0: number, y0: number, x1: number, y1: number, reach: CameraReach): void {
        const playArea = this.playArea;
        playArea[0] = x0;
        playArea[1] = y0;
        playArea[2] = x1;
        playArea[3] = y1;
        const side = Math.ceil(Math.max(PLAY_AREA_FADE, reach.around) + KEEP_MARGIN);
        const behind = Math.max(side, Math.ceil(reach.behind + KEEP_MARGIN));
        const keep = this.nextKeepArea;
        keep[0] = Math.floor(x0) - side;
        keep[1] = Math.floor(y0) - behind;
        keep[2] = Math.ceil(x1) + side;
        keep[3] = Math.ceil(y1) + side;
        this.setKeepArea(keep);
    }

    // 1 is as the game is; lower is darker. The shader's a power, so the sum's upside
    // down.
    setBrightness(amount: number): void {
        this.brightness = 1 / amount;
    }

    // A colour multiplied over the world ("#rrggbb"), or none. In the shader rather than a
    // CSS mix-blend-mode over the canvas, which Safari drew as a flat colour over everything.
    setWash(colour: string | undefined): void {
        const hex = colour ? parseInt(colour.slice(1), 16) : 0xffffff;
        this.wash[0] = ((hex >> 16) & 0xff) / 255;
        this.wash[1] = ((hex >> 8) & 0xff) / 255;
        this.wash[2] = (hex & 0xff) / 255;
    }

    // Whether the map has lights (MapDef.lighting). A map with them draws with programs of its own
    // (LIGHTS in the shaders), made the first time one's wanted, so every other map pays nothing
    // for them; changing over loads the map squares again. Off, every colour's drawn as it always
    // is.
    setLighting(on: boolean): void {
        this.beginLights(0, 0);
        this.endLights();
        this.setAmbient(1, 0xffffff);
        if (on === this.wantsLights) {
            return;
        }
        this.wantsLights = on;
        if (on) {
            this.litPrograms ??= this.createProgramSet(true);
            this.litPrograms.then((programs) => this.useProgramSet(programs, true));
        } else if (this.unlitPrograms) {
            this.useProgramSet(this.unlitPrograms, false);
        }
    }

    // Whether a lit map's programs are wanted, and are what's drawing
    private wantsLights = false;
    private drawsLights = false;
    private unlitPrograms?: ProgramSet;
    private litPrograms?: Promise<ProgramSet>;

    private async createProgramSet(lights: boolean): Promise<ProgramSet> {
        if (lights) {
            this.lightMap ??= this.app.createTexture2D(
                this.lightMapData.bytes,
                LIGHT_MAP_SIZE,
                LIGHT_MAP_SIZE,
                {
                    minFilter: PicoGL.LINEAR,
                    magFilter: PicoGL.LINEAR,
                    wrapS: PicoGL.CLAMP_TO_EDGE,
                    wrapT: PicoGL.CLAMP_TO_EDGE,
                },
            );
        }
        const multiDraw = this.hasMultiDraw;
        const [main, mainAlpha, npc, actor] = await this.app.createPrograms(
            createMainProgram(multiDraw, false, lights),
            createMainProgram(multiDraw, true, lights),
            createNpcProgram(multiDraw, true, lights),
            createProgram(
                actorVertShader,
                prependDefines(mainFragShader, ["ACTOR_EDGE"]),
                multiDraw,
                true,
                lights,
            ),
        );
        return { main, mainAlpha, npc, actor };
    }

    // Draws with these from now on, unless it's been changed back meanwhile
    private useProgramSet(programs: ProgramSet, lights: boolean): void {
        if (lights !== this.wantsLights || lights === this.drawsLights) {
            return;
        }
        this.drawsLights = lights;
        this.mainProgram = programs.main;
        this.mainAlphaProgram = programs.mainAlpha;
        this.npcProgram = programs.npc;
        this.actorProgram = programs.actor;
        this.actorRenderer?.setProgram(programs.actor, lights ? this.lightMap : undefined);
        // Map squares keep the programs they were loaded with
        this.clearMaps();
    }

    // How bright what's out of every light is (0 to 1), and its tint (0xRRGGBB)
    setAmbient(level: number, color: number): void {
        this.ambient[0] = (((color >> 16) & 0xff) / 255) * level;
        this.ambient[1] = (((color >> 8) & 0xff) / 255) * level;
        this.ambient[2] = ((color & 0xff) / 255) * level;
    }

    // This frame's lights, round (x, y) in world tiles (LightMap): each at world tiles, radius in
    // tiles, and colour times strength (0 to 1 a channel at strength 1), then sent to the GPU
    beginLights(x: number, y: number): void {
        this.lightMapData.begin(x, y);
    }

    addLight(
        x: number,
        z: number,
        radius: number,
        r: number,
        g: number,
        b: number,
        shade?: (x: number, z: number) => number,
    ): void {
        this.lightMapData.add(x, z, radius, r, g, b, shade);
    }

    endLights(): void {
        const map = this.lightMapData;
        this.lightMapArea[0] = map.x0;
        this.lightMapArea[1] = map.y0;
        this.lightMapArea[2] = 1 / LIGHT_MAP_TILES;
        if (map.end() && this.lightMap) {
            this.lightMap.data(map.bytes);
        }
    }

    private readonly lightMapData = new LightMap();

    getActorRenderer(): Promise<ActorRenderer> {
        return this.actorRendererReady;
    }

    override async init(): Promise<void> {
        await super.init();
        // The game reads input itself; the viewer's input manager would also move
        // the camera and grab the pointer.
        this.mapViewer.inputManager.cleanUp();
    }

    override async queueLoadMap(mapX: number, mapY: number): Promise<void> {
        // The first squares are asked for before the renderer's up, and what
        // they're baked like depends on whether it has multi draw
        await this.actorRendererReady;
        this.cullCellSize =
            this.cullCellSizeOverride ??
            (this.hasMultiDraw ? CULL_CELL_SIZE : CULL_CELL_SIZE_NO_MULTI_DRAW);
        await super.queueLoadMap(mapX, mapY);
    }

    override async initShaders(): Promise<Program[]> {
        const programs = await super.initShaders();
        const [actorProgram, actorSilhouetteProgram] = await this.app.createPrograms(
            createProgram(
                actorVertShader,
                prependDefines(mainFragShader, ["ACTOR_EDGE"]),
                this.hasMultiDraw,
                true,
            ),
            createProgram(actorVertShader, actorSilhouetteFragShader, this.hasMultiDraw, false),
        );
        this.actorProgram = actorProgram;
        this.actorSilhouetteProgram = actorSilhouetteProgram;
        this.actorRenderer = new ActorRenderer(
            this.app,
            this.hasMultiDraw,
            actorProgram,
            actorSilhouetteProgram,
            this.textureArray!,
            this.textureMaterials!,
            this.sceneUniformBuffer!,
        );
        this.unlitPrograms = {
            main: this.mainProgram!,
            mainAlpha: this.mainAlphaProgram!,
            npc: this.npcProgram!,
            actor: actorProgram,
        };
        // A lit map asked for its programs before these were made: they go in over these
        if (this.wantsLights) {
            this.drawsLights = false;
            this.litPrograms ??= this.createProgramSet(true);
            this.litPrograms.then((lit) => this.useProgramSet(lit, true));
        }
        this.resolveActorRenderer(this.actorRenderer);
        return [...programs, actorProgram, actorSilhouetteProgram];
    }

    // The browser took the WebGL context away (GameApp). Everything made on it is
    // gone, so frames only move the game on (a co-op run carries on for the
    // others) and draw nothing.
    contextLost = false;

    override render(time: number, deltaTime: number, resized: boolean): void {
        if (this.contextLost) {
            this.game?.update(deltaTime, this.mapViewer.camera);
            return;
        }
        super.render(time, deltaTime, resized);
    }

    override handleInput(deltaTime: number): void {
        this.game?.update(deltaTime, this.mapViewer.camera);
    }

    override checkInteractions(_interactions: Interactions): void {}

    override tickPass(time: number, ticksElapsed: number, clientTicksElapsed: number): void {
        // Animated locs (flags, fires, fountains)
        super.tickPass(time, ticksElapsed, clientTicksElapsed);

        const camera = this.mapViewer.camera;
        const actors = this.actorRenderer;
        if (actors) {
            actors.beginFrame(this.cullActors ? camera.frustum : undefined);
            this.game?.submitActors(actors, camera);
            actors.upload();
        }
        this.game?.drawOverlay(camera);
    }

    override updateNpcDataTexture(): number {
        return 0;
    }

    override renderOpaqueNpcPass(_index: number, _texture: Texture | undefined): void {
        const actors = this.actorRenderer;
        if (!actors) {
            return;
        }
        actors.renderOutlines();
        actors.renderEarly();
        actors.renderSilhouettes();
        actors.renderOpaque();
    }

    override renderTransparentNpcPass(_index: number, _texture: Texture | undefined): void {
        this.actorRenderer?.renderAlpha();
    }

    override async cleanUp(): Promise<void> {
        await super.cleanUp();
        this.actorRenderer?.delete();
        this.actorRenderer = undefined;
    }
}
