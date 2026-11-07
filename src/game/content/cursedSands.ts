import { BossAttackDef, EnemyDef, FightAbilityDef, GroundPatternDef } from "./types";

// Beneath Cursed Sands, as a boss fight in four parts (MapDef.stages; its map in
// scaperune/maps/tombsOfAmascut.ts): the OSRS quest's fights one after another, Coenus the Head
// Menaphite Guard, the Scarab Mages, the Champion of Scabaras and the Menaphite Akh, each a run of
// its own that's kept once it's won, as the quest keeps your progress. Beaten, it opens the Tombs
// of Amascut (MapDef.requires). Everyone plays the Sands Delver (characters.ts) with its kit, so the
// fights are as long as their hitpoints make them: hard, and in phases.

// The humanoid rig's own (the quest's foes are people, the Akh aside): standing, walking, falling
const HUMAN_IDLE = 808;
const HUMAN_WALK = 819;
const GUARD_IDLE = 813;
const GUARD_WALK = 1205;
const HUMAN_DEATH = 836;
const SLASH_SEQ = 390;
const CAST_SEQ = 1162;
// The Ancient Magicks' burst and barrage cast
const BURST_SEQ = 1979;
const NO_SOUNDS = { attack: -1, hit: -1, death: -1 };
// Shadow spells: the barrage's and burst's impacts
const SHADOW_BURST = 382;
const SHADOW_BARRAGE = 383;
// Akkha's darkness orb: solid enough to read as it rolls out, where the burst is see-through
const DARK_ORB = 2257;
// How much the quest's bullets are lit up against the tomb's dark floor (BulletPatternDef.bright):
// a dark orb on dark stone has next to no contrast, so it's lifted as the Theatre's are, and the
// scarabs' bolts a little less, as they're lighter to start with
const ORB_BRIGHT = 0.6;
const BOLT_BRIGHT = 0.45;
// And a glow on the floor under each orb, pale violet, so its edge stands out from the stone
// round it whatever the light there
const ORB_GLOW = { radius: 1.5, color: 0xc8b0ff, intensity: 0.5 };
// The Tombs' scarabs' magic, and its splash
const SCARAB_BOLT = 2152;
const SCARAB_SPLASH = 2154;
// A thrown javelin (the crossbow bolt, as the Javelin Colossus has)
const JAVELIN = 27;
// Akkha's lightning element
const LIGHTNING = 2256;
// Dust thrown up where a lunge ends
const BLOWN_DUST = 2184;

// Point-blank volley, the quest's fight button (MapDef.fight.ability): a volley of crystal arrows
// into the boss from close by, about a second of the bow's damage, doubled with a guard down
// (BossDef.guard). A kiting player never has a reason to be near a melee boss; this is one, and
// four tiles is inside Coenus's sweep. A lunge he's missed leaves him past you, so it reaches a
// little further then.
export const POINT_BLANK_VOLLEY: FightAbilityDef = {
    id: "point_blank",
    name: "Point-blank volley",
    damage: 30,
    reach: 4,
    openReach: 5.5,
    cooldown: 5,
    // The Crystal bow, its own shot and its sound
    iconObjId: 23983,
    playerSeq: 426,
    sound: 2707,
    impact: { spots: [{ spotAnim: BLOWN_DUST, fit: 1.5 }], shake: 0.2 },
};

// A boss's rise at the middle of the arena, the player brought to its south, nothing else till
// it's down
const rise = (title: string, subtitle: string) => ({
    seconds: 3,
    riseAt: 1,
    title,
    subtitle,
    distance: 7,
    alone: true,
    atMiddle: true,
});

// Coenus, the Head Menaphite Guard (11529): "the Spear", everything he does about reach. From
// the first second he lunges down a strip at you, sweeps his front, harpoons whoever keeps away
// and reels them in, with a shockwave rolling out from him now and then. From 72% his guards
// march at you as a wall with one gap in it (the Phalanx), his lunges come in twos and a stamp
// sends you out into his next lunge; from 36%, quicker still, spears rain down, he charges right
// across the room and his lunges come in threes, turning after you as he draws back. Every lunge,
// harpoon and charge he misses leaves his guard down (BossDef.guard): Point-blank volley
// (MapDef.fight.ability) is what dodging well is for. The design:
// docs/design/beneath-cursed-sands.md.

// His animations, on the human rig: Guthan's warspear's thrust (its spear furthest out about
// 0.6 s in), the slash (about 0.55 s in), an overarm throw and a run
const THRUST_SEQ = 2080;
const THRUST_AT = 0.6;
const SLASH_AT = 0.55;
const THROW_SEQ = 806;
const THROW_AT = 0.3;
const RUN_SEQ = 824;
// What his blows throw up: the Corporeal Beast's stomp (a ring along the floor), dust along the
// ground, Akkha's sand
const STOMP = 318;
const DUST = 2699;
const SAND = 2255;
// His spear knocked aside as his guard drops (swordclash5)
const GUARD_DROP_SOUND = 1971;

// His lunge: a strip two wide and seven long, and he goes down it. A step of a tile and a third
// (a third of a second) takes the player off it, against 0.8 s; missed, he's carried past them
// with his guard down. Chained, each link's re-aimed; track turns the strip after them as he
// draws back (phase 3).
const lunge = (
    name: string,
    phases: number[],
    more: Partial<BossAttackDef> = {},
    track?: number,
): BossAttackDef => ({
    name,
    kind: "swing",
    seq: THRUST_SEQ,
    strikeAt: THRUST_AT,
    sound: -1,
    damage: 4,
    windup: 0.8,
    cooldown: 2,
    range: 7,
    weight: 4,
    line: { width: 2, length: 7, dash: 6.3, ...(track !== undefined && { track }) },
    opens: 1.5,
    impact: {
        trail: { spotAnim: BLOWN_DUST, fit: 1 },
        spots: [{ spotAnim: BLOWN_DUST, fit: 2 }],
        shake: 0.2,
    },
    phases,
    ...more,
});

// His shockwave, out from him all round with a gap on the player's side: walk into the gap
const shockwave = (name: string, volleys: number): BossAttackDef => ({
    name,
    kind: "pattern",
    seq: SLASH_SEQ,
    sound: -1,
    spotAnim: DARK_ORB,
    damage: 2,
    windup: 1.2,
    cooldown: 0,
    range: 30,
    weight: 0,
    pattern: {
        bright: ORB_BRIGHT,
        glow: ORB_GLOW,
        shape: "ring",
        count: 18,
        volleys,
        interval: 1,
        speed: 4,
        range: 14,
        radius: 0.45,
        gap: 1,
        gapAt: "player",
    },
    // Only ever his ambient (BossPhasesDef ambients)
    phases: [],
});

