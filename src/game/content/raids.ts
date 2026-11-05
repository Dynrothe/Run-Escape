import { THEATRE_OF_BLOOD, TOB_ROOM_PLACES, TobRoomId } from "../scaperune/maps/theatreOfBlood";
import { getRecipeArena } from "../scaperune/recipe";
import { MapDef, RaidRoomDef, RaidSupplyDef, RandomEventDef, RunEventDef, WaveDef } from "./types";
import { LUMBRIDGE_WAVES } from "./waves";

// Raids (MapDef.raid): a run through rooms one after another, each its waves and then its boss in
// a room of its own, rather than one fifteen minute timeline. Open from the start, outside the
// campaign's chain.

// Raid points, per player, for each room cleared: some for clearing it, more for killing its boss
// fast (all of SPEED_POINTS within its room's par, RaidRoomDef.par, of it turning up, none by
// SLOW_PAR times that) and for taking little damage in the room (all of SAFE_POINTS with none
// taken, none at a whole hitpoints bar's worth)
export const CLEAR_POINTS = 50;
export const SPEED_POINTS = 100;
export const SLOW_PAR = 2.5;
export const SAFE_POINTS = 50;

// Coins for each raid point a room's cleared with (the party's average), and on hard mode this
// many times as many. A clean clear of the Theatre comes to about 4,400, or 6,600 on hard: a little
// more than a good campaign run, so clearing one room and dying doesn't out-earn one.
export const RAID_COINS_PER_POINT = 4;
export const HARD_RAID_COINS = 1.5;
// Expert mode (hard mode with the Nylocas's colours): twice as many
export const EXPERT_RAID_COINS = 2;

// The chest at the end: a purple's chance is a player's raid points over PURPLE_POINTS (all of
// them, spent or not), held between these; on hard mode, a roll for its own as well
export const PURPLE_POINTS = 2500;
export const PURPLE_CHANCE: [min: number, max: number] = [0.05, 0.65];
export const HARD_UNIQUE_CHANCE = 0.25;

export function getRoomPoints(
    bossSeconds: number,
    damageTaken: number,
    maxHp: number,
    par: number,
): number {
    const speed = 1 - (bossSeconds - par) / (par * SLOW_PAR - par);
    const safe = 1 - damageTaken / Math.max(1, maxHp);
    return Math.round(
        CLEAR_POINTS +
            SPEED_POINTS * Math.min(1, Math.max(0, speed)) +
            SAFE_POINTS * Math.min(1, Math.max(0, safe)),
    );
}

// Teleports a raid gives: halls whose waves can be skipped, once their boss has been killed
export const RAID_TELEPORTS = 3;
// The teleporter's portal (2 by 2), drawn by the game in each hall once there are teleports
export const RAID_PORTAL_LOC = 4525;

// The supply chest between rooms
export const RAID_SUPPLIES: RaidSupplyDef[] = [
    {
        id: "shark",
        name: "Shark",
        description: "Heals 30% of your hitpoints.",
        objId: 385,
        price: 30,
        effect: { kind: "heal", fraction: 0.3 },
    },
    {
        id: "saradomin_brew",
        name: "Saradomin brew",
        description: "Heals 60% of your hitpoints.",
        objId: 6685,
        price: 60,
        effect: { kind: "heal", fraction: 0.6 },
    },
    {
        id: "super_restore",
        name: "Super restore",
        description: "Cures poison and drains, and keeps them off for 2 minutes.",
        objId: 3024,
        price: 40,
        effect: { kind: "buff", stats: {}, seconds: 120, cures: true },
    },
    {
        id: "stamina_potion",
        name: "Stamina potion",
        description: "+20% movement speed for 3 minutes.",
        objId: 12625,
        price: 50,
        effect: { kind: "buff", stats: { moveSpeed: 0.2 }, seconds: 180 },
    },
    {
        id: "divine_super_combat",
        name: "Divine super combat potion",
        description: "+25% melee damage for 3 minutes.",
        objId: 23685,
        price: 80,
        effect: { kind: "buff", stats: { meleeMight: 0.25 }, seconds: 180 },
    },
    {
        id: "divine_ranging",
        name: "Divine ranging potion",
        description: "+25% ranged damage for 3 minutes.",
        objId: 23733,
        price: 80,
        effect: { kind: "buff", stats: { rangedMight: 0.25 }, seconds: 180 },
    },
    {
        id: "divine_magic",
        name: "Divine magic potion",
        description: "+25% magic damage for 3 minutes.",
        objId: 23745,
        price: 80,
        effect: { kind: "buff", stats: { magicMight: 0.25 }, seconds: 180 },
    },
];

