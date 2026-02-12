import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieLocale = cookieStore.get("locale")?.value as Locale | undefined;
  const acceptLanguage = headerStore.get("accept-language");

  let locale: Locale = defaultLocale;

  if (cookieLocale && locales.includes(cookieLocale)) {
    locale = cookieLocale;
  } else if (acceptLanguage) {
    const preferred = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();
    if (preferred && locales.includes(preferred as Locale)) {
      locale = preferred as Locale;
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
