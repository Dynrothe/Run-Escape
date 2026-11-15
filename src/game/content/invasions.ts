import { Rng } from "../core/Rng";
import { t } from "../i18n";
import { INVADERS, InvaderDef, PocketKind } from "./invaders";
import { ACT_MAPS, CAMPAIGN_MAPS, takesInvocations } from "./maps";
import type { RemixId } from "./remixes";
import type { MapDef, RunEventDef } from "./types";

// Awakened invasions (act-2-fallen-empire.md 8.6, item 1): once all four Act II maps are beaten, a
// campaign run from the Desert on can have one of the four Act II final bosses invade, between 6:00
// and 12:00, bringing a pocket of its map's rule round where it comes (core/rules/invasion.ts). It
// drops a master casket and a boss's coins twice over, and the Collection log counts each.
// Whether a run has one is rolled from its seed on an Rng of its own, so a run without one (and
// every run of a player without the unlock) plays exactly as before.

export const INVASION = {
    // A run's chance of one, on normal and on hard
    chance: 0.25,
    hardChance: 0.5,
    // Seconds of the map's clock it comes between
    from: 360,
    to: 720,
    // Its pocket: tiles across
    size: 24,
    // Its hitpoints: the map's toughest mid-run boss's, times this
    hp: 1.5,
    // A boss's coins (an elite casket's, what a mid-run boss drops), twice over
    coins: [100, 200] as [number, number],
};

// Its own seed off the run's, so the roll never moves the run's Rng
const INVASION_SEED = 0x1a7a5e0d;

// Which remix is the same rule as a pocket: a run with that remix on has it everywhere already, so
// that boss doesn't invade it
const POCKET_REMIX: Record<PocketKind, RemixId> = {
    roots: "overgrown",
    realm: "shadow",
    cold: "frozen",
    dark: "dark",
};

// What's rolled: who, when, with how many hitpoints
export type Invasion = { invader: InvaderDef; at: number; hp: number };

const FIRST_INVASION_MAP = CAMPAIGN_MAPS.findIndex((map) => map.id === "desert");

// The maps invaded: campaign survival runs from the Desert on (those that take invocations
// unremixed, so not the Lumbridge, the Barrows or the Wilderness)
export function takesInvasions(map: MapDef): boolean {
    const index = CAMPAIGN_MAPS.indexOf(map);
    return index >= FIRST_INVASION_MAP && takesInvocations(map);
}

// Open once all four Act II maps are beaten
export function isInvasionOpen(mapVictories: Readonly<Record<string, number>>): boolean {
    return ACT_MAPS.length > 0 && ACT_MAPS.every((map) => (mapVictories[map.id] ?? 0) > 0);
}

// The run's invasion, if it has one: by its seed, on its map, those of its remixes it takes (a
// pocket's rule that's already on doesn't come; with all four, none does). Endless runs don't get
// one: the rounds would bring it again and again.
export function rollInvasion(
    map: MapDef,
    seed: number,
    hard: boolean,
    remixes: readonly string[] = [],
): Invasion | undefined {
    if (!takesInvasions(map) || map.rule || map.lighting) {
        return undefined;
    }
    const rng = new Rng((seed ^ INVASION_SEED) >>> 0);
    if (!rng.chance(hard ? INVASION.hardChance : INVASION.chance)) {
        return undefined;
    }
    const at = Math.round(rng.range(INVASION.from, INVASION.to));
    const choices = INVADERS.filter((invader) => !remixes.includes(POCKET_REMIX[invader.pocket]));
    if (choices.length === 0) {
        return undefined;
    }
    return { invader: rng.pick(choices), at, hp: getInvaderHp(map) };
}

// The map's toughest mid-run boss's hitpoints, times INVASION.hp
export function getInvaderHp(map: MapDef): number {
    const most = Math.max(
        0,
        ...map.events.map((event) =>
            event.kind === "boss" && event.hp !== undefined ? event.hp : 0,
        ),
    );
    return Math.round(most * INVASION.hp);
}

// The invasion as one of the run's events: a mid-run boss
export function invasionEvent(invasion: Invasion): RunEventDef {
    return { at: invasion.at, kind: "boss", enemyId: invasion.invader.id, hp: invasion.hp };
}

export function invaderName(id: string): string {
    const invader = INVADERS.find((i) => i.id === id);
    return invader ? t(`ui.invasion.${invader.pocket}`) : id;
}
