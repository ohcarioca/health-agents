"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { type Locale, locales } from "@/i18n/config";

const localeLabels: Record<Locale, { flag: string; code: string }> = {
  "pt-BR": { flag: "\u{1F1E7}\u{1F1F7}", code: "BR" },
  en: { flag: "\u{1F1FA}\u{1F1F8}", code: "EN" },
  es: { flag: "\u{1F1EA}\u{1F1F8}", code: "ES" },
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  function handleChange(newLocale: string) {
    startTransition(() => {
      document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
      window.location.reload();
    });
  }

  return (
    <div className="relative">
      <select
        value={locale}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="appearance-none rounded-lg border px-3 py-1.5 text-xs font-medium outline-none transition-colors cursor-pointer"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        {locales.map((loc) => {
          const label = localeLabels[loc];
          return (
            <option key={loc} value={loc}>
              {label.flag} {label.code}
            </option>
          );
        })}
      </select>
    </div>
  );
}
