import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WhatsAppMockup } from "./whatsapp-mockup";

const HERO_MESSAGES = [
  { text: "Olá! Quero agendar uma consulta com a Dra. Ana 😊", type: "incoming" as const, time: "14:32" },
  { text: "Oi! A Dra. Ana tem os seguintes horários disponíveis esta semana:\n\n📅 Seg 10:00\n📅 Ter 14:30\n📅 Qui 09:00\n\nQual prefere?", type: "outgoing" as const, time: "14:32" },
  { text: "Terça às 14:30, por favor!", type: "incoming" as const, time: "14:33" },
  { text: "✅ Consulta confirmada!\n\nDra. Ana Lima\nTer, 25 fev · 14:30\nClínica Saúde+\n\nVocê receberá um lembrete 24h antes.", type: "outgoing" as const, time: "14:33" },
];

export async function LandingHero() {
  const t = await getTranslations("landing.hero");

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #faf5ff 0%, #ffffff 50%, #f0f9ff 100%)",
        paddingTop: "5rem",
        paddingBottom: "6rem",
      }}
    >
      {/* Background decoration */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 size-[500px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-32 size-[400px] rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: copy */}
          <div
            className="flex flex-col gap-6 lp-animate-fade-up"
            style={{ animationDelay: "0.1s" }}
          >
            {/* Badge */}
            <div
              className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5"
              style={{ borderColor: "#ede9fe", backgroundColor: "#faf5ff" }}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: "#7c3aed" }}
              />
              <span className="text-xs font-medium" style={{ color: "#7c3aed" }}>
                {t("trustedBy")}
              </span>
            </div>

            {/* Headline */}
            <h1
              className="leading-tight tracking-tight"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--lp-hero-size)",
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              {t("headline1")}
              <br />
              <span style={{ color: "var(--lp-accent)" }}>{t("headline2")}</span>
            </h1>

            {/* Subtext */}
            <p
              className="max-w-lg text-lg leading-relaxed"
              style={{ color: "#475569" }}
            >
              {t("sub")}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="group flex items-center gap-2 rounded-xl px-6 py-3 text-base font-semibold text-white transition-all hover:opacity-90 hover:-translate-y-0.5"
                style={{
                  backgroundColor: "var(--lp-accent)",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
                }}
              >
                {t("ctaPrimary")}
                <svg
                  className="size-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: "#475569", textDecoration: "none" }}
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {t("ctaSecondary")}
              </a>
            </div>

            {/* Social proof mini */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {(["#7c3aed", "#059669", "#0369a1", "#dc2626"] as const).map((color, i) => (
                  <div
                    key={i}
                    className="flex size-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white"
                    style={{ backgroundColor: color, zIndex: 4 - i }}
                  >
                    {["A", "B", "C", "D"][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm" style={{ color: "#475569" }}>
                <strong style={{ color: "#0f172a" }}>Novas clínicas</strong> se juntam toda semana
              </p>
            </div>
          </div>

          {/* Right: WhatsApp mockup */}
          <div
            className="flex justify-center lg:justify-end lp-animate-float"
          >
            <WhatsAppMockup
              contactName="Órbita — Clínica Saúde+"
              contactEmoji="🏥"
              messages={HERO_MESSAGES}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
