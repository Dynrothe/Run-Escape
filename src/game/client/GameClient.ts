import { Camera } from "../../mapviewer/Camera";
import { MapViewer } from "../../mapviewer/MapViewer";
import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import { RegionData, RegionDataInput } from "../../mapviewer/worker/RegionData";
import { RegionDataLoader } from "../../mapviewer/worker/RegionDataLoader";
import massacre from "../../media/music/massacre.ogg";
import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { CHARACTERS, getCharacter } from "../content/characters";
import { upgradedName } from "../content/endless";
import { getEnemy } from "../content/enemies";
import { CASKETS, getItem } from "../content/items";
import { MAPS, getArenaRegion, getMap, isFunMap } from "../content/maps";
import { formatPassiveValue, getPassive } from "../content/passives";
import { QUESTS, describeQuest } from "../content/quests";
import { RARITIES, Rarity } from "../content/rarity";
import { formatStats } from "../content/stats";
import { LOCKABLE_ITEMS, describeUnlockTask } from "../content/unlocks";
import { formatWeaponStat, weaponStats } from "../content/weaponStats";
import { ChestAction } from "../core/Loot";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { describeChoice } from "../core/Upgrades";
import { SimEvent } from "../core/entities";
import {
    SaveData,
    SaveStore,
    buyArmouryUpgrade,
    buyUpgrade,
    exportSave,
    getEarnedUnlocks,
    getFinishedQuests,
    getMetaStats,
    getQuestProgress,
    isEndlessRecord,
    isEndlessUnlocked,
    isMapUnlocked,
    recordRun,
    refundUpgrades,
} from "../core/save";
import { ArenaGrid } from "../core/world/ArenaGrid";
import { CameraRig } from "../render/CameraRig";
import { GameFrameHandler, GameWebGLRenderer } from "../render/GameWebGLRenderer";
import { DisplaySettings, loadDisplaySettings, saveDisplaySettings } from "./DisplaySettings";
import {
    GameAssets,
    HITSPLAT_SPRITES,
    PLAYER_SEQS,
    getCharacterAppearance,
    getRunAppearance,
} from "./GameAssets";
import { GameAudio } from "./GameAudio";
import { GameInput } from "./GameInput";
import { ChestCue, GameSounds, getGameSoundIds } from "./GameSounds";
import { ChoiceView, GameStore, HudView, QuestTrackView, Screen } from "./GameStore";
import { GameView } from "./GameView";
import { getBuffViews, getChestView, getGearViews, getInventoryViews } from "./ItemViews";
import { Minimap } from "./Minimap";
import { Overlay, ScreenPoint } from "./Overlay";
import { getBossKillViews, getDamageViews } from "./RunStatsViews";

// 20ms: the OSRS client tick, also the unit of animation frame lengths
export const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 10;
const HUD_INTERVAL_MS = 100;

// The title screen is in the first map (Lumbridge castle's courtyard)
const TITLE_MAP = MAPS[0];

// Recordings of the OSRS music tracks maps play (MapDef.music), from the OSRS
// Wiki
const MUSIC: Record<string, string> = {
    Massacre: massacre,
};

// Title screen camera: lower and slowly circling the character (RS angle units
// per tick), or settling in front of them when it's not to spin
const ATTRACT_PITCH = -260;
const ATTRACT_DISTANCE = 9;
const ATTRACT_SPIN = 1.2;
const ATTRACT_SETTLE = 0.96;
const RUN_PITCH = -400;
const RUN_DISTANCE = 18;

// The level up's rewards, as the UI shows them
// What a new endless round brings, for its toast
function describeRound(sim: Sim): string {
    const times = (n: number) => `${Math.round(n * 10) / 10}x`;
    return (
        `Round ${sim.round} begins! Monsters have ${times(sim.roundHp)} the hitpoints and hit ` +
        `${times(sim.roundDamage)} as hard, and caskets' gear comes +${sim.round - 1}.`
    );
}

function getQuestTrackViews(save: SaveData, sim: Sim): QuestTrackView[] {
    // Quests don't count on the fun maps, so there's nothing to track there
    if (isFunMap(sim.map.id)) {
        return [];
    }
    const run = sim.getResult();
    const quests = QUESTS.filter(
        (quest) =>
            (quest.mapId === sim.map.id || quest.mapId === undefined) &&
            !save.questsDone.includes(quest.id),
    );
    // The map's own first (QUESTS has the ones done all over last)
    return quests.map((quest) => {
        const { done, of } = getQuestProgress(save, quest, run);
        return {
            id: quest.id,
            name: quest.name,
            task: describeQuest(quest.objective),
            done,
            of,
            finished: done >= of,
        };
    });
}

