import { QUARRY } from "../scaperune/maps/quarryColossus";
import { FLOOR_MATERIALS, FLOOR_SKINS } from "./floorSkins";
import type {
    BossAttackDef,
    EnemyDef,
    FightAbilityDef,
    FloorDef,
    FloorShapeDef,
    FloorTileRuleDef,
    ImpactDef,
} from "./types";

// The Quarry Colossus, fought on its own in the Sunken Quarry (maps.ts,
// scaperune/maps/quarryColossus.ts): a stone colossus that worked a quarry cut down a cliff over
// a chasm, and the quarry is its weapon. The floor's the game's own (MapDef.floor): he stamps and
// it heaves in rings round his feet, he punches it and the fault line nearest you cracks, and a
// fault cracked twice falls into the chasm; he hurls boulders that the quarry's pillars stop,
// until they break; rocks fall from the cliff. Each phase ends with the shelf giving way under
// everyone, a level down to the next, smaller shelf, the last of them with lava in its cracks.
// The player fights back three ways: his charge that misses leaves his guard down; a cracked
// fault he's lured onto caves in under him and he sinks into it, stunned; a crane's plate drops
// its load on him where he stands. Shatter, the fight's button, breaks a plate off him while his
// guard's down, baring his core for longer.
// The design and its numbers: docs/design/quarry-colossus.md.

// His animations, on the Golem guard's own skeleton (npc 14125), picked by eye
const IDLE_SEQ = 10778;
const WALK_SEQ = 10775;
// Down on his haunches and up, both fists into the ground, about 1.1 s in: his stamp, his slam
const SLAM_SEQ = 10782;
const SLAM_AT = 1.1;
// A swing of both arms, about 0.6 s in: his punch into the shelf, his charge
const SWING_SEQ = 10780;
const SWING_AT = 0.6;
// Arms out, flung: a throw
const THROW_SEQ = 10776;
const THROW_AT = 0.55;
const BLOCK_SEQ = 10777;
const DEATH_SEQ = 10779;
// Up out of a crouch: climbing out of a hole, and rising into a phase
const RISE_SEQ = 10770;

// What his blows throw up (ImpactDef), the cache's own, scaled to fit: the Corporeal Beast's
// stomp (318), a white ring that runs out along the floor; grey dust blown along the ground
// (2184) and the Sepulchre's dust (2699); a rockfall's tumble (451, Jad's and the Kalphite
// Queen's falling rocks); a chip of rock (2210)
const STOMP = 318;
const BLOWN_DUST = 2184;
const DUST = 2699;
const ROCKFALL = 451;
const CHIP = 2210;
const STARS = 80;
// The Golem guard's own sounds (as its animations play them): a grunt as it braces, its swing,
// and the blow landing; its death
const GRUNT = 9832;
const SWING = 9837;
const BLOW = 9841;
const DEATH_SOUND = 9835;

// What the fight's tuned to (maps.ts): his hitpoints and the Prospector's warhammer's level
export const COLOSSUS_HITPOINTS = 20000;
export const COLOSSUS_WEAPON_LEVEL = 5;

// Tiles south of him the player stands as he rises, as the map starts them
export const COLOSSUS_START_DISTANCE = QUARRY.rises[0].y - QUARRY.starts[0].y;

const O = QUARRY.origin;
const world = (tile: { x: number; y: number }) => ({
    x: O.x + tile.x + 0.5,
    y: O.y + tile.y + 0.5,
});

// He's big: a stone colossus four tiles across
const RADIUS = 2;
// His own attacks reach this far; past it he walks after them, and from well off, leaps
const REACH = 16;
// How long his guard's down when his charge misses, and how long he's stunned
const OPENS = 2;
const STUN = 3;

// ---- The floor ----

// Floor tiles are counted from the floor box's south-west corner
const F = QUARRY.floor;
const at = (x: number, y: number): FloorShapeDef => ({
    kind: "rect",
    x0: x - F.x0,
    y0: y - F.y0,
    x1: x - F.x0,
    y1: y - F.y0,
});
const shelfShape = (i: number): FloorShapeDef => {
    const s = QUARRY.shelves[i];
    return { kind: "rect", x0: s.x0 - F.x0, y0: s.y0 - F.y0, x1: s.x1 - F.x0, y1: s.y1 - F.y0 };
};
// Each shelf's group, its faults' groups and its plates' triggers, by name
export const SHELF_GROUPS = ["shelf1", "shelf2", "shelf3"];
const faultGroup = (shelf: number, k: number) => `fault${shelf + 1}${"abc"[k]}`;
const FAULT_GROUPS = QUARRY.faults.map((faults, i) => faults.map((_, k) => faultGroup(i, k)));
const plateName = (shelf: number, k: number) => `crane${shelf + 1}${"ab"[k]}`;

