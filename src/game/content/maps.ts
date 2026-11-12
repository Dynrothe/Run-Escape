import { tr } from "../i18n";
import { SCAPERUNE_DEV_MAPS } from "../scaperune/maps/devMaps";
import { DUKES_ROOM_RECIPE } from "../scaperune/maps/dukesRoom";
import {
    GHORROCK_BOSS_ARENA,
    GHORROCK_DUKE,
    GHORROCK_PILLARS,
    GHORROCK_RECIPE,
    ghorrockWorld,
} from "../scaperune/maps/ghorrock";
import { HALLOWED_BOSS_ARENA, HALLOWED_NIGHT } from "../scaperune/maps/hallowedNight";
import { LASSAR_CATHEDRAL, LASSAR_RECIPE, TWIN_SQUARES } from "../scaperune/maps/lassarUndercity";
import { OWLS_COURT, OWLS_COURT_BOSS_ARENA, OWLS_COURT_RECIPE } from "../scaperune/maps/owlsCourt";
import { SCAR_BOSS_ARENA, SCAR_RECIPE, scarWorld } from "../scaperune/maps/scar";
import { SANCTUARY_BOSS_ARENA, SISTERHOOD_SANCTUARY } from "../scaperune/maps/sisterhoodSanctuary";
import { STRANGLEWOOD_CLEARING, STRANGLEWOOD_RECIPE } from "../scaperune/maps/stranglewood";
import { BENEATH_CURSED_SANDS } from "../scaperune/maps/tombsOfAmascut";
import { MapRecipe, getRecipeArena, getRecipeWorldTile } from "../scaperune/recipe";
import {
    AWAKENED_DUKE_ID,
    DUKE_BOSS_ARENA,
    DUKE_BOW_LEVEL,
    DUKE_COLD,
    DUKE_FEATURES,
    DUKE_HITPOINTS,
    DUKE_KINDLE,
    DUKE_SPOT_WORLD,
    DUKE_START_DISTANCE,
} from "./duke";
import { ENEMY_BY_ID, getEnemy } from "./enemies";
import { FUN_MAPS } from "./fun/maps";
import { GHORROCK_COLD, GHORROCK_EVENTS, GHORROCK_WAVES } from "./ghorrock";
import { LASSAR_EVENTS, LASSAR_REALM, LASSAR_WAVES } from "./lassar";
import {
    AWAKENED_LEVIATHAN_ID,
    LEVIATHAN_BOSS_ARENA,
    LEVIATHAN_FEATURES,
    LEVIATHAN_FIRE_LEVEL,
    LEVIATHAN_HITPOINTS,
    LEVIATHAN_LIGHTING,
    LEVIATHAN_SHADOW,
    LEVIATHAN_SPOT_WORLD,
    LEVIATHAN_START_DISTANCE,
} from "./leviathan";
import { PHOSANI_START_DISTANCE } from "./phosani";
import { RAID_MAPS } from "./raids";
import { RANDOM_EVENTS } from "./randomEvents";
import { SCAR_EVENTS, SCAR_LIGHTING, SCAR_POOL_WORLD, SCAR_WAVES } from "./scar";
import { STRANGLEWOOD_EVENTS, STRANGLEWOOD_ROOTS, STRANGLEWOOD_WAVES } from "./stranglewood";
import { CinematicDef, EnemyDef, MapDef } from "./types";
import {
    AWAKENED_VARDORVIS_ID,
    VARDORVIS_BOSS_ARENA,
    VARDORVIS_CHOP,
    VARDORVIS_FEATURES,
    VARDORVIS_HITPOINTS,
    VARDORVIS_ROOTS,
    VARDORVIS_START_DISTANCE,
    VARDORVIS_SWORD_LEVEL,
} from "./vardorvis";
import { THANKSGIVING_EVENTS, THANKSGIVING_WAVES } from "./waves";
import {
    BARROWS_EVENTS,
    BARROWS_WAVES,
    DESERT_EVENTS,
    DESERT_WAVES,
    FREMENNIK_EVENTS,
    FREMENNIK_WAVES,
    GOD_WARS_EVENTS,
    GOD_WARS_WAVES,
    HALLOWEEN_EVENTS,
    HALLOWEEN_WAVES,
    INFERNO_EVENTS,
    INFERNO_WAVES,
    KARAMJA_EVENTS,
    KARAMJA_WAVES,
    KOUREND_EVENTS,
    KOUREND_WAVES,
    LUMBRIDGE_EVENTS,
    LUMBRIDGE_WAVES,
    MORYTANIA_EVENTS,
    MORYTANIA_WAVES,
    PRIFDDINAS_EVENTS,
    PRIFDDINAS_WAVES,
    VARLAMORE_EVENTS,
    VARLAMORE_WAVES,
    WILDERNESS_EVENTS,
    WILDERNESS_WAVES,
} from "./waves";
import {
    AWAKENED_WHISPERER_ID,
    WHISPERER_BLACKSTONE,
    WHISPERER_BOSS_ARENA,
    WHISPERER_BURST_LEVEL,
    WHISPERER_BURST_REACH,
    WHISPERER_HITPOINTS,
    WHISPERER_REALM,
    WHISPERER_START_DISTANCE,
} from "./whisperer";
import {
    OWLS_COURT_FEATURES,
    ZACHARIAH_HITPOINTS,
    ZACHARIAH_SMITE,
    ZACHARIAH_STRIKE_LEVEL,
    ZACHARIAH_STRIKE_REACH,
} from "./zachariah";

// The Leviathan's fight's square, in world tiles
const SCAR_ARENA_WORLD = scarWorld(SCAR_BOSS_ARENA);