const COENUS_ATTACKS: BossAttackDef[] = [
    lunge("Spear lunge", [1]),
    lunge("Spear lunges", [2], { chain: { times: 1, windup: 0.65 } }),
    // Each turning after them for its first quarter second, then locked with half a second to go
    lunge("Spear flurry", [3], { chain: { times: 2, windup: 0.7 }, cooldown: 3 }, 0.25),
    // After a stamp, at where they've stepped out to: a beat longer to read
    lunge("Spear lunge (following)", [], { windup: 1, weight: 0, cooldown: 0 }),
    {
        // A wedge in front of him: the answer's behind or beside him, the lunge's opposite
        name: "Sweep",
        kind: "swing",
        seq: SLASH_SEQ,
        strikeAt: SLASH_AT,
        sound: -1,
        damage: 3,
        windup: 0.9,
        cooldown: 1,
        range: 3.2,
        radius: 3,
        cone: 2.2,
        underRadius: 1,
        weight: 3,
        impact: { spots: [{ spotAnim: DUST, fit: 2 }], shake: 0.1 },
    },
    {
        // For whoever keeps away: thrown at where they stand, and whoever it hits is dragged in,
        // held a moment and swept. Missed, his guard's down.
        name: "Harpoon",
        kind: "projectile",
        seq: THROW_SEQ,
        strikeAt: THROW_AT,
        sound: -1,
        spotAnim: JAVELIN,
        damage: 2,
        windup: 1,
        cooldown: 7,
        range: 12,
        minRange: 4,
        weight: 3,
        speed: 10,
        radius: 0.45,
        wave: { reach: 12 },
        onHit: { pull: 2.2, pullSeconds: 0.3, bind: 0.7, attack: "Reel" },
        opens: 1.5,
    },
    {
        // Only after the harpoon's hauled them in
        name: "Reel",
        kind: "swing",
        seq: SLASH_SEQ,
        strikeAt: 0.45,
        sound: -1,
        damage: 3,
        windup: 0.45,
        cooldown: 0,
        range: 999,
        radius: 2.6,
        weight: 0,
        phases: [],
        impact: { spots: [{ spotAnim: DUST, fit: 1.5 }], shake: 0.15 },
    },
    {
        // His guards marching at you as a wall, two ranks, each with a gap somewhere new: a walk
        // to the gap (they're slower than you) while he keeps lunging. Each is drawn as a guard
        // walking, spaced so no one fits between two of them but at the gap.
        name: "Phalanx",
        kind: "pattern",
        seq: SLASH_SEQ,
        sound: -1,
        damage: 3,
        windup: 1.4,
        cooldown: 16,
        range: 30,
        weight: 2,
        pattern: {
            shape: "wall",
            count: 11,
            spacing: 1.6,
            // One rank at a time, its gap three guards wide: a second rank behind it lined up
            // with it from the camera and hid the way through
            gap: 3,
            volleys: 1,
            interval: 1.8,
            speed: 3,
            range: 16,
            radius: 0.6,
            look: "menaphite_guard",
            knockback: 1,
            // Formed up behind him, and through him: whoever's beside him has a moment
            from: -3,
        },
        shout: "Form up!",
        message: "Find the gap in the line!",
        phases: [2],
    },
    {
        // Round him, then straight on with a lunge at wherever they stepped out to: out
        // sideways, not straight back
        name: "Stamp",
        kind: "swing",
        seq: SLASH_SEQ,
        strikeAt: SLASH_AT,
        sound: -1,
        damage: 4,
        windup: 1.2,
        cooldown: 6,
        range: 4,
        radius: 4,
        weight: 3,
        follow: { attack: "Spear lunge (following)", delay: 0.35 },
        impact: {
            spots: [
                { spotAnim: SAND, fit: 3 },
                { spotAnim: STOMP, fit: 3 },
            ],
            shake: 0.4,
        },
        phases: [2, 3],
    },
    {
        name: "Guards!",
        kind: "summon",
        seq: SLASH_SEQ,
        sound: -1,
        damage: 0,
        windup: 1,
        cooldown: 22,
        range: 30,
        weight: 2,
        summon: { enemyId: "menaphite_guard", count: 2, distance: 4 },
        shout: "Guards! Seize the intruder!",
        phases: [2, 3],
    },
    {
        // From the middle, spears thrown up to come down under shadows, one on them: then again
        // on where they've gone
        name: "Spear rain",
        kind: "blast",
        seq: THROW_SEQ,
        strikeAt: THROW_AT,
        sound: -1,
        damage: 4,
        windup: 1.5,
        cooldown: 14,
        range: 30,
        count: 6,
        spread: 5,
        radius: 1.2,
        weight: 2,
        toMiddle: true,
        shadow: {},
        chain: { times: 1, windup: 0.9 },
        impact: {
            spots: [
                { spotAnim: BLOWN_DUST, fit: 1.2 },
                { spotAnim: SAND, fit: 1.2 },
            ],
            shake: 0.2,
        },
        shout: "Rain them down!",
        phases: [3],
    },
    {
        // To the edge in line with them and right across, twice: out of the lane. One that
        // crosses without hitting anyone leaves his guard down at the far wall.
        name: "Bull rush",
        kind: "surge",
        seq: RUN_SEQ,
        sound: -1,
        damage: 5,
        windup: 1.2,
        cooldown: 10,
        range: 30,
        radius: 1.2,
        speed: 14,
        weight: 2,
        chain: { times: 1, windup: 0.7 },
        opens: 2,
        phases: [3],
    },
    shockwave("Shockwave", 1),
    shockwave("Shockwaves", 2),
];

// The Scarab Mages (11508): "twin casters", two mages fought together, with two kits, built as
// Coenus is: big shapes on the floor to read, and a way to hit back. The bow shoots whichever's
// nearest, so where the player stands chooses who they hurt. Their big spells are channelled
// (BossAttackDef.channel): the mage stands with its guard down while it casts, and Point-blank
// volley landing on it breaks the spell. The first, the swarm-caller, fans scarabs, steps through
// the sand, sends a stampede of scarabs across the room with a gap in it, and channels a swarm
// back to it (shoot them, or run in and break the spell). Twenty seconds in the elder comes up
// out of the sand: sand blasts, quicksand that sinks the floor round the player in a lattice,
// twice, and the Sands of Scabaras, a sandstorm over the whole room with the only shelter at its
// feet, which is where Point-blank reaches. From their halves the two cross their spells (the
// Crossfire: a strip from each, and the pocket neither reaches), the stampede comes in two
// ranks, the sand sinks three times, a noose of scarabs closes and a beam of sand runs between
// them. Kill one and the other's furious (BossDef enrage.partner). The design:
// docs/design/beneath-cursed-sands.md.

