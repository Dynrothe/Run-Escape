import { useCallback, useEffect, useRef, useState } from "react";

import { LANGS, Lang, setLang, t, useLang } from "../i18n";
import "./TitleLanguageMenu.css";

const EXIT_DURATION_MS = 180;
const LEAVE_DELAY_MS = 140;

export function TitleLanguageMenu(): JSX.Element {
    const currentLang = useLang();
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);

    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const clearTimers = useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        if (exitTimeoutRef.current) {
            clearTimeout(exitTimeoutRef.current);
            exitTimeoutRef.current = null;
        }
    }, []);

    const startExit = useCallback(() => {
        clearTimers();
        setClosing(true);
        exitTimeoutRef.current = setTimeout(() => {
            setOpen(false);
            setClosing(false);
        }, EXIT_DURATION_MS);
    }, [clearTimers]);

    // After a pick the pointer is still over the button, and the language swap (a view
    // transition) makes the browser re-fire mouseenter once it's done. That must not
    // reopen the menu: hover stays off until the pointer has actually left the button.
    const hoverBlockedRef = useRef(false);

    const handleMouseEnter = useCallback(() => {
        if (hoverBlockedRef.current) {
            return;
        }
        clearTimers();
        setClosing(false);
        setOpen(true);
    }, [clearTimers]);

    const handleMouseLeave = useCallback(() => {
        clearTimers();
        closeTimeoutRef.current = setTimeout(() => {
            startExit();
        }, LEAVE_DELAY_MS);
    }, [clearTimers, startExit]);

    const handleToggle = useCallback(() => {
        clearTimers();
        hoverBlockedRef.current = false;
        if (open && !closing) {
            startExit();
        } else {
            setClosing(false);
            setOpen(true);
        }
    }, [open, closing, clearTimers, startExit]);

    const handleSelect = useCallback(
        (id: Lang) => {
            hoverBlockedRef.current = true;
            setLang(id);
            startExit();
        },
        [startExit],
    );

    // Hover works again once the pointer is seen outside the button. It's judged by
    // position: during the view transition the pointer's events target the page, not us.
    useEffect(() => {
        const onPointerMove = (e: PointerEvent) => {
            if (!hoverBlockedRef.current || !wrapperRef.current) {
                return;
            }
            // The button and the menu both count: the pointer is left on the menu after a pick
            const parts = [wrapperRef.current, ...wrapperRef.current.querySelectorAll("*")];
            const inside = parts.some((part) => {
                const rect = part.getBoundingClientRect();
                return (
                    e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom
                );
            });
            if (!inside) {
                hoverBlockedRef.current = false;
            }
        };
        window.addEventListener("pointermove", onPointerMove);
        return () => window.removeEventListener("pointermove", onPointerMove);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                startExit();
            }
        };

        const onPointerDown = (e: MouseEvent | TouchEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                startExit();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("pointerdown", onPointerDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("pointerdown", onPointerDown);
            clearTimers();
        };
    }, [open, startExit, clearTimers]);

    return (
        <div
            ref={wrapperRef}
            className="ui-title-language-wrapper"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button
                type="button"
                className={
                    "ui-title-link ui-title-language" +
                    (open && !closing ? " ui-title-language-open" : "")
                }
                aria-label={t("ui.title.language")}
                aria-haspopup="menu"
                aria-expanded={open && !closing}
                onClick={handleToggle}
            >
                <svg className="ui-title-link-logo" viewBox="0 0 24 24" aria-hidden="true">
                    <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
                    <path
                        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                </svg>
            </button>

            {open && (
                <div
                    className={
                        "ui-title-language-tooltip rs-border rs-background" +
                        (closing ? " ui-title-language-closing" : "")
                    }
                    aria-label={t("settings.language.name")}
                >
                    <div className="ui-title-language-header">{t("settings.language.name")}</div>
                    <div className="ui-title-language-options">
                        {LANGS.map(({ id, label }) => {
                            const isCurrent = currentLang === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    className={
                                        "ui-title-language-option" +
                                        (isCurrent ? " ui-language-active" : "")
                                    }
                                    aria-pressed={isCurrent}
                                    onClick={(e) => {
                                        e.currentTarget.blur();
                                        handleSelect(id);
                                    }}
                                >
                                    <span className="ui-title-language-label">{label}</span>
                                    {isCurrent && (
                                        <span
                                            className="ui-title-language-indicator"
                                            aria-hidden="true"
                                        >
                                            ✓
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
