// Keyboard and wheel input for the game. Listens on the window, so the canvas
// doesn't need focus; keys are dropped when the window loses focus.
export class GameInput {
    private readonly down = new Set<string>();
    private wheel = 0;

    // Called once per press (not repeated while held)
    onPress?: (code: string) => void;
    // Called when the window loses focus or the tab is hidden
    onBlur?: () => void;

    constructor(private readonly wheelTarget: HTMLElement) {
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
        window.addEventListener("blur", this.onWindowBlur);
        document.addEventListener("visibilitychange", this.onVisibilityChange);
        wheelTarget.addEventListener("wheel", this.onWheel, { passive: false });
    }

    dispose(): void {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        window.removeEventListener("blur", this.onWindowBlur);
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        this.wheelTarget.removeEventListener("wheel", this.onWheel);
    }

    isDown(code: string): boolean {
        return this.down.has(code);
    }

    // Movement from WASD / arrow keys as a vector of length 0 or 1, x east and
    // y north.
    getMoveVector(out: { x: number; y: number }): { x: number; y: number } {
        let x = 0;
        let y = 0;
        if (this.isDown("KeyW") || this.isDown("ArrowUp")) y += 1;
        if (this.isDown("KeyS") || this.isDown("ArrowDown")) y -= 1;
        if (this.isDown("KeyD") || this.isDown("ArrowRight")) x += 1;
        if (this.isDown("KeyA") || this.isDown("ArrowLeft")) x -= 1;
        const len = Math.hypot(x, y);
        out.x = len > 0 ? x / len : 0;
        out.y = len > 0 ? y / len : 0;
        return out;
    }

    // Wheel steps since the last call (positive is zooming out)
    takeWheel(): number {
        const wheel = this.wheel;
        this.wheel = 0;
        return wheel;
    }

    private isTyping(event: KeyboardEvent): boolean {
        const target = event.target as HTMLElement | null;
        return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
    }

    private onKeyDown = (event: KeyboardEvent) => {
        if (this.isTyping(event)) {
            return;
        }
        if (event.code.startsWith("Arrow") || event.code === "Space" || event.code === "F3") {
            event.preventDefault();
        }
        if (!this.down.has(event.code)) {
            this.down.add(event.code);
            this.onPress?.(event.code);
        }
    };

    private onKeyUp = (event: KeyboardEvent) => {
        this.down.delete(event.code);
    };

    private onWindowBlur = () => {
        this.down.clear();
        this.onBlur?.();
    };

    private onVisibilityChange = () => {
        if (document.hidden) {
            this.down.clear();
            this.onBlur?.();
        }
    };

    private onWheel = (event: WheelEvent) => {
        event.preventDefault();
        this.wheel += Math.sign(event.deltaY);
    };
}
