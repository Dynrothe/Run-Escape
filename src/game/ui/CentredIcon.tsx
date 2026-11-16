import { useEffect, useState } from "react";

import { pixelRatio } from "../../util/DeviceUtil";
import { StatIconRef, statKeyIcon } from "../content/statIcons";
import { StatKey } from "../content/types";
import { iconCache } from "./ItemIcon";

// An icon cut down to what's drawn in it, and how big that is (0 when nothing is)
type Trimmed = { url: string; width: number; height: number };

const trimmed = new Map<string, Trimmed>();
const trimming = new Map<string, Promise<Trimmed>>();

// Cuts an icon's empty edges off, once for each icon
function trimIcon(src: string): Promise<Trimmed> {
    let pending = trimming.get(src);
    if (!pending) {
        pending = new Promise<Trimmed>((resolve) => {
            const image = new Image();
            image.onload = () => {
                const { width, height } = image;
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve({ url: src, width, height });
                    return;
                }
                ctx.drawImage(image, 0, 0);
                const { data } = ctx.getImageData(0, 0, width, height);
                let left = width;
                let top = height;
                let right = -1;
                let bottom = -1;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (data[(x + y * width) * 4 + 3] > 0) {
                            left = Math.min(left, x);
                            right = Math.max(right, x);
                            top = Math.min(top, y);
                            bottom = Math.max(bottom, y);
                        }
                    }
                }
                if (right < 0) {
                    resolve({ url: src, width: 0, height: 0 });
                    return;
                }
                const out = document.createElement("canvas");
                out.width = right - left + 1;
                out.height = bottom - top + 1;
                out.getContext("2d")!.drawImage(canvas, -left, -top);
                resolve({ url: out.toDataURL(), width: out.width, height: out.height });
            };
            image.onerror = () => resolve({ url: src, width: 0, height: 0 });
            image.src = src;
        }).then((result) => {
            trimmed.set(src, result);
            return result;
        });
        trimming.set(src, pending);
    }
    return pending;
}

// An icon's picture: an item's, or a sprite padded out to an item icon's size, as ItemIcon draws
// them
function useIconSrc(icon: StatIconRef | undefined): string | undefined {
    const count = icon?.count ?? 1;
    const key =
        icon === undefined
            ? ""
            : icon.spriteId !== undefined
              ? `sprite:${icon.spriteId}`
              : `${icon.objId}:${count}`;
    const cached = (): string | undefined =>
        icon === undefined
            ? undefined
            : icon.spriteId !== undefined
              ? iconCache.getSprite(icon.spriteId)
              : iconCache.get(icon.objId, count);
    const [loaded, setLoaded] = useState<{ key: string; url: string }>();
    useEffect(() => {
        if (icon === undefined) {
            return;
        }
        let cancelled = false;
        const done = (url: string) => {
            if (!cancelled) {
                setLoaded({ key, url });
            }
        };
        if (icon.spriteId !== undefined) {
            iconCache.requestSprite(icon.spriteId, done);
        } else {
            iconCache.request(icon.objId, count, done);
        }
        return () => {
            cancelled = true;
        };
        // (the icon goes by the key)
    }, [key]);
    return (loaded?.key === key ? loaded.url : undefined) || cached() || undefined;
}

// An icon cut down to what's drawn and fitted to the middle of a square. A skill's sprite is small
// in its 25x25, and an item's model fills its 36x32 and seldom sits in the middle of it, so icons
// in a column come out the same size and in line with what's over and under them. Until it's cut
// down, the whole icon is fitted to the square.
export function CentredIcon({
    icon,
    box,
}: {
    icon: StatIconRef | undefined;
    box: number;
}): JSX.Element {
    const src = useIconSrc(icon);
    const [cut, setCut] = useState<{ src: string; icon: Trimmed }>();
    useEffect(() => {
        if (!src || trimmed.has(src)) {
            return;
        }
        let cancelled = false;
        void trimIcon(src).then((result) => {
            if (!cancelled) {
                setCut({ src, icon: result });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [src]);
    const square = { width: box, height: box };
    const drawn = src ? (trimmed.get(src) ?? (cut?.src === src ? cut.icon : undefined)) : undefined;
    if (!src || drawn?.width === 0) {
        return <span className="ui-centred-icon" style={square} aria-hidden="true" />;
    }
    if (!drawn) {
        return (
            <span className="ui-centred-icon" style={square} aria-hidden="true">
                <img
                    className="ui-icon ui-icon-smooth"
                    src={src}
                    style={{ ...square, objectFit: "contain" }}
                    alt=""
                    draggable={false}
                />
            </span>
        );
    }
    // Never blown up: a sprite stays at its own size, crisp
    const scale = Math.min(1, box / drawn.width, box / drawn.height);
    return (
        <span className="ui-centred-icon" style={square} aria-hidden="true">
            <img
                className={scale * pixelRatio < 1 ? "ui-icon ui-icon-smooth" : "ui-icon"}
                src={drawn.url}
                width={Math.round(drawn.width * scale)}
                height={Math.round(drawn.height * scale)}
                alt=""
                draggable={false}
            />
        </span>
    );
}

// A stat's icon, the same size as every other stat's
export function StatGlyph({ statKey, box = 20 }: { statKey: StatKey; box?: number }): JSX.Element {
    return <CentredIcon icon={statKeyIcon(statKey)} box={box} />;
}
