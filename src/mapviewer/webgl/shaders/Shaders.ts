import { ProgramSource, prependDefines } from "./ShaderUtil";
import frameFxaaFragShader from "./frame-fxaa.frag.glsl";
import frameFxaaVertShader from "./frame-fxaa.vert.glsl";
import frameFragShader from "./frame.frag.glsl";
import frameVertShader from "./frame.vert.glsl";
import mainFragShader from "./main.frag.glsl";
import mainVertShader from "./main.vert.glsl";
import npcVertShader from "./npc.vert.glsl";

export function createProgram(
    vertShader: string,
    fragShader: string,
    hasMultiDraw: boolean,
    discardAlpha: boolean,
    lights = false,
): ProgramSource {
    const defines: string[] = [];
    if (hasMultiDraw) {
        defines.push("MULTI_DRAW");
    }
    if (discardAlpha) {
        defines.push("DISCARD_ALPHA");
    }
    // A dark map's (lights.glsl); every other map's programs go without
    if (lights) {
        defines.push("LIGHTS");
    }
    return [prependDefines(vertShader, defines), prependDefines(fragShader, defines)];
}

export function createMainProgram(
    hasMultiDraw: boolean,
    discardAlpha: boolean,
    lights = false,
): ProgramSource {
    return createProgram(mainVertShader, mainFragShader, hasMultiDraw, discardAlpha, lights);
}

export function createNpcProgram(
    hasMultiDraw: boolean,
    discardAlpha: boolean,
    lights = false,
): ProgramSource {
    return createProgram(npcVertShader, mainFragShader, hasMultiDraw, discardAlpha, lights);
}

export const FRAME_PROGRAM = [frameVertShader, frameFragShader];
export const FRAME_FXAA_PROGRAM = [frameFxaaVertShader, frameFxaaFragShader];