// On the human rig, measured on the mage: the cast's arm forward again about 0.6 s in, the
// burst's arms out from 0.2 s, the god spell's arms up highest at 0.32 s
const CAST_AT = 0.6;
const BURST_AT = 0.3;
const GOD_SPELL = 811;
const GOD_SPELL_AT = 0.32;
// Kephri's swarm in flight; Akkha's red sand bursting
const SCARAB_SWARM = 2153;
const RED_SAND_BURST = 2254;
// A spell broken by Point-blank: its guard stays down this much longer
const BROKEN = 2.5;

// A stampede of Kephri's scarabs across the room at the player, a rank at a time, each with a
// gap somewhere new: walk to the gap (they're slower than you). Drawn as the swarm walking.
const stampede = (name: string, volleys: number, more: Partial<BossAttackDef>): BossAttackDef => ({
    name,
    kind: "pattern",
    seq: GOD_SPELL,
    strikeAt: GOD_SPELL_AT,
    sound: -1,
    damage: 3,
    windup: 1.3,
    cooldown: 12,
    range: 30,
    weight: 2,
    pattern: {
        shape: "wall",
        count: 13,
        spacing: 1.5,
        gap: 3,
        volleys,
        interval: 2,
        speed: 3.2,
        range: 18,
        radius: 0.6,
        look: "mage_scarab",
        knockback: 1,
        // Out of the sand behind it, and through it: whoever's beside it has a moment
        from: -3,
    },
    message: "Find the gap in the stampede!",
    ...more,
});

// A strip of scarabs from the swarm-caller to the player, and the elder's own from where it
// stands a beat later (its EnemyDef.echoes): two strips from two ways, and the pocket neither
// reaches
const crossfire = (name: string, more: Partial<BossAttackDef>): BossAttackDef => ({
    name,
    kind: "swing",
    seq: CAST_SEQ,
    strikeAt: CAST_AT,
    sound: -1,
    damage: 3,
    windup: 1.1,
    cooldown: 6,
    range: 14,
    weight: 3,
    line: { width: 2, length: 14 },
    impact: { trail: { spotAnim: SCARAB_SWARM, fit: 1 }, shake: 0.15 },
    phases: [2],
    ...more,
});

const MAGE_ATTACKS: BossAttackDef[] = [
    {
        // Five bolts across a radian, twice, each volley aimed afresh: keep stepping across
        name: "Scarab fan",
        kind: "pattern",
        seq: CAST_SEQ,
        strikeAt: CAST_AT,
        sound: -1,
        spotAnim: SCARAB_BOLT,
        impactSpotAnim: SCARAB_SPLASH,
        damage: 2,
        windup: 1,
        cooldown: 4,
        range: 14,
        weight: 3,
        pattern: {
            bright: BOLT_BRIGHT,
            shape: "spread",
            count: 5,
            volleys: 2,
            interval: 0.4,
            speed: 7,
            range: 16,
            radius: 0.4,
            arc: 1,
            track: true,
        },
    },
    {
        // A puff of sand, and it's somewhere else: its next spell's from there
        name: "Sand step",
        kind: "teleport",
        seq: BURST_SEQ,
        sound: -1,
        damage: 0,
        windup: 0.6,
        cooldown: 9,
        range: 30,
        radius: 7,
        weight: 2,
        castSpotAnim: SAND,
        impactSpotAnim: SAND,
    },
    {
        // Four scarabs in a ring round it, walking in while it channels: each that gets there
        // adds 1.5 to a blast that can't be dodged. Shoot them on the way, or run in and break
        // the spell with Point-blank (its guard's down the whole time), and they scatter.
        name: "Swarm to me",
        kind: "summon",
        seq: GOD_SPELL,
        sound: -1,
        damage: 0,
        windup: 1,
        cooldown: 18,
        range: 30,
        weight: 2,
        summon: { enemyId: "mage_scarab", count: 4, walkTo: { distance: 9, perAbsorbed: 1.5 } },
        channel: { stagger: BROKEN, broken: "The swarm scatters!" },
        shout: "Scarabs, to me!",
        message: "Shoot the swarm, or break the mage's spell up close!",
    },
    stampede("Scarab stampede", 1, { phases: [1] }),
    // From its half two ranks, and the same early if the elder's dead first
    stampede("Scarab stampedes", 2, { phases: [2] }),
    stampede("Scarab stampedes (furious)", 2, { enraged: true, phases: [1] }),
    crossfire("Crossfire", {}),
    // Its half's first: on its own, with what to do
    crossfire("Crossfire (first)", {
        weight: 0,
        phases: [],
        message: "The mages cross their spells! Step out of both!",
    }),
];

// Quicksand: the floor round the player sinks in a lattice, one under them, with ways through on
// the diagonals; then again round where they've gone, the last still sinking. Each stays a
// while, hurting whoever's in it.
const quicksand = (name: string, waves: number, phases: number[]): BossAttackDef => ({
    name,
    kind: "ground",
    seq: BURST_SEQ,
    strikeAt: BURST_AT,
    sound: -1,
    damage: 3,
    windup: 1.4,
    cooldown: 8,
    range: 30,
    weight: 3,
    chain: { times: waves - 1, windup: 1.3 },
    ground: {
        spots: [{ shape: "grid", size: 3, spacing: 3.4 }],
        radius: 0.9,
        spotAnim: SAND,
        lingers: { seconds: 1.6, interval: 0.5, damage: 0.15 },
    },
    impact: { spots: [{ spotAnim: RED_SAND_BURST, fit: 1 }] },
    phases,
});

// The elder's noose: a ring of scarab bolts round the player, closing, with one way out
const noose = (name: string, more: Partial<BossAttackDef>): BossAttackDef => ({
    name,
    kind: "pattern",
    seq: GOD_SPELL,
    strikeAt: GOD_SPELL_AT,
    sound: -1,
    spotAnim: SCARAB_BOLT,
    damage: 2,
    windup: 1.2,
    cooldown: 12,
    range: 30,
    weight: 2,
    pattern: {
        bright: BOLT_BRIGHT,
        shape: "closing",
        count: 22,
        volleys: 1,
        interval: 1,
        speed: 2.4,
        range: 7,
        radius: 0.45,
        distance: 6,
        gap: 3,
    },
    shout: "The sands close in!",
    ...more,
});

