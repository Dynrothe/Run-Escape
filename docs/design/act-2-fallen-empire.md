# Act II, The Fallen Empire: design

The design for a campaign expansion after the Inferno, written 2026-11-06 on the `act-2-design` branch. Dynny's ask
was "come up with a campaign expansion, new maps, new unlocks. You can think out of the box". The pitch (four Desert
Treasure II maps, each with a rule, then a finale) came back with: "Map and boss ideas are great, item rewards not so
much. Soul reaper axe is cool and can stay but think of different rewards. Do the design". This is that design. It's
design only: no game code. Each map, and each Awakened fight, gets its own pull request and, for the fights, its own
design doc in the shape of `quarry-colossus.md` before it's built.

Every id here was looked up in the game's cache (`osrs-241_2026-09-30`) with `scripts/cache/` and
`scripts/scaperune/find-prefabs.ts`. Every number is a first pass from arithmetic and the existing maps, not a
playtest.

## In short

- **The shape.** Beating the Inferno opens a new screen, the Fallen Empire: four maps in any order (the Stranglewood,
  the Lassar Undercity, Ghorrock and the Scar), each a normal 15-minute run with **one rule that changes how you
  play**. Beating one opens its Awakened fight. The act ends when all four Awakened are down.
- **The rules.**
    - **Stranglewood**: roots creep in from the forest's edge, slowing and hurting you. Your hits cut them back, and
      killing a root heart clears a patch. Leave them be and the map shrinks to Vardorvis's clearing.
    - **Lassar Undercity**: the city and its Shadow Realm. Step into a black puddle and the world turns to the real
      cache's Shadow Realm copy of the city: other enemies, double drops, sanity draining. Catch three lost souls to get
      back.
    - **Ghorrock**: a frozen prison yard. A cold meter rises all the time, and braziers, fire elites and fire weapons
      keep it down. Ice pools slide and freezing gas vents puff.
    - **The Scar**: darkness, with a light round you. Weapons only aim at what's lit. Lanterns, light leeches and fires
      are the light. It's the hardest to build: it needs lighting the renderer doesn't have (section 6.8).
- **The finale: four separate Awakened fights, not a gauntlet** (section 7). Each is a boss fight like Zachariah's
  and the Colossus's, opened by beating its map, and each drops its pet.
- **The rewards** (section 8). Out: the Ancient sceptres, the vestige rings and plain stat items.
    - **Soulreaper axe**: melee. Kills near you give it souls (up to 5), and at 5 it spends 8% of your hitpoints on a
      big spin. Its four pieces come from the four final bosses.
    - **Remixes**: each Act II map's rule on an earlier map (Overgrown Lumbridge, Shadow Barrows, Frozen Wilderness,
      Dark Karamja), with records of their own.
    - **Fighting pets**: Butch, Baron, Wisp and Lil'viathan, one per Awakened fight. Take one into a run and it does a
      small thing.
    - **Five adventurers** with traits rather than stat bumps.
    - Three more that aren't items: **Awakened invasions** on old maps, **Awakener's orbs** that awaken an old final
      boss, and the **weekly Vault**, a seeded run.
    - Optional and separable: **Invocations** and **Relics** (section 9).
- **The build order**: Stranglewood with the act's screen first, then Lassar, Ghorrock and the Scar, one map per pull
  request. Each map's remix follows it, then the Awakened fights and pets (section 10).
- **Changed from the pitch** (section 12): there's no blood captor NPC (root hearts instead); Ghorrock's prison is too
  cramped to cut (we build it in ScapeRune); and Lassar is better than pitched (the cache has the Shadow Realm as a
  real twin of the city).

## 1. The shape of the act

**Opening.** Beating the Inferno opens the Fallen Empire screen, a tab beside the map list's Bosses tab. The four
maps are cards round a fifth in the middle. The middle card fills in as the Awakened are beaten and plays the act's
ending at the fourth. Each card shows its boss (drawn as the boss bar draws it), its rule in a line, its records, and
its rewards faded until earned, as map cards do now.

