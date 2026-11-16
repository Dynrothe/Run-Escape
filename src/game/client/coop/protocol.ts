// What the game and the co-op relay (server/coop-relay.mjs) say to each other,
// as JSON over a WebSocket
import { WardrobeLook } from "../../content/wardrobe";
import { CoopAction, FrameEvent } from "../../core/lockstep";

// What a player brings to a run from their save, for everyone's copy of it
export type Loadout = {
    metaStats: Record<string, number>;
    unlockedItems: string[];
    armoury: Record<string, number>;
    // Their pet (pets.ts): looks only, but a fighting one's (PetDef.power) in everyone's sim
    pet?: string;
    // Their body and outfit from the Wardrobe (content/wardrobe.ts), only for looks as well
    look?: WardrobeLook;
    // In a Tombs of Amascut room, their invocations, so a host's raid level shows in the lobby (and
    // in a run's room, its invocation points). Only shown: the start carries the party's
    // (GameStart.invocations), and the relay passes it as is
    invocations?: string[];
    // Their relics (content/relics.ts), the open tiers' picks, for their own hero
    relics?: string[];
    // The raid chests' trophies they've found (isRaidChestTrophy), so their chest only gives ones
    // they haven't got
    trophies?: string[];
    // Playing Card collection only (core/cardRuns.ts): their weapon, passive and gear cards, each
    // at its rarest version owned (encodeCardCaps), which their own level ups and caskets keep to.
    // Only sent when their collection can play such a run.
    cardCaps?: string;
    // The host's on the Cards only tab: the whole room plays Cards only (roomPlaysCardsOnly), each
    // player with their own cards. Only the host's counts.
    cardsOnly?: true;
};

// The maps a player has unlocked, and has endless and hard mode for, which
// rooms go by unless the relay takes anyone (MULTIPLAYER_ANY_MAP)
// A relay from before 0.23.0 sends no hard
export type Unlocks = { maps: string[]; endless: string[]; hard?: string[] };

// Friends (this fork's, on the Node relay only: a relay that has them says so
// with `friends` in its welcome). There are still no accounts. A game keeps a
// secret of its own (client/coop/FriendsStore.ts) and shows it to the relay in
// `hello`; the relay works out a friend code from it, which is what players
// give each other. Two players are friends once each has the other's code in
// the list their game sends (`friends`), and only then does either hear about
// the other. The relay keeps none of it once a player's gone.

// A friend code's length: capitals and digits, from the relay's room code
// alphabet. Shown in groups of four.
export const FRIEND_CODE_LENGTH = 12;
// The codes a game can list as friends
export const MAX_FRIENDS = 200;
// A name a player picks, in characters, and a line of a room's chat
export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;

// A code as typed or pasted ("abcd-efgh jkmn"): the code, or undefined if it
// can't be one
export function parseFriendCode(text: string): string | undefined {
    const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return code.length === FRIEND_CODE_LENGTH ? code : undefined;
}

// A code in groups of four, as it's shown
export function formatFriendCode(code: string): string {
    return code.replace(/(.{4})(?=.)/g, "$1-");
}

// Where a friend is: in the menus, on a run of their own, in a room that's
// waiting, or in a room's run
export type FriendState = "menu" | "solo" | "room" | "run";

// A friend's room. code: only while they could be joined there without asking
// (the room's waiting, and open or for friends); a full one still has it.
export type FriendRoom = {
    code?: string;
    name: string;
    mapId: string;
    endless: boolean;
    hard: boolean;
    players: number;
    max: number;
};

// A friend, as the relay tells it. One who's gone is only { id, online: false }.
export type FriendPresence = {
    id: string;
    online: boolean;
    name?: string;
    state?: FriendState;
    room?: FriendRoom;
};

// A player by their friend code
export type FriendRef = { id: string; name: string };

export type MemberView = {
    id: string;
    // Their friend code, once their game's said who it is (hello)
    friendId?: string;
    // Given by the relay (server/name-gen.mjs), or the one they picked (hello, name)
    name: string;
    characterId: string;
    ready: boolean;
    loadout?: Loadout;
    unlocks?: Unlocks;
    // The build their game is (__BUILD_ID__): a room only takes the host's
    build?: string;
    // Where they're playing from, for their flag: ISO 3166's two letters
    // ("FI"). Only a relay that knows it (Cloudflare's, or one behind it)
    // sends it, and not for a player who's hidden it.
    country?: string;
};

// What a player says about themselves: everything but their id, name and
// country, which the relay gives. hideCountry: keep their flag to themselves.
export type Member = Omit<MemberView, "id" | "name" | "country"> & { hideCountry?: boolean };

