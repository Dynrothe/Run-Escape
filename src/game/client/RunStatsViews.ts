import { getCharacter } from "../content/characters";
import { DAMAGE_KINDS } from "../content/damageKinds";
import { upgradedName } from "../content/endless";
import { ENEMY_BY_ID, getEnemy } from "../content/enemies";
import { getItem } from "../content/items";
import { getPowerUp } from "../content/powerups";
import { RARITIES } from "../content/rarity";
import { getWeapon } from "../content/weapons";
import { RunStats, Sim } from "../core/Sim";
import { DamageSource } from "../core/entities";
import {
    BossKillView,
    CombatView,
    DamageKindView,
    DamageView,
    KillView,
    PlayerResultView,
} from "./GameStore";
import { getRevivesView, getWeaponAbout } from "./LoadoutViews";

// One colour for each place in the party, the same on every client (and in every chart)
export const PLAYER_COLORS = ["#4fc3f7", "#ff8a65", "#aed581", "#ba68c8"];

export function playerColor(index: number): string {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

export function getPlayerResultViews(sim: Sim): PlayerResultView[] {
    return sim.heroes.map((hero) =>
        sim.as(hero.index, () => {
            const stats = sim.getRunStats();
            return {
                name: hero.name,
                characterName: getCharacter(hero.characterId).name,
                isLocal: hero.index === sim.focus,
                down: hero.down,
                left: hero.left,
                kills: stats.sources.reduce((total, source) => total + source.kills, 0),
                damageDealt: stats.sources.reduce((total, source) => total + source.damage, 0),
                caskets: hero.casketsOpened,
                highestHit: stats.highestHit,
                damageTaken: stats.damageTaken,
                healed: stats.healed,
                rerollsUsed: stats.rerollsUsed,
                skips: stats.skips,
                // Weapon names and tiers come from this hero's own loadout
                damage: getDamageViews(sim, stats),
                kinds: getDamageKindViews(stats),
                killsByEnemy: getKillViews(stats),
                revivesGiven: hero.revivesGiven,
                timesDowned: hero.timesDowned,
                bossDamage: hero.bossDamage,
                aliveSeconds: sim.aliveSeconds(hero),
                index: hero.index,
                color: playerColor(hero.index),
            };
        }),
    );
}

// The stats screen's rows: what dealt the run's damage, most first, by the
// names and icons the player knows them by (a weapon by its tier at the end). about: each weapon's
// tooltip too, for the pause menu's Combat tab.
export function getDamageViews(sim: Sim, stats: RunStats, about = false): DamageView[] {
    return stats.sources.map(({ source, damage, kills, seconds }) => {
        const [kind, id] = source.split(":");
        return {
            ...describeSource(sim, source),
            damage,
            kills,
            ...(seconds !== undefined && seconds > 0 && { perSecond: damage / seconds }),
            ...(about && kind === "weapon" && { about: getWeaponAbout(sim, id) }),
        };
    });
}

// The run's damage by its kind, most first, leaving out kinds that did nothing
export function getDamageKindViews(stats: RunStats): DamageKindView[] {
    return DAMAGE_KINDS.map((kind) => ({ kind, damage: stats.damageByKind[kind] ?? 0 }))
        .filter((view) => view.damage > 0)
        .sort((a, b) => b.damage - a.damage);
}

// Kills by enemy, most first (bosses first among the same), leaving out ids no longer in the game
export function getKillViews(stats: RunStats): KillView[] {
    return Object.entries(stats.killsByEnemy)
        .filter(([enemyId, kills]) => kills > 0 && ENEMY_BY_ID.has(enemyId))
        .map(([enemyId, kills]) => ({
            enemyId,
            kills,
            boss: getEnemy(enemyId).boss !== undefined,
        }))
        .sort((a, b) => b.kills - a.kills || Number(b.boss) - Number(a.boss));
}

// The current hero's damage and kills so far, for the pause menu's Combat tab
export function getCombatView(sim: Sim): CombatView {
    const stats = sim.getRunStats();
    return {
        damageDealt: stats.sources.reduce((total, source) => total + source.damage, 0),
        damageTaken: stats.damageTaken,
        damageBlocked: stats.damageBlocked,
        healed: stats.healed,
        highestHit: stats.highestHit,
        revives: getRevivesView(sim),
        kinds: getDamageKindViews(stats),
        sources: getDamageViews(sim, stats, true),
        kills: getKillViews(stats),
    };
}

export function getBossKillViews(stats: RunStats): BossKillView[] {
    return stats.bossKills.map(({ enemyId, seconds }) => ({
        name: getEnemy(enemyId).name,
        seconds,
    }));
}

function describeSource(
    sim: Sim,
    source: DamageSource,
): { name: string; iconObjId?: number; iconSpriteId?: number; color?: string } {
    const [kind, id] = source.split(":");
    switch (kind) {
        case "weapon": {
            const def = getWeapon(id);
            const owned = sim.weapons.find((w) => w.def.id === id);
            // The tier it ended on, or the weapon's own name if it's gone
            // (evolved, or a godsword's blade before its hilt)
            const last = def.levels.length;
            const level = owned ? def.levels[Math.min(owned.level, last) - 1] : undefined;
            return {
                name: owned ? upgradedName(level?.name ?? def.name, owned.level - last) : def.name,
                iconObjId: level?.objId ?? def.iconObjId,
                color: RARITIES[def.rarity].color,
            };
        }
        case "item": {
            const item = getItem(id);
            return { name: item.name, iconObjId: item.objId, color: RARITIES[item.rarity].color };
        }
        case "powerUp": {
            const powerUp = getPowerUp(id);
            return { name: powerUp.name, iconObjId: powerUp.objId };
        }
        case "recoil":
            return { name: "Recoil", iconObjId: getItem("ring_of_recoil").objId };
        default:
            return { name: "Other" };
    }
}
