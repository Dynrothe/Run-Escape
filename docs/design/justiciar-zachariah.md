# Justiciar Zachariah: design and numbers

The fight's design, the decisions behind it, and its numbers, written 2026-11-04 on the
`zachariah` branch. The data in `src/game/content/zachariah.ts` is the truth if these drift. The
arena is `src/game/scaperune/maps/owlsCourt.ts`; the engine pieces it's made of are under Arena
fights in `docs/DEVELOPMENT.md`. Phosani's design record (`phosanis-nightmare.md`) is where most
of the principles below were learnt.

## 1. What the fight is

A boss fight on its own, open once Phosani's Nightmare is beaten (after the Wolf's trial, the
Owl's: both are Justiciars of the Sepulchre). No waves, picks, items or drops. Everyone plays the
Saradominist, with Saradomin Strike at level 7 and nothing more, so the kit is the whole run.

The brief was a fight like Phosani's in shape and **nothing like hers in look or play**. Hers is
a dream that throws bullet patterns at you, from her. His is a trial in a place that is itself
the weapon: most of the danger comes **from the arena**, on fixed lines you read from the
scenery, and up close he's a swordsman whose signature move drags you in and binds you.

|             | Phosani                               | Zachariah                                                                     |
| ----------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Look        | A dark dream chamber, pink and purple | Blue-grey and gold stone over black, orange lilies, fire                      |
| Danger from | Her: rings, spirals, claws            | The room: statue rows, the floor, the fire. Him: sword, wave, ice             |
| Offence     | Armadyl crossbow, kite at range       | Saradomin Strike, only within 8.5 tiles: stay close                           |
| Structure   | Shield, totems, three phases, finale  | Hitpoints, three phases, a kneel between                                      |
| Rest        | Totem blasts heal 15%                 | A pillar's shadow, the floor's safe colour; the Saradominist heals 6 a minute |

## 2. The arena

