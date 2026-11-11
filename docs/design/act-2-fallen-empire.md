# Act II, The Fallen Empire: design

The design for a campaign expansion after the Inferno, written 2026-11-06 on the `act-2-design` branch. Dynny's ask
was "come up with a campaign expansion, new maps, new unlocks. You can think out of the box". The pitch (four Desert
Treasure II maps, each with a rule, then a finale) came back with: "Map and boss ideas are great, item rewards not so
much. Soul reaper axe is cool and can stay but think of different rewards. Do the design". This is that design. It's
design only: no game code. Each map, and each Awakened fight, gets its own pull request and, for the fights, its own
design doc in the shape of `quarry-colossus.md` before it's built. Dynny answered its ten open questions the same
day on the pull request (#155). His answers are folded in, and listed in section 13.

Every id here was looked up in the game's cache (`osrs-241_2026-09-30`) with `scripts/cache/` and
`scripts/scaperune/find-prefabs.ts`. Every number is a first pass from arithmetic and the existing maps, not a
playtest.

## In short

- **The shape.** The act needs the first campaign done: beating the Inferno opens a new screen, the Fallen Empire.
  It has four maps in any order (the Stranglewood, the Lassar Undercity, Ghorrock and the Scar), each a normal
  15-minute run with **one rule that changes how you play**. Each map is harder the more Act II maps you've already
  beaten. Beating one opens its Awakened fight. The act ends when all four Awakened are down.
- **The rules.**
    - **Stranglewood**: roots creep in from the forest's edge, slowing and hurting you. Your hits cut them back, and
      killing a root heart clears a patch. Leave them be and the map shrinks to Vardorvis's clearing.
    - **Lassar Undercity**: the city and its Shadow Realm. Step into a black puddle and the world turns to the real
      cache's Shadow Realm copy of the city: other enemies, double drops, sanity draining. Catch three lost souls to get
      back.
    - **Ghorrock**: a frozen prison yard. A cold meter rises all the time, and braziers, fire elites and fire weapons
      keep it down. Ice pools slide and freezing gas vents puff.
    - **The Scar**: darkness, with a light round you. Weapons only aim at what's lit. Lanterns, light leeches and fires
      are the light. It needs real lighting, which the renderer doesn't have, and that's built first (section 6.8).
- **The finale: four separate Awakened fights, and the Forgotten Four gauntlet** (section 7). Each fight is a boss
  fight like Zachariah's and the Colossus's, opened by beating its map, played as that map's adventurer, and hard.
  Each fight's first win drops its pet. The gauntlet is all four in a row, opened by beating all four.
- **The rewards** (section 8). Out: the Ancient sceptres, the vestige rings and plain stat items.
    - **Soulreaper axe**: melee only. Kills near you give it souls (up to 5), and at 5 it spends 8% of your hitpoints
      on a big spin. Its four pieces come from the four final bosses.
    - **Remixes**: each Act II map's rule on any earlier map (shown off as Overgrown Lumbridge, Shadow Barrows, Frozen
      Wilderness, Dark Karamja). All four can be stacked on one map at once, with records for each combination.
    - **Fighting pets**: Butch, Baron, Wisp and Lil'viathan, one per Awakened fight. Take one into a run and it does a
      small thing.
    - **Five adventurers** with traits rather than stat bumps.
    - Three more that aren't items: **Awakened invasions** on old maps, **Awakener's orbs** that awaken an old final
      boss, and the **weekly Vault**, a seeded run.
    - **Invocations** and **Relics** (section 9), in the first build.
- **The build order**: lighting first, then Stranglewood with the act's screen, invocations and relics, then Lassar,
  Ghorrock and the Scar, one map per pull request. Each map's remix follows it, then the Awakened fights with pets,
  then the gauntlet (section 10).
- **Changed from the pitch** (section 12): there's no blood captor NPC (root hearts instead); Ghorrock's prison is too
  cramped to cut (we build it in ScapeRune); and Lassar is better than pitched (the cache has the Shadow Realm as a
  real twin of the city).

## 1. The shape of the act

**Opening.** The act needs the first campaign completed. Beating the Inferno opens the Fallen Empire screen, a tab beside the map list's Bosses tab. The four
maps are cards round a fifth in the middle. The middle card fills in as the Awakened are beaten and plays the act's
ending at the fourth. Each card shows its boss (drawn as the boss bar draws it), its rule in a line, its records, and
its rewards faded until earned, as map cards do now.

**Any order.** `isMapUnlocked` is a straight chain today (`MAPS[index - 1]` beaten). Act II maps get
`act: { requires: "inferno" }` instead, and the Awakened fights keep `fight.requires` (their own map). Nothing else in
the chain moves.

**How hard: harder the more you've beaten.** An Act II map's toughness is set when a run starts, by how many
**other** Act II maps the player has beaten:

| Other Act II maps beaten | Enemies' hitpoints | Their damage | Coins  |
| ------------------------ | ------------------ | ------------ | ------ |
| 0 (the first you play)   | 4.2                | 2.9          | as now |
| 1                        | 4.35               | 3.0          | +10%   |
| 2                        | 4.5                | 3.1          | +20%   |
| 3 (the last)             | 4.65               | 3.2          | +30%   |

The Inferno is 3.75 and 2.7. The first draft's step 0 (3.9 and 2.8) was a small step up, and the bot won and lasted
longer on it than in the Inferno, so it was raised (2026-11-10): Act II's first map is harder than the first campaign's
last (the numbers are in #159). Damage is the steep one: 3.0 at step 0 put a wall at Kasonde, with most runs ending
there. Hard mode multiplies on top as the Inferno's does
(`{ hp: 1.4, damage: 1.2 }`). Whatever the order, the last map is the hardest, and a map you go back to after
finishing the act is always at step 3, so every player ends up on the same footing.

**Records** are kept per map as now, with the step they were set at. The card's best time is the best at step 3,
the step everyone gets to, and an earlier, easier record shows below it, marked with its step, until it's beaten at
step 3. In co-op the host's step counts (everyone in the room has the map, as now). The Awakened fights don't scale:
each is tuned as one fight. The gauntlet climbs instead (7.3).

**What a map gives.**

| Map               | For beating it                                                                    | For a task on it                                                    |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Stranglewood      | Awakened Vardorvis, the Overgrown remix, the Forester, the Executioner's axe head |                                                                     |
| Lassar Undercity  | Awakened Whisperer, the Shadow remix, the Shadow walker, the Siren's staff        | The Treasure hunter (open 5 caskets in the Shadow Realm in one run) |
| Ghorrock          | Awakened Duke Sucellus, the Frozen remix, the Snow ranger, the Eye of the Duke    |                                                                     |
| The Scar          | Awakened Leviathan, the Dark remix, the Lantern-bearer, the Leviathan's lure      |                                                                     |
| Each Awakened     | Its pet (the first win always), an Awakener's orb                                 |                                                                     |
| All four maps     | The Soulreaper axe (its four pieces), Awakened invasions                          |                                                                     |
| All four Awakened | The act's ending, the Forgotten Four gauntlet, the weekly Vault                   |                                                                     |

The pieces are trophies (`trophies.ts`), shown in a new Collection log tab, the Fallen Empire: Executioner's axe head
28319, Siren's staff 28323, Eye of the Duke 28321, Leviathan's lure 28325.

**Save.** New optional fields only (`remixVictories`, `gauntlet`, `awakenerOrbs`, `invasions`, `relics`, `invocations`), so no
`SAVE_VERSION` bump. The pet stays `SaveData.pet`.

## 2. What carries over

From Phosani's, Zachariah's and the Colossus's records, and from Dynny's word on them:

- **Read it from the world.** Every rule is shown with the cache's own models: roots growing, puddles, braziers
  burning down, a lantern in your hand. No arrows, rugs or painted floor indicators. The red boss warnings stay only
  where the game already uses them.
- **Hitboxes match what's drawn.** A root tile hurts exactly where its roots stand. A gas puff hurts in its cloud, and
  a light ends where it's drawn to end.
- **Lots of impacts.** `ImpactDef`s on everything that lands: dust, rings, shake (off for reduced motion), faint
  flashes.
- **A rule is about the map, not a gimmick on it.** Each one pushes you somewhere: into the roots to cut them, into the
  realm for its drops, to a brazier, into the light.
- **Every rule works on any map from day one** (`MapDef.rule`, a `RunRuleDef` the sim runs each tick), because
  remixes put them on old maps. Nothing in a rule may read Act II map data directly.
- **Co-op.** Shared things (roots, the realm, braziers, lights) are the party's. Meters (sanity, cold) are each
  player's, as hitpoints are. A solo run without a rule plays exactly as before (`runHash.test.ts`).
- **Phones**: 69k triangles at the busiest view. Each map's pull request measures its worst views with
  `frameProbe.sample` on the phone camera, as the Colossus did.

## 3. The Stranglewood (Vardorvis)

### 3.1 The rule: the forest closes in

| What                    | Number                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Where roots start       | From the arena's blocked edges (the wood itself), from 0:30                                |
| How fast they creep     | A root front tile spreads to an open neighbour every 3 s at 0:30, every 1.5 s by 12:00     |
| Left alone              | About a third of the walkable ground by 8:00 and two thirds by 14:00 (to check in the bot) |
| Never                   | Within 10 tiles of the middle of Vardorvis's clearing, where the final fight is            |
| On roots, you           | 25% slower, and 1% of your hitpoints every 0.5 s after half a second on them               |
| On roots, the Strangled | 15% faster: the wood is theirs                                                             |
| Cutting                 | Any hit of yours on an enemy standing on roots clears roots a tile round it                |
| Melee cuts more         | A sweep or slash clears every root tile in its arc                                         |
| Kills                   | A kill on roots clears 1.5 tiles round it                                                  |
| Regrowth                | A cut tile regrows from a rooted neighbour after 15 s                                      |
| Root hearts             | A Large Tendril at a root front, one every 75 s from 2:00, at most 3 at once               |
| A root heart alive      | Roots within 12 tiles of it creep twice as fast                                            |
| A root heart killed     | Clears 7 tiles round it, nothing regrows there for 40 s, and it drops an elite casket      |

The squeeze is the point. A player who keeps moving through a crowd keeps the ground open. One who kites the
same loop finds it closing, and roots don't block, so nobody is ever stranded: it's slow, painful ground, not walls.
The Strangled are faster on it, so a rooted map is a harder map.

### 3.2 How it reads

- Roots are the Stranglewood's own Tendrils (locs 47599 and 47600, the lightest of the models of Vardorvis's tendril
  bursts), in the Large Tendril's reds, drawn by the game as instanced models over the ground, not baked into the map.
  Each rooted cell has a runner laid along the ground from the cell it grew from, so the runners join up into roots
  spreading out of the wood, and some have a loop arching up out of the ground. The wood's own floor tendrils (48495
  to 48502) were tried first: blown up and packed, they read as red glyphs stamped on the floor, so they're off the
  opened ground too, where they'd read as roots that don't hurt.
- A tile about to take root shows the warning for 1.5 s: its runner creeping in towards it from the roots beside it,
  and a tip pushing up through the ground. Then the runner reaches it and the loop heaves up. Nothing is painted.
- A cut snaps a cell's runner in two, the pieces kicked up and sinking back into the ground with a puff of dust. A
  kill's clearing is a ring of the same.
- A root heart is the Large Tendril (NPC 12225, size 3, idle 10363), roots reaching out from it. While it lives, its
  roots pulse.
- On roots your character's legs are wrapped (two Tendrils at the feet, turning) and the walk slows. The hurt is the
  game's usual red hitsplats.

### 3.3 The arena

Cut from the real Stranglewood: map squares 17 to 19 by 52 to 54 (world 1088,3328 to 1279,3519), all in the cache
with their locs. Vardorvis stands at 1128,3417 in `npc-spawns-osrs.json`. `find-prefabs.ts rect=1088,3328,192,192
collision=1 pieces=1` gives 19,238 open tiles, the biggest pieces 6,491 and 4,088: room for waves, about the
Barrows' size. The scenery is the wood's own: Strangled Trees (48349 to 48412, 2 by 2), Strangled Ferns (48539 to
48544), Strangled Tents (48591 to 48765), pillars (48434, 48438), rockslides, mushrooms. The spawn and the clearing's
middle are picked in the pull request from the collision map, with the clearing about 6 tiles north of the start, as
the guide says.

