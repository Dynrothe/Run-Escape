// Poses an NPC with candidate animations and measures each one, to tell attack,
// block and death animations apart without watching them: a death ends lying
// down (low height on the last frame), an attack reaches out (wide extent
// mid-animation) and ends standing.
//
//   npx tsx scripts/cache/classify-npc-seqs.ts 655 6182 6183 6184 6185
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { NpcModelLoader } from "../../src/rs/config/npctype/NpcModelLoader";
import { VarManager } from "../../src/rs/config/vartype/VarManager";
import { Model } from "../../src/rs/model/Model";
import { loadCache, loadCacheInfos } from "./load-util";

const [npcArg, ...seqArgs] = process.argv.slice(2);
const npcId = parseInt(npcArg);
const seqIds = seqArgs.map((a) => parseInt(a));

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const factory = getCacheLoaderFactory(cacheInfo, CacheSystem.fromFiles(loaded.type, loaded.files));
const npcTypeLoader = factory.getNpcTypeLoader();
const seqTypeLoader = factory.getSeqTypeLoader();
const basTypeLoader = factory.getBasTypeLoader();
const npcModelLoader = new NpcModelLoader(
    npcTypeLoader,
    factory.getModelLoader(),
    factory.getTextureLoader(),
    seqTypeLoader,
    factory.getSeqFrameLoader(),
    factory.getSkeletalSeqLoader(),
    new VarManager(factory.getVarBitTypeLoader()),
);

function measure(model: Model | undefined): { height: number; reach: number } {
    let height = 0;
    let reach = 0;
    if (!model) {
        return { height, reach };
    }
    for (let i = 0; i < model.verticesCount; i++) {
        height = Math.max(height, -model.verticesY[i]);
        reach = Math.max(reach, Math.hypot(model.verticesX[i], model.verticesZ[i]));
    }
    return { height, reach };
}

const npcType = npcTypeLoader.load(npcId);
const idleSeqId = npcType.getIdleSeqId(basTypeLoader);
const idle = measure(npcModelLoader.getModel(npcType, idleSeqId, 0));
console.log(`${npcType.name} (${npcId}) standing: height ${idle.height}, reach ${idle.reach | 0}`);

for (const seqId of seqIds) {
    const seqType = seqTypeLoader.load(seqId);
    const frameCount = seqType.isSkeletalSeq()
        ? seqType.getSkeletalDuration()
        : (seqType.frameIds?.length ?? 0);
    let maxReach = 0;
    let minHeight = Infinity;
    for (let frame = 0; frame < frameCount; frame++) {
        const m = measure(npcModelLoader.getModel(npcType, seqId, frame));
        maxReach = Math.max(maxReach, m.reach);
        minHeight = Math.min(minHeight, m.height);
    }
    const last = measure(npcModelLoader.getModel(npcType, seqId, frameCount - 1));
    const ticks = seqType.isSkeletalSeq()
        ? frameCount
        : (seqType.frameLengths ?? []).reduce((sum, l) => sum + (l || 1), 0);
    const lastRatio = last.height / Math.max(idle.height, 1);
    const reachRatio = maxReach / Math.max(idle.reach, 1);
    let guess = "";
    if (lastRatio < 0.6) {
        guess = "death?";
    } else if (reachRatio > 1.25 && ticks <= 100) {
        guess = "attack?";
    } else if (ticks <= 60) {
        guess = "block?";
    }
    console.log(
        `${seqId}`.padStart(6),
        `${(ticks * 0.02).toFixed(2)}s`.padEnd(7),
        `last height ${(lastRatio * 100).toFixed(0)}%`.padEnd(18),
        `min height ${((minHeight / Math.max(idle.height, 1)) * 100).toFixed(0)}%`.padEnd(17),
        `max reach ${(reachRatio * 100).toFixed(0)}%`.padEnd(16),
        guess,
    );
}
