# Justiciar Zachariah: design and numbers

The fight's design, the decisions behind it, and its numbers, written 2026-11-04 on the
`zachariah` branch, and reworked the same day after Dynny's first two playtests (sections 5 and
6). What he's said works is in section 1; keep it. The data
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

### What's working (playtest 2026-11-04)

Dynny, after round 2: "the attack patterns are good, the pacing is good, effects are good. This
fight up to this point has been very well designed." Keep these as they are unless he says
otherwise:

- **The attack patterns**: his lunge, shock wave and ice, the crossbow rows, the checker
  lightning, the knights' swords, the gaze and the bridge's fire, and the phase 3 combos.
- **The pacing**: an attack every 1.3 s (1.5 till round 8, at his word: "speed up the attack
  speed slightly"; times the phase's tempo), the double lunge from phase 2,
  and the crossbow volleys every 4, 3.6 and 3.2 s by phase.
- **The effects** (section 7): the stomp rings, the dust, the lunge's trail, Smite's light, the
  faint flashes and the camera shake.
- **The design of fighting back** (section 4): his guard dropping when he misses, his court
  turning on him (its bolts and the pillars; not the swords since round 5, nor his lightning
  since round 6), and Smite.

Phase 1's length isn't on the list: that's still being tuned (section 6).

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

Hitpoints 4,800 (the event's). His own attacks reach 16 tiles; past that he kneels and comes
down by you (his descent, 7964), throwing up dust and cracking the floor where he lands.

| Phase | Hitpoints | Status              | Adds                                                                              |
| ----- | --------- | ------------------- | --------------------------------------------------------------------------------- |
| 1     | 100-74%   | The trial begins    | Lunge, Shock wave, Ice barrage; crossbow rows every 4 s                           |
| 2     | 74-39%    | The Sepulchre wakes | Lightning (its opener), Lunges, the knight's sword; rows every 3.6 s; bridge fire |
| 3     | 39-0%     | The verdict         | The Owl's gaze (its opener), the combos, both knights; rows every 3.2 s           |

He starts an attack every 1.3 s, times the phase's tempo (1, 0.9, 0.8). At each threshold he
kneels (7965) for 2.4 s, untouchable and doing nothing, and rises (7962) into the next phase.
What a hit took past a threshold is lost, so no phase is skipped.

### The dodge arithmetic

The Saradominist moves 4 tiles a second (3.33 base, +20%), radius 0.35, 30 hitpoints. The hits
are smaller than the first version's and come twice as often: more to dodge, less lost to one
mistake.

| Attack                                               | Damage                   | Warning              | To be clear                             | Takes          |
| ---------------------------------------------------- | ------------------------ | -------------------- | --------------------------------------- | -------------- |
| Lunge: strip 2 wide, 7 long; he dashes to its end    | 7                        | 0.85 s (0.65 again)  | 1 + 0.35 tiles sideways                 | 0.34 s         |
| Shock wave: 1.5 wide, 6.5 tiles/s, 12 tiles          | 2, then the flurry 3 x 3 | 1 s + its flight     | 0.75 + 0.35 sideways                    | 0.28 s         |
| Ice barrage: 3 by 3 square                           | 3, frozen 1.5 s          | 0.85 s               | 1.5 + 0.35 from its middle              | 0.46 s         |
| Lightning: the circle on each cell of one colour     | 7                        | 1.4 s, then 1.4 s    | 1.28 + 0.35 from a cell's middle        | 0.41 s         |
| Knight's sword: 2.6 wide, 9 tiles/s, across and back | 6 each way               | 1.2 s + its flight   | 1.3 + 0.35 sideways                     | 0.41 s         |
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
   one leaves his guard down for two seconds (1 in round 2, 1.5 in rounds 3 to 5): he fights on, but takes **double damage**
   from everything, and the strike goes off at once for anyone in reach. His lunge carries him
   to the end of its strip (his front where the strip ends; stopping at whoever it hits), so a
   sidestep leaves him right beside you, open. Dodging well is how you deal damage. The tell:
   his model glows gold, the boss bar says "Guard down!", and you hear his sword knocked aside
   (swordclash5, 1971), or a metal clang as he's stunned (clang2, 1141). Round 3 made it much
   louder (sparkles, a pulsing ring, a label, a chime); Dynny found that too obvious, and it's
   back to round 2's look with the sound added (section 6).
2. **His court turns on him (turning his attacks).** He chases you, so you can lead him into his
   own traps: a bolt that reaches him stops there and hurts him (8), and a lunge that runs into a
   pillar sticks his sword in the stone and stuns him: he stands with the stars round his head
   (80) for 2.5 s, doing nothing at all, and takes double. Then he can't be stunned for 8 s
   (`guard.stunGrace`): a pillar he runs into meanwhile only drops his guard, and his blue light
   flares round him as he shrugs it off. Stand in front of a pillar for his lunge. (The knights'
   swords stunned him until round 5, and his lightning until round 6: both caught him nearly
   every time, with no luring in it.)
3. **Smite (the active).** The fight's button: Space on a keyboard, the bottom face button on a
   pad, and a big round button in the items' corner on a touch screen (a boss fight has no
items, so the 1-4 bar and the touch items aren't shown) (they all go through
   co-op's actions, `CoopAction` `ability`, so each player has their own). It calls Saradomin's
   light down on him (1221, with the stomp ring running out under him) for 50, from no more than
   **3.5 tiles off his middle** (4.5 while his guard's down), every 4 s. Out of reach it does
   nothing and costs nothing, but a press up to 0.3 s too soon (still charging, or him up to 1.5
   tiles out of reach) is held and goes off as soon as it can. It's doubled while his guard's
   down, so its moment is right after a dodge, when the lunge has left him beside you, and the
   button shines gold then.

Rewarded risk: Smite's reach is inside his lunge and flurry, and luring his lunge into a pillar
means standing in its way. Readable: every opening has its own look on him (the gold glow, the stars),
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

Round 2's target was about four minutes for a good player.

## 6. Round 3: phase 1 still too long

Dynny, after round 2: "The phase 1 lasts way too long still, I can get him barely over half hp
before the execute." Nothing in the fight is called an execute and nothing in it is timed: no
enrage, no time limit. The likeliest reading is his shock wave ("Kneel!"), the drag, bind and
flurry, killing him halfway through phase 1. Either way the fix is the same: a person deals far
less than the bot does (he got 5,600's phase 1 about half done, where the bot cleared it in 40 s),
so phase 1 has to be short at a person's damage.

- Hitpoints 5,600 to **4,200**, and phase 1 the first **15%** (630), not 22% (1,232). Phase 2 is
  85-45%, phase 3 the last 45%.
- His guard stays down **1.5 s** after a miss, not 1: time to see it and step in.
- Smite **50 every 4 s**, from 40 every 5.

`SLOPPY=1` plays as a less careful person: it backs off out of reach 3 s in every 10 and misses
about half its chances to Smite (`SMITE=0` with it never smites at all). With `GOD=1`, seeds 1
to 3:

|                                     | Phase 1 | Phase 2   | Phase 3   | Whole fight |
| ----------------------------------- | ------- | --------- | --------- | ----------- |
| Round 2, the bot using Smite        | 34-37 s | 72-82 s   | 66-94 s   | 3:02-3:21   |
| Round 2, sloppy (in reach 72-83%)   | 37-44 s | 98-105 s  | 90-111 s  | 3:50-4:05   |
| Round 3, the bot using Smite        | 22-23 s | 43-54 s   | 57-66 s   | 2:02-2:21   |
| Round 3, sloppy (in reach 67-71%)   | 18-25 s | 66-73 s   | 59-85 s   | 2:36-2:48   |
| Round 3, sloppy, never using Smite  | 28-34 s | 98-120 s  | 85-126 s  | 3:31-4:33   |

(The round 2 rows are with round 3's other fixes in: the lunge's full dash and the swords' full
throw.) A person is slower than even the sloppy bot, so phase 1 should be well under a minute
for someone using Smite now and then, and the fight four to five minutes.

The rest of round 3:

- **The lightning's hit is the circle drawn** (`GroundPatternDef.round`): the swirl on each cell
  (1800 at 0.85 of the cell, 1.28 tiles round) is what hurts, touching it with your own 0.35, not
  the cell's square out to its corners. Before, standing a third of a tile outside the swirl
  still got you hit. The bolt (1796) lands in the middle of it as before. He's caught by it the
  same way, his middle in the circle.
- **The knights' swords fly right across the court** (`boomerang.toEdge`): out to where their
  line leaves the court, then back, rather than 27 tiles. The red line shows the whole way.
- **The lunge reaches its end**: it was drawn and hit 7 tiles out but he only went 4.5; now he
  goes 5.8, his front at the strip's end (`line.dash` is its length less his radius).
- **No item bar** in a boss fight (1-4 and the touch items): there are no items, only Smite.
- **Retry** on a boss fight's results, beside Back to the title (solo).

### Round 4

Dynny, after round 3:

1. **"The guard down is too obvious."** Round 3's sparkles, ring and label are gone: it's round
   2's gold glow and the boss bar again, plus a sound. Not a chime, at his word, but a clip that
   sits among his own blows and still says it: his sword knocked aside (swordclash5, 1971, 0.5 s)
   as his guard drops, and a clang (clang2, 1141, 0.6 s) as he's stunned. The window stays 1.5 s.
2. **Facing him through the intro.** While the player's held to watch him come down, they face
   him (where he'll land, then him), whatever's pressed (`BossIntroDef.faces`, `MovementRules.faces`,
   `Sim.introFacing`, which co-op's prediction uses too).
3. **The wrong model after Retry.** Leaving a run asks for the menus' look; Retry asks for the
   fight's straight after, before the menus' has baked. The fight's look was still the one drawn,
   so that ask did nothing, and the menus' look landed on top when its bake finished. Now asking
   for the look that's drawn drops one still baking (`GameAssets.setPlayerAppearance`, tested).
4. **"The attack with a long reach: I don't know what he's actually doing."** Not yet said
   which; his lunge reaches furthest on the ground. Every one of his own attacks played its
   animation from the start of its windup, so the blow came well before the hit: the lunge's
   slash was over 0.4 s before the strip hit and he slid down it standing still, and the slam
   fell 0.4 s before the wave went. Now each holds its first frame, the blow drawn back, and plays
   so the blow falls as it lands (`BossAttackDef.strikeAt`: the slash 0.4 s into 7853, the slam
   0.6 s into 7962): he draws back, holds, and slashes as he lunges down the strip with its trail
   and dust; he raises his sword, holds, and brings it down on the floor as the wave goes, with
   the stomp ring and his blue impact. The ice, the lightning and the gaze are timed the same way.
5. **The ice barrage quicker:** 0.85 s, from 1.1, as quick as his lunge. From the square's middle
   it's 1.85 tiles out, 0.46 s at a walk.

### Round 5

Dynny, after round 4:

1. **"The water wave spell effect points the wrong direction."** His shock wave's sprite (1515,
   the flat blue crescent) was drawn with its bow leading and its tips pointing back at him. It's
   turned round now (`BossAttackDef.spotYaw`), its tips pointing the way it goes, at whoever
   it's cast at; checked going south and east.
2. **"The flying swords should not stun him, they stun him always."** Thrown from a knight at
   where you stood, with him chasing you, a sword went through him nearly every throw. They no
   longer touch him at all; the bolts, the lightning and a lunge into a pillar still do.
3. **A tell for a phase change.** He already kneels for 2.4 s at each threshold, untouchable, with
   "You will be judged!" and a toast for the phase. Now his blue light bursts round him as he
   goes down (1458 and the stomp ring, a faint pale blue flash, a small shake), the stomp ring
   runs right across the court as he rises into the next phase (a faint gold flash, a shake), and
   the boss bar's "Phase n/3" pulses (`threshold.impact`, `riseImpact`).

### Round 6

Dynny, after round 5:

1. **"You can permanently stun the boss by standing behind a pillar."** Standing still south of a
   pillar with him north of it, he lunged into it again as soon as each stun ended: stunned 53-58%
   of a minute, 13-14 stuns (seeds 1-3). Now, after a stun, he can't be stunned again for 8 s:
   what would have stunned him only drops his guard, his blue light (1458) flaring as he shrugs
   it off. The same spot gets him stunned 21% of a minute, 5 stuns, the most it can (2.5 s in
   every 10.5). A test holds him to that.
2. **"One phase should be the full hp bar."** The boss bar shows each phase as a full bar of its
   own, full as the phase begins and empty at the next threshold (`BossPhasesDef.barPerPhase`,
   `getPhaseBarFraction`); the hitpoints and the splits are as they were. Only his fight asks
   for it; Phosani's bar is as it was.
3. **"Still very hard to actually hit the smite attack."** Smite lands the moment it's pressed,
   so it was all in being in time and in reach. A missed lunge carries him 5.8 tiles down his
   strip, so from a sidestep 1.35 tiles off it, with him 1.5 to 3 tiles away as it began, he
   ends 3 to 4.5 tiles off, past Smite's 3.5. His guard was down 1.5 s from the miss, a fifth of
   it spent on his dash. And a press a moment early (still charging, or him just out of reach)
   was refused outright. Now his guard's down for 2 s, Smite reaches 4.5 tiles while it is, and
   a press up to 0.3 s early is held and goes off as soon as it can.
4. **"The ground circle attack should not stun him, it cancels the attack almost every time."**
   His lightning no longer touches him: it's his own. Only a lunge into a pillar stuns him now,
   and the bolts still hurt him.
5. **The Owl's gaze: "Sometimes I get still hit when standing on the tiles."** Two mismatches. The
   blue tiles were worked out once, on the first frame of the windup, from where he stood
   then, but the gaze is cast from the court's middle he leaps to: the shadows drawn were from
   the wrong place until the next gaze. And a tile was drawn safe when its middle was hidden,
   while the hit went by the player's own middle, so standing near a safe tile's edge could
   still be seen. Now the shadows are from where it's cast from the start (`BossWindup.at`), and
   whoever has any part of themselves on a shadowed tile, or their middle hidden, is spared
   (`inShadow` in `core/arena.ts`, the same tiles the view draws, tested tile by tile).
6. **"The room gets brighter by him shining light and the safe areas are darker in shadow."** The
   blue strange-tile glows (56670) are gone. As he raises his sword the whole scene brightens,
   up to 60% brighter as it lands (the renderer's own brightness, `getGazeLight`, and a faint
   warm wash over the screen), and the shadows are darkened on the floor, deepening as it comes
   (smooth shapes since round 7). The shadows are a colour
   overlay, a deliberate exception to real assets: nothing in the cache casts a pillar's shadow,
   and they're the one thing on the floor that has to be read exactly. Neither flashes or moves,
   so they read the same with Screen shake off or less motion asked for.

### Round 7

Dynny: "Is it possible to make the lighting smooth?" Round 6's shadows were dark squares, a tile
at a time. Now each pillar's shadow is drawn as the shape it really casts from where he gazes
(`shadowOutline` in `core/arena.ts`: the pillar and what's behind it between the lines from him
past its outermost corners, cut at the court's edge), all four as one shape so where they meet
isn't darker, with edges blurred over about a third of a tile each way (the canvas's own shadow
blur, the shape drawn off the screen and only its blur brought on). The hit test follows the
shape, not tiles: you're spared if your middle's hidden, or any point of you or of a third of a
tile round you is (`inShadow`, looking at your middle and two rings round it, a sixteenth of a
turn apart), so the faint outer edge of the shadow counts as shadow and never the reverse. The
test walks each shadow's edges: in it, on it and out to the soft edge, spared; past that, seen.
The light eases in over the windup and back out after it lands (smoothstep, then the renderer's
brightness eased towards it), and the shadows fade in with it and out over 0.4 s after. None of
it flashes or moves, so it's the same with Screen shake off or less motion asked for. It's all
the 2D overlay: no triangles or draw calls added to the 3D view.

### Round 8

Dynny: "When he fails to stun on pillar dash, make him say 'Not this time!'", "the phase 1 is way
too short" and "speed up the attack speed slightly".

1. A lunge into a pillar while he can't be stunned (round 6's 8 s) has him shout "Not this time!"
   as he shrugs it off (`guard.resistShout`).
2. Phase 1 was 15% of 4,200 (630): the careful bot through it in 22-25 s, the sloppy one in
   25-31 s. Now hitpoints are 4,800 and phase 1 is the first 26% (1,248), phase 2 the next 35%
   (1,680, as before) and phase 3 the last 39% (1,872, as before). Phases at 74% and 39%.
3. He starts an attack every 1.3 s, from 1.5, times the phase's tempo as before. The windups are
   unchanged.

`GOD=1`, seeds 1 to 3, before round 8 and after:

|                                    | Phase 1          | Phase 2          | Phase 3           | Whole fight       |
| ---------------------------------- | ---------------- | ---------------- | ----------------- | ----------------- |
| The careful bot, smiting           | 22-25 s → 30-37 s | 49-56 s → 50-57 s | 64-90 s → 62-82 s | 2:17-2:49 → 2:31-2:49 |
| The sloppy bot, smiting half       | 25-31 s → 43-46 s | 74-98 s → 37-62 s | 80-86 s → 74-101 s | 3:04-3:34 → 2:42-3:25 |
| The sloppy bot, never smiting      | 48-56 s → 70-74 s | 90-133 s → 105-135 s | 155-176 s → 136-179 s | 5:03-6:04 → 5:10-6:27 |

The faster attacks mean more misses to punish, so phases 2 and 3 come out about as long as
before or shorter for the same hitpoints. A decent player who smites should take 40-50 s over
phase 1, about the sloppy bot's.

With the quicker ice (`GOD=1`, seeds 1 to 3): the careful bot clears phase 1 in 24-27 s and the
fight in 2:10-2:25, the sloppy one in 24-28 s and 2:46-3:03, and the sloppy one never smiting in
45-53 s and 4:48-5:14.

### Round 9 and 10

Dynny: a pet, the dark acorn or the dark squirrel, "1/10 for normal mode, 100% in hard mode";
then, once main had pets (0.25.0), "merge main into the branch, there is a pet system".

1. The **Dark squirrel** is a trophy (`trophies.ts`, id `dark_squirrel`) and a pet (`pets.ts`):
   1 in 10 for killing him, certain on hard mode (`TrophySource.hardChance`, read by
   `Sim.rollBossTrophies`). Dying to him rolls nothing; a fight map rolls only its trophies, and
   only on the kill. Its icon is the Dark acorn (obj 24733), the item that is the pet in OSRS; the
   follower is npc 9637 (`find-npcs` marks it, the one with Metamorphosis; 9638 is the other),
   idle 7309, walk 7310, model 32206. Once found it's on the Pet row like the others, and
   `slim-cache` keeps the acorn (every trophy's `objId`) and the squirrel (`getPetRequests`).
2. **Hard mode** is the map's own, unchanged: open once he's beaten, 1.3 times his hitpoints and
   damage, and every boss's attacks 15% closer together on hard (`HARD_BOSS_INTERVAL`). The
   windups and the court's tells are the same. Combat Achievements' "on hard" tasks (Beyond
   Reproach, Flawless Verdict) go by `sim.hard`, so they count there.

On hard, seeds 1 to 3: the careful bot `GOD=1` wins in 3:00-3:36 (phase 1 40-48 s), the sloppy
one in 3:50-4:16 (45-58 s), and the sloppy one never smiting in 7:00-7:26. Mortal, the careful bot
dies in 14-23 s and the sloppy one in 17 s to 1:09, both mostly to his Flurry (24 to 28 hits);
on normal the careful one won one of three. Hard is for players who've learnt him: the bot
doesn't.

## 7. What it looks like when he hits (impacts)

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

## 8. Decisions

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

## 9. Colour overlays

Real assets first, with these exceptions, all the same red the game's existing boss warnings use:
the lunge's strip, the ice's square, the wave's and the swords' lines, and the flurry's circle
(the existing swing warning). The reach ring is a faint white circle. The lightning's warning is
a yellow strange tile's animated swirl (spotanim 1800) on each cell, and the gaze's safe tiles are
darkened on the floor, the pillars' shadows, while the scene's brightened round them (round 6:
nothing in the cache casts a shadow). His guard down is his own model tinted gold and glinting
(the hit flash the game already has), and the impacts' screen flashes are a third as strong as
a power-up's.

## 10. Numbers from the bot

`FLAT=1 MAP=zachariah DODGE=1 npx tsx scripts/game/simulate-run.ts saradominist 3` is a density
meter, not a player: it stays in reach, steps off strips, lines and squares, hides from the gaze
and steps off checker cells, smites whenever his guard's down (`SMITE=0` never does), and still
takes what it reads late. It prints each phase's time and how much of it the boss was in reach.
Seeds 1 to 3, on 2026-11-04:

| Round | Bot      | Lasted (seeds 1, 2, 3)        | Got to         |
| ----- | -------- | ----------------------------- | -------------- |
| 1     | careful  | died 2:38, 1:00, 3:16         | phases 2, 1, 3 |
| 2     | careful  | won 3:14, died 1:45, 1:55     | phases 3, 3, 2 |
| 3     | careful  | died 2:12, 0:35, 1:40         | phases 3, 2, 3 |
| 3     | sloppy   | died 2:58, 2:58, won 3:09     | phases 3, 3, 3 |

Round 3's careful deaths are mostly the bridge's fire (27 and 30 of them): the bot walks onto
the bridge backing off. Every run gets through phase 1, in 18 to 25 s.
