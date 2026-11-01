import {
    PLAYER_ADJECTIVES,
    PLAYER_NOUNS,
    ROOM_ADJECTIVES,
    ROOM_NOUNS,
    playerName,
    readableName,
    roomName,
} from "./name-gen.mjs";

describe("generated names", () => {
    it("are two words from the lists", () => {
        for (let i = 0; i < 50; i++) {
            const [adjective, noun, ...rest] = playerName().split(" ");
            expect(PLAYER_ADJECTIVES).toContain(adjective);
            expect(PLAYER_NOUNS).toContain(noun);
            expect(rest).toEqual([]);
            const [place, where] = roomName().split(" ");
            expect(ROOM_ADJECTIVES).toContain(place);
            expect(ROOM_NOUNS).toContain(where);
        }
    });

    it("have no repeated words, so every pair's as likely as the next", () => {
        for (const words of [PLAYER_ADJECTIVES, PLAYER_NOUNS, ROOM_ADJECTIVES, ROOM_NOUNS]) {
            expect(new Set(words).size).toBe(words.length);
            for (const word of words) {
                expect(word).toMatch(/^[A-Z][a-z]+$/);
            }
        }
    });

    it("skip names that are taken", () => {
        const taken = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const name = playerName((n: string) => taken.has(n));
            expect(taken.has(name)).toBe(false);
            taken.add(name);
        }
    });

    it("put a number on the end once every pair tried is taken", () => {
        const name = readableName(["Brave"], ["Goblin"], (n: string) => n === "Brave Goblin");
        expect(name).toBe("Brave Goblin 2");
        const later = readableName(["Brave"], ["Goblin"], (n: string) => !n.endsWith(" 4"));
        expect(later).toBe("Brave Goblin 4");
    });
});