// The skins: grey slabs of the shelf; the faults the same, a shade darker; pillars of uncut rock;
// the cranes' plates; and lava, which comes up through the bottom shelf's cracks
const SLAB = 0;
const FAULT = 1;
const PILLAR = 2;
const PLATE = 3;
const LAVA = 4;
// The bottom shelf's faults, and a share of its slabs that are cracked, copies of the others so
// only they melt (FloorPhaseDef.skins)
const LOW_FAULT = 5;
const LOW_CRACK = 6;

// Seconds a fault takes to rebuild once it's fallen, and a broken pillar
const FAULT_REBUILD = 12;
const PILLAR_REBUILD = 16;

const tiles: FloorTileRuleDef[] = [
    { skin: SLAB, turn: "random" },
    ...QUARRY.shelves.map(
        (_, i): FloorTileRuleDef => ({ where: shelfShape(i), group: SHELF_GROUPS[i], rebuild: 0 }),
    ),
    { where: shelfShape(2), share: 0.08, skin: LOW_CRACK },
    ...QUARRY.faults.flatMap((faults, i) =>
        faults.map(
            (seam, k): FloorTileRuleDef => ({
                where: { kind: "union", of: seam.map((t) => at(t.x, t.y)) },
                skin: i === 2 ? LOW_FAULT : FAULT,
                type: "fragile",
                group: FAULT_GROUPS[i][k],
                rebuild: FAULT_REBUILD,
            }),
        ),
    ),
    ...QUARRY.pillars.flat().map(
        (p): FloorTileRuleDef => ({
            where: {
                kind: "rect",
                x0: p.x - F.x0,
                y0: p.y - F.y0,
                x1: p.x + 1 - F.x0,
                y1: p.y + 1 - F.y0,
            },
            skin: PILLAR,
            type: "pillar",
            slab: [2, 2],
            rebuild: PILLAR_REBUILD,
        }),
    ),
    ...QUARRY.plates.flatMap((plates, i) =>
        plates.map(
            (p, k): FloorTileRuleDef => ({
                where: at(p.x, p.y),
                skin: PLATE,
                type: "solid",
                trigger: plateName(i, k),
            }),
        ),
    ),
];

// A crane's load let go over him where he stands: a block of stone (drawn as the cache's boulder)
// falling from high over him for a second; under it still, he takes it on the head
const LOAD = {
    seconds: 1.1,
    radius: 2.4,
    damage: 700,
    stun: 2.5,
    lookId: "colossus_load",
    height: 10,
    impact: {
        spots: [
            { spotAnim: STOMP, fit: 3 },
            { spotAnim: ROCKFALL, fit: 2 },
            { spotAnim: BLOWN_DUST, fit: 3 },
        ],
        shake: 0.6,
    } satisfies ImpactDef,
    // The rocks' fall, as the load's let go
    sound: 6572,
    message: "The load lands on him!",
    missMessage: "The load misses...",
};

