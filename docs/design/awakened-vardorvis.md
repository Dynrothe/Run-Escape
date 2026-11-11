# Awakened Vardorvis: design and numbers

The design of Act II's first Awakened fight, written 2026-11-06 on the `act-2` branch (pull
request #159), build-order step 3 of `act-2-fallen-empire.md`. It's in the shape of
`justiciar-zachariah.md`, and keeps what Dynny said works there (its section 1). The data in
`src/game/content/vardorvis.ts` is the truth if these drift; the arena is the Stranglewood's own
(`src/game/scaperune/maps/stranglewood.ts`). Every id was looked up in the cache with
`scripts/cache/`. The numbers are a first pass from arithmetic and the bot (section 10), not a
playtest.

## 1. What the fight is

A boss fight on its own, open once the Stranglewood is beaten, listed on the map screen's Bosses
tab with Phosani's Nightmare and Justiciar Zachariah. No waves, picks, items or drops but his
pet. Everyone plays **the Forester** (Dynny: each Awakened fight is played as its map's
adventurer), his two-handed sword at its top level, and **Chop**, the fight's button.

OSRS's Awakened Vardorvis is the basis: the same man of the Stranglewood, sped up and hitting
harder. His **axes** swing across his arena, his **dash** leaves bleeding spikes behind it, his
**head** tears free and gazes, and the wood's **tendrils** (the blood captors of the real fight
are tendrils that drink for him) come up through the floor. Here the roots of the Stranglewood's
rule run in his arena too, and they're the thread through all of it: they close in on the
fight from the arena's edge, his dash lays them down, his tendrils erupt from them, his blood
captors stand in them, and the Forester's sword cuts them back.

What carries over from Zachariah (`justiciar-zachariah.md`, sections 1 and 4 to 8), because it
worked:

- **The player acts, not only dodges.** His guard drops when he misses (double damage), his arena
  can be turned on him (a dash into a pillar sticks his axes in it and stuns him), and the
  fight's button rewards stepping in.
- **An attack about every 1.5 s**, times the phase's tempo.
- **Lots of effects**: the cache's own dust, rings and tendril bursts on every blow, a faint
  flash on the big ones, and the camera's shake behind the Screen shake setting.
- **Read it from the world.** No arrows, rugs or painted floor. The red warnings the game already
  uses for a boss's strips and circles stay; everything else is his own model, his axes, the
  tendrils and the roots.
- **Hitboxes match what's drawn**: a root cell hurts where its roots stand, a tendril burst where
  it bursts, an axe as wide as it's drawn.
- The player starts south of where he rises, so they never run past him; the camera's on him as
  he rises and pans back. No 1-4 bar (nothing to use). A death screen with **Retry**. Each phase
  a full bar of its own.
- **Phones**: under 69k triangles at the busiest view, with every open cell rooted; no
  z-fighting.

|             | Zachariah                                           | Awakened Vardorvis                                                 |
| ----------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Look        | Blue-grey and gold stone over black                 | His pale clearing ringed with pillars, the red-black wood round it |
| Danger from | The court: statue rows, the floor, the fire         | Him, up close and fast, and the roots closing in                   |
| Offence     | Saradomin Strike within 8.5 tiles, Smite within 3.5 | A 2h sword's sweep (2.75 tiles), Chop within 3                     |
| Structure   | Hitpoints, three phases, a kneel between            | The same                                                           |
| Rest        | A pillar's shadow, the floor's safe colour          | Ground you've cut, behind a pillar                                 |

## 2. The arena

**His clearing in the Stranglewood**, the map's own recipe, not a cut of its own. The fight is kept
to the 20 by 20 square round his spot (`MapDef.bossArena`, confined while his phases are up), the
square the Stranglewood's own Vardorvis fights in. Inside it stand his ring of eight pillars (locs
48419-48428, at 4 to 6 tiles from his spot, kept by the recipe's thinning), which stop his dart;
the square's four corners are where his axes come from. He rises on his spot, as in OSRS, and the
player starts six tiles south, as the map starts them.

