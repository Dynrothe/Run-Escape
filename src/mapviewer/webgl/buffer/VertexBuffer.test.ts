import { describe, expect, test } from "vitest";

import { VertexBuffer } from "./VertexBuffer";

describe("VertexBuffer", () => {
    test("reuses a vertex added before", () => {
        const buffer = new VertexBuffer(8);
        const first = buffer.addVertex(10, -20, 30, 500, 255, 0, 0, -1, 0);
        expect(buffer.addVertex(10, -20, 30, 500, 255, 0, 0, -1, 0)).toBe(first);
        expect(buffer.offset).toBe(1);
    });

    test("doesn't reuse another vertex that its key happens to match", () => {
        // High enough, and black, that the second word is 0: the key (the words' product) is 0
        // for both
        const buffer = new VertexBuffer(8);
        const first = buffer.addVertex(10, 0x4000, 30, 0, 255, 0, 0, -1, 0);
        const second = buffer.addVertex(10, 0x4000, 31, 0, 255, 0, 0, -1, 0);
        expect(second).not.toBe(first);
        const z = (buffer.view.getUint32(second * VertexBuffer.STRIDE + 8, true) >>> 17) - 0x4000;
        expect(z).toBe(31);
    });
});
