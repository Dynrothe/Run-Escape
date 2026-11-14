import { tl, tr } from "../i18n";
import { CASKET_GEAR, UTILITY } from "./items";
import { PASSIVES } from "./passives";
import { SHOP_UPGRADES } from "./shop";
import { STAT_INFO } from "./stats";
import { StatKey } from "./types";

// What a number on the pause menu means, for the tooltip on it: the plain meaning and what it does
// the moment you have it (`what`), how it's worked out (`calc`), where more comes from (`from`) and
// how far past its base it is (`power`). Written to be read at a glance, with a smile.
export type About = { what: string; calc?: string; from?: string; power?: string };

type Lore = { what: string; calc?: string };

// What each of the hero's stats means. A stat with no `calc` of its own says how percentages or
// flat amounts add up (CALC below).
const STAT_LORE: Record<StatKey, Lore> = {
    might: {
        what: "Every hit you land is multiplied by this, straight away, for every weapon you carry. The bigger it gets, the shorter goblins' lives.",
    },
    meleeMight: {
        what: "Extra damage for melee weapons only. Swords and spears, this one's yours.",
    },
    rangedMight: { what: "Extra damage for bows, crossbows and anything thrown. Aim true." },
    magicMight: { what: "Extra damage for spells and staffs only. A wizard's favourite number." },
    bossMight: { what: "Extra damage against bosses only, so the big ones stop feeling so big." },
    levelMight: {
        what: "Damage that grows with every level you gain. Survive longer, hit harder.",
        calc: "Each hero level adds this much damage, for the first 40 levels.",
    },
    armor: {
        what: "Armour stops this much damage from every hit you take, so small hits can't hurt you at all.",
        calc: "Taken off each hit, in flat damage. Some attacks ignore it.",
    },
    maxHp: {
        what: "Your hitpoints. Each point is a mistake you're allowed to make.",
        calc: "The hero starts with 25, and this percentage is added on top.",
    },
    regen: {
        what: "Hitpoints you win back every minute without eating anything. Slow, steady and very smug.",
        calc: "Spread evenly over the minute, so you heal a little all the time.",
    },
    cooldown: {
        what: "Weapon speed: every weapon waits less between attacks, so everything swings sooner.",
        calc: "Shortens each weapon's wait by this much. It stops helping at 60%.",
    },
    area: {
        what: "Makes your attacks bigger: reach, radius, splash. More swing, more enemies per swing.",
    },
    auraArea: { what: "Extra size for aura attacks only. The ring around you grows teeth." },
    speed: { what: "How fast your projectiles fly. Shots land before the enemy knows it." },
    duration: {
        what: "Your effects last longer: venom, burning, freezes, orbiting runes and the like.",
    },
    amount: {
        what: "Extra projectiles on every weapon that fires them. One more arrow is a lot more arrow.",
        calc: "Added to each weapon's own number of projectiles.",
    },
    moveSpeed: { what: "How fast you run. Marvellous for kiting, rude for chasers." },
    magnet: {
        what: "How far loot is pulled to you: bones, coins, experience. Lazy-collector mode.",
    },
    luck: {
        what: "Better odds on food and caskets, and rarer picks on level ups. Fortune has noticed you.",
        calc: "Multiplies the chance of a drop and of a rarer pick.",
    },
    growth: { what: "Everything you kill is worth more experience, so levels come sooner." },
    greed: { what: "Coins you find are worth more, and coins are the ones you keep." },
    revival: {
        what: "Extra lives. When you'd fall you get up again with some hitpoints instead. Respect the second chance.",
    },
    reroll: { what: "Rerolls: don't like the picks on a level up? Shuffle them." },
    banish: { what: "Banishes: cross a pick off for good, so it never turns up again this run." },
    thorns: {
        what: "Recoil: whatever hits you in melee takes this much damage back. Rude, but fair.",
        calc: "Dealt back to the enemy that hit you, per hit.",
    },
    healChance: {
        what: "A chance to heal a few hitpoints each time you hit something. Fighting as a way to eat.",
        calc: "Rolled on each hit, at most once a second.",
    },
    meleeKnockback: { what: "Melee hits push enemies back further. More personal space for you." },
    meleeSpeed: { what: "Melee weapons only: swing more often." },
    weaponSlots: { what: "How many weapons you can carry at once. More toys." },
    passiveSlots: { what: "How many passives you can carry at once." },
    powerUpRate: { what: "More power-ups fall from enemies. Free presents." },
};

const CALC = {
    percent: "Every source adds up, and the total scales the base: the base times (1 + the total).",
    flat: "Every source adds up as a flat amount.",
};

