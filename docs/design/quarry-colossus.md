# The Quarry Colossus: design and numbers

The fight's design, the decisions behind it, and its numbers, written 2026-11-06 on the `quarry-colossus` branch
for Dynny's ask: "design a new boss battle, utilizing the new tile system and depth in the battle. Use what you
learnt doing the Saradomin boss." The data in `src/game/content/quarryColossus.ts` is the truth if these drift. The
arena is `src/game/scaperune/maps/quarryColossus.ts`; the engine pieces it adds are under Arena fights and A floor
that fights back in `docs/DEVELOPMENT.md`. Justiciar Zachariah's record (`justiciar-zachariah.md`) is where the
principles came from, and its "What's working" is the bar.

## 1. What the fight is

A boss fight on its own, open once Justiciar Zachariah is beaten. No waves, picks, items or drops. Everyone plays
the Prospector (the Motherlode Mine's kit) with a Dragon warhammer at level 5 and **Shatter**, the fight's button.

A stone colossus that worked a quarry cut down a cliff over a chasm wakes on its top shelf. The quarry is his
weapon: he stamps and the shelf heaves round his feet, he punches it and the fault line by you cracks, he hurls
boulders the quarry's pillars stop, and rocks fall off the cliff. Each phase ends with **the shelf giving way under
everyone**: the fight drops a level (65, four tiles) to the next, smaller shelf, which you've been looking down on
the whole time, the last with lava welling up through its cracks. **The quarry can be turned on him**: lure him
onto a cracked fault and it caves in under him; drop a crane's load on him; and when his guard's down, Shatter
knocks a plate off him and bares his core.

|             | Justiciar Zachariah                                 | The Quarry Colossus                                                    |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Look        | Blue-grey and gold stone over black, lilies, fire   | Grey quarried shelves, pale rock, scaffolds and cranes, lava far below |
| Danger from | Statue rows, the checker, the fire; his sword       | The floor itself heaving and falling; his boulders; the cliff's rocks  |
| Offence     | Saradomin Strike within 8.5 tiles, Smite within 3.5 | A warhammer from right by him (4.3 tiles off his middle), Shatter 4.2  |
| Structure   | Hitpoints, three phases, a kneel between            | Hitpoints, three shelves, the shelf giving way between                 |
| Arena       | One court on one level                              | Three shelves a level apart, the next always in sight below            |
| Cover       | A pillar's shadow from his gaze (a painted overlay) | Pillars of rock that stop boulders and crack, three and they fall      |

What's taken from Zachariah, on purpose: the pace (an attack about every 1.4 s, quicker by the phase), the guard
that drops on a miss (doubled damage), an arena that hurts him, a button that rewards stepping in, the impacts
(the stomp ring, dust, shake), no item bar, Retry on the results, the intro pan, a bar for each phase.

What's new, and why it's not Zachariah again:

- **The floor is the danger, read from the floor itself.** The warnings are the floor system's own: a tile about
  to heave trembles and glows in its seams; a fault about to go sags and darkens. Nothing's painted on the floor.
  Zachariah's lines and squares were the red overlays; here only a boulder's landing keeps one (section 9).
- **Height is the structure.** The phases are places, a level apart, and you fall between them.
- **Cover you can lose.** A pillar between you and him takes his boulder, cracks, and breaks on the third.
- **Melee.** A warhammer, so you fight at his feet, where his stamp is: stepping out and back in is the dance.

## 2. The arena: the Sunken Quarry

A 64 by 64 arena square (recipe `quarry_colossus`, squares 73 to 75, 80 to 82). Every shelf's fight floor is the
hidden floor the game draws over (`MapDef.floor`, `client/FloorView.ts`); the rest is scenery on blocked tiles.
Heights in height units (16 a tile), checked against `docs/design/map-depth.md`.

| Shelf    | Tiles (arena) | Size    | Height | Pillars (2 by 2) | Faults (fragile seams)          | Crane plates   |
| -------- | ------------- | ------- | ------ | ---------------- | ------------------------------- | -------------- |
| 1 (top)  | 17-46, 37-51  | 30 x 15 | 225    | 4                | 3 (two diagonals, one row of 8) | 2 (west, east) |
| 2        | 19-44, 23-35  | 26 x 13 | 160    | 3                | 3                               | 1 (east)       |
| 3 (glow) | 21-42, 10-21  | 22 x 12 | 95     | 2                | 3                               | 1 (west)       |

- **Between shelves** a face one tile deep and 65 high, looking south at the camera, the map-depth doc's "south
  drop" ("up to 65 reads well up or down, desktop and phone"). From a shelf's south half the next shelf is in
  sight below at 0.8 of the size, so the player sees where the fight's going.
- **South of the last shelf** the chasm: a face 95 (6 tiles) down to 0, dark rock at the bottom with a seam of lava
  winding through it ("dark or lava bottom"), and nothing past it. A whole floor of lava read as a lake at your own
  level (the depth doc says so, and the first look agreed), so it's a seam.
- **The faces** are bare grey rock with boulders fallen at their feet; the first look had them in the dark rock
  overlay, a brown streak against the grey slabs.
- **North** the cut face climbs off the top shelf from 225 to the byte's top (255) over two rows, two rows north of
  the shelf, with a giant statue (37818, 8.8 tiles tall: his unfinished twin) over its middle and pale rock faces
  (50964, 9.7 tall) either side, scaffolds at its foot ("cliff wall north" plus "towering temple north"). From the
  top shelf's middle about 3 tiles of it show at the top of the screen, more from its north edge: it runs off the
  top, as the brief wanted. It isn't climbable and nothing stands north of the player there to be hidden.
- **East** the spoil steps away, 32 every 4 tiles from each shelf's height ("terraced valley"), with boulders and
  rubble on the steps. **West** the quarry wall stands up to 4 tiles over each shelf (under the doc's 6 for sides),
  pale rock faces along it.
- **Cranes** (18501) stand off the shelves' edges beside their plates.

Everything off the shelves is blocked, and each shelf is its own region (`sealFrom`, `assertReachable`): the shelves
aren't joined, and the fight moves the player between them.

### The floor (`QUARRY_FLOOR`)

One `FloorDef` over all three shelves (a box with the faces between as no floor). The engine's floor is now happy in
pieces: holes, faults and fragile tiles keep **each piece** whole rather than the floor as one (`wouldSplit` counts
pieces), and a pattern can be kept to a group (`FloorPatternDef.group`), so a shelf's stamp never heaves the next
shelf down.

- Skins: the grey slab (the Wardens' slab, recoloured) with the stone material; faults the same a shade darker
  with an orange cue light; pillars the round stone column (7016) on a slab; plates the Tombs' gold glyph plate,
  lit while ready; lava (the floor's own) for the last shelf's faults and cracked slabs once it melts.
- Each shelf is a group (`shelf1` to `shelf3`, rebuild 0): it falls whole at its threshold and never comes back.
- Faults (`fault1a` and on): fragile, rebuild 12 s. A fault rises when he slams; risen once it's cracked (darker,
  askew); twice and it falls into the chasm. None runs edge to edge, so a fallen one never strands anybody.
- Pillars: the `pillar` type, rebuild 16 s; a boulder that meets one cracks it, three and it breaks and falls.
- The floor's own script is empty: he does everything to it.

## 3. The fight

Hitpoints 20,000 (the event's: the warhammer's blows are big, and a boss takes its extra hits). He walks at 2.6 tiles a second (two-thirds of the player's 4), radius 2, drawn at
2.6 times the Golem guard (npc 14125, a "rocky horror" from Uzer Mastaba). His own attacks reach 16 tiles; past
that he blinks to 6 off.

| Phase | Hitpoints | Shelf       | Status          | Adds                                                                              |
| ----- | --------- | ----------- | --------------- | --------------------------------------------------------------------------------- |
| 1     | 100-85%   | 1 (30 x 15) | The upper shelf | Stamp (cross), Fault slam, Charge, Boulder; Rockfall every 6 s                    |
| 2     | 85-45%    | 2 (26 x 13) | The cutting     | Stamp (diagonals, cross), Heave east and west, Charges (two), Boulders (two); 5 s |
| 3     | 45-0%     | 3 (22 x 12) | The glow        | Upheaval, Stamp then charge, Boulder volley (three); lava; Rockfall every 4.5 s   |

He starts an attack every 1.4 s times the phase's tempo (1, 0.9, 0.8).

### Every attack

The Prospector: 4 tiles a second, radius 0.35, about 36 hitpoints (30, +20%). Floor hits are a share of
hitpoints (10% a slab, 10% falling).

| Attack               | What it is                                                                                                                                                                                  | Damage         | Warning                                          | To be clear                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ | ------------------------------------------- |
| Stamp                | Crouch, both fists down (10782 at 1.1 s): rings of slabs heave out from 2 to 6 (7) tiles, a ring every 0.12 s, the cross's (or diagonals') spokes stay down; under him his fists, 2.4 round | 6; a slab 10%  | 1.1 s, the whole ripple cued bold from the start | onto a spoke (a step), or out past the ring |
| Fault slam           | A fist into the shelf (10780 at 0.6): the fault nearest you heaves                                                                                                                          | a slab 10%     | 1 s, its tiles cued                              | off the seam, one step                      |
| Charge               | Shoulder down, a barge down a strip 3 wide and 8 long; he goes to its end                                                                                                                   | 8              | 1 s (0.75 the second of two)                     | 1.5 + 0.35 sideways, 0.46 s                 |
| Boulder              | Torn out and hurled (10776), flying its last 0.9 s; lands in a circle 1.5 round                                                                                                             | 9              | 1.6 s (the throw, then the arc)                  | 1.85 tiles, 0.46 s; or behind a pillar      |
| Boulders, volley     | Two (phase 2) or three (phase 3) at once, round you, 3 to 3.5 tiles spread                                                                                                                  | 9 each, once   | 1.6 s                                            | as above                                    |
| Heave                | One side of the shelf heaves, row by row from the back                                                                                                                                      | a slab 10%     | 1 s, cued                                        | to the other side                           |
| Upheaval             | The whole shelf heaves front to back, a 3-wide way through wandering a tile a row                                                                                                           | a slab 10%     | 1 s, cued bold                                   | into the gap, and with it                   |
| Rockfall (the cliff) | Four rocks round you, a faint dust where each lands, falling the last 0.7 s                                                                                                                 | 6 each         | 1.6 s                                            | 1.55 tiles from a spot                      |
| The shelf giving way | The threshold: everyone's held, the shelf trembles 1.4 s and falls                                                                                                                          | none           | it's the phase change                            | nothing to do                               |
| Lava (phase 3)       | The last shelf's faults turn to lava as it begins, a share of its slabs 25 s on                                                                                                             | 4% every 0.5 s | the tiles glow                                   | off them                                    |

## 4. Fighting back

Zachariah's first playtest: "all you did was run and dodge." Here every danger the quarry throws has a way to
turn it on him.

1. **His charge that misses leaves his guard down** for 2 s: he takes double from everything (the warhammer,
   Shatter, the arena). His charge carries him its full length, so a sidestep leaves him beside you. Gold glow,
   "Guard down!", a grind of stone.
2. **A cracked fault caves in under him.** A fault he's slammed once is cracked (dark, askew). If his stamp lands
   or his charge ends with a cracked fault under him, it caves in: he sinks 1.8 tiles into the hole, stunned for
   3 s (double damage, stars), then hauls himself out onto the nearest floor (`BossDef.sinks`). Stand past a
   cracked fault and let him come to you. Not again for 8 s after a stun (`stunGrace`), as Zachariah's pillars.
3. **Crane plates.** Step on a plate (lit when ready) and the crane lets its load go over where he stands: it
   lands 1.1 s later, and if he's still within 2.4 tiles he takes 700 and is stunned 2.5 s; walked out from under,
   it misses ("The load misses..."). He stands still while he winds up, so the moment is his windup. Each plate
   rests 14 s. (`FloorTriggerDef.load`.) The plates are on the shelves' edges, away from him: going for one is a
   choice.
4. **Shatter**, the button (Space, a pad's bottom face button, the round button on a touch screen): a pickaxe blow
   for 220 from no more than 4.2 tiles off his middle (5.2 with his guard down), every 4 s. **With his guard down
   it knocks a plate of rock off him and bares his core**: his guard stays down 5 s from then, his model glows
   molten, and the bar says "Core exposed!" (`FightAbilityDef.opens`). So the button turns a 2 s window into a
   5 s one: its moment is right after a dodge.

## 5. Phases and the drop

At 85% and 45% he stops (untouchable, `threshold`), crouches and slams both fists down: "RRRAAAGH!", the stomp ring
and dust. Everyone's held where they stand (not frozen blue). After 0.4 s the whole shelf, pillars and plates
too, starts to tremble and sag (the floor's fall warning, 1.4 s). At 1.8 s it falls, and everyone drops in an arc
(1.6 tiles high, 0.9 s) to the next shelf's start, side by side in a party, unhurt; he drops to its rise, 4 or 5 tiles
north of them. He lands with a ring and a shake, stands for the rest, and rises into the phase (4.4 s in all).
Everything of his in the air is cleared as the shelf goes. (`BossPhasesDef.phases[i].descend`.)

The last shelf goes molten as he lands on it: its faults are lava from the start, and 25 s on a share of its slabs
(8%) melt too. Lava burns 4% of your hitpoints every half second and the embers drift off it.

## 6. Numbers, and how they were set

Set by the arithmetic first, then the bot (section 10), to Zachariah's marks: his careful bot cleared him in
2:10-2:25, the sloppy one in 2:46-3:03, and the sloppy one never smiting in 4:48-5:14, and a person takes about
twice the careful bot.

- **His pace** is Zachariah's: an attack every 1.4 s, times 1, 0.9 and 0.8 by phase; the big windups (1 to 1.6 s)
  never quicken. Phase 1 is the first 15% (3,000 hitpoints), as Dynny settled for Zachariah in round 3.
- **Damage to the Prospector** (30 hitpoints, 4 tiles a second, heals 10 a minute): his own blows 6 to 9 (a fifth
  to a third), a slab 3 (10%), a rock 6. The floor is the steady chip; his blows are what punish a misread.
- **Damage to him** is mostly the warhammer from beside him (level 5: 52 a swing every 1.25 s, plus a boss's extra
  hits), doubled while his guard's down. Shatter is 220 (440 doubled), the load 700: each worth a few seconds of
  swinging, and the core's 5 s of double is what makes Shatter matter.
- **Shatter can't chain.** A blow on a core that's already bare doesn't keep it bare (the first bot run found a
  Shatter every 4 s kept a 5 s window open for ever: the whole fight in 2 minutes with nothing else to do).
- **A load is a choice**: the plates are on the shelves' edges and he follows you; he stands still only while he
  winds up, which is when to step on one. The bot only uses one that's within 5 tiles, and that's rare (the same
  times with and without plates).

## 7. What it looks like (VFX and sounds)

`ImpactDef`s throughout, the cache's own spot animations, scaled to fit, once each.

| What                    | Spot animations (fit, tiles)                                            | Shake | Flash        |
| ----------------------- | ----------------------------------------------------------------------- | ----- | ------------ |
| Stamp                   | the Corporeal Beast's stomp ring (318, 3), blown dust (2184, 3)         | 0.4   |              |
| Charge                  | dust trail along the strip (2184, 1.4), dust (2699, 2.5), ring (318, 2) | 0.45  |              |
| Charge through a pillar | rockfall (451, 2), dust (2699, 2.5)                                     | 0.5   |              |
| Boulder landing         | rockfall (451, 1.6), blown dust (2184, 2)                               | 0.35  |              |
| Rockfall                | rockfall (451, 1.2)                                                     | 0.15  |              |
| Cave-in                 | rockfall (451, 3), blown dust (2184, 3.5)                               | 0.6   |              |
| Crane's load            | ring (318, 3), rockfall (451, 2), blown dust (2184, 3)                  | 0.6   |              |
| Shatter                 | a chip of rock (2210, 2), dust (2699, 2)                                | 0.25  |              |
| Shatter, his core bared | rockfall (451, 2.4), ring (318, 2.5)                                    | 0.45  | faint orange |
| The shelf giving way    | ring (318, 6), dust (2184, 4); landing: ring (318, 4), dust (2184, 3)   | 0.6   |              |

In the air: his boulder, the cliff's rocks and a crane's load are the cache's grey boulder NPC (4502, rolling 6120),
tumbling along an arc (`BossAttackDef.arc`), the load bigger and falling from 10 tiles up. (The Kebos boulders,
7814 and 7816, came out molten orange on the first look: wrong for the upper shelves.) The floor's own:
slabs heaving (2220), tiles falling (2228), dust and chips (2699, 2184, 2210), lava's embers (2246).

Sounds: the Golem guard's own where it has them (its block 9832 and 9834 as his guard drops; its swing 9837 and
9841), the Tombs' rocks (6555 heaving, 6572 falling), collapsing pillars (1659) for the big crashes. Music: "The
Plundered Tomb", the Uzer Mastaba's, where the Golem guard stands (the OSRS Wiki's recording).

## 8. Decisions and cuts

- **Golem guard as the colossus**, scaled 2.6. Picked by looking (`scratch` renders of eight candidates): the
  Wardens are ToA's gold and black and their own fight; Zalcano is a red demon; the Ancient Guardian is purple;
  the Javelin Colossus is a man; Doom of Mokhaiotl is its own boss. The Golem guard is tan quarried stone, walks,
  and its swing, slam and throw animations are on its skeleton (seen frame by frame).
- **The terraces are side by side, not stacked.** True stacked planes are 2-4 weeks (map-depth part 1, section 4).
  The shelves step south, so each drop is a face toward the camera, and the fall is the floor system's own: a
  group falling whole, and a drag in an arc.
- **Melee, not a strike.** Being at his feet is what makes his stamp's spokes matter, and a ranged player would
  stand behind cover forever (pillars stop the player's shots too).
- **Cut: his own pillar smash.** He breaks pillars only by charging through them (and his boulders crack them):
  a separate "smash the pillar you hide behind" attack was one more thing on a shelf already busy.
- **Cut: tearing a slab out to throw.** Dropping the tile under him would move him (a fallen tile shoves whoever's
  on it).
- **Kept from the brief, changed:** the stamp ripples start two rings out (under him is his fists), so his own
  stamp never cracks the fault he's on: only one already cracked caves in.
- **One multiplier** for every opening: double, as Zachariah.

## 9. Colour overlays

The floor's cues are the floor's own (trembling tiles, light in the seams), and the pillars, faults and plates are
models. Exceptions, the game's existing boss warnings: a boulder's landing circle and the charge's strip (red, as
Zachariah's lunge and ice), and the swing ring under his feet as he stamps.

## 10. Numbers from the bot

`FLAT=1 MAP=quarry_colossus DODGE=1 bun run tsx scripts/game/simulate-run.ts prospector 3` (no cache; on a floor's map
only the floor's box is open). The bot now reads a floor: off any tile about to rise or fall within a second
(`offFloorMarks`), out of a swing round the boss as it winds up, out of a boulder's circle, and onto a crane's plate
near it while he winds up (`PLATES=0` never). Seeds 1 to 3, 2026-11-06:

| Bot                             | Phase 1 | Phase 2                          | Phase 3   | Whole fight    |
| ------------------------------- | ------- | -------------------------------- | --------- | -------------- |
| Careful, Shatter, `GOD=1`       | 25-33 s | 71-82 s                          | 50-61 s   | 2:28-2:53      |
| Sloppy, Shatter half, `GOD=1`   | 20-27 s | 63-106 s                         | 73-106 s  | 2:39-3:56      |
| Careful, never Shatter, `GOD=1` | 48-51 s | 130-155 s                        | 140-167 s | 5:20-6:11      |
| Careful, mortal                 | 25-30 s | died 26-36 s in                  |           | died 0:52-1:04 |
| Sloppy, mortal                  | 28-33 s | died 12-42 s in (one in phase 1) |           | died 0:33-1:10 |

The mortal bots die early in the second shelf, mostly to the floor (15 to 27 of the last 30 s's damage): it steps off
tiles about to rise one at a time, not onto a spoke as a person reads a ripple, and it walks into him through
heaving tiles to swing. Zachariah's careful bot won one of three on normal. Here it won none, so the first playtest
should say whether the floor's chip (a tenth of you a slab) is fair or needs a quarter less.

## 11. Phones

The play camera on a phone (844 by 390, 15 tiles), the game's own probe (`frameProbe.sample`), the floor at rest and
the boss in view, at the busiest spots of each shelf:

| Shelf | Where                          | Triangles     | Of which actors (the floor's tiles, him, pillars) |
| ----- | ------------------------------ | ------------- | ------------------------------------------------- |
| 1     | the start                      | 50,240        | 40,546                                            |
| 1     | the north edge (the cut face)  | 26,404        | 20,580                                            |
| 1     | the south edge (shelf 2 below) | 51,528        | 42,402                                            |
| 1     | the east edge (crane, spoil)   | 38,729        | 30,626                                            |
| 1     | the west edge                  | 21,197        | 16,644                                            |
| 2     | landed                         | 53,260        | 40,936                                            |
| 2     | the north edge                 | 31,736        | 23,256                                            |
| 2     | the south edge (shelf 3 below) | 54,038        | 42,634                                            |
| 3     | landed                         | 31,606        | 24,771                                            |
| 3     | the north and south edges      | 29,437-31,166 | 20,803-24,771                                     |

The heaviest is 54k, under the 69k budget, with the next shelf in view below. The floor is most of it: each tile at
rest is the slab's top (36 triangles), drawn as an actor. A pattern raising a ring draws those tiles whole (52), so a
big ripple adds a few thousand. `floorLint`'s rough count (every tile of all three shelves busy at once, which the
camera never sees) is 71.7k; its test allows that.

## 12. Risks, guesses and open questions

- **Guesses:** every number in section 3 is a first pass from Zachariah's arithmetic, not a playtest.
- **Open:** whether the drop should hurt (it doesn't: a phase change isn't a punishment); whether the plates
  should be on every shelf; whether Shatter's core window (5 s) is too long once players learn it.