### 3.4 Enemies

| Enemy          | NPC ids                      | Part                                               |
| -------------- | ---------------------------- | -------------------------------------------------- |
| Strangled      | 12268 to 12274 (seven looks) | The crowd: 138 and 149 in OSRS, walk 5566 and 5570 |
| Strangled Boar | 12289                        | Fast chargers, from 2:00                           |
| Strangled Lynx | 12290 (size 2)               | Pouncers that leap the last 3 tiles, from 4:00     |
| Strangled Bear | 12288 (size 3)               | Elite: lays roots behind it as it walks            |
| Large Tendril  | 12225 (size 3, static)       | The root heart (3.1)                               |

### 3.5 Bosses

| When  | Boss                                      | What it does here                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5:00  | Kasonde the Craven (12331)                | Darts in and out with his blade, and plants a root heart where he first lands                                                                                                                                                                                                                                                                                                        |
| 10:00 | A great Strangled Bear (12288 scaled 1.6) | Charges along lines, rooting the whole strip it runs down                                                                                                                                                                                                                                                                                                                            |
| 15:00 | Vardorvis (12224, level 572)              | Rises in the clearing. His axes swing across the ground (the axes drawn sweeping, the strip they cover is the axe's own reach); his dart leaves cracks that burst into vines, as in OSRS; and **any root tile within 8 tiles of you can erupt under him**, so the roots you didn't cut are his weapon. At a third of his hitpoints his head (12226) comes off and gazes, as in OSRS. |

### 3.6 Music

"Strangled" in the wood, and "Blood Rush" from 15:00, Vardorvis's own (the OSRS Wiki's recordings, into
`src/media/music`).

### 3.7 Unlocks

Beating it: the Forester (8.5), the Overgrown remix (8.3), the Awakened Vardorvis fight and the Executioner's axe head.

### 3.8 Engine

| Piece                        | Reuse or new                                                                                                              | Rough size |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| The act's screen and unlocks | New UI tab and `act.requires`                                                                                             | 3-4 days   |
| `RunRuleDef` on `MapDef`     | New: a rule the sim ticks, deterministic, hero-aware                                                                      | 2 days     |
| Root growth                  | New: a grid of root cells beside `ArenaGrid`, grown by the seeded `Rng`                                                   | 2 days     |
| Roots on screen              | Reuse `FloorView`'s instancing and code rise, on any map's ground (not a floor box)                                       | 2-3 days   |
| Cutting                      | New hook where a hit lands, and where a sweep's arc is worked out                                                         | 1 day      |
| Slow and hurt on roots       | Reuse the floor's `slow` and `burn` effects, from the root grid instead of a floor box                                    | 1 day      |
| Enemies, waves, bosses       | Reuse `BossAttackDef` (`swing`, `ground`, `projectile`, `pattern`); the axes and vines are new spot animations to look up | 4-5 days   |
| The bot                      | Teach `simulate-run.ts` to walk off roots and to cut                                                                      | 1 day      |

About three weeks, with the act's frame. This first map carries the frame, so it's the longest.

### 3.9 Phones

The risk is the wood: Strangled Trees and ferns are dense, and roots add to it. A root layer at full cover in a
phone's view is about 23 by 11 tiles at 2 by 2 cells, about 65 cells at about 60 triangles each, so under 4k. Draw
roots as cells of 2 by 2 tiles, never per tile. Measure the cut's worst view before roots go on. If it's over about
55k without them, thin the cut's ferns (soft scenery) before its trees.

As built: a phone's view at 844 by 390 takes in more than that, up to about 200 cells (36 by 26 tiles, the frustum's far
edge is wide), and a cell is a Tendril of 78 or 110 triangles with a loop of 78 on some near the player, so a view all
rooted is 6k to 20k. So the cut is thinned until each busy view is under 69k with every open cell in it rooted (the
worst it can be): its world at most about 59k. The heaviest pieces were the ruined town's stepped tents' walls (500 to
1,600 triangles each), its pillars and walls, and trees. `view-weight.ts` counts locs alone and comes out under the game's
own count where walls are heavy, so measure with `frameProbe.sample` in the game.

The town was then dressed again (2026-11-10): its huts' low walls and its tents' lower pieces are put back as the
cheap low wall (48620, 194 triangles), half the huts' and a third of the tents', paid for by the town's pillars (all
but Vardorvis's), its bushes and two thirds of its ferns. Its black squares were cellar entries (48722, 48723, 48745, 48746) and black floor tiles (overlay 36) left under the thinned pieces: the entries are left out and each such tile
takes its neighbour's floor. Measured in the game, every open cell rooted, the heaviest view is the ruins' at 66.6k,
and the town's are 58k to 64k.

## 4. The Lassar Undercity (the Whisperer)

### 4.1 Found in the cache: the Shadow Realm is a real twin

The pitch said "same map, skins and palette swap". The cache does better. The Lassar Undercity is map squares 40 to
43 by 98 to 100, and squares 36 to 39 by 98 to 100 are **its Shadow Realm, tile for tile**:

- the same tile counts and heights in every square;
- the underlay 45 becomes 104, and the overlays 285, 286 and 298 become 288, 289 and 290;
- the same locs at the same tiles, as their shadow ids (the Lamp 48189 becomes 47945, the Sunken Steeple 48311
  becomes 48327);
- the same collision (`find-prefabs.ts` finds the same pieces, 256 tiles to the west).

The Whisperer stands in both: 12204 at 2655,6369 in the city, 12206 at 2399,6369 in the realm. So the flip can show
the real Shadow Realm, and it costs nothing to the sim. The collision is the same, so the sim never knows which one
is drawn.

### 4.2 The rule: the city and the realm

| What            | Number                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| In the city     | Sanity refills 10 a second; normal waves                                                                                          |
| A black puddle  | Opens every 60 s from 1:30, 8 to 12 tiles from you, for 15 s (blinking its last 3)                                                |
| Into the realm  | Walk into it. Also forced by the Shadow Keeper (5:00) and the Whisperer                                                           |
| In the realm    | Sanity starts at 100 and drains 4 a second (25 s); a shadow's hit takes 5 more                                                    |
| Its drops       | Bones and coins double, a casket half as likely again                                                                             |
| The way back    | Catch 3 lost souls (walk into them; they flee at 80% of your speed); the third opens an Anima Portal (48218) at your feet for 5 s |
| Sanity 0        | You're thrown back with 25% of your hitpoints gone, and what's lying on the realm's ground is lost                                |
| The other world | Stands still while you're away: the city's crowd waits, frozen in time, until you come back                                       |
| Co-op           | The party goes together: the first into a puddle pulls everyone in after 1.5 s (decided: the whole party)                         |

The choice is how greedy to be. A dive is 25 s of double drops if you catch your souls quickly, and a hit and a lost
haul if you don't. The city waiting for you means a dive is also a breather from a crowd that's got too big.

### 4.3 How it reads

- **The flip**: a dark ripple out from the puddle (a spot animation to look up). The scene's brightness drops to 0.6
  with a cold violet wash (`setBrightness`, `setWash`, as the Theatre's halls), and the terrain drawn changes to the
  twin squares. "The Fallen Empire" fades into "Lassar Silence".
- **Puddles** are a dark pool on the ground with its own idle. Black is fine here: it's a hole into somewhere, and it's
  the only black thing in the city.
- **Sanity** is a bar under your hitpoints, and below 30 the screen's edges darken (the boss fights' `vignette`) and
  whisper.
- **Lost souls** are the Lost Soul NPC (12212, walk 5539), pale and glowing, fleeing you. A catch is a soft flash and
  a chime.

### 4.4 The arena

Squares 40 to 42 by 98 to 100 (world 2560,6272 to 2751,6463), with the twin 36 to 38 by 98 to 100. Open ground:
13,362 tiles in the city's three squares, the biggest pieces 5,938 and 5,358, so the sunken streets are wide enough.
Braziers (47961) and lamps (48189) line its squares, and the Sunken Steeple (48311, 9 by 9) is the cathedral to the
south, the Whisperer's. The middle square (41,99) holds the cathedral, so the final fight happens in its forecourt.

### 4.5 Enemies

| Enemy            | NPC ids                                   | Where | Part                                                                                |
| ---------------- | ----------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| Crawling hands   | Model of 12249 (Lassar's own), stats ours | City  | The crowd                                                                           |
| Ghost            | 12254                                     | City  | Through walls, as ghosts go here                                                    |
| Wighted leech    | 12335                                     | City  | Latches on and drains                                                               |
| Ancient Guardian | 12336 (size 3)                            | City  | Elite                                                                               |
| Shadow           | 4004                                      | Realm | The realm's crowd                                                                   |
| Lost Soul        | 12212                                     | Realm | Not an enemy: the way back (4.2)                                                    |
| Shadow Keeper    | 12248 (size 2)                            | Realm | Elite                                                                               |
| Tentacle         | 12208 (static)                            | Realm | Rises where the realm's crowd is thickest and lashes in an X, as the Whisperer's do |

### 4.6 Bosses

| When  | Boss                              | What it does here                                                                                                                                                                                                  |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5:00  | Shadow Keeper (12248, scaled 1.6) | Drags you into the realm with it, and stays there: kill it in its world                                                                                                                                            |
| 10:00 | The Forsaken Assassin (12328)     | Fades between worlds: his strikes come from the other world's side, a shadow on the ground first                                                                                                                   |
| 15:00 | The Whisperer (12206, level 587)  | Three-shot volleys and her X of tentacles, as in OSRS. At 80%, 55% and 30% she pulls everyone into the realm for **Soul Siphon**: lost souls stream to her, and each that reaches her heals her. Catch them first. |

### 4.7 Music

"The Fallen Empire" in the city, "Lassar Silence" in the realm, "Song of the Silent Choir" from 15:00.

### 4.8 Unlocks

Beating it: the Shadow walker, the Shadow remix, the Awakened Whisperer and the Siren's staff. The task (open 5 caskets
in the realm in one run) brings the Treasure hunter.

### 4.9 Engine

| Piece                      | Reuse or new                                                                                                                                           | Rough size |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Twin terrain               | New: `MapDef.twin: { dx: -256 }`. The client loads both sets of squares and draws one, shifting the scene's origin; the sim's coordinates never change | 3-4 days   |
| A world that waits         | New: enemies, drops and pickups carry a layer; the sim ticks only the party's layer                                                                    | 2-3 days   |
| Sanity                     | New per-hero meter and HUD bar; reuse the `vignette`                                                                                                   | 1 day      |
| Puddles, souls, portal     | Reuse the random event's spawn (7 to 11 tiles, beam, minimap dot) and power-up pickups                                                                 | 2 days     |
| Brightness and wash        | Reuse the Theatre halls' `setBrightness` and `setWash`                                                                                                 | done       |
| Bosses                     | Reuse `BossAttackDef`; Soul Siphon is `summon` with a heal-on-arrival                                                                                  | 4-5 days   |
| The Treasure hunter's task | New `UnlockTask` kind: caskets opened in the realm in one run                                                                                          | half a day |

About two and a half weeks. The risk is the twin: loading two sets of three by three squares doubles the scene's
bake time and memory at the start (not its triangles). If that's too slow on a phone, the fallback is the palette
alone (brightness, wash and enemies), which is what the Shadow remix uses on older maps anyway.

### 4.10 Phones

The city is heavy: 3,000 to 3,600 locs in each of its middle squares (40,99 and 41,100). Only one world is drawn at a
time, so the twin costs memory, not triangles. Measure the busiest street and the cathedral's forecourt first. If they're
over budget, the realm's tentacles are the first thing to cut (each is a few hundred triangles).

### 4.11 As built (2026-11-10)

Built in #159 as build order step 6. Where it differs from the above, and why:

