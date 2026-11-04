import { BossAttackDef, BossDef, CombatStyle, EnemyDef } from "./types";

// The Theatre of Blood raid's bosses (raids.ts), fought in their own rooms, each as a bullet hell
// built round what its real fight is known for: the Maiden's blood closing in, the Bloat's flies,
// Sotetseg's maze as a wall with a way through, Xarpus's acid filling the floor, Verzik's three
// forms. Two of the shapes are the Theatre's own (BulletPatternDef wall and closing), and more of
// everything comes once a boss is enraged. Their own spot animations throughout: the Maiden's blood (1578, pools
// 1579), the Bloat's flies (1568) and flesh (1570, 1571), Xarpus's poison (1555, splash 1654),
// Sotetseg's orbs (1606) and ball of death (1604), and Verzik's power blast (1580), lightning (1585)
// and green ball (1598). The Bloat's flesh (1570, 1571) falls from above, so the Maiden's blood pool
// (1579) marks where it'll land.
//
// The Pestilent Bloat, Sotetseg and Verzik Vitur also turn up on Morytania, tuned for there; the
// raid's are copies of them with these fights, so Morytania plays as it did. Damage is about half
// the Nightmare's, since the raid's enemies hit 2.7 times as hard as Hallowed Night's 1.15.

// Bullets, and the ground they mark, are drawn this much brighter on the Theatre's dark floor
const BRIGHT = 0.6;

// ToB's a melee raid: its bosses pray against missiles and magic, taking this share from them
const PROTECTS = { styles: ["ranged", "magic"], damage: 0.15 } as const;
const protects: EnemyDef["protects"] = {
    styles: [...PROTECTS.styles] as CombatStyle[],
    damage: PROTECTS.damage,
};

// The first clears took little damage over a whole raid: a boss's hits do this much more than
// they were first tuned at, and a bullet can hit again this soon after the last (a second
// elsewhere), so standing in a pattern costs, as on Phosani's Nightmare (her 0.3)
const HIT_HARDER = 1.5;
const BULLET_GRACE = 0.5;
// Armour (Protect from Melee, Defence, gear) takes off at most this share of a boss's hit: fully
// built, it had made nearly every hit a 1
const ARMOR_CAP = 0.5;

// Splats (the blood 1579, the acid 1654) reach well past their middle: drawn at this size, all of
// a splat's on the ground it hurts
const SPLAT_FIT = 0.8;

// Standing on a boss was safe from most of what it did. Each boss has an attack for whoever's up
// close (its slam, stomp, bite or claws), used only within CLOSE_REACH tiles and picked about half
// the time there. A slam marks the ground under the boss as it winds up, so there's time to step
// out and back in. The slams are the stationary bosses' (the Maiden, Xarpus, Verzik's throne),
// where you could otherwise stand just inside the longest melee reach (the scythe's, about 4.35
// tiles) and outside the slam's, so they reach past it, and wind up longer for it.
const CLOSE_REACH = 4.6;
const CLOSE_WEIGHT = 10;
const SLAM_RADIUS = 4;
function slam(
    name: string,
    spotAnim: number,
    sound: number,
    damage: number,
    fit?: number,
): BossAttackDef {
    return {
        name,
        kind: "ground",
        sound,
        damage,
        windup: 1.5,
        cooldown: 4,
        range: CLOSE_REACH,
        weight: CLOSE_WEIGHT,
        ground: { spots: [{ shape: "under" }], radius: SLAM_RADIUS, spotAnim, fit },
    };
}