export function getRaidSupply(id: string): RaidSupplyDef {
    const supply = RAID_SUPPLIES.find((s) => s.id === id);
    if (!supply) {
        throw new Error("Unknown raid supply " + id);
    }
    return supply;
}

// The chest's screen goes the way a visitor's shop does (Sim.openOffer); nobody walks up to it
export const RAID_SUPPLY_CHEST: RandomEventDef = {
    id: "raid_supplies",
    name: "Supply chest",
    weight: 0,
    speech: "Spend your raid points on supplies for the next room.",
    effect: { kind: "shop", leaveLabel: "On to the next room" },
};

// Each room's waves last this long from when it starts, however quickly the last boss went down
// (its `at` is where it'd fall with no time spent on bosses: five minutes, ten, and so on)
const ROOM_MINUTES = 5;
// A room's waves: a new one every WAVE_STEP seconds, WAVES_A_ROOM of them
const WAVE_STEP = 60;
const WAVES_A_ROOM = 5;

// A room's waves keep Lumbridge's pace for how far into the raid it is, over a run twice its
// length (room n starts at Lumbridge's wave 2.5n). Its three lists of who comes are spread over
// its five waves.
function roomWaves(room: number, enemies: WaveDef["enemies"][]): WaveDef[] {
    const first = Math.round(room * 2.5);
    return Array.from({ length: WAVES_A_ROOM }, (_, i) => {
        const pace = LUMBRIDGE_WAVES[Math.min(first + i, LUMBRIDGE_WAVES.length - 1)];
        const who =
            enemies[Math.min(Math.floor((i * enemies.length) / WAVES_A_ROOM), enemies.length - 1)];
        return { ...pace, start: i * WAVE_STEP, enemies: who };
    });
}

// Elites through the room, and a ring of its commonest enemy late on
function roomEvents(elite: string, ring: string, count: number): RunEventDef[] {
    return [
        { at: 60, kind: "elite", enemyId: elite },
        { at: 150, kind: "elite", enemyId: elite },
        { at: 200, kind: "ring", enemyId: ring, count },
        { at: 240, kind: "elite", enemyId: elite },
    ];
}

type TobRoom = Omit<RaidRoomDef, "start" | "arrive" | "bossAt" | "chamber" | "at">;

function tobRoom(id: TobRoomId, room: TobRoom, index: number): RaidRoomDef {
    const place = TOB_ROOM_PLACES.find((p) => p.id === id)!;
    return {
        ...room,
        start: place.start,
        arrive: place.arrive,
        bossAt: place.boss,
        chamber: place.chamber,
        teleporter: place.teleporter,
        at: (index + 1) * ROOM_MINUTES * 60,
    };
}

