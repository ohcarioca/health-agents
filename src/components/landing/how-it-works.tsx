import { getTranslations } from "next-intl/server";

export async function HowItWorks() {
  const t = await getTranslations("landing.howItWorks");

  const steps = [
    {
      number: "01",
      title: t("step1Title"),
      desc: t("step1Desc"),
      icon: "📱",
    },
    {
      number: "02",
      title: t("step2Title"),
      desc: t("step2Desc"),
      icon: "⚙️",
    },
    {
      number: "03",
      title: t("step3Title"),
      desc: t("step3Desc"),
      icon: "🤖",
    },
  ];

  return (
    <section id="how-it-works" style={{ backgroundColor: "#ffffff", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
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
          <p className="mt-3 text-lg" style={{ color: "#475569" }}>
            {t("sub")}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={i} className="relative flex flex-col items-center text-center">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className="absolute left-[calc(50%+3.5rem)] top-8 hidden h-px w-[calc(100%-7rem)] md:block"
                  style={{ backgroundColor: "#e2e8f0" }}
                />
              )}

              {/* Icon circle */}
              <div
                className="flex size-16 items-center justify-center rounded-2xl text-2xl"
                style={{
                  backgroundColor: "var(--lp-accent-light)",
                  border: "1px solid #ddd6fe",
                }}
              >
                {step.icon}
              </div>

              {/* Number badge */}
              <div
                className="mt-3 inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{
                  backgroundColor: "var(--lp-accent)",
                  color: "#ffffff",
                }}
              >
                {step.number}
              </div>

              <h3
                className="mt-3 text-lg font-semibold"
                style={{ color: "#0f172a" }}
              >
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#64748b" }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