const MAIDEN_ATTACKS: BossAttackDef[] = [
    // Her blood bursts out round her
    slam("Blood burst", 1579, 3606, 5, SPLAT_FIT),
    {
        name: "Blood throw",
        kind: "pattern",
        spotAnim: 1578,
        impactSpotAnim: 1579,
        sound: 3605,
        damage: 2,
        windup: 1.2,
        cooldown: 3,
        range: 30,
        weight: 4,
        pattern: {
            shape: "spread",
            count: 5,
            volleys: 3,
            interval: 0.4,
            speed: 7,
            range: 20,
            radius: 0.4,
            arc: 1.1,
            bright: BRIGHT,
        },
    },
    {
        // The pools she leaves in OSRS: they stay on the floor a while
        name: "Blood pools",
        kind: "ground",
        sound: 3606,
        damage: 3,
        windup: 1.2,
        cooldown: 9,
        range: 30,
        weight: 2,
        ground: {
            spots: [{ shape: "player" }, { shape: "scatter", count: 3, spread: 6 }],
            radius: 1.3,
            lingers: { seconds: 7, interval: 0.6, damage: 1 },
            spotAnim: 1579,
            fit: SPLAT_FIT,
        },
    },
    {
        // Her blood closes in round you, with one way out
        name: "Blood tide",
        kind: "pattern",
        spotAnim: 1578,
        sound: 3605,
        damage: 3,
        windup: 1.2,
        cooldown: 6,
        range: 30,
        weight: 3,
        message: "The Maiden's blood closes in! Find the way out!",
        pattern: {
            shape: "closing",
            count: 20,
            volleys: 1,
            interval: 1,
            speed: 3.5,
            range: 20,
            radius: 0.45,
            gap: 3,
            distance: 7,
            bright: BRIGHT,
        },
    },
    {
        name: "Blood flood",
        kind: "pattern",
        spotAnim: 1578,
        sound: 3605,
        damage: 3,
        windup: 1.2,
        cooldown: 6,
        range: 30,
        weight: 4,
        enraged: true,
        pattern: {
            shape: "closing",
            count: 22,
            volleys: 3,
            interval: 1.1,
            speed: 4,
            range: 20,
            radius: 0.45,
            gap: 3,
            distance: 7,
            bright: BRIGHT,
        },
    },
];

const BLOAT_ATTACKS: BossAttackDef[] = [
    {
        // Wide enough to reach the longest melee weapon's reach (CLOSE_REACH), and he wakes with
        // it
        name: "Stomp",
        kind: "swing",
        sound: 918,
        damage: 6,
        windup: 1.1,
        cooldown: 0,
        range: CLOSE_REACH,
        radius: 4,
        weight: 3,
    },
    {
        name: "Falling flesh",
        kind: "ground",
        impactSpotAnim: 1570,
        sound: 922,
        damage: 4,
        windup: 1.4,
        cooldown: 4,
        range: 40,
        weight: 4,
        ground: {
            spots: [{ shape: "player" }, { shape: "scatter", count: 8, spread: 6 }],
            radius: 1.2,
            spotAnim: 1579,
            fit: SPLAT_FIT,
        },
    },
    {
        // His flies come down the corridor at you, with a way through
        name: "Flies",
        kind: "pattern",
        spotAnim: 1568,
        sound: 292,
        damage: 2,
        windup: 1.0,
        cooldown: 4,
        range: 40,
        weight: 3,
        pattern: {
            shape: "wall",
            count: 10,
            volleys: 3,
            interval: 1,
            speed: 4,
            range: 18,
            radius: 0.4,
            gap: 2,
            spacing: 0.9,
            bright: BRIGHT,
        },
    },
    {
        // His flies close in round you wherever you are, so keeping away from him isn't safe
        name: "Fly swarm",
        kind: "pattern",
        spotAnim: 1568,
        sound: 292,
        damage: 2,
        windup: 1.0,
        cooldown: 6,
        range: 40,
        weight: 4,
        pattern: {
            shape: "closing",
            count: 18,
            volleys: 3,
            interval: 0.9,
            speed: 4.5,
            range: 20,
            radius: 0.4,
            gap: 3,
            distance: 6,
            bright: BRIGHT,
        },
    },
    {
        name: "Rain of flesh",
        kind: "ground",
        impactSpotAnim: 1571,
        sound: 922,
        damage: 4,
        windup: 1.4,
        cooldown: 5,
        range: 40,
        weight: 4,
        enraged: true,
        ground: {
            spots: [{ shape: "scatter", count: 16, spread: 9 }],
            radius: 1.3,
            spotAnim: 1579,
            fit: SPLAT_FIT,
        },
    },
];

