import { FloatUtil } from "../../../util/FloatUtil";
import { clamp } from "../../../util/MathUtil";
import { DataBuffer } from "../../buffer/DataBuffer";

export class VertexBuffer extends DataBuffer {
    static readonly STRIDE = 12;

    vertexIndices: Map<number, number>;

    constructor(count: number) {
        super(VertexBuffer.STRIDE, count);
        this.vertexIndices = new Map();
    }

    addVertex(
        x: number,
        y: number,
        z: number,
        hsl: number,
        alpha: number,
        u: number,
        v: number,
        textureId: number,
        priority: number,
        reuseVertex: boolean = true,
    ) {
        if (textureId >= 1024) {
            textureId = -1;
        }
        const isTextured = textureId !== -1;
        if (isTextured) {
            // textureId = 119;
            // only light
            hsl &= 127;
            hsl |= (textureId & 0x1ff) << 7;
        }

        const xPos = clamp(x + 0x4000, 0, 0x8000);
        const yPos = clamp(-y + 0x4000, 0, 0x8000);
        const zPos = clamp(z + 0x4000, 0, 0x8000);

        // A face's priority takes 4 bits, for all of OSRS's 0-11 (after SceneBuffer's + 1 for
        // terrain): with 3, a helm's trim and a tiara (7-9) wrapped under the helm or the hair.
        // Alpha gives up its lowest bit for it.
        priority &= 0xf;
        alpha >>= 1;

        const uPacked = clamp(FloatUtil.packFloat11(u), 0, 0x7ff);
        const vPacked = clamp(FloatUtil.packFloat11(v), 0, 0x7ff);

        const v0 = (xPos << 17) | ((uPacked & 0x3f) << 11) | vPacked;

        const v1 = yPos | (hsl << 15) | (Number(isTextured) << 31);

        const v2 =
            (zPos << 17) |
            (alpha << 10) |
            (priority << 6) |
            (((textureId >> 9) & 0x1) << 5) |
            (uPacked >> 6);

        if (reuseVertex) {
            // The product rounds, so two different vertices can share it: reuse the one it
            // names only if it's this vertex, or a corner takes another's place and colour.
            const hash = v0 * v1 * v2;
            const cachedIndex = this.vertexIndices.get(hash);
            if (cachedIndex === undefined) {
                this.vertexIndices.set(hash, this.offset);
            } else if (
                this.view.getInt32(cachedIndex * VertexBuffer.STRIDE, true) === v0 &&
                this.view.getInt32(cachedIndex * VertexBuffer.STRIDE + 4, true) === v1 &&
                this.view.getInt32(cachedIndex * VertexBuffer.STRIDE + 8, true) === v2
            ) {
                return cachedIndex;
            }
        }
        this.ensureSize(1);
        const byteOffset = this.byteOffset();

        this.view.setUint32(byteOffset, v0, true);
        this.view.setUint32(byteOffset + 4, v1, true);
        this.view.setUint32(byteOffset + 8, v2, true);

        return this.offset++;
    }
}
