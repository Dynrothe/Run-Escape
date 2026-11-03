import { getPassive } from "./passives";

describe("passive prayer icons", () => {
    test.each([
        ["chivalry", 945],
        ["piety", 946],
        ["rigour", 1420],
        ["augury", 1421],
    ] as const)("%s uses its enabled prayer sprite", (id, spriteId) => {
        expect(getPassive(id).iconSpriteId).toBe(spriteId);
    });
});
