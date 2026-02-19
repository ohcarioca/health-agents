import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function LandingNavbar() {
  const t = await getTranslations("landing.nav");

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        backgroundColor: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #e2e8f0",
      }}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 no-underline">
          <div
            className="flex size-8 items-center justify-center rounded-lg text-white text-sm font-bold"
            style={{ backgroundColor: "var(--lp-accent)" }}
          >
            O
          </div>
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ color: "#0f172a", fontFamily: "var(--font-landing)" }}
          >
            Órbita
          </span>
        </Link>

        {/* Nav links — hidden on mobile */}
        <div className="hidden items-center gap-8 md:flex">
          {[
            { href: "#agents", label: t("features") },
            { href: "#how-it-works", label: t("howItWorks") },
            { href: "#pricing", label: t("pricing") },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: "#475569", textDecoration: "none" }}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium transition-colors hover:opacity-70 sm:block"
            style={{ color: "#475569", textDecoration: "none" }}
          >
            {t("signIn")}
          </Link>
          <Link
            href="/signup"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--lp-accent)" }}
          >
            {t("startFree")}
          </Link>
        </div>
      </nav>
    </header>
  );
}
