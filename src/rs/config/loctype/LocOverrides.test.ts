import {
    CHARRED_LOCS,
    DERIVED_LOCS,
    WALKABLE_CHARRED_LOCS,
    getCharredLoc,
    getLocBase,
    getLocOverride,
    getWalkableLoc,
} from "./LocOverrides";

// Locs of our own made from the cache's (LocOverrides.ts): charred, walkable, and both, each read
// from the cache loc it's made from, every id under 2^21 (the model caches key a loc by id << 10)

describe("loc overrides", () => {
    it("charred and walkable copies are read from the loc they're made from", () => {
        const id = 25156;
        expect(getLocBase(id)).toBe(id);
        expect(getLocOverride(id)).toBeUndefined();

        const charred = getCharredLoc(id);
        expect(getLocBase(charred)).toBe(id);
        expect(getLocOverride(charred)).toEqual({ base: id, charred: true });

        const walkable = getWalkableLoc(id);
        expect(getLocBase(walkable)).toBe(id);
        expect(getLocOverride(walkable)).toEqual({ base: id, walkable: true });

        const both = getWalkableLoc(charred);
        expect(getLocBase(both)).toBe(id);
        expect(getLocOverride(both)).toEqual({ base: id, charred: true, walkable: true });

        expect(new Set([id, charred, walkable, both]).size).toBe(4);
        for (const loc of [charred, walkable, both]) {
            expect(loc).toBeLessThan(2 ** 21);
        }
    });

    it("keeps the highest cache id's copies under 2^21, clear of each other", () => {
        // Every cache id: as many as there are charred ones
        const last = DERIVED_LOCS - CHARRED_LOCS - 1;
        const walkable = getWalkableLoc(last);
        const both = getWalkableLoc(getCharredLoc(last));
        expect(walkable).toBe(WALKABLE_CHARRED_LOCS - 1);
        expect(both).toBe(2 ** 21 - 1);
        expect(getLocOverride(walkable)).toEqual({ base: last, walkable: true });
        expect(getLocOverride(both)).toEqual({ base: last, charred: true, walkable: true });
    });

    it("won't make a walkable copy of anything but a cache loc or a charred one", () => {
        expect(() => getWalkableLoc(DERIVED_LOCS)).toThrow(/isn't the cache's/);
        expect(() => getWalkableLoc(DERIVED_LOCS - CHARRED_LOCS)).toThrow(/isn't the cache's/);
        expect(() => getWalkableLoc(getWalkableLoc(5))).toThrow(/isn't the cache's/);
    });
});
