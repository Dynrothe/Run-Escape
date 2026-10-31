// What the game and the co-op relay (server/coop-relay.mjs) say to each other,
// as JSON over a WebSocket
import { CoopAction, FrameEvent } from "../../core/lockstep";

// What a player brings to a run from their save, for everyone's copy of it
export type Loadout = {
    metaStats: Record<string, number>;
    unlockedItems: string[];
    armoury: Record<string, number>;
};

export type MemberView = {
    id: string;
    name: string;
    characterId: string;
    ready: boolean;
    loadout?: Loadout;
};

export type RoomView = {
    code: string;
    // Listed for anyone to join, or invite only (by its code)
    open: boolean;
    hostId: string;
    mapId: string;
    endless: boolean;
    // A run is under way
    started: boolean;
    members: MemberView[];
};

// An open room, as the list of them shows it
export type RoomListing = {
    code: string;
    host: string;
    players: number;
    max: number;
    mapId: string;
    endless: boolean;
};

// Everything a player's copy of the run needs, from the host, in the order
// the heroes go
export type GameStart = {
    seed: number;
    mapId: string;
    endless: boolean;
    heroes: { id: string; name: string; characterId: string; loadout: Loadout }[];
};

// Why a player is out of a room
export type GoneReason = "left" | "kicked" | "disbanded" | "hostLeft";

// A guest to the host: a move, something they did, or that their copy of the
// run is ready to go (the map's loaded)
export type UpMessage = { move: [number, number] } | { action: CoopAction } | { loaded: true };

// The host to everyone: the frames up to `upTo` are out, with what happened
// at them, and now and then a check that everyone's run still agrees
export type DownMessage = {
    upTo: number;
    events: FrameEvent[];
    hash?: [number, number];
};

export type ClientMessage =
    | { t: "ping" }
    // A page of the open rooms (0 for the first), size to a page
    | { t: "list"; page?: number; size?: number }
    | {
          t: "create";
          open: boolean;
          mapId: string;
          endless: boolean;
          me: Partial<MemberView>;
      }
    | { t: "join"; code: string; me: Partial<MemberView> }
    | { t: "leave" }
    | ({ t: "me" } & Partial<Omit<MemberView, "id">>)
    | { t: "settings"; open?: boolean; mapId?: string; endless?: boolean }
    | { t: "kick"; id: string }
    | { t: "disband" }
    | { t: "start"; game: GameStart }
    | { t: "end" }
    | { t: "up"; d: UpMessage }
    | { t: "down"; d: DownMessage };

export type ServerMessage =
    | { t: "welcome"; id: string }
    | { t: "pong" }
    // A page of the open rooms, which page it is (the last, if the one asked
    // for has gone), of how many, and how many rooms in all
    | { t: "rooms"; rooms: RoomListing[]; page: number; pages: number; total: number }
    | { t: "room"; room: RoomView; you: string }
    | { t: "gone"; reason: GoneReason }
    | { t: "error"; message: string }
    | { t: "start"; game: GameStart }
    | { t: "left"; id: string }
    | { t: "up"; from: string; d: UpMessage }
    | { t: "down"; d: DownMessage };
