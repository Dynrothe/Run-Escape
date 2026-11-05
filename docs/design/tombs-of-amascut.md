# The Tombs of Amascut: design

The plan for the game's second raid, before it's built: what it is, how each room and boss works,
and the order it's built in. Written 2026-11-04, on the `feat/toa-base` branch. As each piece lands
its section here becomes the record of it, the way `phosanis-nightmare.md` is for her fight.

The research behind it is OSRS's own (the OSRS Wiki's Tombs of Amascut, Invocations and boss pages,
and the runescapeguides.com Wardens and Kephri guides), and what the game's cache has (section 10).
OSRS changed almost nothing in the raid after September 2025, so the cache (2026-09-30) is
missing none of it.

## 1. What it is

The most interactive raid in the game. In OSRS each boss has a puzzle room before it, and that's
kept: you start in the Nexus, pick any of the four paths, solve its room, then fight its boss. Once
all four are done, the Wardens. Unlike OSRS's rooms, ours roll a variant as you come in and change
while you're in them, so no two raids play alike.

It isn't released until the whole raid is done. Until then it's a dev map (`tombs_of_amascut`, on
the map screen's Dev tab, dev server only), and each piece goes in as a pull request of its own.

## 2. Principles

- **Real assets, real mechanics.** Every boss, room and effect is the cache's own (section 10), and
  every mechanic OSRS has is kept, as bullets to dodge where a survivor game needs it. Zebak's
  thrown rocks are bullets; Ba-Ba's big boulder bursts into bullets.
- **Played by moving.** Weapons fire on their own, so every puzzle is solved by where you stand
  or walk: carrying water by standing under a fall, pushing a mirror by walking into it, fixing a
  pillar by standing at it, choosing an obelisk by which one's nearest your weapons.
- **Fought through waves.** A puzzle room is never quiet. Its waves are what you level up on.
- **Hard, and the Wardens nuts.** Every boss is meant to be learnt, with OSRS's tells, but none is
  a walk. The Wardens are three phases of everything at once.
- **Dynamic.** A room picks its variant on entry, and something about it changes partway.

## 3. How a raid runs

- **Before it**: the invocation board (section 7) on the setup screen, in place of endless, hard
  and expert. What's picked comes to a raid level.
- **The Nexus**: the real room, with the four path doors (Apmeken, Het, Scabaras, Crondis) and the
  entry. Walk up to a door to take its path.
- **A path**: its puzzle room, then its boss in its real arena, then back to the Nexus.
- **Rooms grow with the raid**: the third or fourth path done is tougher than the first, so any
  order plays fair (and Walk the Path levels them up further).
- **The Helpful Spirit**: in the Nexus after two paths and again after four, a supply pick bought
  with raid points, as the Theatre of Blood's chest is.
- **The Wardens**, once all four paths are done, then the chest.

## 4. Level-ups and gear without timed waves

The waves no longer run on a clock, but they're still where experience and caskets come from.

- **A room's waves are tied to its puzzle.** It has a set number of them, and each step of the
  puzzle solved sends the next. Every step drops a casket.
- **Stalling is pushed back on.** A room's hazards and swarms grow while nothing's solved, as
  Crondis's crocodiles turn up after about 40 seconds in OSRS.
- **No farming.** Once a room's waves are spent, whatever still comes gives almost no experience.

## 5. The puzzle rooms

- **Apmeken** (first to be built). Eight waves of baboons. "Sight" is a pickup: whoever holds it
  sees which pillar or vent is failing, and fixes it by standing on it. Shamans summon more
  baboons unless killed first, volatiles explode into their own pack, venom baboons leave poison
  lanes. In co-op, corrupted teammates gather to be cleansed.
- **Het.** The caster statue's beam, routed onto the seal by pushing mirrors (walk into one). The
  beam burns enemies as well as you, so it's a weapon you aim through the room. Orbs of Darkness
  cross in straight lines and dirty the mirrors; some mirrors turn on their own. When the beam
  lands the seal is down for 9 seconds, and every weapon hits it.
- **Scabaras.** Three of four puzzles in a random order, then the number tablet, with scarab
  swarms chasing throughout: memory tiles (walk the sequence), Lights Out plates (enemies can knock
  you onto the wrong one), obelisk order (your weapons hit the nearest), and the tablet (walk over
  glyphs that add up to the target; over sends a punishment wave). Take too long and tiles shuffle.
- **Crondis.** You carry the water: stand under a fall to fill up, walk it to the palm, and a hit
  spills half. Falls dry up and move. Crocodiles go for the palm and drink from it. Spike statues
  fire down lanes, and poison clouds sweep the room, light (a warning) before dark.

### The Apmeken room, as it'll be built

- **The room**: square 59,82, cut from world 3790,5267, 37 by 28. The entry is on the east (local
  49,31) and the exit on the west (15,30), each behind a barrier (45135, x 20 and 44, y 31 to 33)
  that holds until the room's done. Apmeken's statue (45496) stands in the middle.
- **Pillars**: the four roof supports (45494, 3 by 3, local 27,21 35,21 27,41 35,41), whose own
  animation (9503) is a pillar giving way. **Vents**: the four red grates in the main floor's
  corners (ground decoration 5982, about local 24,37 25,28 40,37 41,28). The six holes in the walls
  (45024) are where OSRS's baboons crawl in. The crates of hammers (45497) and potions (45498) are
  scenery: here the fix is standing at it.
- **The loop**: "You sense an issue" every so often, and a pillar or a vent shows it. Stepping on a
  vent fixes it at once (OSRS drops a potion in), and a pillar takes about a second (a hammer's hit); one left too long hurts everyone, more for each left. Each fix is a
  step: it sends the next of the room's eight baboon waves and drops a casket. After the eighth,
  the west barrier opens to Ba-Ba. Sight is everyone's solo; in co-op one player holds it and only
  they see which needs fixing.
- **Baboons** (all on skeleton 2063: idle 9741, walk 9739; attacks among 9742 to 9751, the death
  likely 9744 or 9745, to look at): brawler 11709/11712 (melee), thrower 11710/11713 (thrown rocks,
  as bullets), mage 11711/11714 (spells), shaman 11715 (summons thralls 11718 unless killed first),
  volatile 11716 (explodes, hurting its own pack too), cursed 11717 (curses: weaker for a while).
  Waves as OSRS's: the first two brawlers and a shaman, the eighth a shaman, two volatiles and two
  of the specials.

## 6. The bosses

- **Ba-Ba** (first to be built): rolling boulders in lanes, with a cracked one in each row that
  can be shot; rockfall, a shadow and then a rock throw to take cover from behind debris or a
  sarcophagus; her big boulder bursting into bullets; the shockwave cone; baboons setting off the
  sarcophagi.
- **Akkha**: prays against your style and swaps (the Theatre's colours already do this); four
  quadrants with their effects (fire burns, shadow drains, lightning blocks prayer, ice slows);
  shadows at 80/60/40/20% to kill before their bars fill; Memory Blast's safe quadrants; trailing
  orbs that come wherever you move, so the answer is to stand still.
- **Kephri**: fireballs on marked tiles; Dung Strike; eggs that burst unless killed; her shield's
  scarab swarms, running at her from six spawns, each one that gets there restoring it, so your
  weapons have to cut them down; spitting, arcane and soldier scarabs.
- **Zebak**: rocks and splitting pots as bullets; Great Roar (hide behind a boulder); the tidal
  wave with a gap that shrinks; poison pools that a pushed jug washes away; an enrage below 25%.
- **The Wardens**, three phases:
    1. The obelisk, with orbs down troughs (blocking one picks which Warden comes next) and the
       floating pyramids.
    2. The Warden, with the obelisk's converging, windmill and lightning-skull patterns, style
       changes, the freezing projectile, and its core thrown out for five times the damage.
    3. Floor slams, energy siphons to destroy, two path bosses' phantoms (Akkha and Kephri with
       Elidinis' Warden, Zebak and Ba-Ba with Tumeken's), everything at once, and at 5% the floor
       falling away row by row.

### The Wardens' third phase floor (for when they're built)

The owner's ask: the real floor, with its tiles moving under the slams, as tech for other maps too.
What the cache has, in square 61,80: a grid of plates, each its own loc id (45650 on, one a plate,
4 by 4 in the middle and 4 by 2 along the edges, plus edge pieces 45715 to 45725), none with an
animation of its own: OSRS's server moves them. So:

- **Each plate a model the game draws**, baked as a loc (as the cannon is), at a height the sim
  sets: sinking, shaking as a warning, or falling away. The motion's ours, as the cache has none.
- **Collision that changes**: the map's collision is an array the sim reads every tick, so a plate
  gone blocks its tiles. It's kept per map across runs, so a run puts it back when it ends.
- **The slams**: a half of the floor shakes, then drops and comes back (right, left, both). **The
  enrage**: plates fall away for good, row by row from the back.
- **For other maps**: moving plates as a feature of their own (any loc a map marks, with its height
  and collision the sim's), for collapsing bridges, rising platforms, trap floors.

## 7. Invocations

`content/invocations.ts`. They replace endless, hard and expert there: the Theatre of Blood keeps
its switches. Only one of a group marked `one` (attempts, time limit, Helpful Spirit, path level)
is on at a time. Each adds to the raid level, which sets the whole raid's scale
(`RAID_LEVEL_SCALE`, the map's own difficulty being a first map's): enemies' hitpoints and
damage, bosses' hitpoints, and how many bullets a boss's patterns fire, through points at 0, 150,
300 and 500, each growing by the same share a level between them. Entry is for a run that's
bought nothing: weaker than a first map, and it can be won from scratch, slowly. Normal wants the
shop's upgrades and better gear, Expert more, and past it bosses climb quicker and quicker. A
room's enemies rise more gently than its bosses: a run levels up on them from level one. It also
raises raid points and the purple chance. Bands: Entry under 150, Normal under 300, Expert from
there.

Below Normal the raid goes easier on a run with nothing: a puzzle room's worth two levels as it's
done, a boss's adds drop food (none from Expert up), food spills as each of the Wardens' phases
ends, hits that take a share of your hitpoints take less, Crondis's crocodiles come fewer, and the
path level counts for about a third. The path level itself scales gently (+15% a room's enemies'
hitpoints a level, +12% a boss's), as OSRS's does.

| Group          | Here                                                           |
| -------------- | -------------------------------------------------------------- |
| Attempts       | revives for the whole raid, down to none                       |
| Time limit     | a clock for the raid; running out lowers the loot, not the run |
| Helpful Spirit | smaller supply picks                                           |
| Path level     | more puzzle, faster hazards, denser bullets                    |
| Paths          | Walk the Path: finishing a path levels others up               |
| Prayer         | armour stops less; a hit leaves you open                       |
| Restoration    | no food, no regeneration, specials less often                  |
| Each boss      | OSRS's own: Boulderdash's boulders twice as fast, and so on    |

The raid level's scaling works now, for every invocation (the sim's `hardScale` is the raid
level's there), and so does what each does besides: the board's "Not in yet" (`comes`) is gone from
all of them. The time limits (Walk for It to Sprint for It) are on the run's clock, which stops in
the Nexus: past it, the chest goes by a raid level lower by the drop (`TOMBS_TIME_LIMITS`), and the
board says so. The Helpful Spirit's three leave two thirds, a third and almost none of its supplies
(`TOMBS_SPIRIT_SHARE`), and Dehydration none that heal.

## 8. Loot

What the chest's uniques do, decided 2026-11-04. The chest goes by the raid level (section 7), as
the Theatre of Blood's goes by raid points. As the Theatre's rapier and scythe do, a unique
unlocks something in the game.

- **Osmumten's fang, Tumeken's shadow, Lightbearer**: in the game now without the raid (the two
  weapons from the start, the ring from caskets). The chest's unlocks them. Anyone who already has
  them, or played before the change, keeps them.
- **Masori mask, body and chaps, Elidinis' ward**: the last Armoury step of the Armadyl pieces and
  the Arcane spirit shield needs the chest's piece before it can be bought. Upgrades already bought
  stay.
- **Tumeken's guardian**: a pet (`content/pets.ts`, once pets are in).
- **The jewels: the keris partisans**, a new melee family (all in the cache: 25979, 25981, 27287,
  27291, and of Amascut 30891). Kalphites and scarabs are in the game already (the desert, the
  Kalphite Queen, Kephri's scarabs), so their bonus has something to hit.
    - **Keris partisan**: killing the Kalphite Queen in the Kharidian Desert (OSRS gives it for
      Beneath Cursed Sands, a desert quest). Fast stabs, a third more against kalphites and scarabs.
    - **Of breaching** (Breach of the Scarab): now and then a gap in the shell for triple damage,
      far more often against kalphites and scarabs.
    - **Of corruption** (Eye of the Corruptor): every so often Wrath of Amascut, a big stab whose
      target takes 25% more from everything for 6 seconds.
    - **Of the sun** (Jewel of the Sun): heals on every kill and hits harder below 25% health;
      Tumeken's Light, on a long cooldown, heals in full and cures poison.
- **Thread of Elidinis: the Divine rune pouch.** In OSRS the thread on a rune pouch makes the
  divine pouch, four runes instead of three. Here the thread puts the pouch in the level-up
  choices, as a rare passive, for every adventurer. It takes a passive slot (the price, and with
  it maybe an evolution, since passives are what weapons evolve with) and gives a slot that holds
  a magic weapon only, at one level. Holding it, magic weapons are offered to an adventurer of any
  style, for that slot. So a melee or ranged build can carry the third style the Theatre of
  Blood's expert mode asks for (its Nylocas take nothing from the wrong one), and a magic build
  gets one more spell. (It was magic adventurers only at first; that did nothing for expert.)

### Combat Achievements

Combat Achievements are PR 110 (`content/combatTasks.ts`, `core/CombatTracker.ts`), which already has
the Theatre of Blood's tasks. Once it's merged and the raid's done, the Tombs get tasks matched to
OSRS's own ToA ones, mostly on its goal kinds (`kill` with `within` or `without: ["hits"]`, `win`
with rules, `beatMap`):

- **Each path**: its boss with no deaths, within a time, and its mechanic done right (Ba-Ba with no
  boulder hits; the Apmeken room with no pillar or vent left to go).
- **Raid level**: beat at Entry, Normal (150), Expert (300) and up to 500, a raid level on
  `beatMap`.
- **Invocations**: a Hardcore Run, and Insanity once the Wardens are in.
- **The whole raid**: no deaths, and a speed run.

## 9. The order it's built in

Each a pull request, merged with the raid still a dev map:

1. **The base** (this): this document, the dev map with the Nexus cut from the real raid, and the
   invocation board with its raid level.
2. The Apmeken room.
3. Ba-Ba.
4. Het and Akkha, Scabaras and Kephri, Crondis and Zebak, a room then its boss each time.
5. The Wardens.
6. The Helpful Spirit, the chest and its points, the bot and the Tombs' sim.

As it went (decided November 2026): everything to 6 went into one pull request, still a dev map,
for other contributors to play and suggest changes before it goes live. Then: what the uniques
unlock (section 8), and moving it to the Raids tab.

## 10. What the cache has

Cache `osrs-241_2026-09-30`. Ids from `scripts/cache/find-npcs.ts`, `find-locs.ts` and
`dump-square.ts`; the spot animations from a lister of those whose model or animation is in the
raid's ranges.

- **Rooms** (map squares, all with terrain and readable locs): Nexus 55,80; Scabaras 55,82; Kephri
  55,84; the tomb 57,80; Het 57,82; Akkha 57,84 (plane 1); Wardens' first two phases 59,80;
  Apmeken 59,82; Ba-Ba 59,84; Wardens' third 61,80; Crondis 61,82; Zebak 61,84.
- **Ba-Ba** 11778 to 11780 (idle 9741, walk 9737); her rolling boulders 11782 and 11783 (size 3);
  baboons: brawler 11709/11712, thrower 11710/11713, mage 11711/11714, shaman 11715, volatile
  11716, cursed 11717, thrall 11718.
- **Akkha** 11789 to 11796, his shadows 11797 to 11799, the orbs: lightning 11800, darkness 11801,
  burning 11802, frozen 11803, unstable 11804.
- **Zebak** 11730/11732, his tail 11731/11734, jugs 11735/11736, waves 11738 and 11739.
- **Kephri** 11719 to 11722, her swarm 11723, soldier 11724, spitting 11725, arcane 11726 and
  agile 11727 scarabs.
- **The Wardens**: the first form with its obelisk 11746 to 11749, fighting 11753 to 11757, the
  last 11761 to 11764, the obelisk 11750 to 11752, the core 11770/11771, the energy siphon 11772,
  the phantoms of Zebak 11774, Ba-Ba 11775, Kephri 11776 and Akkha 11777.
- **Pets**: Tumeken's and Elidinis' Guardians (11652/11653), their damaged recolours, Akkhito,
  Babi, Kephriti and Zebo.
- **Locs**: the path doors 46155 to 46166 and the entry 46167; Het's mirrors 45455/45457; Zebak's
  waterfall 45398/45399; pillars 45530/45531; pressure plates 45340/45344 and tiles 45356 to 45364;
  Ba-Ba's throne 45756 and sarcophagi 45752/46044; the invocation board 46073.
- **Spot animations** about 2114 to 2271: the puzzle rooms 2114 to 2140, Kephri 2141 to 2171,
  Zebak 2172 to 2192, the Wardens 2201 to 2241, Ba-Ba 2242 to 2246, Akkha's elements 2249 to 2255.
  Which is which is a guess from their neighbours until each is looked at.
- **Not there**: the Het beam isn't a loc or an NPC, so it'll be drawn from one of the puzzle
  rooms' spot animations if one fits. Many of the rooms' props have no name, and `find-locs.ts`
  can't list them: `dump-square.ts` with `WHERE=` can.

## 11. The base, as built

- **The map**: `scaperune/maps/tombsOfAmascut.ts`, at map squares 86 to 93 by 66 to 69: a grid of
  one-square cells, six by two, one for each room, with only the Nexus filled so far. The Nexus is
  cut from world 3536,5130 (32 by 36), stood level, and sealed to what can be walked to from the
  entry: 303 tiles. It's listed in `maps/devMaps.ts`, which a build leaves out, so none of it
  ships. Its id doesn't start with `scaperune_`, so the catalogue's ban on the raid's own floor
  doesn't apply.
- **The Nexus doors**: `MapDef.tombs.paths`, each with its door's middle. Walking up to one says
  it isn't open yet (`Sim.stepTombs`), once as you come up to it.
- **The board**: Invocations in the setup bar, with the raid level and its band, opens the board.
  What's picked is kept in the save (`SaveData.invocations`) and goes to the run as
  `SimOptions.invocations`.
- **Ba-Ba** (`content/tombs.ts`, her fight in `Sim.stepTombsBoss`): her arena's cut turned so her
  throne's north, and she rises once the party's a step past the gap at its foot. Her attacks:
  the shockwave round her (a ground mark); rockfall, shadows in a cross on your tile (a `cross` of
  ground marks, `shadow`) with a rock coming down into each; her boulder, which comes down beside you
  (never on you: `beside`) under its shadow and OSRS's falling debris (1727), breaks into shards and
  stays as a Rubble rock (11784 to 11787, solid: `leavesCover`); the avalanche that follows it, most
  of your hitpoints unless you're beside a rock (`takeCover`, the safe ground ringed in green); and
  calling baboons. The shadows are drawn on the overlay: no spot animation in her range is one.
    - **Rolling boulders**, at 66% and 33%: she goes up to her altar and the party's put at the
      foot. Rows of five boulders roll down five lanes (`BulletPatternDef.gapStep`), one of them the
      cracked boulder (NPC 11783, `cracked`), an enemy that rolls with its row (`Enemy.rolls`) to be
      broken, at most two lanes from the last row's. A hit knocks you back. Getting back up to her
      altar's rows, anywhere across, ends them.
    - **Sarcophagi**: the eight along the floor's sides (45752). Her baboons make for the nearest
      closed one (`summon.sarcophagi`, `Enemy.seeks`) and pry at it for a few seconds; one that
      gets it open (45753 drawn over it) has it fire fans of red bolts (2246) across the arena.
    - **Invocations**: Mind the Gap (the gap at the foot, where her barrier stood, kills),
      Boulderdash, Shaking Things Up, Jungle Japes (banana peels root you, drawn as the Banana) and
      Gotta Have Faith (the sarcophagi's bolts hit harder: there's no prayer here to scale by).
    - Her hitpoints go up with the path level (`TOMBS_BOSSES`), as does each path's boss's.
    - Her boulders are drawn as her Boulder NPC (11782) rolling (9518): the rows
      (`BulletPatternDef.look`), the shards, and the boulder that drops into each rockfall and boulder
      circle over its warning (`BossAttackDef.falls`). OSRS's own falling-rock spot animations (1727, 2250) are cave-ins made for its low camera: from ours the rock stays off the top of the
      screen.

- **Akkha** (`content/tombs.ts`, his fight in `Sim.stepAkkha`), the Het path's boss, after its seal
  breaks. His arena is square 57,84 on plane 1, brought down (`bringDown` in `prefab.ts`) and turned
  so you walk in from the south. Its floor is stone pieces on the plane under it (45872 to 46037),
  brought along and sunk to the ground with their blocking off (`LocOverrides.ts`), so the dial and
  its four symbols are the real thing. The quadrants' elements follow the floor's symbols as they
  lie once it's turned: darkness north-west, lightning north-east, ice south-east, fire south-west.
    - **Styles**: a form for each (`akkha`, `akkha_ranged`, `akkha_magic`), each praying against
      its own. Every seven attacks (six with Stay Vigilant) he does a special and turns to another.
      Melee swings and stamps out a ring; ranged fires fans and a spiral of sand; magic rings and
      streams red sand, which brings the element of the quadrant it hits you in.
    - **Memory Blast**, Simon says: he vanishes to the middle and can't be hurt, the symbols light up
      one at a time (each beside the last, never across), the quadrant glowing with its element. Then,
      2.4 seconds apart (1.2 with Feeling Special), every quadrant but the next in the order is
      blasted for nearly half your hitpoints and its element. Four steps, one more every two path
      levels.
    - **Trailing orbs**: for a while, an orb (its quadrant's, 11800 to 11803) on every tile anyone
      leaves, armed after a moment, going off under whoever steps on it. Standing still drops none.
      Feeling Special drops one three tiles ahead too.
    - **His shadows**, at 80, 60, 40 and 20%: an Akkha's Shadow in each corner, and he can't be hurt
      except standing in a quadrant whose shadow is dead, so you kill one and draw him into its
      quarter. One timer (the HUD counts it down) runs for them all: when it's out, every quadrant
      whose shadow's still up floods for half your hitpoints and its element, and it starts again.
      They're done when all four are dead, and back at the next threshold.
    - **Final stand**: at 0 he rises (`rises`) as `akkha_enraged` with a fifth of his hitpoints, in
      a corner, praying against ranged and magic, and sends Unstable Orbs (11804, their arrows the
      way they go) straight or slanting across the floor. He moves corner once he's lost a share of
      his hitpoints there, or after a while.
    - **Invocations**: Double Trouble (both specials at once), Keep Back (beside him, his ranged and
      magic bring an unseen melee hit), Stay Vigilant, Feeling Special.
    - Not in yet: Detonate (a party's crosses).
- **The Scabaras room** (`SCABARAS` in `content/tombs.ts`, `Sim.stepScabaras`): square 55,82 whole,
  unturned, entered from the east nook behind a barrier at x 59 the sim holds. OSRS spawns its plates
  as the room starts, so the boards are drawn by the client (`GameView.drawScabaras`) with the cache's
  own plates, on tiles whose patterned floor decoration the map leaves out. All four puzzles are
  needed (OSRS's solo takes one a side, then the last), each a casket and the next wave:
    - **Sequence** (north hall's east room): 12 plates light one at a time (0.6 s each), 5 steps plus
      one a path level, up to 9. Step on them in order; a wrong plate drops the roof on you and a
      new order's shown.
    - **Lights out** (south hall's east room): a ring of 8, each toggling itself and its neighbours,
      scrambled by 3 presses plus the path level. A scarab knocks a light out every 14 s (less with
      levels).
    - **Addition** (north hall's middle room): 12 symbols worth 1 to 9 (Line to Foot) and the
      tablet's number, 20 to 45, shown on the HUD. Past it, the roof comes down and they reset.
    - **Matching** (the west room, last): two boards of the same nine hidden symbols either side of
      the chasm. A pair that matches stays; one that doesn't drops the roof and hides again. 4 are
      done as it starts, one fewer each path level.
    - A mistake takes a quarter of your hitpoints, through armour. Meanwhile rocks fall near
      everyone every 4.5 s (down to 1.8 with levels), shown by 302's falling roof, and every rock
      breaks into shards, bullets out all round. Scarabs (11697, ranged) and Kephri's swarms
      stream in from the passages.
    - Not in yet: the obelisk puzzle (OSRS's random one, which the wiki has solos skip).
    - Matching's room, west, is walled off in OSRS by barriers (45135, 45375 to 45379) that open
      once the other three are solved. Cut with the room they never opened, so nobody could finish
      it: they're left out, and its tiles won't turn till then anyway.
- **Kephri** (`KEPHRI` in `content/tombs.ts`, `Sim.stepKephri`), the Scabaras path's boss, after its
  room. Her arena is square 55,84's floor, cut without the teleport crystal's room past its chasm and
  turned a quarter clockwise, so you walk in from the south and she sits at the north. She never moves.
    - **Her attacks**, as data: fireballs (Vorkath's firebomb, 2167) down on where you stood under
      their shadows, twice, each breaking into shards; rings of scarab spit with a way through; her
      swarm spiralling out both ways; and Mass Incubation, eggs thrown round the arena: dark ones
      hatch an Agile Scarab, the light one goes off in a 3 by 3 and breaks into shards unless
      it's broken first.
    - **Her shield** (2141 round her) breaks at 66% and 33%: dazed (11720) and shielded, she
      doesn't attack while swarms (28, then 24, more with path levels) come round the arena's edge
      clockwise from six holes, one every 4 game ticks, then 3, 2 and 1, sometimes three at once
      from path level 2. Each that reaches her heals her. Her overlords come too: a Spitting Scarab,
      then a Soldier (whose swarm heals her every 5 s) and an Arcane Scarab, which charges and then
      sends a ring of red swarm all round unless it's hit hard enough to fly off and start again.
      It's over once the swarms and overlords are all done.
    - **Dung Strike**: flies round you (2146) for 1.8 s, then she throws you straight back from
      her, stunned for 2 s, with dung left along the way as walls for a while.
    - **Her last**: at 0 she's back with a quarter of her hitpoints as 11721, her swarm gone,
      throwing the whole party back.
    - **Invocations**: Lively Larvae (two more dark eggs), More Overlords, Blowing Mud (two
      thrown back), Medic! (swarms between her shield's breaks too, at half speed), Aerial
      Assault (bigger, harder fireballs).
    - Her phantom's the Wardens' (phase three).
- **The Crondis room** (`CRONDIS` in `content/tombs.ts`, `Sim.stepCrondis`): square 61,82 from local
  x 10, turned half round so it's entered from the east behind its barrier. Grow the Palm of
  Resourcefulness (11700 to 11704, a stage a quarter, never hurt, its bar its growth) with 300 water,
  more for each of the party and each path level: each stage a casket and the next wave.
    - **Water**: stand at a running waterfall (out of the map, drawn running or dry by the client) to
      fill your container, 100, and it's dry for 10 s after. Near the palm you pour it.
    - **Spears**: each corridor's crocodile statues thrust their spears out across a pair of rows at
      a time, down the corridor, the side turning about, then rest; a tell (the spear glinting out
      a tile) first. **Poison** comes down each corridor from its waterfall's end every 9 s (less
      with path levels): pale first, the dark cloud a second behind it. It's the Spitting Scarab's
      green splash (2155), faint for the pale: the room's own spot animations (2129 to 2131) draw
      nothing, and its poison floor tiles' activation can't be baked (a loc bakes with its own
      animation only).
    - A trap's hit, or a crocodile's bite, spills half your water, and a trap weakens you. Crocodiles
      (11705) come in from the palm room's corners; the hungry ones make for the palm and eat its
      growth, never below the stage it's reached.
- **Zebak** (`ZEBAK` in `content/tombs.ts`, `Sim.stepZebak`), the Crondis path's boss: the great
  crocodile (11730) lying in the water north of his island, never moving. His attacks are a pot
  that splits into red orbs, a rock that splinters, and acid sprayed. At 85, 70, 55 and 40% a
  special, turn about, each with acid pools (45570) and jugs spat over the island:
    - **Acid**: 3 by 3 pools that hurt more the longer you stand in one, and poison, until a jug's
      water or a wave clears them.
    - **Jugs** (11736): walk into one and it rolls off the way you pushed it, breaking on a boulder,
      the island's edge or at the end of its roll, its water clearing the acid round it. Weapons
      pass them by (`EnemyDef.unhittable`): hit, they broke the moment they were down.
    - **Great Roar**: boulders across the island, then three roars a few seconds later, each a
      fifth of your hitpoints and a knock back, unless a boulder's between you and him.
    - **Tidal Waves**: two waves across the island (11738), up from the south then down from the
      north, each with a gap to stand in, narrower with path levels; they wash away his acid.
    - **Enrage** below 25%: quicker, with no more specials.
    - **Invocations**: Not Just a Head (blood clouds up the steps after you, wasting as they come,
      healing him if they reach you), Arterial Spray (they heal more), Blood Thinners (three at a
      time), Upset Stomach (wider acid, less water from a jug).
    - His island is a deck a level up in OSRS, behind invisible walls (38848, 2639), and cut with
      the room it was a piece of its own nobody could walk onto: its east edge's walls go and its
      edge is floor (`ZEBAK_EDGE`). A roar or wave that wipes the party doesn't throw it from where
      the room starts over.
- **The Wardens, phase one** (`WARDENS` in `content/tombs.ts`, `Sim.stepWardens`): their room, square
  59,80 on plane 1, turned half round so you come in from the south. Its floor is mostly the hidden
  overlay over the plane under it, which OSRS draws: that plane's floor colours, its pieces on the
  floor, and its tall pieces under the raised border, sunk to it (`LocOverrides`). On the dev server
  the Nexus has a button straight to it with the best of everything (`Sim.devToWardens`).
    - The obelisk (11751, the boss bar) is what's fought, tougher with the path level as a path's
      boss is, and with enough hitpoints that the Wardens get their attacks in. They start 50 of 125
      charged, so the first attack comes about 9 s in.
    - Orbs (11769) leave it each side every 1.2 s, a tile every 0.6 s for 8, down one of three
      troughs in a side's own order, each one there charging its Warden 4 (Ancient Haste 6). A
      player on a side's gap or spawn tile stops that side, for a little damage each orb.
    - The Wardens (11748, 11749, nothing hurts them) charge 2 a tick besides; full at 125, the
      platform under them filling (45606 to 45626, drawn by the game), they discharge (9667, the
      seal 2214/2215) and take turns: pyramids (45750/45751) on every other 3 by 3 cell of the floor,
      Elidinis' the odd ones, hurting whoever's under one as they glow; then a shot (2238/2237)
      that arcs after each player for 8 s and lands for a share of their hitpoints.
    - The obelisk broken, the Warden that's charged the more over the whole phase (what it's spent
      on attacks and what it holds) wakes, Tumeken's on a tie, so the side a player kept blocked
      loses however recently it attacked. The other blows up (2216) and is left a wreck (11759,
      11760).
- **The Wardens, phase two** (`WARDENS.two`, `Sim.stepWardensTwo`): the same room.
    - The Warden wakes (9663) and steps out of its alcove, a boss in two forms (11753/11754
      Elidinis', 11756/11757 Tumeken's), each hurt by one style alone (Elidinis' opens to magic,
      Tumeken's to ranged), its bar its shield filling. Tumeken's walks up to you and slashes;
      Elidinis' keeps her distance. Both throw skulls (2224 red, 2241 plain), a fan of them, and
      stone where you stand (2210, a shadow first) that holds you a moment.
    - Its shield full (3.5% of its hitpoints), it kneels (9670, the exposed form) and throws its core
      out (11770/11771): what the core's hit for comes off the Warden five times over, for 12.6,
      17.4 or 22.2 s by how low it is (OSRS's 21, 29 and 37 ticks). Then it stands (9672) open to
      the other style. About three times down with the best of everything, standing close.
    - The obelisk (11752, charged, can't be hit) opens every 9 s, its ring round it the special's
      colour (2199, 2200, 2198), and takes its specials in turn: the converging beam (two walls of
      glowing tiles closing on it from north and south, then east and west, a tile a tick), the
      windmill (its five patterns, read off the OSRS Wiki's diagram, `WARDENS_WINDMILL`, each
      glowing 1.8 s before it's struck, twelve of them) and lightning skulls (ten thrown at random
      tiles, the 7 by 7 round each struck but its cross). Unlike OSRS's, it keeps on while the core's
      out, and opens sooner: here the core's hit dodging it. The marks are the fight's
      (`WardensFight.marks`), drawn by GameView: there are too many for effects. The OSRS beam's
      own spot animations (2234, 2235) barely show from this camera, so the beam's tiles glow (2236)
      as the kill video shows and the windmill's strikes are the Wardens' red lightning (2197).
    - Its last hitpoint: it collapses (9662) and restores the other.
- **The Wardens, phase three** (`WARDENS.three`, `Sim.stepWardensThree`): the last room (the same
  room cut again, unturned, cell 4,1), the Warden that fell back up north of the floor, which is the
  map's `MapDef.floor` (PR 133's), moved by the fight through `ArenaFloor.start` rather than a
  script. Amascut (11767) watches from behind.
    - Slams: half the floor rises in a wave away from it, east, then west, then both but the middle
      three columns, every 4.2 s (3.6 below half; Overclocked 3, Overclocked 2 2.4, Insanity 1.8).
    - At 80, 60, 40 and 20% (no hit takes it past one), it charges (11763/11764): 4, 5, 6, then 7
      siphons (11772) land over the floor, beamed (2227), each stopped by a player stepping on it
      (reversed, 11773) within 10.8 s (Insanity 4.8). All stopped, it staggers for 5% of its
      hitpoints; any left, the floor erupts out from the middle. The slams start again from east
      (Insanity: where they left off).
    - The second charge brings a path boss's phantom east of it, the third another west: Zebak's
      (fans of his magic or ranged) and Ba-Ba's (a rock on where you stand) with Tumeken's;
      Akkha's (three of his ranged or magic) and Kephri's (a fireball lobbed onto you, wider with
      Aerial Assault) with Elidinis'. They can't be hit, and quicken once it's enraged.
    - At 5% it enrages: heals 20%, Amascut opens her mouth (11768), a row of the floor tears away
      from the back every 10.8 s, and lightning walks the floor, each bolt's shadow (1446) 1.8 s
      before it strikes (2197). Its death ends the raid, and the chest's opened (below).
    - Invocations: Ancient Haste, Acceleration (the Warden attacks and the obelisk opens sooner),
      Penetration (the obelisk's specials hit harder), Overclocked, Overclocked 2 and Insanity.
    - Not in: Divine Projectile (it's about prayer, which the run hasn't got).
- **The way to the Wardens** (`TombsDef.wardensDoor`): the Nexus's north end, as OSRS's is, open
  once every path's done (it says so before); the dev button still skips there with the best kit.
- **The Helpful Spirit** (`TOMBS_SPIRIT`, `TOMBS_SUPPLIES`): after the second path and again the
  fourth, back in the Nexus, each player's turn at its supplies (OSRS's own: Nectar, Silk dressing,
  Ambrosia, Tears of Elidinis, Liquid adrenaline, Smelling salts, a Blessed crystal scarab), bought
  with raid points as the Theatre's supply chest's are. What's spent is whole points earned
  alongside the chest's (`Hero.tombsGross`): spending doesn't lower the chest's chance.
- **Points, the chest and the board** (`TOMBS_POINTS`, `Sim.openTombsChest`, `TombsSummary`):
  each player's points are a puzzle room done (500, everyone in the raid) and each boss's
  hitpoints taken (a path boss 1000, the obelisk 500, the Warden 1000 then 1500), shared by damage
  in co-op so a fair share is the whole, and a death costs a fifth, as OSRS's does. A purple's
  chance is the raid level's (PURPLE_CHANCE's least at 0, its most at 500) times the share of a
  whole raid's points (9000), none under raid level 50, only the fang and Lightbearer under 150.
  Tumeken's guardian (a pet), the Thread and the four jewels are rolls of their own from their
  raid levels, and the invocation board shows each from where it comes. The result screen's board
  is OSRS's raid summary: the raid level and its invocations, each path's time and the Wardens',
  the time limit, and each player's points, deaths and purple chance.
- **What the uniques unlock** (section 8's plan) isn't in yet: they're Collection log trophies,
  kept out of the log while the raid's a dev map.

## 12. The bot, and the Tombs' own sim

The balance bot plays the whole raid (`scripts/game/tombsBot.ts`), and `simulate-run.ts` uses it on
this map. It only moves, reading the sim as it likes, and imports nothing of Node's or the DOM's, so
the dev console can drive the real game with it (`await import("/scripts/game/tombsBot.ts")`, then
`tombsMove(game.sim)` each tick).

- **The Nexus**: each path's door in turn (the open tile nearest a door set in a wall), then the way
  to the Wardens. **A room**: through its barrier, then its puzzle; **a boss**: past its line.
- **Apmeken**: stands at each issue till it's fixed, and fights round the room's middle.
- **Het**: finds the mirrors' turns with the sim's own tracer, walks into each wrong one once
  (round the others, which it'd turn brushing past), and fights by the seal.
- **Scabaras**: the Sequence in order once shown, the fewest Lights out presses, the Addition's
  exact plates, then Matching, every plate reached round the others.
- **Crondis**: water fetched empty-handed (a band only spills what you carry), filled once a band's
  gone over the fall with time to be ahead of the next, and on past a spear by the corridor's other
  half.
- **The bosses**: Ba-Ba's cracked boulder's lane and a rock's cover; Akkha's spared quadrant and
  his dead shadows' quadrants; Kephri near enough; Zebak's island near him, behind a boulder for
  the roar and in a wave's gap; and it sidesteps bullets, boss blasts and swings.
- **The Wardens**: phase one blocking Tumeken's side by the obelisk; phase two by the Warden or
  its core, off the obelisk's marks; phase three at the floor's north end in the column the next
  slam leaves alone, on its siphons, off its lightning.
- **Co-op**: one player works a puzzle two would undo between them (mirrors, plates) and the rest
  fight beside them, clear of it; each carries their own water.

`scripts/game/simulate-tombs.ts` is the raid's own sim: one puzzle room, one boss, the Wardens or
the whole raid (`ROOM`), over seeds, path levels (`LEVEL`), invocations, co-op parties (`PARTY`) and
kits (`KIT=max`, the dev kit). Each puzzle room has its own account, which no other part of the game
has: Apmeken's issues fixed and missed, Het's mirror turns, beam pulses and seal openings,
Scabaras's boards and wrong steps, Crondis's fills, trips, spills and growth; and every run says what
hurt it, by source and by boss attack. Run it with `DEV_MAPS=1`.

Without the max kit, a boss (or a room with paths before it) is reached by playing the raid up to
it from the Nexus (`PATHS=` for the order), so the run has the levels and gear it would really
have; the bot loots as a person does (caskets, the better gear, food when hurt). `INVOCATIONS=level:300`
makes up a raid level as people tend to (the bosses' own first; never Attempts or a time limit).
`scripts/game/sweep-tombs.sh` runs every room, or the raid, by raid level and kit (`zero`, `shop`
for `META=max`, `all` with `ARMOURY=max`, `dev`), a line each.

What it showed (November 2026, full raids, warrior, wizard and ranger, 3 seeds each):

| Raid level   | Nothing bought | Shop   | Shop and Armoury |
| ------------ | -------------- | ------ | ---------------- |
| Entry (0)    | 6 of 9         | 9 of 9 | 9 of 9           |
| Normal (160) | 0 of 9         | 6 of 9 | 4 of 9           |
| Expert (300) | 0 of 9         | 0 of 9 | 1 of 9           |
| 500          | 0 of 9         | 0 of 9 | 0 of 9           |

With nothing bought, all eight adventurers clear most rooms on their own at Entry, and 10 of 24
whole raids. From Expert the bot gets through the paths but not the Wardens (with every Wardens
invocation on): it dodges, it doesn't plan, so Expert and past it are set by the curve and want
playtesting more than the bot's numbers.

**For trying a boss** (the dev server only): the Nexus has God mode and a button to each boss (the
path bosses as the run is, with the dev skip's bow; the Wardens with the best of everything or as
the run is). They're for the dev map, and go before the raid ships.
