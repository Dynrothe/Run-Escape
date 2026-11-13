// Bakes the game's actors as the game does and checks every frame draws exactly the triangles a
// fully posed copy of its model would: a frame that shares a mesh (ActorBakeFrames.ts) is read
// back through its positions, as actor.vert.glsl reads it, and compared corner by corner with
// the model baked whole. Prints what the bakes come to, and exits 1 on any difference.
//
//   bun run tsx scripts/cache/check-actor-frames.ts                  every actor the game bakes
//   bun run tsx scripts/cache/check-actor-frames.ts "warden|sol_h"   those whose key matches
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { GameAssets, getCharacterAppearance } from "../../src/game/client/GameAssets";
import { CHARACTERS } from "../../src/game/content/characters";
import { ENEMIES } from "../../src/game/content/enemies";
import { WEAPONS, getWeapon } from "../../src/game/content/weapons";
import { AddedFrame, Frames } from "../../src/mapviewer/webgl/actor/ActorBakeFrames";
import { ActorBakeLoader } from "../../src/mapviewer/webgl/actor/ActorBakeLoader";
import { ActorBakeResult, BakeRequest } from "../../src/mapviewer/webgl/actor/ActorBakeTypes";
import { SceneBuffer } from "../../src/mapviewer/webgl/buffer/SceneBuffer";
import {
    createTextureIdIndexMap,
    getSdTextureIds,
} from "../../src/mapviewer/webgl/loader/TextureIndex";
import { clearWorkerStateCaches, createWorkerState } from "../../src/mapviewer/worker/WorkerState";
import { Model } from "../../src/rs/model/Model";
import { EquipSlot } from "../../src/rs/model/player/PlayerModelLoader";
import { loadCache, loadCacheInfos } from "./load-util";

// A corner as the shader sees it: its position, then the rest of its bits (colour, texture,
// uv, alpha, priority)
function corner(x: number, y: number, z: number, v0: number, v1: number, v2: number): string {
    return `${x},${y},${z}|${v0 & 0x1ffff},${v1 >>> 15},${v2 & 0x1ffff}`;
}

function packedPosition(v0: number, v1: number, v2: number): [number, number, number] {
    return [
        ((v0 >>> 17) & 0x7fff) - 0x4000,
        -((v1 & 0x7fff) - 0x4000),
        ((v2 >>> 17) & 0x7fff) - 0x4000,
    ];
}

// The corners a fully posed copy of the model draws, opaque then alpha
function wholeCorners(model: Model, sceneBuf: SceneBuffer): string[][] {
    sceneBuf.vertexBuf.offset = 0;
    sceneBuf.vertexBuf.vertexIndices.clear();
    return [false, true].map((transparent) => {
        sceneBuf.indices.length = 0;
        sceneBuf.addModelAnimFrame(model, transparent);
        const view = new DataView(sceneBuf.vertexBuf.bytes.buffer);
        return sceneBuf.indices.map((vertex) => {
            const v0 = view.getUint32(vertex * 12, true);
            const v1 = view.getUint32(vertex * 12 + 4, true);
            const v2 = view.getUint32(vertex * 12 + 8, true);
            return corner(...packedPosition(v0, v1, v2), v0, v1, v2);
        });
    });
}

// The corners a baked frame draws, its positions read as actor.vert.glsl reads them
function bakedCorners(bake: ActorBakeResult, frame: AddedFrame): string[][] {
    const view = new DataView(bake.vertices.buffer, bake.vertices.byteOffset);
    const wide = bake.indices instanceof Uint32Array;
    const first = wide ? 0 : bake.segmentStarts[frame.segment];
    const ranges = frame.ranges;
    return [0, 2].map((r) => {
        const corners: string[] = [];
        for (let i = 0; i < ranges[r + 1]; i++) {
            const vertex = first + bake.indices[ranges[r] + i];
            const v0 = view.getUint32(vertex * 12, true);
            const v1 = view.getUint32(vertex * 12 + 4, true);
            const v2 = view.getUint32(vertex * 12 + 8, true);
            let position = packedPosition(v0, v1, v2);
            if (frame.positionStart >= 0) {
                const index = ((v0 >>> 17) & 0x7fff) | (((v2 >>> 17) & 0x7fff) << 15);
                const texel = (frame.positionStart + index) * 3;
                position = [
                    bake.positions[texel],
                    bake.positions[texel + 1],
                    bake.positions[texel + 2],
                ];
            }
            corners.push(corner(...position, v0, v1, v2));
        }
        return corners;
    });
}

