import { MonsterLore, lore } from "./lore";

// Hallowed Night's Nightmare, Justiciar Zachariah, the Battle for Varrock and Act II
export const ACT2_LORE: Record<string, MonsterLore> = {
    // The Nightmare
    "The Nightmare": lore(
        "The Nightmare of Ashihama, a boss monster of Morytania.",
        "The Sisterhood Sanctuary, under the town of Slepe.",
        "Access to Morytania is the only requirement to fight her.",
    ),
    Totem: lore(
        "A pillar in the Nightmare's chamber.",
        "The Sisterhood Sanctuary, in the Nightmare's fight.",
        'In the fight the party charges the totems to bring her down; in OSRS a different "totem" is the quest item of Tribal Totem.',
    ),
    Husk: lore(
        "A creature summoned during the Nightmare's fight.",
        "The Sisterhood Sanctuary.",
        "They have low health and rather inaccurate attacks: the skinny husk uses magic, and the bulky husk ranged.",
    ),
    Sleepwalker: lore(
        "A Morytanian who walks in their sleep towards the Sisterhood Sanctuary.",
        "Slepe and the road to the Sisterhood Sanctuary.",
        "They were added as a teaser before the Nightmare was released.",
    ),
    Parasite: lore(
        "An enemy the Nightmare plants in the player.",
        "The Sisterhood Sanctuary.",
        "After about 18 ticks (10.8 seconds) it bursts out and damages you; Sanfew serum or Relicym's balm weaken it.",
    ),
    "Phosani's Nightmare": lore(
        "A harder version of the Nightmare, met by drinking from the Pool of Nightmares.",
        "The Sisterhood Sanctuary.",
        "She can only be fought alone.",
    ),
    "Parasitic egg": lore(
        "An egg of Phosani's Nightmare.",
        "Phosani's Nightmare's fight.",
        "As an OSRS item the parasitic egg is a reward from beating her, which lets the Little Nightmare pet metamorphose.",
        "Here the eggs hatch into parasites unless they're broken in time.",
    ),
    "Justiciar Zachariah": lore(
        "A Saradominist justiciar who roams the Wilderness, hunting the demon Porazdir.",
        "The Wilderness.",
        "He must be defeated in the Mage Arena II miniquest to get his hand for Kolodion's spell.",
    ),
    Sword: lore(
        "A blade that is part of Justiciar Zachariah's fight in Run Escape.",
        "Zachariah's fight, in the Owl's Court.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
    ),
    Bolt: lore(
        "A bolt of power that is part of Justiciar Zachariah's fight in Run Escape.",
        "Zachariah's fight, in the Owl's Court.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
    ),

    // The Battle for Varrock
    Yama: lore(
        "Yama, the Master of Pacts, a powerful demonic boss who fights two at once.",
        "Yama's Domain, deep in the Chasm of Fire, after A Kingdom Divided.",
        "He rules his domain through pacts.",
    ),
    "Void Flare": lore(
        "A demonic entity summoned in the fight with Yama.",
        "Yama's Domain.",
        "It has 200% demonbane vulnerability: demonbane weapons double their accuracy and damage against it.",
    ),
    Xarth: lore(
        "A unique tormented demon, fought as part of The Fractured Archive raid.",
        "The Fractured Archive.",
        "Unlike other tormented demons, Xarth has gained control of the perpetual flames that burn its body.",
    ),
    Corpse: lore(
        "A corpse lying about the Abandoned Mine.",
        "The second and fourth floors of the Abandoned Mine.",
        "Some will animate into a Skeletal miner when you walk by.",
    ),
    "Greater demon": lore(
        "A large demonic monster.",
        "Dungeons across Gielinor, with greater demons in K'ril's lair and the Catacombs of Kourend.",
        "They're well known for rune full helm and hard clue scroll drops.",
    ),
    "Black demon": lore(
        "A large demon that inhabits various dungeons.",
        "Dungeons throughout Gielinor.",
        "Weak to demonbane weapons and magic, and a unique black demon is fought in The Grand Tree.",
    ),

    // Act II
    Strangled: lore(
        "A human infected with the Strangler parasite.",
        "The Stranglewood, in Desert Treasure II - The Fallen Empire.",
        "They notice you from two tiles away if you run.",
    ),
    "Strangled Boar": lore(
        "A boar infected with the Strangler parasite.",
        "The Stranglewood.",
        'If it spots you, nearby strangled are alerted, and it squeals "Squeee!".',
    ),
    "Strangled Lynx": lore(
        "A lynx infected with the Strangler parasite.",
        "The Stranglewood.",
        "If it spots you, nearby strangled are alerted, and it hisses.",
    ),
    "Strangled Bear": lore(
        "A bear infected with the Strangler parasite.",
        "The Stranglewood.",
        'If it spots you, nearby strangled are alerted, and it growls "Grrr!".',
    ),
    "Large Tendril": lore(
        "A part of the Strangler.",
        "The fight with Vardorvis.",
        "Large tendrils rise from the ground at the arena's edge, throw an axe and disappear.",
    ),
    "Kasonde the Craven": lore(
        "The wighted variant of Kasonde Shaw, summoned by Sliske in the final battle of Desert Treasure II.",
        "The final battle of Desert Treasure II - The Fallen Empire.",
        "He uses both melee and ranged, and favours melee when you are close.",
    ),
    "Great Strangled Bear": lore(
        "A bigger strangled bear, met as a boss in Run Escape's Stranglewood.",
        "The Stranglewood.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
        "It is a larger relative of the Strangled Bear, which is documented in OSRS.",
    ),
    "Vardorvis' axe": lore(
        "One of the great axes of Vardorvis, treated as a creature in this fight.",
        "The fight with Vardorvis.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
        "Large tendrils throw axes in the OSRS fight.",
    ),
    "Vardorvis' Head": lore(
        "The severed head of Vardorvis.",
        "The fight with Vardorvis.",
        "Dwarves who raided his camp chopped his head off after he was infected with the Strangler.",
        "It appears once he falls below 570 hitpoints.",
    ),
    Vardorvis: lore(
        "Carnifex Maximus Vardorvis, a Ghrazi vampyre and high-ranking member of the Zarosian Empire.",
        "The Stranglewood Ritual Site.",
        "His corpse was animated by the Strangler parasite, which still controls him.",
    ),
    "Crawling Hand": lore(
        "A severed hand that crawls about.",
        "Slayer areas, and the Lassar Undercity in this game.",
        "It needs level 5 Slayer, and is the first Slayer monster a player can defeat.",
    ),
    "Wighted Leech": lore(
        "A leech that comes out of the portal Persten the Deceitful conjures.",
        "The final battle of Desert Treasure II.",
        "They move slower than walking but attack every two ticks with 100% accuracy.",
    ),
    "Ancient Guardian": lore(
        "A guardian fought during the Below Ice Mountain quest.",
        "Below Ice Mountain.",
        "You can avoid the fight by mining the four pillars in the corners of the room.",
    ),
    Shadow: lore(
        "A shadow that stalks the Shadow Realm in Run Escape.",
        "The Lassar Undercity.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
    ),
    "Shadow Keeper": lore(
        "A creature that guards the sealed remnants of the Shadow Realm.",
        "The Shadow Realm, in the Lassar Undercity.",
        "Players put shadow blockers beside the sealed remnants in the real world to let them focus.",
    ),
    Tentacle: lore(
        "A tentacle that rises in Run Escape's Lassar Undercity.",
        "The Lassar Undercity.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
    ),
    "Lost Soul": lore(
        "A ghost of the Shadow Realm.",
        "The Shadow Realm version of the Lassar Undercity.",
        "If you get close they drain your sanity by 8 to 10%.",
    ),
    "The Forsaken Assassin": lore(
        "The wighted variant of the assassin, summoned by Sliske in the final battle of Desert Treasure II.",
        "The final battle of Desert Treasure II.",
        "He uses both ranged and melee.",
    ),
    "The Whisperer": lore(
        "A siren of the sunken cathedral of the Lassar Undercity.",
        "The Lassar Undercity, in Desert Treasure II - The Fallen Empire.",
        "She was a high-ranking assassin of the Zarosian Empire whose real name has been lost.",
    ),
    "Ice warrior": lore(
        "A mid-level ice elemental.",
        "The Ice Queen's Lair and other icy places.",
        "They are 100% weak to fire spells, and Krystilia assigns them in the Wilderness.",
    ),
    "Ice spider": lore(
        "One of the stronger species of spider.",
        "Icy places, and on a Wilderness Slayer task.",
        "Seldom killed, as they've very few drops, and they don't show on the minimap.",
    ),
    "Ice wolf": lore(
        "A wolf of the cold, level 96 or 132.",
        "The Ice Path in Desert Treasure I, the top of Trollweiss Mountain, near the God Wars Dungeon and Weiss.",
        "Ice wolves are among the dangers of Desert Treasure I's Ice Path.",
    ),
    "Ice giant": lore(
        "A tall, light blue giant of icy places.",
        "Certain icy areas.",
        "The second strongest of the standard giants, behind fire giants but ahead of moss and hill giants.",
    ),
    "Flaming pyrelord": lore(
        "A superior variant of the pyrefiend.",
        "Slayer areas, after buying Bigger and Badder.",
        "It's a chance spawn once you unlock Bigger and Badder for 50 Slayer reward points.",
    ),
    "Ketla the Unworthy": lore(
        "The wighted variant of Ketla, summoned by Sliske in the final battle of Desert Treasure II.",
        "The final battle of Desert Treasure II.",
        "She uses ranged attacks and summons four or five clones of herself.",
    ),
    Jhallan: lore(
        "A Zarosian Mahjarrat.",
        "Met in the quest Secrets of the North, and again in Desert Treasure II.",
        "He fights for the Zarosian cause.",
    ),
    "Jhallan's shadow": lore(
        "A shadowy double that fights beside Jhallan in Run Escape.",
        "Ghorrock.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
        "Jhallan himself is a Zarosian Mahjarrat from Secrets of the North.",
    ),
    "Duke Sucellus": lore(
        "A chthonian demon sealed in Ghorrock Prison, a high-ranking commander of the Zarosian Empire.",
        "Ghorrock Prison, in Desert Treasure II.",
        'Pronounced "soo-KELL-əs".',
    ),
    "Scarred imp": lore(
        "A type of demon found in the Scar.",
        "The Scar, beyond the south-east passage in Desert Treasure II.",
        "You have to kill them to disable the lesser demon's protection prayers.",
    ),
    "Abyssal leech": lore(
        "A monster of the Abyss.",
        "The Abyss and the Abyssal Area.",
        "The easiest abyssal monster to kill, with low defence, strength and hitpoints, but a very high attack and speed.",
    ),
    "Light leech": lore(
        "An NPC of the Scar.",
        "The Scar, beyond the passages in Desert Treasure II.",
        "You must steal the illuminating lure from them to progress.",
    ),
    "Abyssal walker": lore(
        "One of the monsters of the Abyss.",
        "The Abyss and the Abyssal Area (fairy ring ALR).",
        "Hard to hunt, with high defence, hitpoints and strength, though low accuracy.",
    ),
    "Abyssal antibody": lore(
        "A creature of the Scar that you must defend.",
        "The Scar's middle passage, in Desert Treasure II.",
        "You protect them from scarred hellhounds and scarred lesser demons until they heal the Brain Pillar.",
    ),
    "Scarred lesser demon": lore(
        "A lesser demon changed by the power of the Abyssal Space.",
        "The Scar.",
        "It can be fought, but always drops nothing.",
    ),
    "Scarred hellhound": lore(
        "A hellhound changed by the power of the Abyssal Space.",
        "The Scar.",
        "A demonic creature of the Scar.",
    ),
    "Scarred greater demon": lore(
        "A greater demon changed by the power of the Abyssal Space.",
        "The Scar.",
        "A large demon of the Scar.",
    ),
    "False lantern": lore(
        "A glowing creature of the Scar, part of Run Escape's version of the place.",
        "The Scar.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
    ),
    "Scarred black demon": lore(
        "A black demon changed by the power of the Abyssal Space.",
        "The Scar.",
        "One of the big demons of the Scar.",
    ),
    "Persten the Deceitful": lore(
        "The wighted variant of Mia Persten, summoned by Sliske in the final battle of Desert Treasure II.",
        "The final battle of Desert Treasure II.",
        "She attacks with magic, and has two special attacks.",
    ),
    "Abyssal pathfinder": lore(
        "A glowing orb that spawns when the Leviathan falls below 20% health.",
        "The Leviathan's fight.",
        "It spawns north-west of the arena, and begins to move clockwise.",
    ),
    "The Leviathan": lore(
        "A large sea creature found in the Scar.",
        "The Scar, in Desert Treasure II - The Fallen Empire.",
        "It once lived in the Eastern Ocean, until it was dragged into the Scar during the Battle for the Eye.",
    ),
    "Awakened Vardorvis": lore(
        "Vardorvis in a stronger, awakened state.",
        "The Stranglewood Ritual Site, as an Awakened fight.",
        "The awakened forms are harder versions of Act II's four bosses.",
    ),
    "Blood captor": lore(
        "A creature that holds players during the Awakened Vardorvis fight in Run Escape.",
        "The Stranglewood Ritual Site.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
    ),
    "The Awakened Whisperer": lore(
        "The Whisperer in a stronger, awakened state.",
        "The sunken cathedral of the Lassar Undercity, as an Awakened fight.",
        "The awakened forms are harder versions of Act II's four bosses.",
    ),
    "Siphoned Soul": lore(
        "A soul siphoned by the Awakened Whisperer.",
        "The Lassar Undercity's Awakened fight.",
        "It goes with the party, and can be caught only in the realm.",
    ),
    "Awakened Duke Sucellus": lore(
        "Duke Sucellus in a stronger, awakened state.",
        "Ghorrock Prison, as an Awakened fight.",
        "The awakened forms are harder versions of Act II's four bosses.",
    ),
    "The Awakened Leviathan": lore(
        "The Leviathan in a stronger, awakened state.",
        "The Scar, as an Awakened fight.",
        "The awakened forms are harder versions of Act II's four bosses.",
    ),
};
