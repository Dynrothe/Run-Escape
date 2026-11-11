import { useEffect, useState } from "react";

import { isCoarsePointer } from "../../util/DeviceUtil";
import { GameClient } from "../client/GameClient";
import { SOUND_ORB_SPRITES } from "../content/titleIcons";
import { t } from "../i18n";
import { iconCache } from "./ItemIcon";
import { usePadKind } from "./PadHint";

// An interface sprite as the cache has it, at its own size: the orb's frame is wider than an
// item icon, which ItemIcon would cut it to
function Sprite({ id, className }: { id: number; className: string }): JSX.Element | null {
    const [url, setUrl] = useState(() => iconCache.getFrame(id, 0));
    useEffect(() => {
        let cancelled = false;
        iconCache.requestFrame(id, 0, (loaded) => {
            if (!cancelled) {
                setUrl(loaded);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [id]);
    return url ? <img className={className} src={url} alt="" draggable={false} /> : null;
}

// The sound's orb, like the client's by its minimap: the Music tab's harp in its circle, with the
// "no" sign over it while the sound's off, and M, the key for it, on its plate (for the keyboard:
// a controller has no button for it). Pressing it turns the sound off or on.
export function SoundOrb({
    client,
    muted,
    className,
}: {
    client: GameClient;
    muted: boolean;
    className?: string;
}): JSX.Element {
    const pad = usePadKind();
    const label = muted ? t("canvas.sound_off_orb") : t("canvas.sound_on_orb");
    return (
        <button
            className={"ui-sound-orb" + (className ? " " + className : "")}
            title={label}
            aria-label={label}
            onClick={(e) => {
                client.toggleMute();
                // Give the keys back to the run
                e.currentTarget.blur();
            }}
        >
            <Sprite id={SOUND_ORB_SPRITES.frame} className="ui-sound-orb-frame" />
            <Sprite id={SOUND_ORB_SPRITES.fill} className="ui-sound-orb-fill" />
            {!pad && !isCoarsePointer && (
                <span className="ui-sound-orb-key" aria-hidden="true">
                    M
                </span>
            )}
            <Sprite id={SOUND_ORB_SPRITES.music} className="ui-sound-orb-music" />
            {muted && <Sprite id={SOUND_ORB_SPRITES.off} className="ui-sound-orb-off" />}
        </button>
    );
}
