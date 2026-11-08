// The groups each unit of slim-cache.ts's plan read in the last checked run, in
// caches/slim/units.json, so a run whose whole fingerprint changed still loads
// only the units whose own inputs changed
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renameWithRetry } from "./slim-files";
import type { SlimUnit } from "./slim-plan";

type StoredUnit = { inputs: string; reads: string[]; checksum: string };
type StoredUnits = { version: 1; units: Record<string, StoredUnit> };
export type UnitReads = Map<string, string[]>;

const manifestPath = (dir: string) => path.join(dir, "units.json");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprint = (inputs: string, unit: SlimUnit) => digest({ inputs, unit });
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

// Batches are named after their first key (slim-plan.ts's batchByKey), not
// their place, so one's name lasts while its requests do
export function unitId(unit: SlimUnit): string {
    switch (unit.kind) {
        case "map":
            return `map:${unit.id}`;
        case "bake":
            return `bake:${unit.group}:${unit.requests[0].key}`;
        case "icons":
            return `icons:${unit.objIds[0]}`;
        default:
            return unit.kind;
    }
}

// Two units with one name would lose one's reads, so a plan with them stops
export function checkUnitIds(units: SlimUnit[]): void {
    const seen = new Set<string>();
    for (const unit of units) {
        const id = unitId(unit);
        if (seen.has(id)) {
            throw new Error(`Two extraction units are both ${id}`);
        }
        seen.add(id);
    }
}

function isGroupKey(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d+:\d+$/.test(value)) {
        return false;
    }
    const [index, archive] = value.split(":").map(Number);
    return index <= 255 && Number.isSafeInteger(archive) && archive <= 0xffffffff;
}

// Only current units with matching payloads and intact read lists are reused.
export function reusableUnitReads(dir: string, inputs: string, units: SlimUnit[]): UnitReads {
    const result: UnitReads = new Map();
    let stored: unknown;
    try {
        stored = JSON.parse(fs.readFileSync(manifestPath(dir), "utf8"));
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`Couldn't read extraction results; extracting all units again: ${e}`);
        }
        return result;
    }
    if (!isRecord(stored) || stored.version !== 1 || !isRecord(stored.units)) {
        console.warn("Unknown extraction manifest format; extracting all units again");
        return result;
    }
    for (const unit of units) {
        const id = unitId(unit);
        const entry = stored.units[id];
        if (entry === undefined) {
            continue;
        }
        if (!isRecord(entry) || typeof entry.inputs !== "string") {
            console.warn(`Invalid extraction result for ${id}; extracting it again`);
            continue;
        }
        if (entry.inputs !== fingerprint(inputs, unit)) {
            continue;
        }
        if (
            !Array.isArray(entry.reads) ||
            !entry.reads.every(isGroupKey) ||
            entry.checksum !== digest({ inputs: entry.inputs, reads: entry.reads })
        ) {
            console.warn(`Damaged extraction result for ${id}; extracting it again`);
            continue;
        }
        result.set(id, entry.reads);
    }
    return result;
}

// Called only after every unit has been checked against the shipped chunks.
// One atomic manifest replaces the previous run, dropping removed units too.
export function storeUnitReads(
    dir: string,
    inputs: string,
    units: SlimUnit[],
    results: UnitReads,
): void {
    const stored: StoredUnits = { version: 1, units: {} };
    for (const unit of units) {
        const id = unitId(unit);
        if (Object.hasOwn(stored.units, id)) {
            throw new Error(`Duplicate extraction unit ${id}`);
        }
        const result = results.get(id);
        if (!result || !result.every(isGroupKey)) {
            throw new Error(`Missing or invalid extraction result for ${id}`);
        }
        const entry = { inputs: fingerprint(inputs, unit), reads: [...new Set(result)].sort() };
        stored.units[id] = { ...entry, checksum: digest(entry) };
    }
    fs.mkdirSync(dir, { recursive: true });
    const file = manifestPath(dir);
    const temporary = `${file}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify(stored), "utf8");
        renameWithRetry(temporary, file);
    } finally {
        if (fs.existsSync(temporary)) {
            fs.rmSync(temporary);
        }
    }
}

export function mergeUnitReads(results: UnitReads): Set<string> {
    return new Set([...results.values()].flat());
}
