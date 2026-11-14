// Each quest's icon: an item the OSRS quest is known by (the one it's about, or what it gives), by
// cache id. Look ids up with scripts/cache/find-objs.ts. A quest with none shows the quest tab's icon.
export const QUEST_ICON_OBJ_IDS: Record<string, number> = {
    ernest_the_chicken: 4566, // Rubber chicken
    goblin_diplomacy: 288, // Goblin mail
    imp_catcher: 1474, // Black bead
    the_restless_ghost: 552, // Ghostspeak amulet
    vampyre_slayer: 1549, // Stake
    shades_of_mortton: 3430, // Sacred oil(4)
    sins_of_the_father: 24699, // Blisterwood flail
    the_dig_site: 670, // Specimen brush
    desert_treasure: 4675, // Ancient staff
    contact: 13136, // Desert amulet 4
    horror_from_the_deep: 6155, // Dagannoth hide
    troll_stronghold: 3105, // Climbing boots
    royal_trouble: 1704, // Amulet of glory
    dragon_slayer_ii: 21895, // Dragon kiteshield
    monkey_madness: 4024, // Ninja monkey greegree
    dragon_slayer: 1540, // Anti-dragon shield
    legends_quest: 6739, // Dragon axe
    a_kingdom_divided: 13379, // Shayzien helm (5)
    perilous_moons: 29010, // Eclipse Moon helm
    nature_spirit: 2963, // Silver sickle (b)
    darkness_of_hallowvale: 16492, // Stake
    a_night_at_the_theatre: 22405, // Vial of blood
    temple_of_ikov: 88, // Boots of lightness
    the_frozen_door: 3741, // Frozen key
    secrets_of_the_north: 11804, // Bandos godsword
    roving_elves: 23943, // Elven signet
    regicide: 843, // Oak shortbow
    song_of_the_elves: 23808, // Crystal seed
    nibblers_begone: 1615, // Dragonstone
    jad_what_are_you_doing_here: 6570, // Fire cape
    the_inferno: 21295, // Infernal cape
    zogre_flesh_eaters: 4812, // Zogre bones
    trick_or_treat: 1959, // Pumpkin
    sleeping_giants: 24417, // Inquisitor's mace
    dream_mentor: 24425, // Eldritch Nightmare staff
    a_souls_bane: 24424, // Volatile Nightmare staff
    the_owls_judgement: 24288, // Dagon'hai hat
    ratcatchers: 1985, // Cheese
    demon_slayer: 8279, // Silverlight
    pirates_treasure: 8950, // Pirate hat
};

// The Slayer skill's icon (a skull), a kill quest's mark of the creatures it's after.
// client/GameAssets.ts keeps it in the slim cache.
export const SLAYER_SPRITE_ID = 216;