// What a player's missing to play on a room's map: the map (its endless or
// hard mode too, for a room that's on them), and who, when it's someone else
export type MissingMap = { mapId: string; endless: boolean; hard: boolean; who?: string };

export type RoomView = {
    code: string;
    // Given by the relay when the room's made, like a player's
    name: string;
    // Listed for anyone to join, or invite only (by its code)
    open: boolean;
    // For friends: not listed, but a friend of anyone in it sees its code and
    // can join. An open room is for friends too, whatever this says.
    friends?: boolean;
    hostId: string;
    mapId: string;
    endless: boolean;
    hard: boolean;
    // A run is under way
    started: boolean;
    members: MemberView[];
};

// An open room, as the list of them shows it
export type RoomListing = {
    code: string;
    name: string;
    host: string;
    // The relay's measured country when countrySource is "server".
    // Older/Node relays send the host player's country (see MemberView).
    country?: string;
    countrySource?: "server";
    players: number;
    max: number;
    mapId: string;
    endless: boolean;
    hard: boolean;
};

// Everything a player's copy of the run needs, from the host, in the order
// the heroes go
export type GameStart = {
    seed: number;
    mapId: string;
    endless: boolean;
    hard: boolean;
    // An act's map: the host's step (content/acts.ts), which everyone plays at
    actStep?: number;
    // A fight in parts (MapDef.stages): which, the host's next
    stage?: number;
    // The Tombs of Amascut: the host's invocations, the party's raid level; or a run's, the host's
    // (Sim cleans the ids by the map's board)
    invocations?: string[];
    // A run's remixes (content/remixes.ts), the host's; the Sim keeps those the map takes
    remixes?: string[];
    // Awakened invasions are open for the host (content/invasions.ts): the run rolls by its seed
    invasions?: boolean;
    // The weekly Vault's run: its week (content/vault.ts); the seed and the rest are its
    vault?: string;
    heroes: { id: string; name: string; characterId: string; loadout: Loadout }[];
};

// Whether a start from the host is one every game could play: a modified one
// could send anything
export function isGameStart(value: unknown, maxParty: number): value is GameStart {
    const game = value as GameStart | undefined;
    return (
        !!game &&
        typeof game === "object" &&
        Number.isSafeInteger(game.seed) &&
        typeof game.mapId === "string" &&
        typeof game.endless === "boolean" &&
        typeof game.hard === "boolean" &&
        (game.actStep === undefined || (Number.isSafeInteger(game.actStep) && game.actStep >= 0)) &&
        (game.stage === undefined || Number.isSafeInteger(game.stage)) &&
        (game.invocations === undefined ||
            (Array.isArray(game.invocations) &&
                game.invocations.length <= 100 &&
                game.invocations.every((id) => typeof id === "string" && id.length <= 64))) &&
        (game.remixes === undefined ||
            (Array.isArray(game.remixes) &&
                game.remixes.length <= 8 &&
                game.remixes.every((id) => typeof id === "string" && id.length <= 32))) &&
        (game.invasions === undefined || typeof game.invasions === "boolean") &&
        (game.vault === undefined || (typeof game.vault === "string" && game.vault.length <= 16)) &&
        Array.isArray(game.heroes) &&
        game.heroes.length > 0 &&
        game.heroes.length <= maxParty &&
        game.heroes.every(
            (hero) =>
                !!hero &&
                typeof hero === "object" &&
                typeof hero.id === "string" &&
                typeof hero.name === "string" &&
                hero.name.length <= 64 &&
                typeof hero.characterId === "string",
        ) &&
        new Set(game.heroes.map((hero) => hero.id)).size === game.heroes.length
    );
}

// Why a player is out of a room
// (idle: nothing happened in the room for half an hour)
export type GoneReason = "left" | "kicked" | "disbanded" | "hostLeft" | "idle";

// A guest to the host: a move, something they did, or that their copy of the
// run is ready to go (the map's loaded)
export type UpMessage =
    | { move: [number, number]; moveSeq?: number }
    | { action: CoopAction; actionSeq?: number }
    | { loaded: true }
    // The frames after this one again: some of the host's went missing (a
    // dropped connection)
    | { resend: number }
    // This guest's run stopped matching the host's at this frame, and it's
    // leaving. For the relay (server/coop-checks.mjs): the host does nothing.
    | { outOfStep: number };

// The host to everyone: the frames up to `upTo` are out, with what happened
// at them, and now and then a check that everyone's run still agrees
export type DownMessage = {
    // The frames before were in the message before this one, so a guest can
    // tell when one's gone missing
    from?: number;
    upTo: number;
    events: FrameEvent[];
    hash?: [number, number];
    // Wall-clock time until the next automatic choice, for display only.
    decisionMs?: number;
};

