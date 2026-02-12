import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/contexts/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Órbita",
  description: "Autonomous agent platform for healthcare",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
