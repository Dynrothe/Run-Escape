import { tr } from "../i18n";
import { PassiveDef, WeaponDef } from "./types";

// What the game says of a weapon or passive when it's looked at: a line or two in the manner of
// the original's examine texts, then how it fights or what it does. Kept short (a tooltip shows
// four lines of it at most), and in English: the other languages show it until they add theirs.

export const WEAPON_EXAMINE: Record<string, string> = {
    scimitar:
        "A vicious, curved blade. It slashes the nearest foe, and sharpens from bronze to dragon.",
    abyssal_whip: "A weapon from the abyss. It lashes at both sides of you, fast and far.",
    fire_spells: "Spellbook fire, from Strike up to Wave. It flies at the nearest foe.",
    flames_of_zamorak:
        "Zamorak's wrath, made fire. Pillars of flame burst up beneath the enemies around you.",
    throwing_knives:
        "Sharp and easy to throw. They fly at nearby enemies, and improve from bronze up.",
    toktz_xil_ul: "Obsidian rings from the TzHaar. They fly through everything in their way.",
    ice_burst:
        "A bitter chill in the shape of a spell. It bursts around you, hurting and freezing.",
    ice_barrage: "The Ancient spell that freezes a crowd solid. A huge, freezing blast.",
    smoke_burst: "Choking smoke, summoned in a ring around you. What it touches is poisoned.",
    shadow_burst: "Darkness, given a shape. What it touches takes more damage for a while.",
    blood_burst: "A spell that drinks. Its bursts hurt, and now and then heal you.",
    smoke_barrage: "A great cloud of poisonous smoke. It poisons hard, and for long.",
    shadow_barrage: "A great wave of shadow. What it hits is left weaker for a while.",
    blood_barrage: "A great wave of blood. It hurts the foe, and now and then heals you.",
    saradomin_strike:
        "Saradomin's blessing, as a thunderbolt. It strikes random enemies around you.",
    undead_grasp: "Hands of the dead reach up from the earth, and hold fast whatever they catch.",
    two_handed_sword:
        "A big, heavy blade for the strong. It sweeps the whole space in front of you.",
    colossal_blade:
        "A blade too big for most. Its sweep reaches both sides, and bosses are hit again.",
    shortbow: "A simple bow that's good enough for the job. It shoots the nearest enemy.",
    dark_bow: "A bow of dark dragon's fire. It looses two heavy arrows that burst where they land.",
    throwing_axes: "Axes made for throwing. They bounce from one enemy to the next.",
    chain_hit_axes: "Morrigan's axes. They chain through a crowd, bouncing on again and again.",
    elemental_runes: "Runes humming with power. They circle you, hitting whatever they pass.",
    astral_runes: "Runes of Vengeance. They circle you and never stop.",
    scythe_of_vitur:
        "A scythe that reaps more than wheat. It sweeps a wide arc, and bosses are hit three times.",
    holy_scythe_of_vitur:
        "The scythe, blessed with holy light. It sweeps right round you, and now and then heals.",
    sanguine_scythe: "A scythe stained deep red. A wider sweep, and every few swings it heals you.",
    armadyl_godsword:
        "A godsword of Armadyl's order. A heavy sweep, with The Judgement every third swing.",
    bandos_godsword: "A godsword of Bandos. A heavy sweep, with Warstrike every third swing.",
    saradomin_godsword:
        "A godsword of Saradomin. A heavy sweep, with Healing Blade every third swing.",
    zamorak_godsword: "A godsword of Zamorak. A heavy sweep, with Ice Cleave every third swing.",
    godsword: "A blade fit for a god, waiting for a hilt. At level 2 you choose which.",
    ancient_godsword:
        "A godsword of ancient power. Every third swing is a blood sacrifice that heals you.",
    dragon_claws:
        "Claws of a dragon, for those who fight up close. Four quick slashes in a flurry.",
    burning_claws: "Dragon claws that smoulder. Four quick slashes, and every third set burns.",
    ivandis_flail: "A flail that's no friend of the undead. It hits them harder.",
    blisterwood_flail:
        "A flail made for slaying vampyres. It passes the hit on to others of their kind.",
    osmumtens_fang:
        "A fang of the old god Osmumten. Fast, precise stabs, and bosses are hit twice.",
    ghrazi_rapier:
        "Slender, swift and cruel. The fastest stabs there are, and bosses are hit twice.",
    keris_partisan: "A spear made for scarab-hunting. Quick stabs that hurt kalphites more.",
    keris_partisan_of_breaching:
        "A keris that finds the gaps in a shell. Now and then a stab does triple damage.",
    keris_partisan_of_corruption:
        "A keris touched by Amascut. Every sixth stab leaves its target weakened.",
    keris_partisan_of_the_sun:
        "A keris warmed by the sun. Each kill heals you, and it hits harder when you're low.",
    keris_partisan_of_amascut: "All the jewels' powers in one keris, lit by Tumeken's Light.",
    tzhaar_ket_om: "A hammer fit for a TzHaar. Slow, crushing sweeps that knock foes far back.",
    dragon_warhammer: "Heavy and crushing. Every third blow smashes, and leaves its target weak.",
    elder_maul: "A maul from a bygone age. Its sweep shakes everything around you.",
    dinhs_bulwark: "A great shield for a great warrior. It bashes everything around you, far out.",
    dinhs_blazing_bulwark: "A bulwark wreathed in flame. Its bash reaches further, and burns.",
    dual_macuahuitl: "Two obsidian-edged clubs. Very fast slashes on both sides of you.",
    thunder_khopesh:
        "A curved blade that crackles. Every third slash is a thunderclap that hits everything around you.",
    twisted_bow:
        "A bow of eerie, twisted wood. It hunts the toughest foe, and hits harder the bigger the target.",
    corrupted_twisted_bow:
        "A twisted bow, corrupted. It hunts the toughest foe, and hits harder still.",
    bow_of_faerdhinen:
        "A bow of crystal and elven craft. Its arrows fly on through the enemies they hit.",
    toxic_blowpipe:
        "A blowpipe loaded with venom. Its darts poison, and it seeks what isn't poisoned yet.",
    rubber_chicken:
        "A rubber chicken. It whacks all round you, and every hit can heal you a little.",
    saradomin_sword:
        "A blade blessed by Saradomin. Its heavy sweeps knock back and stagger what they hit.",
    soulreaper_axe:
        "An axe that feeds on souls. Each one it takes hits harder, until it Harvests them.",
    dragon_hunter_crossbow:
        "A crossbow made to slay dragons. Heavy bolts that pass through, and hit bosses again.",
    armadyl_crossbow:
        "A crossbow of Armadyl's order. Its bolts pass through, and some are enchanted.",
    crystal_bow: "A bow grown from crystal. Its arrows split into three where they first strike.",
    corrupted_bow:
        "A crystal bow, corrupted and perfected. Its arrows split into five where they strike.",
    eclipse_atlatl:
        "An atlatl that hurls fiery darts. They pass through enemies and set them burning.",
    tumekens_shadow: "The shadow of a god. Its blasts splash, and it triples your damage bonus.",
    corrupted_tumekens_shadow: "A shadow gone wrong. Bigger blasts that pass through two enemies.",
    harmonised_nightmare_staff:
        "A staff attuned to the Nightmare. It casts Fire Surge faster than any other.",
    eldritch_nightmare_staff:
        "A staff of eldritch power. Each Fire Surge splits into three where it lands.",
    nightmare_staff:
        "The Nightmare's own claws, in a staff. They grasp at enemies from the ground.",
    volatile_nightmare_staff:
        "A staff that casts Immolate. Slow, and the bigger the target, the harder it burns.",
    inquisitors_mace: "A mace for crushing heresy. It hits the undead harder, and bosses again.",
    sanguinesti_staff: "A staff that thirsts for blood. Its blasts can heal you.",
    holy_sanguinesti_staff:
        "A sanguinesti staff, made holy. Splashing blasts that heal you more often.",
    kodai_wand:
        "A wand that grows with its wielder. Water Strike to Water Surge, from Beginner to Master.",
    kodai_wand_evolved:
        "A wand of Kodai's order. Stronger Water Surges pass through enemies and splash further.",
    crystal_staff: "A staff of living crystal. It starts plain, and grows into something perfect.",
    toktz_mej_tal: "A staff of obsidian heat. Its pulses leave the ground burning.",
    blue_moon_spear:
        "A spear of the Blue Moon. Ice crashes down on the enemies around you, freezing them.",
};

