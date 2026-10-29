import { Fragment } from "react";

import "./ChangelogPanel.css";
import { CHANGELOG } from "./changelog";
import { renderBold } from "./renderBold";

type Props = {
    onClose: () => void;
};

// What's changed, version by version, from CHANGELOG.md. Unreleased only
// shows once something's under it.
export function ChangelogPanel({ onClose }: Props): JSX.Element {
    return (
        <div className="ui-panel rs-border rs-background ui-changelog">
            <h2>What's new</h2>
            <div className="ui-changelog-list">
                {CHANGELOG.filter((v) => v.sections.length > 0).map((v) => (
                    <section key={v.version}>
                        <h3 className="ui-changelog-version">
                            {v.version}
                            {v.date && (
                                <span className="ui-changelog-date">{formatDate(v.date)}</span>
                            )}
                        </h3>
                        {v.sections.map((section) => (
                            <Fragment key={section.heading}>
                                <h4 className="ui-changelog-heading">{section.heading}</h4>
                                <ul>
                                    {section.items.map((item, i) => (
                                        <li key={i}>{renderBold(item)}</li>
                                    ))}
                                </ul>
                            </Fragment>
                        ))}
                    </section>
                ))}
            </div>
            <div className="ui-row">
                <button className="ui-button" onClick={onClose}>
                    Back
                </button>
            </div>
        </div>
    );
}

// "2026-10-27" as "27 October 2026"
function formatDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