const ELDER_ATTACKS: BossAttackDef[] = [
    {
        name: "Sand blast",
        kind: "projectile",
        seq: CAST_SEQ,
        strikeAt: CAST_AT,
        sound: -1,
        spotAnim: SAND,
        impactSpotAnim: RED_SAND_BURST,
        damage: 2,
        windup: 0.8,
        cooldown: 0,
        range: 14,
        weight: 3,
        speed: 6,
        radius: 0.5,
    },
    quicksand("Quicksand", 2, [1]),
    quicksand("Quicksand (three waves)", 3, [2]),
    {
        // To the middle, and a sandstorm over the whole room but at its feet: in to it (four
        // seconds; the room's far corner is a little over three away), where Point-blank
        // reaches, its guard down while it channels. Broken, there's no storm.
        name: "Sands of Scabaras",
        kind: "swing",
        seq: GOD_SPELL,
        strikeAt: GOD_SPELL_AT,
        sound: -1,
        castSpotAnim: SAND,
        damage: 5,
        windup: 4,
        cooldown: 18,
        range: 30,
        radius: 30,
        outside: 3.5,
        weight: 2,
        toMiddle: true,
        channel: { stagger: BROKEN, broken: "The sandstorm dies away!" },
        impact: {
            spots: [
                { spotAnim: SAND, fit: 4 },
                { spotAnim: RED_SAND_BURST, fit: 3 },
            ],
            shake: 0.4,
        },
        shout: "Feel the sands of Scabaras!",
        message: "Sandstorm! Shelter at the mage's feet, or break its spell!",
    },
    noose("Noose", { phases: [2] }),
    // Its partner dead before its half: the noose now
    noose("Noose (furious)", { enraged: true, phases: [1] }),
    {
        // A beam of sand from it to the other mage, hurting whoever crosses it: a wall that
        // swings as they move (and jumps as the other steps through the sand)
        name: "Sand tether",
        kind: "tether",
        sound: -1,
        spotAnim: SAND,
        damage: 2,
        windup: 0,
        cooldown: 0,
        range: 30,
        weight: 0,
        tether: { partner: "scarab_mage", width: 0.8, seconds: 8, interval: 1, warn: 1.2 },
        phases: [],
    },
];

// The Champion of Scabaras (11483): "Eternal", a shadow mage who doesn't stay where you left him
// and doesn't stay down. From the first second he bolts you, steps out of the shadows beside you
// with a burst already coming, opens rifts under and round you that stay open a while, and rings
// of darkness roll out of him. At 66% and 33% he sinks into the dark and scarab nests come up:
// stand on each to smother it, or he rises healed (BossDef.exhumes). From 68% the floor crosses
// under you, he steps twice, scarabs swarm and his rings turn both ways; from 34%, in the dark,
// the path you've just walked bursts behind you (a ground trail) and a storm spirals out of him.
// The design: docs/design/beneath-cursed-sands.md.

// The Wardens' shadow on the floor (a big one and a small one), Verzik's red swarm charging, the
// Soldier Scarab's heal, an egg hatching
const SHADOW_FLOOR = 1446;
const SHADOW_FLOOR_SMALL = 1447;
const NEST_SWARM = 2149;
const SCARAB_HEAL = 2150;
const EGG_HATCH = 2166;
// A faint violet glow on his marks, so they show in his last phase's dark without washing the
// shadow out (a bright one made it look pale)
const SHADOW_LIGHT = { radius: 2, color: 0x8a70c0, intensity: 0.25 };
// His marks are shadows on the floor: drawn solid, not the usual faint warning, or they're lost
const SHADOW_ALPHA = 0.85;

// Out of the shadows near the player, the burst already winding up: 1.85 tiles to clear
const shadowStep = (name: string, burst: string, phases: number[]): BossAttackDef => ({
    name,
    kind: "teleport",
    seq: BURST_SEQ,
    sound: -1,
    damage: 0,
    windup: 0.5,
    cooldown: 8,
    range: 30,
    radius: 2.5,
    weight: 3,
    castSpotAnim: SHADOW_FLOOR_SMALL,
    impactSpotAnim: SHADOW_FLOOR,
    follow: { attack: burst, delay: 0.1 },
    phases,
});

// Four tiles round him, after a step. Dodged, he has stepped in close with his guard down: what
// Point-blank volley is for
const shadowBurst = (
    name: string,
    windup: number,
    more: Partial<BossAttackDef> = {},
): BossAttackDef => ({
    name,
    kind: "swing",
    seq: BURST_SEQ,
    strikeAt: BURST_AT,
    sound: -1,
    damage: 4,
    windup,
    cooldown: 0,
    range: 999,
    radius: 4,
    weight: 0,
    opens: 1.5,
    light: SHADOW_LIGHT,
    impact: { spots: [{ spotAnim: SHADOW_BURST, fit: 3 }], shake: 0.2 },
    phases: [],
    ...more,
});

// A ring of darkness out of him with a way through on the player's side; with two volleys,
// mirrored and turning opposite ways (scissors)
const shadowRing = (name: string, count: number, volleys: number): BossAttackDef => ({
    name,
    kind: "pattern",
    seq: BURST_SEQ,
    sound: -1,
    spotAnim: DARK_ORB,
    damage: 2,
    windup: 1.2,
    cooldown: 0,
    range: 30,
    weight: 0,
    pattern: {
        bright: ORB_BRIGHT,
        glow: ORB_GLOW,
        shape: "ring",
        count,
        volleys,
        interval: 0.8,
        speed: 3.5,
        range: 14,
        radius: 0.45,
        gap: 1,
        gapAt: "player",
        ...(volleys > 1 && { turn: 0.3, mirror: true }),
    },
    // Only ever his ambient
    phases: [],
});

// The path they've just walked: where they stood 0.6 to 2.4 s ago, bursting a second after it
// shows. Running straight back, or round in a circle, runs into it.
const betrayal = (name: string, more: Partial<BossAttackDef> = {}): BossAttackDef => ({
    name,
    kind: "ground",
    seq: GOD_SPELL,
    strikeAt: GOD_SPELL_AT,
    sound: -1,
    damage: 4,
    windup: 1,
    cooldown: 8,
    range: 30,
    weight: 3,
    ground: {
        spots: [{ shape: "trail", ago: [0.6, 1.2, 1.8, 2.4] }],
        radius: 1.2,
        spotAnim: SHADOW_FLOOR,
        light: SHADOW_LIGHT,
        alpha: SHADOW_ALPHA,
    },
    impact: { spots: [{ spotAnim: SHADOW_BARRAGE, fit: 1.2 }] },
    phases: [3],
    ...more,
});