// The Theatre's rooms in its own order. Its bosses' hitpoints are set from players' clears, not the
// bot's (it kills them at under half a player's pace): the first clears had each down in 12 to 45
// seconds, and these are meant to give a fight of a couple of minutes, more so later on, as a
// player's build grows through the raid. Lower on the Bloat, who walks his loop.
const TOB_ROOMS: RaidRoomDef[] = [
    tobRoom(
        "maiden",
        {
            name: "The Maiden of Sugadinti",
            waves: roomWaves(0, [
                [{ id: "blood_spawn", weight: 3 }],
                [
                    { id: "blood_spawn", weight: 3 },
                    { id: "vampyre_juvenile", weight: 1 },
                ],
                [
                    { id: "blood_spawn", weight: 2 },
                    { id: "nylocas_matomenos", weight: 1 },
                    { id: "vampyre_juvenile", weight: 1 },
                ],
            ]),
            events: roomEvents("nylocas_matomenos", "blood_spawn", 24),
            // Canifis's woods by night, where the vampyres hunt: redder than the village itself,
            // so it doesn't read as a stroll past Canifis, but lit enough to see its enemies by
            hall: { brightness: 1.15, wash: "#f4c4c4" },
            boss: "maiden_of_sugadinti",
            // Seconds for all its speed points (early: fast is fine)
            par: 30,
            // The first boss, met at about level 20: under the later ones
            bossHp: 12000,
        },
        0,
    ),
    tobRoom(
        "bloat",
        {
            name: "The Pestilent Bloat",
            waves: roomWaves(1, [
                [
                    { id: "ghast", weight: 3 },
                    { id: "bloodworm", weight: 1 },
                ],
                [
                    { id: "myre_zombie", weight: 2 },
                    { id: "ghast", weight: 2 },
                ],
                [
                    { id: "myre_zombie", weight: 2 },
                    { id: "feral_vampyre", weight: 2 },
                ],
            ]),
            events: roomEvents("feral_vampyre", "ghast", 30),
            boss: "tob_pestilent_bloat",
            // Seconds for all its speed points (early)
            par: 60,
            bossHp: 20000,
        },
        1,
    ),
    tobRoom(
        "nylocas",
        {
            name: "Nylocas Vasilias",
            waves: roomWaves(2, [
                [
                    { id: "tob_nylocas_ischyros", weight: 3 },
                    { id: "tob_nylocas_toxobolos", weight: 1 },
                ],
                [
                    { id: "tob_nylocas_ischyros", weight: 2 },
                    { id: "tob_nylocas_toxobolos", weight: 2 },
                    { id: "tob_nylocas_hagios", weight: 2 },
                ],
                [
                    { id: "tob_big_nylocas_ischyros", weight: 1 },
                    { id: "tob_nylocas_toxobolos", weight: 2 },
                    { id: "tob_nylocas_hagios", weight: 2 },
                ],
            ]),
            events: roomEvents("tob_big_nylocas_ischyros", "tob_nylocas_ischyros", 40),
            // Meiyerditch is dark stone: brighter than the rest, or its alleys are lost
            hall: { brightness: 1.1 },
            boss: "nylocas_vasilias",
            // Seconds for all its speed points (mid)
            par: 90,
            bossHp: 60000,
        },
        2,
    ),
    tobRoom(
        "sotetseg",
        {
            name: "Sotetseg",
            waves: roomWaves(3, [
                [
                    { id: "vampyre_juvinate", weight: 2 },
                    { id: "mutated_bloodveld", weight: 1 },
                ],
                [
                    { id: "mutated_bloodveld", weight: 2 },
                    { id: "nail_beast", weight: 2 },
                ],
                [
                    { id: "mutated_bloodveld", weight: 2 },
                    { id: "vampyre_juvinate", weight: 2 },
                    { id: "tob_big_nylocas_toxobolos", weight: 1 },
                ],
            ]),
            events: roomEvents("mutated_bloodveld", "vampyre_juvinate", 36),
            boss: "tob_sotetseg",
            // Seconds for all its speed points (mid)
            par: 90,
            bossHp: 48000,
        },
        3,
    ),
    tobRoom(
        "xarpus",
        {
            name: "Xarpus",
            waves: roomWaves(4, [
                [
                    { id: "vyrewatch", weight: 2 },
                    { id: "tob_nylocas_hagios", weight: 2 },
                ],
                [
                    { id: "vyrewatch", weight: 2 },
                    { id: "tob_big_nylocas_hagios", weight: 1 },
                    { id: "mutated_bloodveld", weight: 1 },
                ],
                [
                    { id: "vyrewatch_sentinel", weight: 2 },
                    { id: "vyrewatch", weight: 2 },
                ],
            ]),
            events: roomEvents("vyrewatch_sentinel", "tob_nylocas_hagios", 50),
            boss: "xarpus",
            // Seconds for all its speed points (late)
            par: 150,
            bossHp: 120000,
        },
        4,
    ),
    tobRoom(
        "verzik",
        {
            name: "Verzik Vitur",
            waves: roomWaves(5, [
                [
                    { id: "vyrewatch_sentinel", weight: 2 },
                    { id: "tob_big_nylocas_ischyros", weight: 2 },
                ],
                [
                    { id: "vyrewatch_sentinel", weight: 2 },
                    { id: "tob_big_nylocas_toxobolos", weight: 1 },
                    { id: "tob_big_nylocas_hagios", weight: 1 },
                    { id: "vyrewatch", weight: 1 },
                ],
                [
                    { id: "vyrewatch_sentinel", weight: 2 },
                    { id: "tob_big_nylocas_ischyros", weight: 1 },
                    { id: "tob_big_nylocas_toxobolos", weight: 1 },
                    { id: "tob_big_nylocas_hagios", weight: 1 },
                ],
            ]),
            events: roomEvents("vyrewatch_sentinel", "tob_nylocas_ischyros", 60),
            boss: "tob_verzik_vitur",
            // Seconds for all its speed points (late, her three forms)
            par: 150,
            // Each of her three forms has this many hitpoints
            bossHp: 48000,
        },
        5,
    ),
];