const VASILIAS_ATTACKS: BossAttackDef[] = [
    {
        name: "Bite",
        kind: "swing",
        sound: 3605,
        damage: 5,
        windup: 0.7,
        cooldown: 0,
        range: 3.2,
        radius: 2.8,
        weight: 3,
    },
    {
        name: "Spit",
        kind: "pattern",
        spotAnim: 1555,
        sound: 3605,
        damage: 2,
        windup: 0.9,
        cooldown: 2,
        range: 30,
        weight: 4,
        pattern: {
            shape: "spread",
            count: 7,
            volleys: 2,
            interval: 0.4,
            speed: 7,
            range: 16,
            radius: 0.35,
            arc: 1.4,
            bright: BRIGHT,
        },
    },
    {
        // It changes colour in OSRS: here it bursts each time
        name: "Colour burst",
        kind: "pattern",
        spotAnim: 1555,
        sound: 3606,
        damage: 2,
        windup: 1.2,
        cooldown: 5,
        range: 30,
        weight: 3,
        pattern: {
            shape: "ring",
            count: 12,
            volleys: 3,
            interval: 0.35,
            speed: 5,
            range: 16,
            radius: 0.35,
            turn: 0.26,
            bright: BRIGHT,
        },
    },
    {
        name: "Spit wall",
        kind: "pattern",
        spotAnim: 1555,
        sound: 3605,
        damage: 3,
        windup: 1.0,
        cooldown: 5,
        range: 30,
        weight: 4,
        enraged: true,
        pattern: {
            shape: "wall",
            count: 9,
            volleys: 3,
            interval: 0.8,
            speed: 5,
            range: 16,
            radius: 0.4,
            gap: 2,
            spacing: 1.4,
            bright: BRIGHT,
        },
    },
];

const SOTETSEG_ATTACKS: BossAttackDef[] = [
    {
        name: "Stomp",
        kind: "swing",
        sound: 3605,
        damage: 6,
        windup: 0.8,
        cooldown: 0,
        range: 3.4,
        radius: 3.2,
        weight: 2,
    },
    {
        name: "Orbs",
        kind: "pattern",
        spotAnim: 1606,
        sound: 162,
        seq: 8139,
        damage: 2,
        windup: 1.0,
        cooldown: 2,
        range: 30,
        weight: 4,
        pattern: {
            shape: "spread",
            count: 7,
            volleys: 3,
            interval: 0.5,
            speed: 7,
            range: 20,
            radius: 0.4,
            arc: 1.6,
            bright: BRIGHT,
        },
    },
    {
        name: "Ball of death",
        kind: "projectile",
        spotAnim: 1604,
        impactSpotAnim: 377,
        seq: 8139,
        sound: 106,
        damage: 14,
        windup: 1.2,
        cooldown: 8,
        range: 30,
        weight: 3,
        speed: 4.5,
        homing: 0.5,
        message: "Sotetseg launches a ball of death! Keep moving!",
    },
    {
        // His maze: rows of orbs down the room, each with its way through somewhere new
        name: "The maze",
        kind: "pattern",
        spotAnim: 1606,
        sound: 162,
        seq: 8139,
        damage: 3,
        windup: 1.4,
        cooldown: 7,
        range: 30,
        weight: 4,
        message: "Sotetseg's maze! Find the way through each row!",
        pattern: {
            shape: "wall",
            count: 11,
            volleys: 5,
            interval: 0.9,
            speed: 4,
            range: 20,
            radius: 0.45,
            gap: 2,
            spacing: 1.4,
            bright: BRIGHT,
        },
    },
    {
        name: "The maze (faster)",
        kind: "pattern",
        spotAnim: 1606,
        sound: 162,
        seq: 8139,
        damage: 3,
        windup: 1.2,
        cooldown: 7,
        range: 30,
        weight: 5,
        enraged: true,
        pattern: {
            shape: "wall",
            count: 11,
            volleys: 8,
            interval: 0.6,
            speed: 5,
            range: 20,
            radius: 0.45,
            gap: 2,
            spacing: 1.4,
            bright: BRIGHT,
        },
    },
];