function getChoiceViews(sim: Sim): ChoiceView[] {
    return sim.choices.map((choice) => {
        const { title, text, iconObjId, iconSpriteId, quality, stats } = describeChoice(choice);
        const rarity = quality ? RARITIES[quality] : undefined;
        return {
            title,
            text,
            iconObjId,
            iconSpriteId,
            isNew: choice.kind === "newWeapon" || choice.kind === "newPassive",
            isEvolution: choice.kind === "evolve",
            isHilt: choice.kind === "hilt",
            rarity: rarity && { name: rarity.name, color: rarity.color },
            stats,
        };
    });
}

export type GameClientOptions = {
    // Extra goblins at the start of a run, for performance testing
    stress: number;
    // Start a run with this character straight away (testing)
    autostart?: string;
};

export class GameClient implements GameFrameHandler {
    static async create(
        mapViewer: MapViewer,
        renderer: GameWebGLRenderer,
        overlayCanvas: HTMLCanvasElement,
        store: GameStore,
        saveStore: SaveStore,
        options: GameClientOptions,
    ): Promise<GameClient> {
        const workerPool = mapViewer.workerPool;
        const regionPromise = workerPool.queueLoad<RegionDataInput, RegionData, RegionDataLoader>(
            new RegionDataLoader(),
            getArenaRegion(TITLE_MAP),
        );

        const audio = new GameAudio();
        const soundsPromise = audio.load(workerPool, getGameSoundIds());

        const actors = await renderer.getActorRenderer();
        const assets = new GameAssets(workerPool, renderer, actors);
        const spritesPromise = assets.loadSprites(Object.values(HITSPLAT_SPRITES));
        store.set({ loadingText: "Summoning monsters", loadingProgress: 10 });
        await assets.loadBase((done, total) => {
            store.set({ loadingProgress: 10 + Math.round((done / total) * 70) });
        });
        store.set({ loadingText: "Dressing up", loadingProgress: 85 });
        await assets.setPlayerAppearance(getCharacterAppearance(store.getSnapshot().characterId));
        store.set({ loadingText: `Building ${TITLE_MAP.name}`, loadingProgress: 95 });
        const grid = new ArenaGrid(await regionPromise);
        await soundsPromise;
        await spritesPromise;

        return new GameClient(
            mapViewer,
            renderer,
            grid,
            assets,
            audio,
            overlayCanvas,
            store,
            saveStore,
            options,
        );
    }

    readonly input: GameInput;
    readonly overlay: Overlay;
    readonly view: GameView;
    readonly minimap: Minimap;
    readonly sounds: GameSounds;
    readonly cameraRig = new CameraRig();

    sim?: Sim;
    paused = false;
    save: SaveData;

    private accumulator = 0;
    private lastHudUpdate = 0;
    private appearanceVersion = -1;
    private runRecorded = false;
    // Adventurers this run has done the task for, already told about
    private tasksAnnounced = new Set<string>();
    private attractTick = 0;
    private attractYaw = 0;
    private display = loadDisplaySettings();
    private readonly move = { x: 0, y: 0 };
    private readonly screen: ScreenPoint = { x: 0, y: 0, visible: false };
    private fps = 60;
    // The HUD's minimap, while it's on screen
    private minimapCanvas?: HTMLCanvasElement;
    // Collision for each map, built the first time a run goes there
    private readonly grids = new Map<string, ArenaGrid>();
    // The current map's: the run's, or the title screen's
    grid: ArenaGrid;

    constructor(
        readonly mapViewer: MapViewer,
        readonly renderer: GameWebGLRenderer,
        titleGrid: ArenaGrid,
        readonly assets: GameAssets,
        readonly audio: GameAudio,
        overlayCanvas: HTMLCanvasElement,
        readonly store: GameStore,
        readonly saveStore: SaveStore,
        readonly options: GameClientOptions,
    ) {
        this.save = store.getSnapshot().save;
        this.grid = titleGrid;
        this.grids.set(TITLE_MAP.id, titleGrid);
        this.sounds = new GameSounds(audio);
        store.set({ audio: audio.settings, display: this.display });
        this.view = new GameView(assets);
        this.minimap = new Minimap(mapViewer);
        this.overlay = new Overlay(overlayCanvas);
        this.input = new GameInput(renderer.canvas);
        this.input.onPress = this.onKeyPress;
        this.input.onBlur = () => {
            this.accumulator = 0;
            // With auto-pause off the run carries on (though a hidden tab
            // stops drawing, so it waits there until it's back)
            if (
                this.sim &&
                this.display.pauseOnBlur &&
                this.store.getSnapshot().overlay === "none"
            ) {
                this.pause();
            }
        };
        this.cameraRig.pitch = ATTRACT_PITCH;
        this.cameraRig.distance = ATTRACT_DISTANCE;

        if (options.autostart) {
            this.store.set({ characterId: options.autostart });
            this.startRun();
        } else {
            this.showScreen("title");
        }
    }

    setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
        this.minimapCanvas = canvas ?? undefined;
    }

    dispose(): void {
        this.input.dispose();
        this.audio.dispose();
        if (this.renderer.game === this) {
            this.renderer.game = undefined;
        }
    }

    // ---- UI actions ----

    showScreen(screen: Screen): void {
        this.store.set({ screen });
    }

    selectCharacter(characterId: string): void {
        if (!this.save.unlockedCharacters.includes(characterId)) {
            return;
        }
        this.store.set({ characterId });
        if (!this.sim) {
            this.assets.setPlayerAppearance(getCharacterAppearance(characterId));
        }
    }

    selectMap(mapId: string): void {
        if (isMapUnlocked(this.save, mapId)) {
            const endless = this.store.getSnapshot().endless && isEndlessUnlocked(this.save, mapId);
            this.store.set({ mapId, endless });
        }
    }

    // Endless runs, for a map that's been beaten
    toggleEndless(): void {
        const { mapId, endless } = this.store.getSnapshot();
        if (endless || isEndlessUnlocked(this.save, mapId)) {
            this.store.set({ endless: !endless });
        }
    }

    buyUpgrade(upgradeId: string): void {
        if (buyUpgrade(this.save, upgradeId)) {
            this.sounds.buy();
            this.persist();
        } else {
            this.sounds.denied();
        }
    }

    // Upgrades a piece of gear in the Armoury, one step
    upgradeGear(itemId: string): void {
        if (buyArmouryUpgrade(this.save, itemId)) {
            this.sounds.buy();
            this.persist();
        } else {
            this.sounds.denied();
        }
    }

    playClick(): void {
        this.sounds.click();
    }

    setVolume(volume: number): void {
        this.audio.setSettings({ volume, muted: false });
        this.store.set({ audio: this.audio.settings });
    }

    setMusicVolume(music: number): void {
        this.audio.setSettings({ music, muted: false });
        this.store.set({ audio: this.audio.settings });
    }

    toggleMute(): void {
        this.audio.setSettings({ muted: !this.audio.settings.muted });
        this.store.set({ audio: this.audio.settings });
    }

    toggleMenuSpin(): void {
        this.setDisplay({ menuSpin: !this.display.menuSpin });
    }

    toggleAutoPause(): void {
        this.setDisplay({ pauseOnBlur: !this.display.pauseOnBlur });
    }

    toggleQuestTracker(): void {
        this.setDisplay({ questTracker: !this.display.questTracker });
    }

    private setDisplay(changes: Partial<DisplaySettings>): void {
        this.display = { ...this.display, ...changes };
        saveDisplaySettings(this.display);
        this.store.set({ display: this.display });
    }

    refundUpgrades(): void {
        refundUpgrades(this.save);
        this.persist();
    }

    // Downloads the save as a file
    exportSave(): void {
        const blob = new Blob([exportSave(this.save)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "run-escape-save.json";
        link.click();
        // Once the download has its copy
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Swaps in an imported save in place of this one
    replaceSave(save: SaveData): void {
        this.save = save;
        // The adventurer and map picked might not be open in it
        const { characterId, mapId } = this.store.getSnapshot();
        if (!save.unlockedCharacters.includes(characterId)) {
            this.selectCharacter(save.unlockedCharacters[0]);
        }
        if (!isMapUnlocked(save, mapId)) {
            this.store.set({ mapId: MAPS[0].id });
        }
        if (!isEndlessUnlocked(save, this.store.getSnapshot().mapId)) {
            this.store.set({ endless: false });
        }
        this.persist();
    }

    private persist(): void {
        this.saveStore.save(this.save);
        // A fresh object so React sees the change
        this.store.set({ save: structuredClone(this.save) });
    }

    // Builds a map's collision the first time it's played (a scene build of
    // the whole arena, a moment's work)
    private async loadGrid(mapId: string): Promise<ArenaGrid> {
        let grid = this.grids.get(mapId);
        if (!grid) {
            const region = await this.mapViewer.workerPool.queueLoad<
                RegionDataInput,
                RegionData,
                RegionDataLoader
            >(new RegionDataLoader(), getArenaRegion(getMap(mapId)));
            grid = new ArenaGrid(region);
            this.grids.set(mapId, grid);
        }
        return grid;
    }

    async startRun(): Promise<void> {
        const { mapId } = this.store.getSnapshot();
        if (!isMapUnlocked(this.save, mapId)) {
            return;
        }
        const map = getMap(mapId);
        // Fun maps are always endless, and some have everyone play one
        // adventurer (Durial321 in Falador)
        const endless =
            map.fun !== undefined ||
            (this.store.getSnapshot().endless && isEndlessUnlocked(this.save, mapId));
        const characterId = map.fun?.character ?? this.store.getSnapshot().characterId;
        if (!this.grids.has(mapId)) {
            this.store.set({
                screen: "loading",
                loadingText: `Travelling to ${map.name}`,
                loadingProgress: 50,
            });
        }
        try {
            this.grid = await this.loadGrid(mapId);
        } catch (e) {
            console.error("Failed to load map", mapId, e);
            this.store.set({ screen: "characters" });
            this.store.toast(`Couldn't get to ${map.name}.`);
            return;
        }
        const sim = new Sim({
            grid: this.grid,
            mapId,
            characterId,
            metaStats: getMetaStats(this.save),
            seed: (Math.random() * 0x7fffffff) | 0,
            spawnX: map.spawn.x,
            spawnY: map.spawn.y,
            unlockedItems: new Set(this.save.unlockedItems),
            endless,
            armoury: { ...this.save.armoury },
        });
        for (let i = 0; i < this.options.stress; i++) {
            sim.spawnEnemy(getEnemy("goblin"), "normal");
        }
        this.sim = sim;
        this.renderer.setPlane(this.grid.plane);
        this.minimap.setMap(map);
        const music = map.music && MUSIC[map.music];
        if (music) {
            this.audio.playMusic(music);
        } else {
            this.audio.stopMusic();
        }
        this.paused = false;
        this.runRecorded = false;
        this.tasksAnnounced.clear();
        this.accumulator = 0;
        this.appearanceVersion = -1;
        this.view.reset();
        this.cameraRig.pitch = RUN_PITCH;
        this.cameraRig.distance = RUN_DISTANCE;
        this.cameraRig.yaw = 0;
        this.store.set({
            screen: "run",
            overlay: "none",
            choices: [],
            chest: undefined,
            result: undefined,
            toasts: [],
        });
        this.updateHud(true);
    }

    choose(index: number): void {
        const sim = this.sim;
        if (!sim || sim.state !== "levelUp") {
            return;
        }
        sim.choose(index);
        this.syncOverlay();
        this.updateHud(true);
    }

    // What the player chose with the open casket's item
    resolveChest(action: ChestAction): void {
        const sim = this.sim;
        if (!sim || sim.state !== "chest") {
            return;
        }
        sim.resolveChest(action);
        this.handleEvents(sim, sim.takeEvents());
        this.syncOverlay();
        this.updateHud(true);
    }

    // Rolls the level up's rewards or the open casket's item again, for one of
    // the run's rerolls. False when there's none left.
    reroll(): boolean {
        const sim = this.sim;
        if (!sim) {
            return false;
        }
        if (!sim.reroll()) {
            this.sounds.denied();
            return false;
        }
        if (sim.state === "chest") {
            const chest = getChestView(sim);
            // The UI bursts the casket open again for the new item
            if (chest) {
                this.sounds.chest("open", chest.rarity);
            }
            this.store.set({ chest });
        } else {
            this.sounds.reroll();
            this.store.set({ choices: getChoiceViews(sim) });
        }
        this.updateHud(true);
        return true;
    }

    // Takes none of the level up's rewards, for coins from the run. False when
    // it can't be skipped or there aren't the coins.
    skip(): boolean {
        const sim = this.sim;
        if (!sim || sim.state !== "levelUp") {
            return false;
        }
        if (!sim.skip()) {
            this.sounds.denied();
            return false;
        }
        this.sounds.buy();
        this.syncOverlay();
        this.updateHud(true);
        return true;
    }

    // Uses the utility item in an inventory slot (0-3)
    useItem(index: number): void {
        const sim = this.sim;
        if (!sim || this.paused || !sim.useItem(index)) {
            return;
        }
        this.handleEvents(sim, sim.takeEvents());
        if (sim.state !== "playing") {
            // A lamp's level up, or a blast that killed the boss
            this.syncOverlay();
        }
        this.updateHud(true);
    }

    // The opening animation's sounds, timed by the UI
    playChestSound(cue: ChestCue, rarity: Rarity): void {
        this.sounds.chest(cue, rarity);
    }

    pause(): void {
        if (this.sim && !this.sim.runOver) {
            this.paused = true;
            this.syncOverlay();
        }
    }

    resume(): void {
        this.paused = false;
        this.accumulator = 0;
        this.syncOverlay();
    }

    // Ends the run where it stands (from the pause menu); coins found are kept
    quitRun(): void {
        if (this.sim) {
            this.finishRun();
        }
        this.leaveRun();
    }

    // Back to the title screen after the results
    leaveRun(): void {
        this.sim = undefined;
        this.paused = false;
        this.audio.stopMusic();
        this.grid = this.grids.get(TITLE_MAP.id)!;
        this.renderer.setPlane(this.grid.plane);
        this.view.reset();
        this.cameraRig.pitch = ATTRACT_PITCH;
        this.cameraRig.distance = ATTRACT_DISTANCE;
        this.assets.setPlayerAppearance(
            getCharacterAppearance(this.store.getSnapshot().characterId),
        );
        this.store.set({
            screen: "title",
            overlay: "none",
            hud: undefined,
            choices: [],
            chest: undefined,
            result: undefined,
        });
    }

    private finishRun(): void {
        const sim = this.sim;
        if (!sim || this.runRecorded) {
            return;
        }
        this.runRecorded = true;
        const result = sim.getResult();
        const locked = MAPS.filter((m) => !isMapUnlocked(this.save, m.id));
        const lockedCharacters = CHARACTERS.filter(
            (c) => !this.save.unlockedCharacters.includes(c.id),
        );
        const lockedItems = LOCKABLE_ITEMS.filter((i) => !this.save.unlockedItems.includes(i.id));
        const endlessRecord = result.endless && isEndlessRecord(this.save, result);
        const newGear = result.gearFound.filter((id) => !this.save.foundGear.includes(id));
        const quests = recordRun(this.save, result);
        this.persist();
        const unlockedMap = locked.find((m) => isMapUnlocked(this.save, m.id));
        const unlockedCharacters = lockedCharacters.filter((c) =>
            this.save.unlockedCharacters.includes(c.id),
        );
        const unlockedItems = lockedItems.filter((i) => this.save.unlockedItems.includes(i.id));
        if (unlockedMap) {
            // Ready for the next run
            this.store.set({ mapId: unlockedMap.id, endless: false });
        }
        this.store.set({
            result: {
                ...result,
                characterName: getCharacter(sim.characterId).name,
                damage: getDamageViews(sim, result.stats),
                bossKills: getBossKillViews(result.stats),
                endlessRecord,
                unlockedMap: unlockedMap?.name,
                unlockedCharacters: unlockedCharacters.map((c) => c.name),
                unlockedItems: unlockedItems.map((i) => i.name),
                newGear: newGear.map((id) => getItem(id).name),
                quests: quests.map((q) => ({ name: q.name, coins: q.coins })),
            },
        });
    }

    // A task or quest done mid-run: the adventurer or item joins, and the
    // quest pays out, once the run is over, however it ends (beating the map
    // shows on the results instead)
    private announceTasks(sim: Sim): void {
        if (sim.runOver) {
            return;
        }
        const result = sim.getResult();
        const earned = getEarnedUnlocks(this.save, result);
        const news = [
            ...earned.characters.map((c) => ({
                key: `character:${c.id}`,
                task: c.unlock!,
                text: `The ${c.name} joins you after this run.`,
            })),
            ...earned.items.map((i) => ({
                key: `item:${i.id}`,
                task: i.unlock,
                text: `${i.name} ${i.kind === "item" ? "joins the loot" : "can be found"} after this run.`,
            })),
        ];
        for (const { key, task, text } of news) {
            if (!this.tasksAnnounced.has(key)) {
                this.tasksAnnounced.add(key);
                this.sounds.taskDone();
                this.store.toast(`Task done: ${describeUnlockTask(task)}! ${text}`, 6000);
            }
        }
        for (const quest of getFinishedQuests(this.save, result)) {
            const key = `quest:${quest.id}`;
            if (!this.tasksAnnounced.has(key)) {
                this.tasksAnnounced.add(key);
                this.sounds.taskDone();
                this.store.toast(
                    `Quest complete: ${quest.name}! ${quest.coins.toLocaleString()} coins ` +
                        "are yours after this run.",
                    6000,
                );
            }
        }
    }

    private onKeyPress = (code: string): void => {
        if (code === "F3") {
            this.store.set({ debug: !this.store.getSnapshot().debug });
            return;
        }
        if (code === "KeyM") {
            this.toggleMute();
            return;
        }
        if (code === "KeyQ" && this.sim) {
            this.toggleQuestTracker();
            return;
        }
        const sim = this.sim;
        if (!sim) {
            return;
        }
        const overlay = this.store.getSnapshot().overlay;
        if (code === "Escape" || code === "KeyP") {
            if (overlay === "paused") {
                this.resume();
            } else if (overlay === "none") {
                this.pause();
            }
        } else if (overlay === "levelUp" && code.startsWith("Digit")) {
            const index = parseInt(code.slice(5)) - 1;
            if (index >= 0 && index < sim.choices.length) {
                this.choose(index);
            }
        } else if (overlay === "levelUp" && code === "KeyR") {
            this.reroll();
        } else if (overlay === "levelUp" && code === "KeyX") {
            this.skip();
        } else if (overlay === "none" && code.startsWith("Digit")) {
            // The casket screen has its own keys (it knows when its animation
            // is done)
            this.useItem(parseInt(code.slice(5)) - 1);
        }
    };

    // ---- Frame ----

    update(deltaTimeMs: number, camera: Camera): void {
        this.fps = this.fps * 0.95 + (deltaTimeMs > 0 ? 1000 / deltaTimeMs : 0) * 0.05;
        const wheel = this.input.takeWheel();
        if (wheel !== 0 && this.sim) {
            this.cameraRig.zoom(wheel);
        }
        this.store.expireToasts();

        // The world fades out past the edge of the map
        const { baseX, baseY, sizeX, sizeY } = this.grid;
        const playArea = this.renderer.playArea;
        playArea[0] = baseX;
        playArea[1] = baseY;
        playArea[2] = baseX + sizeX;
        playArea[3] = baseY + sizeY;

        const sim = this.sim;
        if (!sim) {
            this.updateAttract(deltaTimeMs, camera);
            return;
        }

        if (!this.paused && (sim.state === "playing" || sim.runOver)) {
            const wasOver = sim.runOver;
            this.accumulator += Math.min(deltaTimeMs, TICK_MS * MAX_TICKS_PER_FRAME);
            while (this.accumulator >= TICK_MS && (sim.state === "playing" || sim.runOver)) {
                this.accumulator -= TICK_MS;
                const move = this.input.getMoveVector(this.move);
                sim.step(move.x, move.y);
                this.handleEvents(sim, sim.takeEvents());
            }
            if (sim.state !== "playing" && !wasOver) {
                if (!sim.runOver) {
                    this.accumulator = 0;
                }
                this.syncOverlay();
            }
        }

        if (sim.appearanceVersion !== this.appearanceVersion) {
            this.appearanceVersion = sim.appearanceVersion;
            this.assets.setPlayerAppearance(getRunAppearance(sim));
        }

        const now = performance.now();
        if (now - this.lastHudUpdate > HUD_INTERVAL_MS) {
            this.updateHud(false);
            this.announceTasks(sim);
        }

        const alpha = this.getAlpha();
        const player = sim.player;
        const px = player.prevX + (player.x - player.prevX) * alpha;
        const py = player.prevY + (player.y - player.prevY) * alpha;
        // Aim at the player's chest, not their feet
        this.cameraRig.apply(camera, px, this.grid.getHeight(px, py) / 128 - 0.6, py);
    }

    private getAlpha(): number {
        const sim = this.sim;
        if (!sim || this.paused || sim.state !== "playing") {
            return 1;
        }
        return this.accumulator / TICK_MS;
    }

    // Title screen: the character idles in the courtyard while the camera
    // circles them (unless that's turned off)
    private updateAttract(deltaTimeMs: number, camera: Camera): void {
        const ticks = deltaTimeMs / TICK_MS;
        this.attractTick += ticks;
        if (this.display.menuSpin) {
            this.attractYaw = (this.attractYaw + ticks * ATTRACT_SPIN) % 2048;
        } else {
            // Back round to the front the short way
            const offset = this.attractYaw > 1024 ? this.attractYaw - 2048 : this.attractYaw;
            const settled = offset * Math.pow(ATTRACT_SETTLE, ticks);
            this.attractYaw = Math.abs(settled) < 1 ? 0 : (settled + 2048) % 2048;
        }
        this.cameraRig.yaw = this.attractYaw & 2047;
        const { x, y } = TITLE_MAP.spawn;
        this.cameraRig.apply(camera, x, this.grid.getHeight(x, y) / 128 - 0.8, y);
    }

    private handleEvents(sim: Sim, events: SimEvent[]): void {
        if (events.length === 0) {
            return;
        }
        this.view.onEvents(sim, events);
        this.sounds.onEvents(sim, events);
        for (const event of events) {
            switch (event.type) {
                case "casketDropped":
                    this.store.toast(`A ${CASKETS[event.tier].name.toLowerCase()} drops!`);
                    break;
                case "bossSpawned":
                case "bossRose":
                case "bossEnraged":
                    // Bosses that turn up together say so once (Pest Control's
                    // portals, on the first)
                    if (event.message) {
                        this.store.toast(event.message, 6000);
                    }
                    break;
                case "coinsStolen":
                    this.store.toast(
                        `The ${getEnemy(event.enemyId).name} grabs ${event.amount} of your coins!`,
                    );
                    break;
                case "coinsReturned":
                    this.store.toast(`You get your ${event.amount} coins back!`);
                    break;
                case "revive":
                    this.store.toast("Your ring of life saves you!");
                    break;
                case "roundStarted":
                    this.store.toast(describeRound(sim), 7000);
                    break;
                case "powerUp":
                case "notice":
                    this.store.toast(event.message);
                    break;
            }
        }
    }

    // Shows whichever modal the run's state calls for
    private syncOverlay(): void {
        const sim = this.sim;
        if (!sim) {
            return;
        }
        if (sim.state === "dead" || sim.state === "victory") {
            if (sim.state === "dead" && !this.runRecorded) {
                this.sounds.playerDied();
            }
            this.finishRun();
            this.store.set({ overlay: sim.state, choices: [], chest: undefined });
            this.updateHud(true);
        } else if (sim.state === "chest") {
            this.store.set({ overlay: "chest", chest: getChestView(sim), choices: [] });
        } else if (sim.state === "levelUp") {
            this.sounds.levelUp();
            this.store.set({ overlay: "levelUp", choices: getChoiceViews(sim), chest: undefined });
        } else if (this.paused) {
            this.store.set({ overlay: "paused", choices: [], chest: undefined });
        } else {
            this.store.set({ overlay: "none", choices: [], chest: undefined });
        }
    }

    private updateHud(force: boolean): void {
        const sim = this.sim;
        if (!sim) {
            return;
        }
        this.lastHudUpdate = performance.now();
        const thisLevel = sim.xpForThisLevel;
        const nextLevel = sim.xpForNextLevel;
        let boss: HudView["boss"];
        const shownBoss = sim.shownBoss;
        if (shownBoss) {
            boss = {
                name: shownBoss.def.name,
                fraction: shownBoss.dead ? 0 : shownBoss.hp / shownBoss.maxHp,
                enraged: !shownBoss.dead && (shownBoss.bossState?.enraged ?? false),
            };
        }
        const hud: HudView = {
            mapId: sim.map.id,
            round: sim.endless ? sim.round : undefined,
            bossIn: sim.timeLeftForBoss,
            hp: Math.max(0, Math.round(sim.player.hp)),
            maxHp: sim.player.maxHp,
            poisoned: sim.player.poisonEnd !== -1,
            level: sim.level,
            xpFraction: Math.min(
                1,
                Math.max(0, (sim.xp - thisLevel) / Math.max(1, nextLevel - thisLevel)),
            ),
            seconds: sim.seconds,
            kills: sim.kills,
            coins: sim.coins,
            maxWeapons: sim.maxWeapons,
            maxPassives: sim.maxPassives,
            weapons: sim.weapons.map((w) => {
                const last = w.def.levels.length;
                const level = w.def.levels[Math.min(w.level, last) - 1];
                return {
                    id: w.def.id,
                    name: upgradedName(level.name ?? w.def.name, w.level - last),
                    level: w.level,
                    maxLevel: w.def.levels.length,
                    iconObjId: level.objId ?? w.def.iconObjId,
                    detail: w.bonus > 0 ? `+${Math.round(w.bonus * 100)}% damage` : "",
                    stats: weaponStats(w.def, level).map(formatWeaponStat),
                    rarityColor: RARITIES[w.def.rarity].color,
                };
            }),
            passives: sim.passives.map((p) => {
                const def = getPassive(p.id);
                return {
                    id: p.id,
                    name: upgradedName(def.name, p.level - def.maxLevel),
                    level: p.level,
                    maxLevel: def.maxLevel,
                    iconObjId: def.iconObjId,
                    iconSpriteId: def.iconSpriteId,
                    detail: formatPassiveValue(def, p.value),
                    rarityColor: RARITIES[def.rarity].color,
                };
            }),
            stats: formatStats(sim.stats),
            gear: getGearViews(sim),
            inventory: getInventoryViews(sim),
            buffs: getBuffViews(sim),
            rerolls: sim.rerollsLeft,
            skip: sim.canSkip
                ? { cost: sim.skipCost, affordable: sim.coins >= sim.skipCost }
                : undefined,
            boss,
            quests: getQuestTrackViews(this.save, sim),
        };
        const previous = this.store.getSnapshot().hud;
        if (force || !previous || JSON.stringify(previous) !== JSON.stringify(hud)) {
            this.store.set({ hud });
        }
    }

    submitActors(actors: ActorRenderer, _camera: Camera): void {
        const sim = this.sim;
        if (sim) {
            this.view.submitActors(actors, sim, this.getAlpha());
            return;
        }
        // Title screen: just the character
        const model = this.assets.getPlayer();
        if (model) {
            const anim = model.getAnim(PLAYER_SEQS.idle);
            const tick = Math.floor(this.attractTick);
            actors.draw(
                model,
                anim,
                anim.getFrame(tick),
                TITLE_MAP.spawn.x,
                this.grid.getHeight(TITLE_MAP.spawn.x, TITLE_MAP.spawn.y) / 128,
                TITLE_MAP.spawn.y,
                0,
            );
        }
    }

    drawOverlay(camera: Camera): void {
        const overlay = this.overlay;
        overlay.begin(camera);
        const sim = this.sim;
        if (sim) {
            this.view.drawOverlay(overlay, sim, this.getAlpha());
            if (this.minimapCanvas) {
                this.minimap.draw(this.minimapCanvas, sim, this.getAlpha());
            }
        }
        if (this.store.getSnapshot().debug) {
            this.drawDebug(sim);
        }
    }

    private drawDebug(sim: Sim | undefined): void {
        const overlay = this.overlay;
        const ctx = overlay.ctx;
        const x = sim ? sim.player.x : TITLE_MAP.spawn.x;
        const y = sim ? sim.player.y : TITLE_MAP.spawn.y;
        this.drawCollisionDebug(Math.floor(x), Math.floor(y));
        ctx.font = "16px OSRS Small, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#ffff00";
        const alive = sim ? sim.enemies.filter((e) => !e.dead).length : 0;
        const timeLeft = sim ? Math.round(sim.timeLeftForBoss) : 0;
        ctx.fillText(
            `${this.fps.toFixed(0)} fps  enemies ${alive}  projectiles ${sim?.projectiles.length ?? 0}  ` +
                `pickups ${sim?.pickups.length ?? 0}  tile ${Math.floor(x)}, ${Math.floor(y)}  ` +
                `flags 0x${this.grid.getFlags(Math.floor(x), Math.floor(y)).toString(16)}  boss in ${timeLeft}s`,
            12,
            overlay.height - 12,
        );
    }

    private drawCollisionDebug(cx: number, cy: number): void {
        const overlay = this.overlay;
        const ctx = overlay.ctx;
        const grid = this.grid;
        const range = 14;

        const corner = (x: number, y: number) => {
            const height = grid.getHeight(x, y) / 128;
            const p = overlay.project(x, height, y, this.screen);
            return [p.x, p.y, p.visible ? 1 : 0];
        };
        const box = { x0: 0, y0: 0, x1: 0, y1: 0 };

        ctx.lineWidth = 2;
        for (let ty = cy - range; ty <= cy + range; ty++) {
            for (let tx = cx - range; tx <= cx + range; tx++) {
                const flags = grid.getFlags(tx, ty);
                if (flags === 0) {
                    continue;
                }
                const sw = corner(tx, ty);
                const se = corner(tx + 1, ty);
                const ne = corner(tx + 1, ty + 1);
                const nw = corner(tx, ty + 1);
                if (!sw[2] && !ne[2]) {
                    continue;
                }
                if (grid.isSolid(tx, ty)) {
                    ctx.fillStyle =
                        flags & CollisionFlag.FLOOR
                            ? "rgba(0, 120, 255, 0.35)"
                            : "rgba(255, 0, 0, 0.35)";
                    // Objects only block part of their tile
                    const { x0, y0, x1, y1 } = grid.getSolidBox(tx, ty, box);
                    const bsw = corner(x0, y0);
                    const bse = corner(x1, y0);
                    const bne = corner(x1, y1);
                    const bnw = corner(x0, y1);
                    ctx.beginPath();
                    ctx.moveTo(bsw[0], bsw[1]);
                    ctx.lineTo(bse[0], bse[1]);
                    ctx.lineTo(bne[0], bne[1]);
                    ctx.lineTo(bnw[0], bnw[1]);
                    ctx.closePath();
                    ctx.fill();
                    continue;
                }
                ctx.strokeStyle = "#ffff00";
                ctx.beginPath();
                if (flags & CollisionFlag.WALL_NORTH) {
                    ctx.moveTo(nw[0], nw[1]);
                    ctx.lineTo(ne[0], ne[1]);
                }
                if (flags & CollisionFlag.WALL_SOUTH) {
                    ctx.moveTo(sw[0], sw[1]);
                    ctx.lineTo(se[0], se[1]);
                }
                if (flags & CollisionFlag.WALL_EAST) {
                    ctx.moveTo(se[0], se[1]);
                    ctx.lineTo(ne[0], ne[1]);
                }
                if (flags & CollisionFlag.WALL_WEST) {
                    ctx.moveTo(sw[0], sw[1]);
                    ctx.lineTo(nw[0], nw[1]);
                }
                ctx.stroke();
            }
        }
    }
}
