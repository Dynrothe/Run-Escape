import { useEffect, useState } from "react";

import { iconCache } from "./ItemIcon";

// A frame of an interface sprite at its own size (a flag, the sound's orb): undefined until
// it's drawn, or with no frame, and "" for one the cache hasn't got
export function useSpriteFrame(spriteId: number, frame: number | undefined): string | undefined {
    const cached = () => (frame !== undefined ? iconCache.getFrame(spriteId, frame) : undefined);
    const [loaded, setLoaded] = useState(() => ({ spriteId, frame, url: cached() }));
    // Never the last frame while a new one's drawn
    const url = loaded.spriteId === spriteId && loaded.frame === frame ? loaded.url : cached();
    useEffect(() => {
        if (frame === undefined) {
            return;
        }
        let cancelled = false;
        iconCache.requestFrame(spriteId, frame, (url) => {
            if (!cancelled) {
                setLoaded({ spriteId, frame, url });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [spriteId, frame]);
    return url;
}
