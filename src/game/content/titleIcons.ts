// The title screen's icons: the client's own side tab sprites, and the
// Collection log's item. scripts/cache/slim-cache.ts keeps them in the slim cache.
export const TITLE_TAB_SPRITES = {
    skills: 898,
    quests: 899,
    armoury: 901,
    settings: 908,
} as const;

// Cloud save's button beside Settings: the client's storage chest with an up arrow, and in its
// corner the "!" while it's waiting on the player or the "no" sign while it can't sync
export const CLOUD_SAVE_SPRITES = {
    saved: 1106,
    choose: 937,
    problem: 940,
} as const;

export const COLLECTION_LOG_OBJ = 22711;

// The client's own back-arrow button, on a bought skill to refund a rank. Also kept in the slim
// cache by scripts/cache/slim-cache.ts.
export const REFUND_SPRITE = 1021;