export const QUARRY_FLOOR: FloorDef = {
    rect: { x0: O.x + F.x0, y0: O.y + F.y0, x1: O.x + F.x1, y1: O.y + F.y1 },
    shape: { kind: "union", of: QUARRY.shelves.map((_, i) => shelfShape(i)) },
    skins: [
        { ...FLOOR_SKINS.greySlab, material: FLOOR_MATERIALS.stone },
        // A fault: the slab a shade darker, its cracks lit faintly
        {
            ...FLOOR_SKINS.greySlab,
            tint: 0xb4a898,
            material: FLOOR_MATERIALS.stone,
            cue: { color: 0xff8a3c, strength: 1.2 },
        },
        { ...FLOOR_SKINS.stonePillar, under: SLAB, material: FLOOR_MATERIALS.brick },
        { ...FLOOR_SKINS.pressurePlate, light: 0xffc060 },
        FLOOR_SKINS.lava,
        // The bottom shelf's faults, and its cracked slabs, as the others till they melt
        {
            ...FLOOR_SKINS.greySlab,
            tint: 0xb4a898,
            material: FLOOR_MATERIALS.stone,
            cue: { color: 0xff8a3c, strength: 1.2 },
        },
        { ...FLOOR_SKINS.greySlab, tint: 0xc8bcb0, material: FLOOR_MATERIALS.stone },
    ],
    tiles,
    seed: 7302,
    slam: {
        warn: 1,
        // Up from its second tick to its fifteenth, as the Wardens' slab is
        hurt: [0.04, 0.28],
        damage: 0.1,
        grace: 0.6,
        spotAnim: 2220,
        sound: 6555,
    },
    drop: {
        warn: 1.4,
        damage: 0.1,
        shove: 0.25,
        spotAnim: 2228,
        fall: 1,
        keepRows: 0,
        sound: 6572,
        fragile: { warn: 0.5, hits: 2 },
    },
    effects: { dust: DUST, fallDust: BLOWN_DUST, rock: CHIP },
    // The glow under the shelf, and far down the chasm: molten
    glow: 0xff7a2a,
    cue: "subtle",
    shake: { slam: 0.12, drop: 0.3 },
    pillars: { hits: 3, fall: 0.35 },
    triggers: Object.fromEntries(
        QUARRY.plates.flatMap((plates, i) =>
            plates.map((_, k) => [plateName(i, k), { actions: [], cooldown: 14, load: LOAD }]),
        ),
    ),
    // The bottom shelf: lava comes up through its cracks a share at a time (FloorPhaseDef)
    phases: {
        molten: {
            skins: [[LOW_FAULT, LAVA]],
            message: "Lava wells up through the cracks!",
            script: [{ at: 25, action: { kind: "phase", phase: "molten2" } }],
            loopSeconds: 999,
        },
        molten2: {
            skins: [[LOW_CRACK, LAVA]],
            message: "The lava's rising!",
            script: [],
            loopSeconds: 999,
        },
    },
    // The floor does nothing by itself: he does it
    script: [],
    loopSeconds: 999,
};

// ---- His attacks ----

// A pattern on the floor kept to one shelf (FloorPatternDef.group), for each shelf's version of
// an attack
const onShelf = (attack: BossAttackDef, shelves: number[]): BossAttackDef[] =>
    shelves.map((i) => ({
        ...attack,
        name: `${attack.name} ${i + 1}`,
        phases: attack.phases && [i + 1],
        floor:
            attack.floor?.kind === "pattern" && typeof attack.floor.pattern !== "string"
                ? { ...attack.floor, pattern: { ...attack.floor.pattern, group: SHELF_GROUPS[i] } }
                : attack.floor,
        floorNearest: attack.floorNearest && FAULT_GROUPS[i],
    }));

// His stamp: he crouches and brings both fists down, and the shelf heaves in rings out from his
// feet, a ring every eighth of a second, all but along the spokes (a cross, or the diagonals),
// which stay down: the cue shows the whole of it from the moment he crouches. Under him it's his
// fists too. Lands on a cracked fault, it caves in under him.
const STAMP: BossAttackDef = {
    name: "Stamp",
    kind: "swing",
    damage: 6,
    windup: 1.1,
    cooldown: 3,
    range: 7,
    weight: 4,
    phases: [1],
    seq: SLAM_SEQ,
    strikeAt: SLAM_AT,
    windupSound: GRUNT,
    sound: BLOW,
    radius: RADIUS + 0.4,
    crushes: true,
    floorAt: "boss",
    floor: {
        kind: "pattern",
        pattern: {
            kind: "ripple",
            at: "player",
            ringSeconds: 0.12,
            radius: 6,
            from: 2,
            spokes: "cross",
            cue: "bold",
        },
    },
    impact: {
        spots: [
            { spotAnim: STOMP, fit: 3 },
            { spotAnim: BLOWN_DUST, fit: 3 },
        ],
        shake: 0.4,
    },
};

// His slam: a fist into the shelf, and the fault line nearest them heaves (a fragile seam: twice
// and it falls into the chasm). Seen from the moment he swings: its tiles' cue.
const SLAM: BossAttackDef = {
    name: "Fault slam",
    kind: "swing",
    damage: 0,
    windup: 0.7,
    cooldown: 4,
    range: 14,
    weight: 3,
    phases: [1],
    seq: SWING_SEQ,
    strikeAt: SWING_AT,
    sound: BLOW,
    radius: 0.1,
    crushes: true,
    floor: { kind: "slam", group: "" },
    floorNearest: [],
    impact: { spots: [{ spotAnim: DUST, fit: 2 }], shake: 0.2 },
};

