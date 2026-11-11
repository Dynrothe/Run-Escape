// The world's English (locales/en/world.json): what enemies, bosses, maps, raids, random events,
// the pumpkins and the floors say. The texts stay in the content's .ts files; this reads them off
// the definitions. Keys: enemy.*, boss.*, fun.*, map.*, raid.*, event.*, nightmare.*, phosani.*,
// zachariah.*, tob.*, pumpkin.*, floor.*, act.*, invocation.* (a run's), relic.*, remix.*,
// gauntlet.*
//
// The Sim emits these texts as they are in English and the drawing layer calls tl(text) on them,
// so each one is here with the literal the Sim emits. Boss attacks' own names
// (BossAttackDef.name) are keys in Sim.ts and aren't here.
import { ACTS, actSlotKey } from "../../../src/game/content/acts";
import { ENEMIES } from "../../../src/game/content/enemies";
import * as demos from "../../../src/game/content/floorDemos";
import { FUN_MAPS } from "../../../src/game/content/fun/maps";
import { BLESSINGS } from "../../../src/game/content/gauntlet";
import { RUN_INVOCATIONS } from "../../../src/game/content/invocations";
import { MAPS } from "../../../src/game/content/maps";
import { RAID_MAPS, RAID_SUPPLIES, RAID_SUPPLY_CHEST } from "../../../src/game/content/raids";
import { RANDOM_EVENTS } from "../../../src/game/content/randomEvents";
import { RELICS } from "../../../src/game/content/relics";
import { REMIXES } from "../../../src/game/content/remixes";
import { PUMPKIN_OUTCOMES } from "../../../src/game/content/trickOrTreat";
import type { EnemyDef, MapDef, RandomEventDef } from "../../../src/game/content/types";
import { createWardensFloor } from "../../../src/game/content/wardensFloor";

type Messages = Record<string, string>;

// A place in a list isn't a key: a line moved or added would hand its translation to another.
// A key with a list index in it names its line by the line's text instead (enemy.<id>.chat.<id>),
// so a changed line is a new key, and i18n.test fails on the old one's translations until
// they're dropped.
function listKey(key: string, text: string): string {
    if (!/\.\d+(?=\.|$)/.test(key)) {
        return key;
    }
    // FNV-1a, in base 36
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    }
    return key.replace(/\.\d+(?=\.|$)/g, "") + "." + (hash >>> 0).toString(36);
}

function put(messages: Messages, at: string, text: string | undefined) {
    if (text === undefined || text === "") {
        return;
    }
    const key = listKey(at, text);
    if (messages[key] !== undefined && messages[key] !== text) {
        throw new Error(`world: ${key} has two texts: ${messages[key]} / ${text}`);
    }
    messages[key] = text;
}

// The fields of a boss's definition (BossDef, under `boss.`) that hold something said or shown.
// Attack names, ids and colours (look.title is a CSS colour) aren't.
const BOSS_TEXT_LEAVES = new Set([
    "message",
    "shout",
    "title",
    "subtitle",
    "status",
    "endMessage",
    "wakeMessage",
    "resistShout",
    "shieldMessage",
    "blastMessage",
]);

function walkBoss(
    messages: Messages,
    id: string,
    value: unknown,
    path: string[],
    effects: Messages,
) {
    if (typeof value === "string") {
        const leaf = path[path.length - 1];
        const rest = path.join(".");
        if (path[0] === "look") {
            return;
        }
        if (path[0] === "attacks") {
            // attacks.<i>.shout|message are enemy.<id>.attack.<i>.shout|message
            if (/^attacks\.\d+\.(shout|message)$/.test(rest)) {
                put(messages, `enemy.${id}.${rest.replace(/^attacks\./, "attack.")}`, value);
            }
            return;
        }
        if (BOSS_TEXT_LEAVES.has(leaf)) {
            put(messages, `boss.${id}.${rest}`, value);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, i) => walkBoss(messages, id, item, [...path, String(i)], effects));
    } else if (value !== null && typeof value === "object") {
        const object = value as Record<string, unknown>;
        // A debuff the attack puts on the player: boss.effect.<id>
        if (object.kind === "debuff" || object.kind === "drowsy" || "iconObjId" in object) {
            if (typeof object.id === "string" && typeof object.name === "string") {
                put(effects, `boss.effect.${object.id}`, object.name);
            }
        }
        for (const [k, v] of Object.entries(object)) {
            walkBoss(messages, id, v, [...path, k], effects);
        }
    }
}