const XARPUS_ATTACKS: BossAttackDef[] = [
    {
        // His exhumeds (32743) come up out of the floor: stand on one to smother it, or it heals
        // him (his energy orb, 1550). Only in his exhumes (BossDef.exhumes).
        name: "Exhumeds",
        kind: "ground",
        ordeal: true,
        sound: 3606,
        damage: 0,
        windup: 0.6,
        cooldown: 0,
        range: 40,
        weight: 1,
        ground: {
            spots: [{ shape: "scatter", count: 3, spread: 7, awayFrom: 2 }],
            radius: 0.9,
            locId: 32743,
            lingers: { seconds: 6, interval: 60, damage: 0 },
            smother: { seconds: 1, heal: 0.04, healSpotAnim: 1550, smotheredSpotAnim: 1549 },
        },
    },
    // Acid all round his pool
    slam("Acid burst", 1654, 3606, 4, SPLAT_FIT),
    {
        // His acid stays where it lands, so the floor fills up, as in OSRS
        name: "Acid",
        kind: "ground",
        sound: 3605,
        damage: 3,
        windup: 1.0,
        cooldown: 3,
        range: 40,
        weight: 4,
        ground: {
            spots: [{ shape: "player" }, { shape: "scatter", count: 1, spread: 5 }],
            radius: 1.3,
            // Not so long that hard's longer fight fills the floor for good
            lingers: { seconds: 4.5, interval: 0.6, damage: 0.35 },
            spotAnim: 1654,
            fit: SPLAT_FIT,
        },
    },
    {
        name: "Poison spray",
        kind: "pattern",
        spotAnim: 1555,
        impactSpotAnim: 1654,
        sound: 3605,
        damage: 2,
        windup: 1.0,
        cooldown: 5,
        range: 40,
        weight: 3,
        pattern: {
            shape: "spiral",
            count: 4,
            volleys: 24,
            interval: 0.12,
            speed: 5,
            range: 16,
            radius: 0.35,
            turn: 0.3,
            bright: BRIGHT,
        },
    },
    {
        name: "Screech",
        kind: "pattern",
        spotAnim: 1555,
        sound: 3606,
        damage: 2,
        windup: 1.2,
        cooldown: 5,
        range: 40,
        weight: 4,
        enraged: true,
        pattern: {
            shape: "ring",
            count: 20,
            volleys: 3,
            interval: 0.45,
            speed: 5,
            range: 16,
            radius: 0.35,
            turn: 0.16,
            bright: BRIGHT,
        },
    },
];

