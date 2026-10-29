/// <reference types="vite/client" />
import React from "react";

declare global {
    interface Window {
        wallpaperRegisterAudioListener: any;

        wallpaperPropertyListener: any;

        wallpaperFpsLimit?: number;
    }

    // package.json's version, put in by vite.config.ts
    const __APP_VERSION__: string;
}

declare module "react" {
    function memo<T extends React.ComponentType<any>>(
        c: T,
        areEqual?: (
            prev: Readonly<React.ComponentProps<T>>,
            next: Readonly<React.ComponentProps<T>>,
        ) => boolean,
    ): T;
}
