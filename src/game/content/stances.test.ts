import { getPlayerStance, getPlayerStanceObjIds, getPlayerStanceSeqs } from "./stances";
import { WEAPONS } from "./weapons";

const HELD_OBJS = new Set(WEAPONS.flatMap((w) => w.levels.map((level) => level.objId)));

describe("player stances", () => {
    test("two-handed weapons have their own idle and run", () => {
        expect(getPlayerStance(1319)).toMatchObject({ idle: 2561, run: 2563 }); // Rune 2h sword
        expect(getPlayerStance(11804)).toMatchObject({ idle: 7053, run: 7043 }); // Bandos godsword
        expect(getPlayerStance(27021)).toMatchObject({ idle: 9460, run: 9459 }); // Colossal blade
    });

    test("items with the plain human stance aren't listed", () => {
        expect(getPlayerStance(1333)).toBeUndefined(); // Rune scimitar
        expect(getPlayerStance(20997)).toBeUndefined(); // Twisted bow
        expect(getPlayerStance(-1)).toBeUndefined();
    });

    test("every listed item is one a weapon holds, and listed once", () => {
        const objIds = getPlayerStanceObjIds();
        expect(objIds.filter((objId) => !HELD_OBJS.has(objId))).toEqual([]);
        expect(new Set(objIds).size).toBe(objIds.length);
    });

    test("the slim cache gets every stance's seqs, once each", () => {
        const seqs = getPlayerStanceSeqs();
        expect(new Set(seqs).size).toBe(seqs.length);
        for (const objId of getPlayerStanceObjIds()) {
            const stance = getPlayerStance(objId)!;
            expect(seqs).toContain(stance.idle);
            expect(seqs).toContain(stance.run);
        }
    });
});