// His charge: a barge down a strip three wide and eight long the way he faced, his shoulder
// down; he goes to its end, through a pillar (it breaks), and missed, his guard's down. Onto a
// cracked fault, it caves in under him.
const CHARGE: BossAttackDef = {
    name: "Charge",
    kind: "swing",
    damage: 8,
    windup: 1,
    cooldown: 4,
    range: 9,
    minRange: 3,
    weight: 3,
    phases: [1, 2, 3],
    seq: SWING_SEQ,
    strikeAt: SWING_AT,
    windupSound: SWING,
    sound: BLOW,
    line: { width: 3, length: 8, dash: 8 - RADIUS, smashes: true },
    opens: OPENS,
    crushes: true,
    impact: {
        trail: { spotAnim: BLOWN_DUST, fit: 1.4 },
        spots: [
            { spotAnim: DUST, fit: 2.5 },
            { spotAnim: STOMP, fit: 2 },
        ],
        shake: 0.45,
    },
};

// A boulder: torn out of the rock and hurled, flying for its last 0.9 s in an arc. A pillar
// between him and where it's going takes it instead, cracking (three and it breaks).
const BOULDER: BossAttackDef = {
    name: "Boulder",
    kind: "blast",
    damage: 9,
    windup: 1.6,
    cooldown: 3,
    range: 20,
    minRange: 5,
    weight: 3,
    phases: [1, 2, 3],
    seq: THROW_SEQ,
    strikeAt: THROW_AT + 0.9,
    windupSound: SWING,
    sound: 6572,
    radius: 1.5,
    blocked: true,
    arc: { from: "boss", seconds: 0.9, height: 4, lookId: "colossus_boulder" },
    impact: {
        spots: [
            { spotAnim: ROCKFALL, fit: 1.6 },
            { spotAnim: BLOWN_DUST, fit: 2 },
        ],
        shake: 0.35,
    },
};

// Rocks off the cliff, under everything (an ambient): five at once round them, a faint dust where
// each will land, falling for its last 0.7 s
const ROCKFALL_ATTACK: BossAttackDef = {
    name: "Rockfall",
    kind: "ground",
    damage: 6,
    windup: 1.6,
    cooldown: 0,
    range: 999,
    weight: 0,
    phases: [],
    sound: 1659,
    arc: { from: "sky", seconds: 0.7, height: 9, lookId: "colossus_rock" },
    impact: { spots: [{ spotAnim: ROCKFALL, fit: 1.2 }], shake: 0.15 },
    ground: {
        spots: [{ shape: "scatter", count: 4, spread: 6, awayFrom: RADIUS + 1.5 }],
        radius: 1.2,
        spotAnim: DUST,
        fit: 0.9,
        alpha: 0.5,
    },
};