**Any order.** `isMapUnlocked` is a straight chain today (`MAPS[index - 1]` beaten). Act II maps get
`act: { requires: "inferno" }` instead, and the Awakened fights keep `fight.requires` (their own map). Nothing else in
the chain moves.

**How hard.** The four maps are equally hard, a step past the Inferno (`difficulty: { hp: 4.0, damage: 2.85 }`,
hard `{ hp: 1.4, damage: 1.2 }` as the Inferno's). The other way would be for each map to get harder with the number
already beaten, so order never matters. That makes records unfair between players, so it's an open question rather
than the plan.

**What a map gives.**

| Map               | For beating it                                                                    | For a task on it                                                    |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Stranglewood      | Awakened Vardorvis, Overgrown Lumbridge, the Forester, the Executioner's axe head |                                                                     |
| Lassar Undercity  | Awakened Whisperer, Shadow Barrows, the Shadow walker, the Siren's staff          | The Treasure hunter (open 5 caskets in the Shadow Realm in one run) |
| Ghorrock          | Awakened Duke Sucellus, Frozen Wilderness, the Snow ranger, the Eye of the Duke   |                                                                     |
| The Scar          | Awakened Leviathan, Dark Karamja, the Lantern-bearer, the Leviathan's lure        |                                                                     |
| Each Awakened     | Its pet (the first win always), an Awakener's orb                                 |                                                                     |
| All four maps     | The Soulreaper axe (its four pieces), Awakened invasions                          |                                                                     |
| All four Awakened | The act's ending, and the weekly Vault                                            |                                                                     |

The pieces are trophies (`trophies.ts`), shown in a new Collection log tab, the Fallen Empire: Executioner's axe head
28319, Siren's staff 28323, Eye of the Duke 28321, Leviathan's lure 28325.

**Save.** New optional fields only (`remixVictories`, `awakenerOrbs`, `invasions`, relic picks), so no
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

- Roots are the Stranglewood's own: the Tendril ground locs (48495 to 48502) and Strangled Plant (48545 to 48551),
  drawn by the game as an instanced layer over the ground (as `FloorView` draws floor tiles), not baked into the map.
- A tile about to take root shows sprouts first (the small Tendril models, 1.5 s), then the roots rise in code (lifted
  and settled, `rise: "code"`). The sprouts are the warning. Nothing is painted.
- A cut snaps the roots down and back into the ground with a puff of leaves. A kill's clearing is a ring of the same.
- A root heart is the Large Tendril (NPC 12225, size 3, idle 10363), roots reaching out from it. While it lives, its
  roots pulse.
- On roots your character's legs are wrapped (a Tendril model at the feet) and the walk slows. The hurt is the game's
  usual red hitsplats.

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

Beating it: the Forester (8.5), Overgrown Lumbridge (8.3), the Awakened Vardorvis fight and the Executioner's axe head.

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
| Co-op           | The party goes together: the first into a puddle pulls everyone in after 1.5 s (open question 2)                                  |

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

Beating it: the Shadow walker, Shadow Barrows, the Awakened Whisperer and the Siren's staff. The task (open 5 caskets
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
alone (brightness, wash and enemies), which is what Shadow Barrows uses anyway.

### 4.10 Phones

The city is heavy: 3,000 to 3,600 locs in each of its middle squares (40,99 and 41,100). Only one world is drawn at a
time, so the twin costs memory, not triangles. Measure the busiest street and the cathedral's forecourt first. If they're
over budget, the realm's tentacles are the first thing to cut (each is a few hundred triangles).

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
grid, painted from the recipe. The ice is drawn by the map's own ice overlay, not floor tiles. Frozen Wilderness needs
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

Beating it: the Snow ranger, Frozen Wilderness, the Awakened Duke and the Eye of the Duke.

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

Beating it: the Lantern-bearer, Dark Karamja, the Awakened Leviathan and the Leviathan's lure.

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

About two weeks for the lighting, and three for the map. It's the riskiest piece in the act, so it's built last, but
**spiked first**: a day's prototype, before Stranglewood is done, using the fog the shaders already have
(`fogFactorLinear` with a near end and a black sky) to see whether a dark map reads from the play camera at all. If
it doesn't read, the Scar's rule becomes "the dark is a look, not a rule" (brightness 0.45 and lanterns as a damage
power-up). That's weaker, and the decision is Dynny's.

A plus: what's in the dark needn't be drawn in detail. Culling the scene past the lights' reach could make the Scar
one of the cheapest maps on a phone.

## 7. The finale: the Awakened

### 7.1 Four separate fights, not a gauntlet

**Decision: four boss fights, each on its own, each opened by beating its Act II map.** The act ends when all four are
down, and the fourth plays the ending.

Why not a gauntlet (the four in a row in one run):

- **Tuning.** Zachariah took ten rounds to tune one fight. In a gauntlet each fight's tuning moves the others: a death
  at the fourth boss throws away fifteen minutes, so every fight has to be easy enough not to waste that, and none of
  them gets to be hard.
- **Retry.** A boss fight's results have Retry. A gauntlet's Retry is the whole thing again, or checkpoints, which is
  four fights anyway.
- **Kits.** Each fight is built round one adventurer's kit and its button, as Zachariah's Smite and the Colossus's
  Shatter are. A gauntlet would need one kit for four bosses, or kits swapped mid-run.
- **Build order.** Four fights ship one per pull request, each playable the day it's merged. A gauntlet ships
  nothing until all four exist.
- **Phones.** One arena loaded at a time.
- **OSRS does it this way.** The Awakened are separate fights there too, and the ornament kit goes to the fourth.

A gauntlet stays possible later as an extra for players who've beaten all four ("the Forgotten Four", one run,
checkpoints between bosses). It would reuse the four fights whole. That's open question 1.

