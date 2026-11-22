import { MonsterLore, lore } from "./lore";

// Lumbridge, Barrows, Thanksgiving Harvest, the Wilderness, the desert, the Fremennik lands and
// Karamja
export const EARLY_LORE: Record<string, MonsterLore> = {
    // Lumbridge
    Chicken: lore(
        "A farmyard bird, and one of the weakest monsters in the game. For a great many players it was the first thing they ever killed.",
        "Penned in the farms of Gielinor, Lumbridge's chicken coop the best known.",
        "Chickens drop feathers, which fletchers and anglers go through by the thousand.",
    ),
    Rat: lore(
        "A small, weak scavenger, about as gentle an opponent as a first fight can be.",
        "Cities, sewers and dungeons across Gielinor. They respawn quickly and aren't marked on the minimap.",
        "The rats of the Stronghold of Security always drop bones, which most rats don't.",
    ),
    Goblin: lore(
        "A scrappy, green-skinned raider, found in huge numbers and often a new adventurer's first real fight.",
        "All around Lumbridge, and far beyond: goblins are one of the most widespread monsters in Gielinor.",
        "In the quest Goblin Diplomacy, two goblin generals nearly go to war over the colour of their armour.",
    ),
    Cow: lore(
        "A placid grazer and a staple of early training. Cows are a fixture of every new adventurer's first hours outside Lumbridge.",
        "Cow fields near Lumbridge, Falador and other farming towns.",
        "Their cowhides can be tanned into leather, and their raw beef cooked.",
    ),
    Imp: lore(
        "One of the smallest creatures in Gielinor, a darting little demon.",
        "Wizards' Tower, Taverley and other places where magic is practised.",
        "Imps are central to the Imp Catcher quest, because of their beads.",
        "Every so often an imp vanishes in a puff of smoke and reappears a short way off.",
    ),
    Man: lore(
        "A plain civilian, going about their day until someone takes an interest.",
        "Cities and towns, especially in Misthalin: Lumbridge, Falador and Varrock.",
        "Men can be pickpocketed at level 1 Thieving, which makes them the classic first mark.",
    ),
    "Giant rat": lore(
        "A rat grown large and bold on what the sewers provide.",
        "Swamps and sewers, with plenty around Lumbridge and Varrock.",
        "Low-level players train on them, as they are weak and easy to find.",
    ),
    "Big frog": lore(
        "An overgrown swamp frog, content to sit in the mud until someone wanders too close.",
        "Lumbridge Swamp and the caves beneath it, the Dorgesh-Kaan South Dungeon and the Lizardman Settlement.",
        "Their bones are on the Odd Old Man's wish list in the quest Rag and Bone Man I.",
    ),
    Zombie: lore(
        "A shambling corpse with a taste for the living.",
        "Cemeteries, sewers and dungeons throughout Gielinor.",
        "Zombies count as undead, so the Salve amulet and the Crumble Undead spell work well on them.",
    ),
    Skeleton: lore(
        "The bony remains of someone long dead, still on its feet and still armed.",
        "Graveyards and dungeons throughout Gielinor.",
        "Undead and weak to crushing blows, they fall readily to the Salve amulet and Crumble Undead.",
    ),
    "Dark wizard": lore(
        "A Zamorakian mage who throws low-level magic at anyone who comes near.",
        "Around the Varrock stone circle and in the Dark Wizards' Tower.",
        "They're known for dropping runes, and for the black robes and wizard hats they wear.",
    ),
    "Giant spider": lore(
        "A very large spider, with a nasty bite.",
        "Most often seen around Lumbridge.",
        "Spiders of every size are a feature of the dungeons beneath Misthalin.",
    ),
    Ghost: lore(
        "The restless spirit of the dead, drifting through the world without rest.",
        "Graveyards and dungeons in many places, and in Melzar's Maze.",
        "As undead they're weak to Crumble Undead and the Salve amulet, but they rarely drop anything worth the trouble.",
    ),
    "Giant bat": lore(
        "A flying pest with a taste for adventurers.",
        "Dungeons and across the surface of Gielinor.",
        "Giant bats are aggressive to players of combat level 54 or lower.",
    ),
    Highwayman: lore(
        'A criminal of the roads who attacks low-level travellers, shouting "Stand and deliver!".',
        "Roads and wilds across Gielinor.",
        "The highwayman mask is a reward from easy Treasure Trails.",
        "In this game he's a random visitor who steals a tenth of your coins, and drops them when you fell him.",
    ),
    "Wise Old Man": lore(
        "Dionysius, a legendary and very powerful Saradominist wizard and former adventurer, who lives in Draynor Village.",
        "Draynor Village.",
        "He's infamous for the Draynor bank robbery.",
        "He wears a party hat and specs, and carries a short staff.",
    ),
    "Count Draynor": lore(
        "Count Draynor Drakan, a vampyre who rests in a coffin beneath Draynor Manor.",
        "The basement of Draynor Manor, in the quest Vampyre Slayer.",
        "He's the younger brother of Lowerniel, Ranis and Vanescula Drakan, of House Drakan.",
        "Opening the coffin in the basement during the quest wakes him.",
    ),

    // Barrows
    "Crypt rat": lore(
        "A rat that lurks in the Barrows tunnels, in among the dead.",
        "The Barrows tunnels.",
        "They're aggressive to treasure hunters whatever their combat level, and a constant distraction from the crypt's puzzle.",
    ),
    Bloodworm: lore(
        "A yellowish-red, leech-like worm that lives in the dark and feeds on the blood of unwary treasure hunters.",
        "The Barrows tunnels.",
        "Like everything in the crypts, they're aggressive to any player.",
    ),
    Afflicted: lore(
        "The villagers of Mort'ton, cursed by a strange mist sent from Sanguinesti by Lord Lowerniel Vergidiyad Drakan.",
        "Mort'ton, in Morytania.",
        "They babble nonsense, and can be cured for a while with Serum 207 or Serum 208.",
    ),
    "Giant crypt rat": lore(
        "A bigger and tougher crypt rat.",
        "The Barrows tunnels.",
        "A stronger variant of the giant rat that lurks in the crypts.",
    ),
    "Crypt spider": lore(
        "A stronger variety of spider, found in the Barrows tunnels.",
        "The Barrows tunnels.",
        "It's one of many things between a treasure hunter and the chest.",
    ),
    Ghoul: lore(
        "A hungry, flesh-eating creature of Morytania, thought to be undead but in fact still alive.",
        "Just west of Canifis, north of the swamp.",
        "Because they are alive, they're immune to Crumble Undead and the Salve amulet.",
    ),
    "Loar Shade": lore(
        "An undead, spectral creature that wanders Mort'ton, rising from the ground to attack.",
        "Mort'ton, in Morytania.",
        "Loar shades first show as green shadows moving on the ground, and they can float over water.",
        "They notice intruders from much further off than most monsters.",
    ),
    "Giant crypt spider": lore(
        "A stronger variant of the giant spider, found in the Barrows tunnels.",
        "The Barrows tunnels.",
        "Like the rest of the crypts' occupants, it's aggressive to everyone.",
    ),
    "Feral Vampyre": lore(
        "A wild, aggressive vampyre that attacks anyone it sees.",
        "The Haunted Woods, near the Abandoned Mine, and in the God Wars Dungeon, where they follow Zamorak.",
        "They're stronger than juveniles and most juvinates, but any weapon can hurt them.",
        "Feral vampyres always drop vampyre dust.",
    ),
    "Dharok the Wretched": lore(
        "The second oldest of the six Barrows brothers, who fights in melee with a great axe.",
        "His crypt in the north-east of the Barrows.",
        "His set effect, Wretched Strength, raises his max hit by 1% for every hitpoint he's missing.",
    ),
    "Karil the Tainted": lore(
        "The fourth oldest of the Barrows brothers, a crossbow-wielding ranger.",
        "His crypt in the south of the Barrows.",
        "His set effect, Tainted Shot, gives him a 25% chance with each hit to lower the target's Agility.",
    ),
    "Torag the Corrupted": lore(
        "The second youngest Barrows brother, who fights with hammers.",
        "His crypt in the south-west of the Barrows.",
        "His set effect, Corruption, gives him a 25% chance with each hit to drain a fifth of your run energy.",
    ),
    "Guthan the Infested": lore(
        "The third oldest of the six Barrows brothers, a spear-wielder.",
        "His crypt in the south-east of the Barrows.",
        "His set effect, Infestation, gives him a 25% chance with each hit to heal for the damage dealt.",
    ),
    "Verac the Defiled": lore(
        "The youngest of the Barrows brothers, who fights with a flail.",
        "His crypt in the north-west of the Barrows.",
        "His set effect, Defiler, gives him a 25% chance with each attack to ignore your Defence and armour.",
    ),
    "Ahrim the Blighted": lore(
        "The eldest of the six Barrows brothers, a magic user in robes.",
        "His crypt in the centre of the Barrows.",
        "His magic attacks are very accurate, though his robes leave him weak to ranged and melee attacks.",
    ),

    // Thanksgiving Harvest
    Farmer: lore(
        "A hard-working tiller of the land, found on farms.",
        "Farms across Gielinor.",
        "Farmers are level 7 humans and can be pickpocketed from level 10 Thieving.",
    ),
    Fox: lore(
        "A sly, quick forest animal that can be hunted and fought.",
        "The Fremennik Province, Hosidius, the Auburn Valley and Drumstick Isle.",
        "Foxes can be attacked, though most adventurers pay them little mind.",
    ),
    Bandit: lore(
        "A robber who lies in wait on the roads.",
        "The Bandit Camp in the Wilderness, guarded by Guard Bandits.",
        "They're aggressive, so approaching their camp takes some care.",
    ),
    "Chompy bird": lore(
        "A plump, flightless bird that ogres hunt and eat.",
        "The Feldip Hills, in Big Chompy Bird Hunting.",
        "Players hunt it with an ogre bow for the quest, and for a hat to show for it.",
    ),
    "The Evil Chicken": lore(
        "A giant, malevolent chicken, a boss of Run Escape's Thanksgiving Harvest.",
        "The Thanksgiving Harvest.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
        "Chickens, and chicken bosses, are an old joke in the game.",
    ),
    "Professor Oddenstein": lore(
        "The eccentric inventor of Draynor Manor.",
        "Draynor Manor, in the quest Ernest the Chicken.",
        "In the quest his experiment turned Ernest into a chicken.",
    ),
    "The Freaky Forester": lore(
        "A strange forester who turns up in the woods and asks the player to catch a particular pheasant.",
        "A random event that can happen in forests across Gielinor.",
        "In OSRS he's a puzzle, not a fight: you bring him the pheasant he asks for.",
        "In this game he rises again after he falls.",
    ),
    "The Desperate Forester": lore(
        "The Freaky Forester at the end of his tether, bigger and angrier.",
        "A Run Escape invention: the Freaky Forester's second wind.",
        "Not an OSRS monster in his own right, but the same forester in a worse mood.",
    ),
    "Enraged Dark Chicken": lore(
        "A furious dark chicken, a boss of Run Escape's Thanksgiving Harvest.",
        "The Thanksgiving Harvest.",
        "No monster of this name is documented in Old School RuneScape: this one is Run Escape's own addition.",
    ),

    // The Wilderness
    "Revenant imp": lore(
        "The restless spirit of an imp, one of the weakest of the revenants.",
        "The Revenant Caves, a PvP-enabled part of the Wilderness.",
        "Like all revenants, it can restore its health when it falls below half, and responds to your protection prayers.",
    ),
    "Revenant goblin": lore(
        "The ghost of a goblin, wandering the Revenant Caves.",
        "The Revenant Caves, in the Wilderness.",
        "A charged bracelet of ethereum reduces the damage all revenants deal.",
    ),
    "Revenant hobgoblin": lore(
        "A revenant in the shape of a hobgoblin.",
        "The Revenant Caves, in the Wilderness.",
        "Like all revenants, it reacts to a player's protection prayers.",
    ),
    "Revenant pyrefiend": lore(
        "A spectral pyrefiend, flaming in the dark of the Revenant Caves.",
        "The Revenant Caves, in the Wilderness.",
        "Revenants heal themselves when badly hurt.",
    ),
    "Revenant demon": lore(
        "The ghost of a demon, one of the stronger revenants.",
        "The Revenant Caves, in the Wilderness.",
        "It can restore its health when it falls below half, like all revenants.",
    ),
    "Dark warrior": lore(
        "A fighter in dark armour.",
        "The Dark Warriors' Fortress, a castle in the Wilderness north-west of Edgeville, and in Great Kourend beside necromancers.",
        "Those in Great Kourend are a different combat level than the Wilderness's.",
    ),
    "Chaos druid": lore(
        "A low-level druid who worships Zamorak, and one of the most popular herb sources.",
        "The Chaos Druid Tower area and Edgeville Dungeon.",
        "They fight with their fists and a spell that briefly binds the target.",
    ),
    "Poison spider": lore(
        "An aggressive spider whose bite poisons its victims.",
        "Many places, including the Wilderness.",
        "Protect from Melee doesn't stop their poison, contrary to what many believe.",
    ),
    Ankou: lore(
        "A skeletal, ghostly monster of the dead.",
        "The Stronghold of Security, the Wilderness and other dungeons.",
        "They're well liked for their frequent death and blood rune drops.",
        "In the Stronghold of Security's fourth level they can drop the left skull half of the skull sceptre.",
    ),
    "Hill Giant": lore(
        "A type of giant, found in several places around Gielinor.",
        "The Edgeville Dungeon, reached from a house north-east of Barbarian Village, and the Shayzien Giant Pit.",
        "The Edgeville Dungeon has more of them than anywhere else in the free-to-play world.",
    ),
    "Crazy archaeologist": lore(
        "Bellock, a relatively simple Wilderness boss with a habit of throwing things.",
        "The ruins south of the Forgotten Cemetery, in the level 23 Wilderness.",
        "He drops one of the three shards that make an Odium or Malediction ward.",
    ),
    "Chaos Fanatic": lore(
        "A zealot who fights among small chaotic clouds, a Wilderness boss.",
        "West of the Lava Maze, in the level 42 Wilderness.",
        "His special attack is similar to those of the crazy and deranged archaeologists.",
        "He, too, drops one of the three shards of the Odium and Malediction wards.",
    ),
    "King Black Dragon": lore(
        "The three-headed King Black Dragon, one of the strongest dragons in Old School RuneScape.",
        "His lair, reachable only through the deep Wilderness.",
        "His combat level is 276, and his lair is a multicombat area.",
        "The Wilderness's King Black Dragon breathes fire, poison, ice and lightning.",
    ),

    // The desert
    "Desert lizard": lore(
        "A Slayer monster of the Kharidian Desert.",
        "The Kharidian Desert.",
        "It needs level 22 Slayer, and an ice cooler to finish it once it's under 5 hitpoints.",
    ),
    Scorpion: lore(
        "A venomous arachnid, once the very picture of the free-to-play world's dangers.",
        "Deserts and mines in free-to-play areas, and many other places.",
        "The strongest scorpions are in the Stronghold of Security, at level 59.",
    ),
    Jackal: lore(
        "A small, dog-like creature of the desert, hunting in packs.",
        "The lower reaches of the Kharidian Desert, near Nardah and Sophanem.",
        "A pack will bring down prey far larger than itself, humans included.",
    ),
    Ugthanki: lore(
        "An aggressive, camel-like beast.",
        "The Kharidian Desert, south of Shantay Pass.",
        "Ugthanki are the only creatures to drop ugthanki meat, for kebabs.",
        "Their name comes from Akthanakos, a camel-headed Mahjarrat who trained camels to fight.",
    ),
    "Scarab Swarm": lore(
        "A swarm of poisonous scarab beetles.",
        "Pyramid areas such as the Sophanem Dungeon, and the Tombs of Amascut.",
        "Their max hit is low, but they strike fast and are very likely to poison.",
    ),
    "Desert bandit": lore(
        "A robber of the desert, a descendant of the followers of Zaros.",
        "The Bandit Camp in the Kharidian Desert.",
        "They bear a grudge against the followers of Saradomin and Zamorak, who persecuted their ancestors.",
        "They can be pickpocketed at level 53 Thieving.",
    ),
    "Kalphite worker": lore(
        "A worker of the Kalphite hive, serving the Queen.",
        "The Kalphite Lair, west of Shantay Pass, and the Kalphite Cave to the east.",
        "Unlike most kalphites, workers can't poison.",
    ),
    Crocodile: lore(
        "A reptile of the River Elid.",
        "South of Pollnivneach, on either side of the River Elid.",
        "Some walk only on water, some only on land and some on both.",
        "Vannaka can assign them as a Slayer task.",
    ),
    "Kalphite soldier": lore(
        "A Kalphite soldier, guarding the way to the Queen's lair.",
        "The Kalphite Lair south-west of Shantay Pass, and the Kalphite Cave to the east.",
        "They're dangerous for their ability to poison.",
    ),
    Mummy: lore(
        "A bandaged corpse, risen from an ancient tomb.",
        "Desert tombs and pyramids.",
        "Mummies are undead, and weak to the Salve amulet.",
    ),
    "Locust rider": lore(
        "A warrior who rides a giant locust.",
        "The Sophanem Dungeon, during the quest Contact!",
        "The level 98 riders fire ranged attacks, and the level 106 ones use a spear in melee.",
    ),
    "Kalphite guardian": lore(
        "A heavily armoured Kalphite that guards the lair.",
        "The Kalphite Lair and Kalphite Cave, beneath the Kharidian Desert.",
        "The caves can be entered south of Shantay Pass and Al Kharid.",
    ),
    Fareed: lore(
        "One of the four guardians of the Diamonds of Azzanadra, bearer of the smoke diamond's fire.",
        "Desert Treasure I.",
        "He can disarm players who fight him up close without ice gloves.",
    ),
    Dessous: lore(
        "A vampyre lord who has territory north of Castle Drakan.",
        "Desert Treasure I.",
        'Malak calls him a "frail and decrepit example of our species".',
    ),
    Damis: lore(
        "One of the four guardians of the Diamonds of Azzanadra, with the shadow diamond's power.",
        "Desert Treasure I.",
        "He's the only guardian who fights purely in melee, and has two forms.",
    ),
    "Kalphite Queen": lore(
        "The strongest of the Kalphites, Kalphiscarabeinae pasha, or KQ.",
        "The Kalphite Lair, beneath the Kharidian Desert.",
        "She uses protection prayers, but only as a hint to which attack styles work best, not to block them.",
    ),

    // The Fremennik lands
    "Rock crab": lore(
        "A crab disguised as a rock, which attacks when you walk by.",
        "Coasts and islands, especially around the Fremennik lands.",
        "They aren't marked on the minimap, which is part of the disguise.",
    ),
    Wolf: lore(
        "A canine predator found in many places.",
        "Various places around Gielinor; level 64 is the most common kind.",
        "Their bones can be chiselled into wolfbone arrowtips.",
    ),
    Cockatrice: lore(
        "A Slayer monster with a gaze that can drain your stats.",
        "The Fremennik Slayer Dungeon, among other places.",
        "A mirror shield or V's shield protects against its piercing gaze, and Slayer level 25 is required.",
    ),
    Yak: lore(
        "A shaggy beast of the northern cold.",
        "A pen just outside Neitiznot, and one on Wyrmscraig.",
        "Yaks are the only creature to drop yak-hide and hair, which are crafted into armour and rope.",
    ),
    "Sea snake young": lore(
        "A venomous young sea snake.",
        "The Miscellania and Etceteria dungeon, open during and after the quest Royal Trouble.",
        "Their poison starts at 7 damage, and a sea snakes Slayer task needs level 40.",
    ),
    "Mountain troll": lore(
        "An aggressive troll patrolling the mountains.",
        "Various mountainous areas.",
        "Trolls regenerate health twice as fast as other monsters.",
    ),
    Basilisk: lore(
        "A Slayer monster with a petrifying gaze.",
        "The Fremennik Slayer Dungeon, among other places.",
        "It needs level 40 Slayer, and a mirror shield or V's shield to fight safely.",
    ),
    Jelly: lore(
        "A quivering Slayer monster.",
        "The Fremennik Slayer Dungeon and the Wilderness Slayer Cave.",
        "It needs level 52 Slayer, and jellies are the only monsters to drop mithril boots.",
    ),
    Dagannoth: lore(
        "A sea-based monster with tentacles.",
        "The Lighthouse basement after Horror from the Deep, the Catacombs of Kourend and Jormungand's Prison.",
        "The Waterbirth Island dungeon has them too, ruled by the three Dagannoth Kings.",
    ),
    Wallasalki: lore(
        "A sea creature that casts powerful water magic.",
        "Throughout the Waterbirth Island Dungeon, and on Grimstone.",
        "They hit much harder than their combat level suggests.",
    ),
    Kurask: lore(
        "A tough-hided Slayer monster.",
        "The Fremennik Slayer Dungeon, among other places.",
        "It needs level 70 Slayer, and can only be hurt with leaf-bladed weapons, broad ammunition or Magic Dart.",
    ),
    "Ice troll": lore(
        "A troll of the ice, level 120 or more.",
        "Met during Desert Treasure I, and in Troll Romance.",
        "Five must be killed in Desert Treasure I to open the cave of the Ice diamond.",
    ),
    "Rock lobster": lore(
        "A crustacean that hides disguised as a boulder.",
        "Room 16 of the Waterbirth Island Dungeon's fifth sub-level.",
        "Its defence is very high, but it's weak to Magic.",
    ),
    "Zombified spawn": lore(
        "A zombie-like spawn that Vorkath summons.",
        "Vorkath's lair.",
        "It explodes if it reaches you, and Vorkath is immune to damage while it lives.",
    ),
    "Dagannoth Rex": lore(
        "The Melee-based Dagannoth King.",
        "The depths of the Waterbirth Island Dungeon.",
        "He's the only monster to drop the Berserker and Warrior rings.",
    ),
    "Dagannoth Supreme": lore(
        "The Ranged-based Dagannoth King.",
        "The depths of the Waterbirth Island Dungeon.",
        "He's the only monster to drop the archers ring and seercull.",
    ),
    "Dagannoth Prime": lore(
        "The Magic-based Dagannoth King.",
        "The depths of the Waterbirth Island Dungeon.",
        "He's the only monster to drop the Seers ring and the Mud battlestaff.",
        "All three kings can drop the rare dragon axe.",
    ),
    Vorkath: lore(
        "A draconic boss, a blue dragon that survived the Fourth Age's dragonkin conflicts.",
        "First met in the quest Dragon Slayer II, as its penultimate boss.",
        'His name roughly translates in the dragonkin tongue as "pathetic failure", "weakling" or "runt".',
        "He was created by Zorgoth.",
    ),

    // Karamja
    Monkey: lore(
        "A primate native to a few islands.",
        "Karamja, Mos Le'Harmless and Ape Atoll, and the Ardougne Zoo.",
        'In OSRS, "monkey" is used loosely for any primate, and "ape" is often interchangeable.',
    ),
    Snake: lore(
        "A slithering serpent, Serpentes Fellis.",
        "Mainly Karamja.",
        "Unlike bush snakes, these snakes don't poison.",
    ),
    "Jungle spider": lore(
        "A spider of the jungle that hides from the minimap.",
        "Karamja and the archipelago east of Yanille.",
        "They show up in the Tai Bwo Wannai Cleanup minigame.",
    ),
    Tribesman: lore(
        "A warrior of Karamja's jungles.",
        "Karamja: near a cauldron by Brimhaven, and in Tai Bwo Wannai village.",
        "They turn up in the Tai Bwo Wannai Cleanup minigame when you hack the jungle bushes.",
    ),
    "Tz-Kih": lore(
        "A volcanic creature, commonly called a bat, and the first enemy of the Fight Caves.",
        "The TzHaar Fight Pits and Fight Caves.",
        "Each hit it lands drains 1 Prayer point, whether it does damage or not.",
    ),
    Jogre: lore(
        "A kind of ogre that lives in jungles.",
        "The jungles of Karamja, and the God Wars Dungeon.",
        "Their slow attacks hit hard, but their defence is low.",
    ),
    "Moss giant": lore(
        "A large giant, tied to places of nature.",
        "Many places, wherever the nature is thick.",
        "They're very popular to train on, with low defence for their level, and weak to fire spells.",
        "They can drop the mossy key.",
    ),
    "Tz-Kek": lore(
        "A man-high blob of lava.",
        "The TzHaar Fight Pits and Fight Caves.",
        "When hit in melee it reflects 1 point of damage back, much like a ring of recoil.",
    ),
    "Lesser demon": lore(
        "The second weakest of the standard demons, above only the imp.",
        "Many dungeons, with one of the strongest free-to-play monsters to fight.",
        "They can drop the rune med helm.",
    ),
    "Tok-Xil": lore(
        "A rocky, golem-like volcanic creature that fires spines.",
        "The TzHaar Fight Pits and Fight Caves.",
        "Its ranged attack reaches 15 tiles.",
    ),
    "Yt-MejKot": lore(
        "A tall, lizard-like volcanic creature that slashes hard.",
        "The TzHaar Fight Cave, from wave 15.",
        "It can restore health to its fellows.",
    ),
    "Yt-HurKot": lore(
        "A volcanic healer that tends to Jad.",
        "The Fight Caves and the Inferno, for their respective Jads.",
        "They're usually called Jad healers.",
    ),
    Elvarg: lore(
        "The green dragon of Crandor, much tougher than an ordinary one.",
        "The dungeon beneath Crandor, in Dragon Slayer I.",
        "Unlike other chromatic dragons, she has a ranged dragonfire attack.",
    ),
    Nezikchened: lore(
        "A level 187 black demon.",
        "Legends' Quest, where he must be defeated three times.",
        'He drains your Prayer at the start of each fight, and calls you "Vacu".',
    ),
    "Ket-Zek": lore(
        "A powerful volcanic creature of the Fight Cave.",
        "The TzHaar Fight Cave, from wave 31.",
        "It attacks in melee and magic, both hard-hitting.",
    ),
    "TzTok-Jad": lore(
        "The boss of the TzHaar Fight Cave minigame, commonly called Jad.",
        "The TzHaar Fight Cave.",
        "At combat level 702 his max hit is 97, enough to kill most players in a blow.",
        "He has three attacks: a melee bite, a ranged one and a magic blast.",
    ),
};
