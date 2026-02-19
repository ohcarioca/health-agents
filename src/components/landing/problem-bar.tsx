import { getTranslations } from "next-intl/server";

export async function ProblemBar() {
  const t = await getTranslations("landing.problem");

  const stats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
  ];

  return (
    <section style={{ backgroundColor: "#0f172a", padding: "3rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p
                className="text-4xl font-bold"
                style={{ fontFamily: "var(--font-display)", color: "#a78bfa" }}
              >
                {stat.value}
              </p>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "#94a3b8" }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs" style={{ color: "#475569" }}>
          Estimativas baseadas em dados do CFM, ABIMO e ABIMED.
        </p>
      </div>
    </section>
  );
}