const ATTACKS: BossAttackDef[] = [
    ...onShelf(STAMP, [0]),
    ...onShelf(
        {
            ...STAMP,
            name: "Stamp (diagonals)",
            floor: {
                kind: "pattern",
                pattern: {
                    kind: "ripple",
                    at: "player",
                    ringSeconds: 0.11,
                    radius: 7,
                    from: 2,
                    spokes: "diagonal",
                    cue: "bold",
                },
            },
        },
        [1, 2],
    ),
    ...onShelf({ ...STAMP, name: "Stamp (cross)", weight: 2 }, [1, 2]),
    ...onShelf(SLAM, [0, 1, 2]),
    CHARGE,
    // Twice in a row from the second shelf, the second aimed afresh and quicker
    { ...CHARGE, name: "Charges", weight: 2, phases: [2, 3], chain: { times: 1, windup: 0.75 } },
    BOULDER,
    { ...BOULDER, name: "Boulders", phases: [2, 3], count: 2, spread: 3 },
    { ...BOULDER, name: "Boulder volley", phases: [3], count: 3, spread: 3.5, weight: 2 },
    // From the second shelf: a side of the shelf heaves, row by row from the back
    ...onShelf(
        {
            name: "Heave",
            kind: "swing",
            damage: 0,
            windup: 0.6,
            cooldown: 6,
            range: 14,
            weight: 2,
            phases: [2],
            seq: SLAM_SEQ,
            strikeAt: 0.6,
            radius: 0.1,
            floor: { kind: "pattern", pattern: { kind: "side", side: "east", rowSeconds: 0.12 } },
            impact: { spots: [{ spotAnim: STOMP, fit: 3 }], shake: 0.3 },
        },
        [1, 2],
    ),
    ...onShelf(
        {
            name: "Heave (west)",
            kind: "swing",
            damage: 0,
            windup: 0.6,
            cooldown: 6,
            range: 14,
            weight: 2,
            phases: [2],
            seq: SLAM_SEQ,
            strikeAt: 0.6,
            radius: 0.1,
            floor: { kind: "pattern", pattern: { kind: "side", side: "west", rowSeconds: 0.12 } },
            impact: { spots: [{ spotAnim: STOMP, fit: 3 }], shake: 0.3 },
        },
        [1, 2],
    ),
    // The bottom shelf's: the whole shelf heaves, front to back, with a way through that wanders
    ...onShelf(
        {
            name: "Upheaval",
            kind: "swing",
            damage: 0,
            windup: 0.8,
            cooldown: 9,
            range: 14,
            weight: 2,
            phases: [3],
            seq: SLAM_SEQ,
            strikeAt: 0.8,
            radius: 0.1,
            message: "The shelf heaves!",
            floor: {
                kind: "pattern",
                pattern: { kind: "sweep", rowSeconds: 0.13, gap: 3, cue: "bold" },
            },
            impact: { spots: [{ spotAnim: STOMP, fit: 4 }], shake: 0.4 },
        },
        [2],
    ),
    // The bottom shelf's combo: a stamp, and his charge straight after through where they've gone
    ...onShelf(
        {
            ...STAMP,
            name: "Stamp, then charge",
            phases: [3],
            weight: 2,
            follow: { attack: "Charge (following)", delay: 0.5 },
        },
        [2],
    ),
    { ...CHARGE, name: "Charge (following)", weight: 0, phases: [], range: 999, minRange: 0 },
    ROCKFALL_ATTACK,
];

// Never spawned: what he throws and the cranes drop, drawn as the cache's boulders
const PROP = {
    walkSeq: -1,
    attackSeq: -1,
    deathSeq: -1,
    hp: 1,
    damage: 0,
    speed: 0,
    xp: 0,
    knockbackResist: 1,
    sounds: { attack: -1, hit: -1, death: -1 },
};

// Into each phase but the first, the shelf gives way: a level down to the next
const descend = (i: number) => ({
    group: SHELF_GROUPS[i - 1],
    delay: 0.4,
    at: 1.8,
    fall: 0.9,
    rise: world(QUARRY.rises[i]),
    start: world(QUARRY.starts[i]),
    floorPhase: i === 2 ? "molten" : undefined,
    impact: {
        spots: [
            { spotAnim: STOMP, fit: 4 },
            { spotAnim: BLOWN_DUST, fit: 3 },
        ],
        shake: 0.6,
    },
});

// Shatter, the fight's button: a pickaxe's blow on him from close by. With his guard down it
// breaks a plate of rock off him and his core's bare for 5 s: his guard stays down that long
export const COLOSSUS_SHATTER: FightAbilityDef = {
    id: "shatter",
    name: "Shatter",
    damage: 220,
    reach: 4.2,
    openReach: 5.2,
    cooldown: 4,
    // The dragon pickaxe
    iconObjId: 12797,
    impact: {
        spots: [
            { spotAnim: CHIP, fit: 2 },
            { spotAnim: DUST, fit: 2 },
        ],
        shake: 0.25,
    },
    // The warhammer's smash, and stone breaking
    playerSeq: 1378,
    sound: 1659,
    opens: {
        seconds: 5,
        impact: {
            spots: [
                { spotAnim: ROCKFALL, fit: 2.4 },
                { spotAnim: STOMP, fit: 2.5 },
            ],
            shake: 0.45,
            flash: "#ffb070",
        },
        sound: 6572,
    },
};

