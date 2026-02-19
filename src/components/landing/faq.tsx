"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5"] as const;
type FaqKey = (typeof FAQ_KEYS)[number];
type AnswerKey = "a1" | "a2" | "a3" | "a4" | "a5";

function toAnswerKey(q: FaqKey): AnswerKey {
  return q.replace("q", "a") as AnswerKey;
}

interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FaqItem({ question, answer, isOpen, onToggle }: FaqItemProps) {
  return (
    <div className="border-b" style={{ borderColor: "#e2e8f0" }}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-5 text-left"
        type="button"
      >
        <span className="pr-8 text-base font-medium" style={{ color: "#0f172a" }}>
          {question}
        </span>
        <svg
          className="size-5 shrink-0 transition-transform duration-200"
          style={{
            color: "var(--lp-accent)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="pb-5">
          <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
            {answer}
          </p>
        </div>
      )}
    </div>
  );
}

export function Faq() {
  const t = useTranslations("landing.faq");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section style={{ backgroundColor: "#ffffff", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
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

        <div>
          {FAQ_KEYS.map((key, i) => (
            <FaqItem
              key={key}
              question={t(key)}
              answer={t(toAnswerKey(key))}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
