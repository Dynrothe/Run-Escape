export type Lang = "en" | "pt-BR";

export const LANGS: { id: Lang; label: string }[] = [
    { id: "en", label: "English" },
    { id: "pt-BR", label: "Português (BR)" },
];

export type Params = Record<string, string | number>;
