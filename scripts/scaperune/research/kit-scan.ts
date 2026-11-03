// Suggests kit pieces: scenery made to go with others (a wall's sections, half a model, one face
// of something, the levels of a stack) that has holes or invisible sides standing alone. Three
// signals, each a reason to look, not a verdict:
//
// - one-sided: a closed model's faces point every way, so their normals, weighted by area, add up
//   to nothing (getOpenness). Faces that point one way across the ground mean a side isn't there,
//   and the renderer culls back faces, so from that side it's see-through. Scenery that stands
//   against a wall is often made this way too: it needs the wall behind it.
// - always with the same companions: everywhere the world places it, the same other ids touch it,
//   on its own level. Ids placed everywhere (a town's wall) don't count as companions.
// - stacked: over the same tile, on another level, stands scenery with an id close to its own, so
//   the cache built one thing out of pieces level by level.
//
// It's noisy: a few thousand candidates over the whole cache, many of them real kits (ships' sails
// and figureheads, redwoods, things on shelves) that nobody would put on a map alone anyway.
// That's why it's a script and not a check. Look a candidate up in the game before adding it to
// KIT_PIECES (catalogue.ts); the listed ones are marked *, and the summary says which signal
// found each. Reads every map square in the cache, all levels, so it takes a minute or two.
//
//   npx tsx scripts/scaperune/research/kit-scan.ts [out.json]
//   TOP=200 FROM=32000 TO=33200 npx tsx scripts/scaperune/research/kit-scan.ts    # some ids only
import fs from "node:fs";

import { KIT_PIECES, findRule } from "../../../src/game/scaperune/catalogue";
import { createTileGrid, readLocs } from "../../../src/game/scaperune/format";
import { getOpenness } from "./geometry";
import { getModelIds, locLabel, openWorld, round } from "./lib";

// Openness at or over this is one-sided. A box with no back comes out at about 0.3.
const ONE_SIDED = 0.25;
// Fewer triangles than this is a plane on purpose: a sign, a shadow, a rope
const LEAST_TRIS = 24;
// Placements each pattern needs before it means anything
const LEAST_PLACED_ALWAYS = 4;
const LEAST_PLACED_STACKED = 2;
// The share of placements a companion needs to be "always"
const ALWAYS = 0.95;
// A companion placed this many times more than the loc is common ground, not a set
const COMMON = 3;
// Ids this close count as one family, for stacks
const FAMILY = 24;
// The share of placements stacked for a loc to count as stacked
const STACKED = 0.5;

// Scenery: what stands up on its own and can show a hole. Walls are kits by nature.
const SCENERY = new Set([9, 10, 11]);

type Stats = {
    placed: number;
    stacked: number;
    types: Set<number>;
    companions: Map<number, number>;
};

const out = process.argv[2];
const from = Number(process.env.FROM ?? 0);
const to = Number(process.env.TO ?? Infinity);
const w = openWorld();
const models = w.factory.getModelLoader();
const stats = new Map<number, Stats>();
const statsOf = (id: number): Stats => {
    let s = stats.get(id);
    if (!s) {
        s = { placed: 0, stacked: 0, types: new Set(), companions: new Map() };
        stats.set(id, s);
    }
    return s;
};

for (let mapX = 0; mapX < 100; mapX++) {
    for (let mapY = 0; mapY < 200; mapY++) {
        const data = w.maps.getLocData(mapX, mapY, new Map());
        if (!data) continue;
        const grid = createTileGrid(64, 64);
        readLocs(data, grid, 0, 0);
        const locs = grid.locs.filter((loc) => loc.type !== 22);
        // Which locs cover each tile, by level
        const at = new Map<number, number[]>();
        const tiles = locs.map((loc, i) => {
            const meta = w.loc(loc.id);
            const sizeX = loc.rotation & 1 ? meta.sizeY : meta.sizeX;
            const sizeY = loc.rotation & 1 ? meta.sizeX : meta.sizeY;
            const covered: number[] = [];
            for (let y = loc.y; y < loc.y + sizeY && y < 64; y++) {
                for (let x = loc.x; x < loc.x + sizeX && x < 64; x++) {
                    covered.push(x + y * 64);
                    const key = loc.level * 4096 + x + y * 64;
                    const list = at.get(key);
                    if (list) list.push(i);
                    else at.set(key, [i]);
                }
            }
            return covered;
        });
        locs.forEach((loc, i) => {
            if (!SCENERY.has(loc.type)) return;
            const s = statsOf(loc.id);
            s.placed++;
            s.types.add(loc.type);
            // What touches it on its own level: its tiles and the ring round them
            const near = new Set<number>();
            let stacked = false;
            for (const tile of tiles[i]) {
                const tx = tile % 64;
                const ty = Math.floor(tile / 64);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const x = tx + dx;
                        const y = ty + dy;
                        if (x < 0 || y < 0 || x >= 64 || y >= 64) continue;
                        for (const j of at.get(loc.level * 4096 + x + y * 64) ?? []) {
                            if (locs[j].id !== loc.id) near.add(locs[j].id);
                        }
                    }
                }
                for (let level = 0; level < 4; level++) {
                    if (level === loc.level) continue;
                    for (const j of at.get(level * 4096 + tile) ?? []) {
                        const other = locs[j];
                        if (SCENERY.has(other.type) && Math.abs(other.id - loc.id) <= FAMILY) {
                            stacked = true;
                        }
                    }
                }
            }
            for (const id of near) s.companions.set(id, (s.companions.get(id) ?? 0) + 1);
            if (stacked) s.stacked++;
        });
    }
}

