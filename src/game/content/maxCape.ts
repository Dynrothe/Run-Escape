import { EquipSlot, PlayerAppearance } from "../../rs/model/player/PlayerModelLoader";
import { tr } from "../i18n";

// The Wardrobe's customisable max cape: the max cape in colours the player picks. The cache has
// nine max capes on one model, each the max cape with some of its colours swapped (the god capes,
// the imbued ones, the Accumulator's and Ardougne's), so the parts they paint are the parts a
// player can: each part a colour or a few shades of it, painted as those capes are.

// The cache's second Max cape, the same model as the first (13280), which the store sells as it is
export const CUSTOM_MAX_CAPE = 13342;
export const CUSTOM_MAX_CAPE_NAME = "Customisable max cape";
export const CUSTOM_MAX_CAPE_PRICE = 25_000;

// A colour as the cache packs it: 6 bits of hue, 3 of saturation and 7 of lightness
export type Hsl = number;

export function packHsl(hue: number, saturation: number, lightness: number): Hsl {
    return ((hue & 63) << 10) | ((saturation & 7) << 7) | (lightness & 127);
}

export function unpackHsl(hsl: Hsl): { hue: number; saturation: number; lightness: number } {
    return { hue: (hsl >> 10) & 63, saturation: (hsl >> 7) & 7, lightness: hsl & 127 };
}

// A part of the cape: the max cape's own colours there, the first its main one. A colour picked
// for the part paints the first, and the rest keep their shade against it (lighter or darker).
export type CapePartDef = { id: string; name: string; colours: readonly Hsl[] };

// As seen from behind: the long panel down the middle, the panels either side of it, the edges
// (and the insides of the three pendants), the undersides of the tails, the gold trim, and the
// gems atop the pendants. The collar keeps its own colours, as on every max cape.
export const CAPE_PARTS: readonly CapePartDef[] = [
    { id: "centre", name: "Centre", colours: [815] },
    { id: "sides", name: "Sides", colours: [668, 675] },
    { id: "edges", name: "Edges", colours: [784] },
    { id: "tails", name: "Tails", colours: [673] },
    { id: "trim", name: "Trim", colours: [5683, 5706, 5708, 5714, 4820] },
    { id: "gems", name: "Gems", colours: [945, 972] },
];

export function capePartName(part: CapePartDef): string {
    return tr(`wardrobe.cape_part.${part.id}.name`, part.name);
}

// The max cape's own colours, a part each
export const DEFAULT_CAPE_COLOURS: readonly Hsl[] = CAPE_PARTS.map((part) => part.colours[0]);

// The max capes the cache has on this model, as colours a part each: the max cape's own, and
// what each other one swaps each part's main colour for (scripts/cache/check-items.ts checks
// them against the cache)
export const CAPE_PRESETS: readonly { objId: number; colours: readonly Hsl[] }[] = [
    { objId: 13280, colours: DEFAULT_CAPE_COLOURS },
    // Saradomin, Zamorak and Guthix
    { objId: 13331, colours: [115, 43924, 43924, 111, 5683, 945] },
    { objId: 13333, colours: [12, 0, 926, 12, 5683, 945] },
    { objId: 13335, colours: [22439, 33690, 22426, 36783, 5683, 945] },
    // Imbued
    { objId: 21776, colours: [43924, 115, 115, 43924, 5683, 945] },
    { objId: 21780, colours: [668, 0, 12, 0, 5683, 945] },
    { objId: 21784, colours: [36783, 22426, 36783, 33690, 5683, 945] },
    { objId: 34625, colours: [22, 8, 8, 12, 49575, 55207] },
    // Accumulator and Ardougne
    { objId: 13337, colours: [10407, 16536, 10291, 103, 5683, 945] },
    { objId: 20760, colours: [43292, 47777, 0, 8, 5683, 945] },
];

// The cape's colours as a save or another player's game has them (which could be anything): a
// colour for each part, or undefined for the max cape's own
export function cleanCapeColours(raw: unknown): Hsl[] | undefined {
    if (
        !Array.isArray(raw) ||
        raw.length !== CAPE_PARTS.length ||
        !raw.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffff)
    ) {
        return undefined;
    }
    return sameCapeColours(raw, DEFAULT_CAPE_COLOURS) ? undefined : raw.slice();
}

export function sameCapeColours(
    a: readonly Hsl[] | undefined,
    b: readonly Hsl[] | undefined,
): boolean {
    const left = a ?? DEFAULT_CAPE_COLOURS;
    const right = b ?? DEFAULT_CAPE_COLOURS;
    return left.length === right.length && left.every((c, i) => c === right[i]);
}

// What the cape's model repaints for these colours, as pairs of from and to
// (PlayerAppearance.recolors): only the parts that aren't the max cape's own, so those stay
// exactly as the cache has them
export function getCapeRecolors(colours: readonly Hsl[]): number[] {
    const pairs: number[] = [];
    CAPE_PARTS.forEach((part, i) => {
        const picked = colours[i];
        if (picked === undefined || picked === part.colours[0]) {
            return;
        }
        const { hue, saturation, lightness } = unpackHsl(picked);
        const main = unpackHsl(part.colours[0]).lightness;
        for (const from of part.colours) {
            const shade = lightness + unpackHsl(from).lightness - main;
            pairs.push(from, packHsl(hue, saturation, Math.min(127, Math.max(0, shade))));
        }
    });
    return pairs;
}

// Puts the colours on the appearance's cape if it's the customisable one, and takes them off if
// it isn't (gear from a run over it)
export function applyCapeColours(
    appearance: PlayerAppearance,
    colours: readonly Hsl[] | undefined,
): void {
    const { [EquipSlot.CAPE]: _cape, ...others } = appearance.recolors ?? {};
    const pairs =
        colours && appearance.equipment[EquipSlot.CAPE] === CUSTOM_MAX_CAPE
            ? getCapeRecolors(colours)
            : [];
    if (pairs.length > 0) {
        appearance.recolors = { ...others, [EquipSlot.CAPE]: pairs };
    } else if (Object.keys(others).length > 0) {
        appearance.recolors = others;
    } else {
        delete appearance.recolors;
    }
}
