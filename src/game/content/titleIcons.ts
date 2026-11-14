// The title screen's icons: the client's own side tab sprites, and the
// Collection log's item. scripts/cache/slim-cache.ts keeps them in the slim cache.
export const TITLE_TAB_SPRITES = {
    skills: 898,
    quests: 899,
    armoury: 901,
    settings: 908,
} as const;

// The pause menu's tabs: the client's own side tab icons (crossed swords for Combat options,
// the clan chat's for the party), and the title's for the rest. scripts/cache/slim-cache.ts keeps
// them in the slim cache.
export const PAUSE_TAB_SPRITES = {
    loadout: TITLE_TAB_SPRITES.armoury,
    combat: 168,
    quests: TITLE_TAB_SPRITES.quests,
    party: 895,
    settings: TITLE_TAB_SPRITES.settings,
} as const;

// The results' tabs: the skills tab's icon for the summary, the combat tab's for the fighting
export const RESULT_TAB_SPRITES = {
    summary: TITLE_TAB_SPRITES.skills,
    combat: PAUSE_TAB_SPRITES.combat,
} as const;

// Cloud save's button beside Settings: the client's storage chest with an up arrow, and in its
// corner the "!" while it's waiting on the player or the "no" sign while it can't sync
export const CLOUD_SAVE_SPRITES = {
    saved: 1106,
    choose: 937,
    problem: 940,
} as const;

// The client's grey stone slot (the equipment screen's): the squares on the pause menu's quest
// cards. Also kept in the slim cache by scripts/cache/slim-cache.ts.
export const STONE_SLOT_SPRITE = 170;

export const COLLECTION_LOG_OBJ = 22711;

// The client's own back-arrow button, on a bought skill to refund a rank. Also kept in the slim
// cache by scripts/cache/slim-cache.ts.
export const REFUND_SPRITE = 1021;
