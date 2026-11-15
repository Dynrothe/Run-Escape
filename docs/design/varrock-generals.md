# Yama's generals: Xarth and K'ril Tsutsaroth

Written 2026-11-08 for the Battle for Varrock, at Dynny's ask that day. The fixed points in
section 1 are theirs; the rest is ours to tune by playtest. The data (`content/xarth.ts`,
`content/kril.ts`, `content/varrockHordes.ts` and the map's `lairs` in `fun/maps.ts`) is the
truth, and this records the why. Yama's plan (`yama.md`) and Zachariah's playtests
(`justiciar-zachariah.md`, section 1) set the bar: the player acts and doesn't only dodge,
hitboxes are what's drawn, real assets before overlays, and a phone under 69k.

## 1. Dynny's brief (fixed)

- **Two generals before Yama**: Xarth and K'ril Tsutsaroth. Yama can't be fought until both are
  dead.
- **Where**: one in the ruins of the Grand Exchange, the other in the ruins of the church in east
  Varrock. Both are there from the start, and can be fought whenever, in either order.
- **Farm first**: hordes of demons to kill for upgrades, until the player's strong enough to take
  one on. That's the balance.
- **The second grows stronger** once the first is beaten.
- **Unique fights and abilities** for each: ours to design.
- **When** (asked later that day, once a playtest beat all three at level 1): on average a hero's
  strong enough for the first general after 8 minutes of the hordes, for the second after 15, and
  for Yama straight after the second. Section 10, Tuned to the clock, has how.

## 2. The map becomes a run

Until now the Battle for Varrock was a map to walk round: nothing came, nothing hurt, and the HUD
was the minimap, hitpoints and the hero's buttons. Farming needs a run:

- **Hordes** (`content/varrockHordes.ts`): Yama's demons fill the city on Lumbridge's pace
  (`paced`): imps, reanimated demon spawn, hellhounds, lesser demons, revenant demons, greater
  demons and black demons, with an elite a minute from 100 seconds and rings now and then. None
  has a faction (the God Wars' hellhound has one, so the map has its own copy), so they come from
  every side. It's a battle against the hordes of hell, so from the eighth minute there are
  twice as many as Lumbridge's pace has (`HORDE`, built up from the first wave). The map has
  no clock, so the last wave goes on, getting tougher by the minute as everywhere
  (`enemyHpScale`): farming forever isn't free.
- **Levels**: kills drop XP, and there are no items: each level up offers three blessings of
  Saradomin to choose from (`MapDef.blessings`, `content/blessings.ts`), in place of weapons,
  passives and caskets. Two of them are for the sword: Saradomin bracers swing it faster, and a
  Saradomin platebody makes its heavy blows (`WeaponDef.heavy`) knock back further and stagger
  longer. The Justiciar's buttons take the run's Might like any hit (`damageEnemy`), and some
  blessings change the buttons themselves (`Sim.kitAbility`), so his kit grows with the levels.
  The first few levels come as anywhere, and from there each takes more experience, up to six
  times as much from level 14 (`MapDef.levelXp`, `VARROCK_LEVEL_XP`), so a level means more.
- **HUD**: the level, XP bar, clock, the sword and its blessings, and kills are back
  (`isPeaceful` is false). The map still has no end on the clock and no visitors
  (`fun.explore`): the run ends when Yama dies, or when the hero dies to the hordes.
- **Nothing comes during a general's or Yama's fight**: the hordes run off every way from the
  lair as its intro starts (`sendOff`), and the director waits while a lair's on (`Sim.lair`).
  So does its clock (`Sim.heldTicks`), the HUD's timer too: a fight of two or three minutes had
  the hordes back a few waves on, refilled at once to the new wave's crowd and with every elite
  and ring that fell due meanwhile, which a playtest found too much (2026-11-13).

## 3. Lairs, plural

`MapDef.lair` became `MapDef.lairs`: Xarth's, K'ril's and Yama's, each asleep, waking, fought or
beaten on its own, one fought at a time.

- **Where it's fought**: Yama's on the floor. A general's on an area of its own (`LairDef.area`,
  a box, with rows for the Exchange's pad). Stepping inside wakes it, and every way out burns
  until it's beaten, found from the grid as Yama's is.
- **Standing there from the start**: each general's a map prop (`MapPropDef.lair`), hidden once
  its lair wakes. Its intro then plays where it stood.
- **Yama waits** (`LairDef.requires`): until both generals are dead, his palace is sealed from the
  start with the same fires, which go out as the second falls, in a cinematic of their own
  (`requires.unsealing`, `fun/palaceUnsealed.ts`): the camera to the palace's front steps, the
  fire going out along them, and the notice once it's back. The HUD's objective
  (`MapDef.objectives`) says to find and slay both, then Yama.
- **A death is a death**: dying in a lair ends the run, as dying to the hordes does, and Retry
  starts at the gate (`getRetryLair` has no lair to start at). It was first a beat back
  (`LairDef.retreat`: thrown out whole, the boss asleep again), taken out at Dynny's
  request: dying to a boss should be dying.
- **The second grows stronger** (`LairDef.empowered`): once a general's beaten, the other's
  fights are empowered: 1.5 times the hitpoints, 1.3 times the damage, 0.85 of the time between
  attacks, and attacks of the fallen one's (`BossAttackDef.empowered`), said on screen.
- **Yama's death wins**, though the map's endless (`LairDef.final`).

## 4. Xarth, in the Grand Exchange

A tormented demon that has mastered its flames (the Fractured Archive's, rev 242, npc 16684, with
his own animations and spot animations). In OSRS it burns with every spell, blasts the room unless
you hide behind a pillar, then sets the floor alight and raises corpses that heal it if they reach
it. Ours follows that. He doesn't move.

**Arena**: the whole of the Exchange's raised pad, 34 tiles across, its walls, booths and upper
storey gone (`clearExchange`), and fire right round its rim once he wakes (the seal, a flame every
other tile). Eight of the Fractured Archive's pillars (62738) stand in a ring round him, where the
inner ring's walls were, so one's never far whichever side you're on.

**Phase 1, "Mastered flame"** (100–50%):

| Attack        | What happens                                                                   | How you beat it                                                                                        |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Searing bolt  | A bolt at you. Each one that lands adds a stack of burn, up to three.          | Keep moving. Burn is a hitpoint a second a stack, through armour, for three seconds from the last.     |
| Flame lash    | Up close, a sweep of fire in front of him. Missed, his guard's down.           | Step out of it, then punish.                                                                           |
| Conflagration | He gathers his flames (3 s) and they burst over the whole pad, through armour. | Get behind a pillar: its shadow, drawn as he gathers, is safe. The pillar that sheltered you crumbles. |

**Phase 2, "The Exchange burns"** (50–0%): every pillar that's left comes down, and his flames take
the floor.

| Attack             | What happens                                                                                                                                                                                   | How you beat it                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| The Exchange burns | Fires take hold on the pad's floor, each lighting another beside it every five seconds.                                                                                                        | Shock wave puts fire out along its way.                |
| Reanimate          | Six of the Exchange's dead get up by the pad's rim, fourteen tiles out, and walk to him; each that reaches him heals him 4%. With the last there or dead, what got there goes up over the pad. | Kill them on the way: Shock wave binds a line of them. |
| Hellfire arrows    | A fan of five arrows at you.                                                                                                                                                                   | Step across them.                                      |

Shock wave is the button that matters in phase 2: aimed at the fire or the dead.

**Empowered** (K'ril fell first): Flames of Zamorak, K'ril's, where you stand, and burning.

## 5. K'ril Tsutsaroth, in the church

Zamorak's general, in a church of Saradomin's, against Saradomin's justiciar. The God Wars' K'ril
(npc 3129, drawn at 0.7 to fit the nave) with what he has in OSRS: poison claws, Flames of Zamorak,
his "YARRRRRRR!" smash that hits through armour, and his three bodyguards. Where Yama stays home
and Xarth stands still, K'ril comes at you down the aisle. The church's pews are burnt away for
him (`clearNave` in `battleForVarrock.ts`): three tiles across, he was too wide for the aisle they
left.

| Attack            | What happens                                                                                                              | How you beat it                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Poison claws      | A swipe in front of him that poisons.                                                                                     | Step out.                                                                               |
| Flames of Zamorak | Flames burst up where you stand and round it.                                                                             | Move off the spot.                                                                      |
| Bloodrush         | He leaps onto where you stood. Missed, his guard's down.                                                                  | Step aside, then punish.                                                                |
| YARRRRRRR!        | A long windup, then a smash round him that hits through armour.                                                           | Get out of reach.                                                                       |
| Desecration       | On a clock of its own (every 24, 20, then 16 seconds by phase): five seconds of it, then he heals 12%.                    | Hit him for 6% of his hitpoints before it's done: it breaks, and he's stunned and open. |
| His bodyguards    | Tstanon Karlak at 70%, Zakl'n Gritch at 45% and Balfrug Kreeyath at 20%. While any stands he takes half (`BossDef.pact`). | Kill them: Shock wave binds, Lightning hits a crowd.                                    |

The desecration is a damage check: a hero who hasn't farmed can't break it, and a fight he heals
through isn't one to win. That's the brief's "farm first", in the fight itself.

**Empowered** (Xarth fell first): Xarth's fire is his. His claws burn as Xarth's bolts do, and his
bloodrush leaves the ground burning (Shock wave puts it out).

## 6. Yama

Unchanged but for three things: he waits for his generals (section 3), a death in his fight
ends the run, and his death wins it.

## 7. Building blocks

| Need                         | What existed                                | What's new                                                              |
| ---------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Hordes and levels            | Waves, events, level ups                    | `isPeaceful`: a map to explore with waves hurts and levels              |
| Several lairs                | `MapDef.lair` (Yama's)                      | `MapDef.lairs`, areas of their own, `requires`, `empowered`, `final`    |
| A general where it stands    | `MapDef.props`                              | `MapPropDef.lair`: hidden while its lair's awake or beaten              |
| Burn                         | Stacking debuffs                            | A debuff's `burn`: hitpoints a second for each stack, through armour    |
| Cover from the Conflagration | The gaze's shadows (`cover`), its light     | Lair pillars (`LairDef.pillars`) that crumble (`crumbles`, `crumbleAt`) |
| Spreading fire               | A pool's lingering ground                   | A pool's `spreads`, and `dousedBy` a hero's button                      |
| Corpses                      | The Nightmare's sleepwalkers (`walkTo`)     | `walkTo.heals`                                                          |
| Bodyguards' half damage      | `summonsAt`                                 | `BossDef.pact`                                                          |
| The desecration              | `interruptedBy` (Yama's meteor), `critical` | `breakable`: a share of its hitpoints, hit in its windup; `heal`        |

## 8. Checks

- **Bot sims**: `FARM=<seconds> LAIR=<id>` plays the hordes for that long, kept out of every lair,
  then fights that lair (`EMPOWERED=1` as if its rival fell first). With `GOD=1` the bot's never
  hurt (only an unstopped meteor kills it), so the fight's length is how long the hero's damage
  takes against the boss's heals: what the fights are tuned by. Section 10 has what it found.
- **Tests**: `core/VarrockGenerals.test.ts` (lairs wake, seal and end the run; empowerment; burn;
  cover and pillars; fire spreading, doused and out when he dies; corpses healing; the pact; the
  desecration) and `core/Yama.test.ts` (his palace sealed until both are dead, a death, the
  win). `scripts/game/check-lairs.ts` (run by `battleForVarrock.test.ts` with the cache): room
  for each boss where it rises, and for K'ril down his nave.
- **Phone** (844 × 390, `frameProbe`, each fight's busiest moment): K'ril 62.6k, 67.1k with all
  three bodyguards up; Yama 55.5k to 56.7k. Xarth is 86k to 94k, over the 69k: the Exchange's
  ruins are about the budget on their own, before anything of his. On the pad (section 10) he's
  no dearer than he was on the inner ring.

## 9. Open for Dynny

- **Numbers**: hitpoints are tuned to the brief's clock on the bot (section 10, Tuned to the
  clock), to tune again by playtest. A player deals more than the bot, so if 8 and 15 minutes
  still come early, hitpoints are the knob: K'ril's heal goes with his, so he climbs steeply.
- **The hordes at 15 minutes**: farming that long was never asked of a player before. They're
  twice the crowd from the eighth minute and tougher every minute, and the bot can't say whether
  a player lasts that long (`SAFE_WAVES=1` keeps it alive).
- **The Exchange on a phone**: its ruins alone are about the whole budget, so Xarth's fight is
  over it. The pad's walls and booths are gone now, but its floor is locs (about 50 triangles a
  tile, a thousand tiles), and slimming that is work of its own.

## 10. What the bot found

The Justiciar, 3 seeds each, `DODGE=1`. `FARM` is how long it plays the hordes first, with
`SAFE_WAVES=1` keeping it alive meanwhile: without it the bot dies to them at 4:00 to 7:04, as it
does on Lumbridge's waves. Each cell is wins out of 3, with what the boss had left in the losses.

| Fight              | Fresh (level 1) | 3 min (12–15) | 5 min (20–21) | 8 min (29–32) |
| ------------------ | --------------- | ------------- | ------------- | ------------- |
| Xarth              | 0 (87–88%)      | 0 (23–86%)    | 0 (22–62%)    | 3 (15–34 s)   |
| K'ril              | 0 (85–92%)      | 1 (32%, 83%)  | 3 (34–51 s)   | 3 (22–35 s)   |
| Xarth, empowered   |                 |               | 0 (42–68%)    | 2 (1%)        |
| K'ril, empowered   |                 |               | 1 (60%, 84%)  | 2 (9%)        |
| Yama (both beaten) | 0 (69–74%)      |               |               | 2 (28%)       |

Yama after 10 minutes won all three (25–109 s) and after 12, two (7% left in the loss). So a
hero fresh to any of them loses badly, K'ril is ready a few minutes before Xarth, the second
general needs more farming than the first, and Yama more again.

What the sims changed:

- **Xarth's burn**: five stacks of four seconds, which every bolt refreshed, did 30 of the 48
  damage that killed the bot at every farm time. Three stacks of three seconds.
- **The nave**: K'ril (radius 1.6) didn't fit the aisle the pews left, rose outside the nave and
  stood there for minutes while his desecration healed what the bot did from range. The pews and
  a tile blocked in OSRS are gone (`clearNave`), and `scripts/game/check-lairs.ts` holds every
  lair's boss to having room.
- **The counter**: the dressing had laid a burnt skeleton on the cleared counter, where Xarth
  rises. The dressing keeps off it now.
- **Yama**: his 5,400 hitpoints were for a level 1 hero with nothing before him. Ten minutes of
  hordes and two generals in, he went down faster than either general, so he has 8,400.

The party bot doesn't go into lairs, so co-op only got the hordes: a party of two lasted 8:00,
6:24 and 6:24 against them, where one hero lasts 4:00 to 7:04.

### Slower levels and thicker hordes

A playtest found the levels came too quickly and the hordes too thin, so levels past the fourth
take more experience (six times as much from level 14) and the hordes double by the eighth
minute. The Justiciar's buttons come back two to two and a half times slower, each hitting harder,
and the gaze is his ultimate at 30 s. The same seeds and settings as above, on the code before and
after, with the bot as it is now (it had been walking to food the hordes left outside a sealed
lair, out of its boss's reach, which had stretched its Yama fights to minutes):

| Bot at                 | Before       | After        |
| ---------------------- | ------------ | ------------ |
| 3:00                   | level 12–13  | level 7      |
| 8:00                   | level 28–31  | level 18–20  |
| 12:00                  | level 38–41  | level 24–29  |
| No `SAFE_WAVES`, dies  | 4:05 to 8:31 | 3:02 to 3:59 |
| Xarth after 8 minutes  | 2 (2%)       | 0 (32–56%)   |
| Xarth after 12 minutes |              | 2 (29%)      |
| K'ril after 8 minutes  | 3 (19–25 s)  | 2 (48%)      |
| K'ril after 10 minutes |              | 3 (22–35 s)  |
| Yama after 10 minutes  | 3 (31–36 s)  | 3 (44–52 s)  |

So each general wants a few more minutes of farming than before, about 10 for K'ril and 12 for
Xarth, and the hordes are a real danger sooner: the bot without help dies to them a minute or more
earlier. Yama still goes down to a hero that's beaten both generals. The bot keeps out of the
fires (`firesToAvoid`) and counts them in its dodges, and its gaze is for his meteor.

### Blessings to choose, and a heavier sword

A playtest asked for upgrades to the sword and for choosing them: each level up now offers three
blessings, and two of them are the sword's (Saradomin bracers for speed, a Saradomin platebody for
knockback and a longer stagger). Its blows land heavy: half as much knockback again as a 2h
sword's, a camera shake, and a stagger that holds what's hit still for 0.3 s. The bot takes
blessings in a fixed order (`BLESSING_RANK`), where before it got them at random. The same seeds
and settings as above, on the code before and after:

| Bot at                 | Before (at random) | After        |
| ---------------------- | ------------------ | ------------ |
| 3:00                   | level 7            | level 7–8    |
| 8:00                   | level 18–20        | level 18–19  |
| 12:00                  | level 24–29        | level 27–28  |
| No `SAFE_WAVES`, dies  | 3:02 to 3:59       | 1:22 to 3:51 |
| Xarth after 8 minutes  | 0 (32–56%)         | 1 (33–37%)   |
| Xarth after 12 minutes | 2 (29%)            | 3 (24–32 s)  |
| K'ril after 8 minutes  | 2 (48%)            | 3 (28–37 s)  |
| K'ril after 10 minutes | 3 (23–30 s)        | 3 (21–25 s)  |
| Yama after 10 minutes  | 3 (44–52 s)        | 1 (28–44%)   |

The order matters more than anything here. Damage first and hitpoints and armour after
(crossbow, strength, light, blade, bracers, staff, brew) beat Yama 3 of 3 in 29 to 52 s and K'ril
as above, but lost to Xarth at 12 minutes 3 of 3 and won 1 of 3 at 8: his bolts and arrows need
armour. Taking brew and ward early, the order the bot has now, wins 11 of the 15 fights to the
random draws' 10 and damage first's 10. A player can build for the fight in front of them,
which no fixed order does. The bot that dies at 1:22 met imps and fires with only the sword: no
crossbow had been offered by then.

### The whole pad

Xarth's fight moved from the Exchange's inner ring to the whole raised pad: every wall, booth and
the upper storey on it gone, down to the deck's floor, and the seal round its rim. A bigger floor
needed the rest to grow with it:

- **Pillars**: four round him were too far apart for a hero across a pad 34 tiles wide, so eight
  stand in a ring where the inner ring's walls were.
- **The dead**: they rise fourteen tiles out, by the rim, where they rose nine out on the ring, so
  they walk longer and give Shock wave a longer line. Six of them, healing 4% each, where four
  healed 5%: at most 24% back, against 20%, for a walk half as long again.
- **The seal**: fire on every one of the rim's tiles cost 18.8k triangles in a phone's view. Its
  `spacing` draws one every other tile, at twice the size, for 11k; every tile's still sealed.

The Justiciar, 3 seeds each, as above, on the code before and after. The pad's walls change where
the hordes go too, so the levels at 12 minutes aren't quite the same (27–28 before, 28 after):

| Xarth, after          | The inner ring | The whole pad |
| --------------------- | -------------- | ------------- |
| 8 minutes             | 1 (21%, 31%)   | 1 (18%, 19%)  |
| 12 minutes            | 3 (24–26 s)    | 2 (9%)        |
| 12 minutes, empowered | 0 (2–38%)      | 2 (12%)       |

Wins out of nine went from four to five, which is the bot's noise: the fight is about as hard as
it was. The wins take a few seconds longer, with more floor to keep away on. On a phone
(844 × 390, distance 18, measured the same way on both):

| Where                  | The inner ring | The whole pad |
| ---------------------- | -------------- | ------------- |
| As he wakes            | 92.6k          | 86.3k         |
| On the pad's south rim | 92.0k          | 93.5k         |
| Phase 2 at its busiest | 96.9k          | 88.5k         |

Both are over the 69k as before. What's left is the Exchange's ruins and its floor (section 9).

### Tuned to the clock

A playtest beat Xarth, K'ril and Yama at level 1, before a single blessing, so Dynny set the clock
in section 1: about 8 minutes of the hordes for the first general, 15 for the second, and Yama
straight after. The bot's no judge of that on its own. It lasts about half a minute against Xarth
whatever its level, and not much longer against K'ril, where a player who dodges lasts the fight,
so its wins and losses say how well it dodges. With `GOD=1` it's never hurt, and how long a fight
takes is then how its damage does against the boss's heals: that's what's tuned. A player deals
more than the bot (its buttons on cooldown and every swing on the boss, about 41 a second at level
1 to its 31), so a fight that's long for the bot is shorter for them.

Each boss stops a fresh hero for a reason of its own, and every one of them goes by its hitpoints:

- **Xarth**: the Conflagration takes a pillar every 14 seconds or so, and they're gone about two
  minutes into his first phase, which ends at half. At level 1 the bot has him at 73% then, and a
  player who never misses at about 64%; after that each Conflagration is 16 through armour, of 38.
  In his second phase each of the dead that reaches him heals him 4% of his hitpoints.
- **K'ril**: his desecration heals 12% unless 6% of his hitpoints land in its five seconds. At
  8,400, that's 1,008 healed every 16 to 24 seconds, about all a level 1 hero deals in that time
  at best (and half that while a bodyguard's up), and a break of 504, more than everything on a
  level 1 hero's buttons and three swings.
- **Yama** can't be reached until both are dead, so he's tuned to the hero that beat them.

The empowered general had 1.3 times the hitpoints and 1.25 times the damage. The bot's hero gains
a third to a half again between 8 and 15 minutes, so it's 1.5 and 1.3 now. Past 10 minutes the
bot's blessings do less (the last ranks of strength and the blade, and Zeal), so a fight there
shortens less than its levels suggest.

The Justiciar, 3 seeds each, `DODGE=1 SAFE_WAVES=1 GOD=1`, the average time to beat each (its
level when it went in, in brackets); "stuck" is still up after ten minutes. Yama's third seed
walks into his palace at 5:28, level 11, and isn't counted.

| Fight                      | Before (3,800, 4,200, 8,400) | After (13,300, 8,400, 25,200) |
| -------------------------- | ---------------------------- | ----------------------------- |
| Xarth at level 1           | stuck (73–95%)               | stuck (98–100%)               |
| Xarth after 5 min (11)     | 53 s                         | 164 s                         |
| Xarth after 8 min (19–20)  | 36 s                         | 122 s                         |
| Xarth after 10 min (24–25) | 31 s                         | 100 s                         |
| K'ril at level 1           | stuck (86–97%)               | stuck (97–100%)               |
| K'ril after 5 min          | 41 s                         | 229 s (161–332)               |
| K'ril after 8 min          | 31 s                         | 99 s (63–132)                 |
| K'ril after 10 min         | 25 s                         | 77 s                          |
| Xarth empowered, 10 min    | 38 s                         | 157 s                         |
| Xarth empowered, 13 min    | 41 s                         | 157 s                         |
| Xarth empowered, 15 min    | 34 s                         | 134 s                         |
| K'ril empowered, 10 min    | 33 s                         | 207 s (105–278)               |
| K'ril empowered, 13 min    | 31 s                         | 153 s                         |
| K'ril empowered, 15 min    | 27 s                         | 135 s (83–201)                |
| Yama after 10 min (21–24)  | 53 s                         | 127 s                         |
| Yama after 15 min (32)     | 45 s                         | 97 s                          |

So each fight takes a minute and a half to two and a quarter at its time, half as long again or
more a few minutes sooner, and can't be won at level 1. K'ril climbs the most steeply: at 9,600
he was beaten once in three at 5 minutes, in 594 s, and took 93 to 409 s empowered at 15. Yama at
21,000 took 92 s at 15 minutes and at 25,200 took 97, as his phases and the meteor's clock take
their time whatever the damage.

The same, mortal (no `GOD`): before, the bot beat K'ril every time from 5 minutes, and Xarth 1 of
3 at 8 minutes. After, it beats K'ril 1 of 3 at 8 and 10 minutes and empowered at 15, and never
Xarth or Yama: it's beaten back from Xarth in 19 to 36 s as it was before, and lasts 63 to 114 s
on Yama's floor.

`GOD=1` used to let Yama's rising floor hurt the bot, so it was beaten back from him even when
"never hurt". It's kept whole now as well as untouchable, and only an unstopped meteor kills it.