### 7.2 The four fights, in brief

Each gets its own design doc before it's built, like the Colossus's. All four keep what Dynny said works in
Zachariah's: an attack about every 1.4 s by phase, the guard down on a miss (double damage), an arena that hurts
the boss, a button that rewards stepping in, the impacts, no item bar, Retry, the intro pan and a bar for each phase.
Each fight's kit is its map's adventurer, so you've met them.

| Fight                               | Arena                                                                                        | Kit and button                                                                                               | The idea                                                                                                                                       | Pet                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Awakened Vardorvis (12223, 784)     | His clearing, a ring of the floor system's tiles skinned as roots, the wood round it         | The Forester, a 2h sword; **Chop** clears the roots round you                                                | The ring of roots closes phase by phase; his vines erupt from root tiles; cut a lane, and his dart across cut ground stumbles him (guard down) | Butch (12158)       |
| Awakened Whisperer (12204, 791)     | Her cathedral's forecourt (41,99) and its realm twin (37,99)                                 | The Shadow walker, Shadow Burst; **Blackstone** flips you between worlds                                     | She can only be hurt in the city; her Soul Siphon can only be stopped in the realm; sanity is the clock in there                               | Wisp (12157)        |
| Awakened Duke Sucellus (12191, 758) | His room in Ghorrock Prison, cut from the cache (47,100: 568 open tiles, a boss room's size) | The Snow ranger, a shortbow; **Kindle** lights the brazier you're beside                                     | Cold as in the map, compressed: braziers are the only warmth, his gaze puts out the ones not behind a pillar, his gas spits at the vent by you | Baron (12159)       |
| Awakened Leviathan (12214, 798)     | The Scar's pool (32,99)                                                                      | The Lantern-bearer; **Shadow** stuns it for 3 s (in OSRS shadow spells stun it), its back bared for big hits | The dark, the debris that's your only cover, the pathfinder's circle in the last phase                                                         | Lil'viathan (12160) |

Their hard modes are what a hard mode always is, and each Awakened win gives an Awakener's orb (8.6).

## 8. Rewards

### 8.1 What's out

The Ancient sceptres and the vestige rings are out of Act II. The game already has an Ancient sceptre passive and the
vestige rings as gear (`items.ts`), and nothing changes there. No new stat items: every reward below changes what a
run is like, not its numbers.

### 8.2 The Soulreaper axe

A Rare melee class weapon (object 28338). It's made the OSRS way, from four pieces, one from each Act II final boss
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

Beating an Act II map opens its rule on an earlier map, as a switch on that map's card beside Hard and Endless.

| Remix               | Rule from        | Why that map                                                            | What else changes                                                                                                                                                                           |
| ------------------- | ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overgrown Lumbridge | Stranglewood     | Fields, the swamp and Draynor's woods to creep over                     | Roots creep at 0.7 times the speed (an early, bigger arena); Strangled join from 3:00; Count Draynor's bats nest in the root hearts                                                         |
| Shadow Barrows      | Lassar Undercity | The Barrows' crypts and Mort'ton's shades already belong in shadow      | No twin squares exist here, so the realm is the palette (brightness 0.55, a violet wash) and its enemies; the brothers come out in the realm                                                |
| Frozen Wilderness   | Ghorrock         | Ghorrock is in the Wilderness                                           | Ice on the Wilderness's water and the Bone Yard's paths (the effect mask), six braziers placed round the arena, ice warriors and spiders join; the King Black Dragon's ice breath adds cold |
| Dark Karamja        | The Scar         | The volcano's glow and the jungle's fires make lights that belong there | Lava (the volcano's own) is a light; TzHaar glow as light leeches do                                                                                                                        |

- **Records of their own**: wins, best time, endless best, a tick and a gold tick for hard, kept apart from the map's
  (`remixVictories`, keyed `mapId:remix`).
- **One remix at a time.** Remixes stack with Hard and Endless, but not with each other (two at once is an invocation,
  section 9).
- **Coins**: 30% more, as a remix is harder. Quests count as they do on the map.
- **What it changes for someone who's bought everything**: four old maps that play differently, with records to beat,
  made from the rules the act already built.

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
3. **The weekly Vault.** A seeded run that's the same for everyone each week (its seed from the ISO week): a map, a
   remix and an adventurer picked by the seed, with a best time and kills kept per week. Co-op parties get the same
   seed. The sim is deterministic already, so this is mostly a screen. **What it changes**: one fixed challenge, new
   each week, that can be compared with friends.

The act's ending is the last: the middle card's story, told when the fourth Awakened falls.

## 9. Optional: Invocations and Relics

Dynny hasn't said yes or no to these. They're separate from everything above, so either can be dropped without
touching the rest.

### 9.1 Invocations

The Tombs of Amascut's: opt-in handicaps on any map from the Desert on, picked on the map's card, each worth points.
The run's coins are +1.5% a point, and badges go on the card at 100, 200 and 300 points.

| Invocation      | Points | What                                                       |
| --------------- | ------ | ---------------------------------------------------------- |
| Walk the path   | 10     | Enemies 15% faster                                         |
| Upset stomach   | 15     | No food drops, and the Sandwich lady doesn't come          |
| Overly draining | 10     | No rerolls and no banishes                                 |
| Glass cannon    | 20     | Half your hitpoints                                        |
| Hardcore        | 15     | No Ring of life, no getting back up                        |
| Feeling special | 10     | Bosses enrage at 75%, not 50%                              |
| Aerial assault  | 15     | Bosses' patterns half as many bullets again                |
| Ancient haste   | 10     | The run's clock 25% faster: the final boss at 12:00        |
| Double remix    | 25     | A second remix's rule at once (on a map that has two open) |

Open question: whether hard mode becomes a preset of these. That would be tidier, and would change every map's hard
records.

### 9.2 Relics

Leagues-style: each Act II map beaten opens the next relic tier. One relic is picked per tier on the adventurer screen
and stays picked across runs until changed.

| Tier | Relics                                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Endless harvest**: bones within 10 tiles fly to you every 20 s. **Production prodigy**: caskets never pause the run, their items decided by the auto rules, alched for 25% more. **Trickster**: every 15 s the next hit on you misses |
| 2    | **Globetrotter**: power-ups drop 20% more often and wait twice as long. **Banker's note**: coins come to you from anywhere. **Fairy's flight**: 10% faster, and once every 10 s you push through a crowd                                |
| 3    | **Bloodthirsty**: every 50 kills heal 5%. **Specialist**: one weapon slot fewer, the others 25% harder. **Grimoire**: start with a second weapon, a Common of your class                                                                |
| 4    | **Last recall**: once a run, falling takes you back to the spawn with half your hitpoints, and everything near you is stunned. **Reloaded**: two level-up offers kept for later, each once                                              |

Honestly: these sit close to the existing passives and the shop, and they make everything easier, which the game's
late maps don't need. They're the part of this doc most likely to be cut, or kept off hard mode and remixes.

## 10. Build order

One map per pull request, Stranglewood first. Each map's pull request has its sims (`MAP=x`), its phone numbers and
its cache additions listed.

| #   | Pull request                                                                                              | Needs      | Rough size  |
| --- | --------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| 0   | The Scar's lighting spike: a day, a dev map, screenshots from the play camera. Not merged; it decides 6.8 | -          | 1 day       |
| 1   | **Stranglewood**, with the act's screen, `act.requires`, `RunRuleDef`, roots, the Forester                | -          | 3 weeks     |
| 2   | Overgrown Lumbridge: the first remix, which proves the rules are map-agnostic                             | 1          | 3 days      |
| 3   | **Lassar Undercity**: the twin, layers, sanity, souls, the Shadow walker and the Treasure hunter          | 1          | 2.5 weeks   |
| 4   | Shadow Barrows                                                                                            | 3          | 3 days      |
| 5   | **Ghorrock**: the ScapeRune map, the effect mask, cold, braziers, vents, the Snow ranger                  | 1          | 3 weeks     |
| 6   | Frozen Wilderness                                                                                         | 5          | 3 days      |
| 7   | **The Scar**: lighting, lights, aiming in the light, the Lantern-bearer                                   | 1, spike 0 | 3 weeks     |
| 8   | Dark Karamja, and the Soulreaper axe (all four pieces now exist)                                          | 7          | 1 week      |
| 9   | Awakened Vardorvis, with fighting pets (Butch first), and its design doc                                  | 1          | 2 weeks     |
| 10  | Awakened Whisperer, Wisp                                                                                  | 3, 9       | 2 weeks     |
| 11  | Awakened Duke Sucellus, Baron                                                                             | 5, 9       | 2 weeks     |
| 12  | Awakened Leviathan, Lil'viathan, the act's ending                                                         | 7, 9       | 2 weeks     |
| 13  | Awakened invasions, Awakener's orbs, the weekly Vault                                                     | 12         | 1.5 weeks   |
| 14  | Optional: Invocations, then Relics                                                                        | -          | 1 week each |

The Awakened fights can go any time after their map, so fight 9 could follow map 1 if Dynny would rather play a boss
early. The sizes are reasoned from the code, not prototyped, and leave out playtest rounds: Zachariah took ten.

## 11. Engine work in one place

| Piece                         | New or reuse                                               | Used by                                  |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Act screen, `act.requires`    | New                                                        | All                                      |
| `RunRuleDef` on `MapDef`      | New, sim-side, map-agnostic                                | All four maps, remixes, invasions        |
| Effect mask (any map's tiles) | New; reuses the floor's effects and `PlayerMovement`'s ice | Roots, Ghorrock's ice, Frozen Wilderness |
| Instanced ground layer        | Reuses `FloorView`'s instancing and code rise              | Roots                                    |
| Twin terrain (`MapDef.twin`)  | New, client only                                           | Lassar, its Awakened fight               |
| Layers in the sim             | New: enemies, drops and pickups carry a layer              | Lassar                                   |
| Per-hero meters on the HUD    | New (sanity, cold)                                         | Lassar, Ghorrock, their remixes          |
| Drawn, changeable locs        | Reuses the fight view's statues                            | Braziers                                 |
| Lights                        | New, in four shaders and the sim                           | The Scar, Dark Karamja, the Leviathan    |
| Fighting pets                 | Reuses thralls                                             | Pets                                     |
| `CharacterDef.trait`          | New                                                        | Adventurers                              |
| Brightness and wash           | Reuse (the Theatre's halls)                                | Lassar, Shadow Barrows                   |
| Boss attacks                  | Reuse `BossAttackDef` and `ImpactDef`                      | Every boss                               |

## 12. Changed from the pitch, and why

- **No blood captors.** No NPC by that name is in the cache. The root-clearing elite is a **root heart**, the
  Stranglewood's Large Tendril (12225), and the Strangled Bear lays roots instead.
- **Ghorrock is built, not cut.** The prison's open ground is corridors (2,985 tiles at most) and the Duke's room is
  568, so the yard is a ScapeRune map with the prison's kit. The Duke's room is kept for his Awakened fight.
- **Lassar is the real Shadow Realm**, not a palette swap: the cache has the realm as a twin of the city (4.1). The
  palette version is what Shadow Barrows uses.
- **The Scar is a smaller arena** (2 by 2 squares): half its cached squares are filler.
- **Rewards**: the Ancient sceptres and vestige rings are out. In: Remixes, fighting pets, adventurers with traits,
  invasions, orbs and the Vault. The Soulreaper axe stays, made from four pieces.
- **Adventurers renamed**: the pitch's Archaeologist, Treasure hunter, Shadow walker and Awakened slayer are now the
  Forester, Shadow walker, Treasure hunter, Snow ranger and Lantern-bearer, one or two a map, so each map has its own.
- **The Voyage** (the pitch's wildcard) isn't in this act.

## 13. Open questions for Dynny

1. **The finale**: four separate fights (recommended, 7.1), with a gauntlet as a later extra, or not at all?
2. **Lassar in co-op**: the whole party flips together (simple, recommended), or each player on their own (better,
   but every spatial query in the sim learns a layer, as `map-depth.md` warned for planes)?
3. **The Scar's lighting**: about two weeks of renderer work. Spike it first and decide on what it looks like, or go
   straight to the fallback (dark as a look only)?
4. **Ghorrock as a ScapeRune map**: fine, or would you rather it be the cramped real prison?
5. **How hard**: all four maps the same (recommended), or harder the more of them you've beaten?
6. **Pets**: always on the first Awakened win (recommended: they're a feature now), or 1 in 10 like the Dark squirrel?
7. **Fight kits**: is each Awakened fight played as its map's adventurer (recommended), or a kit made for the fight,
   as the Inquisitor and the Saradominist were?
8. **Remixes**: one at a time (recommended), with hard and endless, and records of their own?
9. **Invocations and Relics**: in, out, or later? And if invocations are in, should hard mode become a preset of them?
10. **The Soulreaper axe**: melee only (recommended), or a weapon any class can be offered?

## 14. Not verified

- How any of the four cuts looks from the play camera, or what it costs a phone: nothing here was drawn.
- The spot animations for Vardorvis's axes and vines, the puddle's ripple, the gas vents and the Soulreaper spin:
  each pull request looks them up.
- Which brazier id reads as lit (48122 or 48901).
- Whether the Scar's filler squares draw a floor.
- Root growth's numbers against the bot, and every other number here.
- The music tracks' assignments are from the OSRS Wiki's pages ("Blood Rush", "Song of the Silent Choir" and "Eye See
  You" checked there; the area tracks from the areas' pages). Their recordings aren't in `src/media/music` yet.
