import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function LandingFooter() {
  const t = await getTranslations("landing.footer");

  const links: Record<string, Array<{ label: string; href: string }>> = {
    [t("product")]: [
      { label: t("features"), href: "#agents" },
      { label: t("pricing"), href: "#pricing" },
      { label: t("docs"), href: "#" },
    ],
    [t("company")]: [
      { label: t("about"), href: "#" },
      { label: t("blog"), href: "#" },
      { label: t("contact"), href: "#" },
    ],
    [t("legal")]: [
      { label: t("terms"), href: "#" },
      { label: t("privacy"), href: "#" },
    ],
  };

  return (
    <footer
      style={{
        backgroundColor: "#0f172a",
        padding: "4rem 1.5rem 2rem",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <div
                className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: "var(--lp-accent)" }}
              >
                O
              </div>
              <span className="text-lg font-semibold text-white">Órbita</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#64748b" }}>
              {t("tagline")}
            </p>
            <div className="mt-4 flex gap-3">
              {(["Instagram", "LinkedIn"] as const).map((name) => (
                <a
                  key={name}
                  href="#"
                  className="text-sm transition-colors hover:text-white"
                  style={{ color: "#64748b" }}
                  aria-label={name}
                >
                  {name}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([groupName, groupLinks]) => (
            <div key={groupName}>
              <p
                className="mb-4 text-xs font-semibold uppercase tracking-widest"
                style={{ color: "#94a3b8" }}
              >
                {groupName}
              </p>
              <ul className="flex flex-col gap-2.5">
                {groupLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: "#64748b", textDecoration: "none" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-10 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row"
          style={{ borderColor: "#1e293b" }}
        >
          <p className="text-xs" style={{ color: "#475569" }}>
            © {new Date().getFullYear()} Órbita. {t("rights")}
          </p>
          <p className="text-xs" style={{ color: "#475569" }}>
            Feito com ♥ para clínicas brasileiras
          </p>
        </div>
      </div>
    </footer>
  );
}
