import { getTranslations } from "next-intl/server";

const AGENT_ICONS: Record<string, string> = {
  scheduling: "📅",
  confirmation: "✅",
  billing: "💳",
  nps: "⭐",
  recall: "🔄",
  support: "💬",
};

const AGENT_KEYS = ["scheduling", "confirmation", "billing", "nps", "recall", "support"] as const;

export async function AgentsOverview() {
  const t = await getTranslations("landing.agents");

  return (
    <section id="agents" style={{ backgroundColor: "#fafafa", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--lp-section-title-size)",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "#475569" }}>
            {t("sub")}
          </p>
        </div>

        {/* Agent cards */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_KEYS.map((key) => (
            <div
              key={key}
              className="group flex flex-col gap-3 rounded-2xl border p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <span className="text-3xl">{AGENT_ICONS[key]}</span>
              <div>
                <h3 className="font-semibold" style={{ color: "#0f172a" }}>
                  {t(`${key}.name`)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "#475569" }}>
                  {t(`${key}.desc`)}
                </p>
              </div>
              <div
                className="mt-auto flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--lp-accent)" }}
              >
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--lp-accent)" }}
                />
                Ativo via WhatsApp
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