// The maps, in the order they open up: beating one unlocks the next. Arenas
// are world-tile rectangles, usually aligned to 64-tile map squares. Seasonal
// maps go last: they're open from the start, and nothing waits on them.
export const MAPS: MapDef[] = [
    {
        id: "lumbridge",
        name: "Lumbridge",
        description:
            "Farm animals, goblins and the undead of Draynor Manor. Count Draynor wakes " +
            "halfway, and the Wise Old Man comes at the end.",
        // Bronze axe
        iconObjId: 1351,
        // Lumbridge, the swamp, Draynor Village and Draynor Manor (map squares
        // 48-50 x 49-52)
        arena: { baseX: 48 * 64, baseY: 49 * 64, sizeX: 3 * 64, sizeY: 4 * 64 },
        // The castle courtyard
        spawn: { x: 3222.5, y: 3218.5 },
        difficulty: { hp: 1, damage: 1 },
        hard: { hp: 2.2, damage: 1.7 },
        waves: LUMBRIDGE_WAVES,
        events: LUMBRIDGE_EVENTS,
        finalBossWarning: "The Wise Old Man is on his way...",
        victoryText: "The Wise Old Man is defeated!",
    },
    {
        id: "barrows",
        name: "Barrows",
        description:
            "Crypt rats, spiders and bloodworms, ghouls, Mort'ton's afflicted and shades, " +
            "and feral vampyres. The six Barrows brothers climb out of their crypts one by " +
            "one, every two and a half minutes. Dharok comes last.",
        // Dharok's helm
        iconObjId: 4716,
        // The Barrows and the swamp around it (map squares 54-56 x 50-52)
        arena: { baseX: 54 * 64, baseY: 50 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // Among the six mounds
        spawn: { x: 3565.5, y: 3287.5 },
        difficulty: { hp: 1.25, damage: 1.15 },
        hard: { hp: 1.75, damage: 1.45 },
        waves: BARROWS_WAVES,
        events: BARROWS_EVENTS,
        finalBossWarning: "The last brother stirs in his crypt...",
        victoryText: "The Barrows brothers are laid to rest!",
    },
    {
        id: "wilderness",
        name: "Wilderness",
        description:
            "Revenants, bandits, dark warriors and chaos druids, the undead of the Graveyard " +
            "of Shadows, hill giants and the Ankou. The Crazy archaeologist and the Chaos " +
            "Fanatic, and the King Black Dragon at the end.",
        // Dragon bones
        iconObjId: 536,
        // Around the Bone Yard, level 27 Wilderness (map squares 49-51 x 57-59)
        arena: { baseX: 49 * 64, baseY: 57 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        spawn: { x: 3237.5, y: 3742.5 },
        difficulty: { hp: 1.5, damage: 1.3 },
        hard: { hp: 1.6, damage: 1.35 },
        waves: WILDERNESS_WAVES,
        events: WILDERNESS_EVENTS,
        finalBossWarning: "Something huge stirs beneath the Lava Maze...",
        victoryText: "The King Black Dragon is slain!",
    },
    {
        id: "desert",
        name: "Kharidian Desert",
        description:
            "Lizards, scorpions and jackals, desert bandits, kalphites out of their hive, " +
            "crocodiles, mummies and locust riders. Desert Treasure's Fareed, Dessous and " +
            "Damis come one by one, and the Kalphite Queen at the end.",
        // The Kalphite Queen's head
        iconObjId: 7981,
        // The Bandit Camp, the Bedabin Camp and the Jaldraocht pyramid (map
        // squares 49-51 x 45-47)
        arena: { baseX: 49 * 64, baseY: 45 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // Open sand by the Bandit Camp
        spawn: { x: 3200.5, y: 2985.5 },
        difficulty: { hp: 1.75, damage: 1.45 },
        hard: { hp: 1.75, damage: 1.4 },
        waves: DESERT_WAVES,
        events: DESERT_EVENTS,
        finalBossWarning: "The sand trembles beneath your feet...",
        victoryText: "The Kalphite Queen is slain!",
    },
    {
        id: "fremennik",
        name: "Fremennik Province",
        description:
            "Rock crabs and wolves, cockatrices and yaks, trolls, basilisks and jellies, " +
            "dagannoths and wallasalki, kurasks and rock lobsters. The three Dagannoth Kings " +
            "come one by one, and Vorkath at the end.",
        // Vorkath's head
        iconObjId: 21907,
        // Rellekka, the rock crab beaches, the Slayer Dungeon's entrance and
        // the Mountain Camp (map squares 41-43 x 56-58)
        arena: { baseX: 41 * 64, baseY: 56 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // Outside Rellekka's gate
        spawn: { x: 2670.5, y: 3640.5 },
        difficulty: { hp: 2, damage: 1.6 },
        hard: { hp: 1.6, damage: 1.35 },
        waves: FREMENNIK_WAVES,
        events: FREMENNIK_EVENTS,
        finalBossWarning: "Something stirs in the ice of Ungael...",
        victoryText: "Vorkath is slain!",
    },
    {
        id: "karamja",
        name: "Karamja",
        description:
            "Monkeys, snakes and jungle spiders, tribesmen, jogres and moss giants, lesser " +
            "demons, and the TzHaar up out of the volcano. Elvarg, Nezikchened and Ket-Zek " +
            "come one by one, and TzTok-Jad at the end.",
        // Tokkul
        iconObjId: 6529,
        // Brimhaven, the volcano, Musa Point and the jungle down to Tai Bwo
        // Wannai (map squares 43-45 x 47-49)
        arena: { baseX: 43 * 64, baseY: 47 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // In Tai Bwo Wannai
        spawn: { x: 2790.5, y: 3070.5 },
        difficulty: { hp: 2.25, damage: 1.75 },
        hard: { hp: 1.45, damage: 1.25 },
        waves: KARAMJA_WAVES,
        events: KARAMJA_EVENTS,
        finalBossWarning: "The volcano rumbles... TzTok-Jad is coming!",
        victoryText: "TzTok-Jad is slain!",
    },
    {
        id: "kourend",
        name: "Kourend",
        description:
            "Guanic bats, swamp crabs and lizards, lizardmen and their brutes, bloodvelds, " +
            "Xeric's deathly rangers, mages and skeletal mystics, and hydras. The Lizardman " +
            "shaman, Sarachnis and Skotizo come one by one, and the Alchemical Hydra at the end.",
        // The Alchemical Hydra's heads
        iconObjId: 23077,
        // Shayzien and the Lizardman Canyon (map squares 22-24 x 55-57)
        arena: { baseX: 22 * 64, baseY: 55 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // Outside Shayzien
        spawn: { x: 1500.5, y: 3600.5 },
        difficulty: { hp: 2.5, damage: 1.9 },
        hard: { hp: 1.45, damage: 1.25 },
        waves: KOUREND_WAVES,
        events: KOUREND_EVENTS,
        finalBossWarning: "Something stirs beneath Mount Karuulm...",
        victoryText: "The Alchemical Hydra is slain!",
    },
    {
        id: "varlamore",
        name: "Varlamore",
        description:
            "Jerboas, pyre foxes and antelopes, blood jaguars, serpent shamans and jaguar " +
            "warriors, naguas, the Fremennik warband, gryphons and minotaurs. The Manticore and " +
            "the Shockwave and Javelin Colossi come one by one, and Sol Heredit at the end.",
        // Sunfire splinters
        iconObjId: 28924,
        // Civitas illa Fortis and the grounds of the Fortis Colosseum (map
        // squares 26-28 x 47-49)
        arena: { baseX: 26 * 64, baseY: 47 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // In the city's streets
        spawn: { x: 1700.5, y: 3100.5 },
        difficulty: { hp: 2.75, damage: 2.05 },
        hard: { hp: 1.5, damage: 1.3 },
        waves: VARLAMORE_WAVES,
        events: VARLAMORE_EVENTS,
        finalBossWarning: "The crowd roars... Sol Heredit enters the arena!",
        victoryText: "Sol Heredit is defeated!",
    },
    {
        id: "morytania",
        name: "Morytania",
        description:
            "Ghasts, shades and zombies out of Mort Myre, vampyre juveniles and juvinates, " +
            "werewolves, nail beasts and mutated bloodvelds, the Theatre of Blood's Nylocas and " +
            "Darkmeyer's vyrewatch. Vanstrom Klause, the Pestilent Bloat and Sotetseg come one " +
            "by one, and Verzik Vitur at the end.",
        // Lil' Zik
        iconObjId: 22473,
        // Slepe and the swamp under Darkmeyer's walls (map squares 56-58 x
        // 51-53). Darkmeyer and Meiyerditch themselves are walled in and too
        // cramped to fight in, so they stand at the arena's edge.
        arena: { baseX: 56 * 64, baseY: 51 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // In Slepe
        spawn: { x: 3720.5, y: 3310.5 },
        difficulty: { hp: 3, damage: 2.2 },
        hard: { hp: 1.5, damage: 1.3 },
        waves: MORYTANIA_WAVES,
        events: MORYTANIA_EVENTS,
        finalBossWarning: "The Theatre's curtain rises... Verzik Vitur awaits!",
        victoryText: "Verzik Vitur is defeated!",
        // The client has no Theatre or Darkmeyer track yet; this one fits a
        // theatre of blood
        music: "Massacre",
    },
    {
        id: "god_wars",
        name: "God Wars Dungeon",
        description:
            "The armies of Bandos, Armadyl, Saradomin and Zamorak, at war with each other as " +
            "much as with you: goblins, orks and cyclopes, aviansies, knights and priests, imps, " +
            "hellhounds and bloodvelds, and the gods' spiritual warriors. Commander Zilyana, " +
            "Kree'arra and K'ril Tsutsaroth come one by one, General Graardor leads a charge, " +
            "and Nex comes at the end.",
        // An Armadyl hilt
        iconObjId: 11810,
        // The dungeon's main cave, up on plane 2 (map squares 44-45 x 82-83).
        // The generals' rooms and Saradomin's encampment are behind doors and
        // ropes, so the fighting is in the middle of the cave where the
        // armies meet.
        arena: { baseX: 44 * 64, baseY: 82 * 64, sizeX: 2 * 64, sizeY: 2 * 64 },
        plane: 2,
        // In the middle of the cave
        spawn: { x: 2866.5, y: 5311.5 },
        // Its enemies hit softer than Morytania's: with the armies closing in
        // from every side of the cave at once, at the usual step (2.35) it
        // was as hard as the Inferno by simulate-run's count. Lowered again
        // (from 2.1) when its bosses grew to full size and anything the
        // player hits stopped fighting the other armies
        difficulty: { hp: 3.25, damage: 1.95 },
        hard: { hp: 1.4, damage: 1.25 },
        waves: GOD_WARS_WAVES,
        events: GOD_WARS_EVENTS,
        finalBossWarning: "The frozen door cracks... Nex is breaking free!",
        victoryText: "Nex is defeated!",
    },
    {
        id: "prifddinas",
        name: "Prifddinas",
        description:
            "The Gauntlet's crystalline rats, bats, spiders, scorpions, wolves, bears and dark " +
            "beasts, the city's guards, the Iorwerth's warriors and archers and Zulrah's " +
            "snakelings, and the corrupted ones late on. Zulrah, Zalcano and the Crystalline " +
            "Hunllef come one by one, and the Corrupted Hunllef at the end.",
        // An enhanced crystal weapon seed, the Gauntlet's reward
        iconObjId: 25859,
        // The city of Prifddinas, inside its walls (map squares 50-51 x
        // 94-95: the walls fill them, and outside is out of reach)
        arena: { baseX: 50 * 64, baseY: 94 * 64, sizeX: 2 * 64, sizeY: 2 * 64 },
        // By the Tower of Voices
        spawn: { x: 3264.5, y: 6060.5 },
        difficulty: { hp: 3.5, damage: 2.5 },
        hard: { hp: 1.35, damage: 1.2 },
        waves: PRIFDDINAS_WAVES,
        events: PRIFDDINAS_EVENTS,
        finalBossWarning: "The crystal singing turns sour... the Corrupted Hunllef is coming!",
        victoryText: "The Corrupted Hunllef is slain!",
    },
    {
        id: "inferno",
        name: "The Inferno",
        description:
            "Mor Ul Rek's TzHaar and the Inferno's creatures: nibblers, Jal-MejRah bats, Jal-Ak " +
            "blobs that split, Jal-ImKot that dig up near you, Jal-Xil, and Jal-Zek that " +
            "raise the dead. JalTok-Jad, a Jal-Zek champion and a TzHaar-Ket champion come one " +
            "by one, and three JalTok-Jads at once at the end.",
        // An infernal cape
        iconObjId: 21295,
        // Mor Ul Rek, the TzHaar city under the volcano, above the Inferno
        // (map squares 38-39 x 79-80). The Inferno itself is a room too small
        // to fight a crowd in.
        arena: { baseX: 38 * 64, baseY: 79 * 64, sizeX: 2 * 64, sizeY: 2 * 64 },
        // In the square south of the city's middle
        spawn: { x: 2497.5, y: 5097.5 },
        difficulty: { hp: 3.75, damage: 2.7 },
        hard: { hp: 1.4, damage: 1.2 },
        waves: INFERNO_WAVES,
        events: INFERNO_EVENTS,
        finalBossWarning: "The lava churns... three JalTok-Jads are rising!",
        victoryText: "The JalTok-Jads are slain! You are the champion of the Inferno!",
    },
    // Act II's (content/acts.ts): open once the Inferno's beaten, outside the campaign's chain
    {
        id: "stranglewood",
        name: "The Stranglewood",
        description:
            "The Strangled, their boars and lynxes, and the Strangled Bear. Roots creep in " +
            "from the wood: they slow and hurt you, and quicken the Strangled. Your hits cut " +
            "them back, and killing a root heart clears a patch. Kasonde and a great Strangled " +
            "Bear come one by one, and Vardorvis rises in his clearing at the end.",
        // The Executioner's axe head, Vardorvis's
        iconObjId: 28319,
        // The real wood round Vardorvis's arena, its undergrowth opened up for a crowd
        // (scaperune/maps/stranglewood.ts)
        arena: getRecipeArena(STRANGLEWOOD_RECIPE),
        // Six tiles south of the clearing's middle, where he rises
        spawn: getRecipeWorldTile(
            STRANGLEWOOD_RECIPE,
            STRANGLEWOOD_RECIPE.spawn.x,
            STRANGLEWOOD_RECIPE.spawn.y,
        ),
        // Act II's first step (its others are in acts.ts)
        difficulty: { hp: 4.2, damage: 2.9 },
        hard: { hp: 1.4, damage: 1.2 },
        waves: STRANGLEWOOD_WAVES,
        events: STRANGLEWOOD_EVENTS,
        finalBossWarning: "The roots shudder... Vardorvis is waking!",
        victoryText: "Vardorvis is slain! The Stranglewood is quiet.",
        // His clearing: he rises in its middle
        bossArena: {
            baseX: Math.floor(STRANGLEWOOD_CLEARING.x) - 10,
            baseY: Math.floor(STRANGLEWOOD_CLEARING.y) - 10,
            size: 20,
        },
        scaperune: true,
        act: { id: "fallen_empire", requires: "inferno" },
        rule: STRANGLEWOOD_ROOTS,
        // The wood's own track; the recording goes in src/media/music (see GameClient)
        music: "Strangled",
        // Vardorvis's, from 15:00
        bossMusic: "Blood Rush",
    },
    {
        id: "lassar_undercity",
        name: "The Lassar Undercity",
        description:
            "Crawling hands, ghosts, leeches and the city's ancient guardians. Black puddles open " +
            "into the Shadow Realm: walk in and the city waits while you're there, with other " +
            "enemies, richer drops and your sanity draining. Catch three lost souls to get back. " +
            "The Shadow Keeper and the Forsaken Assassin come one by one, and the Whisperer " +
            "rises in her cathedral at the end.",
        // The Siren's staff, the Whisperer's
        iconObjId: 28323,
        // The real sunken city, its streets cleared of clutter (scaperune/maps/lassarUndercity.ts)
        arena: getRecipeArena(LASSAR_RECIPE),
        // The cathedral's forecourt, at the top of the causeway to her island
        spawn: getRecipeWorldTile(LASSAR_RECIPE, LASSAR_RECIPE.spawn.x, LASSAR_RECIPE.spawn.y),
        // Act II's first step (its others are in acts.ts)
        difficulty: { hp: 4.2, damage: 2.9 },
        hard: { hp: 1.4, damage: 1.2 },
        waves: LASSAR_WAVES,
        events: LASSAR_EVENTS,
        finalBossWarning: "The cathedral's bells toll... The Whisperer is waking!",
        victoryText: "The Whisperer is silenced! Lassar sleeps again.",
        // Her cathedral: she rises in its middle
        bossArena: {
            baseX: Math.floor(LASSAR_CATHEDRAL.x) - 10,
            baseY: Math.floor(LASSAR_CATHEDRAL.y) - 10,
            size: 20,
        },
        scaperune: true,
        // Its floors are the cache's dark slate and navy: drawn brighter, as the game's lighting
        // shows them
        brightness: 1.6,
        act: { id: "fallen_empire", requires: "inferno" },
        rule: LASSAR_REALM,
        // Its Shadow Realm, drawn in the city's place while the party's there
        twin: { dx: TWIN_SQUARES * 64 },
        // The city's track; the realm's quiet is its own (RealmRuleDef.look)
        music: "The Fallen Empire",
        // The Whisperer's, from 15:00
        bossMusic: "Song of the Silent Choir",
    },
    {
        id: "ghorrock",
        name: "Ghorrock",
        description:
            "Ice warriors, spiders, wolves, icefiends and giants in the frozen yard of Ghorrock " +
            "Prison. The cold rises all the time: it slows you, and at its worst freezes you " +
            "solid. Stay by the braziers, relight them, and kill the fire elites for their " +
            "embers. Gas vents puff and the pools are ice. Ketla and Jhallan come one by one, " +
            "and Duke Sucellus wakes in the prison's mouth at the end.",
        // The Eye of the Duke, his
        iconObjId: 28321,
        // A frozen prison yard, built by hand with the prison's own kit (scaperune/maps/ghorrock.ts)
        arena: getRecipeArena(GHORROCK_RECIPE),
        spawn: getRecipeWorldTile(
            GHORROCK_RECIPE,
            GHORROCK_RECIPE.spawn.x,
            GHORROCK_RECIPE.spawn.y,
        ),
        // Act II's first step (its others are in acts.ts)
        difficulty: { hp: 4.2, damage: 2.9 },
        hard: { hp: 1.4, damage: 1.2 },
        waves: GHORROCK_WAVES,
        events: GHORROCK_EVENTS,
        finalBossWarning: "The ground shudders... Duke Sucellus is waking!",
        victoryText: "Duke Sucellus is slain! Ghorrock's cold lifts.",
        // The yard in front of the prison: he wakes in its mouth, at the square's north edge
        bossArena: (({ x, y }) => ({ baseX: x, baseY: y, size: GHORROCK_BOSS_ARENA.size }))(
            ghorrockWorld(GHORROCK_BOSS_ARENA),
        ),
        features: {
            rise: ghorrockWorld({
                x: GHORROCK_DUKE.x + Math.floor(GHORROCK_DUKE.size / 2),
                y: GHORROCK_DUKE.y + Math.floor(GHORROCK_DUKE.size / 2),
            }),
            // The Ice Columns his gaze can't see through
            pillars: GHORROCK_PILLARS.map((tile) => ({ ...ghorrockWorld(tile), size: 2 })),
        },
        scaperune: true,
        // Its snow drawn as white as it is
        brightness: 1.3,
        act: { id: "fallen_empire", requires: "inferno" },
        rule: GHORROCK_COLD,
        // The prison's track; the recording goes in src/media/music (see GameClient)
        music: "Prison Break",
        // The Duke's, from 15:00
        bossMusic: "Eye See You",
    },
    {
        id: "scar",
        name: "The Scar",
        description:
            "Imps, leeches, walkers and the Scar's demons and hellhounds in the dark of the " +
            "Leviathan's lair. There's a light round you, and your weapons only aim at what's " +
            "lit: carry the light to them. Pick up lanterns, kill light leeches for the light " +
            "they leave, and fight by the fires. Abyssal leeches dim your light. The Scarred " +
            "black demon and Persten the Deceitful come one by one, and the Leviathan rises in " +
            "its pool at the end.",
        // The Leviathan's lure, its
        iconObjId: 28325,
        // The real Scar, its sea drained to the flesh under it (scaperune/maps/scar.ts)
        arena: getRecipeArena(SCAR_RECIPE),
        spawn: getRecipeWorldTile(SCAR_RECIPE, SCAR_RECIPE.spawn.x, SCAR_RECIPE.spawn.y),
        // Act II's first step (its others are in acts.ts)
        difficulty: { hp: 4.2, damage: 2.9 },
        hard: { hp: 1.4, damage: 1.2 },
        waves: SCAR_WAVES,
        events: SCAR_EVENTS,
        finalBossWarning: "The sludge stirs... The Leviathan is rising!",
        victoryText: "The Leviathan sinks into its pool! The Scar is still.",
        // The ground round his pool: he rises in its middle
        bossArena: {
            baseX: SCAR_ARENA_WORLD.x,
            baseY: SCAR_ARENA_WORLD.y,
            size: SCAR_BOSS_ARENA.size,
        },
        features: { rise: SCAR_POOL_WORLD },
        scaperune: true,
        act: { id: "fallen_empire", requires: "inferno" },
        lighting: SCAR_LIGHTING,
        // The Scar's track; the recording goes in src/media/music (see GameClient)
        music: "Scar Tissue",
        // The Leviathan's, from 15:00
        bossMusic: "Colossus of the Deep",
    },
    {
        id: "halloween",
        name: "Hallowed Night",
        description:
            "A graveyard hamlet in a pumpkin patch, on the one night its dead won't lie still. " +
            "Slash Bash and The Mimic come one by one, and The Nightmare rises at the end.",
        // A pumpkin
        iconObjId: 1959,
        arena: getRecipeArena(HALLOWED_NIGHT),
        // South of the ritual circle
        spawn: getRecipeWorldTile(HALLOWED_NIGHT, HALLOWED_NIGHT.spawn.x, HALLOWED_NIGHT.spawn.y),
        difficulty: { hp: 1.25, damage: 1.15 },
        hard: { hp: 1.5, damage: 1.3 },
        waves: HALLOWEEN_WAVES,
        events: HALLOWEEN_EVENTS,
        finalBossWarning: "The pumpkins go dark... The Nightmare is waking!",
        victoryText: "The Nightmare is laid to rest!",
        // The ritual circle: all 192 tiles would put her totems a minute's walk apart
        bossArena: HALLOWED_BOSS_ARENA,
        scaperune: true,
        seasonal: true,
        brightness: 0.8,
    },
    {
        id: "phosani",
        name: "Phosani's Nightmare",
        description:
            "The Nightmare's hard mode, on its own: her dream, walled round in the stone of the " +
            "Sisterhood Sanctuary beneath Slepe. No waves, no picks and no items: " +
            "the Armadyl crossbow, and her. She rises as you arrive, quicker than before and " +
            "with more at once, and every hit of hers is shown before it lands. Her totems' " +
            "blasts are the only rest, and each heals you.",
        // The Inquisitor's great helm
        iconObjId: 24419,
        arena: getRecipeArena(SISTERHOOD_SANCTUARY),
        // South of the arena's middle, where her entrance stands the player
        // anyway: she rises at the middle itself
        spawn: {
            x: SANCTUARY_BOSS_ARENA.baseX + SANCTUARY_BOSS_ARENA.size / 2,
            y: SANCTUARY_BOSS_ARENA.baseY + SANCTUARY_BOSS_ARENA.size / 2 - PHOSANI_START_DISTANCE,
        },
        // Her hitpoints come from the event: a run here has the Inquisitor's
        // crossbow and nothing more, not fifteen minutes of levels. Her hits are
        // tuned to the Inquisitor's hitpoints too: a big one takes about half,
        // as hers do on Hallowed Night with a whole run's behind you
        difficulty: { hp: 1, damage: 1 },
        hard: { hp: 1.3, damage: 1.3 },
        waves: [],
        events: [{ at: 0, kind: "finalBoss", enemyId: "phosanis_nightmare", hp: 6000 }],
        finalBossWarning: "",
        victoryText: "Phosani's Nightmare is laid to rest!",
        bossArena: SANCTUARY_BOSS_ARENA,
        scaperune: true,
        fight: { requires: "halloween", character: "inquisitor", weaponLevel: 3 },
        brightness: 0.75,
        // Her own track; the recording goes in src/media/music (see GameClient)
        music: "The Bane of Ashihama",
    },
    {
        id: "zachariah",
        name: "Justiciar Zachariah",
        description:
            "The Justiciar of the Owl puts you on trial in his court, hung in the Hallowed " +
            "Sepulchre's dark. No waves, no picks and no items: Saradomin Strike, which reaches " +
            "him only from close by, and him. His court is his weapon: read its statues, its " +
            "floor and its fire, and stay near enough to strike.",
        // The Justiciar's hand, his own drop
        iconObjId: 21797,
        arena: getRecipeArena(OWLS_COURT_RECIPE),
        // The terrace, at the foot of the bridge: he comes down at its head
        spawn: {
            x: OWLS_COURT.origin.x + OWLS_COURT.start.x + 0.5,
            y: OWLS_COURT.origin.y + OWLS_COURT.start.y + 0.5,
        },
        // His hitpoints come from the event, and his hits are tuned to the Saradominist's
        // hitpoints: a big one takes about half
        difficulty: { hp: 1, damage: 1 },
        hard: { hp: 1.3, damage: 1.3 },
        waves: [],
        events: [
            { at: 0, kind: "finalBoss", enemyId: "justiciar_zachariah", hp: ZACHARIAH_HITPOINTS },
        ],
        finalBossWarning: "",
        victoryText: "The Owl's judgement is passed: Justiciar Zachariah yields!",
        // The court: the bridge and the terrace off it are the player's too (confine: false)
        bossArena: OWLS_COURT_BOSS_ARENA,
        features: OWLS_COURT_FEATURES,
        scaperune: true,
        // After the Wolf's trial, the Owl's: both are Justiciars of the Sepulchre
        fight: {
            requires: "phosani",
            character: "saradominist",
            weaponLevel: ZACHARIAH_STRIKE_LEVEL,
            strikeReach: ZACHARIAH_STRIKE_REACH,
            ability: ZACHARIAH_SMITE,
        },
        music: "Blade of Forgotten Justice",
    },
    {
        id: "awakened_vardorvis",
        name: "Awakened Vardorvis",
        description:
            "Vardorvis, awakened, in his clearing in the Stranglewood. No waves, no picks and no " +
            "items: the Forester, his 2h sword and Chop. The roots close in from the wood, his " +
            "dart roots the ground it crosses and his captors heal him: cut them back, and make " +
            "his dart miss.",
        // Butch, his pet
        iconObjId: 28248,
        arena: getRecipeArena(STRANGLEWOOD_RECIPE),
        // South of his spot, as the Stranglewood starts you
        spawn: {
            x: STRANGLEWOOD_CLEARING.x,
            y: STRANGLEWOOD_CLEARING.y - VARDORVIS_START_DISTANCE,
        },
        // His hitpoints come from the event, his hits are tuned to the Forester's hitpoints with
        // the shop's every upgrade: through armour, which would stop most of each of his hits
        difficulty: { hp: 1, damage: 1 },
        hits: { scale: 1, throughArmor: true },
        hard: { hp: 1.3, damage: 1.3 },
        waves: [],
        events: [
            {
                at: 0,
                kind: "finalBoss",
                enemyId: AWAKENED_VARDORVIS_ID,
                hp: VARDORVIS_HITPOINTS,
            },
        ],
        finalBossWarning: "",
        victoryText: "Awakened Vardorvis falls, and the Stranglewood is still.",
        bossArena: VARDORVIS_BOSS_ARENA,
        features: VARDORVIS_FEATURES,
        scaperune: true,
        rule: VARDORVIS_ROOTS,
        // Opened by beating his map, played as its adventurer (act-2-fallen-empire.md, 7.2)
        fight: {
            requires: "stranglewood",
            character: "forester",
            weaponLevel: VARDORVIS_SWORD_LEVEL,
            ability: VARDORVIS_CHOP,
        },
        music: "Blood Rush",
    },
    {
        id: "awakened_whisperer",
        name: "Awakened Whisperer",
        description:
            "The Whisperer, awakened, on her island in the Lassar Undercity. No waves, no picks " +
            "and no items: the Shadow walker, Shadow Burst and Blackstone, which turns you " +
            "between the city and the Shadow Realm. She can only be hurt in the city; her Soul " +
            "Siphon can only be stopped in the realm, where your sanity drains. Her screech " +
            "can't be outrun, only left behind.",
        // The Wisp, her pet
        iconObjId: 28246,
        arena: getRecipeArena(LASSAR_RECIPE),
        // South of her spot, as Vardorvis's fight starts you
        spawn: {
            x: LASSAR_CATHEDRAL.x,
            y: LASSAR_CATHEDRAL.y - WHISPERER_START_DISTANCE,
        },
        // Her hitpoints come from the event, her hits are tuned to the Shadow walker's hitpoints with
        // the shop's every upgrade: through armour, which would stop most of each of her hits
        difficulty: { hp: 1, damage: 1 },
        hits: { scale: 1, throughArmor: true },
        hard: { hp: 1.3, damage: 1.3 },
        waves: [],
        events: [
            {
                at: 0,
                kind: "finalBoss",
                enemyId: AWAKENED_WHISPERER_ID,
                hp: WHISPERER_HITPOINTS,
            },
        ],
        finalBossWarning: "",
        victoryText: "The Awakened Whisperer is silenced, and Lassar sleeps.",
        bossArena: WHISPERER_BOSS_ARENA,
        scaperune: true,
        // The island's floor is the cache's near-black navy, as the map's
        brightness: 1.6,
        rule: WHISPERER_REALM,
        twin: { dx: TWIN_SQUARES * 64 },
        // Opened by beating her map, played as its adventurer (act-2-fallen-empire.md, 7.2)
        fight: {
            requires: "lassar_undercity",
            character: "shadow_walker",
            weaponLevel: WHISPERER_BURST_LEVEL,
            strikeReach: WHISPERER_BURST_REACH,
            ability: WHISPERER_BLACKSTONE,
        },
        music: "Song of the Silent Choir",
    },
    {
        id: "awakened_duke",
        name: "Awakened Duke Sucellus",
        description:
            "Duke Sucellus, awakened, in his room in Ghorrock Prison. No waves, no picks and no " +
            "items: the Snow ranger, her shortbow and Kindle, which lights the brazier you're " +
            "beside. The cold rises all the time and only the braziers hold it off. His gas finds " +
            "the vent by you, and his freezing gaze puts out every brazier it can see: hide " +
            "behind the statues.",
        // Baron, his pet
        iconObjId: 28250,
        arena: getRecipeArena(DUKES_ROOM_RECIPE),
        // South of him, as the other fights start you
        spawn: { x: DUKE_SPOT_WORLD.x, y: DUKE_SPOT_WORLD.y - DUKE_START_DISTANCE },
        // His hitpoints come from the event, his hits are tuned to the Snow ranger's hitpoints
        difficulty: { hp: 1, damage: 1 },
        hard: { hp: 1.3, damage: 1.3 },
        waves: [],
        events: [{ at: 0, kind: "finalBoss", enemyId: AWAKENED_DUKE_ID, hp: DUKE_HITPOINTS }],
        finalBossWarning: "",
        victoryText: "Awakened Duke Sucellus falls, and Ghorrock's cold breaks.",
        bossArena: DUKE_BOSS_ARENA,
        features: DUKE_FEATURES,
        scaperune: true,
        rule: DUKE_COLD,
        // Opened by beating his map, played as its adventurer (act-2-fallen-empire.md, 7.2)
        fight: {
            requires: "ghorrock",
            character: "snow_ranger",
            weaponLevel: DUKE_BOW_LEVEL,
            ability: DUKE_KINDLE,
        },
        music: "Eye See You",
    },
    {
        id: "awakened_leviathan",
        name: "Awakened Leviathan",
        description:
            "The Leviathan, awakened, in its pool in the Scar. No waves, no picks and no items: " +
            "the Lantern-bearer, her Fire spells and Shadow, which stuns it from close by. In " +
            "the dark your spells only find what's lit, and once its glow goes out only your " +
            "light finds it. Its torrent can only be hidden from behind debris, and the debris " +
            "that hides you is smashed. At the last, only the pathfinder's light is left.",
        // Lil'viathan, its pet
        iconObjId: 28252,
        arena: getRecipeArena(SCAR_RECIPE),
        // South of its pool, as the other fights start you
        spawn: {
            x: LEVIATHAN_SPOT_WORLD.x,
            y: LEVIATHAN_SPOT_WORLD.y - LEVIATHAN_START_DISTANCE,
        },
        // Its hitpoints come from the event, its hits are tuned to the Lantern-bearer's hitpoints
        difficulty: { hp: 1, damage: 1 },
        hard: { hp: 1.3, damage: 1.3 },
        waves: [],
        events: [
            {
                at: 0,
                kind: "finalBoss",
                enemyId: AWAKENED_LEVIATHAN_ID,
                hp: LEVIATHAN_HITPOINTS,
            },
        ],
        finalBossWarning: "",
        victoryText: "The Awakened Leviathan sinks into its pool, and the Scar is dark and still.",
        bossArena: LEVIATHAN_BOSS_ARENA,
        features: LEVIATHAN_FEATURES,
        scaperune: true,
        lighting: LEVIATHAN_LIGHTING,
        // Opened by beating its map, played as its adventurer (act-2-fallen-empire.md, 7.2)
        fight: {
            requires: "scar",
            character: "lantern_bearer",
            weaponLevel: LEVIATHAN_FIRE_LEVEL,
            ability: LEVIATHAN_SHADOW,
        },
        music: "Colossus of the Deep",
    },
    // A quest in four parts after the desert, which opens the Tombs of Amascut
    BENEATH_CURSED_SANDS,
    {
        id: "thanksgiving",
        name: "Thanksgiving Harvest",
        description:
            "Hosidius Vinery's grape fields are overrun by restless creatures and wild Chompies. " +
            "Professor Oddenstein and the Evil Chicken interrupt the gathering, and the Freaky Forester " +
            "challenges you at the end.",
        // The Rubber chicken
        iconObjId: 4566,
        // Hosidius and the Vinery, map squares 27-29 x 54-56
        arena: { baseX: 27 * 64, baseY: 54 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // The point marked in the requested Hosidius scene
        spawn: { x: 1771.5, y: 3572.5 },
        spawnFacing: { x: 0, y: 1 },
        difficulty: { hp: 1.25, damage: 1.15 },
        hard: { hp: 1.8, damage: 1.5 },
        waves: THANKSGIVING_WAVES,
        events: THANKSGIVING_EVENTS,
        finalBossWarning: "The harvest feast is interrupted... the Freaky Forester approaches!",
        victoryText: "The Freaky Forester is defeated! The harvest is safe!",
        seasonal: true,
        seasonalCharacter: "avian_assaulter",
        noRandomEvents: ["highwayman"],
        noLevelUpCoins: true,
    },
];

// The maps that open one after another
export const CAMPAIGN_MAPS: MapDef[] = MAPS.filter(
    (map) => !map.seasonal && !map.fight && !map.act,
);

// The acts' maps (MapDef.act, content/acts.ts): each act's open once its map's beaten, in any order
export const ACT_MAPS: MapDef[] = MAPS.filter((map) => map.act);

// Invocations (content/invocations.ts, RUN_INVOCATIONS) go on campaign maps from the Desert on, on
// the acts' maps, and on any campaign map with a remix on (content/remixes.ts): `remixed`. Boss
// fights, raids, the Tombs (their own board), quests in parts, the seasonal and fun maps don't.
const FIRST_INVOCATION_MAP = CAMPAIGN_MAPS.findIndex((map) => map.id === "desert");
export function takesInvocations(map: MapDef, remixed = false): boolean {
    if (map.act) {
        return true;
    }
    const index = CAMPAIGN_MAPS.indexOf(map);
    return index >= 0 && (remixed || index >= FIRST_INVOCATION_MAP) && isPlainRun(map);
}

// Relics (content/relics.ts) are on every campaign map and the acts' maps (and remixes), and off in
// boss fights, raids, the Tombs and the rest (act-2-fallen-empire.md, 9.2)
export function takesRelics(map: MapDef): boolean {
    return (map.act !== undefined || CAMPAIGN_MAPS.includes(map)) && isPlainRun(map);
}

// A survival run: waves and a final boss, not a fight, a raid or a quest's parts
function isPlainRun(map: MapDef): boolean {
    return !map.fight && !map.raid && !map.tombs && !map.stages && !map.fun && !map.dev;
}

// Open from the start, between the campaign and the fun maps
export const SEASONAL_MAPS: MapDef[] = MAPS.filter((map) => map.seasonal);

// Boss fights on their own, each open once its map has been beaten
export const FIGHT_MAPS: MapDef[] = MAPS.filter((map) => map.fight);

// The fun maps (fun/maps.ts): open from the start and endless, outside the
// campaign's chain
export { FUN_MAPS };

// Raids (raids.ts): rooms one after another, each with its boss. Open from the start, outside the
// campaign's chain.
export { RAID_MAPS };

// Dev server only (or DEV_MAPS=1 in a script): ScapeRune's maps, ground of our
// own rather than a slice of the real world (scaperune/CLAUDE.md)
const showDevMaps =
    (import.meta.env?.DEV && import.meta.env?.MODE !== "test") ||
    (typeof process !== "undefined" && process.env?.DEV_MAPS === "1");
export function createDevMap(recipe: MapRecipe): MapDef {
    const play = recipe.play;
    const source = play && MAPS.find((map) => map.id === play.waveSet);
    const density = play?.enemyDensity ?? 1;
    return {
        id: recipe.id,
        name: recipe.id,
        description: "ScapeRune test map, for development.",
        iconObjId: 1351,
        arena: getRecipeArena(recipe),
        spawn: getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y),
        difficulty: source?.difficulty ?? { hp: 1, damage: 1 },
        waves: (source?.waves ?? LUMBRIDGE_WAVES).map((wave) => ({
            ...wave,
            spawnRate: wave.spawnRate * density,
            minAlive: Math.round(wave.minAlive * density),
            maxAlive: Math.round(wave.maxAlive * density),
        })),
        brightness: play?.brightness,
        events: [],
        finalBossWarning: "",
        victoryText: "",
        fun: { bosses: { pool: ["giant_rat"], firstAt: 3600, every: [3600, 3600] } },
        dev: true,
        scaperune: true,
        ...recipe.mapDef,
    };
}

export const DEV_MAPS: MapDef[] = showDevMaps ? SCAPERUNE_DEV_MAPS.map(createDevMap) : [];

// Every map, the campaign's, the raids and the fun ones
export const ALL_MAPS: MapDef[] = [...MAPS, ...RAID_MAPS, ...FUN_MAPS, ...DEV_MAPS];

export const MAP_BY_ID: Map<string, MapDef> = new Map(ALL_MAPS.map((m) => [m.id, m]));

// The map generator's latest map (scaperune/MapGeneratorScreen.tsx). A new object
// each time, which is how the minimap knows it's another map.
export function setGeneratedMap(recipe: MapRecipe): void {
    MAP_BY_ID.set(recipe.id, createDevMap(recipe));
}

export function isDevMap(mapId: string): boolean {
    return MAP_BY_ID.get(mapId)?.dev === true;
}

export function isFunMap(mapId: string): boolean {
    return MAP_BY_ID.get(mapId)?.fun !== undefined;
}

export function isRaidMap(mapId: string): boolean {
    return MAP_BY_ID.get(mapId)?.raid !== undefined;
}

export function isSeasonalMap(mapId: string): boolean {
    return MAP_BY_ID.get(mapId)?.seasonal === true;
}

export function isActMap(mapId: string): boolean {
    return MAP_BY_ID.get(mapId)?.act !== undefined;
}

export function isFightMap(mapId: string): boolean {
    return MAP_BY_ID.get(mapId)?.fight !== undefined;
}

// Whether a co-op room can play it: not a fight kept to one player (MapDef.fight.solo)
export function isCoopMap(map: MapDef): boolean {
    return map.fight?.solo !== true;
}

// Every cinematic a map can play: its opening (MapDef.cinematic) and each part's of a fight in
// parts (MapDef.stages), for what bakes and loads them
export function getMapCinematics(map: MapDef): CinematicDef[] {
    const all = [map.cinematic, ...(map.stages ?? []).map((stage) => stage.cinematic)];
    return all.filter((def): def is CinematicDef => def !== undefined);
}

// The cinematic a run plays as it starts: its part's own (a fight in parts), or the map's
export function getRunCinematic(map: MapDef, stage: number): CinematicDef | undefined {
    return (map.stages && map.stages[stage]?.cinematic) ?? map.cinematic;
}

// The adventurer everyone plays on a map, if it has one (Durial321 in
// Falador, the Inquisitor against Phosani's Nightmare)
export function getMapCharacter(map: MapDef): string | undefined {
    return map.fun?.character ?? map.fight?.character ?? map.seasonalCharacter;
}

export function getMap(id: string): MapDef {
    const map = MAP_BY_ID.get(id);
    if (!map) {
        throw new Error("Unknown map " + id);
    }
    return map;
}

// The part of the world a map's collision, heights and scenery come from: its
// arena, on its plane
export function getArenaRegion(map: MapDef): {
    baseX: number;
    baseY: number;
    sizeX: number;
    sizeY: number;
    plane: number;
} {
    return { ...map.arena, plane: map.plane ?? 0 };
}

// Whether anything on the map poisons you (the King Black Dragon's breath) or
// gives you what stacks up (Slash Bash's disease). Antipoisons are only found
// where something does. The Tombs of Amascut's poisons are out of this reach
// (Akkha's fire quarter and Zebak's acid in the raid's own data, the Spitting
// Scarab's touch on an enemy its rooms bring), so the raid counts as poisoning.
export function hasPoison(map: MapDef): boolean {
    if (map.tombs) {
        return true;
    }
    const enemyIds = [
        ...map.waves.flatMap((wave) => wave.enemies.map((e) => e.id)),
        ...map.events.map((event) => event.enemyId),
        ...(map.stages ?? []).flatMap((stage) => stage.events.map((event) => event.enemyId)),
    ];
    return enemyIds.some((id) =>
        getEnemy(id).boss?.attacks.some(({ effect }) =>
            effect?.kind === "debuff" ? effect.stacks !== undefined : effect?.kind === "poison",
        ),
    );
}

// Whether anything that flies can turn up on the map. It goes by every enemy
// id anywhere in the map's data and the random events', and in theirs in turn
// (summons, splits, risen forms), so it doesn't need to know where ids are kept.
// Sim builds the flight grid with the map when this says so, rather than on
// the tick the first flier turns up.
export function hasFliers(map: MapDef): boolean {
    const seen = new Set<object>();
    const enemies: EnemyDef[] = [];
    const visit = (value: unknown): void => {
        if (typeof value === "string") {
            const enemy = ENEMY_BY_ID.get(value);
            if (enemy && !seen.has(enemy)) {
                enemies.push(enemy);
                visit(enemy);
            }
        } else if (
            typeof value === "object" &&
            value !== null &&
            !ArrayBuffer.isView(value) &&
            !seen.has(value)
        ) {
            seen.add(value);
            for (const item of Object.values(value)) {
                visit(item);
            }
        }
    };
    visit(map);
    visit(RANDOM_EVENTS);
    return enemies.some((enemy) => enemy.flies);
}

// A map's texts in the language chosen (map.<id>.name|desc|warning|victory)
export function mapName(map: MapDef): string {
    return tr(`map.${map.id}.name`, map.name);
}

export function mapDescription(map: MapDef): string {
    return tr(`map.${map.id}.desc`, map.description);
}

export function mapFinalBossWarning(map: MapDef): string {
    return tr(`map.${map.id}.warning`, map.finalBossWarning);
}