// Every room's waves and events (and bosses), for what bakes a map's enemies and checks them
function allOf(rooms: RaidRoomDef[]): Pick<MapDef, "waves" | "events"> {
    return {
        waves: rooms.flatMap((room) => room.waves),
        events: rooms.flatMap((room, i): RunEventDef[] => [
            ...room.events,
            {
                at: room.at,
                kind: i === rooms.length - 1 ? "finalBoss" : "boss",
                enemyId: room.boss,
                hp: room.bossHp,
            },
        ]),
    };
}

export const RAID_MAPS: MapDef[] = [
    {
        id: "theatre_of_blood",
        name: "Theatre of Blood",
        description:
            "**A melee raid in six rooms.** Survive each room's waves on the way through " +
            "Morytania, then kill its boss to move on: the Maiden, the Bloat, Nylocas Vasilias, " +
            "Sotetseg, Xarpus, then Verzik in Vampyrium.\n\n" +
            "**Bosses pray against missiles and magic**, which do only 15% of their damage to them, " +
            "and there's nowhere safe by them: up close they stomp, bite and burst.\n\n" +
            "**Raid points** come from fast, clean rooms. They pay coins, buy supplies between " +
            "rooms, and raise your chance of a purple at the end.\n\n" +
            "**Weapons come from the chest**, not for clearing: a Ghrazi rapier from it unlocks " +
            "the rapier, a chance each clear. On hard or expert it can also hold the Holy Scythe " +
            "of Vitur, which unlocks the Holy Scythe.\n\n" +
            "**Portals:** once you've killed a room's boss, its hall has a portal straight to it " +
            "(three a raid).\n\n" +
            "**Hard mode** opens when you beat the raid.\n\n" +
            "**Expert mode** opens when you beat it on hard. It's hard mode with more of the real " +
            "raid's mechanics: the Nylocas only take their own style, the Maiden's Nylocas heal " +
            "her, Xarpus stares, and Verzik's ball must be hidden from. Twice the coins, and a " +
            "Lil' Zik look each clear.",
        // Lil' Zik
        iconObjId: 22473,
        arena: getRecipeArena(THEATRE_OF_BLOOD),
        spawn: TOB_ROOMS[0].start,
        // As hard as the Inferno, the campaign's hardest map
        difficulty: { hp: 3.75, damage: 2.7 },
        // Hard mode, and expert with it: half as many bullets again in every pattern
        hard: { hp: 1.4, damage: 1.2, bullets: 1.5 },
        ...allOf(TOB_ROOMS),
        raid: { rooms: TOB_ROOMS },
        finalBossWarning: "The Theatre's curtain rises... Verzik Vitur awaits!",
        victoryText: "The Theatre of Blood is complete!",
        music: "Massacre",
        scaperune: true,
        brightness: 1,
    },
];
