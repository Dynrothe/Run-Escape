import { BATTLE_FOR_VARROCK, YAMA_SCALE } from "../../scaperune/maps/battleForVarrock";
import { CinematicActorDef, CinematicCueDef, CinematicDef } from "../types";

// The Battle for Varrock's opening (MapDef.cinematic): close on Yama on his throne, the camera
// pulls back and up to Sir Prysin and the palace guard stood before him, Prysin defies him, Yama
// snaps his fingers and they die where they stand, and the camera flies south over the burnt city
// to Justiciar Zachariah outside the south gate.

// Yama, seated (npc 15645, as the map's prop), and his finger click from the cutscenes: the snap
// is halfway through it, with its sound (10235, the seq's own at frame 90) and his hand's spot
// animation (3287, which plays seq 12168 alongside)
const YAMA_NPC = 15645;
const YAMA_SITTING = 12153;
const YAMA_CLICK = 12167;
const YAMA_CLICK_SPOT = 3287;
const YAMA_CLICK_SOUND = 10235;
const CLICK_SNAPS_AT = 1.8;
// Sir Prysin with Silverlight (5084) and the Varrock guards as OSRS has them now (11911 to 11913),
// on the player's skeleton, standing ready
const PRYSIN = 5084;
const GUARDS = [11911, 11912, 11913];
const STANDING = 808;
// Leagues IV: Trailblazer Reloaded's death (the death scroll's): the player's death animation
// (10629, frames on the player's skeleton) and its spot animation (2610), which burn them away to
// their feet
const TRAILBLAZER_DEATH = 10629;
const TRAILBLAZER_DEATH_SPOT = 2610;

// Tiles over the ground his head's top is at, seated, at YAMA_SCALE
const YAMA_HEAD = 2.5;

// Facing north, up the palace to his throne (props face south at 0)
const NORTH = 1024;

const { x: YX, y: YY } = BATTLE_FOR_VARROCK.yama;
const SPAWN = BATTLE_FOR_VARROCK.spawn;

// When things happen, in seconds. Each line's up for its reading time and a beat.
const PRYSIN_SPEAKS = 7.8;
const YAMA_ANSWERS = 12.6;
const CLICK = 13.6;
const SNAP = CLICK + CLICK_SNAPS_AT;
// They burn a moment after the snap, as the camera's back on them, each a little after the last,
// Prysin first
const DEATHS = SNAP + 0.5;
const DEATH_STAGGER = 0.14;

// Sir Prysin before the throne, his guard in a line behind him: where each stands, from Yama's
// middle (tiles)
const LINE: { id: string; npcId: number; dx: number; dy: number }[] = [
    { id: "prysin", npcId: PRYSIN, dx: 0, dy: -5.6 },
    { id: "guard1", npcId: GUARDS[0], dx: -1.9, dy: -6.6 },
    { id: "guard2", npcId: GUARDS[1], dx: 1.9, dy: -6.6 },
    { id: "guard3", npcId: GUARDS[2], dx: -3.6, dy: -7.4 },
    { id: "guard4", npcId: GUARDS[0], dx: 3.6, dy: -7.4 },
];

const cast: CinematicActorDef[] = [
    {
        id: "yama",
        npcId: YAMA_NPC,
        seq: YAMA_SITTING,
        x: YX,
        y: YY,
        scale: YAMA_SCALE,
        prop: 0,
        // Just over his head as he sits (his model's top is his throne's back)
        head: YAMA_HEAD,
    },
    ...LINE.map(({ id, npcId, dx, dy }) => ({
        id,
        npcId,
        seq: STANDING,
        x: YX + dx,
        y: YY + dy,
        yaw: NORTH,
    })),
];

// The order they fall in: Prysin, then outwards along the line
const FALL_ORDER = ["prysin", "guard1", "guard2", "guard3", "guard4"];

const cues: CinematicCueDef[] = [
    { at: 0.5, actor: "yama", say: "Resistance is futile.", sayFor: 3.4 },
    {
        at: PRYSIN_SPEAKS,
        actor: "prysin",
        say: "In the name of King Roald, Varrock will not fall to you, demon!",
        sayFor: 4.4,
    },
    { at: YAMA_ANSWERS, actor: "yama", say: "Pathetic.", sayFor: 2.8 },
    { at: CLICK, actor: "yama", seq: YAMA_CLICK },
    { at: CLICK, actor: "yama", spotAnim: YAMA_CLICK_SPOT, scale: YAMA_SCALE },
    { at: SNAP, actor: "yama", sound: YAMA_CLICK_SOUND },
    // Back to sitting once he's done
    { at: CLICK + 3.6, actor: "yama", seq: YAMA_SITTING, loop: true },
    ...FALL_ORDER.flatMap((actor, i): CinematicCueDef[] => {
        const at = DEATHS + i * DEATH_STAGGER;
        return [
            { at, actor, seq: TRAILBLAZER_DEATH },
            { at, actor, spotAnim: TRAILBLAZER_DEATH_SPOT },
        ];
    }),
];

export const VARROCK_OPENING: CinematicDef = {
    seconds: 24.3,
    cast,
    cues,
    shots: [
        // Close on him, face to face, drifting back a little as he speaks. Looking down a little,
        // so the city beyond the palace is out of the picture (a phone's triangles)
        { at: 0, x: YX, y: YY, lift: 1.7, pitch: -160, yaw: 0, distance: 4.4 },
        { at: 3.6, x: YX, y: YY - 0.2, lift: 1.7, pitch: -175, yaw: 0, distance: 5.2 },
        // Back and up over the guard, then down to them, the throne beyond
        { at: 6.2, x: YX, y: YY - 3.5, lift: 1.2, pitch: -340, yaw: 0, distance: 13 },
        { at: 8, x: YX, y: YY - 4, lift: 1, pitch: -290, yaw: 0, distance: 11, hold: true },
        { at: 11.6, x: YX, y: YY - 4, lift: 1, pitch: -280, yaw: 0, distance: 10.5 },
        // In to him as he answers, held on his hand as he clicks his fingers
        { at: 13, x: YX, y: YY, lift: 1.8, pitch: -165, yaw: 0, distance: 5, hold: true },
        { at: SNAP, x: YX, y: YY, lift: 1.8, pitch: -170, yaw: 0, distance: 5.4, hold: true },
        // Back out to watch them burn, then up and away over the city
        { at: DEATHS + 0.3, x: YX, y: YY - 4, lift: 1, pitch: -310, yaw: 0, distance: 10.5 },
        { at: 18.6, x: YX, y: YY - 5.5, lift: 0.5, pitch: -330, yaw: 0, distance: 13 },
        { at: 20.2, x: YX, y: YY - 20, lift: 0, pitch: -420, yaw: 0, distance: 18 },
        { at: 22.4, x: SPAWN.x, y: SPAWN.y + 20, lift: 0, pitch: -410, yaw: 0, distance: 18 },
        // Down behind Zachariah, facing into the city as he does, and the run's begun
        { at: 24.3, player: true },
    ],
};
