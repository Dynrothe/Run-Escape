import { BATTLE_FOR_VARROCK, YAMA_SCALE } from "../../scaperune/maps/battleForVarrock";
import { CinematicDef, LairOpeningDef } from "../types";
import { YAMA_RISES_AT } from "../yama";

// Yama wakes (LairDef.opening), as a player steps onto the palace floor: the camera goes up the
// hall to him, small on his throne, and he speaks. Then he does what he does in OSRS as he's
// challenged: he's gone from his throne in a drift of embers, and comes up out of the floor before
// it, full size (his intro, content/yama.ts), as the palace is sealed in fire.

// Yama, seated (npc 15645, as the map's prop), and his going from his throne as his fight begins
// (RuneLite's NPC_YAMA_NONCOMBAT_SUMMON01, which ends with him gone) with its embers (3278,
// VFX_YAMA_NONCOMBAT_SUMMON01). Its sounds, which the game doesn't play from a seq by itself, are
// the seq's own: at frames 13 and 46, of 20 ms each.
const YAMA_NPC = 15645;
const YAMA_SITTING = 12153;
const YAMA_GOES = 12154;
const YAMA_GOES_SPOT = 3278;
const YAMA_GOES_SOUNDS = [
    { at: 0.26, sound: 10227 },
    { at: 0.92, sound: 10235 },
];
// He's embers from 1.1 s in, and gone by 2.2 s
const GOES_FOR = 2.4;

// Tiles over the ground his head's top is at, seated, at YAMA_SCALE
const YAMA_HEAD = 2.5;

const { x: YX, y: YY } = BATTLE_FOR_VARROCK.yama;
const RISE = BATTLE_FOR_VARROCK.yamaRise;

// When things happen, in seconds from when he wakes
const SPEAKS = 2.2;
const SPEAKS_AGAIN = 5;
const GOES = 8.2;
// His intro begins as he's gone: the dark comes down, the seal runs out from where he'll rise, and
// he rises RISES_AT later (BossIntroDef.riseAt), the camera back by then to see him come up
const INTRO = GOES + GOES_FOR;
const RISES_AT = YAMA_RISES_AT;

const cinematic: CinematicDef = {
    seconds: INTRO + 4.2,
    cast: [
        {
            id: "yama",
            npcId: YAMA_NPC,
            seq: YAMA_SITTING,
            x: YX,
            y: YY,
            scale: YAMA_SCALE,
            prop: 0,
            head: YAMA_HEAD,
        },
    ],
    cues: [
        { at: SPEAKS, actor: "yama", say: "Another little judge.", sayFor: 2.6 },
        {
            at: SPEAKS_AGAIN,
            actor: "yama",
            say: "Your Prysin knelt in the end. So will you.",
            sayFor: 3.2,
        },
        { at: GOES, actor: "yama", seq: YAMA_GOES },
        { at: GOES, actor: "yama", spotAnim: YAMA_GOES_SPOT, scale: YAMA_SCALE },
        ...YAMA_GOES_SOUNDS.map(({ at, sound }) => ({ at: GOES + at, actor: "yama", sound })),
        // The empty throne's the map's prop again (MapPropDef.awake)
        { at: INTRO, actor: "yama", gone: true },
    ],
    shots: [
        // From behind the player, as they step onto the floor, up the hall to him on his throne
        { at: 0, player: true },
        { at: 2.2, x: YX, y: YY - 0.4, lift: 1.7, pitch: -170, yaw: 0, distance: 6, hold: true },
        { at: GOES, x: YX, y: YY - 0.2, lift: 1.7, pitch: -175, yaw: 0, distance: 5.4 },
        {
            at: INTRO,
            x: YX,
            y: YY - 0.2,
            lift: 1.6,
            pitch: -185,
            yaw: 0,
            distance: 6.2,
            hold: true,
        },
        // Back, to the floor before the throne, as he comes up out of it full size (about five
        // tiles tall) and the fire runs round the palace, then in on him a little. Looking down,
        // as the run's camera does: level, it sees half the city (110k triangles on a phone, to 69k)
        {
            at: INTRO + RISES_AT,
            x: RISE.x,
            y: RISE.y + 0.5,
            lift: 3.5,
            pitch: -370,
            yaw: 0,
            distance: 13,
        },
        {
            at: INTRO + 3.2,
            x: RISE.x,
            y: RISE.y + 0.5,
            lift: 4,
            pitch: -360,
            yaw: 0,
            distance: 12,
            hold: true,
        },
        { at: INTRO + 4.2, player: true },
    ],
};

export const YAMA_WAKES: LairOpeningDef = { cinematic, introAt: INTRO };
