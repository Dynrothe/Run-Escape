import { useEffect, useRef, useState } from "react";

import { LANGS, Lang, setLang, t, useLang } from "../i18n";
import "./LanguageSetting.css";

// A language as it's offered: its name, and who translated it in small text underneath
export function LanguageName({ lang }: { lang: Lang }): JSX.Element {
    const { label, translator } = LANGS.find((it) => it.id === lang)!;
    return (
        <span className="ui-language-name">
            <span className="ui-language-label">{label}</span>
            {translator && (
                <span className="ui-language-credit">
                    {t("settings.language.translator", { name: translator })}
                </span>
            )}
        </span>
    );
}

// Settings' and the pause menu's: a dropdown of the languages
export function LanguageSetting(): JSX.Element {
    return (
        <div className="ui-setting">
            <div className="ui-setting-label">
                <div className="ui-setting-name">{t("settings.language.name")}</div>
            </div>
            <div className="ui-setting-control">
                <LanguageDropdown />
            </div>
        </div>
    );
}

function LanguageDropdown(): JSX.Element {
    const currentLang = useLang();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        // In sight in a panel that scrolls, with the focus on the language picked, so a pad's
        // d-pad starts from there
        listRef.current?.scrollIntoView?.({ block: "nearest" });
        listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus();
        // Escape closes the list, not the menu it's in: caught before the menu's own keys
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
            }
        };
        const onPointerDown = (e: PointerEvent) => {
            if (!wrapperRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("pointerdown", onPointerDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("pointerdown", onPointerDown);
        };
    }, [open]);

    return (
        <div ref={wrapperRef} className="ui-language-dropdown">
            <button
                type="button"
                className={"ui-button ui-language-current" + (open ? " ui-language-open" : "")}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={(e) => {
                    setOpen(!open);
                    e.currentTarget.blur();
                }}
            >
                <LanguageName lang={currentLang} />
                <span className="ui-language-caret" aria-hidden="true" />
            </button>
            {open && (
                <div
                    ref={listRef}
                    className="ui-language-list rs-border rs-background"
                    role="listbox"
                    aria-label={t("settings.language.name")}
                >
                    {LANGS.map(({ id }) => (
                        <button
                            key={id}
                            type="button"
                            role="option"
                            aria-selected={currentLang === id}
                            className={
                                "ui-language-option" +
                                (currentLang === id ? " ui-language-active" : "")
                            }
                            onClick={(e) => {
                                e.currentTarget.blur();
                                setOpen(false);
                                setLang(id);
                            }}
                        >
                            <LanguageName lang={id} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
