// Translation: names in the language files (locales/<lang>/*.json), the English kept in the
// code as the fallback. The sim emits English, and the views call tl() on it.
export { LANGS } from "./types";
export type { Lang } from "./types";
export {
    dateLocale,
    fmtNum,
    getLang,
    list,
    setLang,
    subscribeLang,
    t,
    tl,
    tp,
    tr,
    useLang,
} from "./store";
