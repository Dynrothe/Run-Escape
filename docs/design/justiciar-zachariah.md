# Justiciar Zachariah: design and numbers

The fight's design, the decisions behind it, and its numbers, written 2026-11-04 on the
`zachariah` branch, and reworked the same day after Dynny's first playtest (section 5). The data
in `src/game/content/zachariah.ts` is the truth if these drift. The arena is
`src/game/scaperune/maps/owlsCourt.ts`; the engine pieces it's made of are under Arena fights in
`docs/DEVELOPMENT.md`. Phosani's design record (`phosanis-nightmare.md`) is where most of the
principles below were learnt.

## 1. What the fight is

A boss fight on its own, open once Phosani's Nightmare is beaten (after the Wolf's trial, the
Owl's: both are Justiciars of the Sepulchre). No waves, picks, items or drops. Everyone plays the
Saradominist, with Saradomin Strike at level 7 and Smite, the fight's own button, so the kit is
the whole run.

The brief was a fight like Phosani's in shape and **nothing like hers in look or play**. Hers is
a dream that throws bullet patterns at you, from her. His is a trial in a place that is itself
the weapon: most of the danger comes **from the arena**, on fixed lines you read from the
scenery, and up close he's a swordsman whose signature move drags you in and binds you. The
player fights back: **dodging him well opens him up, his own court can be turned on him, and
Smite punishes him from up close** (section 4).

|             | Phosani                               | Zachariah                                                                         |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Look        | A dark dream chamber, pink and purple | Blue-grey and gold stone over black, orange lilies, fire                          |
| Danger from | Her: rings, spirals, claws            | The room: statue rows, the floor, the fire. Him: sword, wave, ice                 |
| Offence     | Armadyl crossbow, kite at range       | Saradomin Strike within 8.5 tiles, Smite within 3.5, both doubled while he's open |
| Structure   | Shield, totems, three phases, finale  | Hitpoints, three phases, a kneel between                                          |
| Rest        | Totem blasts heal 15%                 | A pillar's shadow, the floor's safe colour; the Saradominist heals 10 a minute    |

## 2. The arena