The Owl's Court (`owlsCourt.ts`, recipe `zachariah`): a 27 by 27 court of plain stone with a gold
and blue runner up its middle to the dais (the fight reads 3 by 3 cells off it, but only the
lightning's glow shows them), four 2 by 2 pillars, crossbowmen in lanes of three down both rims,
knights at the south corners, the Owl Justiciar and Saradomin's star on a dais to the north, and
a bridge of four fire rows south to a lily terrace where the player starts. It floats in the
Sepulchre's black, with a lower walkway four tiles below. The map exports everything the fight
reads (`OWLS_COURT`), and `content/zachariah.ts` turns it into the map's `features` in world
tiles: one bolt row per crossbowman (18), the knights, the fire rows, the pillars and the checker.

**The statues the fight animates are drawn by the fight.** A map square bakes each loc with its
own animation only, so a placed loc can't be told to aim, throw or blaze. The crossbowmen, the
knights and the fire jets are left out of the map (their tiles still taken and blocked) and drawn
by `BossFightView` at the same spot and turn, still until an attack plays their animation:
aim 8682 and fire 8684, throw 8667 and catch 8668, extend 8661, blaze 8662 and retract 8663.

## 3. The fight

Hitpoints 2,000 (the event's), at about 7.1 damage a second from the strike when in reach. His
own attacks reach 16 tiles; past that he kneels and comes down by you (his descent, 7964).

| Phase | Hitpoints | Status              | Adds                                                                             |
| ----- | --------- | ------------------- | -------------------------------------------------------------------------------- |
| 1     | 100-70%   | The trial begins    | Lunge, Shock wave, Ice barrage; crossbow rows every 5 s                          |
| 2     | 70-35%    | The Sepulchre wakes | Lightning (its opener), the knight's sword; rows every 4.5 s; the bridge's fire  |
| 3     | 35-0%     | The verdict         | The Owl's gaze (its opener), the combos, both knights; rows every 4 s; tempo 0.7 |

At each threshold he kneels (7965) for 2.4 s, untouchable and doing nothing, and rises (7962)
into the next phase. What a hit took past a threshold is lost, so no phase is skipped.

### The dodge arithmetic

The Saradominist moves 4 tiles a second (3.33 base, +20%), radius 0.35, 30 hitpoints.

| Attack                                               | Damage                   | Warning              | To be clear                             | Takes          |
| ---------------------------------------------------- | ------------------------ | -------------------- | --------------------------------------- | -------------- |
| Lunge: strip 2 wide, 7 long                          | 13                       | 1.1 s                | 1 + 0.35 tiles sideways                 | 0.34 s         |
| Shock wave: 1.5 wide, 6.5 tiles/s, 12 tiles          | 3, then the flurry 3 x 4 | 1.2 s + its flight   | 0.75 + 0.35 sideways                    | 0.28 s         |
| Ice barrage: 3 by 3 square                           | 4, frozen 1.5 s          | 1.3 s                | 1.5 + 0.35 from its middle              | 0.46 s         |
| Lightning: one colour's cells, then the other's      | 9                        | 1.6 s, then 1.6 s    | 1.5 + 0.35 into the next cell           | 0.46 s         |
| Knight's sword: 2.6 wide, 9 tiles/s, out 27 and back | 8 each way               | 1.3 s + its flight   | 1.3 + 0.35 sideways                     | 0.41 s         |
| The Owl's gaze                                       | 16                       | 2.6 s after his leap | into a pillar's shadow, at most 8 tiles | 2 s            |
| Crossbow rows: 3 volleys, 0.5 s apart, 9.5 tiles/s   | 3 a bolt (0.6 s grace)   | 1.2 s                | 1.5 + 0.35 + 0.3 out of a lane          | 0.54 s         |
| Bridge fire: a row burns 1.2 s every 4.5 s           | 4 every 0.5 s            | 0.8 s                | all four rows out together 1.8 s        | 1.1 s to cross |

The combos each leave a way out: the verdict's ice freezes for 1 s, and the lunge that follows is
let go 0.4 s later with a 1.15 s windup, so there's half a second free to step off its strip.
Lightning round you (only the cells in a cross round yours) is followed 0.3 s later by a
knight's sword, which is a line: there's a cell of the safe colour off it either side.

The shock wave's flurry can't be dodged once you're bound, so it's sized for that: the wave and
three slashes take 15, half the Saradominist's hitpoints.

## 4. Decisions

- **Hitpoints phases, not totems.** `BossPhasesDef` without `totems` (section 3). The kneel is a
  breath, not a heal: nothing in his court heals, and the Saradominist heals 6 a minute instead
  (`bonus.regen`), so a learnt five-minute run can afford two or three big mistakes.
- **His lightning is his own cast**, not a priest statue's: the arena has none, and a pair would
  have cost about 1,500 triangles on the phone's heaviest view.
- **The gaze is cast from the court's middle** (he leaps there first, `toMiddle`), not the dais:
  with the pillars round the middle, every spot in the court is within about eight tiles of a
  pillar's shadow from there. From the dais, the south pillars' shadows run off the court.
- **The camera leans towards him** (`BossLookDef.lean`), as in a raid's boss room, so he isn't
  under the boss bar when he's north of you.
- **Strike reach 8.5 tiles**, centre to centre. Further off the strike holds its cast (nothing to
  hit), the boss bar says "Out of reach!" and a faint ring round you shows how far it reaches.
- **The court's edges are drops**, so there's no arena edge stroke and no dim round the screen
  (`look.edge` and `look.vignette` null), and the player can leave the court for the bridge and
  terrace (`confine: false`).

## 5. Colour overlays

Real assets first, with these exceptions, all the same red the game's existing boss warnings use:
the lunge's strip, the ice's square, the wave's and the swords' lines, and the flurry's circle
(the existing swing warning). The reach ring is a faint white circle. The lightning's warning is
the Sepulchre's yellow strange-tile glow (56669) on each cell, and the gaze's safe tiles its blue
one (56670).

## 6. Numbers from the bot

`FLAT=1 MAP=zachariah DODGE=1 npx tsx scripts/game/simulate-run.ts saradominist 3` is a density
meter, not a player: it stays in reach, steps off strips, lines and squares, hides from the gaze
and steps off checker cells, and still takes what it reads late. Seeds 1 to 3, on 2026-11-04:

| Party | Lasted (seeds 1, 2, 3) | Got to         | What hit it (solo)                                                                                                    |
| ----- | ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1     | 2:55, 1:50, 3:15       | phases 2, 2, 3 | Flurry 24 / Lunge 13 / Shock wave 6; Lightning 18 / Lunge 13 / Ice 8; Gaze 16 / Flurry 12 / Swords 8 / Ice 4 / Wave 3 |
| 2     | 2:20, 3:34, 2:59       |                |                                                                                                                       |
| 4     | 3:29, 5:42, 4:43       |                |                                                                                                                       |

At the strike's 7.1 a second with the bot always in reach, phase 3 comes at about three minutes,
so a learnt run that keeps in reach takes four to five. Every hit it took is one of the big ones
it read late, never the bolts or the fire for long.
