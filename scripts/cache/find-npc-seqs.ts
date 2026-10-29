// Lists the animations an NPC's model can play: every sequence built on the
// same skeleton as its idle animation. Attack, block and death animations are
// sent by the server, so they aren't in the NPC's definition; they're usually
// numbered close to its idle and walk animations, which are listed first.
//
//   npx tsx scripts/cache/find-npc-seqs.ts 655 1173 [--all]
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { SeqType } from "../../src/rs/config/seqtype/SeqType";
import { loadCache, loadCacheInfos } from "./load-util";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const npcIds = args.filter((a) => !a.startsWith("--")).map((a) => parseInt(a));
if (npcIds.length === 0 || npcIds.some(isNaN)) {
    console.log("usage: find-npc-seqs.ts <npcId> [npcId...] [--all]");
    process.exit(1);
}

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const factory = getCacheLoaderFactory(cacheInfo, CacheSystem.fromFiles(loaded.type, loaded.files));
const npcTypeLoader = factory.getNpcTypeLoader();
const seqTypeLoader = factory.getSeqTypeLoader();
const seqFrameLoader = factory.getSeqFrameLoader();
const skeletalSeqLoader = factory.getSkeletalSeqLoader();
const basTypeLoader = factory.getBasTypeLoader();

function getBaseId(seqType: SeqType): number {
    try {
        if (seqType.isSkeletalSeq()) {
            return skeletalSeqLoader?.load(seqType.skeletalId)?.base.id ?? -1;
        }
        if (!seqType.frameIds || seqType.frameIds.length === 0) {
            return -1;
        }
        return seqFrameLoader.load(seqType.frameIds[0])?.base.id ?? -1;
    } catch (e) {
        return -1;
    }
}

function getDurationTicks(seqType: SeqType): number {
    if (seqType.isSkeletalSeq()) {
        return seqType.getSkeletalDuration();
    }
    return (seqType.frameLengths ?? []).reduce((sum, length) => sum + (length || 1), 0);
}

type SeqInfo = { id: number; frames: number; ticks: number };

// Skeleton of every sequence, worked out once for all the NPCs asked about
const seqsByBase = new Map<number, SeqInfo[]>();
for (let id = 0; id < seqTypeLoader.getCount(); id++) {
    const seqType = seqTypeLoader.load(id);
    const baseId = getBaseId(seqType);
    seqFrameLoader.clearCache();
    if (baseId === -1) {
        continue;
    }
    const frames = seqType.isSkeletalSeq()
        ? seqType.getSkeletalDuration()
        : (seqType.frameIds?.length ?? 0);
    const list = seqsByBase.get(baseId) ?? [];
    list.push({ id, frames, ticks: getDurationTicks(seqType) });
    seqsByBase.set(baseId, list);
}

for (const npcId of npcIds) {
    const npcType = npcTypeLoader.load(npcId);
    const idleSeqId = npcType.getIdleSeqId(basTypeLoader);
    const walkSeqId = npcType.getWalkSeqId(basTypeLoader);
    const baseId = getBaseId(seqTypeLoader.load(idleSeqId));
    console.log();
    console.log(
        `${npcType.name} (${npcId}): idle ${idleSeqId}, walk ${walkSeqId}, skeleton ${baseId}`,
    );
    const matches = (seqsByBase.get(baseId) ?? []).slice();
    const near = (m: SeqInfo) => Math.min(Math.abs(m.id - idleSeqId), Math.abs(m.id - walkSeqId));
    matches.sort((a, b) => near(a) - near(b) || a.id - b.id);
    for (const m of showAll ? matches : matches.slice(0, 14)) {
        const tag = m.id === idleSeqId ? "idle" : m.id === walkSeqId ? "walk" : "";
        console.log(
            `${m.id}`.padStart(6),
            `${m.frames} frames`.padEnd(10),
            `${(m.ticks * 0.02).toFixed(2)}s`.padEnd(7),
            tag,
        );
    }
}