- **The arena** is a ScapeRune cut (`scaperune/maps/lassarUndercity.ts`) of squares 40 to 42 by 98 to 100, with 43 east
  of it for the margin, set down at squares 62 to 66 by 104 to 108; the realm is the same cut of 36 to 39, set down six
  squares west of it (`MapRecipe.twin`, `MapDef.twin`). The city's one-tile clutter (crates, barrels, rubble, stalls'
  shelves) and doors come off, but its lamps and braziers: in OSRS they cut its streets into pockets that don't join, and
  without them it's one piece of 21,900 open tiles. Ground a rise south of it hides from the camera (its steps down to
  the water) is blocked. The realm's locs come off wherever their city twins do, so both are drawn alike.
- **The twin on screen**: the renderer keeps both sets of squares loaded and, while the party's in the realm, draws each
  city square's twin in its place (`MapManager.twin`, `WebGLMapSquare.drawAt`). The swap is instant, with the realm's
  brightness (0.75 of the city's: 0.6 hid its Shadows) and violet wash. Memory: both sets are loaded, about twice a one-world map's geometry.
- **The start** is the forecourt at the top of the causeway to the cathedral's island, and the Whisperer rises on the
  island (her arena in OSRS); the island's floor is the cache's near-black navy, so the map's drawn at brightness 1.6.
- **The way back**: the third soul opens the Anima Portal where it was caught, and it takes a second's standing in it to
  go through (one at your feet would otherwise take you back the moment the last soul's caught, leaving no choice). If
  it closes unused, three more souls come.
- **The waiting world**: both worlds wait, the realm as well as the city (its crowd and drops are kept for your next
  dive), but its lost souls, which come new each time. While the party's in the realm the city's elites and rings wait
  too; its bosses don't. On a lapse the realm's ground is cleared.
- **Co-op**: the first player whose sanity runs out takes the whole party back (the party's always in one world).
- **The Tentacle** in the realm is a riser (`RealmRuleDef.risers`): one comes up 3 to 6 tiles from the party every 8
  seconds there, two at most, and lashes out at whoever comes within 5 tiles (a shot, not the X). The Whisperer's
  tentacles are a cross round you (the ground attacks' `cross`), not an X.
- **The realm's elites**: from 4:00 each dive brings a Shadow Keeper in as an elite (`RealmRuleDef.elite`), so the
  Treasure hunter's five caskets in one run can be done; by the bot's sweeps it's at most one a run without it.
- **The Forsaken Assassin** goes between the worlds with the party (`EnemyDef.realm` both), and his dart lands out of
  nowhere with a mark on the ground first.
- **Soul Siphon**: at 80%, 55% and 30% she pulls everyone into the realm, and six souls come to her from 12 tiles out,
  each healing her 2.5% as it reaches her (`EnemyHealsDef.once`); catching them counts towards the way back.
- **Sanity's whisper** below 30 isn't in: the edges close in, without a sound.
- **The bot** (`simulate-run.ts`) walks into a puddle near it while it's over 60% hitpoints (`REALM=0` never), chases
  lost souls in the realm and takes the portal home.
- **Music**: The Fallen Empire in the city, Lassar Silence (the area's near-silent track) in the realm, Song of the
  Silent Choir from 15:00.
- **The Shadow walker**: her step lasts 1.5 seconds, out 3 tiles on the way she faces; enemies don't lose her beyond
  that. **The Treasure hunter**: a casket buries itself after 3 seconds on the ground.
- **Sims** (`META=max ARMOURY=max`, 8 adventurers by 3 seeds, the bot diving): at step 0, 1 win of 24 with a median end of
  10:05 and 12 deaths before 10:00, against the Stranglewood's 1, 6:31 and 14 (its Kasonde wall at 5:00; Lassar's
  deaths spread from 5:09 to 17:00, the Forsaken Assassin at 10:00 the most); at step 1, 0 wins, 7:46 and 14 against 2,
  7:11 and 14. The bot went in 4 times a run (median), was thrown back twice, and spent about an eighth of the run there.
- **Phones**: thinned for the busiest views (the ruined houses' walls to a fifth and less, lamps to a quarter, furniture
  to a third), measured with `frameProbe` at 844 by 390 on the phone camera: the heaviest view is 64k in the city and
  66.4k in the realm, souls in view.

## 5. Ghorrock (Duke Sucellus)

### 5.1 Found in the cache: the prison is too cramped

Ghorrock Prison is in the cache (squares 45 to 47 by 99 to 100, mostly on level 2), but it's cells and corridors. The
biggest open piece on its main level is 2,985 tiles of corridor, and the Duke's own room (47,100) is 568 tiles. A
crowd can't be fought there. So Ghorrock is a **ScapeRune map**: the frozen yard outside the prison, built by hand on
the `snow` biome, with the prison's own kit on it. The Duke's room in the cache is the right size for his Awakened fight
(section 7).

### 5.2 The rule: the cold

| What            | Number                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Cold            | A meter per player, 0 to 100                                                                                                  |
| It rises        | 2 a second anywhere not warm (50 s to full); 5 a second on ice or in frost gas                                                |
| 50 and over     | 15% slower                                                                                                                    |
| 80 and over     | 30% slower, and weapons 15% slower                                                                                            |
| 100             | Frozen solid in an Ice Block (49144) for 1.5 s, 10% of your hitpoints, and the cold drops back to 70                          |
| Braziers        | Six round the yard. Within 3.5 tiles of a lit one, the cold falls 15 a second                                                 |
| A brazier burns | 40 s, its flame shrinking for the last 10, then it's out                                                                      |
| Relighting      | Stand beside it for 1.5 s, or kill a fire elite within 6 tiles                                                                |
| Fire elites     | Leave embers 3 by 3 for 12 s: the cold falls 20 a second within 2 tiles, but standing on them burns (half the floor's `burn`) |
| Fire weapons    | Every hit by a fire weapon takes 0.4 off: Fire spells, Flames of Zamorak, the Tome of fire's, Toktz-mej-tal, Burning claws    |
| Gas vents       | Eight, each a 3 by 3 puff of freezing gas every 7 s, out of step; 2% of your hitpoints a tick inside                          |
| Ice             | Frozen pools, about 15% of the yard: the floor's `ice` (grip 6% a tick)                                                       |

The map pulls you round its braziers. A fire build plays it differently from everyone else, and that's on purpose.

### 5.3 How it reads

- **Cold** shows on you: your character tints blue from 50 (the guard-down tint's code), breath puffs from 80, and
  at 100 the Ice Block closes round you. A small meter sits beside your hitpoints, frost creeping in from its edge.
- **Braziers** are the cache's (48122 unlit, 48901 lit with its animation 6853; which reads better is a look in the
  game), drawn by the game rather than baked, as Zachariah's statues are, so they can go out and be lit. Their flame is
  the light; a guttering one shrinks.
- **Vents** hiss and frost over for a second before they puff (the Gas jet 49762 and Gas 49761, animations 10431 and
  10432, to check). The cloud is the hitbox.
- **Ice** is the floor's ice skin, glassy, on the yard's frozen pools: you see where it is.

### 5.4 The arena

A hand-made recipe on squares of its own (free ones, checked against `devMaps.ts`), 3 by 3 squares of arena. It's a
walled prison yard under a cliff wall north ("cliff wall north" in `map-depth.md`), with the prison's front in it. Its
pieces come from the cache's Ghorrock: Cell doors (39402), Gates (49118), Cages (46634, 49452), Iron maidens (48959),
Racks (48947), Flags (48950), Damaged Tables and Smashed Chairs (46675, 49087), Skeletons (6297 to 6299), and the
mushrooms from the Duke's room (Arder 47534, Musca 47532), with snow dressing between. The frozen pools are where the
ice is.

**Ice off a floor box.** The floor system's `ice` only works inside a floor's box, and a whole 192 by 192 yard of floor
tiles would cost a phone dearly. So this map needs the **effect mask** (section 11): a per-tile effect on any map's
grid, painted from the recipe. The ice is drawn by the map's own ice overlay, not floor tiles. The Frozen remix needs
the same.

### 5.5 Enemies

| Enemy            | NPC ids               | Part                          |
| ---------------- | --------------------- | ----------------------------- |
| Ice warrior      | 13802 (the new model) | The crowd                     |
| Ice spider       | 13798                 | Fast, in packs                |
| Ice giant        | 13796, 13797 (size 2) | Slow, heavy                   |
| Icefiend         | 3140 (in the game)    | Chills: a hit adds 5 cold     |
| Ice wolf         | 645 (size 2)          | Runs on ice without sliding   |
| Pyrefiend        | 433                   | Fire elite (5.2)              |
| Flaming pyrelord | 12453 (size 3)        | The big fire elite, from 8:00 |

### 5.6 Bosses

| When  | Boss                             | What it does here                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5:00  | Ketla the Unworthy (12329)       | Snuffs braziers as she passes                                                                                                                                                                                                                                                                   |
| 10:00 | Jhallan (12353)                  | Hunts you, as he hunts the player through Ghorrock in OSRS: slow, relentless, never giving up, and his shadow clones come in at half his hitpoints                                                                                                                                              |
| 15:00 | Duke Sucellus (12195, level 538) | Wakes in the prison's mouth, size 7 and never moving (walk -1), as in OSRS. Icicles and a slam up close, a spit of energy from range, gas spat at the vent nearest you, and every fifth attack **his freezing gaze**: hide behind a pillar or freeze solid. Every brazier goes out as he wakes. |

The gaze is Zachariah's in shape (hide in a shadow), but here it's the Duke's own attack in OSRS, and the cover is
pillars standing in the yard, not shadows painted on the floor.

### 5.7 Music

"Prison Break" in the yard, "Eye See You" from 15:00.

### 5.8 Unlocks

Beating it: the Snow ranger, the Frozen remix, the Awakened Duke and the Eye of the Duke.

### 5.9 Engine

| Piece           | Reuse or new                                                                          | Rough size  |
| --------------- | ------------------------------------------------------------------------------------- | ----------- |
| The map         | New ScapeRune recipe, by hand, with check rounds                                      | 1-1.5 weeks |
| The effect mask | New: tile effects on any map's grid (section 11); reuse `PlayerMovement`'s ice        | 2-3 days    |
| Cold            | New per-hero meter, HUD, tint                                                         | 1-2 days    |
| Braziers        | Reuse the fight view's drawn statues (lit or out), with warmth as a sim zone          | 2 days      |
| Vents           | Reuse ground patterns (`features`) on a cycle                                         | 1 day       |
| Bosses          | Reuse `BossAttackDef`; the gaze reuses Zachariah's line-of-sight test against pillars | 4-5 days    |

About three weeks: the map is the long part.

### 5.10 Phones

A hand-made map can be built to budget: `view-weight.ts PHONE=1` checks it as it's made. Braziers are the cost to
watch, with a fire spot animation each.

### 5.11 As built (2026-11-10)

Built in #159 as build order step 9. Where it differs from the above, and why:

- **The yard** is a hand-made recipe (`scaperune/maps/ghorrock.ts`) on squares 62 to 66 by 112 to 116, three by three of
  arena with a square of margin round it: snow (underlays 58 and 216) at brightness 1.3 under a cold wash, so it's white
  rather than the grey the game's lighting makes of it. North is the cliff the prison's cut into, in faces of 64 over two
  tiles with two-tile ledges up to 160 (`map-depth.md`'s cliff wall north), the yard ending at its foot. In it, behind
  the Duke, the prison's Heavy Door (49093) between two of its pillars (46628), with its flags (48950), cages (46634,
  49452), iron maidens (48959) and racks (48947) along the foot. Across the yard: tables and smashed chairs (46675,
  49087), skeletons, snow rocks (19686), ice-covered boulders (5039), snowy trees (1330 to 1332) and the snow's ice mounds
  (60404, 60405). A fence (4246) on its other three sides, and a snowy wood past it.
- **The ice**: ten frozen pools, about 13.5% of the yard, painted with overlay 151, a blue-grey (no overlay has the
  floors' glassy ice texture, 53). The sim's ice is the **effect mask** (`core/world/EffectMask.ts`, one byte a tile over
  any map's arena) painted from the same ellipses (`ColdRuleDef.ice`); the drawn ice's edges are smoothed, so the two
  can differ by a tile at the rim. Enemies never slide (the ice wolves don't need anything of their own).
- **Braziers**: the prison's own don't read: its unlit one (48122) is a dark block from above and its lit one (48901)
  burns violet, not warm. Drawn instead is an iron brazier (46614) at 1.8 times its size with a fire (25155) in its bowl
  while it's lit, its flames dying down over their last 10 seconds. Each is a stand-in blocking its 2 by 2. Standing by
  one relights it while it's guttering too, so it can be tended. Two of the six stand in the Duke's square.
- **Vents**: their jets are the cache's Steam Vent (15214) in the map; the Gas jet (49762) and the Gas (49761) are near
  invisible on snow. As a vent frosts over the Gas shows; its puff is the Duke's own gas (spot animation 2431) over the 3
  by 3. The gas hurts 2% every 0.6 seconds (the table's "a tick" read as a game tick), and the cold rises 5 a second in it.
- **Embers** are five small fires (5249) over their 3 by 3. They burn 2% every half second.
- **How the cold shows**: a bar under hitpoints (frosting at 80), your character pale from 50 and the frozen blue from
  80, and the Ice Block (49144) round you while you're frozen. The breath puffs from 80 aren't in.
- **Fire weapons**: Fire spells, Flames of Zamorak, Burning claws and Toktz-mej-tal. The Tome of fire is a passive
  (weapons recharge faster), not a weapon; Burning claws is its evolution.
- **Ketla** snuffs braziers within 3 tiles of her as she goes (`EnemyDef.plants`, what roots a Strangled Bear's trail on
  the Stranglewood), and calls icefiends. **Jhallan**'s shadows are three of his unattackable twin (12355) at half his
  hitpoints.
- **Duke Sucellus** is drawn at 0.55 of his size (his arms span his whole room in OSRS) and never moves. He wakes at the
  north edge of a 32-tile square in front of the prison, with seven of the prison's statues (49090) in it for cover, none
  more than 9 tiles from anywhere in it. His slam, icicles (a ring of five and one under you, spot animation 2434), his
  spit (three of the King Black Dragon's ice breaths, 396; his own spot animations nearby don't fly), gas spat at you
  whose landing sets the nearest vent puffing (`BossAttackDef.rule.vent`), and the **freezing gaze**: Zachariah's
  (`cover`), 12 damage and a 2-second freeze. It's every fifth attack or so, not counted: its cooldown is about five
  attacks and it's the heaviest pick. His animations (10176 to 10180) are picked by length: they're skeletal, and
  `classify-npc-seqs.ts` can't tell them apart.
- **The bot** (`simulate-run.ts`) goes to the nearest lit brazier (an out one counts 10 tiles further, as it has to be
  relit) once its cold reaches 45 (before it slows) and stays until 15, steps out of a vent's gas and off embers. `COLD=0` never warms.
- **Sims** (`META=max ARMOURY=max`, 8 adventurers by 3 seeds, the bot warming itself): at step 0, 1 win of 24 with a
  median end of 8:14 and 15 deaths before 10:00, against the Stranglewood's 1, 6:31 and 14 and Lassar's 1, 10:05 and 12;
  at step 1, 0 wins, 8:28 and 14, against 2, 7:11 and 14 and 0, 7:46 and 14. The bot was frozen once a run (median) and
  spent about a third of the run at 50 cold or more. The first pass was harder (6:14 and 21 before 10:00): Ketla's
  frost came three at a time every 3 seconds, and the ice giants (44 hitpoints, 4 damage) walled the crowd from 6:00;
  she now throws two every 4 seconds and calls three icefiends, and the giants are 40 and 3, one fewer at 6:00.
- **Phones** (`frameProbe` at 844 by 390 on the phone camera): the yard's world is light, at most 12.5k in front of
  the Duke's statues, 33k with its crowd; the heaviest view is the Duke's fight at 49k, 39k of it actors.

## 6. The Scar (the Leviathan)

### 6.1 The rule: the dark

| What            | Number                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Your light      | 5 tiles round each player                                                                                            |
| Outside it      | Drawn at about 12% brightness: shapes, not detail                                                                    |
| Warnings        | Always drawn in full, light or not: a boss's warnings, power-up beams, caskets' beams                                |
| Aiming          | Weapons only pick targets inside a light (half a tile of grace); shots carry on into the dark and hit what they meet |
| Lantern         | A power-up (icon the Abyssal lantern, 26822): +4 to your light for 30 s, shrinking back over the last 5              |
| Light leech     | 12367: wanders with its own light (2.5); killed, its light stays where it died for 20 s (4 tiles)                    |
| Fires           | The Scar's fires (loc 49342, animation 475): fixed lights of 3 tiles                                                 |
| Abyssal leeches | A hit takes a tile off your light for 8 s, stacking to 3                                                             |

Weapons only aiming at what's lit is what makes the dark more than a look. A player has to bring the light to the
crowd (lanterns, leeches' deaths) or fight in close, and piercing weapons are worth more.

### 6.2 How it reads

- A soft-edged circle of light round you, warm, as a lantern's. The lantern itself is in your hand (the Abyssal
  lantern's model in the shield slot) while the power-up lasts.
- Enemies in the dark are dark shapes. Their eyes don't glow, since nothing in the cache does that, so their warnings
  carry it.
- An enemy out of your light that's coming at you shows as the edge-of-screen arrow does now for bosses, faint.
- The minimap shows only what's lit. The dark is part of the map.

### 6.3 The arena

The Scar is squares 31 to 34 by 98 to 100 in the cache, but only 31,99, 31,100, 32,99, 32,100 and 34,100 are
dressed. The others have the same floor counts square after square (1,869 underlay, 2,048 overlay tiles), which is
filler. So the arena is 2 by 2 squares, 31 to 32 by 99 to 100 (world 1984,6336 to 2111,6463), the late maps' size. It's
all one open piece (`find-prefabs.ts`: 11,264 tiles over the wider rectangle), dressed with Broken Boats (49244 to
49246), Brain matter (49354 to 49356), Nerves (49357 to 49366), Broken Pillars (49239, 49240), Vents (49388), an
Abyssal Rift (49204) and fires. The Leviathan's pool is in square 32,99 (2070 to 2092, 6362 to 6383). Whether the
filler draws a floor (`hiddenFloor.ts`) and how the flesh floor looks from the play camera are the first look in the
game.

### 6.4 Enemies

| Enemy                 | NPC ids                      | Part                          |
| --------------------- | ---------------------------- | ----------------------------- |
| Scarred imp           | 12377                        | The crowd                     |
| Abyssal leech         | 12366                        | Dims your light (6.1)         |
| Abyssal walker        | 12392                        | Slow, tough                   |
| Abyssal antibody      | 12372                        | Swarms from the walls late on |
| Scarred lesser demon  | 12360, 12362, 12364 (size 2) | The main threat               |
| Scarred hellhound     | 12374 (size 2)               | Fast                          |
| Scarred greater demon | 12373 (size 3)               | Elite                         |
| Light leech           | 12367                        | The light (6.1)               |

### 6.5 Bosses

| When  | Boss                             | What it does here                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5:00  | Scarred black demon (12386)      | Snuffs your light to 2 tiles for 6 s with a roar                                                                                                                                                                                                                                                                                                                                                                  |
| 10:00 | Persten the Deceitful (12333)    | Lights false lanterns that burst when picked up                                                                                                                                                                                                                                                                                                                                                                   |
| 15:00 | The Leviathan (12215, level 593) | Rises in its pool, size 7, never leaving it. Volleys of orbs by style (blue, green, orange), and after each a roar and debris falling round you, which blocks shots and stays as cover. In its last third, only the Abyssal pathfinder's circle (12220) is lit: 4 tiles, going round the pool a tile a second. Inside it you hit harder; outside it its shots hurt twice as much. That's the OSRS fight's enrage. |

### 6.6 Music

"Scar Tissue", and "Colossus of the Deep" from 15:00.

### 6.7 Unlocks

Beating it: the Lantern-bearer, the Dark remix, the Awakened Leviathan and the Leviathan's lure.

### 6.8 What it would take, honestly

The game has no lights. The world is lit by slope (a fixed south-west light), `brightness` is one number for the whole
scene, and fog is by distance from the camera. A light round the player needs:

| Piece                      | What                                                                                                                                                                                      | Rough size |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Lights in the shaders      | A uniform array of up to 8 lights (place, radius, warmth), darkening by distance per fragment, in the map's, NPCs', actors' and floor's shaders (`main`, `npc`, `actor`, and the floor's) | 4-5 days   |
| Lights in the sim          | Each player's light, lanterns, leeches, fires, as positions and radii, deterministic                                                                                                      | 1 day      |
| Aiming in the light        | One filter in target picking (nearest, toughest, the blowpipe's own), and the bot's                                                                                                       | 2 days     |
| Warnings over the dark     | Boss telegraphs, beams and hitsplats drawn unlit                                                                                                                                          | 1 day      |
| The minimap and the arrows | Only lit enemies on the minimap; faint arrows for what's coming                                                                                                                           | 1 day      |
| Phones                     | Per-fragment work over 8 lights is cheap, but it's on every pixel: measure on a real phone                                                                                                | 1-2 days   |

About two weeks, and it's built first (decided), as its own pull request on a dev map, before the Stranglewood. Its
first step is a day's spike, using the fog the shaders already have (`fogFactorLinear` with a near end and a black
sky), to see how a dark map reads from the play camera and to settle the light's falloff and how dark the dark is.
Then the real lights. With the lighting in, the Scar itself is a normal map's work: its enemies, bosses, lanterns,
light leeches and fires.

A plus: what's in the dark needn't be drawn in detail. Culling the scene past the lights' reach could make the Scar
one of the cheapest maps on a phone.

### 6.9 As built (2026-11-10)

Built in #159 as build order step 12. Where it differs from the above, and why:

- **The arena isn't open.** The Scar in the cache is a sea of abyssal sludge (overlay 302, a grey-green that hides
  what's under it) with islands of flesh in it, and the sea is blocked: of the 2 by 2 squares only about a thousand
  tiles are walked, in pieces. The 11,264 tiles above counted the floor, not what's walkable. So the map
  (`scaperune/maps/scar.ts`) cuts squares 31 to 32 by 99 to 100 whole and sets them down at squares 62 to 65 by 120 to
  123 with a square of margin, then drains the sea to the flesh under it and lays the Scar's own floor cracks over
  it (49247 to 49282, as its islands have; 49376 to 49385 are the sludge's ripples, and come off what's drained). The
  sludge comes back as a band along the arena's edge running out into the margin's sea and six pools, blocked, and
  the Leviathan's pool. The shore runs on over the islets' own floor, so they stand in it as in the cache, and the
  sludge lies level, a little under the floor (each body at the lowest of its shore, less 6), with the darker of the
  cache's two fleshes for two tiles round it. The islands stay as they are: the brain west and north (a wall, about
  two fifths of the arena), the Abyssal Rift's island north-west with its nerves and fires. Over the drained floor
  the Scar's kit is scattered: nerves, nerve formations, brain matter, broken boats, broken pillars and vents. About
  7,800 tiles are open.
- **The Leviathan's island** is a ring of the brain's rim round his pool, its top a walkway on a level of its own: it
  comes off whole (every piece of the rim joined to his pool), so his pool's fought from open ground (the rim's north
  half kept behind him was 80k triangles in a phone's view). His pool is sludge, radius 4, and not blocked: he
  stands in it, solid.
- **The dark** is the lighting (`content/scar.ts`, `SCAR_LIGHTING`): ambient 0.3 a little blue (0.19, the dev map's,
  left the flesh black outside the lights), a light of 5 round
  each player, nine fires (49342, the Scar's own) as lights of 3 that weapons aim by, lanterns at weight 6 among the
  power-ups and two lying by the start. It isn't a `RunRuleDef`: everything it needs is in the lighting and the
  enemies, so the Dark remix (step 13) can put it on any map as lighting.
- **Abyssal leeches**: their hit is a `dim` (`PlayerEffectDef`), a tile off your light for 8 seconds, stacking to 3,
  shown with the debuffs. A light never goes below 1.5 tiles.
- **Light leeches** wander off from you (`EnemyDef.flees`, 4 tiles) with a pale green light of 2.5; killed, a light
  of 4 stays where they fell for 20 seconds. One in six of the first minute's crowd is one, one in forty or so later,
  and three come as elites.
- **The Scarred black demon**'s roar is a swing 10 tiles round it with a `dim` to 2 tiles for 6 seconds, every 12
  seconds or so; a lantern doesn't help through it.
- **Persten the Deceitful** lights three false lanterns 5 tiles round you every 14 seconds or so: the Abyssal
  lantern's model, lit, but with no beam (a real one's a power-up, which has one). Walked into, one bursts for 6
  in 2 tiles; left, it's gone after 20 seconds. They're enemies (`EnemyDef.caught` with `explodes`).
- **The Leviathan** is drawn at 0.8 of his size and never moves. Three volleys, ranged, magic and melee orbs
  (spot animations 2487 to 2489, beside his model in the cache), and after each a roar and four pieces of debris
  falling round you (`BossAttackDef.debris`: a Broken Pillar, 49343, standing 14 seconds, ten at most). His orbs
  break on debris. Debris doesn't block walking. Up close, his tail. He glows the abyss's teal (a light of 5 on him),
  so he's seen and can be aimed at from round his pool, and the camera leans to keep him in view (`BossLookDef.lean`).
- **His enrage**: at a third of his hitpoints the Abyssal pathfinder (12220) comes, going round him 7 tiles out a tile
  a second (`EnemyDef.circles`), with a light of 4, and while it's up it's the only light (`EnemyDef.onlyLight`):
  players' lights, the fires and what's left go dark. Hits from inside its light do 1.5 times, his hits on anyone
  out of it twice.
- **What a player sees**: enemies in the dark are drawn dark, the minimap only shows what's lit, and faint arrows
  show what's coming out of the dark (the lighting step's).
- **The Lantern-bearer**: Fire Strike (the wizard's Fire spells), the Ancient d'hide coif and body and the Abyssal
  lantern in her hand. Lantern: enemies within 3 tiles take 20% more from all her hits and are 10% slower; her light
  on a map with players' lights is twice the size (10 tiles on the Scar).
- **The bot** (`simulate-run.ts`): keeps clear of false lanterns, goes after a light leech when nothing near's lit
  (or it's dimmed), to the nearest fire or left light while it's dimmed, and stays in the pathfinder's circle;
  `DARK=0` none of it.
- **Music**: Scar Tissue, and Colossus of the Deep from 15:00.
- **Numbers after the sims**: the crowd's lesser demons 30 hitpoints and 4 damage, hellhounds 26 and 4, walkers 44
  and 3; a ring of 16 hellhounds at 7:30. The black demon comes with 4,400 hitpoints, claws for 5, breathes 3 three at
  a time and roars for 3. Persten attacks every 2.8 seconds, her fire wave 4 (every other attack at most) and her
  flames 4. The first pass (demons and hounds 3 damage, Persten's wave every attack at 5) ended most runs at Persten
  (10:13 to 10:30) and few before 10:00.
- **Sims** (`META=max ARMOURY=max`, 8 adventurers by 3 seeds, the bot in the dark): at step 0, 1 win of 24 with a
  median end of 7:01 and 15 deaths before 10:00, against the Stranglewood's 1, 6:31 and 14, Lassar's 1, 10:05 and 12
  and Ghorrock's 1, 8:14 and 15; at step 1, 0 wins, 7:06 and 15, against 2, 7:11 and 14, 0, 7:46 and 14 and 0, 8:28 and 14. The black demon at 5:00 is its wall (about a third of the runs end there), as Kasonde is the Stranglewood's. The
  bot's light was dimmed about 5% of the run (median). With `DARK=0` (the bot doing nothing about the dark) step 0
  was 0 wins, 8:04 and 14: the same within the sims' spread, which is wide (two sweeps of the same map a tweak apart
  gave medians of 5:42 and 7:46).
- **Phones** (`frameProbe` at 844 by 390 on the phone camera): the brain in the cache is walls (49223) and the tops of
  its rims (49232 to 49235) round a middle of black filler (49236) on a hidden floor, thousands of one-tile pieces
  of 340 to 520 triangles: a view of the rift's island was 180k. So it's drawn two tiles in from its edge, wherever
  that edge faces, then a ring of the filler, and past that the hidden floor, black as the filler is; and its
  pieces are drawn lighter (`MODEL_SIMPLIFY` in `LocOverrides.ts`, `ModelData.simplify`: the walls a fifth of their
  faces, the tops an eighth, the filler a fifth, the shortest edges collapsed first, never one on a tile's edge, so
  pieces still meet), as is the kit (two fifths). The islands' kit is still thinned (`KEPT`). The heaviest view is
  38.7k by `view-weight.ts`. In the game the heaviest is a crowd of 51 on the rift's island, 63.0k (34.4k of it the
  world); the heaviest world alone is 42.0k, on the rift's island; the Leviathan's fight is 27.0k up and 38.3k
  enraged with a crowd. The light map costs the same as on any lit map;
  nothing past the lights is culled. The first build (2026-11-10) hollowed the brain to a tile round the ground
  that's walked, filled its hollows with sludge and thinned its walls to two fifths: stubs of wall, flat squares of
  sludge and holes, which this replaced.

## 7. The finale: the Awakened

The finale is two things, both built now: **four separate Awakened fights**, each opened by beating its Act II map,
and **the Forgotten Four**, a gauntlet of all four in a row, opened by beating all four. The act's story ends when the
fourth separate fight falls; the gauntlet is the act's last test.

### 7.1 Why both

The separate fights are where each boss is learnt and tuned. Zachariah took ten rounds to tune one fight, and a
gauntlet alone would have each fight's tuning move the others. They ship one per pull request, each playable the day
it's merged, with Retry and one arena loaded at a time. OSRS does it this way too.

The gauntlet is built from the four fights whole, so it adds no new attacks to tune. It's the place where a run is
long, the bosses climb, and the order is the player's plan (7.3).

### 7.2 The four fights, in brief

Each gets its own design doc before it's built, like the Colossus's. All four keep what Dynny said works in
Zachariah's: an attack about every 1.4 s by phase, the guard down on a miss (double damage), an arena that hurts
the boss, a button that rewards stepping in, the impacts, no item bar, Retry, the intro pan and a bar for each phase.
Each fight is played as its map's adventurer (decided).

| Fight                               | Arena                                                                                        | Kit and button                                                                                               | The idea                                                                                                                                       | Pet                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Awakened Vardorvis (12223, 784)     | His clearing, a ring of the floor system's tiles skinned as roots, the wood round it         | The Forester, a 2h sword; **Chop** clears the roots round you                                                | The ring of roots closes phase by phase; his vines erupt from root tiles; cut a lane, and his dart across cut ground stumbles him (guard down) | Butch (12158)       |
| Awakened Whisperer (12204, 791)     | Her cathedral's forecourt (41,99) and its realm twin (37,99)                                 | The Shadow walker, Shadow Burst; **Blackstone** flips you between worlds                                     | She can only be hurt in the city; her Soul Siphon can only be stopped in the realm; sanity is the clock in there                               | Wisp (12157)        |
| Awakened Duke Sucellus (12191, 758) | His room in Ghorrock Prison, cut from the cache (47,100: 568 open tiles, a boss room's size) | The Snow ranger, a shortbow; **Kindle** lights the brazier you're beside                                     | Cold as in the map, compressed: braziers are the only warmth, his gaze puts out the ones not behind a pillar, his gas spits at the vent by you | Baron (12159)       |
| Awakened Leviathan (12214, 798)     | The Scar's pool (32,99)                                                                      | The Lantern-bearer; **Shadow** stuns it for 3 s (in OSRS shadow spells stun it), its back bared for big hits | The dark, the debris that's your only cover, the pathfinder's circle in the last phase                                                         | Lil'viathan (12160) |

**They're hard.** The first win always drops the pet (decided), so the fight is the gate, and Dynny's condition was
"as long as the fight is hard". The bar each fight is tuned to:

- The careful bot (`DODGE=1`, mortal) wins at most 1 seed in 3 on normal, and none on hard. Zachariah's won 1 in 3,
  so these sit at his level or above.
- Phase 1 still well under a minute, as Zachariah's round 3 settled: hard means the later phases, not a long first one.
- A person shouldn't win on the first few tries. Dynny's playtest says whether it's hard; the bot only says it isn't
  too easy.
- Hard mode is what a hard mode always is, and its first win gives the pet a look of its own (the follower's
  recolour, if the cache has one; otherwise a glow).

Each Awakened win gives an Awakener's orb (8.6).

### 7.3 The Forgotten Four: the gauntlet

| What        | How                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opens       | Once all four Awakened fights are beaten (on normal), from the middle card of the act's screen                                                                                                                                                                            |
| Order       | The player's. The gauntlet screen shows the four cards in a row to drag into order before the start, first beaten first by default                                                                                                                                        |
| It climbs   | Each fight is a step harder than the last, as Act II maps are (section 1): the boss's hitpoints and tempo times 1, 1.05, 1.1 and 1.15. So the order says where the pressure falls: your best fight last, or your worst first                                              |
| Kits        | Each fight as its map's adventurer (decided), so the run swaps adventurer between fights, each with their own weapon and button                                                                                                                                           |
| Wounds      | Each adventurer starts their fight at full hitpoints less a fifth of what the last one lost (so at most 20% down). It makes the four one run: a clean fight helps the next                                                                                                |
| The camp    | Between fights, 45 s in a camp (skippable when ready): the fight just won pays gauntlet points, as a raid room does (a fast kill, little damage taken, guard-downs used), spent on one blessing for the next fight, or kept                                               |
| Blessings   | **Rest**: clears the wounds. **Saradomin's blessing**: +20% hitpoints. **Second wind**: once, falling leaves you at 30% and untouchable for 3 s. **Ancient focus**: the fight's button 25% quicker. **Steady hands**: guard-downs 0.5 s longer                            |
| Retry       | Falling ends the fight. The results offer **Retry this fight** (from its start, with the wounds and points you came in with) or **Start over**                                                                                                                            |
| A clean run | No retries. Only a clean run sets the gauntlet's best time and earns its reward. A run with retries still finishes, and counts as a clear with retries                                                                                                                    |
| Records     | Total fight time (camps don't count), clean or not, the order it was run in                                                                                                                                                                                               |
| Reward      | The first clean clear: the Ancient blood ornament kit's look (object 28336), a blood-touched look for the Soulreaper axe and the four fighting pets, the middle card's gold border, and the gauntlet's hard mode. Any first clear: two Awakener's orbs                    |
| Length      | Four fights of about four minutes and three camps: about 18 to 20 minutes                                                                                                                                                                                                 |
| Engine      | The Theatre's raid already chains rooms with a supply chest between them (`content/raids.ts`): the gauntlet is four fight maps as rooms, the camp is the supply chest with blessings in place of food, and the kit swaps per room. About 1.5 weeks after the fourth fight |

Pets, items and relics stay out of the gauntlet, as they're out of the fights: each kit is the whole of its fight.

**In co-op** (decided, 13.2): a party can run it together, each player as the fight's adventurer. The camp's
blessings and the carried wounds are each player's own, and the room's retry is the host's call.

## 8. Rewards

### 8.1 What's out

The Ancient sceptres and the vestige rings are out of Act II. The game already has an Ancient sceptre passive and the
vestige rings as gear (`items.ts`), and nothing changes there. No new stat items: every reward below changes what a
run is like, not its numbers.

### 8.2 The Soulreaper axe

A Rare melee class weapon (object 28338), melee only (decided): only a melee adventurer is ever offered it. It's made the OSRS way, from four pieces, one from each Act II final boss
the first time you beat its map. With all four it's in the game for every melee run after.

| What      | Number                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swing     | A heavy sweep ahead: 42 damage, every 1.9 s, 2.8 tiles, arc 1.0                                                                                                                    |
| Levels    | 2: 50 damage. 3: 3.0 tiles. 4: every 1.7 s. 5: 60 damage, and Harvest heals (below)                                                                                                |
| Souls     | A kill by anything within 4 tiles of you gives a soul, up to 5 (OSRS's cap). Each is +8% to the axe's damage                                                                       |
| Harvest   | At 5 souls, the next swing with something in reach is a full spin: 3.5 tiles round, three times a swing's damage plus 20% a level, bosses and elites hit twice. Souls go back to 0 |
| Its price | Harvest costs 8% of your max hitpoints. It never takes you below 1, and waits while you're under 20%                                                                               |
| Level 5   | Harvest heals 1 hitpoint for each enemy it kills, up to what it cost                                                                                                               |

**How it shows**: small souls circle your head, one per stack (the Lost Soul's model 49208 at a quarter size, or a
spot animation, by look). At 5 they glow. Harvest is a spin of the player's own (an animation to look up), a ring of
souls flung out, and your hitsplat for its price.

**Why it's interesting**: it's the only weapon that hurts you, and it pays you for standing in the crowd, where the
souls are. It pairs with healing (Blood Burst, the Sanguine scythe), so it makes builds rather than slotting into
them. No evolution, like the Toxic blowpipe.

### 8.3 Remixes

Beating an Act II map opens its rule as a remix on **every** first-campaign map, Lumbridge to the Inferno (and, once
the act's done, on the other Act II maps: decided, 13.2): a switch on
the map's card beside Hard and Endless, one switch for each remix opened. **All of them can be on at once**
(decided). Each remix is a word before the map's name, and all four together is "Fallen":

| Remix     | Rule from        | Shown off on (its first look, and the map it's tuned on) | Why that map                                                            |
| --------- | ---------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Overgrown | Stranglewood     | Overgrown Lumbridge                                      | Fields, the swamp and Draynor's woods to creep over                     |
| Shadow    | Lassar Undercity | Shadow Barrows                                           | The Barrows' crypts and Mort'ton's shades already belong in shadow      |
| Frozen    | Ghorrock         | Frozen Wilderness                                        | Ghorrock is in the Wilderness                                           |
| Dark      | The Scar         | Dark Karamja                                             | The volcano's glow and the jungle's fires make lights that belong there |

**On any map.** Each rule is map-agnostic (section 2), and its numbers scale with the map's toughness: roots creep at
0.7 times the Stranglewood's speed on Lumbridge, up to its full speed on the Inferno, and so on for cold's rise, sanity's
drain and the light's size. Where a rule needs things placed, they're placed by the map's seed on open ground:
braziers (six, at least 20 tiles apart), puddles (as random events turn up), ice (on paths and open ground, never
making water walkable), and lights from what's already there (lava, fires, lamps). A map's own enemies stay; each remix
adds its Act II map's few (Strangled, shadows and lost souls, ice warriors and spiders, scarred imps and leeches). The
Shadow remix has no twin squares on these maps, so its realm is the palette (brightness 0.55, a violet wash) and its
enemies.

**How the rules combine.** Every pair has a rule, so nothing is left to chance:

| Together           | What happens                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Overgrown + Frozen | Roots don't grow on ice, and fire elites' embers burn away the roots within 2 tiles                               |
| Overgrown + Shadow | The realm has no roots, and the city's roots stand still while you're away (the world waits, 4.2)                 |
| Overgrown + Dark   | Roots in the dark are drawn dark, but their sprouts (the warning) are drawn unlit, as every warning is            |
| Frozen + Shadow    | Cold rises half as fast again in the realm, and there are no braziers there: a dive is a race against both meters |
| Frozen + Dark      | A lit brazier and embers are lights (4 tiles and 2)                                                               |
| Shadow + Dark      | The realm is darker: your light is 4 tiles there, not 5                                                           |
| All four           | Sanity and cold sit side by side under your hitpoints                                                             |

No rule is softened for being stacked: stacking is the challenge, and the coins pay for it.

**The crowd stays the same size.** With several remixes on, their added enemies share one remix's share of the
waves, so the cap on enemies doesn't move.

**Coins**: +30% for one remix, and +25% for each more (+105% with all four). Remixes, hard mode, Act II's steps and
invocations all add together, up to +300% in all.

**Records**: for each set of remixes on each map (`remixVictories`, keyed by the map and its remixes in order, as
`lumbridge:dark+frozen`): wins, best time, endless best, a tick and a gold tick for hard. The card shows the records
for the switches that are on, and a badge for the most remixes beaten at once there, the Fallen badge for all four.
Quests count as they do on the map.

**Phones and the sim with all four on.** The worst case is the heaviest first-campaign map with every remix:

| Cost             | About                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Roots            | Up to 4k triangles at full cover (3.9)                                                        |
| Braziers         | Six fire spot animations, about 1.5k when two are in view                                     |
| Lights           | Per-pixel work, not triangles; and the dark lets the scene past the lights be culled          |
| The Shadow remix | Nothing: it's the palette on these maps                                                       |
| The sim          | Roots grow only at their fronts, and while you're in the realm the waiting world isn't ticked |

So the remix pull request after the Scar (section 10) measures every first-campaign map with all four on, with
`frameProbe.sample` on the phone camera and a bot run for the sim's tick time. A map that goes over 69k gets its root
cells at 3 by 3 tiles, not 2 by 2.

**What it changes for someone who's bought everything**: fifteen sets of rules on each of twelve old maps, each with
records, all made from the rules the act already built.

### 8.4 Fighting pets

Each Awakened fight's pet (the first win always gives it) can be taken along the way pets are now, and these four do
something. The others stay looks only.

| Pet         | NPC (follower) | What it does                                                                                                                                                     |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Butch       | 12158          | Every 6 s, leaps at the nearest enemy within 5 tiles of you and cleaves 1.5 tiles round it                                                                       |
| Wisp        | 12157          | Every 10 s, calls the bones and coins within 8 tiles to you; once a minute, a lost soul that heals 5% when it reaches you                                        |
| Baron       | 12159          | Naps beside you. When 6 or more enemies are within 3 tiles of you he wakes and spits a gas cloud (3 by 3, 4 s) that slows them 45% and poisons; then sleeps 15 s |
| Lil'viathan | 12160          | Every 20 s, blows a bubble round you that takes the next hit (up to 25% of your hitpoints) and pops, knocking back what's near                                   |

- **Small**: about what a Common weapon does, and their damage scales as power-ups' does, with the enemies'
  hitpoints. A pet isn't a weapon slot, so it mustn't be one.
- **Can't be hurt or targeted**, so no enemy has to think about them.
- **In the sim**, like a thrall: deterministic, with its `hero` index, in co-op too. Not in boss fights (the kit is the
  whole run).
- This changes the rule in `pets.ts` that a pet never changes a run, for these four only. A run with a looks-only pet,
  or none, plays exactly as before.

### 8.5 Adventurers

Five, each with a trait that's a way to play rather than a bonus. Traits are new (`CharacterDef.trait`), since
`bonus` is stats only.

| Adventurer      | Fights with | Starts with            | Outfit (object ids)                                                              | Trait                                                                                                                                                                                                                                                               | Joins for                                        |
| --------------- | ----------- | ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Forester        | Melee       | Bronze 2h sword        | Lumberjack hat, top, legs, boots (10941, 10939, 10940, 10933)                    | **Timber!** Every 25 kills his next swing fells a tree: a Strangled Tree falls along a strip 8 long ahead, four times a swing's damage. His sweeps cut roots 2 tiles out                                                                                            | Beating the Stranglewood                         |
| Shadow walker   | Magic       | Shadow Burst           | Ancient mitre, robe top, legs, cloak (12203, 12193, 12195, 12197)                | **Step between.** Once every 30 s, a hit that would take over a fifth of her hitpoints takes her into the shadows instead: 1.5 s she can't be touched, enemies lose her, and she comes out 3 tiles on. In Lassar, a step between in the city takes her to the realm | Beating the Lassar Undercity                     |
| Treasure hunter | Ranged      | Bronze throwing knives | Pith helmet, explorer backpack, desert shirt and robe (12516, 12514, 1833, 1835) | **Dig site.** A casket she leaves on the ground buries itself. Dug up again (walk back over it) after 20 s, it's a tier better; after 60 s it's gone                                                                                                                | Opening 5 caskets in the Shadow Realm in one run |
| Snow ranger     | Ranged      | Shortbow               | Polar camo top and legs (10065, 10067), Fremennik helm (3748)                    | **Shatter.** Every fourth arrow chills (slowed 1 s), and anything killed while frozen or slowed shatters, its shards hitting within 3 tiles for a quarter of its hitpoints (a tenth for elites). On ice she never slides, and her cold rises 40% slower             | Beating Ghorrock                                 |
| Lantern-bearer  | Magic       | Fire Strike            | Ancient d'hide coif and body (12496, 12492), the Abyssal lantern in hand (26822) | **Lantern.** Enemies within 3 tiles of her, in her lantern's glow, take 20% more and are 10% slower. On the Scar her light is twice the size                                                                                                                        | Beating the Scar                                 |

### 8.6 More rewards that aren't items

For a player who's bought everything, each of these changes what a run is like:

1. **Awakened invasions.** Once all four Act II maps are beaten, a campaign run from the Desert on has a 1 in 4 chance
   (1 in 2 on hard) that one of the four final bosses invades, at a random time between 6:00 and 12:00. It brings a
   pocket of its rule with it, 24 tiles across, for as long as it lives: roots, a puddle into its realm, a ring of
   cold, a bubble of dark. Kill it for a master casket and a boss's coins twice over. A Collection log line counts each.
   **What it changes**: old maps aren't solved any more. A run on a map you've beaten fifty times can have a spike in
   it.
2. **Awakener's orbs** (object 28334). Each Awakened win gives one. Spend one on a campaign map's card to awaken its
   final boss for one run: 1.6 times its hitpoints, enraged from 75% and 20% faster, drawn darker with a violet glow.
   A win marks the card and always drops a master casket. **What it changes**: every old final boss gets a harder
   version, chosen when the player wants it, and orbs are scarce enough to pick which.
3. **The weekly Vault.** A seeded run that's the same for everyone each week (its seed from the ISO week): a map, its
   remixes, invocations and an adventurer picked by the seed, with a best time and kills kept per week. Co-op parties get the same
   seed. The sim is deterministic already, so this is mostly a screen. **What it changes**: one fixed challenge, new
   each week, that can be compared with friends.

The act's ending is the last: the middle card's story, told when the fourth Awakened falls.

### 8.7 As built: remixes and the Soulreaper axe (2026-11-11)

Built in #159 as build order steps 5, 7, 10 and 13 together (the four rules were already map-agnostic, so one
pull of work put all four on). Where it differs from 8.2 and 8.3, and why:

- **What a remix is in the code.** `content/remixes.ts` has the four (which Act II map each comes from, its word,
  its elites), which maps take them (`getMapRemixes`: every first-campaign survival map, and the Act II maps but
  their own) and when they're open (`isRemixOpen`: its Act II map beaten; on an Act II map, all four beaten). What
  one puts on a run is `core/rules/remix.ts` (`buildRemixRun`), done by the Sim as it starts, on the map's own grid
  and by the run's seed, so every co-op copy places the same: each Act II rule's def with this map's places and
  numbers in it, the map's waves with the remixes' crowds in, its events with their elites, and the Dark remix's
  lighting. Several rules on one run are one `RuleSet` (`RunRule.ts`): every hook goes to each. A run without
  remixes builds nothing new, so every pinned run plays as it did (`runHash.test.ts`).
- **The switches** are on the map's card, under its records (`RemixRow` in `GameUi.tsx`), not in the bottom bar
  beside Hard and Endless: on a phone that bar is full. A switch for each of the four, greyed until open (its
  tooltip says what opens it; on an Act II map its own rule's says it's the map's own), the records of the set
  that's on under them, and a badge for the most beaten at once (Fallen for all four). The run's button says
  the set: "Enter Frozen Dark Lumbridge", "Enter Fallen Inferno" (a leading "The" dropped). They're the
  screen's, not the save's: picking another map keeps those that are open on it.
- **How hard on each map**: `getRemixToughness`, 0.7 on Lumbridge rising evenly to 1 on the Inferno (and the Act
  II maps). Roots creep that much slower (their spreads' seconds divided by it), sanity drains and the cold rises
  that much slower (times it), and the player's light is that much bigger (divided by it: 7.1 tiles on Lumbridge,
  5 on the Inferno). The Dark's ambient goes from 0.36 to the Scar's 0.3.
- **Overgrown**: the Stranglewood's roots in cells of 3 by 3 tiles, not 2 (`RootsRuleDef.cell`; 8.3's answer for a
  map over 69k, and every first-campaign map's busiest view is, below), their spreads' seconds 1.5 times as long so a
  front still moves as many tiles a second, from each map's blocked ground (water, buildings, walls: the wood),
  never within 10 tiles of the middle of an Act II map's final fight; no safe circle on campaign maps, whose final
  bosses can come anywhere. Elites: three Strangled Bears (4:00, 8:40, 13:00), whose trail roots.
- **Shadow**: the realm as the palette (brightness 0.7, not 8.3's 0.55, which hid the darker maps such as the Barrows, and Lassar's violet wash), Lassar's puddles, sanity,
  souls, portal, risers and realm elites as they are. Puddles open where Lassar's do (8 to 12 tiles off), so on a
  walled map one can be past a wall; the realm's waves are Lassar's realm waves.
- **Frozen**: Ghorrock's cold, with six braziers placed by the seed on open, outdoor ground joined to the start,
  within 40 tiles of it and 20 apart (10 if a cramped map can't fit six), and twelve ice pools (2 to 5 tiles
  across each way) within 60. No gas vents: they're Ghorrock's scenery, not something to place. The braziers
  don't block (Ghorrock's are stand-ins in the map). The ice is drawn a tile at a time over the map's own ground,
  only where it can be walked, as the cache's slippery Ice (loc 21148, animated, 1.45 times its size and turned by the tile so neighbours overlap). Elites: four pyrefiends and two
  flaming pyrelords, whose embers relight braziers. The final boss still puts every brazier out.
- **Dark**: the Scar's lighting, with nine fires (loc 5249, lights of 3 that weapons aim by) placed by the seed
  within 60 tiles of the start and 15 apart, two lanterns by the start and lanterns among the power-ups. The
  "lights from what's already there" (lava, lamps) aren't in: the sim doesn't have the map's scenery, and lights
  weapons aim by have to be the sim's, so fires are placed instead. Elites: three light leeches.
- **The crowd**: each wave keeps its size and cap; the remixes' enemies (wave i of each one's Act II map, all paced
  alike) take a quarter of its weight between them, split evenly, so one remix or four, a quarter of what comes is
  theirs. Their hitpoints are the map's difficulty's, on the same curve as the map's own.
- **Pairs**, as 8.3's table, all built: roots don't take on ice (`RootRule.exclude`) and a fire elite's embers
  burn them 2 tiles round; in the realm the roots stand still and don't slow, hurt or get cut, and aren't drawn;
  in the realm there are no braziers (not drawn, no warmth) and the cold rises 1.5 times as fast; under the dark a
  lit brazier is a light of 4 and embers of 2; and in the realm the player's light is 0.8 of its size (4 not 5).
  Roots in the dark are drawn as the lighting draws them; their sprouts aren't drawn unlit (left as they are).
  With all four, sanity and cold are the two bars under hitpoints already.
- **Coins**: 0.3 for one, 0.25 for each more, added to hard mode's or the invocations', and Act II's steps, under
  the +300% cap. A remixed map takes invocations whatever it is (`takesInvocations(map, true)`): Lumbridge, the Barrows and
  the Wilderness get the board when remixed.
- **Records** (`SaveData.remixVictories`, keyed `lumbridge:dark+frozen`): wins, the best time, wins on hard (the
  gold tick) and the best endless round, relic-free. A remixed win counts as a win of the map (its tick, quests),
  but sets none of the map's own hard, act, invocation or endless records: they stay the plain map's. No
  `SAVE_VERSION` bump.
- **Co-op**: the host's remixes go in `GameStart.remixes` (as its invocations), each copy's Sim keeping those the
  map takes. The lobby doesn't show them yet.
- **The bot** (`simulate-run.ts`): `REMIX=overgrown,frozen` or `REMIX=all`. Its goals for the realm and the cold now
  walk round walls (`wayTo`, the flow field), and it picks a brazier by the walk to it: on an old map a straight line
  to one is often through a castle.

- **Sims** (`simulate-run.ts`, `META=max ARMOURY=max`, warrior, wizard, ranger and barbarian by seeds 1 and 2, each
  remix alone and all four, against none; wins of 8, the median end, deaths before 10:00):

    | Map       | None        | Overgrown   | Shadow      | Frozen      | Dark        | All four    |
    | --------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
    | Lumbridge | 8, 15:46, 0 | 7, 15:52, 0 | 6, 15:41, 0 | 6, 16:07, 0 | 8, 15:59, 0 | 5, 16:31, 0 |
    | Karamja   | 1, 10:39, 3 | 2, 16:12, 2 | 0, 14:19, 0 | 1, 9:24, 5  | 0, 11:00, 3 | 1, 14:15, 2 |
    | Inferno   | 1, 7:54, 7  | 0, 8:00, 7  | 1, 7:54, 5  | 0, 8:31, 6  | 0, 8:00, 7  | 0, 7:48, 7  |

    The remixes cost a win or two on Lumbridge and the Inferno, and on Karamja the bot lasted longer with most of them
    on: the remixes' quarter of the crowd is in place of a quarter of Karamja's own, which hit harder than the Act II
    maps' early waves, and the realm's drops are double. Eight runs a cell is a small sample (a seed's course moves a
    median by minutes). The bot dived 3 to 7 times a run and was frozen at most once (median). These were run with
    2-by-2 root cells; the 3-by-3 cells came after, for phones.

- **Phones** (`frameProbe.sample(30)` at 844 by 390 on the phone camera, all four on, 3 minutes in with its crowd, at
  the start; "all rooted" is every open cell rooted, the worst the roots can be): the first-campaign maps' own
  worlds are well over 69k at their starts (the Barrows 114k, Kourend 212k, Prifddinas 224k, Varlamore 164k:
  they were never thinned for phones, as Act II's maps were), so no remix can bring those under it. What the
  remixes add is actors: the roots at full cover cost 9.6k to 17.6k at 2 by 2 cells and 5.6k to 8.8k at 3 by 3; ice
  and fires a few hundred; braziers a few models; the realm and the dark nothing in triangles. Under 69k with all
  four on: the Desert (41k), Fremennik (53k), the Wilderness (45k); over it already without them: the rest. The
  table is in #159.

**The Soulreaper axe** (`soulreaper_axe`, object 28338): as 8.2. It's opened by a new unlock task, `pieces`, all
four of the trophies found (they already dropped from the final bosses); the Scar's card lists it. Its swing is the
godswords' (seq 7045); OSRS's own axe animations weren't looked up. `WeaponDef.souls` holds its numbers; a kill by
anything within 4 tiles of a hero holding it gives that hero a soul (kills the Harvest makes count too, so a big
spin can leave one). Each soul is +8% to its hits. Harvest (`Sim.harvest`) is a full circle 3.5 tiles round (with
the area stat), three times the swing's damage plus 0.2 a level after the first, bosses and elites taking it a
second time, its price a hitsplat of 8% of max hitpoints (never below 1, never while under 20%), with the Dragon
axe special's spot animation (479) on the player. At level 5 each kill it makes heals 1, up to the price. The souls
are drawn as soul runes (object 566) circling the head, bigger and flashing at five: no Lost Soul model is loaded
on every map, and a rune reads as a soul.

## 9. Invocations and Relics

Both are in, and in the first build (decided): they ship with the Stranglewood, before the other maps (section 10).

### 9.1 Invocations

The Tombs of Amascut's: opt-in handicaps on any map from the Desert on, picked on the map's card, each worth points.
Act II maps and remixes take them too; boss fights and the gauntlet don't (their hard modes are the handicap). The
run's coins are +1.5% a point, adding to the other bonuses (8.3), and badges go on the card at 100, 200 and 300 points.
A record shows the points it was set at.

**Hard mode is a preset of invocations** (decided, 13.2): the Hard switch turns on the set of invocations that
matches today's hard-mode numbers, worth their points, so a hard run plays as it does now. Boss fights and the gauntlet
don't take invocations, so their Hard stays a switch of its own.

| Invocation      | Points | What                                                |
| --------------- | ------ | --------------------------------------------------- |
| Walk the path   | 10     | Enemies 15% faster                                  |
| Upset stomach   | 15     | No food drops, and the Sandwich lady doesn't come   |
| Overly draining | 10     | No rerolls and no banishes                          |
| Glass cannon    | 20     | Half your hitpoints                                 |
| Hardcore        | 15     | No Ring of life, no getting back up                 |
| Feeling special | 10     | Bosses enrage at 75%, not 50%                       |
| Aerial assault  | 15     | Bosses' patterns half as many bullets again         |
| Ancient haste   | 10     | The run's clock 25% faster: the final boss at 12:00 |
| Blood moon      | 15     | Every boss comes a minute early                     |

(The pitch's Double remix is gone: remixes stack for free now.)

### 9.2 Relics

Leagues-style: each Act II map beaten opens the next relic tier, so the first build has tier 1. One relic is picked
per tier on the adventurer screen and stays picked across runs until changed.

| Tier | Relics                                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Endless harvest**: bones within 10 tiles fly to you every 20 s. **Production prodigy**: caskets never pause the run, their items decided by the auto rules, alched for 25% more. **Trickster**: every 15 s the next hit on you misses |
| 2    | **Globetrotter**: power-ups drop 20% more often and wait twice as long. **Banker's note**: coins come to you from anywhere. **Fairy's flight**: 10% faster, and once every 10 s you push through a crowd                                |
| 3    | **Bloodthirsty**: every 50 kills heal 5%. **Specialist**: one weapon slot fewer, the others 25% harder. **Grimoire**: start with a second weapon, a Common of your class                                                                |
| 4    | **Last recall**: once a run, falling takes you back to the spawn with half your hitpoints, and everything near you is stunned. **Reloaded**: two level-up offers kept for later, each once                                              |

**Where they apply.** Relics make runs easier, and Dynny wants the fights hard, so they're on every campaign map,
Act II map and remix, and **off in boss fights and the gauntlet**. A record shows the relics it was set with, as it
shows invocation points, and hard-mode, remix and weekly Vault records are relic-free (decided, 13.2).

Each relic is a small sim rule on the hero (deterministic, in co-op each player's own), and the adventurer screen gets
a row of four slots. About a week for the two systems, with invocations' card switches.

### 9.3 As built (2026-11-10)

**One system, two boards.** The Tombs' invocations were generalised rather than copied: an invocation set
(`content/invocations.ts`, `InvocationSet`) is a board's list and groups, and cleaning, toggling and points work on
any set. The Tombs keep their own set, raid level, presets, save field (`invocations`) and co-op field as they were.
A run's set is `RUN_SET`, ids `run_*` (the Tombs already have a Walk the Path, an Upset Stomach and so on that mean
other things there), saved as `SaveData.runInvocations`, and sent in co-op in the same `GameStart.invocations` (the
Sim cleans it by the map's board). Which maps take them is `takesInvocations(map, remixed)` in `maps.ts`: campaign
maps from the Desert on and the Act II maps; `remixed` is the hook for remixes on the earlier maps.

**Hard mode's preset** is four invocations, so a hard run is the same run: Hardened Foes (the map's hard hitpoints
and damage, and the weapons' hard-mode balance, 90 points), Thronging (the crowd x1.25, bones' experience x0.9, 40),
Elite Guard (two elites, 25) and Short Fuse (bosses enrage at 65%, attack 15% faster, fire the map's hard bullets,
and co-op's more copies, 25). Together 180 points, so the nine above (120) and hard mode come to 300, the top badge.
They pay hard mode's +25% coins between them (each 6.25%), not 1.5% a point. Checked: the pinned hard Inferno run is
the same hash with the preset alone (`runHash.test.ts`), and seeded bot runs on hard (the Desert x4, the Inferno, the
Stranglewood) print the same, line for line, before and after. The Hard switch turns all four on and off; they
aren't picked one by one on the board for now (a row of their own, lit with the switch), so a hard record is always
the whole preset. Off the board's maps (Lumbridge to the Wilderness, boss fights, raids) Hard is the switch it was.

**Coins** add together now: 1 + (hard mode or the invocations' + an act's step), up to +300% (`COIN_BONUS_CAP`).
Before, hard mode multiplied the act's step; that changes only hard runs on Act II's later steps.

**How a few read in the sim.** Hardcore's "no getting back up" is co-op's revives. Ancient Haste runs the map's
clock (`mapSeconds`: waves, events, the ramp, endless rounds) 25% fast; the run's time stays real. Blood Moon moves
every boss and final boss event a minute earlier. Upset Stomach is the Tombs' On a Diet for runs, and keeps the
Sandwich lady away.

**Relics** (`content/relics.ts`, rules in `Sim.ts` under Relics, the row in `ui/Relics.tsx`): tier N opens with N Act
II maps beaten, so all four can be open. Picks are `SaveData.relics`; a run takes the open tiers' picks, and in co-op
each player's come in their loadout. They're on campaign and Act II maps (`takesRelics`), and off in boss fights,
raids, the Tombs, quests in parts, the seasonal and fun maps. How the less obvious ones read:

- Production Prodigy's "auto rules" are Auto equip's (`shouldAutoEquip`), in the sim: better gear is worn, the rest
  alched (for 25% more), a utility item taken.
- Fairy's Flight: the player was never held back by a crowd (they shove it), so the push is a knockback: walking with
  4 or more enemies within 1.5 tiles throws them aside, every 10 s.
- Specialist's "25% harder" is +25% might. Grimoire's weapon is a Common of the class's damage style, by the seed.
- Last Recall comes after a Ring of life, and stuns (freezes) everything within 8 tiles of the start for 3 s.
- Reloaded: twice a run, Keep for later puts a level up's offer by (that level up goes by); at a later level up,
  Take kept offer plays it first as an extra pick, then the level up's own. What can't be had as offered any more
  (a weapon level already taken) drops off it.

**Records.** `SaveData.invocationBest` keeps each map's win at the most points (ties to the quicker), with its
relics; the card shows it and the badges, and the map list shows the highest badge. Act records and endless records
keep the points and relics they were set with. A win with a relic on counts as a win, but sets no hard-mode (or
expert) record or win, so those stay relic-free (13.2); the remix and weekly records will do the same when they
come.

## 10. Build order

Everything lands on one branch, `act-2`, in one pull request (#159), at Dynny's word. Lighting came first, then the
Stranglewood. Then, Dynny leaving the order to me (2026-11-06): Awakened Vardorvis next, so its playtest rounds
(Zachariah took ten, and these are to be harder) run while the rest is built; then invocations, relics and the first
remix; then each map with its remix and its Awakened fight, so every map lands whole; the gauntlet and the extras
last. Each step lists its sims (`MAP=x`), its phone numbers and its cache additions in #159.

| #   | Step                                                                                                                                      | Needs        | Rough size |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| 1   | **Lighting**, as an engine feature: lights from any source, a changeable darkness, `litTargetsOnly` (6.8). Done                           | -            | done       |
| 2   | **Stranglewood**, with the act's screen, `act.requires`, Act II's steps, `RunRuleDef`, roots, the Forester. Done                          | -            | done       |
| 3   | **Awakened Vardorvis**, with fighting pets (Butch first), and its design doc. Built, first pass (`awakened-vardorvis.md`); playtest next  | 2            | 2 weeks    |
| 4   | **Invocations and relics** (tier 1 opens with the Stranglewood). Built (9.3)                                                              | 2            | 1.5 weeks  |
| 5   | The Overgrown remix, with the remix switches, sets and records                                                                            | 2            | 4 days     |
| 6   | **Lassar Undercity**: the twin, layers, sanity, souls, the party's flip, the Shadow walker and the Treasure hunter. Built (4.11)          | 2            | 2.5 weeks  |
| 7   | The Shadow remix                                                                                                                          | 5, 6         | 3 days     |
| 8   | **Awakened Whisperer**, the Wisp. Built, first pass (`awakened-whisperer.md`)                                                             | 3, 6         | 2 weeks    |
| 9   | **Ghorrock**: the ScapeRune map, the effect mask, cold, braziers, vents, the Snow ranger. Built (5.11)                                    | 2            | 3 weeks    |
| 10  | The Frozen remix                                                                                                                          | 5, 9         | 3 days     |
| 11  | **Awakened Duke Sucellus**, Baron. Built, first pass (`awakened-duke.md`)                                                                 | 3, 9         | 2 weeks    |
| 12  | **The Scar**, on the lighting: lanterns, light leeches, fires, the Lantern-bearer. Built (6.9)                                            | 1, 2         | 1.5 weeks  |
| 13  | The Dark remix, all four stacked (every first-campaign map measured with all four on), and the Soulreaper axe (all four pieces now exist) | 12           | 1.5 weeks  |
| 14  | Awakened Leviathan, Lil'viathan, the act's ending                                                                                         | 3, 12        | 2 weeks    |
| 15  | **The Forgotten Four** gauntlet                                                                                                           | 3, 8, 11, 14 | 1.5 weeks  |
| 16  | Awakened invasions, Awakener's orbs, the weekly Vault                                                                                     | 14           | 1.5 weeks  |

The sizes are reasoned from the code, not prototyped, and leave out playtest rounds.

## 11. Engine work in one place

| Piece                         | New or reuse                                               | Used by                                 |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| Act screen, `act.requires`    | New                                                        | All                                     |
| `RunRuleDef` on `MapDef`      | New, sim-side, map-agnostic                                | All four maps, remixes, invasions       |
| Effect mask (any map's tiles) | New; reuses the floor's effects and `PlayerMovement`'s ice | Roots, Ghorrock's ice, the Frozen remix |
| Instanced ground layer        | Reuses `FloorView`'s instancing and code rise              | Roots                                   |
| Twin terrain (`MapDef.twin`)  | New, client only                                           | Lassar, its Awakened fight              |
| Layers in the sim             | New: enemies, drops and pickups carry a layer              | Lassar                                  |
| Per-hero meters on the HUD    | New (sanity, cold)                                         | Lassar, Ghorrock, their remixes         |
| Drawn, changeable locs        | Reuses the fight view's statues                            | Braziers                                |
| Lights                        | New, in four shaders and the sim, built first              | The Scar, the Dark remix, the Leviathan |
| Act II's steps                | New: toughness from Act II maps beaten                     | Act II maps, the gauntlet               |
| Remix sets and their records  | New: several rules on one run, records per set             | Remixes                                 |
| Invocations and relics        | New: run modifiers on the card and the adventurer screen   | Every campaign map                      |
| The gauntlet                  | Reuses the raid's rooms and supply chest                   | The Forgotten Four                      |
| Fighting pets                 | Reuses thralls                                             | Pets                                    |
| `CharacterDef.trait`          | New                                                        | Adventurers                             |
| Brightness and wash           | Reuse (the Theatre's halls)                                | Lassar, the Shadow remix                |
| Boss attacks                  | Reuse `BossAttackDef` and `ImpactDef`                      | Every boss                              |

## 12. Changed from the pitch, and why

- **No blood captors.** No NPC by that name is in the cache. The root-clearing elite is a **root heart**, the
  Stranglewood's Large Tendril (12225), and the Strangled Bear lays roots instead.
- **Ghorrock is built, not cut.** The prison's open ground is corridors (2,985 tiles at most) and the Duke's room is
  568, so the yard is a ScapeRune map with the prison's kit. The Duke's room is kept for his Awakened fight.
- **Lassar is the real Shadow Realm**, not a palette swap: the cache has the realm as a twin of the city (4.1). The
  palette version is what the Shadow remix uses on older maps.
- **The Scar is a smaller arena** (2 by 2 squares): half its cached squares are filler.
- **Rewards**: the Ancient sceptres and vestige rings are out. In: Remixes (stacking, on any first-campaign map),
  fighting pets, adventurers with traits, invasions, orbs, the Vault, invocations and relics. The Soulreaper axe stays, made from four pieces.
- **Adventurers renamed**: the pitch's Archaeologist, Treasure hunter, Shadow walker and Awakened slayer are now the
  Forester, Shadow walker, Treasure hunter, Snow ranger and Lantern-bearer, one or two a map, so each map has its own.
- **The Voyage** (the pitch's wildcard) isn't in this act.

## 13. Decided, and what's still open

### 13.1 Decided (Dynny, 2026-11-06, on #155)

1. **The finale**: "Now". The gauntlet is built now too, beside the four separate fights (7.3).
2. **Lassar in co-op**: "Whole party". The party flips together (4.2).
3. **The Scar's lighting**: "Do lighting now". Real lighting, built first, with the spike as its first step (6.8, 10).
4. **Ghorrock as a ScapeRune map**: "Ok" (5.1).
5. **How hard**: "Harder, is expansion requires the completion of the first campaign". Act II maps get harder the more
   of them you've beaten, and the act opens only once the Inferno's beaten (section 1).
6. **Pets**: "Yes, as long as the fight is hard". The first Awakened win always drops the pet, and the fights are
   tuned hard (7.2).
7. **Fight kits**: "Yes". Each Awakened fight is played as its map's adventurer, in the gauntlet too.
8. **Remixes**: "All". Every remix can be on at once, on any first-campaign map (8.3).
9. **Invocations and Relics**: "In, now". Both are in the first build (section 9, 10).
10. **The Soulreaper axe**: "Melee only" (8.2).

### 13.2 Decided next (Dynny, 2026-11-06, on #155)

11. **The gauntlet in co-op**: "Co-op too". A party can run it together, each player as the fight's adventurer; the
    camp's blessings and the wounds are each player's own (7.3).
12. **The gauntlet's order**: "Player's choice", as designed. Times compare within the same order.
13. **Hard mode and invocations**: "Yes". Hard mode becomes a preset of invocations (section 9). Its numbers stay what
    they are today, so a hard run plays the same; its records are kept as the preset's.
14. **Remixes on Act II maps**: "Yes". Once all four Act II maps are beaten, they take each other's remixes too (a Dark
    Stranglewood, a Frozen Lassar). Their own rule's remix is greyed out on them. Measured with the rest in PR 10.
15. **Records and relics**: "Yes". Hard-mode, remix and weekly Vault records are relic-free: a run with any relic on
    still counts as a win, but sets only the map's ordinary records (9.2).
16. **The coin cap**: "Yes". All coin bonuses add together up to +300%, and stacking past it pays nothing more.
17. **Act II's steps in co-op**: "Host". The host's step counts for the room.
18. **The gauntlet's wounds**: "Carry". A fifth of each fight's damage carries to the next adventurer, as designed.

Nothing is open now.

## 14. Not verified

- How any of the four cuts looks from the play camera, or what it costs a phone: nothing here was drawn.
- The spot animations for Vardorvis's axes and vines, the puddle's ripple, the gas vents and the Soulreaper spin:
  each pull request looks them up.
- Which brazier id reads as lit (48122 or 48901): neither (5.11).
- Whether the Scar's filler squares draw a floor.
- Root growth's numbers against the bot, and every other number here.
- The music tracks' assignments are from the OSRS Wiki's pages ("Blood Rush", "Song of the Silent Choir" and "Eye See
  You" checked there; the area tracks from the areas' pages). Their recordings aren't in `src/media/music` yet.