function enemyMessages(): Messages {
    const messages: Messages = {};
    const effects: Messages = {};
    for (const enemy of ENEMIES as EnemyDef[]) {
        put(messages, `enemy.${enemy.id}.name`, enemy.name);
        put(messages, `enemy.${enemy.id}.spawn`, enemy.spawnMessage);
        put(messages, `enemy.${enemy.id}.shield`, enemy.shield?.message);
        enemy.chat?.forEach((line, i) => put(messages, `enemy.${enemy.id}.chat.${i}`, line));
        if (enemy.boss) {
            walkBoss(messages, enemy.id, enemy.boss, [], effects);
        }
    }
    return { ...messages, ...effects };
}

function mapMessages(): Messages {
    const messages: Messages = {};
    const maps: MapDef[] = [...MAPS, ...RAID_MAPS, ...FUN_MAPS];
    for (const map of maps) {
        put(messages, `map.${map.id}.name`, map.name);
        put(messages, `map.${map.id}.desc`, map.description);
        put(messages, `map.${map.id}.warning`, map.finalBossWarning);
        put(messages, `map.${map.id}.victory`, map.victoryText);
        put(messages, `map.${map.id}.ability`, map.fight?.ability?.name);
        map.raid?.rooms.forEach((room, i) => put(messages, `raid.${map.id}.room.${i}`, room.name));
        put(messages, `fun.${map.id}.together`, map.fun?.bosses?.together?.message);
        map.fun?.playerChat?.lines.forEach((line, i) =>
            put(messages, `fun.${map.id}.chat.${i}`, line),
        );
    }
    return messages;
}

// The text fields of an event's effect, and the key suffix of each
const EVENT_EFFECT_KEYS: Record<string, string> = {
    message: "message",
    name: "effect_name",
    leaveLabel: "leave_label",
    right: "right",
    wrong: "wrong",
};

function eventMessages(event: RandomEventDef): Messages {
    const messages: Messages = {};
    const prefix = `event.${event.id}`;
    put(messages, `${prefix}.name`, event.name);
    put(messages, `${prefix}.arrive`, event.arrive);
    put(messages, `${prefix}.leave`, event.leave);
    put(messages, `${prefix}.speech`, event.speech);
    event.shouts?.forEach((line, i) => put(messages, `${prefix}.shout.${i}`, line));
    const effect = event.effect as unknown as Record<string, unknown>;
    for (const field of Object.keys(EVENT_EFFECT_KEYS)) {
        const text = effect[field];
        if (typeof text === "string") {
            put(messages, `${prefix}.${EVENT_EFFECT_KEYS[field]}`, text);
        }
    }
    return messages;
}

function raidMessages(): Messages {
    const messages: Messages = {};
    for (const supply of RAID_SUPPLIES) {
        put(messages, `raid.supply.${supply.id}.name`, supply.name);
        put(messages, `raid.supply.${supply.id}.desc`, supply.description);
    }
    return messages;
}

function pumpkinMessages(): Messages {
    const messages: Messages = {};
    put(messages, "pumpkin.shout.treat", "Treat!");
    put(messages, "pumpkin.shout.trick", "Trick!");
    PUMPKIN_OUTCOMES.forEach((outcome, i) => {
        put(messages, `pumpkin.${i}.message`, outcome.message);
        if (outcome.does.kind === "effect") {
            put(messages, `pumpkin.${i}.effect`, (outcome.does.effect as { name?: string }).name);
        }
    });
    return messages;
}

