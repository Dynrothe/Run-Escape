import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";

import { GameApp } from "./game/GameApp";
import "./index.css";
import reportWebVitals from "./reportWebVitals";
import { Bzip2 } from "./rs/compression/Bzip2";
import { Gzip } from "./rs/compression/Gzip";

Bzip2.initWasm();
Gzip.initWasm();

window.wallpaperPropertyListener = {
    applyGeneralProperties: (properties: any) => {
        if (properties.fps) {
            window.wallpaperFpsLimit = properties.fps;
        }
    },
};

// Dev only: drive frames with timers instead of requestAnimationFrame, so the
// game keeps running in a browser pane that isn't being painted (automated
// testing).
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("bgtick")) {
    window.requestAnimationFrame = (callback) =>
        window.setTimeout(() => callback(performance.now()), 16) as unknown as number;
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
}

// The original map viewer stays available for debugging the world. It's only
// loaded when asked for: importing it starts its own render workers.
const showViewer = new URLSearchParams(window.location.search).has("viewer");
const MapViewerApp = lazy(() => import("./mapviewer/MapViewerApp"));

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    // <React.StrictMode>
    showViewer ? (
        <Suspense>
            <MapViewerApp />
        </Suspense>
    ) : (
        <GameApp />
    ),
    // </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
