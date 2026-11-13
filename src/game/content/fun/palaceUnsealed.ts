import { BATTLE_FOR_VARROCK } from "../../scaperune/maps/battleForVarrock";
import { LairUnsealingDef } from "../types";

// The palace unsealed (LairDef.requires.unsealing), as the second of Yama's generals falls: a
// moment on him going down, then the camera flies to the palace's front steps, ringed in Yama's
// fire since the run began, and the fire dies down flame by flame, out along the steps from their
// middle (GameView.drawLairSeal), before the camera goes back to the player.

// The middle of the palace's seal along its front steps (its row of fire, south of the floor)
const FRONT = {
    x: (BATTLE_FOR_VARROCK.palaceFloor.x0 + BATTLE_FOR_VARROCK.palaceFloor.x1 + 1) / 2,
    y: BATTLE_FOR_VARROCK.palaceFloor.y0 - 1,
};

// When things happen, in seconds from when it's unsealed
const LEAVES = 2.4;
const THERE = 4.6;
// The seal lifts: the steps' flames go out over about two and a half seconds
const LIFTS = 5.4;
const BACK = 10.2;

export const PALACE_UNSEALED: LairUnsealingDef = {
    liftAt: LIFTS,
    // Out from the middle of the front steps, before the camera, and on round the palace
    from: FRONT,
    cinematic: {
        seconds: BACK + 1.8,
        cast: [],
        cues: [],
        shots: [
            // On the player as the general falls
            { at: 0, player: true },
            { at: LEAVES, player: true },
            // Up and away to the palace, its front steps and the fire along them, the palace
            // beyond. Looking down, as the run's camera does, so the city past it is out of the
            // picture (a phone's triangles).
            {
                at: THERE,
                x: FRONT.x,
                y: FRONT.y + 3,
                lift: 0.5,
                pitch: -360,
                yaw: 0,
                distance: 19,
                hold: true,
            },
            // In a little as it goes out
            {
                at: BACK,
                x: FRONT.x,
                y: FRONT.y + 2,
                lift: 0.5,
                pitch: -350,
                yaw: 0,
                distance: 16,
                hold: true,
            },
            { at: BACK + 1.8, player: true },
        ],
    },
};
