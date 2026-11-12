# Awakened Whisperer: design and numbers

The design of Act II's second Awakened fight, written 2026-11-11 on the `act-2` branch (pull
request #159), build-order step 8 of `act-2-fallen-empire.md`. It's in the shape of
`awakened-vardorvis.md`, and keeps what Dynny said works in Zachariah's (`justiciar-zachariah.md`,
section 1). The data in `src/game/content/whisperer.ts` is the truth if these drift; the arena is
the Lassar Undercity's own (`src/game/scaperune/maps/lassarUndercity.ts`). Every id was looked up
in the cache with `scripts/cache/`. The numbers are a first pass from arithmetic and the bot
(section 10), not a playtest.

## 1. What the fight is

A boss fight on its own, open once the Lassar Undercity is beaten, listed on the map screen's
Bosses tab after Awakened Vardorvis. No waves, picks, items or drops but her pet. Everyone plays
**the Shadow walker** (Dynny: each Awakened fight is played as its map's adventurer), Shadow Burst
at its top level, and **Blackstone**, the fight's button, which turns the party between the city
and the Shadow Realm.

OSRS's Awakened Whisperer is the basis: the siren of the Shadow Realm, sped up and hitting harder,
her volleys and tentacles, her **Soul Siphon** (souls stream to her and each heals her) and her
**screech**, and the blackstone fragment that takes you between the worlds. Lassar's own rule
(section 4 of the act's design) is the thread through it, in arena form:

- **She can only be hurt in the city.** In the realm she's there, and attacking, but out of reach.
- **Her Soul Siphon can only be stopped in the realm.** Her souls are in the realm: you can see
  them from the city, drifting to her, but you can catch them only there.
- **Sanity is the clock in there.** It drains fast in the realm, a hit takes more, and at none
  you're thrown back hurt.

What carries over from Zachariah and Vardorvis, because it worked:

- **The player acts, not only dodges.** Her guard drops when her screech finds no one (double
  damage), a siphon caught whole breaks her (stunned), and the fight's button rewards stepping in
  (it shocks her as you come out of the realm beside her).
- **An attack about every 1.4 s**, times the phase's tempo.
- **Lots of effects**: her own spot animations (the soul glow, her shots' bursts, the shadow
  ripple, the tentacles' lash) on every blow, faint flashes on the big ones, the camera's shake.
- **Read it from the world**: her tentacles where they burst, her shots, her souls. The red
  warnings the game already uses for strips and circles stay.
- The player starts south of where she rises; the camera's on her as she rises and pans back. No
  1-4 bar. A death screen with **Retry**. Each phase a full bar of its own.
- **Phones**: under 69k triangles at the busiest view, in both worlds.

|             | Awakened Vardorvis                           | Awakened Whisperer                                       |
| ----------- | -------------------------------------------- | -------------------------------------------------------- |
| Look        | His pale clearing, the red-black wood        | Her island before the drowned cathedral, and its realm   |
| Danger from | Him, up close and fast; the roots closing in | Her shots and tentacles; the realm's tentacles; sanity   |
| Offence     | A 2h sword's sweep (2.75 tiles), Chop        | Shadow Burst round you (2.9 tiles), Blackstone's shock   |
| Structure   | Hitpoints, three phases, a kneel between     | The same, a siphon in each phase                         |
| Rest        | Ground you've cut, behind a pillar           | None in the city; the realm, for as long as sanity lasts |

## 2. The arena

**Her island in the Lassar Undercity**, the map's own recipe and its twin, not a cut of its own.
The fight is kept to the 20 by 20 square round her spot (the map's `bossArena`, the square its
Whisperer fights in), all open ground on the island before the Sunken Steeple. She rises on her
spot, as in OSRS, and the player starts six tiles south.

The realm is the map's twin (`MapDef.twin`): Blackstone turns the party, and the twin's squares are
drawn in the city's place, darker, with the violet wash, as on the map. The collision is the
same, so the sim never knows which is drawn. Its view is the map's (measured with it: 64k in the
city, 66.4k in the realm), and the fight has a boss, souls and two tentacles where the map has a
crowd, so it costs nothing new to draw.

## 3. The fight

Three phases by her hitpoints, each a full bar of its own, and at each threshold she sinks for
2 s, untouchable, and rises into the next. In each phase she siphons once.

| Phase | Hitpoints | Status           | Adds                                                                       |
| ----- | --------- | ---------------- | -------------------------------------------------------------------------- |
| 1     | 100-65%   | The song         | Volley, Tentacles, Shadow burst; a siphon of 6 souls at 82%                |
| 2     | 65-30%    | The realm bleeds | Screech; a siphon of 7 at 48%                                              |
| 3     | 30-0%     | Drowned          | Double volleys, double tentacles, everything quicker; a siphon of 8 at 14% |

She has 1,650 hitpoints (the Shadow walker's burst does about 6 a second to her with the shop's
every upgrade, so hitpoints are set by that: section 10), and her hits go through armour
(`MapDef.hits`). She starts an attack every 0.95 s, times the phase's tempo (1, 0.85, 0.75), and
drifts after the player at 1.6 tiles a second, keeping 2 tiles off, quicker by the phase.

### Her attacks, and the dodge arithmetic

The Shadow walker has 25 hitpoints (50 with the shop's every upgrade) and moves 3.33 tiles a
second. A big hit takes about a sixth of a full save's.

| Attack                                                                                            | Damage                        | Warning                      | To be clear                       |
| ------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------- | --------------------------------- |
| Volley: three shots fanned along where you stood as she began (five, drowned)                     | 6 each                        | 0.65 s, the flight (14 t/s)  | a step across the lines           |
| Tentacles: a cross of bursts round where you stood, 6 tiles each way                              | 6                             | 0.85 s (0.75 the second)     | off the cross's arms (diagonally) |
| Shadow burst: a blast where you stood                                                             | 8                             | 0.95 s                       | 2.4 tiles out                     |
| Screech: the whole city, wherever you are in it                                                   | 11                            | 1.8 s (she draws breath)     | the realm                         |
| The realm's tentacles: one rises near you every 6 s there (two at most) and lashes within 5 tiles | 3                             | its shot                     | out of reach, or a step           |
| The realm itself: sanity                                                                          | 20% of your hitpoints at none | the bar, the edges darkening | out in time                       |

**Screech** is the fight's question: it can't be stepped out of in the city, only gone from. Into
the realm before it lands, and it finds no one: her guard's down for 3 s (double damage), and
Blackstone's ready to bring you back out beside her. The Shadow walker's trait (a hit of over a
fifth of her hitpoints takes her into the shadows instead, every 30 s) takes her into the realm in
Lassar, so now and then it saves her from one.

**Soul Siphon**: at 82%, 48% and 14% she calls her souls (the Lost Soul, 12212), 6, 7 and 8 of
them, from 8 tiles out round her, half of them from further, and they drift in to her at 1.2 tiles
a second. Each that reaches her heals her 2.5% of her hitpoints, no higher than the top of the
phase she's in. They're in the realm: from the city you see them drifting in, but you can catch
them only there (walk into them). Catch every one, none reaching her, and the siphon breaks: she
reels, stunned for 3.5 s with her guard down.

## 4. Fighting back

Shadow Burst is an aura: it bursts round you, 2.9 tiles at its top level, so the player has to be
close to her to hurt her at all, and only in the city. What puts the player in the fight:

1. **Her guard drops when her screech finds no one** (3 s, double damage, her model glowing).
2. **A siphon caught whole breaks her**: stunned 3.5 s, double damage. The realm's where it's
   done, so the stun's spent there unless you're quick out.
3. **Blackstone (the button).** Space, a pad's bottom face button, the big round button on a
   touch screen. It turns the whole party between the city and the realm, every 3 s (everyone's
   button waits, in co-op). Coming out into the city within 3 tiles of her (4 while her guard's
   down), its **shock** hits her for 30 (doubled with her guard down): about six seconds of the
   burst. Going in does nothing to her: she can't be hurt there.
   Everything in the air and on the ground is gone as the world turns, so it's also a way out of a
   blow about to land, if it's ready and the sanity's there.

Ideas weighed and left out: lost souls and a portal as the way back (the map's; here Blackstone
is), the realm's crowd of shadows (no waves in a fight), and prayer switching (there are no
prayers).

## 5. The Wisp, and the pet slot

**The Wisp** (follower NPC 12157: the Whisperer's own model, small, idle 10230, walk 10233) is the
second fighting pet (`act-2-fallen-empire.md` 8.4). The pet slot is the one there already.

- **What it does**: every 10 s it calls the bones and coins within 8 tiles of you to you (as a
  magnet does). Once a minute, when you're hurt, it sends you a lost soul, which heals you 5% of
  your hitpoints as it reaches you a second later.
- **Can't be hurt or targeted**; **in the sim** like Butch: on its own ticks, with its hero's
  index, the same on every co-op player's copy; where it's drawn is the client's.
- **Not in boss fights**: there it's along for the look.
- A run with a looks-only pet, or none, plays exactly as before.
- **The drop**: her fight's trophy, certain on every win.

## 6. Hard mode

What it always is for a fight map: open once she's beaten, 1.3 times her hitpoints and damage,
and her attacks 15% closer together. The windups and tells are the same. No hard-mode look for
the Wisp in this step.

## 7. What it looks like when she hits

| What               | Spot animations (fit, tiles)                                 | Shake   | Flash       |
| ------------------ | ------------------------------------------------------------ | ------- | ----------- |
| Volley             | her shot (2451), its burst (2452)                            |         |             |
| Tentacles          | the ripple (2450) on each spot, the lash (2460) as it bursts | 0.2     |             |
| Shadow burst       | her burst (2452, 1.5)                                        | 0.3     |             |
| Screech            | the shadow ripple (2450, 4) round her                        | 0.6     | dark violet |
| A siphon's soul    | the soul glow (2447) as it comes, is caught, or heals her    |         |             |
| The siphon broken  | the ripple (2450, 3), the stars (80)                         | 0.4     |             |
| A threshold        | the ripple (2450, 3), dust (2184, 3); rising, (2450, 4.5)    | 0.4-0.6 | dark violet |
| Blackstone's shock | the ripple (2450, 2), her burst (2452, 2)                    | 0.25    |             |
| Her rising         | the ripple (2450, 3)                                         | 0.4     |             |

## 8. Phones

`frameProbe.sample(30)` at 844 by 390 on the phone camera (headless swiftshader), the player beside
her: 24.7k at the start, 32.0k with a siphon's souls out in the city, 47.1k with them in the realm,
25.2k as she screeches, 39.9k with the realm's tentacles up, 32.2k at her drowning volley. The
heaviest is 47.1k, under 69k.

## 9. Decisions

- **The Shadow walker as she is**, her trait and all, Shadow Burst at its top level (8).
- **Her island, not a cut of its own**: the Lassar Undercity's map and square, both worlds.
- **Blackstone turns the whole party**, as the map's puddles do (decided for co-op: the party's
  always in one world). In co-op any player's press turns everyone.
- **The shock lands coming out, not going in**: in the realm she can't be hurt, and going in
  shouldn't hurt her either.
- **The siphon's souls go with the party** (`EnemyDef.realm` both), caught only in the realm
  (`EnemyDef.caughtIn`): the waiting world would otherwise freeze them while you're in the city,
  and the siphon would wait for you.
- **No way back but Blackstone** (and sanity running out): no lost souls or portal.

## 10. Numbers from the bot

`MAP=awakened_whisperer DODGE=1 bun run tsx scripts/game/simulate-run.ts shadow_walker 6`, with
`HARD=1` for hard mode, on the Lassar Undercity's real collision. The careful bot stays by her (in
the burst's reach), steps off her volleys' lines and out of her marks to the nearest clear spot
that isn't into her (`realmDodge` in `bossReads.ts`: away from a mark alone is often into her, and
she's solid), and plays Blackstone (`realmPress`, `realmMove`): into the realm when her screech
begins or her siphon's souls are out, after the soul soonest at her there, and out again beside
her once they're caught, or at once below 22 sanity. Seeds 1 to 6, 2026-11-11:

| Round | What changed                                                    | Normal                                            | Hard           |
| ----- | --------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| 1     | The draft (3,600 hp, a volley fanned at where you are)          | died 0:11-0:47, phase 1: the volley               |                |
| 2     | The volley along lines aimed as she begins (a wave's), 1,000 hp | died 0:54-1:59, phase 1-2; the old dodge into her | died 0:35-1:10 |
| 3     | The bot's dodge to a clear spot not into her                    | 3 wins of 6 (2:36-2:57), phase 1 73-86 s          | died 2:13-3:27 |
| 4     | 750 hp, an attack every 1.3 s, a quicker volley, a longer cross | 1 win (2:06), phase 1 52-65 s                     | died 1:43-2:10 |
| 5     | 560 hp (as built)                                               | 1 win (1:33), phase 1 42-50 s                     | died 1:17-1:54 |

**The bar is met: one bot win in 6 on normal, none on hard** (Vardorvis landed at none in 6, which
may be too hard; this one's meant to be beatable now and then). Phase 1 takes 42 to 50 s on
normal, phase 2 14 to 27 s, phase 3 18 to 26 s, and the bot dies in phase 2 or 3, mostly to her
volleys (the drowning volley's five lines most of all) and the realm's tentacles' shots. It never
takes her screech: it's always in the realm before it lands, and it goes in 3 to 7 times a fight,
a quarter of it spent there, never thrown back by sanity. Her hitpoints are low beside
Vardorvis's because Shadow Burst is: about 5 a second to her (9 a burst every 1.9 s, and its
drain), against the 2h sword's 45. The first knobs for a playtest are her hitpoints and the
drowning volley.

**Hardened, 2026-11-12**, with Awakened Vardorvis (Dynny: "far too easy" with a fully upgraded
save). Every round above was with nothing bought; a full save has 50 hitpoints, armour 3 (taking
most of each of her hits), regeneration and a Ring of life. By the careful bot with `META=max` the
old numbers won 200 of 200, in 0:59-1:39, taking a median 7 of 50; phases 36 / 22 / 21 s.

Retuned to `META=max`, kit and mechanics as they were:

| What            | Before                     | After                            |
| --------------- | -------------------------- | -------------------------------- |
| Her hits        | stopped by armour          | through armour (`MapDef.hits`)   |
| Hitpoints       | 560                        | 1,650                            |
| An attack every | 1.3 s, tempo 1 / 0.9 / 0.8 | 0.95 s, tempo 1 / 0.85 / 0.75    |
| Volley          | 3, 0.8 s, 10 t/s           | 6, 0.65 s, 14 t/s                |
| Tentacles       | 4, 1.3 s (0.9 the second)  | 6, 0.85 s (0.75 the second)      |
| Shadow burst    | 5, 1.2 s, 1.8 across       | 8, 0.95 s, 2 across              |
| Screech         | 8, 2.2 s, every 11 s (8)   | 11, 1.8 s, every 9 s (7 drowned) |

The careful bot, `META=max`, seeds 1-300 (the last 1-600; hard 1-300):

| Round | Numbers                                                                  | Normal wins           | Phases (median) |
| ----- | ------------------------------------------------------------------------ | --------------------- | --------------- |
| 0     | 560 hp, as built before (200 seeds)                                      | 200 of 200            | 36 / 22 / 21 s  |
| 1     | 1,300 hp, interval 1.1 s, volley 4 at 12 t/s, the rest as above          | 174 of 300 (1 in 1.7) | 73 / 45 / 39 s  |
| 2     | 1,700 hp, interval 1 s, volley 5                                         | 74 of 300 (1 in 4.1)  | 98 / 56 / 48 s  |
| 3     | 1,500 hp, interval 0.95 s, volley 14 t/s, tentacles 6 at 0.85 s, burst 8 | 33 of 300 (1 in 9.1)  | 85 / 51 / 42 s  |
| 4     | Volley 6                                                                 | 19 of 300 (1 in 16)   |                 |
| 5     | 1,650 hp (as built, 600 seeds)                                           | 21 of 600 (1 in 29)   | 94 / 53 / 45 s  |

Wins in 2:39-3:28; it dies in phases 2 and 3 (565 of 579), to her volleys most of all. Hard: 0 of
300, mostly in phase 1. Nothing bought: 0 of 200. The bot that can't die (`GOD=1`, 20 seeds)
takes phase 1 (578 hp) in 73-107 s, median 93, about 6 a second, phases 2 and 3 in a median 56
and 50 s: her siphons' stuns and her screech's guard drops speed them up. A person who takes the
shocks' chances should be near a minute and a half in the first, under a minute after.

## 11. As built, and what differs from the act's design

- **The fight's realm** is Lassar's (`WHISPERER_REALM`) with no puddles, no lost souls or portal
  (`souls.count` 0: Blackstone and sanity are the ways out), its sanity draining 6 a second (the
  map's 4) with a hit taking 8 (5) and refilling 20 a second in the city, a lapse taking a fifth of
  your hitpoints (a quarter), a tentacle rising near you every 6 s (8), two at most, no elite, and
  no music of its own (her fight's track plays on).
- **Her siphons are by her hitpoints, one a phase**, not at her phases' edges as on the map: a
  heal at a phase's edge would heal nothing (a boss fought on hitpoints heals no higher than the
  top of its phase).
- **The volley's lines are aimed as she begins** (`BossAttackDef.wave`), drawn on the ground, one
  a shot: at her side, a fan aimed where you are when it's thrown can't be dodged. The view now
  draws every line of a fanned wave (the Stranglewood Vardorvis's three axes too).
- **Her tentacles are marked by the realm's ripple** (2450), and lash (2460) as they land: the lash
  alone was dark on her near-black island and couldn't be seen coming.
- **Fights on another map's ground** load its recipe (`MapRecipe.fights`): before, a fight map
  looked its recipe up by its own id, so Awakened Vardorvis's clearing (never seen in a browser
  till now) would have been drawn as nothing; it's fixed for both.
- **The death**: the cache has no death animation for her (`classify-npc-seqs.ts` finds none), so
  she goes as the map's Whisperer does, at once, 2.4 s before the victory screen.

## 12. Not verified

- How it feels to a person: the bot is a density meter, not a player.
- Co-op: the party turns together and every player's Blackstone waits its cooldown, but it's
  untried with a party.
- The Wisp's worth (section 5) by more than a small sweep: on the Lassar Undercity at step 0
  (`META=max ARMOURY=max`, four adventurers by two seeds) it took the bot's median death from
  8:46 to 10:59, mostly by its calling (quicker levels); its soul heals 1 of a 25-hitpoint
  adventurer's. About what Butch does on the Stranglewood; its knobs are `every` and `reach`.