// What a weapon's own numbers mean, by the key of their label in WEAPON_STAT_MESSAGES
const WEAPON_LORE: Record<string, Lore> = {
    "weaponstat.damage": {
        what: "How hard each hit lands, before your damage stats multiply it.",
        calc: "Grows with the weapon's levels. Rarer picks also earn it a damage bonus.",
    },
    "weaponstat.attacks": {
        what: "How many times it fires a second.",
        calc: "One over the weapon's wait between attacks, which your weapon speed shortens.",
    },
    "weaponstat.knockback": {
        what: "How far a hit shoves enemies back. Keeps the crowd at arm's length.",
        calc: "Melee knockback stretches it for melee weapons.",
    },
    "weaponstat.projectiles": {
        what: "How many shots it fires at once.",
        calc: "Your projectiles stat adds more on top.",
    },
    "weaponstat.targets": {
        what: "How many enemies each cast picks out.",
        calc: "Your projectiles stat adds more.",
    },
    "weaponstat.pierces": { what: "How many enemies a shot passes through before it stops." },
    "weaponstat.venom": {
        what: "Poison damage every second on whatever it hits.",
        calc: "Keeps ticking for as long as the venom lasts.",
    },
    "weaponstat.venom_lasts": {
        what: "How long the venom keeps ticking.",
        calc: "Effect duration stretches it.",
    },
    "weaponstat.freezes_for": {
        what: "How long enemies stand frozen after it hits.",
        calc: "Effect duration stretches it.",
    },
    "weaponstat.burns_for": {
        what: "How long the ground burns where it lands.",
        calc: "Effect duration stretches it.",
    },
    "weaponstat.weakens_for": {
        what: "How long enemies stay weakened after it hits.",
        calc: "Effect duration stretches it.",
    },
    "weaponstat.sides": { what: "How many ways it swings: 2 is front and back." },
    "weaponstat.reach": {
        what: "How far in front of you it hits.",
        calc: "Your area stat stretches it.",
    },
    "weaponstat.arc": { what: "How wide the swing is. A wider arc catches more of the crowd." },
    "weaponstat.bounces": { what: "How many times a thrown axe ricochets to a new target." },
    "weaponstat.splash": {
        what: "How far the blast spreads round where a shot lands.",
        calc: "Your area stat stretches it.",
    },
    "weaponstat.speed": {
        what: "How fast its shots fly.",
        calc: "Your projectile speed stat adds to it.",
    },
    "weaponstat.radius": {
        what: "How big its area is.",
        calc: "Your area stat stretches it.",
    },
    "weaponstat.blast_radius": {
        what: "How big each blast is.",
        calc: "Your area stat stretches it.",
    },
    "weaponstat.lasts": {
        what: "How long its runes stay out before they're gone.",
        calc: "Effect duration stretches it.",
    },
    "weaponstat.spin_speed": { what: "How fast its runes circle you." },
};

const BONUS_LORE: Lore = {
    what: "Extra damage this weapon has earned. Every rarer pick you take on it adds a slice.",
    calc: "Added on top of its damage. Some is carried over from what it evolved from.",
};

// How far past its base a number is, in words ("verdict" is what the size of it says)
const VERDICTS: [number, string, string][] = [
    [0, "lore.verdict.none", "no better than a fresh start"],
    [0.25, "lore.verdict.small", "a pinch of spice"],
    [0.75, "lore.verdict.good", "properly above base"],
    [1.5, "lore.verdict.strong", "seriously strong"],
    [Infinity, "lore.verdict.huge", "absurdly strong"],
];

function verdict(over: number): string {
    if (over < 0) {
        return tr("lore.verdict.weak", "weaker than the base (ouch)");
    }
    const [, key, english] = VERDICTS.find(([most]) => over <= most) ?? VERDICTS[0];
    return tr(key, english);
}

function times(ratio: number): string {
    return String(Number(ratio.toFixed(2)));
}

// Where more of a stat comes from, read off the game's own lists: the passives that add to it, the
// pieces and potions that do, and the shop's skills
function sourcesOf(key: StatKey): string | undefined {
    const parts: string[] = [];
    const passives = PASSIVES.filter((p) => p.stat === key || p.alsoAdds?.includes(key));
    if (passives.length > 0) {
        const names = passives
            .slice(0, 3)
            .map((p) => tl(p.name))
            .join(", ");
        parts.push(
            tr("lore.from.passives", "passives ({names}{more})", {
                names,
                more: passives.length > 3 ? "…" : "",
            }),
        );
    }
    if (CASKET_GEAR.some((item) => item.stats[key])) {
        parts.push(tr("lore.from.gear", "worn gear"));
    }
    if (UTILITY.some((item) => item.use.kind === "buff" && item.use.stats[key])) {
        parts.push(tr("lore.from.potions", "potions"));
    }
    if (SHOP_UPGRADES.some((upgrade) => upgrade.stat === key)) {
        parts.push(tr("lore.from.shop", "the skill shop"));
    }
    return parts.length > 0
        ? tr("lore.from", "More from: {sources}.", { sources: parts.join(", ") })
        : undefined;
}

