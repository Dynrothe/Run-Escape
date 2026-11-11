# The Awakened Leviathan: design and numbers

The design of Act II's fourth and last Awakened fight, written 2026-11-11 on the `act-2` branch (pull
request #159), build-order step 14 of `act-2-fallen-empire.md`, with Lil'viathan and the act's
ending. It's in the shape of `awakened-duke.md`, and keeps what Dynny said works in Zachariah's
(`justiciar-zachariah.md`, section 1). The data in `src/game/content/leviathan.ts` is the truth if
these drift. Every id was looked up in the cache with `scripts/cache/`. The numbers are a first
pass from arithmetic and the bot (section 10), not a playtest.

## 1. What the fight is

A boss fight on its own, open once the Scar is beaten, listed on the map screen's Bosses tab after
the Awakened Duke Sucellus. No waves, picks, items or drops but its pet. Everyone plays **the
Lantern-bearer**, Fire spells at their top level (Fire Wave), and **Shadow**, the fight's button: a
shadow spell that stuns it for 3 s, its back bared for big hits (in OSRS, shadow spells stun it).

The Scar's Leviathan (section 6.5 of the act's design) is the basis: size 7, never leaving its pool,
volleys of orbs by style, debris after each that blocks its orbs and stays as cover, its tail for
anyone close, and in its last third the Abyssal pathfinder's circle, the only light. The Awakened
fight keeps all of that and turns the Scar's rule on the player:

- **The dark pulls you in.** In its first phase it glows, and can be aimed at from anywhere round
  its pool. From the second it puts its glow out: your weapon only aims at what's lit, so to hit it
  you have to bring your light to it, close enough for its tail. Its Abyssal leeches dim your light
  and pull you in further.
- **Debris is your only cover, and it's used up.** From the second phase its torrent sweeps
  everything it can see. Only behind debris are you spared, and the piece that hid you is smashed.
  The wreck round its pool stands, but it's far out, where your light doesn't reach it.
- **The pathfinder's circle** in the last phase is the only light: inside it you hit harder and
  can aim; out of it its hits do twice. The circle goes round the pool, and the cover doesn't.

What carries over from the other three, because it worked:

- **The player acts, not only dodges.** Its guard drops when its torrent finds no one (double
  damage), and the button rewards stepping in: Shadow reaches it only from close by, inside its
  tail's sweep.
- **An attack about every 1.4 s**, times the phase's tempo.
- **Lots of effects**: its orbs and their splash, the debris coming down, its tail's dust, the
  torrent's spray, a shadow spell's burst, faint flashes on the big ones, the camera's shake.
- **Read it from the world**: debris's shadow on the floor before it lands, its torrent's shadows
  drawn behind the debris and wreck as it draws breath. Warnings are drawn whatever the light.
- The player starts south of its pool; the camera's on it as it rises and pans back. No 1-4 bar.
  A death screen with **Retry**. Each phase a full bar of its own.
- **Phones**: under 69k triangles at the busiest view.

|             | Awakened Duke Sucellus                                 | Awakened Leviathan                                      |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Look        | His room in Ghorrock Prison                            | The Scar's pool, in the dark, the wreck round it        |
| Danger from | His icicles, spit and gas; the vents; the cold         | Its orbs, debris and tail; its torrent; leeches         |
| Offence     | A shortbow from anywhere in the room, Kindle's flare   | Fire spells at what's lit; Shadow's stun from close by  |
| Structure   | Hitpoints, three phases, the gaze from the second      | Hitpoints, three phases: its glow, the dark, the circle |
| Rest        | Beside a lit brazier, for as long as he doesn't see it | Behind debris, until the torrent smashes it             |

## 2. The arena

**The Scar's own ground round its pool** (square 32,99), the map's recipe (`MapRecipe.fights`, as
the Whisperer's and Vardorvis's fights are on their maps): the pool, radius 4, in the open drained
floor, and the map's square of 31 tiles round it to fight in. The map isn't changed, so the Scar's
hash and its runs stay as they are.