// What's added to each of Verzik's forms
const VERZIK_ONE_ATTACKS: BossAttackDef[] = [
    // Lightning round her throne (her other forms have their bounce and claws)
    slam("Lightning burst", 1585, 879, 5),
    {
        // Closes in round you, near her or far: her throne's other attacks were easy to dodge
        name: "Power blast tide",
        kind: "pattern",
        spotAnim: 1580,
        sound: 879,
        damage: 3,
        windup: 1.2,
        cooldown: 6,
        range: 40,
        weight: 3,
        pattern: {
            shape: "closing",
            count: 16,
            volleys: 2,
            interval: 1.2,
            speed: 4,
            range: 20,
            radius: 0.45,
            gap: 3,
            distance: 7,
            bright: BRIGHT,
        },
    },
    {
        name: "Power blast ring",
        kind: "pattern",
        spotAnim: 1580,
        sound: 879,
        damage: 2,
        windup: 1.4,
        cooldown: 5,
        range: 40,
        weight: 4,
        pattern: {
            shape: "ring",
            count: 10,
            volleys: 5,
            interval: 0.6,
            speed: 5,
            range: 20,
            radius: 0.45,
            turn: 0.3,
            bright: BRIGHT,
        },
    },
];
const VERZIK_TWO_ATTACKS: BossAttackDef[] = [
    {
        name: "Lightning",
        kind: "ground",
        sound: 879,
        damage: 5,
        windup: 1.2,
        cooldown: 4,
        range: 40,
        weight: 3,
        ground: {
            spots: [{ shape: "player" }, { shape: "scatter", count: 4, spread: 4 }],
            radius: 1.2,
            spotAnim: 1585,
        },
    },
    {
        name: "Green balls",
        kind: "pattern",
        spotAnim: 1598,
        sound: 879,
        damage: 2,
        windup: 1.2,
        cooldown: 5,
        range: 40,
        weight: 4,
        pattern: {
            shape: "spread",
            count: 9,
            volleys: 3,
            interval: 0.45,
            speed: 6,
            range: 20,
            radius: 0.45,
            arc: 1.8,
            bright: BRIGHT,
        },
    },
];
const VERZIK_THREE_ATTACKS: BossAttackDef[] = [
    {
        // Her yellows: a slow ball that follows you and hits hard, unless you're standing in the
        // glowing pool that comes with it. Only in her yellows (BossDef.yellows); expert's doom
        // ball is the deadly one.
        name: "Yellows",
        kind: "projectile",
        ordeal: true,
        spotAnim: 1598,
        sound: 879,
        damage: 12,
        windup: 1.2,
        cooldown: 0,
        range: 40,
        weight: 1,
        speed: 3,
        homing: 0.08,
        ground: {
            spots: [{ shape: "scatter", count: 1, spread: 7, awayFrom: 4 }],
            radius: 1.6,
            safe: true,
            lingers: { seconds: 6, interval: 60, damage: 0 },
            spotAnim: 1581,
        },
    },
    {
        // Keep away from her claws and she jumps on you
        name: "Leap",
        kind: "blast",
        sound: 3605,
        damage: 8,
        windup: 1.2,
        cooldown: 5,
        range: 40,
        minRange: 6,
        radius: 2.4,
        weight: 8,
        leap: true,
    },
    {
        // Expert mode: a slow green ball that follows you and kills you, unless you're standing
        // in the glowing circle that comes with it
        name: "Doom ball",
        kind: "projectile",
        expert: true,
        spotAnim: 1598,
        sound: 879,
        damage: 60,
        ignoreArmor: true,
        windup: 1.4,
        cooldown: 14,
        range: 40,
        weight: 6,
        speed: 2.4,
        homing: 0.05,
        message: "Verzik throws a ball that won't miss! Get in the glowing circle!",
        ground: {
            // Away from her, so getting to it means leaving her be
            spots: [{ shape: "scatter", count: 1, spread: 9, awayFrom: 8 }],
            radius: 1.6,
            safe: true,
            lingers: { seconds: 10, interval: 60, damage: 0 },
            spotAnim: 1581,
        },
    },
    {
        name: "Green balls close in",
        kind: "pattern",
        spotAnim: 1598,
        sound: 879,
        damage: 3,
        windup: 1.2,
        cooldown: 5,
        range: 40,
        weight: 4,
        pattern: {
            shape: "closing",
            count: 14,
            volleys: 1,
            interval: 1,
            speed: 4,
            range: 20,
            radius: 0.45,
            gap: 3,
            distance: 7,
            bright: BRIGHT,
        },
    },
    {
        name: "Power ring",
        kind: "pattern",
        spotAnim: 1580,
        sound: 879,
        damage: 2,
        windup: 1.2,
        cooldown: 5,
        range: 40,
        weight: 4,
        enraged: true,
        pattern: {
            shape: "ring",
            count: 12,
            volleys: 3,
            interval: 0.45,
            speed: 6,
            range: 20,
            radius: 0.45,
            turn: 0.17,
            bright: BRIGHT,
        },
    },
];