const only = process.argv[2] ? new RegExp(process.argv[2]) : undefined;
const info = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME);
if (!info) {
    throw new Error(`Cache ${GAME_CACHE_NAME} isn't in caches/`);
}
const state = createWorkerState(loadCache(info), [], [], undefined as unknown as Cache);
const sceneBuf = new SceneBuffer(
    state.textureLoader,
    createTextureIdIndexMap(getSdTextureIds(state.textureLoader)),
    50000,
);

// Every frame as it's added: what it would draw whole, and where it went
let added: { frame: AddedFrame; whole: string[][] }[] = [];
const add = Frames.prototype.add;
Frames.prototype.add = function (this: Frames, model: Model, framesAhead: number) {
    const whole = wholeCorners(model, sceneBuf);
    const frame = add.call(this, model, framesAhead);
    added.push({ frame, whole });
    return frame;
};

// The heroes as a run bakes them: each adventurer with their starting weapon, and each weapon
// with a run pose held, its aim over the run too
function getHeroRequests(): BakeRequest[] {
    const hero = (
        key: string,
        appearance: ReturnType<typeof getCharacterAppearance>,
        seqs: number[],
    ) => ({
        ...GameAssets.getLookRequest(appearance, seqs).request,
        key,
    });
    const swings = (weaponId: string) => {
        const weapon = getWeapon(weaponId);
        return [weapon.playerSeq, weapon.special?.playerSeq ?? -1].filter((seq) => seq !== -1);
    };
    const heroes = CHARACTERS.filter((character) => !character.npcLook).map((character) =>
        hero(
            `hero:${character.id}`,
            getCharacterAppearance(character.id),
            swings(character.startingWeapon),
        ),
    );
    const aims = WEAPONS.filter((weapon) => weapon.runPose !== undefined).map((weapon) => {
        const appearance = getCharacterAppearance(CHARACTERS[0].id);
        appearance.equipment = appearance.equipment.slice();
        appearance.equipment[EquipSlot.WEAPON] = weapon.levels[0].objId!;
        return hero(`hero:${weapon.id}`, appearance, swings(weapon.id));
    });
    return [...heroes, ...aims];
}

const enemies = GameAssets.mergeRequests(GameAssets.getEnemyRequests(ENEMIES)).requests;
const requests = [...GameAssets.getBaseRequests(), ...enemies, ...getHeroRequests()].filter(
    (request) => !only || only.test(request.key),
);
const loader = new ActorBakeLoader();
const log = console.log;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const byKind = new Map<string, number>();
let total = 0;
let frames = 0;
let shared = 0;
let different = 0;
for (const request of requests) {
    added = [];
    console.log = () => {};
    let bake: ActorBakeResult;
    try {
        bake = (await loader.load(state, { requests: [request], loadedTextureIds: new Set() }))
            .data;
    } finally {
        console.log = log;
    }
    clearWorkerStateCaches(state);
    const bytes = bake.vertices.byteLength + bake.indices.byteLength + bake.positions.byteLength;
    total += bytes;
    byKind.set(request.kind, (byKind.get(request.kind) ?? 0) + bytes);
    added.forEach(({ frame, whole }, i) => {
        frames++;
        shared += frame.positionStart >= 0 ? 1 : 0;
        const baked = bakedCorners(bake, frame);
        const pass = baked.findIndex((corners, p) => corners.join(" ") !== whole[p].join(" "));
        if (pass === -1) {
            return;
        }
        different++;
        if (different <= 10) {
            // Its first corner that isn't the same, as position|uv, colour, alpha and priority
            const at = baked[pass].findIndex((c, k) => c !== whole[pass][k]);
            log(
                `${request.key}: frame ${i} doesn't draw as its model baked whole: ` +
                    `${pass ? "alpha" : "opaque"} corner ${at} is ${baked[pass][at]}, not ${whole[pass][at]}`,
            );
        }
    });
}
log(
    `${requests.length} bakes, ${mb(total)}: ${[...byKind].map(([k, b]) => `${k} ${mb(b)}`).join(", ")}`,
);
log(`${frames} frames, ${shared} sharing a mesh, ${different} drawn differently`);
process.exit(different > 0 ? 1 : 0);