The roots are the Stranglewood's, kept to a circle inside the square (`RootsRuleDef.ring`): past
it is the wood, and they creep in from its edge. Its view is the clearing's, measured with the map
(54k world, 7k roots all rooted, on a phone), so it costs nothing new to draw.

The draft planned its own recipe (map square 17,53 with the fence kept); reusing the map was
quicker to build and measure, and loads what the player's already loaded for the map. The cost is
that the square's edge isn't a fence you can see: the roots creeping in from it are the edge.

## 3. The fight

Hitpoints by the bot (section 10). Three phases by his hitpoints, each a full bar of its own, and
at each threshold he goes down on one knee for 2 s, untouchable, the tendrils bursting round him,
and rises into the next.

| Phase | Hitpoints | Status         | Adds                                                                           |
| ----- | --------- | -------------- | ------------------------------------------------------------------------------ |
| 1     | 100-70%   | The axes swing | Strike, Dart (and its vines), Swinging axes; roots creep in from the edge      |
| 2     | 70-35%    | The wood wakes | Strangle, the roots rise on their own, blood captors come up at the root front |
| 3     | 35-0%     | Severed        | His head tears free and gazes; double darts; he walks quicker                  |

He has 4,000 hitpoints. He starts an attack every 1.4 s, times the phase's tempo (1, 0.9, 0.9),
and walks after the player at 3 tiles a second (the Forester's is 3.3), quicker by the phase.

### His attacks, and the dodge arithmetic

The Forester has 25 hitpoints, moves 3.33 tiles a second and is 0.35 across. A big hit takes about
a third.

| Attack                                                                                   | Damage                                             | Warning                    | To be clear                                 | Takes |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------- | ------------------------------------------- | ----- |
| Strike: a wedge 2.5 tiles out in front (short of the sword's 2.75), and under him        | 4                                                  | 0.75 s                     | at its tip, or to his side                  | 0.3 s |
| Dart: a strip 2 wide and 8 long; he dashes down it                                       | 6                                                  | 0.9 s (0.65 the second)    | 1.35 tiles sideways                         | 0.4 s |
| Bleeding vines: a ring of six bursts round where you stood, 0.2 s after a dart           | 2                                                  | 1.1 s                      | out of the ring, or stay between its bursts | 0.4 s |
| Swinging axes: an axe from a corner (both, severed), at where you stood, across and back | 3 each way                                         | 1.1 s (he raises his arms) | 1.35 tiles off each line                    | 0.4 s |
| Strangle: a tendril whipped along the ground at you, 7 tiles a second                    | 2, then bound 1.5 s and struck twice (3 each)      | 1 s, then its flight       | 0.95 tiles sideways                         | 0.3 s |
| The roots rise: tendrils burst from up to 8 rooted cells within 8 tiles of you           | 4                                                  | 1.3 s (the roots stir)     | off the cell                                | 0.3 s |
| His head's gaze: a shot every 3.5 s                                                      | 2                                                  | its flight                 | a step                                      |       |
| Roots underfoot                                                                          | 1% every 0.5 s after 0.5 s on them, and 25% slower | the sprouting, 1.5 s       | off them, or cut them                       |       |

**Dart** is the lunge of Zachariah's fight with the Stranglewood in it: he dashes down the strip,
his axes sweeping, to its end (stopping at whoever it hits), and the ground he crossed takes root
behind him (a tile either side). Dodged, it leaves him past you with his guard down; run into a
pillar, it sticks his axes in the stone and he's stunned.

**Swinging axes** are his axes (NPC 12227 spinning, 10366), thrown from the arena's corners as in
OSRS, where they swing in from its edges. They fly right across to the far side and back.

**Strangle** is the bind: a tendril (the vine burst, 2514) runs along the ground at where you
stood. Caught, you're dragged to his feet and held, and he strikes twice. Dodged, his guard drops.

**The roots** are the Stranglewood's rule (`RootsRuleDef`), on his arena: they creep in from the
clearing's edge from 5 s, quicker as the fight goes on (a spread every 3 s, every 1.8 s by three
minutes), two fronts at first and three by then. The ring they make is what closes the arena in,
phase by phase. Root hearts are the fight's **blood captors**: a Large Tendril (12225, 120
hitpoints) comes up at the root front every 30 s from 0:40 (at most two), and while it stands it
heals him half a percent of his hitpoints every 2 s (no higher than the top of the phase he's in)
and its roots creep twice as fast. Killed, it clears 5 tiles round it.

**His head** (12226) tears free at 35%, as in OSRS, and floats at the arena's edge gazing at you:
a shot every 3.5 s. It can be cut down (300 hitpoints, its own small bar), or lived with.

## 4. Fighting back

The Forester's sword is melee: he has to be beside Vardorvis to hurt him at all, which is where
Strike and Strangle are. Four things put the player in the fight rather than round it:

1. **His guard drops when he misses.** A Dart or a Strangle that reaches no one leaves his guard
   down for 2 s: he fights on but takes **double damage**, and his model glows. A dodged dart
   leaves him right beside you, past you, open.
2. **His pillars turn on him.** A Dart that runs into one of his pillars sticks there: he's stunned
   for 2.5 s with the stars round his head, doing nothing, taking double. Then not again for 8 s
   (what would have stunned him only drops his guard: "Not this time!"). Stand with a pillar
   behind you and let him come.
3. **The roots are his, and you cut them.** The Forester's sweeps cut every root cell in their arc
   (2 tiles further than anyone's, his trait), and Chop clears a circle. Ground you've cut is
   ground his tendrils can't burst from and his roots can't slow you on; ground you leave is his.
   The blood captors are the same choice: leave him for a few seconds to cut one down, or let it
   heal him.
4. **Chop (the button).** Space, a pad's bottom face button, the big round button on a touch
   screen. The Forester brings his sword down overhead: 60 to Vardorvis if he's within 3 tiles
   of his middle (4 while his guard's down, doubled with it), the same to a captor or his head
   in reach, and it **clears every root within 3 tiles** of you, whether he's there or not. Every
   4 s; a press a moment early is held and goes off as soon as it can, as Smite's is. Its moment
   is after a dodged dart: he's beside you, open, and the strip he crossed has just rooted.

Ideas weighed and left out: the Forester's Timber! as the button (a felled tree from range is
the opposite of stepping in), a parry (co-op's input delay), and roots that stun him (the arena
already has its pillars, and one luring trick is enough to learn).

## 5. Butch, and the pet slot

**Butch** (follower NPC 12158: Vardorvis's own model, small, idle 10337, walk 10339) is the
first fighting pet (`act-2-fallen-empire.md` 8.4). The pet slot is the one there already: one pet
taken into any run, chosen on the adventurer screen's Pet row (`SaveData.pet`).

- **What he does**: every 6 s, if an enemy is within 5 tiles of you, he leaps at the nearest and
  cleaves round where he lands (1.5 tiles), for 20. About a Common weapon's worth: his damage
  scales as power-ups' do, with the enemies' hitpoints over the run, the map's difficulty and hard
  mode, so he's as much use at 14:00 as at 1:00, and never more.
- **Can't be hurt or targeted**: nothing in the sim knows he's there but his own leap. Enemies
  don't look at him, and he walks where the player's pets always have (on screen only).
- **In the sim** like a thrall: the leap and its damage are the sim's, on its ticks, with its
  hero's index, deterministic and the same on every co-op player's copy (each player's pet is in
  their loadout, as now). Where he's drawn between leaps is the client's, as every pet's is: the
  sim's `petLeap` flies him straight to where he landed in four ticks (no arc), he stands there a
  moment and walks back.
- **Not in boss fights**: the kit is the whole run there, so on a fight map he's along for the
  look only, as he is before he's found.
- A run with a looks-only pet, or none, plays exactly as before (`runHash.test.ts`'s pins).
- **The drop**: he's his fight's trophy (`trophies.ts`), certain on every win, so the first win
  always gives him (Dynny: "Yes, as long as the fight is hard"). Dying rolls nothing.

### Butch by the bot

The Stranglewood at step 0, the same 8 adventurers and 3 seeds as Act II's retune (`META=max
ARMOURY=max`), with `PET=butch`: without him 1 win in 24, median end 6:31, 14 dead before 10:00;
with him at 30 a leap, 1 win, median 10:26, 8 dead before 10:00; at 20 (as built), 2 wins, median
10:25, 8 before 10:00. Most runs without him end at Kasonde (5:00), and a little more damage
round you carries the bot past him, so the median moves a lot either way. Whether he's still
small is a playtest call; his damage is the knob.

## 6. Hard mode

Hard mode is what it always is for a fight map: open once he's beaten, 1.3 times his hitpoints
and damage, and his attacks 15% closer together (`HARD_BOSS_INTERVAL`). The windups and tells are
the same. A hard-mode look for Butch (the design's recolour or glow) isn't in this step.

## 7. What it looks like when he hits

`BossAttackDef.impact` puts the cache's own effects where a blow lands, scaled to fit, once each.
The clearing's floor is pale, so the dark reads on it: the Sepulchre's dust (2184, 2699), the
tendril bursts of his own (2512, 2514), the Corporeal Beast's stomp ring (318).

| What                           | Spot animations (fit, tiles)                                   | Shake | Flash    |
| ------------------------------ | -------------------------------------------------------------- | ----- | -------- |
| Strike                         | dust (2699, 1.5)                                               | 0.2   |          |
| Dart                           | dust (2184) along the strip, dust (2699, 2) where he stops     | 0.35  |          |
| Dart into a pillar             | the stomp ring (318, 2), dust (2699, 2), the stars (80)        | 0.6   |          |
| Bleeding vines, the roots rise | the vine and tendril bursts (2514, 2512)                       |       |          |
| Strangle's bind                | the tendril burst on whoever's held (2512)                     | 0.3   |          |
| A threshold                    | tendrils bursting round him (2512, 3), the stomp ring (318, 3) | 0.4   | dark red |
| Rising into a phase            | the stomp ring (318, 7), dust (2184, 3)                        | 0.6   | dark red |
| Chop                           | dust (2699, 2), the stomp ring (318, 2)                        | 0.25  |          |
| His rising                     | dust (2699, 3)                                                 | 0.4   |          |

## 8. Phones

The fight's view is the clearing's, which the Stranglewood measured on a phone (54k world, 7k
roots all rooted, 844 by 390): the same map, the same view, so it wasn't measured again. A boss,
a head and two captors are lighter than the map's crowd.

## 9. Decisions

- **The Forester as he is**: no fight-only adventurer (the Saradominist was one), at Dynny's word
  that each fight is played as its map's adventurer. His 25 hitpoints, his sword at Dragon (level
  8), and his trait's root-cutting reach. Timber! needs kills, and there are few, so it rarely
  fires: the button is the fight's own.
- **Roots by time, not by phase.** The rule ramps over the fight's clock (3 minutes to its
  fastest), which closes the ring as the phases go by without a rule that reads the boss.
- **Captors are the rule's root hearts**, healing him: one mechanic, already drawn and taught on
  the map.
- **His clearing, not a cut of its own** (section 2): the Stranglewood's map and square, the roots
  kept to a ring in it (`RootsRuleDef.ring`). A default to confirm.
- **Captors from 0:40, by the clock**, not from the second phase: the rule's hearts come by time.
  Phase 1 takes the bot about 30 s, so they come in the second phase anyway.
- **Chop goes off with him out of reach** (`FightAbilityDef.cut`): it clears the roots round you and
  hits a captor or his head in reach, so it's worth pressing to cut your way out.
- **Not in the fight**: the Strangled (no waves), Kasonde and the bear (the map's), the prayer
  switching of the real head (there are no prayers).

## 10. Numbers from the bot

`MAP=awakened_vardorvis DODGE=1 bun run tsx scripts/game/simulate-run.ts forester 6`, with
`HARD=1` for hard mode, on the Stranglewood's real collision. The careful bot stays by him, steps
out of his strikes, strips and rings (the reads the quest's fights get: Phosani's and Zachariah's
keep their old ones), Chops while his guard's down, on roots, or with a captor or his head in
reach, and never goes after his head. Seeds 1 to 6, 2026-11-10:

| Round | What changed                                          | Normal                              | Hard           |
| ----- | ----------------------------------------------------- | ----------------------------------- | -------------- |
| 1     | The draft's numbers (5,600 hp)                        | died 0:18-0:32, phase 1, all Strike | died 0:10-0:19 |
| 2     | The newer bot reads for this fight                    | died 0:28-2:23, phase 1-2           |                |
| 3     | Strike short of the sword (2.5 tiles, 4)              | died 1:04-2:10, phase 2, axes       | died 0:34-1:29 |
| 5     | 4,800 hp, one axe till severed, softer axes and vines | died 1:48-2:45, 2 of 6 to phase 3   | died 1:22-2:05 |
| 6     | Captors heal half as much, twice as slow              | died 1:34-1:49, all to phase 3      | phase 2        |
| 7     | Roots slower (3 s to 1.8 s), his head softer          | died 1:18-2:21                      | died 1:06-1:56 |
| 9     | 4,400 hp, his dart 6                                  | died 1:19-2:18, all to phase 3      | died 0:58-1:25 |

**The bar is met: no bot win in 6 on normal, none on hard** (at most 1 in 3 on normal, none on
hard). Phase 1 takes 25 to 36 s, phase 2 37 to 56 s, and the bot dies in phase 3, 8 to 46 s in,
mostly to his head's shots and the double darts: it never cuts the head down, which a player
would. So by the bot it's above Zachariah (his careful bot won 1 in 3); whether a person can win
it is the playtest's question, and the first knobs are his hitpoints and his head.

**Eased, 2026-11-11** (Dynny agreed): in the Forgotten Four gauntlet's bot runs (`GAUNTLET=1
DODGE=1`) he took about 20 tries a win, against 2 to 8 for the other three. Numbers only, his kit
as it was: **4,400 to 4,000 hitpoints, and the severed phase's tempo 0.8 to 0.9** (an attack every
1.26 s there, not 1.12 s; he still walks quicker). The careful bot alone (`MAP=awakened_vardorvis
DODGE=1`, seeds 1-600 for normal, 1-300 for hard):

| Numbers                        | Normal wins          | Wins in   | Phase 1 | Hard     |
| ------------------------------ | -------------------- | --------- | ------- | -------- |
| 4,400 hp, tempo 0.8 (before)   | 10 of 200 (1 in 20)  | 1:34-2:21 | 23-40 s | 0 of 100 |
| 4,000 hp, tempo 0.9 (as built) | 86 of 600 (1 in 7.0) | 1:23-2:03 | 20-41 s | 0 of 300 |

In the gauntlet (24 seeds, up to 40 retries a fight) that's 141 tries for 24 wins, 5.9 a win, and
all 24 clear. Other knobs tried (seeds 1-200 or 1-600): 4,000 hp alone 1 in 15, his head's shot
every 4.5 s alone 1 in 13, tempo 0.9 alone 1 in 17, 3,800 hp with the head at 5 s 1 in 5.6. Near
these numbers the rate isn't smooth: 4,050 hp gave 1 in 5.2 and 4,100 1 in 9.4 (the bot's whole run
shifts with a few hitpoints), so read it as about 1 in 5 to 1 in 9, centred near 1 in 7.

## 11. Not verified

- How it feels to a person: the bot is a density meter, not a player.
- How any of it looks: nothing of the fight was drawn in a browser here (his rising, the axes from
  the corners, the captors, Chop, Butch's leap). The models and animations are the Stranglewood's
  Vardorvis's (Awakened Vardorvis is npc 12223 on the same skeleton).
- Chop's player animation (7644, a godsword's special brought down) and sound (2500) on the 2h
  sword; his axes' seq (10346) is also his death's, as the Stranglewood's Vardorvis has it.
- Co-op: the fight runs as any fight map does, untried with a party.
