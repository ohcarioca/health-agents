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
        className="relative z-10 mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-5"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <SetupWizard />
      </div>
    </div>
  );
}
