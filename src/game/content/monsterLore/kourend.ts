import { MonsterLore, lore } from "./lore";

// Kourend, Varlamore, Morytania, Prifddinas and the Gauntlet
export const KOUREND_LORE: Record<string, MonsterLore> = {
    // Kourend
    "Guanic bat": lore(
        "A small bat of the Chambers of Xeric.",
        "Inside the Chambers of Xeric.",
        "It can be caught with an insect net for Hunter experience, and once caught can be cooked.",
    ),
    "Swamp crab": lore(
        "A crab that disguises itself as a swampy log.",
        "Swampy parts of Great Kourend.",
        "It attacks like a rock crab, but only notices you from one square away, and resists melee and magic.",
    ),
    Lizard: lore(
        "A big desert lizard, Lacertilia giganteus.",
        "The Kharidian Desert.",
        "It needs level 22 Slayer, and an ice cooler to finish it off.",
    ),
    "Sulphur lizard": lore(
        "A lizard of the Karuulm Slayer Dungeon.",
        "The middle level of the Karuulm Slayer Dungeon, in Mount Karuulm.",
        "It needs level 44 Slayer, and boots that protect you from the volcano's heat.",
    ),
    Lizardman: lore(
        "A reptilian humanoid, secretly created from a native lizard during the 37th decade by King Shayzien VII.",
        "The Kebos Lowlands and Lizardman Canyon.",
        "The king meant them to be his personal army, to enforce his rule.",
    ),
    Bloodveld: lore(
        "A demon that lashes out with a long tongue, whose magic pierces physical defences.",
        "Many dungeons, among them the Slayer caves and the God Wars Dungeon.",
        "It needs level 50 Slayer.",
    ),
    "Deathly ranger": lore(
        "A ghostly archer in the tightrope room of the Chambers of Xeric.",
        "The Chambers of Xeric, in the tightrope room.",
        "They attack anyone who tries to cross the tightrope.",
    ),
    "Deathly mage": lore(
        "A ghostly mage in the tightrope room of the Chambers of Xeric.",
        "The Chambers of Xeric, in the tightrope room.",
        "Solo players meet two of them, with two deathly rangers.",
    ),
    "Lizardman brute": lore(
        "A stronger lizardman that fights in melee.",
        "Lizardman Canyon, the Lizardman Settlement and the Battlefront.",
        "Those in the Battlefront carry a sword and shield, but have the same stats.",
    ),
    "Skeletal mystic": lore(
        "A skeleton mage of the Chambers of Xeric.",
        "The Chambers of Xeric.",
        "It uses two kinds of magic, including a damaging form of Vulnerability, as well as melee.",
    ),
    Hydra: lore(
        "A draconic creature made by the dragonkin Karuulm.",
        "The lower level of the Karuulm Slayer Dungeon, in Mount Karuulm.",
        "It needs level 95 Slayer, and only Konar assigns it.",
    ),
    Spawn: lore(
        "A spawn of the Abyssal Sire's lair.",
        "The Abyssal Sire's fight.",
        "If not killed within 12 seconds, it matures into a scion.",
    ),
    "Spawn of Sarachnis": lore(
        "A spider summoned by Sarachnis during her fight.",
        "The Forthos Dungeon, in Sarachnis's lair.",
        "The blue ones attack with magic and the orange ones in melee.",
    ),
    "Reanimated demon spawn": lore(
        "A demon raised during the fight with Skotizo.",
        "Skotizo's lair, in the Catacombs of Kourend.",
        'They appear when Skotizo chants "Gar mulno ful taglo!", and up to three can be alive at a time.',
    ),
    "Lizardman shaman": lore(
        "A giant reptilian humanoid, stronger than the ordinary lizardmen and their brutes.",
        "Lizardman Canyon, the Lizardman Settlement and the Battlefront.",
        "They're sought for their dragon warhammer drops.",
    ),
    Sarachnis: lore(
        "The mother of the temple spiders, a mid-level boss.",
        "The Forthos Dungeon, in a former burial tomb south of the Spider Den.",
        "Her unique drops include the Sarachnis cudgel, and the pristine spider silk.",
    ),
    Skotizo: lore(
        "A demonic boss beneath the Catacombs of Kourend.",
        "Beneath the Catacombs of Kourend, reached with a dark totem on the altar.",
        "He's known for his guaranteed hard clue scroll drops, and ancient shards.",
    ),
    "Alchemical Hydra": lore(
        "The boss version of the hydra, a creation of the dragonkin Karuulm, who saw it as a failure.",
        "The lower level of the Karuulm Slayer Dungeon, in Mount Karuulm.",
        "It needs level 95 Slayer.",
    ),

    // Varlamore
    "Embertailed jerboa": lore(
        "A small desert rodent with a fiery tail.",
        "The Avium Savannah.",
        "It's caught with a box trap at level 39 Hunter, for its tail.",
    ),
    "Pyre fox": lore(
        "A fiery fox of the savannah.",
        "The Avium Savannah, south-east of the Hunters' Guild.",
        "It's caught with a deadfall trap at level 57 Hunter.",
    ),
    "Sunlight antelope": lore(
        "A bright antelope of the savannah.",
        "The Avium Savannah, east of the Locus Oasis.",
        "It's caught with a pitfall trap at level 72 Hunter.",
    ),
    "Moonlight antelope": lore(
        "A pale antelope found underground.",
        "Underground in the Hunter Guild, south past the moonlight moths.",
        "It's caught with a pitfall trap at level 91 Hunter.",
    ),
    "Blood jaguar": lore(
        "A jaguar summoned by the Blood Moon.",
        "The Blood Moon's fight, in Perilous Moons.",
        "They appear in a circle round the boss, and only one, in front of Eyatlalli's glyph, can be attacked.",
    ),
    "Serpent shaman": lore(
        "A shaman of the Fortis Colosseum.",
        "The Fortis Colosseum.",
        "It casts accurate Water Surge from 10 tiles away.",
    ),
    "Jaguar warrior": lore(
        "A jaguar-like fighter of the Fortis Colosseum.",
        "The Fortis Colosseum.",
        "Its attack is three separate hits, each with its own accuracy and strength roll.",
    ),
    "Sulphur nagua": lore(
        "A Slayer monster of Neypotzli.",
        "The Ancient Prison within Neypotzli.",
        "It needs level 48 Slayer, and hits twice per attack.",
    ),
    "Fremennik warband archer": lore(
        "An archer of a Fremennik warband.",
        "The Fortis Colosseum, at the start of each wave.",
        "It comes with a warband seer and berserker.",
    ),
    "Fremennik warband seer": lore(
        "A seer of a Fremennik warband.",
        "The Fortis Colosseum, at the start of each wave.",
        "It comes with a warband archer and berserker.",
    ),
    "Fremennik warband berserker": lore(
        "A berserker of a Fremennik warband.",
        "The Fortis Colosseum, at the start of each wave.",
        "It comes with a warband seer and archer.",
    ),
    "Frost nagua": lore(
        "A frozen Slayer monster.",
        "The Ruins of Tapoyauik, from the Twilight Temple.",
        "It needs level 48 Slayer, and The Heart of Darkness must be done to get there.",
    ),
    Gryphon: lore("A winged Slayer monster.", "The Great Conch.", "It needs level 51 Slayer."),
    Minotaur: lore(
        "A bull-headed monster.",
        "The first level of the Stronghold of Security, and the Fortis Colosseum.",
        "It drops the right skull half of the skull sceptre.",
        "Its defence is low but its attack is high.",
    ),
    Manticore: lore(
        "A beast of the Fortis Colosseum, which charges a triple attack with all three combat styles.",
        "The Fortis Colosseum, from wave 4.",
        "Its attack range is 15 tiles.",
    ),
    "Shockwave Colossus": lore(
        "A huge magic-using colossus.",
        "The Fortis Colosseum.",
        "Its attack range is 15 tiles, and it spawns in pairs with the Dynamic Duo handicap.",
    ),
    "Javelin Colossus": lore(
        "A huge ranged colossus that throws javelins.",
        "The Fortis Colosseum.",
        "Every fifth attack it launches a javelin high in the air to land on your position.",
    ),
    "Sol Heredit": lore(
        "The final boss of the Fortis Colosseum.",
        "The Fortis Colosseum, at wave 12.",
        "At combat level 1,563 he is the second strongest monster in OSRS.",
        "He addresses you and jumps off his throne to begin the fight.",
    ),

    // Morytania
    Ghast: lore(
        "A lingering soul of someone who starved to death in Mort Myre Swamp.",
        "Mort Myre Swamp.",
        "When they first appear they're invisible, and try to turn food into rotten food.",
    ),
    "Vampyre juvenile": lore(
        "The lowest rank of vampyre, a former human.",
        "The woods east of Burgh de Rott, Meiyerditch, the lower parts of Darkmeyer and Crombwick Manor.",
        "Any weapon can hurt them, but they turn to mist and retreat at 25% health.",
    ),
    Zombie: lore(
        "A shambling corpse.",
        "Cemeteries, sewers and dungeons throughout Gielinor.",
        "Zombies count as undead and are weak to the Salve amulet and Crumble Undead.",
    ),
    "Fiyr shade": lore(
        "An undead, spectral creature behind the silver door.",
        "The Mort'ton shade catacombs.",
        "Fiyr shades appear first as black shadows on the ground before they rise.",
    ),
    Werewolf: lore(
        "A human by day who becomes a wolf when attacked.",
        "Canifis, in Morytania.",
        "They look like level 24 humans until attacked, then transform into level 88 werewolves, unless you wield Wolfbane.",
    ),
    "Vampyre juvinate": lore(
        "A vampyre one step above the juveniles.",
        "The woods east of Burgh de Rott, outside Ver Sinhaza in Meiyerditch, and Darkmeyer.",
        'They\'re "initiated juveniles" who have had some training.',
    ),
    "Nail beast": lore(
        "A monster of the Temple Trekking minigame.",
        "All three paths of Temple Trekking.",
        "It's the only monster to drop nail beast nails, and its level depends on the path you chose.",
    ),
    "Mutated bloodveld": lore(
        "A stronger variant of the bloodveld.",
        "The Catacombs of Kourend, Iorwerth Dungeon and the Meiyerditch and Buccaneers' Laboratories.",
        "It needs level 50 Slayer, and its attacks are magic-based melee.",
    ),
    "Nylocas Ischyros": lore(
        "A melee-based Nylocas of the Theatre of Blood.",
        "The wave before the Nylocas Vasilias encounter, and the Verzik Vitur fight.",
        "They spawn with the Toxobolos and Hagios as they try to destroy the pillars.",
    ),
    "Nylocas Toxobolos": lore(
        "A ranged-based Nylocas of the Theatre of Blood.",
        "The wave before the Nylocas Vasilias encounter, and the Verzik Vitur fight.",
        "They spawn with the Hagios and Ischyros as they try to destroy the pillars.",
    ),
    "Nylocas Hagios": lore(
        "A magic-based Nylocas of the Theatre of Blood.",
        "The wave before the Nylocas Vasilias encounter, and the Verzik Vitur fight.",
        "They spawn with the Toxobolos and Ischyros as they try to destroy the pillars.",
    ),
    Vyrewatch: lore(
        "The vampyric vanguard that enforces Morytania's racial policy for the Drakan overlords.",
        "Meiyerditch and Darkmeyer.",
        "In Meiyerditch they're not aggressive, but can turn so if you're near.",
    ),
    "Vyrewatch Sentinel": lore(
        "A stronger Vyrewatch.",
        "The upper-class streets of Darkmeyer, after Sins of the Father.",
        "They prowl for unruly humans to snack on.",
    ),
    "Vanstrom Klause": lore(
        "A vampyre noble, formerly Ascertes Hallow, one of Lord Lowerniel Drakan's henchmen and leader of the Vyrewatch.",
        "Morytania, in the Myreque quests.",
        "He's a main antagonist of the Myreque, the guerrilla fighters of Morytania.",
    ),
    "Pestilent Bloat": lore(
        "The second encounter of the Theatre of Blood.",
        "The Theatre of Blood.",
        'A crazed vampyre called "The Butcher" made it at Verzik Vitur\'s request.',
    ),
    Sotetseg: lore(
        "The fourth encounter of the Theatre of Blood, a dark beast corrupted through Haemalchemy.",
        "The Theatre of Blood.",
        "Despite its nature, it doesn't count for a dark beast Slayer task.",
    ),
    "Blood spawn": lore(
        "A creature that spawns during the Maiden of Sugadinti fight.",
        "The Theatre of Blood.",
        "Up to eight can spawn, and they wander the arena leaving a trail of blood.",
    ),
    "Nylocas Matomenos": lore(
        "A Nylocas that spawns in the Maiden's and Verzik's fights.",
        "The Theatre of Blood.",
        "If it reaches the Maiden it heals her for double its remaining hitpoints.",
    ),
    "Verzik Vitur": lore(
        "Lady Verzik Vitur, a vampyre who rules Ver Sinhaza.",
        "Ver Sinhaza, in the Theatre of Blood.",
        "She's the hostess and the final boss of the Theatre of Blood.",
    ),

    // Prifddinas and the Gauntlet
    "Crystalline rat": lore(
        "A low-level monster of the Gauntlet.",
        "The Gauntlet.",
        "Up to three low-level monsters spawn in a room, and the Corrupted Gauntlet has its own version.",
    ),
    "Crystalline bat": lore(
        "A low-level monster of the Gauntlet.",
        "The Gauntlet.",
        "Up to three low-level monsters spawn in a room.",
    ),
    "Crystalline spider": lore(
        "A low-level monster of the Gauntlet.",
        "The Gauntlet.",
        "Up to three low-level monsters spawn in a room.",
    ),
    "Crystalline scorpion": lore(
        "A mid-level monster of the Gauntlet.",
        "The Gauntlet.",
        "Mid-level monsters always spawn in pairs.",
    ),
    "Crystalline wolf": lore(
        "A mid-level monster of the Gauntlet.",
        "The Gauntlet.",
        "Mid-level monsters always spawn in pairs.",
    ),
    Guard: lore(
        "A town guard, weak and not aggressive unless attacked.",
        "Falador, Varrock, Ardougne and other cities, and south of the Wilderness ditch at Edgeville.",
        "Guards are level 19 to 22.",
    ),
    "Iorwerth Warrior": lore(
        "A warrior of the Iorwerth clan of elves.",
        "The Iorwerth Camp just south-west of Prifddinas.",
        "They feature heavily in the quest Regicide.",
    ),
    "Iorwerth Archer": lore(
        "An archer of the Iorwerth clan of elves.",
        "The Iorwerth Camp just south-west of Prifddinas.",
        "They feature heavily in the quest Regicide.",
    ),
    "Crystalline bear": lore(
        "A mini-boss of the Gauntlet that attacks in melee.",
        "The Gauntlet, at the edges of the map.",
        "Mini-bosses always spawn alone.",
    ),
    Snakeling: lore(
        "A snakeling summoned by Zulrah.",
        "Zulrah's shrine.",
        "They come in a melee kind and a magic kind, and die when Zulrah does.",
    ),
    "Crystalline dark beast": lore(
        "A mini-boss of the Gauntlet that attacks with Ranged.",
        "The Gauntlet, at the edges of the map.",
        "Unlike ordinary dark beasts, it doesn't have a Slayer task.",
    ),
    "Corrupted wolf": lore(
        "A mid-level monster of the Corrupted Gauntlet.",
        "The Corrupted Gauntlet.",
        "It's the counterpart of the Crystalline Wolf.",
    ),
    "Corrupted scorpion": lore(
        "A mid-level monster of the Corrupted Gauntlet.",
        "The Corrupted Gauntlet.",
        "It's the counterpart of the Crystalline Scorpion.",
    ),
    "Corrupted bear": lore(
        "A mini-boss of the Corrupted Gauntlet that attacks in melee.",
        "The Corrupted Gauntlet.",
        "It's the counterpart of the Crystalline Bear.",
    ),
    "Corrupted dark beast": lore(
        "A mini-boss of the Corrupted Gauntlet that attacks with Ranged.",
        "The Corrupted Gauntlet.",
        "It's the counterpart of the Crystalline Dark Beast.",
    ),
    Zulrah: lore(
        "A level 725 solo-only snake boss.",
        "Zulrah's shrine, reached after Regicide.",
        "You must offer yourself as the sacrifice in place of the gnome child, speaking to High Priestess Zul-Harcinqa.",
    ),
    Zalcano: lore(
        "A demon imprisoned beneath Prifddinas, fought through skilling rather than conventional combat.",
        "Beneath Prifddinas.",
        "She's immune to ordinary damage, and you use Mining, Smithing and Runecraft to destroy her stone armour.",
    ),
    "Crystalline Hunllef": lore(
        "The boss of the Gauntlet.",
        "The Gauntlet.",
        "Its counterpart in the Corrupted Gauntlet is the Corrupted Hunllef.",
    ),
    "Corrupted Hunllef": lore(
        "The boss of the Corrupted Gauntlet.",
        "The Corrupted Gauntlet.",
        "Its counterpart in the Gauntlet is the Crystalline Hunllef.",
    ),
};
