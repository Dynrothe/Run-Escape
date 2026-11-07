import { CinematicDef, CinematicShotDef, LightLook } from "../../content/types";

// Beneath Cursed Sands' entrances: each of its four fights' own cinematic (MapDef.stages'
// cinematic), played as that fight's run starts and not on a retry. Each boss stands where it
// will rise, in the arena's middle, and says its piece. The camera then pulls back up and goes
// behind the player, and the run starts on that last move. The stand-in goes in a burst of sand
// or shadow as the run starts, and the boss itself rises there under its intro
// (BossIntroDef: rise in content/cursedSands.ts), so it never stands there twice.
//
// The ids are the fights' own (content/cursedSands.ts), so they're baked and loaded already. Spot
// animations play at their own size times scale, and the shadow spells and lightning spread a
// long way as they play (SPREADS there), so they're kept small with the camera this close.

// The bosses
const COENUS = 11529;
const SCARAB_MAGE = 11508;
const CHAMPION = 11483;
const AKH = 11493;
// Standing: the guards' and the mages' rig, the Champion's, the Akh's
const GUARD_IDLE = 813;
const HUMAN_IDLE = 808;
const AKH_IDLE = 9426;
// Coenus's thrust; a mage's cast and their god spell; the Champion's barrage cast; the Akh calling
// down the storm, and her spear
const THRUST_SEQ = 2080;
const CAST_SEQ = 1162;
const GOD_SPELL = 811;
const BURST_SEQ = 1979;
const AKH_CALL = 9423;
const AKH_SPEAR = 9427;
// Dust thrown up, a swirl of sand, a scarab swarm, shadow, and Akkha's lightning
const BLOWN_DUST = 2184;
const SAND = 2255;
const SCARAB_SWARM = 2153;
const SHADOW_BURST = 382;
const SHADOW_BARRAGE = 383;
const LIGHTNING = 2256;

// Facing south, down the arena at the player
const SOUTH = 0;
// Shots turn the camera gently: under about 30 degrees a shot, and no faster than
// MAX_CINEMATIC_TURN (Cinematic.test.ts), as a quick swing round makes people dizzy. Yaw isn't
// wrapped between shots, so a small turn the other way is negative, never near 2048.

// A light on each boss so it reads in the tomb's dim: torchlight on the people, shadow's violet on
// the Champion, the storm's blue-white on the Akh
const TORCH: LightLook = { radius: 4, color: 0xffc070, intensity: 0.45, flicker: 0.15 };
const SHADOW: LightLook = { radius: 4, color: 0x9a7ad0, intensity: 0.4 };
const STORM: LightLook = {
    radius: 5,
    color: 0xcfdcff,
    intensity: 0.5,
    pulse: { amount: 0.3, seconds: 1.2 },
};

type Tile = { x: number; y: number };

// The closing moves every entrance shares: from close on the boss at from, up over the arena from
// behind the player, then the run's own camera at end
function closing(boss: Tile, from: number, end: number): CinematicShotDef[] {
    return [
        { at: from, x: boss.x, y: boss.y - 4, lift: 1, pitch: -400, yaw: 0, distance: 13 },
        { at: end, player: true },
    ];
}

