import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function FinalCta() {
  const t = await getTranslations("landing.finalCta");

  return (
    <section
      style={{
        background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #6d28d9 100%)",
        padding: "6rem 1.5rem",
      }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="text-white"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--lp-section-title-size)",
            lineHeight: 1.2,
          }}
        >
          {t("title")}
        </h2>
        <p className="mt-4 text-lg" style={{ color: "rgba(255,255,255,0.8)" }}>
          {t("sub")}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold transition-all hover:shadow-2xl hover:-translate-y-0.5"
            style={{ color: "var(--lp-accent)" }}
          >
            {t("cta")}
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            {t("noCc")}
          </p>
        </div>
      </div>
    </section>
  );
}