The Owl's Court (`owlsCourt.ts`, recipe `zachariah`): a 27 by 27 court of plain stone with a gold
and blue runner up its middle to the dais (the fight reads 3 by 3 cells off it, but only the
lightning's glow shows them), four 2 by 2 pillars, crossbowmen in lanes of three down both rims,
knights at the south corners, the Owl Justiciar and Saradomin's star on a dais to the north, and
a bridge of four fire rows south to a lily terrace. He descends in the court's middle, with the
camera on him, and it pans back to the player at the court's south edge (`BossIntroDef.pan`). It
floats in the Sepulchre's black, with a lower walkway four tiles below. The map exports
everything the fight reads (`OWLS_COURT`), and `content/zachariah.ts` turns it into the map's
`features` in world tiles: one bolt row per crossbowman (18), the knights, the fire rows, the
pillars and the checker.

**The statues the fight animates are drawn by the fight.** A map square bakes each loc with its
own animation only, so a placed loc can't be told to aim, throw or blaze. The crossbowmen, the
knights and the fire jets are left out of the map (their tiles still taken and blocked) and drawn
by `BossFightView` at the same spot and turn, still until an attack plays their animation:
aim 8682 and fire 8684, throw 8667 and catch 8668, extend 8661, blaze 8662 and retract 8663.

## 3. The fight

Hitpoints 5,600 (the event's). His own attacks reach 16 tiles; past that he kneels and comes
down by you (his descent, 7964), throwing up dust and cracking the floor where he lands.

| Phase | Hitpoints | Status              | Adds                                                                              |
| ----- | --------- | ------------------- | --------------------------------------------------------------------------------- |
| 1     | 100-78%   | The trial begins    | Lunge, Shock wave, Ice barrage; crossbow rows every 4 s                           |
| 2     | 78-40%    | The Sepulchre wakes | Lightning (its opener), Lunges, the knight's sword; rows every 3.6 s; bridge fire |
| 3     | 40-0%     | The verdict         | The Owl's gaze (its opener), the combos, both knights; rows every 3.2 s           |

He starts an attack every 1.5 s, times the phase's tempo (1, 0.9, 0.8). At each threshold he
kneels (7965) for 2.4 s, untouchable and doing nothing, and rises (7962) into the next phase.
What a hit took past a threshold is lost, so no phase is skipped.

### The dodge arithmetic

The Saradominist moves 4 tiles a second (3.33 base, +20%), radius 0.35, 30 hitpoints. The hits
are smaller than the first version's and come twice as often: more to dodge, less lost to one
mistake.

| Attack                                               | Damage                   | Warning              | To be clear                             | Takes          |
| ---------------------------------------------------- | ------------------------ | -------------------- | --------------------------------------- | -------------- |
| Lunge: strip 2 wide, 7 long; he dashes 4.5 down it   | 7                        | 0.85 s (0.65 again)  | 1 + 0.35 tiles sideways                 | 0.34 s         |
| Shock wave: 1.5 wide, 6.5 tiles/s, 12 tiles          | 2, then the flurry 3 x 3 | 1 s + its flight     | 0.75 + 0.35 sideways                    | 0.28 s         |
| Ice barrage: 3 by 3 square                           | 3, frozen 1.5 s          | 1.1 s                | 1.5 + 0.35 from its middle              | 0.46 s         |
| Lightning: one colour's cells, then the other's      | 7                        | 1.4 s, then 1.4 s    | 1.5 + 0.35 into the next cell           | 0.46 s         |
| Knight's sword: 2.6 wide, 9 tiles/s, out 27 and back | 6 each way               | 1.2 s + its flight   | 1.3 + 0.35 sideways                     | 0.41 s         |
| The Owl's gaze                                       | 14                       | 2.4 s after his leap | into a pillar's shadow, at most 8 tiles | 2 s            |
| Crossbow rows: 3 volleys, 0.5 s apart, 9.5 tiles/s   | 2 a bolt (0.6 s grace)   | 1.2 s (the aim)      | 1.5 + 0.35 + 0.3 out of a lane          | 0.54 s         |
| Bridge fire: a row burns 1.2 s every 4.5 s           | 3 every 0.5 s            | 0.8 s                | all four rows out together 1.8 s        | 1.1 s to cross |

The crossbow rows' only warning is the statues' aim (8682, 1.18 s): the faint bolts once laid
along the lanes are gone, at Dynny's word. A lane's middle is 0.54 s from safety, so the aim
leaves over half a second to read which statues are drawing.

The combos each leave a way out: the verdict's ice freezes for 1 s, and the lunge that follows is
let go 0.4 s later with a 1.15 s windup, so there's half a second free to step off its strip.
Lightning round you (only the cells in a cross round yours) is followed 0.3 s later by a
knight's sword, which is a line: there's a cell of the safe colour off it either side.

The shock wave's flurry can't be dodged once you're bound, so it's sized for that: the wave and
three slashes take 11, about a third of the Saradominist's hitpoints.

## 4. Fighting back

The playtest's first complaint was that all you did was run and dodge: the strike is automatic,
so the fight was a clock. Three mechanics, all from the one idea that **a justiciar is judged by
his own court**, put the player in it (`BossDef.guard`, `BossAttackDef.opens`, `turns`,
`line.dash`, `MapDef.fight.ability`):

1. **His guard drops when he misses (the punish window).** A Lunge or Shock wave that reaches no
   one leaves his guard down for a second: he fights on, but takes **double damage** from
   everything, his model glows gold, the boss bar says "Guard down!", and the strike goes off at
   once for anyone in reach. His lunge now carries him 4.5 tiles down its strip (stopping at
   whoever it hits), so a sidestep leaves him right beside you, open. Dodging well is how you
   deal damage.
2. **His court turns on him (turning his attacks).** He chases you, so you can lead him into his
   own traps: a bolt that reaches him stops there and hurts him (8), a lightning cell struck
   under his middle hurts him (40) and stuns him, a knight's sword through him hurts (30) and
   stuns him, and a lunge that runs into a pillar sticks his sword in the stone and stuns him.
   Stunned, he stands with the stars round his head (80) for 2.5 s, doing nothing at all, and
   takes double. Stand in front of a pillar for his lunge, or on the colour that's about to be
   struck safe with him on the other.
3. **Smite (the active).** The fight's button: Space on a keyboard, the bottom face button on a
   pad, and a big round button over the items' corner on a touch screen (they all go through
   co-op's actions, `CoopAction` `ability`, so each player has their own). It calls Saradomin's
   light down on him (1221, with the stomp ring running out under him) for 40, from no more than
   **3.5 tiles off his middle**, every 5 s. Out of reach it does
   nothing and costs nothing. It's doubled while his guard's down, so its moment is right after
   a dodge, when the lunge has left him beside you, and the button shines gold then.

Rewarded risk: Smite's reach is inside his lunge and flurry, and luring him onto lightning means
standing next to it. Readable: every opening has its own look on him (the gold glow, the stars),
a word on the boss bar, and a damage number twice the size.

Other ideas weighed and left out: a parry with a timing window (co-op's frames add input delay,
so a short window isn't fair to a guest), a dash (more dodging, not more fighting), and a statue
to charge by standing on it (a third thing to watch in a room already full of them).

## 5. Pace: before and after

Dynny's playtest: slow, nothing but dodging, never past phase 1, and he wanted him to attack
faster. Measured with the bot and `scratch` cadence counts before the rework:

- **Phase 1 was a clock.** 2,000 hitpoints, the strike's 22 every 3 s (7.1 a second) and nothing
  else hurting him: phase 1's 600 took 84 to 87 s even with the bot 92 to 94% of the time in
  reach, and the whole fight 4:50 to 5:00 at best. Nothing the player did made it shorter.
- **Downtime.** One attack every 2.4 s, more than half of them lunges; his own attacks were in
  play 59% of phase 1, and the crossbow rows came every 5 s.

After: an attack every 1.5 s (about 40 a minute in phase 1, from 25), shorter windups, a double
lunge from phase 2, rows every 4 to 3.2 s, and smaller hits. Hitpoints 5,600, phase 1 the first
22% of them. With `GOD=1` (time to kill, seeds 1 to 3):

|                                  | Phase 1 | Phase 2   | Phase 3   | Whole fight |
| -------------------------------- | ------- | --------- | --------- | ----------- |
| Before                           | 84-87 s | 97-100 s  | 106-117 s | 4:49-5:00   |
| After, the bot using Smite       | 40-45 s | 69-73 s   | 70-83 s   | 2:58-3:20   |
| After, the bot never using Smite | 56-63 s | 100-119 s | 107-118 s | 4:29-4:52   |

The target is about **four minutes for a good player**: the bot dodges what it reads and smites
every opening, but never lures him into his court, and stands in reach more than a person does.
A player who never presses Smite takes about five, the old fight's length, but with twice the
attacks and the openings in it.

## 6. What it looks like when he hits (impacts)

`BossAttackDef.impact` (an `ImpactDef`) puts the cache's own effects where a blow lands, each
scaled to fit and played once (`Effect.once`), and can shake the camera and flash the screen
faintly. The floor is dark blue-grey, so what reads on it is light: the Corporeal Beast's stomp
(318), a white ring that runs out along the floor, and pale grey dust (2184, 2699). The floor
cracks in the cache (356, 2262) are brown and vanish on it, and the area slams' dust (3405) is
a brown lump, so they're not used.

| What                                 | Spot animations (fit, tiles)                                                 | Shake | Flash     |
| ------------------------------------ | ---------------------------------------------------------------------------- | ----- | --------- |
| Lunge                                | his blue wave (1515, 1) laid along the strip; dust (2184, 2) where he stops  | 0.3   |           |
| Lunge into a pillar                  | the stomp ring (318, 2), dust (2699, 2) at the pillar's face; the stars (80) | 0.6   |           |
| Shock wave's slam                    | the stomp ring (318, 3), his blue impact (1458, 2), dust (2184, 2.5)         | 0.45  |           |
| Flurry                               | dust (2699, 1.5)                                                             | 0.15  |           |
| Ice barrage                          | (its own ice)                                                                | 0.15  |           |
| Lightning                            | (its own strikes)                                                            | 0.3   | pale blue |
| The Owl's gaze                       | the stomp ring (318, 6) across the court, dust (2184, 3)                     | 0.6   | pale gold |
| Landing from a leap, and his descent | the stomp ring (318, 2.5), dust (2184, 2.5)                                  | 0.45  |           |
| Smite                                | Saradomin's light (1221, 3) on him, the stomp ring (318, 2)                  | 0.25  |           |

The shake (`GameClient.startShake`) is 0.3 of a tile at most, over a third of a second,
fading with distance from the player, and off for anyone whose system asks for less motion or
who turns off Screen shake in the settings. Each effect is a few hundred triangles for a second
or so; a lightning colour's 40 strikes add nothing to what they were.

## 7. Decisions

- **Hitpoints phases, not totems.** `BossPhasesDef` without `totems` (section 3). The kneel is a
  breath, not a heal: nothing in his court heals, and the Saradominist heals 10 a minute instead
  (`bonus.regen`), so a learnt four-minute run can afford a few mistakes.
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
- **One multiplier for every opening.** Exposed or stunned, he takes double: one rule to learn.
  A stun is worth more only because it's longer and he does nothing in it.
- **He keeps fighting while exposed.** A window that stopped him would have slowed him down
  again; it's a second of double damage in the middle of the pressure, not a rest.

## 8. Colour overlays

Real assets first, with these exceptions, all the same red the game's existing boss warnings use:
the lunge's strip, the ice's square, the wave's and the swords' lines, and the flurry's circle
(the existing swing warning). The reach ring is a faint white circle. The lightning's warning is
a yellow strange tile's animated swirl (spotanim 1800) on each cell, and the gaze's safe tiles are
the blue strange tile's glow (56670). His guard down is his own model tinted gold and glinting
(the hit flash the game already has), and the impacts' screen flashes are a third as strong as a
power-up's.

## 9. Numbers from the bot

`FLAT=1 MAP=zachariah DODGE=1 npx tsx scripts/game/simulate-run.ts saradominist 3` is a density
meter, not a player: it stays in reach, steps off strips, lines and squares, hides from the gaze
and steps off checker cells, smites whenever his guard's down (`SMITE=0` never does), and still
takes what it reads late. It prints each phase's time and how much of it the boss was in reach.
Seeds 1 to 3, on 2026-11-04, after the rework:

| Party | Lasted (seeds 1, 2, 3)    | Got to         | What hit it (solo)                                                     |
| ----- | ------------------------- | -------------- | ---------------------------------------------------------------------- |
| 1     | won 3:14, died 1:45, 1:55 | phases 3, 3, 2 | Gaze 14 / Flurry 9 / Lunges 7; Fire 15 / Gaze 14 / Flurry 9; Flurry 27 |

Before the rework it died at 2:38, 1:00 and 3:16, in phases 2, 1 and 3, and never won.
