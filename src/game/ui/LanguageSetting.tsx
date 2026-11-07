import { LANGS, setLang, t, useLang } from "../i18n";

export function LanguageSetting(): JSX.Element {
    const currentLang = useLang();

    return (
        <div className="ui-setting">
            <div className="ui-setting-label">
                <div className="ui-setting-name">{t("settings.language.name")}</div>
            </div>
            <div className="ui-setting-control ui-language-control">
                {LANGS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        className={
                            "ui-button ui-button-small ui-frame-rate ui-language-btn" +
                            (currentLang === id ? " ui-frame-rate-on" : "")
                        }
                        aria-pressed={currentLang === id}
                        onClick={(e) => {
                            setLang(id);
                            e.currentTarget.blur();
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}
