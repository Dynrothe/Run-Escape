// Only the runtime base class is replaced in unit tests; the room logic is real.
export class DurableObject {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
    }
}
