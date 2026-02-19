import { getTranslations } from "next-intl/server";

const DIFFERENTIATOR_ICONS = ["📱", "⚡", "🏥", "🎛️"];

export async function Differentiators() {
  const t = await getTranslations("landing.differentiators");

  const items = [
    { title: t("d1Title"), desc: t("d1Desc"), icon: DIFFERENTIATOR_ICONS[0] },
    { title: t("d2Title"), desc: t("d2Desc"), icon: DIFFERENTIATOR_ICONS[1] },
    { title: t("d3Title"), desc: t("d3Desc"), icon: DIFFERENTIATOR_ICONS[2] },
    { title: t("d4Title"), desc: t("d4Desc"), icon: DIFFERENTIATOR_ICONS[3] },
  ];

  return (
    <section style={{ backgroundColor: "#ffffff", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--lp-section-title-size)",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-2xl p-6"
              style={{
                backgroundColor: i === 0 ? "var(--lp-accent)" : "#f8fafc",
                color: i === 0 ? "#ffffff" : "#0f172a",
              }}
            >
              <span className="text-3xl">{item.icon}</span>
              <div>
                <h3
                  className="font-semibold"
                  style={{ color: i === 0 ? "#ffffff" : "#0f172a" }}
                >
                  {item.title}
                </h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: i === 0 ? "rgba(255,255,255,0.8)" : "#475569" }}
                >
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