export type ClientMessage =
    | { t: "ping" }
    // A page of the open rooms (0 for the first), size to a page
    | { t: "list"; page?: number; size?: number }
    // Who this game is, once a connection and before anything else on it.
    // secret: 32 to 128 of A-Z a-z 0-9 _ -. name: the one they picked, cleaned
    // by the relay. presence: this connection is the one that hears about
    // friends (client/coop/Friends.ts), kept open in the menus and through
    // runs, so the relay doesn't close it for sitting idle. Answered with
    // `identity`.
    | { t: "hello"; secret: string; name?: string; presence?: true }
    // A name of their own choosing (not during a run). Answered with `named`.
    | { t: "name"; name: string }
    // Every friend code this game has, whenever the list changes. Answered
    // with a full `presence`.
    | { t: "friends"; ids: string[] }
    // On a run of their own, or back from it (the presence connection's)
    | { t: "status"; solo: boolean }
    // Ask a friend into the room this connection's in
    | { t: "invite"; to: string }
    // No thanks, to an invite to this room from this friend
    | { t: "decline"; to: string; code: string }
    // A line for the room's chat
    | { t: "chat"; text: string }
    | {
          t: "create";
          open: boolean;
          friends?: boolean;
          mapId: string;
          endless: boolean;
          hard: boolean;
          me: Partial<Member>;
      }
    | { t: "join"; code: string; me: Partial<Member> }
    | { t: "leave" }
    | ({ t: "me"; meSeq?: number } & Partial<Member>)
    // A new name, from the relay (not during a run)
    | { t: "rename" }
    | {
          t: "settings";
          open?: boolean;
          friends?: boolean;
          mapId?: string;
          endless?: boolean;
          hard?: boolean;
      }
    | { t: "kick"; id: string }
    | { t: "disband" }
    | { t: "start"; game: GameStart }
    | { t: "end" }
    | { t: "up"; d: UpMessage }
    | { t: "down"; d: DownMessage };

export type ServerMessage =
    // name: the one the relay's given this player. anyMap: rooms take players
    // whatever maps they have. country: theirs, as others see it on their
    // flag, if the relay knows it.
    | {
          t: "welcome";
          id: string;
          name: string;
          anyMap?: boolean;
          country?: string;
          // The open rooms come again whenever they change, without asking
          listUpdates?: boolean;
          // The relay has friends: hello, friends, invite, chat and the rest
          friends?: true;
      }
    // Who the relay takes this game for, after its hello: its friend code,
    // and its name as others will see it
    | { t: "identity"; friendId: string; name: string }
    // How friends are. full: every friend who's on, in answer to `friends`, so
    // anyone it leaves out is off (or hasn't this player's code in their own
    // list). Otherwise only those who've changed.
    | { t: "presence"; friends: FriendPresence[]; full?: true }
    // This player has listed yours as a friend, and you haven't theirs. Once
    // for each connection of yours.
    | { t: "friendRequest"; from: FriendRef }
    // A friend's asked you into their room
    | { t: "invited"; from: FriendRef; room: FriendRoom & { code: string } }
    // Your invite reached this friend's game
    | { t: "inviteSent"; to: string }
    // A friend's said no to your invite
    | { t: "declined"; from: FriendRef }
    // A line of the room's chat, from this member (their id in the room), to
    // everyone in it, whoever said it too
    | { t: "chat"; from: string; text: string }
    // This player's new name, after asking for one
    | { t: "named"; name: string }
    | { t: "pong" }
    // A page of the open rooms, which page it is (the last, if the one asked
    // for has gone), of how many, and how many rooms in all
    | {
          t: "rooms";
          rooms: RoomListing[];
          page: number;
          pages: number;
          total: number;
          // Every room the relay can hold is taken
          full: boolean;
      }
    // token: to come back to the room with, should the connection drop (the
    // Cloudflare relay's; coop/room/<code>?resume=<token>)
    | {
          t: "room";
          room: RoomView;
          you: string;
          token?: string;
          // Supports numbered member changes, acknowledged in room updates.
          memberAcks?: true;
          meSeq?: number;
      }
    // The relay keeps each room on its own connection (the Cloudflare relay,
    // server/cloudflare): make or join it there, at coop/room/<code>, with
    // this ticket. The Node relay never sends it.
    | { t: "goto"; code: string; ticket: string }
    | { t: "gone"; reason: GoneReason }
    | { t: "error"; message: string; need?: MissingMap }
    | { t: "start"; game: GameStart }
    | { t: "left"; id: string }
    | { t: "up"; from: string; d: UpMessage }
    | { t: "down"; d: DownMessage };