On it, drawn by the game: **the wreck**, six of the Scar's own broken boats and pillars (49244 to
49246, 49239, 49240) standing 9 to 12 tiles round the pool from the start and never going, and
two of the Scar's fires (49342) burning in it, 13 tiles out, lights of 3. The wreck breaks its orbs
and hides you from its torrent, as debris does, but from out there your light doesn't reach it in
the dark.

**The dark** is the Scar's lighting, darker: ambient 0.2 (the map's 0.3), and a light of 3.5 round
each player, twice that for the Lantern-bearer, and its own teal glow while it has it. As built the
light round each player is 2.5 (hers 5): at 3.5 she could hit it in the dark from out of its tail's
sweep, and the dark wouldn't pull her in.

## 3. The fight

Three phases by its hitpoints, each a full bar of its own, and at each threshold it roars, 2 s
untouchable.

| Phase | Hitpoints | Status         | Adds                                                                    |
| ----- | --------- | -------------- | ----------------------------------------------------------------------- |
| 1     | 100-65%   | The deep       | Orbs by style, debris after each, its tail                              |
| 2     | 65-30%    | The dark       | Its glow out, the scene darker; the torrent; leeches; debris on its own |
| 3     | 30-0%     | The pathfinder | The pathfinder's circle the only light; the torrent quicker; lightning  |

It has 5,200 hitpoints, set by the bot (section 10): Fire Wave does about 55 a second to it when
it can be aimed at. It starts an attack every 1.4 s, times the phase's tempo (1, 0.9, 0.8), and
never moves.

### Its attacks, and the dodge arithmetic

The Lantern-bearer has 25 hitpoints and moves 3.33 tiles a second. A big hit takes about a third.

| Attack                                                                       | Damage                        | Warning           | To be clear                  |
| ---------------------------------------------------------------------------- | ----------------------------- | ----------------- | ---------------------------- |
| Ranged orbs: three along lines fanned at where you stood as it began         | 3 each                        | 0.9 s, the lines  | off the fan's lines          |
| Magic orbs: two, slow, turning after you                                     | 4 each                        | 0.9 s             | across them, or behind cover |
| Melee orbs: one heavy one, quick, straight at you                            | 6                             | 0.9 s             | sideways as it's fired       |
| Debris: after each volley, four pieces round you, standing 14 s (10 at most) | 5                             | 1.3 s, its shadow | off the shadow               |
| Tail: round its pool, for anyone close                                       | 6                             | 0.9 s             | 7 tiles from its middle      |
| Torrent (phase 2 on): everything it can see                                  | 10                            | 2.4 s (2 in 3)    | behind debris or the wreck   |
| Leeches (phase 2): three Abyssal leeches beside you                          | 1 each, a tile off your light | they crawl        | kill them                    |
| Falling debris (phase 2 on, on its own every 5 s): two pieces round you      | 5                             | 1.3 s, its shadow | off the shadow               |
| Lightning (phase 3, on its own every 2.2 s): where you stand                 | 5                             | 1 s, its shadow   | a step                       |

**The torrent** is the fight's question: it can't be stepped out of in the open, only hidden from.
Behind a piece of debris (or the wreck) it finds no one, and its guard's down for 3 s. The debris
that hid someone is smashed. The orbs and the debris they bring are what to hide behind next time.

