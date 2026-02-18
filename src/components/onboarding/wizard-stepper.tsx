"use client";

import { Check } from "lucide-react";

interface WizardStepperProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export function WizardStepper({ currentStep, totalSteps, labels }: WizardStepperProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={stepNum} className="flex flex-1 items-center last:flex-none">
              {/* Circle + label */}
              <div className="flex flex-col items-center gap-1.5">
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
                  className="hidden text-center text-[10px] font-medium leading-tight sm:block"
                  style={{
                    color: isActive
                      ? "var(--text-primary)"
                      : isCompleted
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  {labels[i]}
                </span>
              </div>

              {/* Connecting line — vertically centered with circle */}
              {stepNum < totalSteps && (
                <div
                  className="mx-2 mb-5 h-0.5 flex-1 rounded-full transition-colors duration-500 sm:mb-5"
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
