import { Program, Texture } from "picogl";

import { Camera } from "../../mapviewer/Camera";
import { MapViewer } from "../../mapviewer/MapViewer";
import { Interactions } from "../../mapviewer/webgl/Interactions";
import { WebGLMapViewerRenderer } from "../../mapviewer/webgl/WebGLMapViewerRenderer";
import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import actorSilhouetteFragShader from "../../mapviewer/webgl/actor/actor-silhouette.frag.glsl";
import actorVertShader from "../../mapviewer/webgl/actor/actor.vert.glsl";
import { createProgram } from "../../mapviewer/webgl/shaders/Shaders";
import mainFragShader from "../../mapviewer/webgl/shaders/main.frag.glsl";

// What the renderer calls into each frame, in this order.
export interface GameFrameHandler {
    // Before the camera matrices are built: advance the game and place the camera.
    update(deltaTimeMs: number, camera: Camera): void;
    // After the camera matrices are built: submit this frame's actors.
    submitActors(actors: ActorRenderer, camera: Camera): void;
    // Draw 2D overlays (health bars, hitsplats) with this frame's camera.
    drawOverlay(camera: Camera): void;
}

// The map viewer's WebGL renderer with the viewer's own controls, hover menus
// and map square NPCs taken out, and the game's actors drawn in the NPC passes.
export class GameWebGLRenderer extends WebGLMapViewerRenderer {
    game?: GameFrameHandler;

    actorProgram?: Program;
    actorSilhouetteProgram?: Program;
    actorRenderer?: ActorRenderer;

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

    getActorRenderer(): Promise<ActorRenderer> {
        return this.actorRendererReady;
    }

    override async init(): Promise<void> {
        await super.init();
        // The game reads input itself; the viewer's input manager would also move
        // the camera and grab the pointer.
        this.mapViewer.inputManager.cleanUp();
    }

    override async initShaders(): Promise<Program[]> {
        const programs = await super.initShaders();
        const [actorProgram, actorSilhouetteProgram] = await this.app.createPrograms(
            createProgram(actorVertShader, mainFragShader, this.hasMultiDraw, true),
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
        this.resolveActorRenderer(this.actorRenderer);
        return [...programs, actorProgram, actorSilhouetteProgram];
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
            actors.beginFrame();
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
