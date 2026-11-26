// The notable unique drops a monster has in Old School RuneScape, by the monster's English name
// (EnemyDef.name): the rare or defining ones, not its everyday loot. Checked against the OSRS Wiki.
// A monster with none worth a mention has no entry. In English only.
export const MONSTER_DROPS: Record<string, string[]> = {
    // Barrows
    "Dharok the Wretched": ["Dharok's armour and greataxe"],
    "Karil the Tainted": ["Karil's armour and crossbow"],
    "Torag the Corrupted": ["Torag's armour and hammers"],
    "Guthan the Infested": ["Guthan's armour and spear"],
    "Verac the Defiled": ["Verac's armour and flail"],
    "Ahrim the Blighted": ["Ahrim's armour and staff"],
    "Feral Vampyre": ["Vampyre dust, always"],

    // The Wilderness
    "Revenant imp": ["Craw's bow, Viggora's chainmace and Thammaron's sceptre"],
    "Revenant goblin": ["Craw's bow, Viggora's chainmace and Thammaron's sceptre"],
    "Revenant hobgoblin": ["Craw's bow, Viggora's chainmace and Thammaron's sceptre"],
    "Revenant pyrefiend": ["Craw's bow, Viggora's chainmace and Thammaron's sceptre"],
    "Revenant demon": ["Craw's bow, Viggora's chainmace and Thammaron's sceptre"],
    Ankou: [
        "The left skull half of the skull sceptre, on the Stronghold of Security's fourth level",
    ],
    "Crazy archaeologist": [
        "The fedora, and one of the three shards of the Odium and Malediction wards",
    ],
    "Chaos Fanatic": ["One of the three shards of the Odium and Malediction wards"],
    "King Black Dragon": ["The draconic visage, for the dragonfire shield"],

    // The desert and the Kalphites
    "Kalphite Queen": ["The dragon chainbody, the dragon 2h sword and the Kalphite Queen head"],

    // The Fremennik lands
    Jelly: ["Mithril boots: jellies are the only monsters that drop them"],
    Yak: ["Yak-hide and hair: yaks are the only creature to drop them"],
    Ugthanki: ["Ugthanki meat: they are the only creature to drop it"],
    "Dagannoth Rex": ["The Berserker ring and the Warrior ring, and the dragon axe"],
    "Dagannoth Supreme": ["The archers ring and the seercull, and the dragon axe"],
    "Dagannoth Prime": ["The Seers ring and the Mud battlestaff, and the dragon axe"],
    Vorkath: ["The Dragonbone necklace, the skeletal visage and the Vorki pet"],

    // Karamja
    "Moss giant": ["The mossy key"],
    "Lesser demon": ["The rune med helm, in the free-to-play world"],
    "TzTok-Jad": ["The Fire cape, and the Tzrek-jad pet"],

    // Kourend, Varlamore and Morytania
    "Lizardman shaman": ["The dragon warhammer"],
    Sarachnis: ["The Sarachnis cudgel and pristine spider silk"],
    Skotizo: ["The dark claw, and guaranteed hard clue scrolls"],
    "Alchemical Hydra": ["The Hydra's claw, Hydra leather and the Hydra tail"],
    Minotaur: [
        "The right skull half of the skull sceptre, on the Stronghold of Security's first level",
    ],
    "Sol Heredit": ["Tonalztics of ralos and Dizana's quiver"],
    "Verzik Vitur": ["The Scythe of vitur, the Ghrazi rapier and the Sanguinesti staff"],

    // Prifddinas and the Gauntlet
    Zulrah: ["The tanzanite fang, the serpentine visage and the magic fang"],
    Zalcano: ["The crystal tool seed and the Zalcano shard"],
    "Crystalline Hunllef": ["The enhanced crystal weapon seed and crystal armour seeds"],
    "Corrupted Hunllef": ["The enhanced crystal weapon seed and crystal armour seeds"],

    // The God Wars Dungeon
    Bree: ["The Saradomin sword"],
    "General Graardor": ["Bandos armour and the Bandos hilt"],
    "Commander Zilyana": ["The Saradomin sword, the Armadyl crossbow and the Saradomin hilt"],
    "Kree'arra": ["Armadyl armour and the Armadyl hilt"],
    "K'ril Tsutsaroth": ["The Zamorakian spear, the staff of the dead and the Zamorak hilt"],
    Nex: ["Torva armour, Zaryte vambraces and the ancient hilt"],

    // Hallowed Night
    "The Mimic": ["Third Age equipment"],
    "The Nightmare": ["The Inquisitor's armour and the Nightmare staff"],
    "Phosani's Nightmare": ["The Inquisitor's armour, the Nightmare staff and the parasitic egg"],

    // Act II
    Vardorvis: ["The Ultor ring"],
    "The Whisperer": ["The Bellator ring"],
    "Duke Sucellus": ["The Magus ring"],
    "The Leviathan": ["The Venator ring"],

    // The Tombs of Amascut
    "Tumeken's Warden": ["Tumeken's shadow, the Osmumten's fang and the Lightbearer"],
    "Elidinis' Warden": ["Tumeken's shadow, the Osmumten's fang and the Lightbearer"],
};
