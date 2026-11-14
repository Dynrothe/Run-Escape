# Awakened Duke Sucellus: design and numbers

The design of Act II's third Awakened fight, written 2026-11-11 on the `act-2` branch (pull
request #159), build-order step 11 of `act-2-fallen-empire.md`. It's in the shape of
`awakened-vardorvis.md` and `awakened-whisperer.md`, and keeps what Dynny said works in
Zachariah's (`justiciar-zachariah.md`, section 1). The data in `src/game/content/duke.ts` is the
truth if these drift; the arena is `src/game/scaperune/maps/dukesRoom.ts`. Every id was looked up
in the cache with `scripts/cache/`. The numbers are a first pass from arithmetic and the bot
(section 10), not a playtest.

## 1. What the fight is

A boss fight on its own, open once Ghorrock is beaten, listed on the map screen's Bosses tab after
the Awakened Whisperer. No waves, picks, items or drops but his pet. Everyone plays **the Snow
ranger** (each Awakened fight is played as its map's adventurer), her shortbow at its top level,
and **Kindle**, the fight's button, which lights the brazier you're beside.

OSRS's Awakened Duke Sucellus is the basis: the prisoner of Ghorrock, size 7 and never moving, in
his own room with its floor of gas vents, his slam and icicles, his gas, and his **freezing gaze**.
Ghorrock's rule (section 5 of the act's design) is the thread through it, compressed into his room:

- **The cold is the clock.** It rises all the time, faster than in the yard, and only the braziers
  hold it off. At 100 you're frozen solid.
- **Braziers are the only warmth, and he puts them out.** His gaze snuffs every lit brazier it can
  see; the statues hide some of them, and you.
- **His gas finds the vent by you.** The room's floor is nine vents, and he spits at the one
  nearest you.

What carries over from Zachariah, Vardorvis and the Whisperer, because it worked:

- **The player acts, not only dodges.** His guard drops when his gaze finds no one (double
  damage), and the fight's button rewards stepping in: a brazier lit by his alcove flares into
  him.
- **An attack about every 1.4 s**, times the phase's tempo.
- **Lots of effects**: his icicles where they fall, his gas over the vents, the ice breath he
  spits, the shards of his gaze, faint flashes on the big ones, the camera's shake.
- **Read it from the world**: the vents frost over before they puff, the braziers' flames die
  down before they go out. The red warnings the game already uses for circles stay.
- The player starts south of him; the camera's on him as he wakes and pans back. No 1-4 bar. A
  death screen with **Retry**. Each phase a full bar of its own.
- **Phones**: under 69k triangles at the busiest view.

|             | Awakened Whisperer                                     | Awakened Duke Sucellus                                 |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Look        | Her island before the drowned cathedral, and its realm | His room in Ghorrock Prison, the alcove he sits in     |
| Danger from | Her shots and tentacles; the realm's tentacles; sanity | His icicles, spit and gas; the vents; the cold         |
| Offence     | Shadow Burst round you (2.9 tiles), Blackstone's shock | A shortbow from anywhere in the room, Kindle's flare   |
| Structure   | Hitpoints, three phases, a siphon in each              | Hitpoints, three phases, the gaze from the second      |
| Rest        | The realm, for as long as sanity lasts                 | Beside a lit brazier, for as long as he doesn't see it |

## 2. The arena

