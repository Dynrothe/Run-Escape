// Compares the game's cache (GAME_CACHE_NAME) with an older one, over the groups the game reads:
// the ones a checked slim-cache run kept (caches/slim/ by default). Config archives go file by
// file, and the types the game decodes are compared decoded, so a new encoding of the same thing
// doesn't count as a change. Run it before moving the game to a newer cache.
//
//   bun run tsx scripts/cache/compare-caches.ts <older cache name> [slim store dir]
import fs from "node:fs";
import path from "node:path";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheInfo } from "../../src/rs/cache/CacheInfo";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { CHUNK_DIR, readChunk } from "../../src/rs/cache/ChunkedCache";
import { ConfigType } from "../../src/rs/cache/ConfigType";
import { IndexType } from "../../src/rs/cache/IndexType";
import { Type } from "../../src/rs/config/Type";
import { TypeConstructor } from "../../src/rs/config/TypeLoader";
import { IdkType } from "../../src/rs/config/idktype/IdkType";
import { LocType } from "../../src/rs/config/loctype/LocType";
import { NpcType } from "../../src/rs/config/npctype/NpcType";
import { ObjType } from "../../src/rs/config/objtype/ObjType";
import { SeqType } from "../../src/rs/config/seqtype/SeqType";
import { SpotAnimType } from "../../src/rs/config/spotanimtype/SpotAnimType";
import { ByteBuffer } from "../../src/rs/io/ByteBuffer";
import { loadCache, loadCacheInfos } from "./load-util";

const oldName = process.argv[2];
const storeDir = process.argv[3] ?? "caches/slim/";
if (!oldName) {
    throw new Error("Usage: compare-caches.ts <older cache name> [slim store dir]");
}

function open(name: string): { info: CacheInfo; system: CacheSystem } {
    const info = loadCacheInfos().find((c) => c.name === name);
    if (!info) {
        throw new Error(`${name} isn't in caches/caches.json`);
    }
    const loaded = loadCache(info);
    return { info, system: CacheSystem.fromFiles(loaded.type, loaded.files) };
}

const before = open(oldName);
const after = open(GAME_CACHE_NAME);

// The groups the game reads, by index
const stored = JSON.parse(fs.readFileSync(path.join(storeDir, "slim.json"), "utf8"));
const read = new Map<number, number[]>();
for (const { file } of stored.info.chunks as { file: string }[]) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(storeDir, CHUNK_DIR, file)));
    for (const group of readChunk(bytes)) {
        if (group.indexId === 255) {
            continue;
        }
        const ids = read.get(group.indexId) ?? [];
        ids.push(group.archiveId);
        read.set(group.indexId, ids);
    }
}

const INDEX_NAMES: Record<number, string> = {};
for (const [name, id] of Object.entries({ ...IndexType.DAT2, ...IndexType.OSRS })) {
    INDEX_NAMES[id] = name;
}
const CONFIG_NAMES: Record<number, string> = {};
for (const [name, id] of Object.entries({ ...ConfigType.DAT2, ...ConfigType.OSRS })) {
    CONFIG_NAMES[id] ??= name;
}

// Map squares by their x_y
function groupName(indexId: number, archiveId: number): string {
    if (indexId === IndexType.DAT2.maps) {
        return `${archiveId >> 8}_${archiveId & 0xff}`;
    }
    return String(archiveId);
}

console.log(`${oldName} -> ${GAME_CACHE_NAME}, over ${stored.info.name}'s groups\n`);

// Every index but configs: by each group's crc in the index's table
for (const [indexId, ids] of [...read].sort((a, b) => a[0] - b[0])) {
    if (indexId === IndexType.DAT2.configs) {
        continue;
    }
    const oldIndex = before.system.getIndex(indexId);
    const newIndex = after.system.getIndex(indexId);
    const changed: number[] = [];
    const missing: number[] = [];
    for (const id of ids) {
        const oldRef = oldIndex.getArchiveReference(id);
        const newRef = newIndex.getArchiveReference(id);
        if (!newRef) {
            missing.push(id);
        } else if (!oldRef || oldRef.crc !== newRef.crc) {
            changed.push(id);
        }
    }
    const name = INDEX_NAMES[indexId] ?? `index ${indexId}`;
    console.log(
        `${name} (${indexId}): ${ids.length} read, ${changed.length} changed, ${missing.length} gone`,
    );
    if (changed.length > 0) {
        console.log(`  changed: ${changed.map((id) => groupName(indexId, id)).join(", ")}`);
    }
    if (missing.length > 0) {
        console.log(`  gone: ${missing.map((id) => groupName(indexId, id)).join(", ")}`);
    }
}

const DECODED: Record<number, TypeConstructor<Type>> = {
    [ConfigType.DAT2.npcs]: NpcType,
    [ConfigType.DAT2.objs]: ObjType,
    [ConfigType.DAT2.locs]: LocType,
    [ConfigType.DAT2.seqs]: SeqType,
    [ConfigType.DAT2.spotAnims]: SpotAnimType,
    [ConfigType.DAT2.identkits]: IdkType,
};

// A type's fields, without the cache it came from
function decode(
    constructor: TypeConstructor<Type>,
    id: number,
    data: Int8Array,
    info: CacheInfo,
): Record<string, unknown> {
    const type = new constructor(id, info);
    type.decode(new ByteBuffer(data));
    const { cacheInfo: _info, ...fields } = type as unknown as Record<string, unknown>;
    return fields;
}

const oldConfigs = before.system.getIndex(IndexType.DAT2.configs);
const newConfigs = after.system.getIndex(IndexType.DAT2.configs);
console.log("\nconfigs (2):");
for (const archiveId of (read.get(IndexType.DAT2.configs) ?? []).sort((a, b) => a - b)) {
    const oldArchive = oldConfigs.getArchive(archiveId);
    const newArchive = newConfigs.getArchive(archiveId);
    const constructor = DECODED[archiveId];
    const changed: string[] = [];
    let reencoded = 0;
    let added = 0;
    const removed: number[] = [];
    const oldIds = new Set(oldArchive.fileIds);
    for (const id of newArchive.fileIds) {
        if (!oldIds.has(id)) {
            added++;
            continue;
        }
        const a = oldArchive.getFile(id)!.data;
        const b = newArchive.getFile(id)!.data;
        if (a.length === b.length && a.every((v, i) => v === b[i])) {
            continue;
        }
        if (!constructor) {
            changed.push(String(id));
            continue;
        }
        const was = decode(constructor, id, a, before.info);
        const is = decode(constructor, id, b, after.info);
        const fields = Object.keys({ ...was, ...is }).filter(
            (key) => JSON.stringify(was[key]) !== JSON.stringify(is[key]),
        );
        if (fields.length === 0) {
            reencoded++;
            continue;
        }
        const name = is.name ?? was.name;
        const label = typeof name === "string" && name !== "null" ? `${id} "${name}"` : `${id}`;
        changed.push(`${label} [${fields.join(" ")}]`);
    }
    for (const id of oldArchive.fileIds) {
        if (!newArchive.getFile(id)) {
            removed.push(id);
        }
    }
    const name = CONFIG_NAMES[archiveId] ?? `archive ${archiveId}`;
    console.log(
        `  ${name} (${archiveId}): ${oldArchive.fileIds.length} -> ${newArchive.fileIds.length}, ` +
            `${changed.length} changed, ${reencoded} only re-encoded, ${added} added, ` +
            `${removed.length} removed`,
    );
    for (const line of changed) {
        console.log(`    ${line}`);
    }
    if (removed.length > 0) {
        console.log(`    removed: ${removed.join(", ")}`);
    }
}
