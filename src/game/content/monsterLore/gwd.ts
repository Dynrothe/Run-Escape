import { MonsterLore, lore } from "./lore";

// The God Wars Dungeon, the Inferno and Hallowed Night's guests
export const GWD_LORE: Record<string, MonsterLore> = {
    // The God Wars Dungeon
    Goblin: lore(
        "A scrappy, green-skinned raider, found in huge numbers and often a new adventurer's first real fight.",
        "All around Lumbridge, and in the God Wars Dungeon, among many other places.",
        "In the quest Goblin Diplomacy, two goblin generals nearly go to war over the colour of their armour.",
        "In the God Wars Dungeon they fight in Bandos's army.",
    ),
    Imp: lore(
        "One of the smallest creatures in Gielinor, a darting little demon.",
        "Wizards' Tower, Taverley and other places where magic is practised.",
        "Imps are central to the Imp Catcher quest, because of their beads.",
        "Every so often an imp vanishes in a puff of smoke and reappears a short way off.",
    ),
    Icefiend: lore(
        "A demon made of ice and freezing rock.",
        "The top of Ice Mountain, parts of Varlamore, the south of the God Wars Dungeon, and the Chambers of Xeric's Ice demon fight.",
        "Killing one is one of the three ways to cool down in the Desert heat.",
    ),
    Pyrefiend: lore(
        "A demon made of fire and molten rock.",
        "Slayer caves and dungeons, among them the God Wars Dungeon.",
        "It needs level 30 Slayer, and pyrefiends and harpie bug swarms are the only monsters to drop steel boots.",
    ),
    Hobgoblin: lore(
        "A bigger, meaner cousin of the goblin.",
        "Many places, and the God Wars Dungeon.",
        "Outside the God Wars Dungeon they come in a level 28 kind, usually unarmed, and a level 42 one with a spear.",
    ),
    Aviansie: lore(
        "A bird-like creature that fights for Armadyl.",
        "The God Wars Dungeon and Wilderness God Wars Dungeon.",
        "They're found fighting the followers of Zamorak.",
    ),
    "Knight of Saradomin": lore(
        "A hard-hitting soldier of Saradomin.",
        "The God Wars Dungeon, in the main area and Saradomin's Encampment.",
        "They're hard to kill, but their defence is low.",
    ),
    "Saradomin priest": lore(
        "A priest of Saradomin that casts Saradomin Strike.",
        "The God Wars Dungeon, in the main area and Saradomin's Encampment.",
        "A successful hit drains 1 Prayer point, which Protect from Magic negates.",
    ),
    Ork: lore(
        "A stocky, green-skinned humanoid with small tusks.",
        "The God Wars Dungeon, in the army of Bandos.",
        "They wield big axes and maces, and can hit up to 12.",
    ),
    "Spiritual ranger": lore(
        "A powerful Ranged Slayer monster.",
        "The God Wars Dungeon.",
        "There are five kinds, for Saradomin, Zamorak, Bandos, Armadyl and Zaros, and level 63 Slayer is needed.",
    ),
    Hellhound: lore(
        "A demonic dog, often assigned as a Slayer task to mid- and high-level players.",
        "Many dungeons, including the God Wars Dungeon.",
        "They're mainly killed for their hard clue scroll drops, which are more common than from most monsters.",
    ),
    Ogre: lore(
        "A hulking humanoid, found throughout Gielinor.",
        "The ogre city of Gu'Tanoth, west of Yanille, and the God Wars Dungeon.",
        "The best Slayer spot for them is directly west of Yanille, near Og.",
    ),
    "Spiritual warrior": lore(
        "A powerful melee Slayer monster.",
        "The God Wars Dungeon.",
        "There are five kinds, for Saradomin, Zamorak, Bandos, Armadyl and Zaros, and level 68 Slayer is needed.",
    ),
    Gorak: lore(
        "An aggressive monster of the Gorak Plane, with a typeless melee attack that drains stats.",
        "The Gorak Plane, by fairy ring DIR, and the God Wars Dungeon.",
        "You first meet them in Fairytale II - Cure a Queen, where you slay them for claws.",
    ),
    Cyclops: lore(
        "A big, one-eyed giant.",
        "The Warriors' Guild and the God Wars Dungeon.",
        "They drop plenty of alchable items, so bringing nature and fire runes pays off.",
    ),
    "Spiritual mage": lore(
        "A potent Magic Slayer monster.",
        "The God Wars Dungeon and Wilderness God Wars Dungeon.",
        "Like everything there, it's aggressive to anyone not showing loyalty to its god, and needs level 83 Slayer.",
    ),
    Starlight: lore(
        "A unicorn, a bodyguard of Commander Zilyana.",
        "Saradomin's Encampment, in the God Wars Dungeon.",
        "She is the strongest unicorn in the game, with a melee max hit of 15.",
    ),
    Growler: lore(
        "A bodyguard of Commander Zilyana.",
        "Saradomin's Encampment, in the God Wars Dungeon.",
        "He attacks with an accurate magic attack, max hit 16.",
    ),
    Bree: lore(
        "The centaur bodyguard of Commander Zilyana.",
        "Saradomin's Encampment, in the God Wars Dungeon.",
        "He uses ranged attacks, max hit 16, and can drop the Saradomin sword.",
    ),
    "Wingman Skree": lore(
        "One of Kree'arra's aviansie bodyguards.",
        "Armadyl's Eyrie, in the God Wars Dungeon.",
        "He uses magic, max hit 16, in a modified set of Armadyl armour.",
    ),
    "Flockleader Geerin": lore(
        "One of Kree'arra's aviansie bodyguards.",
        "Armadyl's Eyrie, in the God Wars Dungeon.",
        "She fires ranged attacks, max hit 25, but rarely hits anyone praying against missiles.",
    ),
    "Flight Kilisa": lore(
        "One of Kree'arra's aviansie bodyguards.",
        "Armadyl's Eyrie, in the God Wars Dungeon.",
        "She hits in melee, max hit 15, and is widely thought the most troublesome of the three.",
    ),
    "Tstanon Karlak": lore(
        "One of K'ril Tsutsaroth's bodyguards.",
        "Zamorak's Fortress, in the God Wars Dungeon.",
        "He attacks in melee, max hit 15.",
    ),
    "Zakl'n Gritch": lore(
        "One of K'ril Tsutsaroth's bodyguards.",
        "Zamorak's Fortress, in the God Wars Dungeon.",
        "He throws large snowballs, max hit 21, and counts as a lesser demon for Slayer.",
    ),
    "Balfrug Kreeyath": lore(
        "A three-faced black demon who destroyed the desert city of Ullek in the God Wars, and now serves K'ril Tsutsaroth.",
        "Zamorak's Fortress, in the God Wars Dungeon.",
        "He launches huge fireballs at you.",
    ),
    "Sergeant Strongstack": lore(
        "One of General Graardor's three sergeants.",
        "Bandos's Stronghold, in the God Wars Dungeon.",
        "He fights in melee, drifting to each player in the room.",
    ),
    "Sergeant Steelwill": lore(
        "One of General Graardor's three sergeants.",
        "Bandos's Stronghold, in the God Wars Dungeon.",
        "He uses a magic attack with a max hit of 15.",
    ),
    "Sergeant Grimspike": lore(
        "One of General Graardor's three sergeants.",
        "Bandos's Stronghold, in the God Wars Dungeon.",
        "He fires accurate ranged attacks, max hit 21.",
    ),
    "General Graardor": lore(
        "The leader of Bandos's forces in the God Wars Dungeon, the only known living member of the Ourg race.",
        "Bandos's Stronghold in the God Wars Dungeon, which needs 70 Strength and a hammer to enter.",
        "To enter his quarters you need an ecumenical key, or to have killed enough of his army.",
    ),
    "Commander Zilyana": lore(
        "The appointed leader of Saradomin's forces in the God Wars Dungeon.",
        "Saradomin's Encampment, in the God Wars Dungeon.",
        "She's one of only three known living Icyene, with Safalaan and a full-blooded Icyene met in a quest.",
    ),
    "Kree'arra": lore(
        "One of Armadyl's most trusted generals, and the most powerful surviving aviansie.",
        "Armadyl's Eyrie, in the God Wars Dungeon.",
        "You reach his camp by wielding a crossbow and a mithril grapple.",
    ),
    "K'ril Tsutsaroth": lore(
        "The leader of Zamorak's forces in the God Wars Dungeon.",
        "Zamorak's Fortress, which needs 70 Hitpoints to cross the river.",
        'His name is pronounced "KRILL TUTT-zee-roth".',
    ),
    Nex: lore(
        "One of Zaros's most powerful followers, a nihil from Freneskae with icyene traits.",
        "The Ancient Prison, sealed beneath the God Wars Dungeon.",
        "An immensely powerful weapon of war, she's imprisoned there.",
    ),
    Fumus: lore(
        "One of the four mages guarding Nex, a master of smoke magic.",
        "The Ancient Prison, in the God Wars Dungeon.",
        "He's immobile, and invulnerable until Nex falls below 80% of her hitpoints.",
    ),
    Umbra: lore(
        "One of the four mages guarding Nex, a master of shadow magic.",
        "The Ancient Prison, in the God Wars Dungeon.",
        "She's immobile, and invulnerable until Nex falls below 60%.",
    ),
    Cruor: lore(
        "One of the four mages guarding Nex, a master of blood magic.",
        "The Ancient Prison, in the God Wars Dungeon.",
        "He's immobile, and invulnerable until Nex falls below 40%.",
    ),
    Glacies: lore(
        "One of the four mages guarding Nex, a master of ice magic.",
        "The Ancient Prison, in the God Wars Dungeon.",
        "She's immobile, and invulnerable until Nex falls below 20%.",
    ),

    // The Inferno
    "Jal-Nib": lore(
        "A volcanic creature of the Inferno, usually called a nibbler.",
        "The Inferno.",
        "Several spawn per wave, and they damage the three pillars in the arena until they fall.",
    ),
    "TzHaar-Hur": lore(
        "The weakest monsters in Mor Ul Rek, TzHaar crafters who build the homes and tools of the rest.",
        "Mor Ul Rek, the TzHaar city.",
        "Attacking one angers nearby TzHaar-Ket, TzHaar-Mej and TzHaar-Xil.",
    ),
    "Jal-MejRah": lore(
        "A volcanic creature of the Inferno, usually called a bat.",
        "The Inferno.",
        "It's the apparent ancestor of the Tz-Kih, but drains your run energy rather than your Prayer.",
    ),
    "TzHaar-Xil": lore(
        "An agile TzHaar hunter, who hunts the volcanic creatures for food.",
        "Mor Ul Rek, the TzHaar city.",
        "They made the TzHaar Fight Cave and Fight Pit, for practice and sport.",
    ),
    "TzHaar-Mej": lore(
        "A TzHaar mystic who guides the rest.",
        "Mor Ul Rek, the TzHaar city.",
        'Attacked near stronger TzHaar, he cries "Kot kl, zek e JalYt!", which roughly means "Save me, ...".',
    ),
    "TzHaar-Ket": lore(
        "A TzHaar guard of Mor Ul Rek.",
        "Mor Ul Rek, the TzHaar city.",
        "It turns aggressive if a TzHaar-Hur or TzHaar-Mej within six tiles is attacked.",
    ),
    "Jal-Ak": lore(
        "A volcanic creature of the Inferno, usually called a blob.",
        "The Inferno.",
        "It's the ancestor of the Fight Cave's Tz-Kek, but much more dangerous, and it detects your protection prayer before each attack.",
    ),
    "Jal-AkRek-Ket": lore(
        "A volcanic creature that appears when a Jal-Ak dies.",
        "The Inferno.",
        "It comes alongside a Jal-AkRek-Mej and a Jal-AkRek-Xil.",
    ),
    "Jal-ImKot": lore(
        "A volcanic creature that only fights in melee, but hits extremely hard.",
        "The Inferno.",
        "If it can't reach you, it burrows and comes up next to you.",
    ),
    "Jal-Xil": lore(
        "A volcanic creature, the apparent ancestor of the Tok-Xil.",
        "The Inferno.",
        "It's the same as a Tok-Xil, only with higher combat stats.",
    ),
    "Jal-Zek": lore(
        "A volcanic creature that hits with powerful Magic and Melee attacks.",
        "The Inferno, first at wave 35.",
        "It's the apparent ancestor of the Fight Cave's Ket-Zek, and the third strongest monster in the Inferno.",
        "It has the unique ability to revive fallen monsters.",
    ),
    "JalTok-Jad": lore(
        "A volcanic creature, the apparent ancestor and stronger version of TzTok-Jad.",
        "The Inferno and TzHaar-Ket-Rak's Challenges.",
        "Like TzTok-Jad it attacks in all three styles, and you must pray against the right one.",
    ),
    "Jal-Zek champion": lore(
        "A champion-grade Jal-Zek, among the Inferno's elite.",
        "The Inferno, as one of its late bosses in this game.",
        "A tougher take on the Jal-Zek, the Inferno's third strongest monster.",
    ),
    "TzHaar-Ket champion": lore(
        "A champion-grade TzHaar-Ket, an elite guard of the Inferno.",
        "The Inferno, as one of its late bosses in this game.",
        "A tougher take on the TzHaar-Ket guards of Mor Ul Rek.",
    ),

    // Hallowed Night
    "Slash Bash": lore(
        "An undead ourg, a huge, brutish creature raised from the dead.",
        "The quest Zogre Flesh Eaters.",
        "He attacks with melee and ranged, and his attacks inflict disease, draining a random stat by up to 15.",
    ),
    "The Mimic": lore(
        "A sporadic boss, fought by presenting a mimic casket to the strange casket in Watson's house.",
        "The strange casket upstairs in Watson's house.",
        "Mimic caskets come from elite or master reward caskets, after you ask the strange casket to enable the chance.",
    ),
    "Third Age Warrior": lore(
        "A monster that spawns in the fight with the Mimic.",
        "The Mimic's boss room.",
        "It spawns with the Third Age ranger and mage, and needn't be beaten to win.",
    ),
    "Third Age Ranger": lore(
        "A monster that spawns in the fight with the Mimic.",
        "The Mimic's boss room.",
        "It spawns with the Third Age warrior and mage, and needn't be beaten to win.",
    ),
    "Third Age Mage": lore(
        "A monster that spawns in the fight with the Mimic.",
        "The Mimic's boss room.",
        "It spawns with the Third Age ranger and warrior, and needn't be beaten to win.",
    ),
};
