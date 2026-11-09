export type Lang = "en" | "pt-BR";

// Each language, and who translated it (credited where it's picked). English is the only one
// that's checked: the others are their translators'.
export const LANGS: { id: Lang; label: string; translator?: string }[] = [
    { id: "en", label: "English" },
    { id: "pt-BR", label: "Português (BR)", translator: "Iakee" },
];

export type Params = Record<string, string | number>;