**His room in Ghorrock Prison, cut from the cache** (square 47,100, the ground floor: the room
he's fought in). In the cache it's 11 tiles across between its walls, with his alcove at the
north end 21 across, and a fight with a crowd's worth of room to dodge in doesn't fit in 11. So
the room's widened to its alcove's width: its side walls, their salt deposits and buttresses, are
moved out four tiles each way (the cache's own pieces, where they were along the wall), and its
south end opened to the corner rocks, making it 21 by 19. The alcove (its rock and ice, its
mushrooms) stays as it is, and he sits in it as in OSRS. The cache's nine floor vents, in a 3 by
3 in the room's middle, are the vents.

It's a hand-made recipe on squares of its own (68 to 70 by 112 to 114, beside Ghorrock's), the
room in the middle square and the cache's black round it, so it costs a phone little. On it, drawn
by the game as on Ghorrock: four braziers (two by his alcove, two in the south corners), and six
of the prison's statues (49090) for cover.

## 3. The fight

Three phases by his hitpoints, each a full bar of its own, and at each threshold he roars, 2 s
untouchable, and opens the next with his gaze: every brazier he can see goes out.

| Phase | Hitpoints | Status        | Adds                                                                    |
| ----- | --------- | ------------- | ----------------------------------------------------------------------- |
| 1     | 100-60%   | The prisoner  | Slam, Icicles, Spit, Gas                                                |
| 2     | 60-25%    | Freezing gaze | The freezing gaze, every 9 s or so                                      |
| 3     | 25-0%     | Awakened      | The gaze every 7 s or so, icicles twice, five spits; everything quicker |

He has 13,000 hitpoints, set by the shortbow's damage against him with the shop's every upgrade
(about 75 a second in the first phase: section 10), and his hits go through armour, a fifth
harder than the bots' tuning (`MapDef.hits`, `AWAKENED_HITS`: section 10).
He starts an attack every 1.3 s, times the phase's tempo (1, 0.9, 0.8), and never moves.

### His attacks, and the dodge arithmetic

The Snow ranger has 25 hitpoints (50 with the shop's every upgrade) and moves 3.33 tiles a second.
A big hit takes about a sixth of a full save's, his gaze a quarter.

| Attack                                                                                     | Damage                          | Warning          | To be clear               |
| ------------------------------------------------------------------------------------------ | ------------------------------- | ---------------- | ------------------------- |
| Slam: round him, his arms                                                                  | 8                               | 0.9 s            | 6 tiles from him          |
| Icicles: a ring of five round where you stood, one on it                                   | 5                               | 1.15 s (0.85)    | a step out of the ring    |
| Spit: three ice breaths along lines fanned at where you stood as he began (five, awakened) | 3 each, 10 t/s, every 3 s       | 0.8 s, the lines | off the fan's lines       |
| Gas: spat at you, and the vent nearest puffs as it lands                                   | 6, and the vent's gas           | 1.05 s           | 2 tiles, and off the vent |
| Freezing gaze: the whole room he can see                                                   | 13, frozen 2 s, and 25 cold     | 2.2 s            | behind a statue           |
| The vents: each puffs a 3 by 3 every 6 s, out of step                                      | 2% a 0.6 s, the cold 6 a second | 1 s, its frost   | off it                    |
| The cold: rising 3 a second (the Snow ranger's 1.8)                                        | 10% at 100, frozen 1.5 s        | the bar          | a lit brazier, 3 tiles    |

**The gaze** is the fight's question: it can't be stepped out of in the open, only hidden from.
Behind a statue it finds no one, and his guard's down for 3 s (double damage). And every lit brazier
it can see goes out: two of the four stand where a statue hides them from him, two don't.

## 4. Fighting back

The shortbow shoots him from anywhere in the room. What puts the player in the fight:

1. **His guard drops when his gaze finds no one** (3 s, double damage, his model glowing).
2. **Kindle (the button).** Space, a pad's bottom face button, the big round button on a touch
   screen. Beside a brazier (within 2.5 tiles), it lights it at once for its full burn, every 6 s.
   One that was out or dying (its last 8 s), lit within 11 tiles of him (the two by his alcove),
   **flares** into him for 150, doubled with his guard down: about three seconds of the bow.
   Without it, a brazier is lit by standing beside it for 3 s, as on the map.

Ideas weighed and left out: the OSRS potion and the mushrooms that make it (a fight here has no
items), his sleeping before the fight (the intro is his waking), and the ice floor (his room
has none: the vents are its hazard).

## 5. Baron, and the pet slot

**Baron** (follower NPC 12159: the Duke's own model, small, idle 10217, walk 10218) is the third
fighting pet (`act-2-fallen-empire.md` 8.4). The pet slot is the one there already.

- **What he does**: he naps beside you. When 6 or more enemies are within 3 tiles of you he wakes
  and spits a gas cloud at you (3 by 3, 4 s, the Duke's gas): what's in it is 45% slower and
  poisoned. Then he sleeps 15 s.
- **The poison** is 3 a second for 4 s, scaled as power-ups' damage is, with the enemies'
  hitpoints: about what a Common weapon does, as the act's design asks.
- **Can't be hurt or targeted**; **in the sim** like Butch and the Wisp: on its own ticks, with
  its hero's index, the same on every co-op player's copy; where it's drawn is the client's.
- **Not in boss fights**: there he's along for the look.
- A run with a looks-only pet, or none, plays exactly as before.
- **The drop**: his fight's trophy, certain on every win.

## 6. Hard mode

What it always is for a fight map: open once he's beaten, 1.3 times his hitpoints and damage,
and his attacks 15% closer together. The windups and tells are the same. No hard-mode look for
Baron in this step.

## 7. What it looks like when he hits

| What          | Spot animations (fit, tiles)                                  | Shake | Flash     |
| ------------- | ------------------------------------------------------------- | ----- | --------- |
| Slam          | snow thrown up (2699, 3)                                      | 0.4   |           |
| Icicles       | his icicles (2434) on each spot                               | 0.2   |           |
| Spit          | the ice breath (396), his icicles (2434) where it lands       |       |           |
| Gas           | his gas (2431), and the vent's puff                           |       |           |
| Freezing gaze | the shards (369), snow (2699, 4)                              | 0.5   | pale blue |
| A threshold   | snow (2699, 4), his gas (2431, 3); his gaze opens the next    | 0.5   | pale blue |
| His waking    | snow (2699, 4)                                                | 0.5   |           |
| Kindle        | a fire's burst (157, 1.5) on the brazier; on him if it flares | 0.25  |           |

## 8. Phones

`frameProbe.sample(30)` at 844 by 390 on the phone camera (headless swiftshader): 66.5k at the
start (his spit's lines and two vents puffing), 56.7k at his gas on a vent, 50.6k as his gaze winds
up, 57.1k hidden behind the south statue, 58.0k at Kindle's flare, 49.4k at his awakened spit and in
play, 51.7k in a south corner. The heaviest is 66.5k, under 69k. The first measure was
104k: five puffs of his gas a vent (3,200 triangles each) and the room's wall pieces (about 2,500
each), before the changes in section 11.

## 9. Decisions

- **The Snow ranger as she is**, her trait and all (Shatter does a tenth for a boss; she's 40%
  slower to cold), her shortbow at its top level.
- **His room, cut from the cache and widened** to his alcove's width: the real room is 11 tiles
  across.
- **The cold's numbers are the map's, compressed**: it rises 3 a second (2 on the map), a brazier
  burns 24 s (40), relights by standing in 3 s (1.5), so the button's what keeps them lit.
- **Kindle lights a brazier whether or not he's near**: the flare's a bonus by his alcove, not a
  requirement.
- **No ice in his room.**

## 10. Numbers from the bot

`MAP=awakened_duke DODGE=1 bun run tsx scripts/game/simulate-run.ts snow_ranger 6`, with `HARD=1`
for hard mode, on the room's real collision. The careful bot reads his attacks as it reads the
other fights' (out of the slam, off the icicles' marks to the nearest clear spot, behind a statue
from the gaze), and for this fight (`kindleMove`, `kindlePress`, `fanStep` in `bossReads.ts`):
off the lines of his fanned spit to a spot none of them reaches, off a vent that's frosting over
or puffing, out of the slam's reach, to a brazier that's out or dying while Kindle's ready (one
by his alcove first, for the flare), to a lit one once its cold is 40, never cornered against a
wall, and otherwise standing to shoot. Seeds 1 to 6, 2026-11-11:

| Round | What changed                                                         | Normal                                     | Hard           |
| ----- | -------------------------------------------------------------------- | ------------------------------------------ | -------------- |
| 1     | The draft (5,000 hp, three breaths of 3 fanned at where you are)     | died 0:20-0:33, phase 1: the spit, icicles |                |
| 2     | The spit along lines aimed as he begins, of 2; the bot's reads above | died 0:46-1:07, phase 2-3; phase 1 35-38 s |                |
| 3     | 4,000 hp                                                             | 1 win (1:10), phase 1 30 s                 | died 0:31-0:51 |
| 4     | The north braziers and side statues a tile off the room's kit        | no wins, died 0:23-1:16                    | died 0:39-1:02 |
| 5     | 3,600 hp (as built)                                                  | 2 wins (0:56, 0:57), phase 1 27-42 s       | died 0:38-0:59 |

**The bar is met: two bot wins in 6 on normal, none on hard.** It dies in phase 1 to 3, mostly to
his spit (a fan's lines cross the room, and a step off one is often onto the next as his gas or
icicles move it), then his gas and icicles; it's hidden from most gazes, and spends up to a fifth of a
fight at 50 cold or more when the braziers are out. The shortbow does about 55 a second to him. The
first knobs for a playtest are his hitpoints and the spit.

**Baron by the bot**, on Ghorrock at step 0 (`META=max ARMOURY=max`, warrior, wizard, ranger and
snow_ranger by seeds 1 and 2): with no pet, 1 win of 8, deaths at 5:03, 5:11, 7:24, 8:05, 10:36,
15:29 and 15:50; with `PET=baron`, 2 wins, deaths at 5:25, 7:04, 7:15, 10:35, 13:59 and 16:23. A
kiting ranger rarely lets six close round it, so for one (snow_ranger, seed 1) he never woke.

**Hardened, 2026-11-12**, with Awakened Vardorvis (Dynny: "far too easy" with a fully upgraded
save). Every round above was with nothing bought; a full save has 50 hitpoints, armour 3 (his spit's
2 did 1), regeneration and a Ring of life. By the careful bot with `META=max` the old numbers won
200 of 200, in 0:34-1:25, taking a median 9 of 50; phases 17 / 10 / 10 s.

Retuned to `META=max`, kit and mechanics as they were:

| What            | Before                     | After                           |
| --------------- | -------------------------- | ------------------------------- |
| His hits        | stopped by armour          | through armour (`MapDef.hits`)  |
| Hitpoints       | 3,600                      | 13,600                          |
| An attack every | 1.4 s, tempo 1 / 0.9 / 0.8 | 1.15 s, tempo 1 / 0.85 / 0.75   |
| Slam            | 6, 0.9 s                   | 8, 0.85 s                       |
| Icicles         | 4, 1.3 s (0.9 the second)  | 5, 1 s (0.75 the second)        |
| Spit            | 2, 0.9 s, 9 t/s, every 3 s | 3, 0.7 s, 11 t/s, every 2.5 s   |
| Gas             | 4, 1.2 s                   | 6, 0.95 s                       |
| Freezing gaze   | 10, 2.4 s, every 10 s (7)  | 13, 2 s, every 8 s (6 awakened) |

The careful bot, `META=max`, seeds 1-600 (the first round 1-300; hard 1-300):

| Round | Numbers                         | Normal wins         | Phases (median) |
| ----- | ------------------------------- | ------------------- | --------------- |
| 0     | 3,600 hp, as built before (200) | 200 of 200          | 17 / 10 / 10 s  |
| 1     | The table's, 13,000 hp          | 32 of 600 (1 in 19) | 56 / 37 / 32 s  |
| 2     | 14,500 hp                       | 7 of 600 (1 in 86)  | 62 / 41 / 30 s  |
| 3     | 13,600 hp (as built)            | 24 of 600 (1 in 25) | 58 / 37 / 30 s  |

Wins in 1:49-2:19; it dies in every phase about as often, mostly to his spit, then his gas. Hard:
0 of 300. Nothing bought: 0 of 200, all in the first phase. The bot that can't die (`GOD=1`, 20
seeds) takes phase 1 (5,440 hp) in 55-87 s, median 71, about 75 a second; phases 2 and 3 in a
median 46 and 43 s, quicker for their share, from the gaze's guard drops and Kindle's flares. The
later phases stay shorter than a minute for a good player: their share's the design's (35% and
25%), and his burst windows are the reward for hiding and kindling.

**Eased, 2026-11-13**, with Awakened Vardorvis (Dynny: "way too hard to beat"; how it was
measured, with a person's reaction as `REACT=0.25`, is in awakened-vardorvis.md 10). As
hardened, the careful bot won 7 of 200 and the reacting bot 3 of 200; the numbers before the
hardening won 100 of 100 and 200 of 200. Kit as it was, hits still through armour:

| What            | Hardened                      | Eased                         |
| --------------- | ----------------------------- | ----------------------------- |
| Hitpoints       | 13,600                        | 13,000                        |
| An attack every | 1.15 s, tempo 1 / 0.85 / 0.75 | 1.3 s, tempo 1 / 0.9 / 0.8    |
| Slam            | 0.85 s                        | 0.9 s                         |
| Icicles         | 1 s (0.75 the second)         | 1.15 s (0.85 the second)      |
| Spit            | 0.7 s, 11 t/s, every 2.5 s    | 0.8 s, 10 t/s, every 3 s      |
| Gas             | 0.95 s                        | 1.05 s                        |
| Freezing gaze   | 2 s, every 8 s (6 awakened)   | 2.2 s, every 9 s (7 awakened) |

`META=max DODGE=1`, seeds 1-200:

| Round | Numbers                       | Careful   | `REACT=0.25` |
| ----- | ----------------------------- | --------- | ------------ |
| 0     | As hardened                   | 7 (3.5%)  | 3 (1.5%)     |
| 1     | 11,000 hp, the table's timing | 172 (86%) | 143 (71.5%)  |
| 2     | 13,000 hp (as built)          | 135 (68%) | 85 (42.5%)   |

He's the one the reacting bot finds easiest and the careful bot hardest: his blows are slow or
fanned shots, so a quarter of a second late costs less, and it's his spit and gas that end runs
either way. As built the careful bot wins in 1:49-3:02, phases a median 61 / 38 / 33 s; the
reacting one in 1:48-3:46. Hard mode: 7 of 200 careful (3.5%), 1 of 200 reacting. In the
gauntlet, third at x1.1: 2.5 tries a win careful, 5.9 reacting.

**A fifth harder, 2026-11-13**, with the other three (Dynny: "about 20% harder";
awakened-vardorvis.md 10 has all four). Every hit x1.2 (`AWAKENED_HITS`), nothing else: the
careful bot won 72 of 200 (36%, from 68%), the reacting one 26 (13%, from 42.5%), both dying in
phases 2 and 3 to his spit and gas. He's now the hardest of the four for both bots. Hard mode: 2
careful (1%), 0 reacting. In the gauntlet at x1.1: 6.1 tries a win careful (one climb of 24 ran
out of its 40 retries here), 25.8 reacting.

## 11. As built, and what differs from the act's design

- **The room's widened**, not cut as it is: the cache's is 11 tiles across between its walls.
  Its walls and what's along them are moved out four tiles each way, its south corner rocks
  five tiles south (`scaperune/maps/dukesRoom.ts`), giving 19 across and 18 deep inside, the
  alcove as the cache has it. The cache's levels above its ground floor mark some of its tiles
  as bridges, so they're cleared.
- **His gaze snuffs what it sees** (`BossAttackDef.rule.snuff`), and chills whoever it finds (25
  cold, `rule.chills`) as well as freezing them. It opens phases 2 and 3, so each threshold puts
  out the braziers in his sight.
- **Kindle flares only from a brazier that was out or dying**: lighting a lit one again would make
  the button a second weapon by his alcove.
- **The braziers stay lit as he wakes** (`ColdRuleDef.braziers.stayLit`): on Ghorrock every brazier
  goes out as the Duke wakes, but here he's up from the start.
- **No vents quicker by phase**: the design had them; the gaze and the cold already press the
  later phases.
- **His camera** leans half-way to him, up to 4.5 tiles (2.5 on a phone: `BossLookDef.lean` as
  `{ share, max, phone }`), so he's whole on the screen from the north half of his room, and you
  stay above the HUD from its south end; he's drawn at 0.65 of his size. On a phone's short
  screen he's partly above its top from the room's middle on.
- **His vents' puff** is one bigger puff over each cloud (`ColdRuleDef.look.puffOne`), not the
  yard's five: five puffs of his gas are 16k triangles a vent. His room's wall pieces, salt
  deposits, vats and statue are drawn lighter (`MODEL_SIMPLIFY`), the statue on Ghorrock too.
- **The cold's wash** is off: the yard's makes its snow white, and would wash his grey stone out.

## 12. Not verified

- How it feels to a person: the bot is a density meter, not a player.
- Co-op: the braziers are the party's and each player's cold their own, as on Ghorrock, and each
  player's Kindle waits its own cooldown; untried with a party.
- His sounds: none of his animations name one, so an ice giant's roar stands in, as on the map.
