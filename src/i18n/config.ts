export const locales = ["pt-BR", "en", "es"] as const;
export const defaultLocale = "pt-BR" as const;

export type Locale = (typeof locales)[number];