// The four, in the stages' order. middle: where each boss rises (the arena's middle).
export function createSandsEntrances(middle: Tile): CinematicDef[] {
    const m = { x: middle.x, y: middle.y };
    const left = { x: m.x - 2.5, y: m.y + 1 };
    const right = { x: m.x + 2.5, y: m.y + 1.5 };
    return [
        // Coenus: the Head Menaphite Guard bars the way, and shows you his spear
        {
            seconds: 9,
            cast: [
                { id: "coenus", npcId: COENUS, seq: GUARD_IDLE, ...m, yaw: SOUTH, light: TORCH },
            ],
            cues: [
                {
                    at: 0.5,
                    actor: "coenus",
                    say: "Halt! This tomb is closed to the living.",
                    sayFor: 3,
                },
                { at: 3.6, actor: "coenus", seq: THRUST_SEQ },
                { at: 3.9, actor: "coenus", spotAnim: BLOWN_DUST, scale: 1.5 },
                { at: 4.4, actor: "coenus", say: "Turn back, or meet my spear.", sayFor: 2.4 },
                { at: 6.8, actor: "coenus", spotAnim: BLOWN_DUST, scale: 2 },
                { at: 7, actor: "coenus", gone: true },
            ],
            shots: [
                { at: 0, ...m, lift: 1.5, pitch: -200, yaw: SOUTH, distance: 4 },
                { at: 3.2, ...m, lift: 1.2, pitch: -250, yaw: 160, distance: 5.5, hold: true },
                ...closing(m, 7, 9),
            ],
        },
        // The Scarab Mages: the elder sets its apprentice on you and goes to watch, to come back
        // in the fight's twentieth second
        {
            seconds: 10.5,
            cast: [
                { id: "mage", npcId: SCARAB_MAGE, seq: GUARD_IDLE, ...m, yaw: SOUTH, light: TORCH },
                {
                    id: "elder",
                    npcId: SCARAB_MAGE,
                    seq: GUARD_IDLE,
                    ...right,
                    yaw: SOUTH - 200,
                    light: TORCH,
                },
            ],
            cues: [
                {
                    at: 0.5,
                    actor: "elder",
                    say: "Another thief, come for Scabaras's gold.",
                    sayFor: 3,
                },
                { at: 3.4, actor: "mage", seq: CAST_SEQ },
                { at: 3.5, actor: "mage", spotAnim: SCARAB_SWARM },
                { at: 3.8, actor: "mage", say: "Leave it to me, elder.", sayFor: 2.4 },
                { at: 6.2, actor: "elder", say: "I shall watch.", sayFor: 1.6 },
                { at: 6.6, actor: "elder", seq: GOD_SPELL },
                { at: 6.8, actor: "elder", spotAnim: SAND, scale: 1.5 },
                { at: 7.6, actor: "elder", gone: true },
                { at: 8.3, actor: "mage", spotAnim: SAND, scale: 1.5 },
                { at: 8.5, actor: "mage", gone: true },
            ],
            shots: [
                { at: 0, ...right, lift: 1.5, pitch: -210, yaw: 120, distance: 4.5 },
                { at: 3, ...m, lift: 1.2, pitch: -240, yaw: SOUTH, distance: 5, hold: true },
                { at: 6, ...right, lift: 1.2, pitch: -260, yaw: 120, distance: 5.5, hold: true },
                ...closing(m, 8.5, 10.5),
            ],
        },
        // The Champion of Scabaras: wreathed in shadow, the god's chosen passes judgement
        {
            seconds: 9.5,
            cast: [
                {
                    id: "champion",
                    npcId: CHAMPION,
                    seq: HUMAN_IDLE,
                    ...m,
                    yaw: SOUTH,
                    light: SHADOW,
                },
            ],
            cues: [
                { at: 0.3, actor: "champion", spotAnim: SHADOW_BARRAGE, scale: 0.35 },
                { at: 1.2, actor: "champion", say: "Scabaras chose me.", sayFor: 2.4 },
                { at: 4, actor: "champion", seq: BURST_SEQ },
                { at: 4.3, actor: "champion", spotAnim: SHADOW_BURST, scale: 0.8 },
                { at: 4.6, actor: "champion", say: "And Scabaras will judge you.", sayFor: 2.6 },
                { at: 7.3, actor: "champion", spotAnim: SHADOW_BARRAGE, scale: 0.45 },
                { at: 7.5, actor: "champion", gone: true },
            ],
            shots: [
                { at: 0, ...m, lift: 0.6, pitch: -120, yaw: SOUTH, distance: 3.5 },
                { at: 3.6, ...m, lift: 1.2, pitch: -230, yaw: -160, distance: 5.5, hold: true },
                ...closing(m, 7.5, 9.5),
            ],
        },
        // The Menaphite Akh: the storm called down, and its spear turned on you
        {
            seconds: 10,
            cast: [{ id: "akh", npcId: AKH, seq: AKH_IDLE, ...m, yaw: SOUTH, light: STORM }],
            cues: [
                { at: 0.6, actor: "akh", seq: AKH_CALL },
                { at: 1.2, actor: "akh", spotAnim: LIGHTNING, scale: 1 },
                {
                    at: 1.6,
                    actor: "akh",
                    say: "The sands are mine, and the storm with them.",
                    sayFor: 3.2,
                },
                { at: 5, actor: "akh", seq: AKH_SPEAR },
                { at: 5.4, actor: "akh", spotAnim: BLOWN_DUST, scale: 2 },
                { at: 5.6, actor: "akh", say: "Kneel, and be buried.", sayFor: 2.2 },
                { at: 7.8, actor: "akh", spotAnim: LIGHTNING, scale: 1.2 },
                { at: 8, actor: "akh", gone: true },
            ],
            shots: [
                { at: 0, ...m, lift: 2, pitch: -160, yaw: SOUTH, distance: 6 },
                { at: 4.4, ...left, lift: 1.4, pitch: -240, yaw: 150, distance: 6, hold: true },
                ...closing(m, 8, 10),
            ],
        },
    ];
}
