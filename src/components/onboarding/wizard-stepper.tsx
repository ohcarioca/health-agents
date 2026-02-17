"use client";

import { Check } from "lucide-react";

interface WizardStepperProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export function WizardStepper({ currentStep, totalSteps, labels }: WizardStepperProps) {
  return (
    <div className="mb-5 px-2">
      <div className="flex items-start">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={stepNum} className="flex flex-1 items-start last:flex-none">
              {/* Circle + label */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300 ${
                    isCompleted
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : isActive
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border-strong)] text-[var(--text-muted)]"
                  }`}
                  style={
                    isActive
                      ? { boxShadow: "0 0 0 4px var(--accent-muted)" }
                      : undefined
                  }
                >
                  {isCompleted ? <Check className="size-4" strokeWidth={2.5} /> : stepNum}
                </div>
                {/* Label — hidden on small screens */}
                <span
                  className="mt-1.5 hidden text-center text-[10px] font-medium leading-tight sm:block"
                  style={{
                    color: isActive
                      ? "var(--text-primary)"
                      : isCompleted
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    maxWidth: "5.5rem",
                  }}
                >
                  {labels[i]}
                </span>
              </div>

              {/* Connecting line — pinned at circle center (size-9 = 36px, center = 18px) */}
              {stepNum < totalSteps && (
                <div
                  className="mx-1.5 mt-[17px] h-0.5 flex-1 rounded-full transition-colors duration-500"
                  style={{
                    backgroundColor: isCompleted
                      ? "var(--accent)"
                      : "var(--border-strong)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
