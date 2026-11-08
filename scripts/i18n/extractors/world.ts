// The world's English (locales/en/world.json): what enemies, bosses, maps, raids, random events,
// the pumpkins and the floors say. The texts stay in the content's .ts files; this reads them off
// the definitions. Keys: enemy.*, boss.*, fun.*, map.*, raid.*, event.*, nightmare.*, phosani.*,
// zachariah.*, tob.*, pumpkin.*, floor.*
//
// The Sim emits these texts as they are in English and the drawing layer calls tl(text) on them,
// so each one is here with the literal the Sim emits. Boss attacks' own names
// (BossAttackDef.name) are keys in Sim.ts and aren't here.
import { ENEMIES } from "../../../src/game/content/enemies";
import * as demos from "../../../src/game/content/floorDemos";
import { FUN_MAPS } from "../../../src/game/content/fun/maps";
import { MAPS } from "../../../src/game/content/maps";
import { RAID_MAPS, RAID_SUPPLIES, RAID_SUPPLY_CHEST } from "../../../src/game/content/raids";
import { RANDOM_EVENTS } from "../../../src/game/content/randomEvents";
import { PUMPKIN_OUTCOMES } from "../../../src/game/content/trickOrTreat";
import type { EnemyDef, MapDef, RandomEventDef } from "../../../src/game/content/types";
import { createWardensFloor } from "../../../src/game/content/wardensFloor";

type Messages = Record<string, string>;

function put(messages: Messages, key: string, text: string | undefined) {
    if (text === undefined || text === "") {
        return;
    }
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

export default function extract(): Messages {
    const messages: Messages = {
        ...enemyMessages(),
        ...mapMessages(),
        ...raidMessages(),
        ...pumpkinMessages(),
        ...floorMessages(),
    };
    for (const event of [...RANDOM_EVENTS, RAID_SUPPLY_CHEST]) {
        Object.assign(messages, eventMessages(event));
    }
    return messages;
}
