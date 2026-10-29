import { vec4 } from "gl-matrix";

import { Camera } from "../../mapviewer/Camera";
import { pixelRatio } from "../../util/DeviceUtil";

const temp = vec4.create();

export type ScreenPoint = { x: number; y: number; visible: boolean };

// A 2D canvas over the 3D view, sized to the same pixels, for things drawn in
// screen space at world positions (health bars, hitsplats, debug views).
export class Overlay {
    readonly ctx: CanvasRenderingContext2D;
    width = 0;
    height = 0;
    private camera?: Camera;

    constructor(readonly canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext("2d")!;
    }

    // Clears the canvas and remembers this frame's camera for project().
    begin(camera: Camera): void {
        const width = Math.round(this.canvas.offsetWidth * pixelRatio);
        const height = Math.round(this.canvas.offsetHeight * pixelRatio);
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.width = width;
        this.height = height;
        this.camera = camera;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, width, height);
    }

    // World position (x/z tiles, y tiles with up negative) to canvas pixels.
    project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
        const camera = this.camera;
        if (!camera) {
            out.visible = false;
            return out;
        }
        vec4.set(temp, x, y, z, 1);
        vec4.transformMat4(temp, temp, camera.viewProjMatrix);
        const w = temp[3];
        if (w <= 0) {
            out.visible = false;
            return out;
        }
        out.x = ((temp[0] / w + 1) / 2) * this.width;
        out.y = ((1 - temp[1] / w) / 2) * this.height;
        out.visible =
            out.x > -64 && out.y > -64 && out.x < this.width + 64 && out.y < this.height + 64;
        return out;
    }
}
