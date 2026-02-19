import Link from "next/link";
import { getTranslations } from "next-intl/server";

interface PricingCardProps {
  name: string;
  price: string;
  monthly: string;
  desc: string;
  features: string[];
  isRecommended: boolean;
  recommended: string;
  ctaLabel: string;
  ctaHref: string;
}

function PricingCard({
  name,
  price,
  monthly,
  desc,
  features,
  isRecommended,
  recommended,
  ctaLabel,
  ctaHref,
}: PricingCardProps) {
  return (
    <div
      className="relative flex flex-col gap-6 rounded-2xl border p-8"
      style={{
        backgroundColor: isRecommended ? "var(--lp-accent)" : "#ffffff",
        borderColor: isRecommended ? "transparent" : "#e2e8f0",
        boxShadow: isRecommended
          ? "0 20px 40px rgba(124,58,237,0.3)"
          : "0 1px 3px rgba(0,0,0,0.05)",
        transform: isRecommended ? "scale(1.03)" : "none",
      }}
    >
      {isRecommended && (
        <div
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold"
          style={{ backgroundColor: "#f59e0b", color: "#ffffff" }}
        >
          {recommended}
        </div>
      )}

      <div>
        <h3
          className="text-lg font-semibold"
          style={{ color: isRecommended ? "#ffffff" : "#0f172a" }}
        >
          {name}
        </h3>
        <p
          className="mt-1 text-sm"
          style={{ color: isRecommended ? "rgba(255,255,255,0.75)" : "#64748b" }}
        >
          {desc}
        </p>
      </div>

      <div>
        <span
          className="text-4xl font-bold"
          style={{
            fontFamily: "var(--font-display)",
            color: isRecommended ? "#ffffff" : "#0f172a",
          }}
        >
          {price}
        </span>
        <span
          className="ml-1 text-sm"
          style={{ color: isRecommended ? "rgba(255,255,255,0.7)" : "#94a3b8" }}
        >
          /{monthly}
        </span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <svg
              className="size-4 shrink-0"
              style={{ color: isRecommended ? "#a78bfa" : "var(--lp-accent)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span style={{ color: isRecommended ? "rgba(255,255,255,0.9)" : "#374151" }}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className="mt-auto block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all hover:opacity-90"
        style={{
          backgroundColor: isRecommended ? "#ffffff" : "var(--lp-accent)",
          color: isRecommended ? "var(--lp-accent)" : "#ffffff",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

export async function Pricing() {
  const t = await getTranslations("landing.pricing");

  const plans = [
    { key: "plan1" as const, ctaHref: "/signup", ctaLabel: t("ctaStart"), isRecommended: false },
    { key: "plan2" as const, ctaHref: "/signup", ctaLabel: t("ctaStart"), isRecommended: true },
    { key: "plan3" as const, ctaHref: "/signup", ctaLabel: t("ctaContact"), isRecommended: false },
  ];

  return (
    <section id="pricing" style={{ backgroundColor: "#fafafa", padding: "5rem 1.5rem" }}>
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
          <p className="mt-3 text-lg" style={{ color: "#475569" }}>
            {t("sub")}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 items-center gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const baseFeatures = [
              t(`${plan.key}Features.0`),
              t(`${plan.key}Features.1`),
              t(`${plan.key}Features.2`),
              t(`${plan.key}Features.3`),
            ];
            const extraFeature =
              plan.key === "plan2" || plan.key === "plan3"
                ? t(`${plan.key}Features.4`)
                : null;
            const features = extraFeature ? [...baseFeatures, extraFeature] : baseFeatures;

            return (
              <PricingCard
                key={plan.key}
                name={t(`${plan.key}Name`)}
                price={t(`${plan.key}Price`)}
                monthly={t("monthly")}
                desc={t(`${plan.key}Desc`)}
                features={features}
                isRecommended={plan.isRecommended}
                recommended={t("recommended")}
                ctaLabel={plan.ctaLabel}
                ctaHref={plan.ctaHref}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
