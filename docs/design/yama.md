# Yama in burnt Varrock: the fight's plan

A plan, written 2026-11-07 for the Battle for Varrock (PR #167), before anything was built. Dynny
asked for it on 2026-11-06. The fixed points in section 1 are his; the rest of the attacks and all
the numbers are proposals, to tune by playtest. The first build is in (section 9, which says what
changed from this plan and what's still to come): the data (`content/yama.ts`) is the truth, and
this records the why. The lessons from Zachariah's playtests (`justiciar-zachariah.md`, section 1) are
the bar: the player acts and doesn't only dodge, an attack about every 1.5 s, lots of effects,
hitboxes exactly as drawn, nothing painted on the floor as an arrow, and phone under 69k.

## 1. Dynny's brief (fixed)

- **Entering the arena starts a cinematic.** The arena is the palace floor where Yama sits. Yama
  speaks to the player, then plays his real OSRS animation where he grows big.
- **Sealed in.** When the fight starts, Yama blocks every open gap in the walls with fire. You
  can't leave during the fight.
- **The floor is the weapon.** His attacks use the floor system's tiles.
- **Immune to the gaze.** Normally the Owl's gaze can't touch him: casting it makes him say
  something, and pillars rise from the ground to shield him. They sink again afterwards.
- **The meteor.** A critical attack that kills the player in one hit, every time. The only answer
  is to cast the gaze while he's performing it, which stops it.
- **The rest of his attacks are ours to decide.** They're in section 4.

## 2. Shape

|           |                                                                                              |
| --------- | -------------------------------------------------------------------------------------------- |
| Who       | The player as Justiciar Zachariah: Lunge, Shock wave, Ice barrage, Lightning, the Owl's gaze |
| Where     | The palace floor, about 15 × 11 tiles of floor-system tiles, the throne at the north end     |
| Hitpoints | 25,200: for a hero of about 15 minutes of the hordes, straight after his second general      |
| Phases    | 100–70%, 70–35%, 35–0%                                                                       |
| Length    | About 2 minutes for that hero (varrock-generals.md, section 10)                              |
| Death     | Thrown out to the palace's court, whole, to come back when you're ready                      |

He stays near the throne end and moves along it. He doesn't chase. The danger comes from the floor
and from him at range, and close in he claws.

## 3. Start and end

**Cinematic** (`MapDef.cinematic`-style, a second one triggered by crossing into the palace):

1. The camera on Yama, still small on his throne. He looks at the player: _"Another little
   judge. Your Prysin knelt in the end. So will you."_
2. He stands, and plays his grow-big animation: the seated npc 15645 hands over to his full-size
   combat npc. The ids are to be found in the rev 242 cache (RuneLite's Yama animation names, as
   for the snap).
3. A roar. Fire runs along the palace walls and fills every gap: doors, breaches and the
   entrance from the steps. They become walls of flame (the loc the ruins already use, as
   blocking for the fight).
4. The camera returns to the player, and the fight starts. Skippable like the opening.

**The seal.** Found by code, not by hand: every walkable tile on the arena's edge that leads out
gets a wall of flame that blocks while the fight runs, so it can't miss a breach. It's lifted when
he dies.

**His death.** He staggers, shrinks back down, and the throne's fire goes out: _"This city... was
already... ash..."_ The walls of flame die down. Then a victory screen, and the map is free roam
again with the throne empty.

## 4. His attacks

Two elements, as in OSRS: **fire** (orange, burns and lingers) and **shadow** (purple, hits on the
second beat). Every attack is read from the floor or his body, never from arrows.

| Attack              | Phase | What happens                                                                                                                                              | How you beat it                                                                                              |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Hellstomp**       | 1+    | He stomps; the floor ripples out from him in rings (floor-system `ripple`), tiles rising and dropping. Every 3rd tile ring is fire and stays burning 2 s. | Step through the gaps between rings, or Lunge through one.                                                   |
| **Shadow lanes**    | 1+    | His hand drags across the floor; 3–4 lanes of tiles crack purple (`lines`), then erupt one beat later.                                                    | Stand between lanes. In phase 2+ the lanes cross.                                                            |
| **Hellfire volley** | 1+    | Fireballs arc from his hands to where you stand (2–3, 0.4 s apart); each impact leaves a burning tile for 3 s.                                            | Keep moving, and don't paint yourself into a corner of burning tiles.                                        |
| **Claw**            | 1+    | If you're within 3 tiles: a wide swipe in a cone in front of him, with a clear windup (his arm pulled back).                                              | Step out, or Lunge past behind him (his back is open for 2 s after).                                         |
| **Voidflare**       | 2+    | A slow purple orb drifts toward you and bursts into a plus-shaped pattern of shadow tiles after 5 s, or on contact.                                       | **Ice barrage freezes it and Lightning shatters it** (the player acts): a shattered flare drops a heal of 6. |
| **Element floor**   | 2+    | The whole floor's tiles glow fire and shadow in a checker; his hands flare one colour, and 1.2 s later every tile of that colour bursts.                  | Read his hands and stand on the other colour. The tiles' glow is the floor, not a painted arrow.             |
| **Collapse**        | 3     | The outer ring of floor tiles cracks (`fragile`) and falls into the lava; the arena shrinks by one ring, and comes back after the next meteor.            | Stay inside. Ripples and lanes get tighter.                                                                  |
| **Meteor**          | 1+    | The critical attack (section 5).                                                                                                                          | The gaze.                                                                                                    |

**Pace.** One attack every about 1.5 s in phase 1, about 1.2 s in phase 3. Phase 3 combines two
(lanes + volley, ripple + element floor), as Zachariah's phase 3 did.

**Damage** (the hero's hitpoints are 38): Hellstomp 8, lanes 10, volley 6 each plus 2 a second on
burning tiles, claw 12, voidflare burst 10, element floor 14, meteor everything.

**Guard down.** After a stopped meteor (section 5) and after a claw you Lunged past, he's open: he
takes double damage for 6 s and 3 s. That's how the player turns his attacks against him; without
it, the fight is pure dodging.

## 5. The gaze and the meteor

This is the fight's skill check, and it uses the real-time gaze shadows built for the kit.

**The gaze normally.** If you cast the Owl's gaze at him outside a meteor, he answers with a line
(_"Your little light? Here, let me help."_ / _"Judge me? With what?"_), and 4 pillars rise from the
floor round him (floor-system `pillar` tiles, rising from the ground like the floor's other tiles).
Their real shadows cover him, so the gaze does nothing to him. The pillars stay 5 s and sink.

- **Side use.** While they're up, the pillars also block his volleys and lanes (they're real
  occluders, as the gaze shadows are). Baiting the pillars gives you cover for a few seconds, but
  it costs the gaze, his ultimate, for its 30 s cooldown (`OWLS_GAZE_COOLDOWN`), and the fight
  waits on the meteor that long.

**The meteor.**

- **Windup.** He rises off the floor, both arms up, and the arena darkens. A meteor appears high
  above, glowing, and falls over 4.5 s. Its shadow on the floor grows (the meteor is in the sky, so
  the cue isn't painted on the floor) and his line: _"Kneel."_
- **If nothing stops it.** It lands and kills you, wherever you are and whatever your hitpoints.
  Every time.
- **The answer.** Cast the gaze at him during the windup. He's mid-cast, so he can't raise pillars;
  the gaze hits him, he's knocked out of it, and the meteor breaks apart in the sky into harmless
  embers. Then he's guard-down for 6 s.
- **Fairness:**
    - The first meteor comes at 85% hitpoints, then one every 36 s, 33 s and 30 s in his three
      phases, and always one at each phase change. None is ever sooner after the last than the
      gaze's cooldown, so a gaze that stopped one is always back for the next (the clock is
      `OWLS_GAZE_COOLDOWN` plus 6, 3 and 0, in `content/yama.ts`).
    - He never starts a meteor while your gaze has more than 2.4 s of cooldown left, so it's always
      possible to have it ready, a blessing that brings it back sooner included. The skill is not
      wasting it on him, and casting it in time.
    - The windup is long enough to finish a spell you're already casting (the root lasts until it
      strikes) and still cast the gaze.
- **Co-op.** Any player's gaze stops it. Everyone sees the shadow and the line.

## 6. Building blocks

| Need                    | What exists                                                    | What's new                                                                          |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Arena cinematic         | `MapDef.cinematic` (the opening)                               | A second, triggered by crossing a line; actors that become the fight's npc          |
| The fire seal           | Walls of flame locs in `ruins.ts`, the map check               | Tiles that block only while a fight runs; found by flood fill from the arena        |
| Floor attacks           | `core/ArenaFloor.ts`, `wardensFloor.ts`, the Wardens' patterns | His patterns as data, two element colours on the floor's skins                      |
| Gaze and pillars        | The kit's gaze, real-time shadows from the collision grid      | Pillars rising as occluders while up; "immune unless mid-meteor" on the boss        |
| Meteor                  | Boss attacks with windups, `impact`                            | An attack that kills, an interrupt by a kit ability (`interruptedBy: "owls_gaze"`)  |
| Boss fight in free roam | Boss mode in Zachariah's map                                   | A boss in an explore map, starting on entry, with a Retry that returns to the arena |

## 7. Checks before it's done

- **Bot sims.** A careful bot wins at most a third of runs. A bot that never gazes at meteors
  always dies to the first one, and a bot that wastes the gaze on him dies more.
- **Tests.** Meteor lethal; meteor stopped by a gaze mid-windup; gaze outside a meteor raises
  pillars and does nothing; the seal blocks every exit and lifts on death; Retry skips the
  cinematic; co-op in step.
- **Phone.** Big Yama, pillars, fires and the floor together under 69k.
- **Screenshots.** The arena cinematic, each attack, a stopped meteor and pillars against a gaze.

## 8. Open for Dynny

- **Numbers.** Hitpoints, damage and meteor timings are first guesses; tune by playtest.
- **After he dies.** Should the map stay free roam with the throne empty, or show a "the city is
  free" ending?
- **Losing.** Retry goes straight back into the arena (sealed, no cinematic). Should a death send
  you back to the south gate instead?

## 9. What's built (2026-11-07)

**In.** The lair (`MapDef.lair`, now `lairs`, with his generals': `varrock-generals.md`): stepping onto the palace floor wakes him, the seal is found by
code (every floor tile beside a way off it), Retry starts on his floor, and once he's dead the
fires go out and the map's free roam again with his throne empty (section 8's first two
questions, answered the simple way for now). The fight's in `content/yama.ts`: Hellstomp,
Shadow lanes, Hellfire volley, Claw and the Meteor, with the gaze, its pillars and the meteor's
clock as in section 5, and from phase 2 the Voidflare and its heal. Co-op: either player's gaze
stops the meteor for both, and a flare's burst hits every player in reach. The arena's cinematic
is his lair's opening (`LairDef.opening`, `fun/yamaWakes.ts`): as a hero steps onto the floor,
the camera goes up the hall to him on his throne and he says section 3's lines, then he does
what he does in OSRS as his fight starts, gone from his throne in a drift of embers. His intro
begins as he's gone: the dark, the seal and his rise before the throne, full size, with the
camera back to see him come up. It runs on the sim's clock, with every hero held where they
stand and nothing hurting, so co-op sees it together; a solo skip brings his intro on at once.

**Changed from the plan, and why:**

| What                      | Planned                      | Built                                       | Why                                                                                                    |
| ------------------------- | ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Floor damage              | Stomp 8, lanes 10            | 6 for any slab                              | The floor's slab damage is one number for the floor (`MapDef.floor.slam`, a share: 0.15 of 38)         |
| Hellstomp                 | Every 3rd ring burns         | Rings with the diagonals left down          | Spokes give a way through; from phase 2 quicker rings with the cross left down instead                 |
| Shadow lanes              | 3–4 lanes                    | Lanes 2 wide every 5, one through you       | The floor's `lanes` pattern; crossed from phase 2, and in phase 3 a volley follows lanes               |
| Volley                    | 2–3 at 6, burning 2 a second | 2 at 5 (3 in phase 3), burning 1 a second   | Six a hit and two a second took too much of 38 with the floor going too                                |
| Claw                      | 12, his back open 2 s        | 10, reach 3, 4.5 s cooldown, a miss opens 3 | His guard drops on any claw that misses (`guard`); a 2.5 s cooldown let a claw land inside the opening |
| Pace                      | 1.5 s, 1.2 s in phase 3      | 1.7 s, then × 0.9 and × 0.8                 | Every attack but the claw is the floor's, which already overlaps                                       |
| Meteor waits for the gaze | 4 s of cooldown left at most | 2.4 s                                       | At 4 a meteor could start that the gaze's 1.6 s windup, and a moment to turn, couldn't stop in its 4.5 |
| The meteor's cue          | Its shadow, growing          | Its shadow and a glow where it'll land      | In the dark it calls for, the shadow alone didn't show on the burnt stone                              |
| The arena cinematic       | He stands and grows big      | Gone in embers, then he rises               | OSRS's own: gone from his throne (12154, its embers 3278), up full size (12160) as the seal fires      |
| Where a flare starts      | Not said                     | Out of his hands, on your side of him       | Round him at random, one could start behind him or right on top of you (`summon.toward`)               |
| A flare on contact        | Bursts on contact            | Only once it's 1 s old (`arm`)              | Out of his hands beside a hero, it burst before anyone could see it                                    |
| A flare's plus            | Shadow tiles                 | The floor's `plus`, 4 tiles each way        | His floor's slabs, as his other patterns: 6 a slab, as for any slab (above)                            |
| Ice barrage on a flare    | Freezes it                   | Holds it 4 s, its fuse too                  | The square aims at a flare before him (`nearestFlare`), so the press goes where it's wanted            |
| Lightning on a flare      | Shatters it                  | Breaks it only while held                   | The kit's Lightning strikes the cells of the colour you're not on, so stand a cell away from it        |
| The heal                  | 6                            | 6, as the game's food                       | The game's own pickup, drawn in towards whoever comes near; in co-op it's whoever picks it up          |

**After the first playtest:**

- The meteor falls whole and breaks up where it lands, or where the gaze stops it. Its animation
  (3271) cracks at 1.98 s, and looped over the 4.5 s fall it burst halfway down and came round
  whole again.
- Shadow lanes is cast with his hands (MAGIC01). Its first animation, SUMMON01, starts with him
  under the floor, so he vanished as the lanes came up.
- The palace floor's fires block nothing.
- The gaze cast within reach of his claw, where his pillars couldn't come up between them: he
  drops what he was doing and swats the caster out of it and 7 tiles away, for 5, saying so. Up
  close the gaze had done nothing to him all along (`gazeWard` blocks it), but with no pillars
  it looked like it landed. The meteor's gaze still works at any range. The bot only gazes at the
  meteor, so its sims don't change; with `GAZE=waste` it gazes him up close while his guard's
  down and gets swatted out of reach of its sword: 96, 148, 45, 115, 56 and 137 s, into phase 2
  in three seeds (from 57, 55, 80, 92, 71 and 168 s, into phase 2 in all six).
- A lunge goes over rising slabs unharmed: section 4's way through a ring, and through lanes too.
  The bot's six seeds came out at 95, 80, 45, 138, 55 and 112 s (from 59, 77, 105, 112, 56 and
  146), into phase 3 in two: no better or worse beyond a seed's noise, and still no win.

**Not built yet:** the Element floor; the Collapse; the burning rings; fire and shadow as colours on
the floor; and the pillars blocking his volleys and lanes (they hide him from the gaze and block the
way, as planned, but don't stop his attacks).

**Phone** (740 × 360, landscape, the probe's triangles): at rest 44.7k; at the busiest, Hellstomp
49.9k, its quick rings 59.1k, Shadow lanes 54.9k, crossed lanes 59.4k, lanes then volley 55.6k,
and the meteor 61.2k. Drawn as the Wardens' floor is, his patterns on the palace's paving came to
101k: a moving tile is drawn whole (110 triangles, 38 as its top) and so are the tiles beside it,
with a glow and a cut edge under them that the ground hides anyway. The palace floor is
`onGround` now, which draws its tiles as tops unless they're coming up. With the Voidflare, at
the phone's own camera distance (15): at rest 43.9k, a flare beside you 45.8k, its plus 46.4k,
crossed lanes 62.4k, and crossed lanes with a plus 62.2k (the plus's tiles are in the lanes'
peak). A player who zooms out to 18 sees about 10k more everywhere, and crossed lanes at 75k.
His opening, at 15: up to 57.5k as the camera goes up the hall to him, and 62.3k with him risen
and the seal's fires. The shot back to see him rise came to 110k looking level across the palace,
so it looks down on him, as the run's camera does.

**Bot sims** (`MAP=battle_for_varrock`, 6 seeds, `GAZE` as below). Before the Voidflare, the
careful bot lasted 51 to 105 s (71, 105, 51, 54, 52, 89), into phase 2 in four seeds. With it,
it lasts 56 to 146 s (59, 77, 105, 112, 56, 146), into phase 2 in five seeds and phase 3 in one,
holding and breaking flares for their heal: it took 40 to 56 in all from its 38 hitpoints. It
still never wins, where section 7 asked for a third at most. Flares from phase 1 didn't help it
(44, 97, 86, 103, 55, 104), so they start in phase 2 as planned. Most of what it takes is the
floor, then claws and volleys. Before the Voidflare, with `GAZE=never` the first meteor killed
it in 5 seeds (25 to 41 s); the sixth never got him to 85%. With `GAZE=waste` it lasted 43 to
89 s, once into phase 3, and no meteor ever killed it: the meteor waits for the gaze to be ready,
so wasting it costs time between meteors, not a death. Section 7's "dies more" doesn't
hold, and that's the fairness rule working.