// Nylocas Vasilias's colours, on expert mode: grey, green, blue, round and round
const VASILIAS_FORMS = ["nylocas_vasilias", "nylocas_vasilias_ranged", "nylocas_vasilias_magic"];

// Nylocas Vasilias, grey: the raid's Nylocas boss, and what its other colours copy
function vasilias(): EnemyDef {
    return {
        id: "nylocas_vasilias",
        name: "Nylocas Vasilias",
        npcId: 8355,
        idleSeq: 8002,
        walkSeq: 8003,
        attackSeq: 8004,
        deathSeq: 8005,
        hp: 5600,
        damage: 0,
        speed: 2.0,
        radius: 0.45,
        xp: 1100,
        sounds: { attack: 3605, hit: 3607, death: 3606 },
        scale: 0.6,
        knockbackResist: 1,
        protects,
        onlyStyle: "melee",
        spawnMessage: "Nylocas Vasilias crawls out of the pillars!",
        boss: {
            attackInterval: 2.0,
            keepDistance: 4,
            // Its colours on normal too: the other styles do 40%, its prayer as well, so a
            // one-style build waits out two colours in three, and one with all three switches
            colours: { every: 8, forms: VASILIAS_FORMS, offStyle: 0.4 },
            enrage: { message: "Nylocas Vasilias shrieks!" },
            summonsAt: [
                { hp: 0.75, enemyId: "nylocas_ischyros", count: 6 },
                { hp: 0.5, enemyId: "nylocas_toxobolos", count: 6 },
                { hp: 0.25, enemyId: "nylocas_hagios", count: 6 },
            ],
            attacks: oftener(VASILIAS_ATTACKS, 2.2, 2.0),
        },
    };
}

// A raid boss's attacks: its close attacks picked CLOSE_WEIGHT, and when it attacks more often
// than its hits were tuned for (every `from` seconds), each one lighter to match, for more to
// dodge and the same damage over time, and HIT_HARDER on top. Expert mode's own attacks keep their
// damage, as the green ball's meant to kill. What a boss fires from itself starts at its middle:
// there's no safe spot on it, for melee or anyone, only its mechanics to play.
function oftener(attacks: BossAttackDef[], from: number, to: number): BossAttackDef[] {
    return attacks.map((attack) => ({
        ...attack,
        damage: attack.expert ? attack.damage : (attack.damage * to * HIT_HARDER) / from,
        weight: attack.range <= CLOSE_REACH ? CLOSE_WEIGHT : attack.weight,
    }));
}

// A boss from elsewhere as the raid has it: its own self, a raid id, and its fight with more on top
// (or instead, when replace is set). A new attackInterval lightens its hits to match what they
// were tuned at (tunedAt, its own interval unless said).
function raidVersion(
    base: EnemyDef,
    id: string,
    attacks: BossAttackDef[],
    extra: Partial<BossDef> = {},
    replace = false,
    tunedAt = base.boss!.attackInterval,
): EnemyDef {
    const all = replace ? attacks : [...base.boss!.attacks, ...attacks];
    const interval = extra.attackInterval ?? tunedAt;
    return {
        ...base,
        id,
        protects,
        boss: {
            ...base.boss!,
            ...extra,
            attacks: oftener(all, tunedAt, interval),
        },
    };
}

// Bigger than Morytania has them, as the raid's rooms are bigger. Drawn only: what can be hit
// (radius) stays as it was. The Bloat, Nylocas Vasilias and Verzik's spider fight in small rooms,
// so they stay as they are.
function withScale(scale: number, enemy: EnemyDef): EnemyDef {
    return { ...enemy, scale };
}

