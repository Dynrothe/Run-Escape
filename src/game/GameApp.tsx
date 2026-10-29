import { useEffect, useMemo, useRef, useState } from "react";
import WebFont from "webfontloader";

import { RendererCanvas } from "../components/renderer/RendererCanvas";
import { fetchCacheList, loadCacheFiles } from "../mapviewer/Caches";
import { MapViewer } from "../mapviewer/MapViewer";
import { WEBGL } from "../mapviewer/MapViewerRenderers";
import { RenderDataWorkerPool } from "../mapviewer/worker/RenderDataWorkerPool";
import { DownloadProgress } from "../rs/cache/CacheFiles";
import { formatBytes } from "../util/BytesUtil";
import "./GameApp.css";
import { GAME_CACHE_NAME, deleteOtherGameCaches, findGameCache } from "./cache";
import { GameClient } from "./client/GameClient";
import { GameStore } from "./client/GameStore";
import { MAPS } from "./content/maps";
import { LocalSaveStore } from "./core/save";
import { GameWebGLRenderer } from "./render/GameWebGLRenderer";
import { GameUi } from "./ui/GameUi";
import { iconCache } from "./ui/ItemIcon";

WebFont.load({
    custom: {
        families: ["OSRS Bold", "OSRS Small"],
    },
});

const workerPool = RenderDataWorkerPool.create(4);

if (import.meta.hot) {
    // The renderer, workers and a run in progress can't be swapped out live, so
    // any code change reloads the page instead of hot updating it.
    import.meta.hot.on("vite:beforeUpdate", () => window.location.reload());
}

// Small enough that the top-down view never shows the fog edge, large enough to
// keep a ring of loaded map squares around the player.
const RENDER_DISTANCE = 72;

type Loaded = {
    mapViewer: MapViewer;
    renderer: GameWebGLRenderer;
};

async function loadViewer(
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void,
): Promise<Loaded> {
    // The cache is shared with the workers in a SharedArrayBuffer, which
    // browsers only allow on a cross-origin isolated page
    if (!window.crossOriginIsolated) {
        throw new Error(
            "This page has to be served with the headers Cross-Origin-Opener-Policy: same-origin " +
                "and Cross-Origin-Embedder-Policy: require-corp (see Hosting in the README).",
        );
    }
    const cacheList = await fetchCacheList();
    if (!cacheList) {
        throw new Error("Failed to load the cache list (caches/caches.json).");
    }
    const cacheInfo = findGameCache(cacheList.caches);
    if (!cacheInfo) {
        throw new Error(
            `Cache ${GAME_CACHE_NAME} is missing. Download it with npm run download-caches.`,
        );
    }
    const cache = await loadCacheFiles(cacheInfo, signal, onProgress);
    deleteOtherGameCaches(cacheInfo.name).catch(console.error);
    const mapImageCache = await caches.open("map-images");

    let renderer!: GameWebGLRenderer;
    const mapViewer = new MapViewer(
        workerPool,
        cacheList,
        [],
        [],
        mapImageCache,
        WEBGL,
        cache,
        (mapViewer) => {
            // Place the camera before the first map squares are queued
            mapViewer.camera.pos[0] = MAPS[0].spawn.x;
            mapViewer.camera.pos[2] = MAPS[0].spawn.y;
            mapViewer.renderDistance = RENDER_DISTANCE;
            renderer = new GameWebGLRenderer(mapViewer);
            return renderer;
        },
    );
    iconCache.setWorkerPool(workerPool);
    return { mapViewer, renderer };
}

export function GameApp(): JSX.Element {
    const saveStore = useMemo(() => new LocalSaveStore(), []);
    const store = useMemo(() => new GameStore(saveStore.load()), [saveStore]);
    const [errorMessage, setErrorMessage] = useState<string>();
    const [loaded, setLoaded] = useState<Loaded>();
    const [client, setClient] = useState<GameClient>();
    const overlayRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const abortController = new AbortController();
        loadViewer(abortController.signal, (progress: DownloadProgress) => {
            store.set({
                loadingText: `Downloading cache (${formatBytes(progress.total)})`,
                loadingProgress: ((progress.current / progress.total) * 100) | 0,
            });
        })
            .then((loaded) => {
                store.set({ loadingText: "Loading Lumbridge", loadingProgress: 0 });
                setLoaded(loaded);
                if (import.meta.env.DEV) {
                    (window as any).mapViewer = loaded.mapViewer;
                }
            })
            .catch((e) => {
                console.error(e);
                setErrorMessage(e instanceof Error ? e.message : String(e));
            });
        return () => abortController.abort();
    }, [store]);

    useEffect(() => {
        if (!loaded || !overlayRef.current) {
            return;
        }
        let disposed = false;
        let created: GameClient | undefined;
        const params = new URLSearchParams(window.location.search);
        GameClient.create(loaded.mapViewer, loaded.renderer, overlayRef.current, store, saveStore, {
            stress: parseInt(params.get("stress") ?? "0") || 0,
            autostart: params.get("autostart") ?? undefined,
        })
            .then((gameClient) => {
                if (disposed) {
                    gameClient.dispose();
                    return;
                }
                created = gameClient;
                loaded.renderer.game = gameClient;
                setClient(gameClient);
                if (import.meta.env.DEV) {
                    (window as any).game = gameClient;
                }
            })
            .catch((e) => {
                console.error(e);
                setErrorMessage(e instanceof Error ? e.message : String(e));
            });
        return () => {
            disposed = true;
            created?.dispose();
        };
    }, [loaded, store, saveStore]);

    return (
        <div className="game-root">
            {loaded && <RendererCanvas renderer={loaded.renderer} />}
            <canvas className="game-overlay" ref={overlayRef} />
            {errorMessage ? (
                <div className="game-status content-text">{errorMessage}</div>
            ) : (
                <GameUi store={store} client={client} />
            )}
        </div>
    );
}