export const PASSIVE_EXAMINE: Record<string, string> = {
    piety: "A prayer of the pious. You hit harder.",
    protect_melee: "A prayer that turns blows aside. You take less damage from every hit.",
    rapid_heal: "A prayer for mending. Your wounds close slowly, over time.",
    graceful: "A light outfit for the nimble. Each piece makes you faster.",
    ring_of_wealth: "A ring that smiles on fortune. Luckier rolls, and more coins.",
    amulet_of_glory: "An amulet for the glorious. What you drop comes to you from further away.",
    tome_of_fire: "A tome that burns without burning. Your weapons recharge faster.",
    vengeance: "A spell of spite. Whatever hits you is hit back.",
    obsidian_armour: "Armour from the TzHaar forges. Each piece adds to your hitpoints.",
    book_of_the_dead: "A book bound in grave-dust. Freezes, poison and the rest last longer.",
    dizanas_quiver: "A quiver that never seems to empty. One more of every projectile.",
    divine_rune_pouch:
        "A pouch with room for more magic. An extra weapon slot, for a magic weapon.",
    chivalry:
        "A code of honour. Slashes and sweeps hit harder, and you can take more hits up close.",
    rigour: "A prayer for the archer. Arrows, bolts and everything thrown hit harder.",
    augury: "A prayer for the spellcaster. Spells hit harder, and their effects last longer.",
    ancient_sceptre: "A sceptre of ancient power. Auras and Ancient spells cover more ground.",
};

// What a weapon says when looked at, in the language chosen
export function weaponExamine(weapon: WeaponDef): string {
    return tr(`weapon.${weapon.id}.examine`, WEAPON_EXAMINE[weapon.id] ?? weapon.description);
}

export function passiveExamine(passive: PassiveDef): string {
    return tr(`passive.${passive.id}.examine`, PASSIVE_EXAMINE[passive.id] ?? passive.description);
}