// The raid's own bosses. The Bloat, Sotetseg and Verzik need Morytania's, from enemies.ts.
export function getTheatreBosses(byId: (id: string) => EnemyDef): EnemyDef[] {
    return theatreBosses(byId).map((enemy) =>
        enemy.boss
            ? { ...enemy, boss: { ...enemy.boss, bulletGrace: BULLET_GRACE, armorCap: ARMOR_CAP } }
            : enemy,
    );
}

function theatreBosses(byId: (id: string) => EnemyDef): EnemyDef[] {
    const verzikOne = byId("verzik_vitur");
    const verzikTwo = byId("verzik_vitur_risen");
    return [
        {
            id: "maiden_of_sugadinti",
            name: "The Maiden of Sugadinti",
            tags: ["vampyre"],
            npcId: 8360,
            idleSeq: 8090,
            walkSeq: 8090,
            attackSeq: 8092,
            deathSeq: 8094,
            hp: 4200,
            damage: 0,
            speed: 0,
            radius: 0.5,
            xp: 1000,
            sounds: { attack: 3605, hit: 3607, death: 3606 },
            // Six tiles across in OSRS, and she stands still, so she can be big. Drawn only: what
            // can be hit (radius) stays small, and her room's floor with it.
            scale: 1.25,
            knockbackResist: 1,
            stationary: true,
            protects,
            spawnMessage: "The Maiden of Sugadinti strains at her chains!",
            boss: {
                attackInterval: 2,
                enrage: { message: "The Maiden's blood boils!" },
                // Her Nylocas Matomenos crawl to her and feed her, as in OSRS: kill them on the
                // way, or she's back up the hitpoints you took
                summonsAt: [
                    {
                        hp: 0.8,
                        enemyId: "nylocas_matomenos_healer",
                        distance: 9,
                        count: 4,
                        message: "Nylocas Matomenos crawl to the Maiden to feed her! Kill them!",
                    },
                    {
                        hp: 0.6,
                        enemyId: "nylocas_matomenos_healer",
                        distance: 9,
                        count: 6,
                        message: "More Nylocas crawl to the Maiden!",
                    },
                    { hp: 0.5, enemyId: "blood_spawn", count: 6 },
                    {
                        hp: 0.4,
                        enemyId: "nylocas_matomenos_healer",
                        distance: 9,
                        count: 6,
                        message: "More Nylocas crawl to the Maiden!",
                    },
                    {
                        hp: 0.2,
                        enemyId: "nylocas_matomenos_healer",
                        distance: 9,
                        count: 8,
                        message: "The Nylocas swarm to the Maiden!",
                    },
                ],
                // Lighter again: a hit's moment of safety used to soak up more of her bullets
                attacks: oftener(MAIDEN_ATTACKS, 2.4, 1.8),
            },
        },
        // He walks his loop with his guard up, and goes down now and then: that's when to hit him
        raidVersion(
            byId("pestilent_bloat"),
            "tob_pestilent_bloat",
            BLOAT_ATTACKS,
            {
                // Morytania's is 3.4
                attackInterval: 3,
                naps: {
                    every: 9,
                    // Short enough that he's up for most of a fight: dodging him while he's
                    // awake is the fight, not waiting for him to go down
                    seconds: 3.5,
                    // With the prayer, missiles and magic do under 1% while he walks
                    awakeDamage: 0.05,
                    wake: "Stomp",
                    seq: 8082,
                    message: "The Pestilent Bloat goes down! Hit him now!",
                    wakeMessage: "The Pestilent Bloat gets back up!",
                },
            },
            true,
        ),
        vasilias(),
        // Its green and blue forms: its own NPCs in those colours
        ...(
            [
                ["nylocas_vasilias_ranged", 8357, 7993, 7997, 7999, 7998, "ranged"],
                ["nylocas_vasilias_magic", 8356, 7988, 7987, 7989, 7991, "magic"],
            ] as const
        ).map(
            ([id, npcId, idleSeq, walkSeq, attackSeq, deathSeq, onlyStyle]): EnemyDef => ({
                ...vasilias(),
                id,
                npcId,
                idleSeq,
                walkSeq,
                attackSeq,
                deathSeq,
                onlyStyle,
            }),
        ),
        withScale(
            1,
            raidVersion(
                byId("sotetseg"),
                "tob_sotetseg",
                SOTETSEG_ATTACKS,
                {
                    attackInterval: 1.9,
                    // He drags you into his shadow realm: no hitting him, only his maze to get
                    // through, a row after another
                    shadowRealm: {
                        at: [0.66, 0.33],
                        seconds: 16,
                        attacks: ["The maze", "The maze (faster)", "Ball of death"],
                        interval: 0.6,
                        message: "Sotetseg drags you into the shadow realm! Survive his maze!",
                        endMessage: "You escape the shadow realm. Sotetseg can be hurt again!",
                    },
                },
                true,
                2.4,
            ),
        ),
        {
            id: "xarpus",
            name: "Xarpus",
            npcId: 8340,
            idleSeq: 8058,
            walkSeq: 8058,
            attackSeq: 8059,
            deathSeq: 8063,
            hp: 6200,
            damage: 0,
            speed: 0,
            radius: 0.5,
            xp: 1200,
            sounds: { attack: 3605, hit: 3607, death: 3606 },
            // Big, as he's five tiles across in OSRS; drawn only, as the Maiden
            scale: 1.35,
            knockbackResist: 1,
            stationary: true,
            protects,
            spawnMessage: "Xarpus rises from his pool!",
            boss: {
                attackInterval: 1.7,
                enrage: { message: "Xarpus screeches, poison spraying everywhere!" },
                // He comes up out of his pool, and goes back down at half: he can't be hurt until
                // his exhumeds are smothered, and those left heal him
                exhumes: {
                    at: [1, 0.5],
                    count: 8,
                    // Not forever, for whoever doesn't know to: he rises the better for each left
                    seconds: 30,
                    leftHeal: 0.04,
                    attacks: ["Exhumeds", "Exhumeds", "Acid"],
                    interval: 1.4,
                    message: "Xarpus sinks into his pool! Stand on his exhumeds to smother them!",
                    endMessage: "Xarpus rises from his pool!",
                },
                // Expert mode: he stares one way, and hitting him from in front hurts you
                stare: {
                    every: 6,
                    arc: 2.1,
                    damage: 4,
                    message: "Xarpus turns to stare! Don't hit him from in front.",
                },
                attacks: oftener(XARPUS_ATTACKS, 2.2, 1.7),
            },
        },
        // Morytania's Verzik attacks every 2.6s
        withScale(
            1,
            raidVersion(verzikOne, "tob_verzik_vitur", VERZIK_ONE_ATTACKS, {
                attackInterval: 2,
                rises: { ...verzikOne.boss!.rises!, into: "tob_verzik_vitur_risen" },
            }),
        ),
        withScale(
            1.3,
            raidVersion(verzikTwo, "tob_verzik_vitur_risen", VERZIK_TWO_ATTACKS, {
                attackInterval: 2,
                rises: { ...verzikTwo.boss!.rises!, into: "tob_verzik_vitur_spider" },
            }),
        ),
        // Her room's small for all she throws: she throws it a little slower than her other forms
        raidVersion(
            byId("verzik_vitur_spider"),
            "tob_verzik_vitur_spider",
            VERZIK_THREE_ATTACKS,
            {
                attackInterval: 2.6,
                yellows: {
                    at: [0.66, 0.33],
                    seconds: 12,
                    attacks: ["Yellows", "Yellows", "Webs"],
                    interval: 1.4,
                    message: "Verzik throws her yellows! Get into a glowing pool as each lands!",
                    endMessage: "Verzik's yellows are spent. She can be hurt again!",
                },
            },
            false,
            2.9,
        ),
    ];
}
