# Yama in burnt Varrock: the fight's plan

A plan, written 2026-11-07 for the Battle for Varrock (PR #167), before anything is built. Dynny
asked for it on 2026-11-06. The fixed points in section 1 are his; the rest of the attacks and all
the numbers are proposals, to tune by playtest. When it's built, the data is the truth and this
records the why. The lessons from Zachariah's playtests (`justiciar-zachariah.md`, section 1) are
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

|           |                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------- |
| Who       | The player as Justiciar Zachariah: Lunge, Shock wave, Ice barrage, Lightning, the Owl's gaze   |
| Where     | The palace floor, about 15 × 11 tiles of floor-system tiles, the throne at the north end       |
| Hitpoints | 5,400 (Zachariah has 4,200; this comes after him, so it's longer)                              |
| Phases    | 100–70%, 70–35%, 35–0%                                                                         |
| Length    | About 4–5 minutes for a good run                                                               |
| Death     | The usual death screen: Retry (straight back into the fight, no cinematic) and Return to title |

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
  it costs the gaze's 12 s cooldown. If a meteor comes in that time, you're dead.

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
    - The first meteor comes at 85% hitpoints, then one every about 35 s (phase 1–2) and about 28 s
      (phase 3), and always one at each phase change.
    - He never starts a meteor while your gaze has more than 4 s of cooldown left, so it's always
      possible to have it ready. The skill is not wasting it on him, and casting it in time.
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
