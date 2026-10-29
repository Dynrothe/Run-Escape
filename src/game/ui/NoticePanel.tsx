import "./NoticePanel.css";
import { Notice } from "./notice";
import { renderBold } from "./renderBold";

type Props = {
    notice: Notice;
    onClose: () => void;
};

// Over the title screen until it's closed
export function NoticePanel({ notice, onClose }: Props): JSX.Element {
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-notice">
                {notice.title && <h2>{notice.title}</h2>}
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
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