// Every `message` in a floor: its script's beats, triggers and phases
function walkFloor(messages: Messages, prefix: string, value: unknown, path: string[]) {
    if (typeof value === "string") {
        if (path[path.length - 1] === "message") {
            put(messages, `${prefix}.${path.join(".")}`, value);
        }
    } else if (Array.isArray(value)) {
        value.forEach((item, i) => walkFloor(messages, prefix, item, [...path, String(i)]));
    } else if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
            walkFloor(messages, prefix, v, [...path, k]);
        }
    }
}

function floorMessages(): Messages {
    const messages: Messages = {};
    const rect = { x0: 0, y0: 0, x1: 22, y1: 24 } as unknown as Parameters<
        typeof createWardensFloor
    >[0];
    walkFloor(messages, "floor.wardens", createWardensFloor(rect), []);
    for (const [name, make] of Object.entries(demos).sort(([a], [b]) => (a < b ? -1 : 1))) {
        const slug = name.replace(/^create/, "").replace(/([a-z])([A-Z])/g, "$1_$2");
        walkFloor(
            messages,
            `floor.${slug.toLowerCase()}`,
            (make as typeof createWardensFloor)(rect),
            [],
        );
    }
    return messages;
}

// An act's screen (content/acts.ts): its name, and each map's place on it, in the game or to come
function actMessages(): Messages {
    const messages: Messages = {};
    for (const act of ACTS) {
        put(messages, `act.${act.id}.name`, act.name);
        for (const slot of act.slots) {
            const key = actSlotKey(act, slot);
            put(messages, `${key}.name`, slot.name);
            put(messages, `${key}.boss`, slot.boss);
        }
        if (act.ending) {
            put(messages, `act.${act.id}.ending.title`, act.ending.title);
            act.ending.lines.forEach((line, i) => {
                put(messages, `act.${act.id}.ending.line${i}`, line);
            });
        }
    }
    return messages;
}

// A run's invocations (content/invocations.ts, RUN_INVOCATIONS; the Tombs' board is English only
// for now) and the relics (content/relics.ts): each one's name and what it does
function invocationAndRelicMessages(): Messages {
    const messages: Messages = {};
    for (const invocation of RUN_INVOCATIONS) {
        put(messages, `invocation.${invocation.id}.name`, invocation.name);
        put(messages, `invocation.${invocation.id}.desc`, invocation.description);
    }
    for (const relic of RELICS) {
        put(messages, `relic.${relic.id}.name`, relic.name);
        put(messages, `relic.${relic.id}.desc`, relic.description);
    }
    // Remixes (content/remixes.ts): each one's word and what it does, and all four's
    for (const remix of REMIXES) {
        put(messages, `remix.${remix.id}.name`, remix.name);
        put(messages, `remix.${remix.id}.description`, remix.description);
    }
    put(messages, "remix.fallen", "Fallen");
    // The Forgotten Four's camp (content/gauntlet.ts): each blessing's name and what it does
    for (const blessing of BLESSINGS) {
        put(messages, `gauntlet.blessing.${blessing.id}.name`, blessing.name);
        put(messages, `gauntlet.blessing.${blessing.id}.description`, blessing.description);
    }
    return messages;
}

export default function extract(): Messages {
    const messages: Messages = {
        ...enemyMessages(),
        ...mapMessages(),
        ...raidMessages(),
        ...pumpkinMessages(),
        ...floorMessages(),
        ...actMessages(),
        ...invocationAndRelicMessages(),
    };
    for (const event of [...RANDOM_EVENTS, RAID_SUPPLY_CHEST]) {
        Object.assign(messages, eventMessages(event));
    }
    return messages;
}
