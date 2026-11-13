import { t } from "../i18n";
import "./NoticePanel.css";
import { Notice } from "./notice";
import { renderBold } from "./renderBold";
import { useDialog } from "./useDialog";

type Props = {
    notice: Notice;
    onClose: () => void;
};

// Over the title screen until it's closed
export function NoticePanel({ notice, onClose }: Props): JSX.Element {
    const { titleId, dialogProps } = useDialog<HTMLDivElement>();
    return (
        <div className="ui-modal">
            <div {...dialogProps} className="ui-panel rs-border rs-background ui-notice">
                {notice.title && <h2 id={titleId}>{notice.title}</h2>}
                <div className="ui-notice-body">
                    {notice.blocks.map((block, i) =>
                        block.kind === "paragraph" ? (
                            <p key={i}>{renderBold(block.text)}</p>
                        ) : (
                            <ul key={i}>
                                {block.items.map((item, j) => (
                                    <li key={j}>{renderBold(item)}</li>
                                ))}
                            </ul>
                        ),
                    )}
                </div>
                <div className="ui-notice-close">
                    <button className="ui-button" onClick={onClose}>
                        {t("save.got_it")}
                    </button>
                </div>
            </div>
        </div>
    );
}