**Out of the circle**, in phase 3, its hits do twice (the plain fight's rule); in it, yours do 1.5
times. The abyss's lightning strikes where you stand every 2.2 s, so you keep moving with the
circle, and the torrent comes every 8 s with a 2 s windup.

## 4. Fighting back

Fire spells hit it from anywhere it's lit: from all round its pool in phase 1, from within your
light's reach of its edge in phase 2 (5 tiles for the Lantern-bearer, less dimmed), and through the
circle's light in phase 3. Her Lantern trait (20% more within 3 tiles of its edge) is worth the
walk in. What puts the player in the fight:

1. **Its guard drops when its torrent finds no one** (3 s, double damage).
2. **Shadow (the button).** Space, a pad's bottom face button, the big round button on a touch
   screen. Within 6.5 tiles of its middle (inside its tail's sweep), every 15 s: a shadow spell
   that stuns it for 3 s, whatever it was winding up lost, its guard down (double damage) and its
   back lit, and 40 damage. A stun loses whatever it was winding up, a torrent too. It can't be
   stunned again within 4 s of a stun ending (only its guard drops).

Ideas weighed and left out: OSRS's prayer switching on the orbs' styles (the game has no prayers;
the styles' speeds and turns stand in), its lightning in the enrage (the circle's enough), a lure
that lights a trap (strange, but a second thing to read in the dark next to the torrent).

## 5. Lil'viathan, and the pet slot

**Lil'viathan** (follower NPC 12160: the Leviathan's own model, small, idle 10277, walk 10292) is
the fourth fighting pet (`act-2-fallen-empire.md` 8.4).

- **What it does**: every 20 s it blows a bubble round you that takes the next enemy's hit, up to
  a quarter of your hitpoints, and pops, knocking back what's within 2.5 tiles.
- **Can't be hurt or targeted**; **in the sim** like the other three: its hero's index, the same on
  every co-op player's copy.
- **Not in boss fights**: there it's along for the look.
- A run with a looks-only pet, or none, plays exactly as before.
- **The drop**: its fight's trophy, certain on every win.

## 6. Hard mode

What it always is for a fight map: open once it's beaten, 1.3 times its hitpoints and damage, and
its attacks 15% closer together. No hard-mode look for Lil'viathan in this step.

## 7. What it looks like when it hits

| What        | Spot animations (fit, tiles)                       | Shake | Flash     |
| ----------- | -------------------------------------------------- | ----- | --------- |
| Orbs        | its own by style (2487 to 2489), the splash (2490) |       |           |
| Debris      | rocks coming down (2584), a Broken Pillar (49343)  | 0.2   |           |
| Tail        | dust (2699, 3)                                     | 0.4   |           |
| Torrent     | its splash (2490, 4), dust (2699, 4)               | 0.5   | pale teal |
| A threshold | dust (2699, 4), its splash (2490, 3)               | 0.5   | pale teal |
| Its rising  | dust (2699, 4)                                     | 0.5   |           |
| Shadow      | Shadow Barrage (383) on it, stars (80) over it     | 0.3   | violet    |
| Lightning   | a shadow first, then Akkha's lightning (2256)      | 0.15  |           |
| Wreck fires | the Scar's fire (49342), lights of 3               |       |           |

## 8. Phones

`frameProbe.sample(30)` at 844 by 390 on the phone camera (headless swiftshader): 25.5k at the
start, 28.2k with debris down, 29.3k at Shadow's stun, 22.3k in the dark, 27.0k as the pathfinder
comes, **32.6k** with lightning in the circle (the heaviest). On a desktop the heaviest is 33.0k.
The Scar's own fight was 27k up and 38k enraged with a crowd; this one has no crowd. The fight adds
two drawn fires and eight wreck pieces, and lights stay within the light budget (players, its glow,
two fires, the pathfinder).

## 9. The act's ending

Told when the fourth Awakened fight falls, whichever is fourth: a short scene of text, a line at a
time over the act's own card (no cinematic engine). The save keeps that it's been told
(`SaveData.actEndings`), so it shows once, and the act's middle card says the act's done and plays
it again. The gauntlet (step 15) opens from the same card on the same test (`isActEnded`).

## 10. Numbers from the bot

`MAP=awakened_leviathan DODGE=1 bun run tsx scripts/game/simulate-run.ts lantern_bearer 9`, with
`HARD=1` for hard mode, on the Scar's real collision. The careful bot reads its attacks as it reads
the other fights' (the ranged lines stepped off, marks stepped out of, out of the tail as it winds
up, behind the nearest debris or wreck from the torrent), and for this fight (`darkFightMove`,
`stunPress` in `bossReads.ts`): across an aimed shot's line, round the boss as one's wound up; in
to Shadow's reach while it's ready, pressed there, and close while it's stunned; in the dark,
within its own light's reach of its edge (in the tail's sweep, stepping out as it winds up); into
the pathfinder's light, on its side towards it. 2026-11-11:

