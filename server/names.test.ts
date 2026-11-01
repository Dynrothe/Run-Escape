import { DEFAULT_NAME, cleanName, isNameAllowed, playerName } from "./names.mjs";

describe("player names", () => {
    it("are lowercase a-z only", () => {
        expect(cleanName("Gnome Child")).toBe("gnomechild");
        expect(cleanName("  Zezima_99! ")).toBe("zezima");
        expect(cleanName("ÅngströmOmega")).toBe("ngstrmomega");
        expect(cleanName("a".repeat(30))).toHaveLength(16);
    });

    it("keep out the banned words, wherever they are", () => {
        for (const name of ["fuckface", "bigshitter", "xxniggerxx", "Kill Yourself"]) {
            expect(isNameAllowed(name)).toBe(false);
        }
    });

    it("see through digits and symbols standing in for letters", () => {
        expect(isNameAllowed("n1gg3r")).toBe(false);
        expect(isNameAllowed("sh!t")).toBe(false);
        expect(isNameAllowed("f@ggot")).toBe(false);
        // Cleaned first, the digit's gone, and the letter with it
        expect(isNameAllowed(cleanName("n1gger"))).toBe(false);
        expect(isNameAllowed(cleanName("Sh1t Lord"))).toBe(false);
        expect(isNameAllowed(cleanName("b1tch"))).toBe(false);
    });

    it("see through letters held down, and ones that sound alike", () => {
        for (const name of ["fuuuuck", "shiiiit", "faggggot", "niiigger", "phuck", "fuq"]) {
            expect(isNameAllowed(name)).toBe(false);
        }
    });

    it("let ordinary names through", () => {
        for (const name of [
            "assassin",
            "titan",
            "therapist",
            "torpedo",
            "basement",
            "scoundrel",
            "peacock",
            "cocoon",
            "jewel",
            "classic",
            "zezima",
            "woox",
            "lightning",
            "accountant",
            "washington",
            "dickens",
            "analyst",
            "spicy",
            "cockpit",
            "night",
            "bookkeeper",
            "pizza",
        ]) {
            expect(isNameAllowed(name)).toBe(true);
        }
    });

    it("fall back to the default when empty or banned", () => {
        expect(playerName("")).toBe(DEFAULT_NAME);
        expect(playerName("!!!")).toBe(DEFAULT_NAME);
        expect(playerName("shithead")).toBe(DEFAULT_NAME);
        expect(playerName("Lumby Lad")).toBe("lumbylad");
    });
});
