import { Sim } from "../../core/Sim";
import {
    CoopAction,
    FrameEvent,
    applyFrameEvent,
    quantizeMove,
    syncHash,
} from "../../core/lockstep";
import { DownMessage, UpMessage } from "./protocol";

// How often the host sends a check of its run, in frames
const HASH_FRAMES = 50;
// The host sends the frames that pass with nothing in them this many at a
// time (25 messages a second instead of 50), and anything with an event in
// it straight away
const QUIET_FRAMES = 2;
// A guest keeps about this many frames in hand, so a late message from the
// host doesn't stop it; with more than that it catches up
export const GUEST_BUFFER_FRAMES = 4;
// The host waits this long at most for everyone's map to load
const LOAD_WAIT_MS = 20_000;

export type CoopLink = {
    sendUp(message: UpMessage): void;
    sendDown(message: DownMessage): void;
};

// Plays a co-op run in lockstep (see core/lockstep.ts). The host steps when
// it likes and says what happened at each frame; a guest steps only as far as
// the host has said, sending what its player does to the host to go in.
export class CoopRun {
    // Frames stepped
    frame = 0;
    // The frames that are out (for a guest, what the host has sent so far)
    private upTo = 0;
    // A guest's events from the host still to apply, in order
    private incoming: FrameEvent[] = [];
    // The host's events for the next frame, and those to send
    private next: FrameEvent[] = [];
    private outgoing: FrameEvent[] = [];
    private outgoingHash?: [number, number];
    // The host's: the frames it's said are out
    private sentUpTo = 0;
    // A guest's checks from the host still to compare
    private hashes = new Map<number, number>();
    private lastMove: [number, number] = [0, 0];
    // The copies have gone apart (it's said once)
    desynced = false;
    // The host's: the guests whose map is still loading, and since when
    private readonly loading: Set<string>;
    private readonly loadStart = Date.now();

    constructor(
        readonly sim: Sim,
        readonly isHost: boolean,
        private readonly link: CoopLink,
        // Hero index by player id
        private readonly heroes: Map<string, number>,
        // The host's own id
        hostId: string,
    ) {
        this.loading = new Set(isHost ? [...heroes.keys()].filter((id) => id !== hostId) : []);
    }

    // The host's: whether it's still waiting for someone's map to load
    get waitingForLoad(): boolean {
        if (this.loading.size > 0 && Date.now() - this.loadStart > LOAD_WAIT_MS) {
            this.loading.clear();
        }
        return this.loading.size > 0;
    }

    // What the local player's pressing, sent on when it changes
    setMove(x: number, y: number): void {
        const move = quantizeMove(x, y);
        if (move[0] === this.lastMove[0] && move[1] === this.lastMove[1]) {
            return;
        }
        this.lastMove = move;
        if (this.isHost) {
            this.next.push({ frame: 0, hero: this.sim.focus, move });
        } else {
            this.link.sendUp({ move });
        }
    }

    // Something the local player did, applied when the frame it's in comes
    act(action: CoopAction): void {
        if (this.isHost) {
            this.next.push({ frame: 0, hero: this.sim.focus, action });
        } else {
            this.link.sendUp({ action });
        }
    }

    // The host's: a guest's input
    receiveUp(from: string, message: UpMessage): void {
        const hero = this.heroes.get(from);
        if (!this.isHost || hero === undefined) {
            return;
        }
        if ("loaded" in message) {
            this.loading.delete(from);
        } else if ("move" in message && Array.isArray(message.move)) {
            const [x, y] = message.move;
            this.next.push({ frame: 0, hero, move: quantizeMove(x / 127, y / 127) });
        } else if ("action" in message && message.action) {
            this.next.push({ frame: 0, hero, action: message.action });
        }
    }

    // The host's: a guest left the game
    playerLeft(id: string): void {
        this.loading.delete(id);
        const hero = this.heroes.get(id);
        if (this.isHost && hero !== undefined) {
            this.next.push({ frame: 0, hero, leave: true });
        }
    }

    // A guest's: the host's frames
    receiveDown(message: DownMessage): void {
        if (this.isHost) {
            return;
        }
        for (const event of message.events) {
            this.incoming.push(event);
        }
        if (message.hash) {
            this.hashes.set(message.hash[0], message.hash[1]);
        }
        this.upTo = Math.max(this.upTo, message.upTo);
    }

    // Whether the next frame can be stepped: always for the host, and for a
    // guest once the host has sent it
    canStep(): boolean {
        return this.isHost ? !this.waitingForLoad : this.frame < this.upTo;
    }

    // A guest's frames in hand
    get behind(): number {
        return this.upTo - this.frame;
    }

    // Steps a frame, applying what happened at it first. Returns the events
    // applied, for the client to follow up the local player's.
    stepFrame(): FrameEvent[] {
        const frame = this.frame + 1;
        let events: FrameEvent[];
        if (this.isHost) {
            events = this.next.map((event) => ({ ...event, frame }));
            this.next = [];
            this.outgoing.push(...events);
        } else {
            let count = 0;
            while (count < this.incoming.length && this.incoming[count].frame <= frame) {
                count++;
            }
            events = this.incoming.splice(0, count);
        }
        for (const event of events) {
            applyFrameEvent(this.sim, event);
        }
        this.sim.step();
        this.frame = frame;
        if (this.isHost) {
            this.upTo = frame;
            if (frame % HASH_FRAMES === 0) {
                this.outgoingHash = [frame, syncHash(this.sim)];
            }
        } else {
            const expected = this.hashes.get(frame);
            if (expected !== undefined) {
                this.hashes.delete(frame);
                if (expected !== syncHash(this.sim) && !this.desynced) {
                    this.desynced = true;
                    console.warn(`Co-op run out of step with the host at frame ${frame}`);
                }
            }
        }
        return events;
    }

    // The host's: sends the frames stepped since last time
    flush(): void {
        if (
            !this.isHost ||
            (this.outgoing.length === 0 && this.upTo - this.sentUpTo < QUIET_FRAMES)
        ) {
            return;
        }
        this.link.sendDown({
            upTo: this.upTo,
            events: this.outgoing,
            ...(this.outgoingHash && { hash: this.outgoingHash }),
        });
        this.outgoing = [];
        this.outgoingHash = undefined;
        this.sentUpTo = this.upTo;
    }
}
