# Beneath Cursed Sands: the fights

The quest's four fights (`content/cursedSands.ts`, its map at the end of
`scaperune/maps/tombsOfAmascut.ts`), as `docs/design/tombs-of-amascut.md` describes the quest. The
bar is Phosani's Nightmare and Justiciar Zachariah: intense from the first second, each phase
quicker with more in it, everything read before it lands, moderate damage, and a way to fight
back. All four are built to this.

## Shared: Point-blank volley

The quest's fight button (`MapDef.fight.ability`, `POINT_BLANK_VOLLEY`): a volley of crystal
arrows into the boss from within 4 tiles (5.5 while its guard's down), 30 damage, every 5 s,
doubled with a guard down as everything is (`BossDef.guard`). With two bosses up (the Scarab
Mages) it lands on either, one with its guard down first, and it breaks a spell being
channelled. A kiting player has no reason to be near a melee boss; this is one, and 4 tiles is
inside Coenus's sweep. The bot presses it whenever
a guard's down and it's in reach, which a person won't, so the sims overstate it.

## Coenus, the Head Menaphite Guard: "the Spear"

8,800 hitpoints (kept at that: the owner asked for less, not more). Everything he does is about
reach. A missed lunge, harpoon or charge leaves his guard down (`opens`), doubling what he takes,
with a gold light on him (`look.exposedLight`) and the clash of his spear (1971).

His animations, all on the human rig and measured with `classify-npc-seqs.ts`: Guthan's warspear
thrust 2080 (spear furthest out about 0.6 s in, `strikeAt` 0.6), the slash 390 (0.55), an overarm
throw 806 (`strikeAt` 0.3, a guess: check it) and the run 824 for his charge (`surgeSeq`).

| Phase                              | Attacks                                                                                | Ambient                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1, "He comes for you" (to 66%)     | Spear lunge, Sweep, Harpoon (and its Reel)                                             | Shockwave every 8 s                                  |
| 2, "Form up!" (to 33%), tempo 0.85 | Opens with the Phalanx; lunges in twos, Stamp then lunge, Phalanx, Guards!             | Shockwave every 6.5 s                                |
| 3, "No quarter!", tempo 0.7        | Opens with Spear rain; Spear flurry (three, tracking), Bull rush, Stamp, Guards!, Rain | Two-volley shockwave every 5 s, the Phalanx every 15 |

- **Spear lunge**: a strip 2 wide and 7 long, 0.8 s, 4 damage, and he dashes 6.3 down it. A step of
  a tile and a third clears it. In phase 3 each of the flurry's three links turns after the
  player for its first 0.25 s (`line.track`, at most 2.5 rad/s), then locks with 0.45 s to go: a
  sidestep taken too soon is followed. (0.4 s of tracking on a 0.6 s link, as first drawn up,
  couldn't be dodged at all: the strip turns faster than anyone runs.)
- **Sweep**: a wedge of 126° and 3 tiles in front of him (`cone`), and under him. Behind or beside
  him is safe, the opposite of the lunge's answer.
- **Harpoon**: thrown along where they stood as he began (a `wave`, 12 tiles), drawn as the bolt
  his guards throw. Hit, they're dragged in (`onHit`), held 0.7 s and swept (Reel): 5 in all.
  Missed, his guard's down. It's for whoever keeps away (4 to 12 tiles).
- **Shockwave**: a ring of Akkha's darkness orbs (2257, solid where the shadow burst was too
  faint) out of him, with a gap on the player's side.
- **Phalanx**: two ranks of his guards, 11 across and 1.6 apart (no one fits between two), march at
  the player at 3 tiles a second, each with a gap somewhere new, drawn as the guard walking
  (`pattern.look`). They form up 3 tiles behind him and come through him, so someone beside him
  has a moment. A rank that catches you knocks you back a tile.
- **Stamp, then lunge**: 4 tiles round him, then a lunge (1 s to read) at wherever they've stepped
  out to: step out sideways, not straight back.
- **Guards!**: two guards (200 hitpoints, from 350, as they soaked the bow's damage) that throw
  spears (the bolt 27) from 8 tiles. Every 22 s.
- **Spear rain**: he leaps to the middle and six shadows grow on the floor, one on the player,
  twice. 4 each.
- **Bull rush**: to the edge in line with them and right across, twice, 5 damage. One that crosses
  without hitting anyone leaves his guard down at the far wall (`opens` on a surge).

### Built from what the doc assumed

Every field the first draft named exists (`line`, `opens`, `cone`, `underRadius`, `onHit`,
`chain`, `follow`, `strikeAt`, `toMiddle`, blast `shadow`, `surgeSeq`, `guard`, pattern `wall`,
`look`, `knockback`, `from`, phase `opener` and `ambients`), with these differences:

- `onHit` and a projectile's `opens` only work on a `wave` or `boomerang`, so the harpoon's a wave.
- A phase's `ambient` ignores its `delay`; `ambients` honours it, so every phase uses `ambients`.
- Zachariah has no gold light: `look.exposedLight` is Coenus's own.
- New: `line.track` (`Sim.trackLine`) and `opens` on a surge (`stepSurge`). The view draws a
  lunge's strip from the windup's direction every frame, so a tracking strip is seen to turn.

### Numbers

`STAGE=0 FLAT=1 MAP=beneath_cursed_sands DODGE=1 DEV_MAPS=1 ... simulate-run.ts sands_delver 3`:

| Seed | Before               | After                                 | After, `GOD=1`        |
| ---- | -------------------- | ------------------------------------- | --------------------- |
| 1    | died 3:31 in phase 2 | won at 3:06 (phases 52 / 71 / 63 s)   | 3:03 (52 / 66 / 64 s) |
| 2    | died 3:14 in phase 2 | died 3:04 in phase 3 (54 / 72 / 58 s) | 3:14 (54 / 75 / 65 s) |
| 3    | died 2:35 in phase 2 | died 2:31 in phase 3 (51 / 75 / 25 s) | 3:05 (51 / 75 / 59 s) |

Before, phase 1 took about 100 s and the guards' spears and lunges did most of it. After, what
hits is spread over the kit: the guards' spears, Spear rain, the shockwaves, the Phalanx, the
flurry, Bull rush, the harpoon and Reel, none of them most of it.

### To check by eye

- The strikeAt of each animation against its hit: 2080's thrust, 806's throw (the harpoon and
  Spear rain), 390's sweep and stamp.
- The Phalanx's guards: walking the way they go, at a size that reads as their hit, and its
  triangles on a phone (22 guard models at once): `PHONE=1 view-weight.ts`.
- The harpoon drawn as a crossbow bolt (27): whether it reads as a thrown spear.
- The flurry's strip turning, then stopping.
- The gold light on him while his guard's down.

## The Scarab Mages: "twin casters"

Two mages fought at once, each with its own kit: 3,800 hitpoints for the first (the
swarm-caller) and 4,500 for the elder (the sand-shaper), 8,300 in all. The bow shoots whichever's
nearest, so where the player stands chooses who they hurt. Both are `finalBoss` events: the
fight's won when both are down. Each has its health bar over it (`healthBar`), as the top of the
screen shows only the first's.

The first rises at the middle as the fight begins (its intro without `alone`: `alone` holds back
every event, the elder's too, until it's dead). The elder comes up out of the sand twenty seconds
in, inside the square 4 to 9 tiles from the player (its event's `inArena`), in a puff of Akkha's
sand (2255) with "A second Scarab Mage rises from the sand!".

### Why it was reworked

The owner, after Coenus's rework: "2nd boss is lackluster as well. Need to look at making them
mechanically as fun as the first boss." The first pass was two casters keeping their distance and
throwing bolts, fans, pools and scarabs: bullets to sidestep, not set-pieces to read and punish,
and no reason to close in. Coenus works because every attack is a big shape on the floor, a
dodged one leaves his guard down for Point-blank, and each phase opens with something new. The
mages now have that, as casters:

- **Their big spells are channelled** (`BossAttackDef.channel`): the mage stands with its guard
  down (doubled damage, the gold light) from the moment it begins until the spell's cast, and
  Point-blank volley landing on it breaks the spell. Nothing's cast, and its guard stays down
  2.5 s more ("The swarm scatters!", "The sandstorm dies away!"). That's the punish window, and
  the reason to go in.
- **Set-pieces instead of bullet spam**: a stampede wall with a gap, a lattice of quicksand in
  waves, a sandstorm with one shelter, two strips crossing. The homing bolt, the volley, the
  sinking pools, Scarab rain and the scarabs below are gone; the fan and the sand blast stay as
  the fill between.
- **The pair matters**: Point-blank lands on either of them (the one with its guard down first),
  the two cross their spells in phase 2, and the beam between them still runs.

Attack intervals 2 s and 2.2 s (together about one attack a second, as Coenus).

Their animations, on the human rig and measured on the mage frame by frame: the cast 1162
(`strikeAt` 0.6, its arm forward again; it's also forward at 0.16, so check which is the
release), the burst 1979 (0.3, arms out from 0.2) and the god spell 811 (0.32, arms up highest).
Nothing new from the cache: every id was already in the fight.

| Who                                      | Phase 1                                                                                                              | Phase 2 (from 50%)                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The first: "Scarabs, to me!"             | Scarab fan, Sand step, Swarm to me (channelled), Stampede                                                            | Opens with the Crossfire; tempo 0.8, no kneel; Crossfire, two-rank Stampedes, the rest as before    |
| The elder: "The sands shift" (from 20 s) | Sand blast, Quicksand (two waves), Sands of Scabaras (channelled)                                                    | Opens with the Noose; tempo 0.85, 1.5 s kneel; Quicksand in three waves; the Sand tether every 12 s |
| Either, once the other's dead            | Furious: "You will pay for that!", interval times 0.75, its phase 2 attack in phase 1 too (the stampedes, the noose) |                                                                                                     |

What the player sees, reads, dodges and punishes:

- **Scarab fan** (the first): five scarab bolts across a radian, twice, each volley aimed afresh,
  its lines drawn as it winds up. Keep stepping across it. 2 a bolt.
- **Sand step** (the first): a puff of sand and it's 7 tiles from the player somewhere else.
- **Swarm to me** (the first, channelled, every 18 s): four of Kephri's swarms (11723,
  `mage_scarab`, 10 hitpoints) in a ring 9 tiles round it, walking in while it stands with its
  guard down. Each that gets there adds 1.5 to a blast that can't be dodged. Two answers: shoot
  them on the way (the bow takes the nearest: stand nearer them), or run in and Point-blank the
  mage, and they scatter. "Shoot the swarm, or break the mage's spell up close!"
- **Scarab stampede** (the first, every 12 s): a rank of 13 of Kephri's swarms 1.5 apart, a gap of
  three, coming at the player out of the sand behind the mage at 3.2 tiles a second, drawn as
  the swarm walking (`pattern.look`). Walk to the gap; a rank that catches you knocks you back a
  tile. 3 damage. From phase 2 two ranks, 2 s apart, each with its gap somewhere new.
- **Crossfire** (the first's phase 2, and its opener: "The mages cross their spells! Step out of
  both!"): a strip 2 wide and 14 long from the first to the player, 1.1 s, and the elder's own
  strip of sand from where it stands 0.25 s later (the elder's `echoes`, only while it's free).
  Two strips from two ways: the pocket neither reaches is the answer. 3 each.
- **Sand blast** (the elder): Akkha's sand (2255) at 6 tiles a second, bursting red (2254), 2.
- **Quicksand** (the elder, every 8 s): nine marks of sand in a lattice round the player, 3.4
  apart and 0.9 across, one under them, 1.4 s: out on a diagonal. Then the same again round where
  they've gone (1.3 s), the last still sinking for 1.6 s (a little more damage to stand in). 3 a
  mark. From phase 2 three waves.
- **Sands of Scabaras** (the elder, channelled, every 18 s): it's at the middle in a puff of sand
  (`toMiddle`), arms raised for 4 s with its guard down, and a sandstorm hits the whole room but
  for 3.5 tiles round its feet (`outside`), drawn as a green shelter with a red edge closing in
  on it. "Sandstorm! Shelter at the mage's feet, or break its spell!" From anywhere in the room
  the shelter's under 3.5 s away at a walk, and once there Point-blank reaches: break it and
  there's no storm. 5 damage, the fight's biggest hit, as the one thing you must react to.
- **Noose** (the elder's phase 2 opener, then every 12 s): a ring of 22 scarab bolts 6 tiles
  round the player, closing at 2.4 tiles a second, a gap of three: walk to the gap. 2.
- **Sand tether** (the elder's phase 2, 8 s of every 12): a beam of Akkha's sand from the elder
  to the first, faint for 1.2 s, then 2 a second to whoever's within 0.4 tiles of it. It swings as
  they move and jumps when the first steps through the sand: keep your side of it.

### Built from what the doc assumed

- Every field the brief named exists (`wall` with `look`, `knockback`, `from`; ground `grid` with
  `lingers` and `chain`; `toMiddle`; `echoes`; `tether`; `enrage.partner`; `guard`;
  `exposedLight`), with three engine pieces new, each with a test in `ScarabMages.test.ts`:
    - `BossAttackDef.channel` (`dropGuard` from `startBossAttack`, `stepWalkers` holding it
      down, `breakChannel` from `fireAbility`).
    - `BossAttackDef.outside`, a swing that hits all but the boss's feet, drawn by `GameView`.
    - The fight's button on either of two final bosses (`abilityBosses`, `abilityTarget`): it
      only ever reached the boss on the bar, the first, so the elder could never be punished.
      With one boss it's as it was.
- A boss can `echo` its partner: `startEchoes` skips one that's busy (`isBusyBoss`: winding up,
  channelling its walkers, kneeling, stunned, in the air), so the Crossfire's second strip
  never cuts into a spell of the elder's own. Its echo pauses its own stepping (`stepEcho` runs
  in its place) for the second it lasts.
- "Mirror image" (the two trading places) was left out: it needs a teleport kind of its own, and
  the Crossfire already makes their positions matter.
- The stampede is one rank in phase 1: two ranks behind each other line up from the camera and
  hide the second gap (as Coenus's Phalanx found); in phase 2 they're 2 s apart.
- The broken spell's guard is down for the stagger from the break, not the rest of the windup.

### Numbers

`STAGE=1 FLAT=1 MAP=beneath_cursed_sands DODGE=1 DEV_MAPS=1 ... simulate-run.ts sands_delver 3`
(the phase line goes by the boss on the bar, so the bosses line is the one to read):

| Seed | Before (3,300 and 3,900)        | After (3,800 and 4,500)        | Before, `GOD=1` | After, `GOD=1` |
| ---- | ------------------------------- | ------------------------------ | --------------- | -------------- |
| 1    | died 2:07, the first in phase 2 | died 2:05, both phase 2        | 3:24            | 3:26           |
| 2    | died 2:20, both in phase 2      | died 1:39, the first's phase 2 | 3:06            | 3:11           |
| 3    | won 3:13                        | died 2:15, both phase 2        | 3:20            | 3:02           |

At the old hitpoints the new kit came to 2:41 to 2:51 with `GOD=1`: the channels' doubled damage
and the bot's Point-blanks made it about a sixth quicker, so both went up by about that. The bot
breaks nearly every channel (it presses Point-blank the moment a guard's down and it's in reach,
which a person won't), so the sims overstate the punish and understate the swarm's and the
storm's blasts: 0 to 3 of each swarm still got there. What hits it now: quicksand (about a third,
the landings, not the linger), the fan, the swarm's blast, the stampede, the Crossfire, the
sand blast, now and then the noose or the tether. The bot heads for the storm's shelter first
(`shelter`), reads quicksand before bolts in this fight (`offMarks`), and goes in to whichever
mage has its guard down (`exposedBoss`). Coenus's, the Champion's and the Akh's sims are exactly
as they were.

### To check by eye

- The elder's rise: the sand puff at a spot inside the room, the first mage not leaving.
- The two bars over their heads, and the top bar showing the first until it's down.
- **Sands of Scabaras**: the green shelter and the red edge closing in reading on a phone; the
  god spell (811) held on its first frame for most of the 4 s (`strikeAt` 0.32), which may read
  as standing still rather than channelling; the gold light on the mage while it channels.
- **Quicksand**: Akkha's sand (2255) as a held mark at 0.9 across on the Tombs' sand floor, and
  whether the lattice's diagonals read as the way out; the red burst (2254) as each lands.
- **The stampede**: Kephri's swarm (11723) walking as a wall, at a size that reads as its hit, the
  gap of three, and its triangles on a phone (13, and 26 in phase 2): `PHONE=1 view-weight.ts`.
- **The Crossfire**: two strips at once from two mages, the scarab trail down the first's and
  the sand down the elder's, and 0.25 s apart reading as two.
- **Breaking a spell**: the notice, the swarm vanishing, the gold light staying on 2.5 s.
- The tether: Akkha's sand laid a tile apart between them, faint then solid.
- `strikeAt` of 1162 at 0.6 (it's forward at 0.16 too), 1979 at 0.3, 811 at 0.32.

## The Champion of Scabaras: "Eternal"

6,500 hitpoints (the design's 12,000, and the first pass's 13,500, made a seven-and-a-half minute
fight at the bot's damage). A shadow mage who doesn't stay where you left him and doesn't stay
down. Phases at 0.68 and 0.34, a 2 s kneel between; his nests at 0.66 and 0.33. Attack interval
1.3 s, keeps 5 tiles off, half a second between bullets (`bulletGrace`). A burst he steps in with
and misses leaves his guard down, with the same gold light as Coenus's (no clash: he's a mage).

His animations, on the human rig and measured on his model frame by frame (the same as the
mage's, on the same rig): the cast 1162 (`strikeAt` 0.6; its reach is furthest at 1.0 s, past the
bolt's 0.8 s windup), the burst 1979 (0.3, arms out and low from 0.2 to 0.6) and the god spell 811
(0.32, reach furthest).

| Phase                                             | Attacks                                                                             | Ambient                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------ |
| 1, "Shadows gather" (to 68%)                      | Shadow bolt, Shadow step into Shadow Burst, Shadow Rift                             | Shadow ring every 9 s    |
| Nests (at 66%, up to 14 s, untouchable)           | Scarab nests (all four at once), then Shadow bolts                                  | Phase 2's rings          |
| 2, "Born in the shadows" (to 34%), 0.85           | Shadow bolt, step, burst, step, burst, Shadow Rift, Shadow cross, Shadow Flames     | Mirrored rings every 7 s |
| 3, "Eternal", 0.7, light 0.45; nests again at 33% | Opens with Your shadow betrays you; the same, Your shadow betrays you, Shadow storm | Mirrored rings every 5 s |

- **Shadow bolt**: two scarab bolts a little apart (0.35 rad), 7 tiles a second, 2 each.
- **Shadow step**: he sinks into the Wardens' shadow (1447) and comes up out of another (1446)
  2.5 tiles from the player, the burst coming 0.1 s later: four tiles round him, 1.1 s, 4 damage,
  a cold glow under it. 1.85 tiles to clear. From phase 2 he steps, bursts, steps again and bursts
  again (0.9 s the second time). A burst that misses leaves his guard down for 1.5 s, and he's
  within Point-blank's reach: the fight's way to fight back.
- **Shadow Rift**: three marks 1.5 across, one on the player, two within 3 tiles, 1.6 s, 4 damage,
  each staying open 3 s and hurting 1 every half second to whoever's in it.
- **Shadow cross**: a plus of marks on the player's tile, three a tile apart each way, 1.3 s, 4
  damage, staying 2 s: step off diagonally.
- **Shadow Flames**: four scarab swarms round him, every 16 s.
- **Shadow ring**: a ring of 14 of Akkha's darkness orbs (2257) out of him with a gap on the
  player's side. From phase 2 it's two volleys of eight, mirrored and turning opposite ways: the
  gap opens like scissors.
- **Scarab nests**: he sinks into the shadows ("Smother the nests!") and can't be hurt. Four red
  swarms (2149, with a red glow) come up at once 3 to 7 tiles round the player and away from
  him. Standing in one for 1.5 s smothers it (an egg hatching, 2166). All four smothered, he rises
  at once; after 14 s he rises anyway, healed 3% for each still up, the Soldier Scarab's heal
  (2150) going to him from each. Meanwhile he throws only bolts, and the rings keep coming.
- **Your shadow betrays you**: four marks 1.2 across on where the player stood 0.6, 1.2, 1.8 and
  2.4 s ago, bursting a second after they show, 4 damage. Running on clears them; turning back
  or circling runs into them. The first of them in phase 3 says so.
- **Shadow storm**: a five-armed spiral, mirrored, ten volleys, 2 a bolt.

### Built from what the doc assumed

Every field the design named exists (`exhumes`, `smother`, `lingers`, ground `cross` and
`scatter` with `awayFrom`, a teleport's `follow`, a pattern's `mirror`, `bulletGrace`, phase
`light`), with these differences:

- `trail` (NEW-5) is new: a ground spot shape on where the player it's after stood so many
  seconds ago, from a short record kept on each hero (`Hero.trail`), so it's the same in co-op
  and plays nothing differently without it.
- An exhumes' attacks are picked at random every `interval`, so the nests would have kept coming
  among the bolts (Xarpus's do, three at a time). `BossOrdealDef.opener` is new: used once as the
  ordeal begins, it lays the four at once.
- One `count` for both ordeals: four nests both times, not four then five. The second's harder for
  the dark and phase 3's rings.
- The nest heal is `exhumes.leftHeal` (3% each), counted as he rises; the nests outlast him, so
  their own `smother.heal` never comes into it. Each still up now shows its heal going to him.
- The design gave him no way to fight back. Without one the bot's damage (the bow's, with nothing
  doubled) made phase 1 take 85 s at 8,000 hitpoints, so a missed burst opens his guard (`opens`,
  `guard`), as a missed lunge does Coenus's. It suits him: he's just stepped in close.
- The step's message ("He steps out of the shadows!") is left out: a message shows every time, and
  he steps every 8 s.
- The design's "Shadow ring every 9 s" in the ordeal's attacks is left to the phase's ambient,
  which keeps going while he's down.
- His plain Shadow Burst (round him wherever he stood, 1.5 s) is gone; the burst comes only out
  of a step.

### Numbers

`STAGE=2 FLAT=1 MAP=beneath_cursed_sands DODGE=1 DEV_MAPS=1 ... simulate-run.ts sands_delver 3`:

| Seed | Before (13,500)              | After (6,500)                         | After, `GOD=1`        |
| ---- | ---------------------------- | ------------------------------------- | --------------------- |
| 1    | won 7:35 (154 / 150 / 151 s) | won 3:15 (56 / 62 / 76 s)             | 3:12 (56 / 62 / 73 s) |
| 2    | won 7:34 (154 / 149 / 151 s) | won 3:17 (56 / 63 / 77 s)             | 3:20 (56 / 63 / 80 s) |
| 3    | won 7:33 (153 / 149 / 151 s) | died 2:38 in phase 3 (54 / 64 / 40 s) | 3:12 (54 / 64 / 73 s) |

Phase times include the nests (10 to 14 s each; the bot smothered all four every time, as it
heads straight for them). Before, only his shadow bolts ever hit it. After, it's spread over the
kit: bolts, the bursts, the cross, the rings, the storm, the rift and the trail. The bot now steps
off his aimed bolts (a caster on its own that keeps its distance, as it already did the mages'),
and keeps out of marks that linger (rifts, crosses) without standing still beside them as it
does for marks about to land, so Coenus's, the mages' and the Akh's sims are as they were.

### To check by eye

- The step: the shadow (1447) where he leaves and (1446) where he comes up, and the burst's
  `strikeAt` (1979 at 0.3) against its hit; the gold light while his guard's down.
- The shadows as ground marks: 1446 for the rift and the trail, 1447 for the cross, at a size that
  reads as what hits, and their cold glow in phase 3's dark.
- The nests: Verzik's red swarm (2149) sitting on the floor as a mark, the egg hatching (2166)
  as one's smothered, the heal (2150) as he rises with some left.
- The mirrored rings' gap opening like scissors, and the storm's arms.
- The trail: four marks behind you, landing a second later.
- The cast 1162 at 0.6 against the bolts leaving his hand.

## The Menaphite Akh: "Amascut's spear"

8,000 hitpoints (the design's 13,500 made a six-minute fight at the bot's damage; the owner asked
for three to four and to err lower). Phases at 0.68 and 0.34, a 2 s kneel between (her crouch,
9434). Attack interval 1.2 s. Her guard drops on a missed dive, as Coenus's does, with the same
gold light and clash.

Her animations are her own, measured on her model frame by frame (how far she reaches, as
`classify-npc-seqs.ts` measures it): the spear 9427 (`strikeAt` 0.56), the lightning cast 9417
(0.58), the dive 9418 (0.48), the orbs' throw 9428 (0.25, her arms up), the shadow's call 9423.
9424, which the design offered for a second dive, is the call's loop.

| Phase                                         | Attacks                                                                                                             | Ambient                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1, "The Akh strikes" (to 68%)                 | Spear, Dive, Lightning cone, Her shadow                                                                             | Static every 6 s                    |
| 2, "Her shadow turns to magic" (to 34%), 0.85 | Opens with the orbs; Spear, Dives (two), Cone then lattice, Unstable orbs, Her shadows                              | Static every 5 s                    |
| 3, "Darkness surrounds you", 0.7, light 0.35  | Opens with the cage; Spear, Dive flurry (three, tracking), Cone then lattice, orbs, cage; her shadow dives with her | Storm every 7 s, Static every 4.5 s |
| Last stand, 10 s, untouchable                 | Unstable orbs first, then a dive or orbs (two dives to one) a second apart; her shadow dives with her               | Storm every 4 s                     |

- **Spear**: a 92° wedge 2.8 tiles in front of her, 3 damage. Back out of it.
- **Dive**: a strip 2 wide and 8 long, 0.9 s, 4 damage, and she's 7.3 tiles down it, her
  lightning (2256) laid along the way she went. Missed, her guard's down. In twos from phase 2;
  in threes from 3, each turning after the player for its first 0.25 s (`line.track`).
- **Lightning cone**: a 57° wedge ten tiles long, 1.3 s, 4 damage, a pale blue glow on her as it
  comes and a flash as it lands. Beside or behind her is safe. From phase 2 it's followed 0.3 s
  later by the **Static lattice**: nine marks round the player 3.2 apart (radius 0.9, 3 damage),
  one under them, with ways through on the diagonals.
- **Static**: the ambient, gold swirls (1800) on the player and two more within 5 tiles, struck
  by her lightning 1.2 s later, 2 damage (chip, as the shockwave is: it never stops coming).
  Each mark glows pale blue, so it reads in phase 3's dark.
- **Unstable orbs**: three of Akkha's unstable orbs (drawn as `akkha_unstable_orb`, a projectile's
  `lookId`), 3.2 tiles a second, turning after the player at 0.9 rad a second, 3 damage each,
  bursting as Akkha's do (2260). A sharp turn beats them. The phase's opener says "Outrun the
  orbs!"; the ones after don't.
- **Lightning cage**: a closing ring of 24 bolts of her lightning 7 tiles round the player with
  a gap of three, 2 damage, and 0.8 s after it's out she dives at them (1 s, turning after them
  for 0.25 s): out of the gap, and sidestep as you leave.
- **Storm**: a three-armed spiral out of her, mirrored (scissors), 2 damage a bolt.
- **Her shadow** (11462): as before, every 24 s in phase 1 and every 18 s after.
- **Her shadow's dive** (NEW-7, `EnemyDef.echoes`): in phase 3 and her last stand, as she starts
  a dive (the flurry's links, the one out of her cage, the last stand's), her shadow dives too,
  from where it stands at whoever's nearest it: her own dive (9418, at 0.48; the shadow's on her
  rig), a beat (0.2 s) after hers, 3 damage to her 4, turning after them for its first 0.25 s as
  hers does. It leaves the Wardens' shadow (1447) down its strip and a darkness orb (2257) where
  it stops. Two strips from two ways at once, and the pocket neither reaches is the answer.
  Only the nearest shadow copies her (`most: 1`), so it's never three; one still diving
  doesn't start another, so in a flurry of three it's the first and the last.
- **The last stand**: at no hitpoints she's held at 1 and can't be hurt (`BossPhasesDef.finale`
  on a boss fought by its hitpoints, `Sim.lastStand`), shouts "Amascut will not be denied!", and
  for 10 s throws orbs and dives over her storm; then she falls (9433). The boss bar counts the
  time down ("Stay on your feet!"). Her guard doesn't drop in it.

### Built from what the doc assumed

Every field the design named exists, with these differences:

- The last stand (NEW-4) is new: `finale` now works without totems, through `startFinale`, pulled
  out of `totemsBlast`. `finale.shout` is new too. The finale's ambient is one pattern, so it
  can't be a ground mark: Static stops for the last stand.
- She doesn't crouch for the last stand: she's attacking through it. The crouch (9434) is her
  threshold kneel instead.
- Static is the player's spot and two scattered (the design had three scattered, which could
  all miss the player), and 2 damage, not 3: it was what hurt most, every 4.5 to 6 s.
- The orbs' fan is 1 radian apart, not 1.4, and the opener is its own entry, "Unstable orbs
  (first)", so only it shows "Outrun the orbs!" (an attack's `message` shows every time).
- "Up to two shadows at a time" has no field: a summon has no cap. At 250 hitpoints and every
  18 s, the bow has one down before the next comes.
- The dive flurry tracks for 0.25 s on 0.7 s links, as Coenus's does (0.35 on 0.6 can't be
  dodged), and the dive after her cage tracks too, so it follows whoever's leaving.
- NEW-7 (her shadow mirroring her dives) is `EnemyDef.echoes` (an `EchoDef`): the copy's a
  `BossWindup` on the shadow (`Enemy.echo`, then `Enemy.echoDash` down its strip), started in
  `startBossAttack` (`startEchoes`) and stepped in place of its walking and shooting
  (`stepEcho`), so it needs no `bossState` of its own. It's kept to phase 3 by name: it copies
  only "Dive flurry", "Dive (following)" and the last stand's own "Dive (last stand)" (her
  phase 1 "Dive", which the last stand used, would have had it copy phase 1's too). Its `seq`
  is its own field, baked with the shadow's model. The view draws its strip as hers. The bot
  finds the pocket between two strips (`sharedPocket`).

### Numbers

`STAGE=3 FLAT=1 MAP=beneath_cursed_sands DODGE=1 DEV_MAPS=1 ... simulate-run.ts sands_delver 3`:

| Seed | Before (15,000)              | After (8,000)                       | After, `GOD=1`                    |
| ---- | ---------------------------- | ----------------------------------- | --------------------------------- |
| 1    | won 9:54 (197 / 198 / 199 s) | died 3:27, 1 s into her last stand  | 3:27 (68 / 69 / 59 s, stand 10 s) |
| 2    | won 9:52 (192 / 193 / 207 s) | died 2:42 in phase 3 (59 / 71 / 32) | 3:22 (59 / 71 / 62 s, stand 10 s) |
| 3    | won 9:51 (194 / 195 / 201 s) | died 2:41 in phase 3 (65 / 67 / 29) | 3:21 (65 / 67 / 59 s, stand 10 s) |

Before, her shadow's shots and the lightning spread did nearly all of it, over ten minutes.
After, what hits is spread over the kit: the storm, the shadow's shots, the orbs, Static, the
lattice, the spear, the cone, a dive or two. The bot now reads her orbs (across the nearest), her
cage's gap, a long cone (sideways, not back down it) and her sparks (to a spot clear of them all,
and waits there), and the sim counts the last stand on its own.

Her shadow's dive (NEW-7), `STAGE=3`, same seeds: stages 0 to 2 sim exactly as before. The bot
dodged every one of its dives (33 started over the three `GOD=1` fights, none hit; 3 to 6 damage
a fight when it reads only her strip), and the fight's as long:

| Seed | Before                              | After                               | Before, `GOD=1` | After, `GOD=1` |
| ---- | ----------------------------------- | ----------------------------------- | --------------- | -------------- |
| 1    | died 3:27, 1 s into her last stand  | died 2:49 in phase 3 (68 / 69 / 31) | 3:27            | 3:32           |
| 2    | died 2:42 in phase 3 (59 / 71 / 32) | died 2:33 in phase 3 (59 / 71 / 23) | 3:22            | 3:24           |
| 3    | died 2:41 in phase 3 (65 / 67 / 29) | died 2:49 in phase 3 (65 / 67 / 37) | 3:21            | 3:23           |

What kills the bot in phase 3 is what did before (the storm, the orbs, Static, the shadow's shots);
the shadow stopping to dive moves the rest about, which is seed 1's difference.

### To check by eye

- `strikeAt` against the hit: the dive 9418 (0.48), the spear 9427 (0.56), the cast 9417 (0.58),
  the orbs' throw 9428 (0.25). The shadow's dive (9418 on the shadow's model) at the same 0.48.
- Her shadow's dive: two red strips at once, from two ways, on a phone; whether the pocket
  reads in phase 3's dark; the shadow facing down its strip and dashing it, the Wardens' shadow
  (1447) laid along it and the darkness orb (2257) where it stops; and that 0.2 s apart reads as
  two blows, not one.
- Her kneel at a threshold (9434): it's low, like the start of her death. Check it doesn't read
  as her dying at 68%.
- The unstable orbs drawn as Akkha's orb model, turning after you, at a size that reads as what
  hits.
- The cone's red wedge and its pale glow; the Static and lattice swirls (1800) reading as gold
  on the sand, and lit in the dark.
- The cage's gap, and the dive's strip following you out of it, then stopping.
- The last stand: the shout, the bar counting down, no "Guard down!", and her fall at the end.