export const COLOSSUS_ENEMIES: EnemyDef[] = [
    {
        id: "quarry_colossus",
        name: "Quarry Colossus",
        npcId: 14125,
        idleSeq: IDLE_SEQ,
        walkSeq: WALK_SEQ,
        attackSeq: SWING_SEQ,
        deathSeq: DEATH_SEQ,
        hp: 3000,
        damage: 0,
        // Two-thirds of the player's pace: he lumbers after them
        speed: 2.6,
        radius: RADIUS,
        scale: 2.6,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: { attack: -1, hit: -1, death: DEATH_SOUND },
        spawnMessage: "The Quarry Colossus wakes!",
        boss: {
            attackInterval: 1.4,
            keepDistance: 3,
            enrage: { message: "" },
            bulletGrace: 0.6,
            leash: { distance: REACH, keep: 6 },
            attacks: ATTACKS,
            fallSeconds: 3.2,
            look: {
                title: "#e8c48a",
                subtitle: "#d9a066",
                edge: null,
                vignette: null,
                lean: true,
                dark: [14, 8, 4],
            },
            intro: {
                seconds: 5,
                riseAt: 0.8,
                seq: RISE_SEQ,
                darkSound: 6572,
                sound: 1659,
                title: "The Quarry Colossus",
                subtitle: "The Sunken Quarry",
                distance: COLOSSUS_START_DISTANCE,
                alone: true,
                atMiddle: true,
                holds: true,
                faces: true,
                pan: { from: 2.8, over: 1.6 },
                land: {
                    spots: [
                        { spotAnim: STOMP, fit: 4 },
                        { spotAnim: BLOWN_DUST, fit: 3 },
                    ],
                    shake: 0.5,
                },
                landAt: 1.6,
            },
            guard: {
                damage: 2,
                stun: STUN,
                stunSpotAnim: STARS,
                stunHeight: 4.2,
                // Stone grinding as his guard drops, and the rockfall's crash as he's stunned
                exposeSound: 9834,
                stunSound: 1659,
                stunGrace: 8,
                resisted: { spots: [{ spotAnim: DUST, fit: 2.5 }] },
                resistShout: "Grrrnnh!",
                stuck: {
                    spots: [
                        { spotAnim: ROCKFALL, fit: 2 },
                        { spotAnim: DUST, fit: 2.5 },
                    ],
                    shake: 0.5,
                },
            },
            sinks: {
                stun: STUN,
                depth: 1.8,
                climbSeq: RISE_SEQ,
                impact: {
                    spots: [
                        { spotAnim: ROCKFALL, fit: 3 },
                        { spotAnim: BLOWN_DUST, fit: 3.5 },
                    ],
                    shake: 0.6,
                },
            },
            phases: {
                phases: [
                    {
                        until: 0.85,
                        status: "The upper shelf",
                        ambients: [{ attack: "Rockfall", interval: 6, delay: 3 }],
                    },
                    {
                        until: 0.45,
                        status: "The cutting",
                        message: "The shelf gives way!",
                        tempo: 0.9,
                        speed: 1.1,
                        descend: descend(1),
                        ambients: [{ attack: "Rockfall", interval: 5, delay: 2 }],
                    },
                    {
                        status: "The glow",
                        message: "Down towards the glow!",
                        tempo: 0.8,
                        speed: 1.2,
                        descend: descend(2),
                        ambients: [{ attack: "Rockfall", interval: 4.5, delay: 2 }],
                    },
                ],
                threshold: {
                    seconds: 4.4,
                    seq: SLAM_SEQ,
                    riseSeq: RISE_SEQ,
                    riseSeconds: 1.2,
                    shout: "RRRAAAGH!",
                    sound: 1659,
                    impact: {
                        spots: [
                            { spotAnim: STOMP, fit: 6 },
                            { spotAnim: BLOWN_DUST, fit: 4 },
                        ],
                        shake: 0.6,
                    },
                },
                confine: false,
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
    // A boulder he hurls; a rock off the cliff; a crane's load
    {
        ...PROP,
        id: "colossus_boulder",
        name: "Boulder",
        npcId: 4502,
        idleSeq: 6120,
        radius: 0.8,
        scale: 1.4,
    },
    {
        ...PROP,
        id: "colossus_rock",
        name: "Rock",
        npcId: 4502,
        idleSeq: 6120,
        radius: 0.6,
        scale: 1.1,
    },
    {
        ...PROP,
        id: "colossus_load",
        name: "Load",
        npcId: 4502,
        idleSeq: 6120,
        radius: 1.2,
        scale: 2.2,
    },
];