const CHAMPION_ATTACKS: BossAttackDef[] = [
    {
        name: "Shadow bolt",
        kind: "projectile",
        seq: CAST_SEQ,
        strikeAt: CAST_AT,
        sound: -1,
        spotAnim: SCARAB_BOLT,
        impactSpotAnim: SHADOW_BARRAGE,
        damage: 2,
        windup: 0.8,
        cooldown: 0,
        range: 16,
        weight: 3,
        count: 2,
        spread: 0.35,
        speed: 7,
    },
    shadowStep("Shadow step", "Shadow Burst", [1]),
    shadowBurst("Shadow Burst", 1.1),
    // Step, burst, step, burst: the second burst's quicker
    shadowStep("Shadow steps", "Shadow Burst (then)", [2, 3]),
    shadowBurst("Shadow Burst (then)", 1.1, {
        follow: { attack: "Shadow step (again)", delay: 0.1 },
    }),
    { ...shadowStep("Shadow step (again)", "Shadow Burst (again)", []), weight: 0, cooldown: 0 },
    shadowBurst("Shadow Burst (again)", 0.9),
    {
        // Three marks, one under them, each bursting and then staying open a while
        name: "Shadow Rift",
        kind: "ground",
        seq: BURST_SEQ,
        strikeAt: BURST_AT,
        sound: -1,
        damage: 4,
        windup: 1.6,
        cooldown: 6,
        range: 30,
        weight: 3,
        ground: {
            spots: [{ shape: "player" }, { shape: "scatter", count: 2, spread: 3 }],
            radius: 1.5,
            spotAnim: SHADOW_FLOOR,
            light: SHADOW_LIGHT,
            alpha: SHADOW_ALPHA,
            lingers: { seconds: 3, interval: 0.5, damage: 0.25 },
        },
        impact: { spots: [{ spotAnim: SHADOW_BARRAGE, fit: 1.5 }] },
        shout: "We are born in the shadows!",
    },
    {
        // A plus on them, a tile apart, lingering: step off diagonally
        name: "Shadow cross",
        kind: "ground",
        seq: BURST_SEQ,
        strikeAt: BURST_AT,
        sound: -1,
        damage: 4,
        windup: 1.3,
        cooldown: 7,
        range: 30,
        weight: 3,
        ground: {
            spots: [{ shape: "cross", reach: 3 }],
            radius: 0.8,
            spotAnim: SHADOW_FLOOR_SMALL,
            light: SHADOW_LIGHT,
            alpha: SHADOW_ALPHA,
            lingers: { seconds: 2, interval: 0.5, damage: 0.25 },
        },
        impact: { spots: [{ spotAnim: SHADOW_BARRAGE, fit: 0.8 }] },
        phases: [2, 3],
    },
    {
        name: "Shadow Flames",
        kind: "summon",
        seq: CAST_SEQ,
        sound: -1,
        damage: 0,
        windup: 1,
        cooldown: 16,
        range: 30,
        weight: 2,
        summon: { enemyId: "scarab_swarm", count: 4, distance: 3 },
        shout: "The children of Scabaras are eternal!",
        phases: [2, 3],
    },
    {
        // His nests, laid as he sinks into the dark (BossDef.exhumes): four red swarms on the
        // floor, each smothered by standing on it, each still there as he rises healing him
        name: "Scarab nests",
        kind: "ground",
        ordeal: true,
        seq: GOD_SPELL,
        sound: -1,
        damage: 0,
        windup: 0.6,
        cooldown: 0,
        range: 30,
        weight: 0,
        ground: {
            spots: [{ shape: "scatter", count: 4, spread: 7, awayFrom: 3 }],
            radius: 1.1,
            spotAnim: NEST_SWARM,
            light: { radius: 1.8, color: 0xff6040, intensity: 0.55 },
            // Up for longer than he's down: what's left is counted as he rises (exhumes.leftHeal)
            lingers: { seconds: 16, interval: 60, damage: 0 },
            smother: {
                seconds: 1.5,
                heal: 0.03,
                healSpotAnim: SCARAB_HEAL,
                smotheredSpotAnim: EGG_HATCH,
            },
        },
    },
    betrayal("Your shadow betrays you"),
    // His last phase's first: with what to do
    betrayal("Your shadow betrays you (first)", {
        weight: 0,
        phases: [],
        message: "Your shadow betrays you! Don't walk back over your path!",
    }),
    {
        // Spiralling out of him both ways at once: walk the scissors' openings
        name: "Shadow storm",
        kind: "pattern",
        seq: GOD_SPELL,
        strikeAt: GOD_SPELL_AT,
        sound: -1,
        spotAnim: DARK_ORB,
        damage: 2,
        windup: 1.2,
        cooldown: 12,
        range: 30,
        weight: 2,
        light: SHADOW_LIGHT,
        pattern: {
            bright: ORB_BRIGHT,
            glow: ORB_GLOW,
            shape: "spiral",
            count: 5,
            volleys: 10,
            interval: 0.3,
            speed: 4.5,
            range: 14,
            radius: 0.45,
            turn: 0.3,
            mirror: true,
        },
        phases: [3],
    },
    shadowRing("Shadow ring", 14, 1),
    shadowRing("Shadow rings", 8, 2),
];

// The Menaphite Akh (11493): "Amascut's spear", the quest's last fight and its fastest. From the
// first second she spears her front, dives down a strip at you and is across it, casts a wedge of
// lightning ahead of her (beside or behind her is safe), calls her shadow, and the floor sparks
// under you every few seconds (Static). From 66% she throws slow orbs that follow you, dives
// twice, and her cone leaves a lattice of sparks to step through; from 33%, in the dark, a cage of
// lightning closes on you with one way out and she dives at whoever leaves it, her dives come in
// threes and turn after you, and her storm spirals out of her. At no hitpoints she won't fall:
// ten seconds of orbs and dives she can't be hurt through (her last stand, BossPhasesDef.finale).
// Every dive she misses leaves her guard down (BossDef.guard). The design:
// docs/design/beneath-cursed-sands.md.

// Her own animations, measured on her model: the spear's thrust (furthest out 0.56 s in), the
// lightning cast (her arm out 0.58 s in), the dive (a long thrust, furthest out 0.48 s in), the
// orbs' throw (her arms up about 0.25 s in), the shadow's call, and down on her knees
const AKH_SPEAR = 9427;
const AKH_SPEAR_AT = 0.56;
const AKH_CAST = 9417;
const AKH_CAST_AT = 0.58;
const AKH_DIVE = 9418;
const AKH_DIVE_AT = 0.48;
const AKH_THROW = 9428;
const AKH_THROW_AT = 0.25;
const AKH_CALL = 9423;
const AKH_KNEEL = 9434;
// Akkha's unstable orb bursting, and the gold swirl of a yellow strange tile (Zachariah's)
const UNSTABLE_BURST = 2260;
const SPARK_SWIRL = 1800;
// Her lightning's pale blue light, on what's about to be struck
const SPARK_LIGHT = { radius: 2.2, color: 0xa8c8ff, intensity: 0.6 };

