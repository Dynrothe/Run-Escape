import { isCoarsePointer } from "../../util/DeviceUtil";
import { GameClient } from "../client/GameClient";
import { SOUND_ORB_SPRITES } from "../content/titleIcons";
import { t } from "../i18n";
import { KeyHint } from "./PadHint";
import { useSpriteFrame } from "./useSpriteFrame";

// An interface sprite as the cache has it, at its own size: the orb's frame is wider than an
// item icon, which ItemIcon would cut it to
function Sprite({ id, className }: { id: number; className: string }): JSX.Element | null {
    const url = useSpriteFrame(id, 0);
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
    const label = muted ? t("canvas.sound_off_orb") : t("canvas.sound_on_orb");
    return (
        <button
            className={"ui-sound-orb" + (className ? " " + className : "")}
            title={label}
            aria-label={label}
            onClick={(e) => {
                client.toggleMute(true);
                // A click gives the keys back to the run. Enter or a controller's button (a click
                // of no clicks) keeps the highlight on it.
                if (e.detail > 0) {
                    e.currentTarget.blur();
                }
            }}
        >
            <Sprite id={SOUND_ORB_SPRITES.frame} className="ui-sound-orb-frame" />
            <Sprite id={SOUND_ORB_SPRITES.fill} className="ui-sound-orb-fill" />
            <KeyHint keyLabel={isCoarsePointer ? undefined : "M"} className="ui-sound-orb-key" />
            <Sprite id={SOUND_ORB_SPRITES.music} className="ui-sound-orb-music" />
            {muted && <Sprite id={SOUND_ORB_SPRITES.off} className="ui-sound-orb-off" />}
        </button>
    );
}