type Suggestion = {
    id: number;
    name: string;
    size: string;
    placed: number;
    openness: number;
    reasons: string[];
    set: number[];
    listed: boolean;
};
const suggestions: Suggestion[] = [];
for (const [id, s] of stats) {
    if (id < from || id > to) continue;
    const reasons: string[] = [];
    const type = w.locTypes.load(id);
    let tris = 0;
    let open = 0;
    for (const modelId of getModelIds(type, [...s.types][0])) {
        const model = models.getModel(modelId);
        if (!model) continue;
        tris += model.faceCount;
        open = Math.max(open, getOpenness(model));
    }
    if (open >= ONE_SIDED && tris >= LEAST_TRIS) {
        reasons.push(`one-sided (${round(open)})`);
    }
    const set: number[] = [];
    if (s.placed >= LEAST_PLACED_ALWAYS) {
        for (const [other, count] of s.companions) {
            const common = (stats.get(other)?.placed ?? 0) > s.placed * COMMON;
            if (count / s.placed >= ALWAYS && !common) set.push(other);
        }
        if (set.length > 0) reasons.push(`always with ${set.sort((a, b) => a - b).join(", ")}`);
    }
    if (s.placed >= LEAST_PLACED_STACKED && s.stacked / s.placed >= STACKED) {
        reasons.push(`stacked (${round((s.stacked / s.placed) * 100, 0)}%)`);
    }
    const listed = findRule(KIT_PIECES, id) !== undefined;
    if (reasons.length === 0 && !listed) continue;
    const meta = w.loc(id);
    suggestions.push({
        id,
        name: locLabel(meta),
        size: `${meta.sizeX}x${meta.sizeY}`,
        placed: s.placed,
        openness: round(open),
        reasons,
        set,
        listed,
    });
}
suggestions.sort((a, b) => b.reasons.length - a.reasons.length || a.id - b.id);

const found = suggestions.filter((s) => s.reasons.length > 0);
const byReason = (word: string) => found.filter((s) => s.reasons.some((r) => r.startsWith(word)));
console.log(
    `${found.length} candidates: ${byReason("one-sided").length} one-sided, ` +
        `${byReason("always").length} always with the same companions, ` +
        `${byReason("stacked").length} stacked, ` +
        `${found.filter((s) => s.reasons.length >= 2).length} with two signals or more`,
);
// How the listed kit pieces come out, to see what each signal catches
for (const { ids, why } of KIT_PIECES) {
    const [first, last] = ids;
    const listed = suggestions.filter((s) => s.id >= first && s.id <= last);
    const hit = listed.filter((s) => s.reasons.length > 0);
    const signals = new Set(hit.flatMap((s) => s.reasons.map((r) => r.split(" ")[0])));
    console.log(
        `  listed ${first}-${last}: ${hit.length} of ${listed.length} placed as scenery found` +
            ` [${[...signals].join(", ")}]: ${why}`,
    );
}
for (const s of found.slice(0, Number(process.env.TOP ?? 60))) {
    console.log(
        `${s.listed ? "*" : " "} ${s.id} ${s.name} ${s.size} x${s.placed}: ${s.reasons.join("; ")}`,
    );
}
if (out) {
    fs.writeFileSync(out, JSON.stringify(found, null, 1));
}
