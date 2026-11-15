import { useEffect, useState } from "react";

import { STONE_SLOT_SPRITE } from "../content/titleIcons";
import { iconCache } from "./ItemIcon";

// The client's grey stone slot, drawn from the cache at its own size, as a CSS `url(...)` for
// `--ui-stone` (a `border-image`'s source). Empty until it's loaded, or when the cache hasn't got
// it: what it's meant for keeps its dark brown meanwhile.
export function useStoneSlot(): string {
    const [url, setUrl] = useState(() => iconCache.getFrame(STONE_SLOT_SPRITE, 0) ?? "");
    useEffect(() => {
        let cancelled = false;
        iconCache.requestFrame(STONE_SLOT_SPRITE, 0, (loaded) => {
            if (!cancelled) {
                setUrl(loaded);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return url ? `url(${url})` : "";
}