// Her dive: a strip two wide and eight long, and she's across it. A step of a tile and a third
// clears it against 0.9 s; missed, she's past you with her guard down. track: the strip turns
// after them for its first seconds (phase 3, and out of her cage), then it's locked.
const dive = (
    name: string,
    phases: number[],
    more: Partial<BossAttackDef> = {},
    track?: number,
): BossAttackDef => ({
    name,
    kind: "swing",
    seq: AKH_DIVE,
    strikeAt: AKH_DIVE_AT,
    sound: -1,
    damage: 4,
    windup: 0.9,
    cooldown: 3,
    range: 8,
    weight: 4,
    line: { width: 2, length: 8, dash: 7.3, ...(track !== undefined && { track }) },
    opens: 1.5,
    // Her lightning along the way she went, dust where she lands
    impact: {
        trail: { spotAnim: LIGHTNING, fit: 1 },
        spots: [{ spotAnim: BLOWN_DUST, fit: 2 }],
        shake: 0.2,
    },
    phases,
    ...more,
});

// A wedge of lightning ahead of her, ten tiles out: beside or behind her is safe
const lightningCone = (
    name: string,
    phases: number[],
    more: Partial<BossAttackDef> = {},
): BossAttackDef => ({
    name,
    kind: "swing",
    seq: AKH_CAST,
    strikeAt: AKH_CAST_AT,
    sound: -1,
    damage: 4,
    windup: 1.3,
    cooldown: 7,
    range: 9,
    radius: 10,
    cone: 1,
    // Ten tiles of it, under its own pale light: drawn plainly, or it's lost on the sand
    coneAlpha: 2.2,
    weight: 3,
    light: { radius: 3, color: 0xa8c8ff, intensity: 0.7 },
    impact: { spots: [{ spotAnim: LIGHTNING, fit: 2 }], shake: 0.2, flash: "#dfe8ff" },
    phases,
    ...more,
});

// Sparks on the floor, struck as they land: Static's on them and round them (chip, as it's always
// coming), the lattice all round them with ways through on the diagonals
const sparks = (
    name: string,
    ground: Omit<GroundPatternDef, "spotAnim" | "light">,
    windup: number,
    damage: number,
): BossAttackDef => ({
    name,
    kind: "ground",
    sound: -1,
    damage,
    windup,
    cooldown: 0,
    range: 30,
    weight: 0,
    // Solid, not the usual faint mark: they're all there is to read, and phase 3 is dark
    ground: { ...ground, spotAnim: SPARK_SWIRL, light: SPARK_LIGHT, alpha: 0.65 },
    impact: { spots: [{ spotAnim: LIGHTNING, fit: 1.2 }] },
    // Only ever an ambient, or what follows her cone
    phases: [],
});

// Slow orbs that follow you (0.9 rad a second): you're quicker, and a sharp turn beats them.
// Drawn as Akkha's unstable orb.
const unstableOrbs = (name: string, more: Partial<BossAttackDef> = {}): BossAttackDef => ({
    name,
    kind: "projectile",
    seq: AKH_THROW,
    strikeAt: AKH_THROW_AT,
    sound: -1,
    damage: 3,
    windup: 1,
    cooldown: 9,
    range: 16,
    weight: 3,
    count: 3,
    spread: 1,
    speed: 3.2,
    homing: 0.9,
    radius: 0.5,
    lookId: "akkha_unstable_orb",
    impactSpotAnim: UNSTABLE_BURST,
    phases: [2, 3],
    ...more,
});

const AKH_ATTACKS: BossAttackDef[] = [
    {
        // Her spear, round her front: back out of it
        name: "Spear",
        kind: "swing",
        seq: AKH_SPEAR,
        strikeAt: AKH_SPEAR_AT,
        sound: -1,
        damage: 3,
        windup: 0.8,
        cooldown: 0,
        range: 3,
        radius: 2.8,
        cone: 1.6,
        weight: 4,
        impact: { spots: [{ spotAnim: BLOWN_DUST, fit: 1.5 }], shake: 0.1 },
    },
    dive("Dive", [1]),
    dive("Dives", [2], { chain: { times: 1, windup: 0.7 } }),
    // Each turning after them for its first quarter second, then locked with 0.45 s to go
    dive("Dive flurry", [3], { chain: { times: 2, windup: 0.7 }, cooldown: 4 }, 0.25),
    // Out of her cage, at whoever's leaving it: a beat longer to read, and it follows them out
    dive("Dive (following)", [], { windup: 1, weight: 0, cooldown: 0 }, 0.25),
    // Her last stand's: as her first phase's, named so her shadow copies it there too
    dive("Dive (last stand)", [], { weight: 0, cooldown: 0 }),
    lightningCone("Lightning cone", [1]),
    // Out of the wedge and into the lattice's gaps
    lightningCone("Cone, then lattice", [2, 3], {
        cooldown: 8,
        follow: { attack: "Static lattice", delay: 0.3 },
    }),
    sparks(
        "Static",
        { spots: [{ shape: "player" }, { shape: "scatter", count: 2, spread: 5 }], radius: 1.2 },
        1.2,
        2,
    ),
    sparks(
        "Static lattice",
        { spots: [{ shape: "grid", size: 3, spacing: 3.2 }], radius: 0.9 },
        1,
        3,
    ),
    {
        name: "Her shadow",
        kind: "summon",
        seq: AKH_CALL,
        sound: -1,
        damage: 0,
        windup: 1.2,
        cooldown: 24,
        range: 30,
        weight: 2,
        summon: { enemyId: "menaphite_shadow", count: 1, distance: 5 },
        phases: [1],
    },
    {
        name: "Her shadows",
        kind: "summon",
        seq: AKH_CALL,
        sound: -1,
        damage: 0,
        windup: 1.2,
        cooldown: 18,
        range: 30,
        weight: 2,
        summon: { enemyId: "menaphite_shadow", count: 1, distance: 5 },
        phases: [2, 3],
    },
    unstableOrbs("Unstable orbs"),
    // Her second phase's first: the orbs on their own, with what to do
    unstableOrbs("Unstable orbs (first)", { weight: 0, phases: [], message: "Outrun the orbs!" }),
    {
        // A ring of her lightning round them, closing, with one way out; and she dives at
        // whoever comes out of it: sidestep as you leave
        name: "Lightning cage",
        kind: "pattern",
        seq: AKH_CAST,
        sound: -1,
        spotAnim: LIGHTNING,
        damage: 2,
        windup: 1.2,
        cooldown: 12,
        range: 30,
        weight: 2,
        pattern: {
            shape: "closing",
            count: 24,
            volleys: 1,
            interval: 1,
            speed: 2.2,
            range: 8,
            radius: 0.45,
            distance: 7,
            gap: 3,
        },
        follow: { attack: "Dive (following)", delay: 0.8 },
        message: "Out through the gap!",
        phases: [3],
    },
    {
        // Spiralling out of her both ways at once: walk the scissors' openings
        name: "Storm",
        kind: "pattern",
        seq: AKH_CAST,
        sound: -1,
        spotAnim: LIGHTNING,
        damage: 2,
        windup: 1.2,
        cooldown: 0,
        range: 30,
        weight: 0,
        pattern: {
            shape: "spiral",
            count: 3,
            volleys: 8,
            interval: 0.35,
            speed: 6,
            range: 14,
            radius: 0.45,
            turn: 0.35,
            mirror: true,
        },
        // Only ever her ambient
        phases: [],
    },
];

