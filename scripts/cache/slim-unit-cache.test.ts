import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { hashInputs } from "./slim-files";
import type { SlimUnit } from "./slim-plan";
import { mergeUnitReads, reusableUnitReads, storeUnitReads, unitId } from "./slim-unit-cache";

let dir: string;
const units: SlimUnit[] = [
    { kind: "map", id: "one", region: { baseX: 3200, baseY: 3200, sizeX: 8, sizeY: 8 } },
    { kind: "map", id: "two", region: { baseX: 3264, baseY: 3200, sizeX: 8, sizeY: 8 } },
    {
        kind: "bake",
        group: "base",
        from: 0,
        requests: [{ kind: "obj", key: "ring", objId: 2570, count: 1 }],
    },
    { kind: "sounds", ids: [1] },
    { kind: "sprites", ids: [1] },
    { kind: "icons", objIds: [2570] },
    { kind: "textures" },
];
const results = () => new Map(units.map((unit, i) => [unitId(unit), ["255:2", `2:${i}`]]));

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(tmpdir(), "slim-units-"));
});
afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
});

test("reuses every matching unit and merges shared reads only once", () => {
    storeUnitReads(dir, "runtime-and-cache", units, results());
    const reused = reusableUnitReads(dir, "runtime-and-cache", units);
    expect(reused).toEqual(results());
    expect(mergeUnitReads(reused).size).toBe(units.length + 1);
    expect(fs.readdirSync(dir)).toEqual(["units.json"]);
});

test.each([0, 1, 2, 3, 4, 5])("invalidates only changed payload %i", (index) => {
    storeUnitReads(dir, "runtime-and-cache", units, results());
    const changed = structuredClone(units);
    const unit = changed[index];
    switch (unit.kind) {
        case "map":
            unit.region.baseX++;
            break;
        case "bake":
            unit.requests.push({ kind: "obj", key: "bones", objId: 526, count: 1 });
            break;
        case "icons":
            unit.objIds.push(526);
            break;
        case "sounds":
        case "sprites":
            unit.ids.push(2);
            break;
    }
    const reused = reusableUnitReads(dir, "runtime-and-cache", changed);
    expect([...reused.keys()]).toEqual(units.filter((_, i) => i !== index).map(unitId));
});

test("shared loader, recipe, dependency or full-cache changes invalidate all units", () => {
    storeUnitReads(dir, "runtime-and-cache", units, results());
    expect(reusableUnitReads(dir, "changed-runtime-or-cache", units).size).toBe(0);
});

test("new units miss, removed units disappear, and scheduling order doesn't matter", () => {
    storeUnitReads(dir, "same", units, results());
    const replacement: SlimUnit = { kind: "icons", objIds: [526] };
    const current = [...units.slice(0, 3).reverse(), replacement];
    const reused = reusableUnitReads(dir, "same", current);
    expect([...reused.keys()]).toEqual(current.slice(0, 3).map(unitId));
    reused.set(unitId(replacement), ["2:10"]);
    storeUnitReads(dir, "same", current, reused);
    expect(reusableUnitReads(dir, "same", current)).toEqual(reused);
    expect(reusableUnitReads(dir, "same", units).size).toBe(3);
});

test("a missing manifest is a normal cold extraction", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(reusableUnitReads(dir, "same", units).size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
});

test.each(["{", '{"version":99,"units":{}}'])(
    "reports an unreadable or unknown manifest and extracts again",
    (contents) => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        fs.writeFileSync(path.join(dir, "units.json"), contents);
        expect(reusableUnitReads(dir, "same", units).size).toBe(0);
        expect(warn).toHaveBeenCalledOnce();
        expect(fs.readFileSync(path.join(dir, "units.json"), "utf8")).toBe(contents);
    },
);

test("a damaged read list invalidates only its own unit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    storeUnitReads(dir, "same", units, results());
    const file = path.join(dir, "units.json");
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    stored.units["map:one"].reads.pop();
    fs.writeFileSync(file, JSON.stringify(stored));
    const reused = reusableUnitReads(dir, "same", units);
    expect(reused.size).toBe(units.length - 1);
    expect(reused.has("map:one")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("map:one"));
});

test("an incomplete extraction cannot replace previously checked results", () => {
    storeUnitReads(dir, "same", units, results());
    const file = path.join(dir, "units.json");
    const before = fs.readFileSync(file);
    expect(() => storeUnitReads(dir, "changed", units, new Map())).toThrow("Missing");
    expect(() => storeUnitReads(dir, "same", [units[0], units[0]], results())).toThrow("Duplicate");
    const invalid = results();
    invalid.set("map:one", ["999:1"]);
    expect(() => storeUnitReads(dir, "same", units, invalid)).toThrow("invalid");
    expect(fs.readFileSync(file)).toEqual(before);
});

test("a failed atomic write preserves the last checked manifest", () => {
    storeUnitReads(dir, "same", units, results());
    const file = path.join(dir, "units.json");
    const before = fs.readFileSync(file);
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
        throw Object.assign(new Error("disk failure"), { code: "EIO" });
    });
    expect(() => storeUnitReads(dir, "changed", units, results())).toThrow("disk failure");
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readdirSync(dir)).toEqual(["units.json"]);
});

test("the execution fingerprint excludes the planner and content resolved into payloads", async () => {
    const read = vi.spyOn(fs, "readFileSync");
    await hashInputs(
        [
            "scripts/cache/slim-cache-worker.ts",
            "scripts/cache/slim-cache-boot.mjs",
            "scripts/cache/slim-unit-cache.ts",
        ],
        ["bun.lock", "tsconfig.json"],
        "full-cache",
    );
    const files = read.mock.calls.map(([file]) => String(file));
    expect(files).toContain("scripts/cache/slim-load.ts");
    expect(files).toContain("src/rs/scene/SceneBuilder.ts");
    expect(files).toContain("src/game/scaperune/squares.ts");
    expect(files).not.toContain("scripts/cache/slim-plan.ts");
    expect(files).not.toContain("src/game/content/weapons.ts");
    expect(files).not.toContain("src/game/content/items.ts");
    expect(files).not.toContain("src/game/content/maps.ts");
}, 30000);
