// Shared by the Node and Cloudflare relays. Keep label values bounded: hosts
// can send arbitrary map ids. New playable maps belong here and in the test.
export const RUN_METRIC_MAPS = new Set([
    "lumbridge",
    "barrows",
    "wilderness",
    "desert",
    "fremennik",
    "karamja",
    "kourend",
    "varlamore",
    "morytania",
    "god_wars",
    "prifddinas",
    "inferno",
    "halloween",
    "phosani",
    "theatre_of_blood",
]);

// Freeze the dimensions at start, before anyone leaves or settings change.
// Only matching game/room settings qualify; older or malformed starts still
// relay normally but cannot accidentally count an endless run as a normal one.
export function startRunMetrics(room, game) {
    if (
        room.endless ||
        game?.endless !== false ||
        game.mapId !== room.mapId ||
        game.hard !== (room.hard === true) ||
        room.members.length < 2 ||
        room.members.length > 4
    ) {
        return undefined;
    }
    return {
        map: RUN_METRIC_MAPS.has(room.mapId) ? room.mapId : "unknown",
        partySize: room.members.length,
        difficulty: room.hard ? "hard" : "normal",
    };
}

// A terminal report is host-authored, like the frames themselves. The relay
// does not simulate combat. Consume it once, including repeated final frames.
export function takeRunResult(room, outcome) {
    const run = room.runMetrics;
    if (!room.started || !run || run.outcome || (outcome !== "completed" && outcome !== "failed")) {
        return undefined;
    }
    run.outcome = outcome;
    return run;
}

export function runResultLabels(run) {
    return `map="${run.map}",party_size="${run.partySize}",difficulty="${run.difficulty}",outcome="${run.outcome}"`;
}

export function runResultsText(counts) {
    const name = "coop_runs_finished_total";
    let text = `# HELP ${name} Non-endless multiplayer completions and full-party deaths.\n# TYPE ${name} counter\n`;
    for (const [labels, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
        text += `${name}{${labels}} ${count}\n`;
    }
    return text;
}