// Down on one knee between phases, and up again
const pause = (shout: string) => ({ seconds: 2, shout });

export const CURSED_SANDS_ENEMIES: EnemyDef[] = [
    {
        id: "coenus",
        name: "Coenus",
        npcId: 11529,
        idleSeq: GUARD_IDLE,
        walkSeq: GUARD_WALK,
        attackSeq: THRUST_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 1,
        damage: 2,
        speed: 2.1,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        sounds: NO_SOUNDS,
        boss: {
            // Its last share: quicker still
            enrage: { message: "", at: 0.15 },
            intro: rise("Coenus", "The Head Menaphite Guard"),
            attackInterval: 1.1,
            attacks: COENUS_ATTACKS,
            surgeSeq: RUN_SEQ,
            // Doubled while his guard's down, with a gold light on him
            guard: { damage: 2, stun: 0, exposeSound: GUARD_DROP_SOUND },
            // Akkha's room has walls of its own, so no drawn square round it
            look: { edge: null, exposedLight: { radius: 2.5, color: 0xffc040, intensity: 0.6 } },
            phases: {
                phases: [
                    {
                        until: 0.66,
                        status: "He comes for you",
                        ambients: [{ attack: "Shockwave", interval: 8, delay: 3 }],
                    },
                    {
                        until: 0.33,
                        status: "Form up!",
                        message: "Coenus calls his guards to form up!",
                        opener: "Phalanx",
                        tempo: 0.85,
                        speed: 1.1,
                        ambients: [{ attack: "Shockwave", interval: 6.5, delay: 3 }],
                    },
                    {
                        status: "No quarter!",
                        message: "Coenus is enraged!",
                        opener: "Spear rain",
                        tempo: 0.7,
                        speed: 1.25,
                        ambients: [
                            { attack: "Shockwaves", interval: 5, delay: 3 },
                            { attack: "Phalanx", interval: 15, delay: 6 },
                        ],
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
                threshold: pause("You will not leave this place!"),
            },
        },
    },
    {
        // The swarm-caller: risen at the middle as the fight begins, but not alone (an intro's
        // alone holds back every event, its elder's too, till it's dead)
        id: "scarab_mage",
        name: "Scarab Mage",
        npcId: 11508,
        idleSeq: GUARD_IDLE,
        walkSeq: GUARD_WALK,
        attackSeq: CAST_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 1,
        damage: 2,
        speed: 2,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        // Two at once: a bar over each, the top of the screen's being the first's
        healthBar: true,
        sounds: NO_SOUNDS,
        boss: {
            enrage: {
                message: "",
                partner: {
                    ids: ["scarab_mage_elder"],
                    shout: "You will pay for that!",
                    message: "The Scarab Mage is furious!",
                    tempo: 0.75,
                },
            },
            intro: { ...rise("Scarab Mages", "Servants of Scabaras"), alone: false },
            // Two at once: together about one boss a second, as Coenus is
            attackInterval: 2,
            keepDistance: 6,
            attacks: MAGE_ATTACKS,
            // Doubled while its guard's down (a spell it channels), with a gold light on it
            guard: { damage: 2, stun: 0 },
            // Akkha's room has walls of its own, so no drawn square round it
            look: { edge: null, exposedLight: { radius: 2.5, color: 0xffc040, intensity: 0.6 } },
            phases: {
                phases: [
                    { until: 0.5, status: "Scarabs, to me!" },
                    {
                        status: "The swarm rages",
                        message: "The Scarab Mage is enraged!",
                        opener: "Crossfire (first)",
                        tempo: 0.8,
                        speed: 1.1,
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
    {
        // The elder, the sand-shaper: up out of the sand inside the square twenty seconds in
        // (its event's inArena), with no intro to send the first off
        id: "scarab_mage_elder",
        name: "Scarab Mage",
        npcId: 11508,
        idleSeq: GUARD_IDLE,
        walkSeq: GUARD_WALK,
        attackSeq: CAST_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 1,
        damage: 2,
        speed: 2,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        healthBar: true,
        spawnSpotAnim: SAND,
        spawnMessage: "A second Scarab Mage rises from the sand!",
        sounds: NO_SOUNDS,
        // Its half of the Crossfire: a strip of its sand at the player a beat after the first's
        // strip of scarabs, from where it stands, while it's free (EnemyDef.echoes)
        echoes: {
            boss: "scarab_mage",
            attacks: ["Crossfire", "Crossfire (first)"],
            name: "Crossfire (the elder's)",
            damage: 3,
            seq: CAST_SEQ,
            strikeAt: CAST_AT,
            later: 0.25,
            impact: { trail: { spotAnim: SAND, fit: 1 }, shake: 0.15 },
        },
        boss: {
            enrage: {
                message: "",
                partner: {
                    ids: ["scarab_mage"],
                    shout: "You will pay for that!",
                    message: "The Scarab Mage is furious!",
                    tempo: 0.75,
                },
            },
            attackInterval: 2.2,
            keepDistance: 7,
            attacks: ELDER_ATTACKS,
            guard: { damage: 2, stun: 0 },
            look: { edge: null, exposedLight: { radius: 2.5, color: 0xffc040, intensity: 0.6 } },
            phases: {
                phases: [
                    { until: 0.5, status: "The sands shift" },
                    {
                        status: "The sands close in",
                        message: "The sand stirs between the mages!",
                        opener: "Noose",
                        tempo: 0.85,
                        speed: 1.1,
                        ambients: [{ attack: "Sand tether", interval: 12, delay: 1 }],
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
                threshold: { seconds: 1.5, shout: "Feel the sands of Scabaras!" },
            },
        },
    },
    {
        // The swarm the first mage calls to it (Kephri's): a few arrows each, walking in
        id: "mage_scarab",
        name: "Scarab Swarm",
        npcId: 11723,
        idleSeq: 9606,
        walkSeq: 9606,
        attackSeq: 9605,
        deathSeq: 9608,
        hp: 10,
        damage: 1,
        speed: 2.4,
        radius: 0.4,
        xp: 0,
        sounds: NO_SOUNDS,
    },
    {
        id: "champion_of_scabaras",
        name: "Champion of Scabaras",
        npcId: 11483,
        idleSeq: HUMAN_IDLE,
        walkSeq: HUMAN_WALK,
        attackSeq: CAST_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 1,
        damage: 3,
        speed: 2.2,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        sounds: NO_SOUNDS,
        boss: {
            // Its last share: quicker still
            enrage: { message: "", at: 0.15 },
            intro: rise("Champion of Scabaras", "The children of Scabaras are eternal"),
            attackInterval: 1.3,
            keepDistance: 5,
            attacks: CHAMPION_ATTACKS,
            // Half a second between bullets: his rings and storm cross each other
            bulletGrace: 0.5,
            // Into the dark twice, his nests up round the player: smother them all and he rises
            // at once, or each still up heals him as he does
            exhumes: {
                at: [0.66, 0.33],
                seconds: 14,
                count: 4,
                leftHeal: 0.03,
                opener: "Scarab nests",
                attacks: ["Shadow bolt"],
                interval: 1.6,
                message: "The Champion sinks into the shadows! Smother the nests!",
                endMessage: "The Champion rises!",
            },
            // Doubled while his guard's down (a burst he missed), with a gold light on him
            guard: { damage: 2, stun: 0 },
            // Akkha's room has walls of its own, so no drawn square round it
            look: { edge: null, exposedLight: { radius: 2.5, color: 0xffc040, intensity: 0.6 } },
            phases: {
                phases: [
                    {
                        until: 0.68,
                        status: "Shadows gather",
                        ambients: [{ attack: "Shadow ring", interval: 9, delay: 4 }],
                    },
                    {
                        until: 0.34,
                        status: "Born in the shadows",
                        message: "The Champion draws the shadows round him!",
                        tempo: 0.85,
                        speed: 1.1,
                        ambients: [{ attack: "Shadow rings", interval: 7, delay: 3 }],
                    },
                    {
                        status: "Eternal",
                        message: "The Champion of Scabaras will not fall!",
                        opener: "Your shadow betrays you (first)",
                        tempo: 0.7,
                        speed: 1.2,
                        ambients: [{ attack: "Shadow rings", interval: 5, delay: 3 }],
                        // The arena darkens round him
                        light: 0.45,
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
                threshold: pause("We are born in the shadows!"),
            },
        },
    },
    {
        id: "menaphite_akh",
        name: "Menaphite Akh",
        npcId: 11493,
        idleSeq: 9426,
        walkSeq: 9425,
        attackSeq: 9427,
        deathSeq: 9433,
        hp: 1,
        damage: 2,
        speed: 2.2,
        radius: 0.5,
        xp: 0,
        knockbackResist: 1,
        sounds: NO_SOUNDS,
        boss: {
            // Its last share: quicker still
            enrage: { message: "", at: 0.15 },
            intro: rise("Menaphite Akh", "Amascut's servant"),
            attackInterval: 1.2,
            attacks: AKH_ATTACKS,
            // Doubled while her guard's down, with a gold light on her
            guard: { damage: 2, stun: 0, exposeSound: GUARD_DROP_SOUND },
            // Akkha's room has walls of its own, so no drawn square round it
            look: { edge: null, exposedLight: { radius: 2.5, color: 0xffc040, intensity: 0.6 } },
            phases: {
                phases: [
                    {
                        until: 0.68,
                        status: "The Akh strikes",
                        ambients: [{ attack: "Static", interval: 6, delay: 3 }],
                    },
                    {
                        until: 0.34,
                        status: "Her shadow turns to magic",
                        message: "The Akh's shadow darkens!",
                        opener: "Unstable orbs (first)",
                        tempo: 0.85,
                        speed: 1.1,
                        ambients: [{ attack: "Static", interval: 5, delay: 3 }],
                    },
                    {
                        status: "Darkness surrounds you",
                        message: "Darkness begins to surround you!",
                        opener: "Lightning cage",
                        tempo: 0.7,
                        speed: 1.2,
                        ambients: [
                            { attack: "Storm", interval: 7, delay: 4 },
                            { attack: "Static", interval: 4.5, delay: 2 },
                        ],
                        // The arena darkens round her
                        light: 0.35,
                    },
                ],
                // At no hitpoints, ten seconds she can't be hurt through: orbs and dives (two
                // dives to each throw) over her storm, and then she falls
                finale: {
                    seconds: 10,
                    attacks: ["Unstable orbs", "Dive (last stand)", "Dive (last stand)"],
                    interval: 1,
                    opener: "Unstable orbs",
                    ambient: { attack: "Storm", interval: 4 },
                    message: "The Akh won't fall! Live through her last stand!",
                    shout: "Amascut will not be denied!",
                },
                shieldMessage: "",
                blastMessage: "",
                // Down on her knees
                threshold: { ...pause("Feel the wrath of Amascut!"), seq: AKH_KNEEL },
            },
        },
    },
    {
        // Coenus's guards (11527): swords, after you, a few hits each
        id: "menaphite_guard",
        name: "Menaphite Guard",
        npcId: 11527,
        idleSeq: HUMAN_IDLE,
        walkSeq: HUMAN_WALK,
        attackSeq: SLASH_SEQ,
        deathSeq: HUMAN_DEATH,
        hp: 200,
        damage: 1,
        speed: 2.2,
        radius: 0.5,
        xp: 20,
        // Spears thrown from a few tiles off, so they're a threat while Coenus has you busy (the
        // bolt the Javelin Colossus throws stands in for a spear)
        shot: { range: 8, interval: 3, speed: 9, spotAnim: JAVELIN },
        sounds: NO_SOUNDS,
    },
    {
        // Her shadow (11462): shoots from afar, as the wiki has it; a few hits put it down
        id: "menaphite_shadow",
        name: "Menaphite Shadow",
        npcId: 11462,
        idleSeq: HUMAN_IDLE,
        walkSeq: HUMAN_WALK,
        attackSeq: 426,
        deathSeq: HUMAN_DEATH,
        hp: 250,
        damage: 1,
        speed: 2,
        radius: 0.5,
        xp: 30,
        shot: {
            range: 9,
            interval: 1.8,
            speed: 6,
            spotAnim: SCARAB_BOLT,
            impactSpotAnim: SHADOW_BARRAGE,
            sound: -1,
        },
        // In her dark last phase and her last stand it dives when she does (NEW-7): her dive (it's on her rig) from
        // where it stands, at whoever's nearest it, a beat after hers, leaving the Wardens'
        // shadow down its strip and a darkness orb where it stops. Two strips at once from two
        // ways, and somewhere neither reaches.
        echoes: {
            boss: "menaphite_akh",
            attacks: ["Dive flurry", "Dive (following)", "Dive (last stand)"],
            name: "Her shadow's dive",
            damage: 3,
            seq: AKH_DIVE,
            strikeAt: AKH_DIVE_AT,
            later: 0.2,
            // Two strips at most: with two shadows up, only the nearer copies her
            most: 1,
            impact: {
                trail: { spotAnim: SHADOW_FLOOR_SMALL, fit: 1 },
                spots: [{ spotAnim: DARK_ORB, fit: 1.5 }],
            },
        },
        sounds: NO_SOUNDS,
    },
];
