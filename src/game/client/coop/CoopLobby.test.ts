import { MAX_LOADOUT_BYTES } from "../../../../server/coop-relay.mjs";
import { getUpgradeLine } from "../../content/armoury";
import { CASKET_GEAR } from "../../content/items";
import { SHOP_UPGRADES } from "../../content/shop";
import { LOCKABLE_ITEMS } from "../../content/unlocks";
import { isMultiplayerShown, makeLoadout, parseRoomCode } from "./CoopLobby";

describe("the Multiplayer button", () => {
    it("only shows with ?multiplayer or on an invite link, for now", () => {
        expect(isMultiplayerShown("")).toBe(false);
        expect(isMultiplayerShown("?bgtick")).toBe(false);
        expect(isMultiplayerShown("?multiplayer")).toBe(true);
        expect(isMultiplayerShown("?multiplayer=1")).toBe(true);
        expect(isMultiplayerShown("?room=ABCDEFGH")).toBe(true);
    });
});

describe("room codes", () => {
    it("takes the code out of a pasted invite link", () => {
        expect(parseRoomCode("https://example.com/game/?room=NVKDS")).toBe("NVKDS");
        expect(parseRoomCode("http://localhost:5173/?bgtick&room=nvkds#x")).toBe("NVKDS");
    });

    it("tidies up a typed one", () => {
        expect(parseRoomCode(" nv-kds ")).toBe("NVKDS");
        expect(parseRoomCode("ABCDEFGHIJ")).toBe("ABCDEFGH");
        expect(parseRoomCode("")).toBe("");
    });
});

describe("loadouts", () => {
    // The relay drops a loadout over its cap, and the player would play without
    // their shop bonuses and Armoury, so the biggest a save can make (every
    // upgrade bought, every item unlocked, all gear upgraded all the way) keeps
    // well under it. Lots more gear could need the cap raised.
    it("stay well under the relay's cap, even for a save with everything", () => {
        const metaStats: Record<string, number> = {};
        for (const upgrade of SHOP_UPGRADES) {
            metaStats[upgrade.stat] =
                (metaStats[upgrade.stat] ?? 0) + upgrade.perRank * upgrade.maxRank;
        }
        const loadout = makeLoadout(
            metaStats,
            LOCKABLE_ITEMS.map((item) => item.id),
            Object.fromEntries(CASKET_GEAR.map((g) => [g.id, getUpgradeLine(g.id).length - 1])),
        );
        expect(JSON.stringify(loadout).length).toBeLessThan(MAX_LOADOUT_BYTES / 2);
    });
});
