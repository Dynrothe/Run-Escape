import { useState } from "react";

import { LANGS, t, useLang } from "../i18n";
import "./NoticePanel.css";

// Said once, the first time the game is in a language other than English (picked, or the
// browser's): only English is checked. Its own key beside the language's, never in the save.
const SEEN_KEY = "rune-survivors-language-notice";

function loadSeen(): boolean {
    try {
        return window.localStorage.getItem(SEEN_KEY) === "1";
    } catch (e) {
        return false;
    }
}

function saveSeen(): void {
    try {
        window.localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}
}

export function LanguageNotice(): JSX.Element | null {
    const lang = useLang();
    const [seen, setSeen] = useState(loadSeen);
    if (lang === "en" || seen) {
        return null;
    }
    const { label, translator } = LANGS.find((it) => it.id === lang)!;
    const close = () => {
        saveSeen();
        setSeen(true);
    };
    // ui-fill for the UI's font, as it's not on a screen
    return (
        <div className="ui-fill ui-modal ui-language-notice">
            <div className="ui-panel rs-border rs-background ui-notice">
                <h2>{t("language.notice.title")}</h2>
                <div className="ui-notice-body">
                    <p>{t("language.notice.body")}</p>
                    {translator && (
                        <p>{t("language.notice.credit", { language: label, name: translator })}</p>
                    )}
                </div>
                <div className="ui-notice-close">
                    <button className="ui-button ui-button-go" onClick={close}>
                        {t("language.notice.ok")}
                    </button>
                </div>
            </div>
        </div>
    );
}
