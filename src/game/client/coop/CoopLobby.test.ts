import { parseRoomCode } from "./CoopLobby";

describe("room codes", () => {
    it("takes the code out of a pasted invite link", () => {
        expect(parseRoomCode("https://example.com/game/?room=NVKDS")).toBe("NVKDS");
        expect(parseRoomCode("http://localhost:5173/?bgtick&room=nvkds#x")).toBe("NVKDS");
    });

    it("tidies up a typed one", () => {
        expect(parseRoomCode(" nv-kds ")).toBe("NVKDS");
        expect(parseRoomCode("ABCDEFG")).toBe("ABCDE");
        expect(parseRoomCode("")).toBe("");
    });
});
