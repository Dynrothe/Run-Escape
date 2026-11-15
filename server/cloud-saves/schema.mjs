// What a cloud save and a sync code look like. They're here rather than in worker.mjs because
// workerd reads every name that module exports as an entrypoint, and a number or a RegExp
// stops the Worker from starting.

// A save's text, as the game exports it. A full one is about 22 KB.
export const MAX_SAVE_BYTES = 65_536;
// And gzipped, as it's stored. A full save is about 5 KB; junk that won't compress is turned
// away, so the database can't be filled, or used to keep anything but saves.
export const MAX_STORED_BYTES = 16_384;
export const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
// A sync code: 120 random bits as 24 characters of Crockford's base32 (no I, L, O or U)
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE = /^[0-9A-HJKMNP-TV-Z]{24}$/;

// Below 0 when a is older than b, above 0 when it's newer, as the game compares them
// (compareGameVersions in src/game/core/save.ts)
export function compareGameVersions(a, b) {
    const [partsA, partsB] = [a, b].map((v) => v.split(".").map((part) => parseInt(part) || 0));
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

// Reads a sync code as a player might type it: any case, with or without dashes and spaces,
// and with O, I and L for 0, 1 and 1
export function normalizeCode(text) {
    if (typeof text !== "string" || text.length > 64) return undefined;
    const code = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    return CODE.test(code) ? code : undefined;
}

export function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    let code = "";
    let bits = 0;
    let value = 0;
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            code += ALPHABET[(value >> bits) & 31];
        }
    }
    return code;
}

// As it's shown to the player: K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC
export const formatCode = (code) => code.match(/.{4}/g).join("-");

// A save as the game sends it: its shape, and what the game shows of it. Undefined when it
// isn't one.
export function readSave(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) {
        return undefined;
    }
    let save;
    try {
        save = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!save || typeof save !== "object" || Array.isArray(save)) return undefined;
    const { version, gameVersion } = save;
    if (!Number.isInteger(version) || version < 1 || version > 10_000) return undefined;
    if (typeof gameVersion !== "string" || !VERSION.test(gameVersion)) return undefined;
    // Fields every save has had, so it's a save and not something else kept here
    const isCount = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
    if (!isCount(save.runs) || !isCount(save.coins)) return undefined;
    const count = (n) => (isCount(n) ? Math.floor(n) : 0);
    const victories =
        save.mapVictories && typeof save.mapVictories === "object" ? save.mapVictories : {};
    return {
        version,
        gameVersion,
        summary: {
            gameVersion,
            runs: count(save.runs),
            victories: count(save.victories),
            totalCoins: count(save.totalCoins),
            mapsBeaten: Object.values(victories).filter((n) => count(n) > 0).length,
        },
    };
}
