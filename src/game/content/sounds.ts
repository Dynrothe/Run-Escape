// Sound effects that aren't tied to an enemy or weapon. Ids are the client's
// own (names from the OSRS Wiki's list of sound ids, and RuneLite's
// SoundEffectID). There's no level up sound effect in OSRS (that's a music
// jingle), so the quiz "correct" chime stands in.
export const SOUNDS = {
    playerHit: [513, 514, 515], // human_hit, human_hit2, human_hit3
    playerDeath: 512, // human_death
    bones: 933, // ping
    coins: 2115, // coins
    food: 2393, // eat
    casket: 50, // casket_open
    levelUp: 2309, // quiz_correct
    cannonSetup: 2876, // mcannon_setup
    cannonFire: 1667, // mcannon_fire
    bossSpawn: 1897, // regular_vampire_appear
    revive: 2671, // prayer_boost
    click: 2266, // interface_select1
    denied: 2268, // interface_wrong
    buy: 2115, // coins
    // Reward caskets
    casketDrop: 2739, // item_drop
    casketPickup: 2582, // item_pickup
    casketRattle: 2266, // interface_select1
    coinShower: 3924, // ge_coin_tinkle
    // The sting when the item comes out, by its rarity
    revealCommon: 3928, // ge_collect_bloop
    revealUncommon: 3929, // ge_increment_plop
    revealRare: 3925, // ge_add_offer_dingaling
    revealVeryRare: 3813, // town_crier_bell_ding
    alch: 2115, // coins
    // Utility items
    potion: 2671, // prayer_boost
    bonecrusher: 2738, // bury_bones
    chinchompa: 163, // firewave_hit
    lamp: 200, // teleport_vwoop
    // A level up's rewards rolled again
    reroll: 200, // teleport_vwoop
    // A task done that brings in an adventurer
    taskDone: 3813, // town_crier_bell_ding
};