| Round | What changed                                                                    | Normal                                     | Hard                   |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------- |
| 0     | The draft (5,000 hp, the Scar's volleys: four ranged, three magic, two melee)   | died 0:16-0:36 to the orbs                 |                        |
| 1     | Ranged orbs as a wave's lines, magic two slow homing, melee one quick one       | died 0:37-1:53, no damage in the dark      |                        |
| 2     | The bot strafes aimed shots, stands in its own light's reach in the dark        | 6 wins of 6 (1:13-1:31), hit by little     | 4 of 6                 |
| 3     | 5,500 hp; debris on its own in the dark (three every 4 s); lightning in phase 3 | 0 of 6                                     | 0 of 6                 |
| 4     | 5,000 hp; two pieces every 6 s                                                  | 4 of 6                                     | 1 of 6                 |
| 5     | Every 5 s; lightning every 2.2 s                                                | 3 of 6                                     | 0 of 6                 |
| 6     | 5,400 hp (9 seeds)                                                              | 0 of 9                                     | 0 of 9                 |
| 7     | 5,200 hp (9 seeds), as built                                                    | 3 of 9 (1:24, 1:29, 1:54); phase 1 28-31 s | 0 of 9, died 1:26-2:45 |

**The bar is met: one bot win in three on normal, none on hard**, phase 1 about 30 s. It dies
mostly in the last phase, to lightning (doubled out of the circle) and debris, then its tail; the
torrent almost never finds it. Fire Wave does about 50 a second to it when it's lit; in the dark
phase the bot's damage drops as it works its way in, and that phase is the longest (27 to 67 s).
The first knobs for a playtest are its hitpoints, the falling debris and the lightning.

**Lil'viathan by the bot**, on the Scar at step 0 (`META=max ARMOURY=max`, warrior, wizard, ranger
and lantern_bearer by seeds 1 to 6): with no pet no wins, median end 9:27 (mean 10:02), 12 of 24
dead before 10:00; with `PET=lilviathan` no wins, median 10:25 (mean 10:28), 11 before 10:00. A
small help, as the act's design asks; the sims' spread is wide.

## 11. As built, and what differs from the act's design

- **On the Scar's own ground**, not a cut: the map's recipe with the fight in `MapRecipe.fights`, so
  the Scar's hash and its runs are untouched. The wreck and its fires are drawn by the game
  (`ArenaFeatures.wreckage`), not laid in the map.
- **The dark is turned on the player**: its glow is out from the second phase (`EnemyDef.light`
  `phases`), so the dark pulls you in to its tail; a faint drawn-only glow keeps it seen
  (`BossLookDef.darkGlow`). The player's light is 2.5 here (hers 5), half the Scar's.
- **Debris is used up**: the torrent (`cover`, with `smashes`) smashes the debris that hid someone
  (`Sim.coverPillars`, `smashDebris`); the wreck isn't.
- **Its orbs** aren't the Scar's volleys: three styles that each ask something different (a fan of
  lines, slow homing ones, one quick one), as fanned volleys of quick orbs couldn't be dodged.
- **More in the later phases than the design's kit**: debris on its own in the dark, leeches, and
  the abyss's lightning in the circle, after the bot showed the kit alone was a sure win.
- **Shadow** stuns and does 40; it also cancels a torrent wound up. `stunGrace` 4 s.
- **Camera**: leans 0.6 of the way to it, up to 5.5 tiles (4.5 on a phone), and it's drawn at 0.7.

## 12. Not verified

- How it feels to a person: the bot is a density meter, not a player.
- Co-op: the wreck and debris are the party's, each player's light and Shadow their own; untried
  with a party.
- Its sounds: none of its animations name one; the Duke's stand in, as on the Scar.
