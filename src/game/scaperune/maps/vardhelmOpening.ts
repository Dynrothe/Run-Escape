import { CinematicDef, MapPropDef } from "../../content/types";

// Vardhelm's opening (MapDef.cinematic), to show what a cinematic can do on a dev map: at the
// keep's door, high in the walled city, King Arthur shuts the gates against the trolls, a knight
// of his guard bows, and Merlin teleports off to find a champion. Then the camera flies down the
// mountain to the player in the Vale, facing up it.
//
// Positions are in the recipe's own tiles (vardhelm.ts), made world tiles by at.

// The cast, from the cache: all on the player's skeleton, so the player's animations play on them
const KING_ARTHUR = 3531;
const SIR_LANCELOT = 3519;
const SIR_GAWAIN = 3520;
const MERLIN = 3529;
const IDLE = 808;
const BOW = 858;
// The standard teleport, its spot animation and teleport_vwoop (the Wise Old Man's)
const TELEPORT = 714;
const TELEPORT_SPOTANIM = 111;
const TELEPORT_SOUND = 200;

// Facing south (towards the camera coming up the avenue), and the knights a little inwards
const SOUTH = 0;

export function createVardhelmOpening(
    mapX: number,
    mapY: number,
    spawn: { x: number; y: number },
): { props: MapPropDef[]; cinematic: CinematicDef } {
    const at = (x: number, y: number) => ({ x: mapX * 64 + x, y: mapY * 64 + y });
    const king = at(206, 282);
    const lancelot = at(204.5, 281);
    const gawain = at(207.5, 281);
    const merlin = at(208.5, 282.5);
    const player = at(spawn.x + 0.5, spawn.y + 0.5);
    // The two knights stand at the door for the whole run; Lancelot acts in the opening
    const props: MapPropDef[] = [
        { npcId: SIR_LANCELOT, seq: IDLE, ...lancelot, yaw: SOUTH + 64 },
        { npcId: SIR_GAWAIN, seq: IDLE, ...gawain, yaw: SOUTH - 64 },
    ];
    return {
        props,
        cinematic: {
            seconds: 23.4,
            cast: [
                { id: "arthur", npcId: KING_ARTHUR, seq: IDLE, ...king, yaw: SOUTH },
                {
                    id: "lancelot",
                    npcId: SIR_LANCELOT,
                    seq: IDLE,
                    ...lancelot,
                    yaw: SOUTH + 64,
                    prop: 0,
                },
                { id: "merlin", npcId: MERLIN, seq: IDLE, ...merlin, yaw: SOUTH - 160 },
            ],
            cues: [
                { at: 0.6, actor: "arthur", say: "The trolls come down with the thaw.", sayFor: 3 },
                { at: 3.8, actor: "arthur", say: "Shut the gates.", sayFor: 2.4 },
                { at: 4.6, actor: "lancelot", seq: BOW },
                { at: 4.8, actor: "lancelot", say: "At once, my liege.", sayFor: 2.4 },
                {
                    at: 7.4,
                    actor: "merlin",
                    say: "I shall find you a champion.",
                    sayFor: 2.2,
                },
                { at: 9.6, actor: "merlin", seq: TELEPORT },
                { at: 9.6, actor: "merlin", spotAnim: TELEPORT_SPOTANIM, sound: TELEPORT_SOUND },
                { at: 11.4, actor: "merlin", gone: true },
            ],
            shots: [
                // Close on the king. Every shot looks down enough to keep the city beyond out of
                // the picture, which a phone can't draw all of.
                {
                    at: 0,
                    x: king.x,
                    y: king.y,
                    lift: 1.4,
                    pitch: -240,
                    yaw: 0,
                    distance: 4.5,
                },
                // Back to see the three of them, and held
                {
                    at: 4.2,
                    x: king.x,
                    y: king.y - 0.5,
                    lift: 1,
                    pitch: -300,
                    yaw: 60,
                    distance: 8,
                    hold: true,
                },
                // On Merlin, held through his teleport
                {
                    at: 8.4,
                    x: merlin.x,
                    y: merlin.y,
                    lift: 1,
                    pitch: -280,
                    yaw: -120,
                    distance: 6,
                    hold: true,
                },
                {
                    at: 11.2,
                    x: merlin.x,
                    y: merlin.y,
                    lift: 1,
                    pitch: -320,
                    yaw: -90,
                    distance: 7.5,
                    hold: true,
                },
                // Up over the city, then down the mountain looking back up it, over the Stair
                // and the Shelf, and down behind the player. It starts close, as the city's
                // heavy, and pulls out to the play camera's distance once past it.
                ...[0, 1 / 3, 2 / 3, 1].map((share, i) => ({
                    at: 13.8 + i * 2.8,
                    x: king.x + (player.x - king.x) * share,
                    y: king.y - 20 + (player.y + 4 - (king.y - 20)) * share,
                    lift: 1,
                    pitch: -380 - 20 * share,
                    yaw: 0,
                    distance: 14 + 6 * Math.min(share, 2 / 3),
                })),
                { at: 23.4, player: true },
            ],
        },
    };
}
