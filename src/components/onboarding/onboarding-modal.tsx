"use client";

import { SetupWizard } from "@/components/onboarding/setup-wizard";

export function OnboardingModal() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop — blurs the dashboard behind */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "var(--background)", opacity: 0.75 }}
      />

      {/* Modal card */}
      <div
        className="relative z-10 mx-4 flex w-full max-w-2xl flex-col rounded-2xl border p-5"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-lg)",
          height: "min(640px, 90vh)",
        }}
      >
        <SetupWizard />
      </div>
    </div>
  );
}
