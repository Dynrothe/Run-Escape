export type Lang = "en" | "pt-BR" | "cs";

// Each language, who translated it (credited where it's picked), and the country whose flag is
// shown beside it (content/flags.ts's FLAG_FRAMES). English is the only one that's checked: the
// others are their translators'.
export const LANGS: { id: Lang; label: string; translator?: string; country: string }[] = [
    { id: "en", label: "English", country: "GB" },
    { id: "pt-BR", label: "Português (BR)", translator: "Iakee", country: "BR" },
    { id: "cs", label: "Čeština", country: "CZ" },
];

export type Params = Record<string, string | number>;
