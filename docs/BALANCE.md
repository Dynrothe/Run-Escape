# Damage and co-op balance

Edit [`src/game/content/balance.ts`](../src/game/content/balance.ts) to tune weapon damage and
co-op enemy/reward scaling. Currently, `global.evolved: 0.5` gives **all evolutions 50% less damage**
across every class and run mode. Base weapons and co-op enemy/reward scaling keep their existing
balance. Set `global.evolved` back to `1` to restore evolutions' original damage.
These are developer settings shipped with the game, not player options. Restart
the run after changing them; every co-op player must use the same build.

## Weapon damage

`WEAPON_DAMAGE_BALANCE` applies to all maps, including Hallowed Night, and to endless runs.
The three styles are `melee`, `ranged` (range), and `magic` (wizard). A weapon uses its own damage
style, regardless of which adventurer carries it. Shared weapons follow `getWeaponStyle` in
`weapons.ts`. An evolution means a weapon with `evolved: true`, at any of its levels.

| Multiplier | Result                     |
| ---------- | -------------------------- |
| `1`        | Unchanged                  |
| `0.6`      | 40% less damage            |
| `1.2`      | 20% more damage            |
| `0`        | No damage from that weapon |

Every scope accepts the same profile:

```ts
{
    all: 1,                        // Every weapon
    base: 1,                       // Unevolved weapons only
    evolved: 1,                    // Every evolution
    styles: {
        melee: { all: 1, base: 1, evolved: 1 },
        ranged: { all: 1, base: 1, evolved: 1 },
        magic: { all: 1, base: 1, evolved: 1 },
    },
    weapons: { abyssal_whip: 1 },   // Optional individual weapon ids
}
```

Omit anything you aren't changing: `{}` means no adjustment. Use finite, nonnegative numbers.
Individual weapon entries use exact ids from `weapons.ts`; an evolution has its own id, so a
base weapon's individual adjustment doesn't automatically carry over when it evolves.

Choose the scope for the change:

| Location inside `WEAPON_DAMAGE_BALANCE` | Applies to                        |
| --------------------------------------- | --------------------------------- |
| `global`                                | Every run                         |
| `difficulty.normal` / `difficulty.hard` | That difficulty in solo and co-op |
| `playMode.solo` / `playMode.coop`       | That play mode in normal and hard |
| `modes.solo.normal` / `modes.solo.hard` | One solo difficulty               |
| `modes.coop.normal` / `modes.coop.hard` | One co-op difficulty              |
| `partySize[1]` through `partySize[4]`   | That starting party size          |

**Matching multipliers multiply; more specific entries don't replace broader ones.** The result is
`global × difficulty × playMode × mode/difficulty combination × partySize`. Within each profile,
`all × base-or-evolved × style.all × style.base-or-evolved × individual-weapon` applies.

### Examples

These examples start from neutral profiles: set `global.evolved` back to `1` and clear any other
adjustments first. Leaving the current `0.5` in place multiplies each example's evolution damage
by another `0.5` (for example, `0.5 × 0.6 = 0.3`, or 70% less than the original damage).

For **40% less damage from all magic evolutions**, change `evolved` under
`global.styles.magic` from `1` to `0.6`. Base magic weapons and the other styles keep their damage.

For that nerf **only in hard co-op**, leave the global values at `1` and replace the empty profile at
`modes.coop.hard` with:

```ts
{
    styles: {
        magic: {
            evolved: 0.6;
        }
    }
}
```

For **20% less damage from every evolution in either co-op difficulty**, set `playMode.coop` to:

```ts
{
    evolved: 0.8;
}
```

With both of those rules, magic evolutions in hard co-op deal `0.8 × 0.6 = 0.48` of their original
damage (52% less). Other co-op evolutions deal `0.8`; solo runs remain at `1`.

For **an extra 10% reduction to ranged weapons in four-player parties**, set `partySize[4]` to:

```ts
{
    styles: {
        ranged: {
            all: 0.9;
        }
    }
}
```

For **15% less damage from just the Abyssal whip everywhere**, add `abyssal_whip: 0.85` to
`global.weapons`. It also multiplies any matching melee/evolution rules.

### What damage tuning covers

The sim resolves the multipliers at the start of the run and applies them once when weapon damage
lands. This includes direct hits, special attacks, delayed hits, bonus boss hits, chains, split
shots, splash, venom, burns, and HP-based bolt damage. Delayed attacks keep their original weapon's
identity even if the owner evolves it. Overlapping damage-over-time effects compare their tuned
strength when their multipliers differ.

Existing Might, style bonuses, rarity, gear, overlevels and target modifiers still apply. Damage
rounds per hit and positive hits keep the minimum of 1; a zero multiplier deals no damage. Healing
based on damage dealt follows the adjusted damage. Items, power-ups and recoil use their own rules.
The damage meter and results count adjusted damage; weapon stat cards still show the weapon's
level values, before run-specific modifiers.

These are **damage controls**, not attack-speed controls. A `0.6` multiplier scales damage per hit;
measured DPS also depends on rounding, enemies in range, overkill, cooldowns and effects. To change
a weapon's attack rate, projectile count, area or duration, edit its levels in `weapons.ts`.

Co-op weapon rules use the **starting party size**, so a player going down or leaving doesn't
switch the survivors to solo damage or change their weapon multiplier.

## Co-op enemies and rewards

`COOP_BALANCE`, in the same file, controls the existing co-op scaling independently of outgoing
weapon damage. For each field, the multiplier is `1 + perExtraPlayer[field] × extraPlayers`.

| Field     | Controls                       |
| --------- | ------------------------------ |
| `crowd`   | Wave spawn rate and population |
| `hp`      | Ordinary enemy hitpoints       |
| `bossHp`  | Boss hitpoints                 |
| `damage`  | Enemy damage to players        |
| `xp`      | Experience per bone            |
| `caskets` | Enemy casket drop chance       |

For example, `hp: 0.5` means 1.5× enemy HP with two players and 2.5× with four. `xp: -0.12`
reduces XP per bone to compensate for the extra crowd. The sim also adjusts XP when its enemy cap
prevents the full crowd from spawning.

Unlike weapon tuning, enemy scaling is recalculated when someone goes down or leaves. Each of
those players still counts as `playerGone` (currently `0.5`). Changing outgoing damage does not
automatically change enemy HP or rewards.

Hard mode's enemy multipliers remain in [`hard.ts`](../src/game/content/hard.ts) and each map's
`hard` settings in `maps.ts` / `fun/maps.ts`. Normal map difficulty and waves stay in those content
files; endless round scaling stays in `endless.ts`. They combine with co-op scaling as before.

## Checking a balance change

Run the tests and TypeScript check, then follow the simulation guidance in `CLAUDE.md`. Compare
the same seeds, maps, adventurers and upgrades before and after. Include solo, two-player and
four-player runs and both difficulties when tuning across them. Test all three styles when
comparing class damage, and examine wins as well as DPS. The bot's performance isn't a substitute
for playing the change, especially for strike weapons and co-op teamwork.
