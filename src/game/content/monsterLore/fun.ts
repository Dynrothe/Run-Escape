import { MonsterLore, lore } from "./lore";

// The fun maps: the Grand Exchange, East Varrock, Falador, Last Man Standing, Castle Wars and Pest
// Control. Most of these are player archetypes and in-jokes from the OSRS community rather than
// monsters in the game's own files, so their "where" is the corner of the game they come from.
const ARCHETYPE =
    "Not an NPC in the game: a player archetype that this fan game turns into a monster.";

export const FUN_LORE: Record<string, MonsterLore> = {
    // The Grand Exchange
    "Spam bot": lore(
        "A chat-spamming account that advertises where to buy gold or items.",
        "The Grand Exchange, where players trade, and every busy public chat.",
        ARCHETYPE,
        "Automated accounts break the game's rules, and the usual advice is to report them and carry on.",
    ),
    Scammer: lore(
        "A player who tries to trick others out of their money or items.",
        "The Grand Exchange and its surroundings.",
        ARCHETYPE,
        "Rule 2 of the Old School RuneScape Code of Conduct forbids scamming, on pain of a mute or ban.",
    ),
    Lurer: lore(
        "A player who tempts others into dangerous places or trades.",
        "The Grand Exchange and its surroundings.",
        ARCHETYPE,
        '"Luring" is the community\'s name for talking someone into a trap, often in the Wilderness.',
    ),
    "Gold farmer": lore(
        "A player or bot who gathers gold by repetitive means, to sell it on.",
        "The Grand Exchange and any resource-rich corner of the world.",
        ARCHETYPE,
        "Automating tasks with third-party software, known as macroing or botting, is against the rules.",
    ),
    "Fake moderator": lore(
        "A player who pretends to be official staff to win trust.",
        "The Grand Exchange and its surroundings.",
        ARCHETYPE,
        "Real Jagex staff will never ask for your password.",
    ),
    Merchant: lore(
        "A trader who buys cheap and sells dear, working the market.",
        "The Grand Exchange.",
        ARCHETYPE,
        '"Merching" is the art of buying an item low and selling it high, and a favourite of wealthy players.',
    ),
    "The Doubler": lore(
        "A boss of the Grand Exchange map: a trader who promises to double your money.",
        "The Grand Exchange.",
        ARCHETYPE,
        '"Double your money" is one of the oldest scams in the game.',
    ),
    "Lure master": lore(
        "A boss of the Grand Exchange map: the best of the lurers.",
        "The Grand Exchange.",
        ARCHETYPE,
    ),
    "Bot farmer": lore(
        "A boss of the Grand Exchange map: a farmer of many automated accounts.",
        "The Grand Exchange.",
        ARCHETYPE,
        "Running many automated accounts is against the rules.",
    ),
    Melodox: lore(
        "A boss of the Grand Exchange map.",
        "The Grand Exchange, in this game.",
        "A Run Escape invention rather than an OSRS monster.",
    ),

    // East Varrock
    "Clan noob": lore(
        "A fresh recruit of a clan, keen to prove themselves.",
        "East Varrock.",
        ARCHETYPE,
    ),
    Ranger: lore(
        "A free-to-play ranger, firing arrows from a distance.",
        "East Varrock; in OSRS, Rangers are also agents of the Temple Knights in the quest Wanted!",
        ARCHETYPE,
    ),
    Pker: lore(
        "A player killer, who fights other players for sport or loot.",
        "East Varrock, and the Wilderness in OSRS.",
        ARCHETYPE,
        "Player killing, or PKing, is combat between players rather than against monsters.",
    ),
    Mage: lore(
        "A free-to-play mage, casting spells at range.",
        "East Varrock.",
        ARCHETYPE,
        "Magic is one of the three combat classes in OSRS.",
    ),
    Pure: lore(
        "A player who has trained only the skills they need, leaving others low, to fight above their weight.",
        "East Varrock, and Last Man Standing.",
        ARCHETYPE,
    ),
    Tank: lore(
        "A heavily armoured player whose job is to soak up damage.",
        "East Varrock, and Castle Wars in this game.",
        ARCHETYPE,
        "Tanks tend to be Defence pures, or warriors trained highly in melee skills, who take damage so others needn't.",
    ),
    "Clan leader": lore(
        "A boss of the East Varrock map: the head of the clan.",
        "East Varrock.",
        ARCHETYPE,
    ),
    "Rune 2h pure": lore(
        "A boss of the East Varrock map: a pure with a rune two-handed sword.",
        "East Varrock.",
        ARCHETYPE,
    ),
    "Wildy mage": lore(
        "A boss of the East Varrock map: a mage straight from the Wilderness.",
        "East Varrock; the Wilderness in OSRS.",
        ARCHETYPE,
    ),
    Noob: lore(
        "A new or inexperienced player.",
        "East Varrock.",
        ARCHETYPE,
        '"Noob", "newb" and "newbie" are used by RuneScape players and gamers generally for newcomers.',
    ),

    // Falador
    "Party guest": lore("A guest at a party, in Falador's party room.", "Falador.", ARCHETYPE),
    "Obby noob": lore("A newcomer proud of their obsidian gear.", "Falador.", ARCHETYPE),
    "Ranger noob": lore("A newcomer who has taken up the bow.", "Falador.", ARCHETYPE),
    Alcher: lore(
        "A player who casts High Level Alchemy over and over to turn items into coins.",
        "Falador, and everywhere that players train Magic.",
        ARCHETYPE,
    ),
    "Pk wannabe": lore(
        "Someone who has the attitude of a player killer without the experience.",
        "Falador.",
        ARCHETYPE,
    ),
    "Player moderator": lore(
        "A boss of the Falador map: a player chosen by Jagex for their commitment to the community.",
        "Falador, and everywhere in OSRS.",
        "Player Moderators (PMods) are ambassadors of the game who help to maintain a good atmosphere.",
        "In this game he is a comic boss.",
    ),
    "Cursed You": lore(
        "A boss of the Falador map.",
        "Falador, in this game.",
        "A Run Escape invention rather than an OSRS monster.",
    ),
    "Mod Murdoch": lore(
        "A boss of the Falador map.",
        "Falador, in this game.",
        "A Run Escape invention rather than an OSRS monster.",
    ),

    // Last Man Standing
    Zerker: lore(
        "A berserker: a build with 45 Defence, enough to wear the berserker helm.",
        "Last Man Standing.",
        ARCHETYPE,
    ),
    "Crossbow sweat": lore(
        "A competitive player who has gone all in on ranged crossbows.",
        "Last Man Standing.",
        ARCHETYPE,
    ),
    "Mystic sweat": lore(
        "A competitive player who has gone all in on magic.",
        "Last Man Standing.",
        ARCHETYPE,
    ),
    Med: lore("A mid-level build, in the middle of the range.", "Last Man Standing.", ARCHETYPE),
    "Maxed sweat": lore(
        "A competitive player with maximum levels.",
        "Last Man Standing.",
        ARCHETYPE,
    ),
    "AGS specer": lore(
        "A boss of the Last Man Standing map: a player who hits with the Armadyl godsword's special attack.",
        "Last Man Standing.",
        ARCHETYPE,
    ),
    "Claws specer": lore(
        "A boss of the Last Man Standing map: a player who hits with the dragon claws' special attack.",
        "Last Man Standing.",
        ARCHETYPE,
    ),
    "Dharok's sweat": lore(
        "A boss of the Last Man Standing map: a player in Dharok's set.",
        "Last Man Standing.",
        ARCHETYPE,
        "Dharok's set effect rewards low hitpoints, as the Barrows brother's does.",
    ),

    // Castle Wars
    "Zamorak noob": lore(
        "A new player on the Zamorak team.",
        "Castle Wars.",
        ARCHETYPE,
        "Castle Wars pits Saradomin's team against Zamorak's.",
    ),
    "Zamorak ranger": lore(
        "A ranger on the Zamorak team.",
        "Castle Wars.",
        ARCHETYPE,
        "OSRS also has Zamorak rangers guarding the Ourania Altar, in the Zamorak Magical Institute's cave.",
    ),
    "Zamorak warrior": lore(
        "A warrior on the Zamorak team.",
        "Castle Wars.",
        ARCHETYPE,
        "OSRS also has Zamorak warriors guarding the Ourania Altar.",
    ),
    "Zamorak mage": lore(
        "A mage on the Zamorak team.",
        "Castle Wars.",
        ARCHETYPE,
        "OSRS also has Zamorak mages guarding the short path to the Ourania Altar.",
    ),
    "Potion runner": lore(
        "A player on the Zamorak team who carries potions to their side.",
        "Castle Wars.",
        ARCHETYPE,
    ),
    "Zamorak defender": lore("A defender on the Zamorak team.", "Castle Wars.", ARCHETYPE),
    "Saradomin player": lore(
        "A player on the Saradomin team, whom the Zamorak side meets in Castle Wars.",
        "Castle Wars.",
        ARCHETYPE,
    ),
    "Flag carrier": lore(
        "A boss of the Castle Wars map: a player making off with the flag.",
        "Castle Wars.",
        ARCHETYPE,
        "Capturing the other team's flag is the object of the minigame.",
    ),
    "Catapult crew": lore("A boss of the Castle Wars map.", "Castle Wars.", ARCHETYPE),
    "Zamorak tank": lore(
        "A boss of the Castle Wars map: a heavily armoured defender of Zamorak's side.",
        "Castle Wars.",
        ARCHETYPE,
    ),

    // Pest Control
    Brawler: lore(
        "A monster of the Pest Control minigame.",
        "Pest Control.",
        "Brawlers are irritating because they can block players and monsters from walking through them.",
    ),
    Ravager: lore(
        "A short humanoid creature with large claws, like a mole with oversized claws and red eyes.",
        "Pest Control.",
        "They don't attack the Void Knight directly, but can tear down the barricades.",
    ),
    Defiler: lore(
        "An agile creature, the lower half of a snake with a humanoid top and a catlike face.",
        "Pest Control.",
        "They shoot spikes over long distances, dealing a lot of Ranged damage.",
    ),
    Torcher: lore(
        "A winged snake with bat wings, which attacks the Void Knight.",
        "Pest Control.",
        "Their long-range magic can reach over walls, and harms both players and the Void Knight.",
    ),
    Splatter: lore(
        "A giant, wrinkled ball with a single eye in the middle.",
        "Pest Control.",
        "They bounce towards the fort and detonate for 5 to 24 typeless damage to everything nearby.",
    ),
    Shifter: lore(
        "A melee-minded creature that teleports across the island.",
        "Pest Control.",
        "They can even pass through walls, so defenders are in danger of them appearing beside the Void Knight.",
    ),
    Spinner: lore(
        "A levitating monster like a spinning top or jellyfish.",
        "Pest Control.",
        "Their job is to repair the portal they came from, so they should be killed if the portals are to fall fast.",
    ),
    "Purple portal": lore(
        "One of the four portals the pests come from.",
        "Pest Control.",
        "In this game it stands still where it does in the minigame, and the party has to bring it down.",
    ),
    "Blue portal": lore(
        "One of the four portals the pests come from.",
        "Pest Control.",
        "In this game it stands still where it does in the minigame, and the party has to bring it down.",
    ),
    "Yellow portal": lore(
        "One of the four portals the pests come from.",
        "Pest Control.",
        "In this game it stands still where it does in the minigame, and the party has to bring it down.",
    ),
    "Red portal": lore(
        "One of the four portals the pests come from.",
        "Pest Control.",
        "In this game it stands still where it does in the minigame, and the party has to bring it down.",
    ),
};
