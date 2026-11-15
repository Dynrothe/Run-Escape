import { useEffect, useRef, useState } from "react";

import { FLAG_FRAMES, FLAG_SPRITE } from "../content/flags";
import { LANGS, Lang, setLang, t, useLang } from "../i18n";
import "./LanguageSetting.css";
import { releaseFocus } from "./menuKeys";
import { useSpriteFrame } from "./useSpriteFrame";

// A language's flag: the world list's round one for its country (co-op's flags), and nothing
// while it loads or where the cache hasn't got it. Only decoration: its name is beside it.
function LanguageFlag({ country }: { country: string }): JSX.Element {
    const url = useSpriteFrame(FLAG_SPRITE, FLAG_FRAMES[country]);
    return url ? (
        <img className="ui-flag ui-language-flag" src={url} alt="" draggable={false} />
    ) : (
        <span className="ui-flag ui-language-flag" />
    );
}

// A language as it's offered: its flag, its name, and who translated it in small text underneath
export function LanguageName({ lang }: { lang: Lang }): JSX.Element {
    const { label, translator, country } = LANGS.find((it) => it.id === lang)!;
    return (
        <span className="ui-language-name">
            <LanguageFlag country={country} />
            <span className="ui-language-text">
                <span className="ui-language-label">{label}</span>
                {translator && (
                    <span className="ui-language-credit">
                        {t("settings.language.translator", { name: translator })}
                    </span>
                )}
            </span>
        </span>
    );
}

// Settings' and the pause menu's: a dropdown of the languages
export function LanguageSetting(): JSX.Element {
    return (
        <div className="ui-setting">
            <div className="ui-setting-label">
                <div className="ui-setting-name">{t("settings.language.name")}</div>
                <div className="ui-setting-text">{t("settings.language.desc")}</div>
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
                    releaseFocus(e);
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
                                releaseFocus(e);
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
