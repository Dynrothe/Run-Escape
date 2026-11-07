export type Lang = "en" | "pt-BR" | "es";

export const LANGS: { id: Lang; label: string }[] = [
    { id: "en", label: "English" },
    { id: "pt-BR", label: "Português (BR)" },
    { id: "es", label: "Español" },
];

export type Params = Record<string, string | number>;
