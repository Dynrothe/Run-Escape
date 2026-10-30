---
paths:
    - "src/game/content/**"
    - "src/game/core/**"
---

# Adding content

Content is plain data in `src/game/content/`, typed in `types.ts`, and the comments there explain
each field. Find a similar entry, copy its shape, and look up real ids in the cache:

```sh
npx tsx scripts/cache/find-objs.ts "dinh's bulwark"      # items
npx tsx scripts/cache/find-npcs.ts "^count draynor$"     # NPCs and their idle and walk animations
npx tsx scripts/cache/find-npc-seqs.ts 655               # animations an NPC's model can play
npx tsx scripts/cache/classify-npc-seqs.ts 655 6182 6183 # tell attack and death animations apart
npx tsx scripts/cache/find-locs.ts multicannon           # scenery
npx tsx scripts/cache/sounds.ts seqs 390                 # sounds an animation plays
```

Attack sounds aren't in the cache: the ids come from the OSRS Wiki's list of in-game sound IDs.

Whatever you add, follow the checklist in `CLAUDE.md`: tests, simulations, changelog and docs, and
say in the pull request if it uses anything new from the cache. `docs/GAMEPLAY.md` lists most
content, so add new entries to its tables and lists.

## Weapon

Add it to `WEAPONS` in `weapons.ts`.

- `kind` decides how it attacks and what each level's numbers mean: `slash`, `sweep`, `missile`,
  `knives`, `axes`, `aura`, `strike` or `orbit`. The `fire*` methods in `Sim.ts` do the work, and
  `statFields` in `weaponStats.ts` lists the stats each kind shows.
- `style` makes it a class weapon, only offered to adventurers who fight that way. Set
  `damageStyle` only for exceptions (see its comment).
- `unlock` brings it in through a task on a map. Without one it's there from the start.
- `evolution` needs a passive, and the weapon it becomes needs `evolved: true`, `evolvedLevels` for
  its 3 levels, and `style`/`family` kept from what it evolves from. Recipes in `evolutions.ts` and
  the Collection log come from these fields, so they need no extra entry.
- A `sweep` with `arc: Math.PI` hits all the way round. `special` replaces every so many swings of
  a slash or sweep, and `special.aoe` hits all round.
- Every other level of a slash or sweep adds knockback automatically, from the loop after
  `WEAPONS`. Don't add those steps by hand.
- A swoosh colour goes in `SLASH_COLORS` in `client/GameView.ts`.
- Check the player's animation (`playerSeq`) in the browser. A seq id existing doesn't mean it
  suits the weapon.

## Passive

Add it to `PASSIVES` in `passives.ts`. `perLevel` is what a Common pick adds, and `alsoAdds` puts
the same amount on more stats. `iconSpriteId` shows an interface sprite instead of the item.

## Stat

Add the key to `StatKey` and `emptyStats` in `types.ts`, and to `STAT_INFO` in `stats.ts`.
TypeScript points out what's missing. A stat does nothing until `Sim.ts` reads it, from `this.stats`
(everything added up) or `this.metaStats` (the shop's alone, and set before the constructor adds the
starting weapon).

## Shop upgrade

Add it to `SHOP_UPGRADES` in `shop.ts`, themed as an OSRS skill, with its `stat`. Costs and
refunds come from `getUpgradeCost` and the save code. New ones don't need a save migration.

## Gear and utility items

`items.ts`: gear goes in `CASKET_GEAR`, and utility items in `UTILITY`. `armoury.ts` says what each
piece upgrades into, and `sets.ts` has the set bonuses. Run `scripts/cache/check-items.ts` afterwards.

## Enemy or boss

Add it to `ENEMIES` in `enemies.ts` (fun map ones go in `fun/enemies.ts`), with its NPC id,
animations, sounds and stats. Tests check that every enemy a map or boss refers to exists, and
that every boss attacks.

## Map

Add it to `MAPS` in `maps.ts` (fun maps go in `fun/maps.ts`), with its waves in `waves.ts`.

- `arena` is in world tiles and is what collision is built for. `spawn` must be inside it.
- Set `plane` for dungeons above the ground floor.
- Campaign maps unlock in the order of `MAPS`. Rewards come from `unlock` tasks on weapons,
  passives, items and adventurers.
- Check it in the browser: the minimap, the spawn, and that enemies can reach you. The sim's bot
  uses the real collision, so a sim also shows whether a map plays at all.
- Fun maps don't count towards quests.

## Adventurer

Add it to `CHARACTERS` in `characters.ts`, with a `style`, `startingWeapon`, `equipment`, `bonus`
and usually an `unlock` task.

## Quest

Add it to `quests.ts`. Tests check every quest can be done, so its enemy ids must exist.
