import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHero } from "@/components/landing/hero";
import { ProblemBar } from "@/components/landing/problem-bar";
import { AgentsOverview } from "@/components/landing/agents-overview";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeatureDeepDives } from "@/components/landing/feature-deep-dives";
import { Differentiators } from "@/components/landing/differentiators";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <>
      <LandingNavbar />
      <main>
        <LandingHero />
        <ProblemBar />
        <AgentsOverview />
        <HowItWorks />
        <FeatureDeepDives />
        <Differentiators />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
