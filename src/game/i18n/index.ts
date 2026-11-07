// Translation: names in the language files (locales/<lang>/*.json), the English kept in the
// code as the fallback. core/ doesn't import this; the views call tl() on what it emits.
export { LANGS } from "./types";
export type { Lang } from "./types";
export { fmtNum, getLang, list, setLang, subscribeLang, t, tl, tp, tr, useLang } from "./store";
