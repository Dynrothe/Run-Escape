import { CacheInfo } from "../../cache/CacheInfo";
import { ByteBuffer } from "../../io/ByteBuffer";
import { LocType } from "./LocType";

function cacheInfo(revision: number): CacheInfo {
    return {
        name: `osrs-${revision}`,
        game: "oldschool",
        environment: "live",
        revision,
        timestamp: "2026-11-03T00:00:00Z",
        size: 0,
    };
}

function decode(id: number, hex: string, revision: number): LocType {
    const bytes = new Int8Array(hex.match(/../g)!.map((byte) => parseInt(byte, 16)));
    const buffer = new ByteBuffer(bytes);
    const type = new LocType(id, cacheInfo(revision));
    type.decode(buffer);
    expect(buffer.offset).toBe(bytes.length);
    return type;
}

describe("LocType transforms", () => {
    // Loc 66 in rev 241 (opcode 77, 2 byte ids) and 242 (opcode 97, 3 byte ids)
    it("reads the 3 byte ids of rev 242's opcode 97 as 77's", () => {
        const before = decode(66, "0e020f0215171b1301124d15fdffff0375f775f875f875f800", 241);
        const after = decode(66, "0e020f0215171b1301126115fdffff030075f70075f80075f80075f800", 242);
        expect(after.transformVarbit).toBe(5629);
        expect(after.transformVarp).toBe(-1);
        expect(after.transforms).toEqual([30199, 30200, 30200, 30200, -1]);
        expect(after.transforms).toEqual(before.transforms);
    });

    // Loc 1537's opcode 92 and 98, cut down to two transforms: the default comes before the count
    it("reads rev 242's opcode 98 as 92, default id included", () => {
        const before = decode(1537, "13014b005c2338ffff886f01886e886e00", 241);
        const after = decode(1537, "13014b00622338ffff00886f0100886e00886e00", 242);
        expect(after.transformVarbit).toBe(9016);
        expect(after.transforms).toEqual([34926, 34926, 34927]);
        expect(after.transforms).toEqual(before.transforms);
    });

    // Loc 0 in rev 242
    it("turns a 3 byte id of all ones into -1", () => {
        const after = decode(0, "130161ffff000003ffffffffffffffffff003cec00", 242);
        expect(after.transforms).toEqual([-1, -1, -1, 15596, -1]);
    });

    // Before 242 the two opcodes carry no data
    it("leaves 97 and 98 alone before rev 242", () => {
        const type = decode(0, "616200", 241);
        expect(type.transforms).toBeUndefined();
    });
});