// What one of the hero's stats means and how it's worked out, with where more of it comes from and
// how far past the base it is. `value` is its size (0.2 is +20%); for max hitpoints `hpRatio` is the
// hitpoints over what the hero starts with.
export function statAbout(key: StatKey, value?: number, hpRatio?: number): About {
    const lore = STAT_LORE[key];
    const percent = STAT_INFO[key].unit === "percent";
    const about: About = {
        what: tr(`lore.stat.${key}.what`, lore.what),
        calc: lore.calc
            ? tr(`lore.stat.${key}.calc`, lore.calc)
            : tr(`lore.calc.${percent ? "percent" : "flat"}`, percent ? CALC.percent : CALC.flat),
        from: sourcesOf(key),
    };
    if (value === undefined) {
        return about;
    }
    // A chance isn't a multiplier of anything: it's just what it is
    const ratio =
        key === "maxHp" ? hpRatio : percent && key !== "healChance" ? 1 + value : undefined;
    if (ratio !== undefined) {
        about.power =
            Math.abs(ratio - 1) < 0.005
                ? tr("lore.power.base", "Right at the base: nothing's adding to it yet.")
                : tr("lore.power", "{ratio}× the base: {verdict}.", {
                      ratio: times(ratio),
                      verdict: verdict(ratio - 1),
                  });
    } else if (!percent && value > 0) {
        about.power = tr("lore.power.flat", "A fresh hero has none. You have {value}.", {
            value: String(Number(value.toFixed(1))),
        });
    }
    return about;
}

// What a weapon's own stat means, and how far past its level 1 size it has got
export function weaponStatAbout(key: string, base?: number, now?: number): About | undefined {
    const lore = WEAPON_LORE[key];
    if (!lore) {
        return undefined;
    }
    const about: About = {
        what: tr(`lore.weapon.${key.replace("weaponstat.", "")}.what`, lore.what),
        calc: lore.calc && tr(`lore.weapon.${key.replace("weaponstat.", "")}.calc`, lore.calc),
    };
    if (base && now !== undefined && base > 0) {
        about.power =
            Math.abs(now / base - 1) < 0.005
                ? tr("lore.power.level_one", "Still at its level 1 size.")
                : tr("lore.power.level", "{ratio}× its level 1 size: {verdict}.", {
                      ratio: times(now / base),
                      verdict: verdict(now / base - 1),
                  });
    }
    return about;
}

// The weapon's damage bonus
export function bonusAbout(): About {
    return {
        what: tr("lore.bonus.what", BONUS_LORE.what),
        calc: tr("lore.bonus.calc", BONUS_LORE.calc!),
    };
}

// A passive: what the stat it adds to means, and that each pick adds again (rarer ones more)
export function passiveAbout(stat: StatKey): About {
    return {
        what: tr(`lore.stat.${stat}.what`, STAT_LORE[stat].what),
        calc: tr(
            "lore.passive.calc",
            "Each time you pick it on a level up it adds again, and a rarer pick adds more.",
        ),
        from: sourcesOf(stat),
    };
}

// The words of the above, for locales/en/gen.json
export const LORE_MESSAGES: Record<string, string> = {
    ...Object.fromEntries(
        (Object.keys(STAT_LORE) as StatKey[]).flatMap((key) => [
            [`lore.stat.${key}.what`, STAT_LORE[key].what],
            ...(STAT_LORE[key].calc ? [[`lore.stat.${key}.calc`, STAT_LORE[key].calc]] : []),
        ]),
    ),
    ...Object.fromEntries(
        Object.entries(WEAPON_LORE).flatMap(([key, lore]) => {
            const name = key.replace("weaponstat.", "");
            return [
                [`lore.weapon.${name}.what`, lore.what],
                ...(lore.calc ? [[`lore.weapon.${name}.calc`, lore.calc]] : []),
            ];
        }),
    ),
    ...Object.fromEntries(VERDICTS.map(([, key, english]) => [key, english])),
    "lore.verdict.weak": "weaker than the base (ouch)",
    "lore.calc.percent": CALC.percent,
    "lore.calc.flat": CALC.flat,
    "lore.bonus.what": BONUS_LORE.what,
    "lore.bonus.calc": BONUS_LORE.calc!,
    "lore.passive.calc":
        "Each time you pick it on a level up it adds again, and a rarer pick adds more.",
    "lore.from": "More from: {sources}.",
    "lore.from.passives": "passives ({names}{more})",
    "lore.from.gear": "worn gear",
    "lore.from.potions": "potions",
    "lore.from.shop": "the skill shop",
    "lore.power": "{ratio}× the base: {verdict}.",
    "lore.power.base": "Right at the base: nothing's adding to it yet.",
    "lore.power.flat": "A fresh hero has none. You have {value}.",
    "lore.power.level": "{ratio}× its level 1 size: {verdict}.",
    "lore.power.level_one": "Still at its level 1 size.",
};
